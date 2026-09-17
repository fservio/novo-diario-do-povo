import type { Env } from '../types'
import { getPostUrl } from '../utils/post'
import type {
  EngagementCampaign,
  EngagementCampaignInput,
  EngagementCampaignStatus,
  EngagementDevice,
  EngagementEventType,
  EngagementPageScope,
  PublicEngagementCampaign
} from './types'

const SELECT_CAMPAIGN = `
  SELECT c.*,
    COALESCE(m.r2_key, pm.r2_key) AS image_r2_key,
    COALESCE(m.alt, pm.alt, p.title) AS image_alt,
    COALESCE(m.filename, pm.filename) AS image_filename,
    COALESCE(m.credits, pm.credits) AS image_credits,
    p.slug AS post_slug,
    p.title AS post_title,
    p.published_at AS post_published_at,
    p.created_at AS post_created_at
  FROM engagement_campaigns c
  LEFT JOIN media m ON m.id = c.image_media_id AND m.deleted_at IS NULL
  LEFT JOIN posts p ON p.id = c.post_id
  LEFT JOIN media pm ON pm.id = p.cover_media_id AND pm.deleted_at IS NULL
`

function nullableText(value?: string | null): string | null {
  const normalized = String(value || '').trim()
  return normalized || null
}

export function parsePathRules(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []
  } catch {
    return []
  }
}

export function normalizePathRule(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  try {
    if (/^https?:\/\//i.test(trimmed)) return new URL(trimmed).pathname
  } catch {
    return ''
  }
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

export function pathMatchesRule(path: string, rule: string): boolean {
  const normalized = normalizePathRule(rule)
  if (!normalized) return false
  if (normalized.endsWith('*')) return path.startsWith(normalized.slice(0, -1))
  return path === normalized || path === `${normalized}/` || `${path}/` === normalized
}

export function classifyPublicPath(path: string): 'home' | 'article' | 'listing' | 'excluded' | 'other' {
  if (path.startsWith('/admin') || path.startsWith('/api') || path.startsWith('/portal') || path.startsWith('/conta') || path.startsWith('/assinar') || path.startsWith('/newsletter/')) return 'excluded'
  if (path === '/') return 'home'
  if (/^\/\d{4}\/\d{2}\/\d{2}\/[^/]+\/?$/.test(path)) return 'article'
  if (/^\/(categoria|tag|coluna)\//.test(path) || path === '/ultimas' || path === '/opiniao') return 'listing'
  return 'other'
}

export function campaignMatchesRequest(campaign: EngagementCampaign, path: string, device: 'desktop' | 'mobile'): boolean {
  if (campaign.devices !== 'all' && campaign.devices !== device) return false
  const pageType = classifyPublicPath(path)
  if (pageType === 'excluded') return false

  const scopeMatches = campaign.page_scope === 'all'
    || (campaign.page_scope === 'home' && pageType === 'home')
    || (campaign.page_scope === 'articles' && pageType === 'article')
    || (campaign.page_scope === 'listings' && pageType === 'listing')
    || campaign.page_scope === 'specific'
  if (!scopeMatches) return false

  const excluded = parsePathRules(campaign.exclude_paths_json)
  if (excluded.some(rule => pathMatchesRule(path, rule))) return false
  const included = parsePathRules(campaign.include_paths_json)
  if (campaign.page_scope === 'specific' && included.length === 0) return false
  return included.length === 0 || included.some(rule => pathMatchesRule(path, rule))
}

export async function listEngagementCampaigns(env: Env): Promise<EngagementCampaign[]> {
  const [result, eventResult] = await Promise.all([
    env.DB.prepare(`${SELECT_CAMPAIGN}
    ORDER BY CASE c.status WHEN 'active' THEN 0 WHEN 'scheduled' THEN 1 WHEN 'draft' THEN 2 WHEN 'paused' THEN 3 ELSE 4 END,
      c.priority DESC, c.updated_at DESC
    `).all<EngagementCampaign>(),
    env.DB.prepare(`SELECT campaign_id,
      SUM(CASE WHEN event_type = 'impression' THEN total ELSE 0 END) AS impressions,
      SUM(CASE WHEN event_type = 'click' THEN total ELSE 0 END) AS clicks,
      SUM(CASE WHEN event_type = 'conversion' THEN total ELSE 0 END) AS conversions,
      SUM(CASE WHEN event_type = 'close' THEN total ELSE 0 END) AS closes
      FROM engagement_campaign_events GROUP BY campaign_id`).all<{ campaign_id: number; impressions: number; clicks: number; conversions: number; closes: number }>()
  ])
  const events = new Map((eventResult.results || []).map(row => [row.campaign_id, row]))
  return (result.results || []).map(campaign => ({ ...campaign, ...(events.get(campaign.id) || {}) }))
}

export async function getEngagementCampaign(env: Env, id: number): Promise<EngagementCampaign | null> {
  return await env.DB.prepare(`${SELECT_CAMPAIGN} WHERE c.id = ? LIMIT 1`).bind(id).first<EngagementCampaign>() || null
}

function inputBindings(input: EngagementCampaignInput): unknown[] {
  return [
    input.internalName.trim(), input.campaignType, input.displayFormat,
    nullableText(input.eyebrow), input.title.trim(), nullableText(input.body),
    nullableText(input.ctaLabel), nullableText(input.ctaUrl), input.imageMediaId || null,
    input.postId || null, input.imagePositionX, input.imagePositionY, nullableText(input.advertiserName), input.pageScope,
    JSON.stringify(input.includePaths), JSON.stringify(input.excludePaths), input.devices,
    input.triggerType, input.triggerValue, input.minPageviews, input.cooldownHours,
    input.clickCooldownHours, input.maxPerSession, input.maxImpressions30d, input.priority,
    input.startsAt || null, input.endsAt || null
  ]
}

export async function createEngagementCampaign(env: Env, input: EngagementCampaignInput, userId: number): Promise<number> {
  const now = new Date().toISOString()
  const result = await env.DB.prepare(`
    INSERT INTO engagement_campaigns (
      internal_name, campaign_type, display_format, eyebrow, title, body, cta_label, cta_url,
      image_media_id, post_id, image_position_x, image_position_y, advertiser_name, page_scope, include_paths_json, exclude_paths_json,
      devices, trigger_type, trigger_value, min_pageviews, cooldown_hours, click_cooldown_hours,
      max_per_session, max_impressions_30d, priority, starts_at, ends_at,
      status, created_by_user_id, created_at, updated_at
    ) VALUES (${new Array(27).fill('?').join(', ')}, 'draft', ?, ?, ?)
  `).bind(...inputBindings(input), userId, now, now).run()
  return Number(result.meta.last_row_id)
}

export async function updateEngagementCampaign(env: Env, id: number, input: EngagementCampaignInput): Promise<void> {
  const current = await getEngagementCampaign(env, id)
  if (!current) throw new Error('Campanha não encontrada.')
  if (current.status === 'archived') throw new Error('Campanhas arquivadas não podem ser alteradas.')
  await env.DB.prepare(`
    UPDATE engagement_campaigns SET
      internal_name = ?, campaign_type = ?, display_format = ?, eyebrow = ?, title = ?, body = ?,
      cta_label = ?, cta_url = ?, image_media_id = ?, post_id = ?, image_position_x = ?, image_position_y = ?, advertiser_name = ?, page_scope = ?,
      include_paths_json = ?, exclude_paths_json = ?, devices = ?, trigger_type = ?, trigger_value = ?,
      min_pageviews = ?, cooldown_hours = ?, click_cooldown_hours = ?, max_per_session = ?,
      max_impressions_30d = ?, priority = ?, starts_at = ?, ends_at = ?, updated_at = ?
    WHERE id = ?
  `).bind(...inputBindings(input), new Date().toISOString(), id).run()
}

export async function setEngagementCampaignStatus(env: Env, id: number, requested: 'publish' | 'pause' | 'archive'): Promise<void> {
  const campaign = await getEngagementCampaign(env, id)
  if (!campaign) throw new Error('Campanha não encontrada.')
  if (campaign.status === 'archived' && requested !== 'archive') throw new Error('Campanhas arquivadas não podem ser reativadas.')
  const now = new Date().toISOString()
  let status: EngagementCampaignStatus
  if (requested === 'archive') status = 'archived'
  else if (requested === 'pause') status = 'paused'
  else status = campaign.starts_at && campaign.starts_at > now ? 'scheduled' : 'active'
  await env.DB.prepare(`
    UPDATE engagement_campaigns SET status = ?, updated_at = ?,
      published_at = CASE WHEN ? IN ('active', 'scheduled') THEN COALESCE(published_at, ?) ELSE published_at END,
      archived_at = CASE WHEN ? = 'archived' THEN ? ELSE NULL END
    WHERE id = ?
  `).bind(status, now, status, now, status, status === 'archived' ? now : null, id).run()
}

export async function duplicateEngagementCampaign(env: Env, id: number, userId: number): Promise<number> {
  const source = await getEngagementCampaign(env, id)
  if (!source) throw new Error('Campanha não encontrada.')
  return createEngagementCampaign(env, {
    internalName: `${source.internal_name} — cópia`, campaignType: source.campaign_type,
    displayFormat: source.display_format, eyebrow: source.eyebrow || undefined, title: source.title,
    body: source.body || undefined, ctaLabel: source.cta_label || undefined, ctaUrl: source.cta_url || undefined,
    imageMediaId: source.image_media_id, postId: source.post_id, advertiserName: source.advertiser_name || undefined,
    imagePositionX: source.image_position_x, imagePositionY: source.image_position_y,
    pageScope: source.page_scope, includePaths: parsePathRules(source.include_paths_json),
    excludePaths: parsePathRules(source.exclude_paths_json), devices: source.devices,
    triggerType: source.trigger_type, triggerValue: source.trigger_value, minPageviews: source.min_pageviews,
    cooldownHours: source.cooldown_hours, clickCooldownHours: source.click_cooldown_hours,
    maxPerSession: source.max_per_session, maxImpressions30d: source.max_impressions_30d,
    priority: source.priority, startsAt: null, endsAt: null
  }, userId)
}

export async function listEligibleEngagementCampaigns(env: Env, path: string, device: 'desktop' | 'mobile'): Promise<PublicEngagementCampaign[]> {
  const now = new Date().toISOString()
  const result = await env.DB.prepare(`${SELECT_CAMPAIGN}
    WHERE c.status IN ('active', 'scheduled')
      AND (c.starts_at IS NULL OR c.starts_at <= ?)
      AND (c.ends_at IS NULL OR c.ends_at > ?)
    ORDER BY c.priority DESC, c.updated_at DESC
    LIMIT 20
  `).bind(now, now).all<EngagementCampaign>()

  return (result.results || []).filter(campaign => campaignMatchesRequest(campaign, path, device)).slice(0, 3).map(campaign => {
    const postUrl = campaign.post_slug ? getPostUrl({
      slug: campaign.post_slug,
      published_at: campaign.post_published_at,
      created_at: campaign.post_created_at || undefined
    }) : ''
    return {
      id: campaign.id,
      type: campaign.campaign_type,
      format: campaign.display_format,
      eyebrow: campaign.eyebrow || (campaign.campaign_type === 'advertising' ? 'Publicidade' : 'Diário do Povo'),
      title: campaign.title || campaign.post_title || '',
      body: campaign.body || '',
      ctaLabel: campaign.cta_label || (campaign.campaign_type === 'newsletter' ? 'Quero receber' : 'Saiba mais'),
      ctaUrl: campaign.cta_url || postUrl,
      imageUrl: campaign.image_r2_key ? `/i/${campaign.image_r2_key}?w=900` : null,
      imageAlt: campaign.image_alt || campaign.title,
      imagePositionX: Math.max(0, Math.min(100, Number(campaign.image_position_x ?? 50))),
      imagePositionY: Math.max(0, Math.min(100, Number(campaign.image_position_y ?? 50))),
      advertiserName: campaign.advertiser_name || '',
      trigger: { type: campaign.trigger_type, value: campaign.trigger_value },
      frequency: {
        minPageviews: campaign.min_pageviews,
        cooldownHours: campaign.cooldown_hours,
        clickCooldownHours: campaign.click_cooldown_hours,
        maxPerSession: campaign.max_per_session,
        maxImpressions30d: campaign.max_impressions_30d
      }
    }
  })
}

export async function recordEngagementEvent(env: Env, campaignId: number, eventType: EngagementEventType, device: Exclude<EngagementDevice, 'all'>, pageType: string): Promise<void> {
  const day = new Date().toISOString().slice(0, 10)
  const safePageType = ['home', 'article', 'listing', 'other'].includes(pageType) ? pageType : 'other'
  await env.DB.prepare(`
    INSERT INTO engagement_campaign_events (campaign_id, event_date, event_type, device, page_type, total, updated_at)
    SELECT id, ?, ?, ?, ?, 1, ? FROM engagement_campaigns WHERE id = ?
    ON CONFLICT(campaign_id, event_date, event_type, device, page_type) DO UPDATE SET
      total = total + 1, updated_at = excluded.updated_at
  `).bind(day, eventType, device, safePageType, new Date().toISOString(), campaignId).run()
}

export async function getEngagementStats(env: Env): Promise<{ active: number; scheduled: number; drafts: number; impressions: number; clicks: number; conversions: number }> {
  const [campaigns, events] = await Promise.all([
    env.DB.prepare(`SELECT
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) active,
      SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) scheduled,
      SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) drafts
      FROM engagement_campaigns`).first<Record<string, number>>(),
    env.DB.prepare(`SELECT
      SUM(CASE WHEN event_type = 'impression' THEN total ELSE 0 END) impressions,
      SUM(CASE WHEN event_type = 'click' THEN total ELSE 0 END) clicks,
      SUM(CASE WHEN event_type = 'conversion' THEN total ELSE 0 END) conversions
      FROM engagement_campaign_events`).first<Record<string, number>>()
  ])
  return {
    active: Number(campaigns?.active || 0), scheduled: Number(campaigns?.scheduled || 0), drafts: Number(campaigns?.drafts || 0),
    impressions: Number(events?.impressions || 0), clicks: Number(events?.clicks || 0), conversions: Number(events?.conversions || 0)
  }
}
