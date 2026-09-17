import { z } from 'zod'
import type { EngagementCampaignInput } from './types'

const commonCampaignSchema = z.object({
  internal_name: z.string().trim().min(3, 'Informe um nome interno.').max(120),
  display_format: z.enum(['banner', 'slide_in', 'modal']),
  eyebrow: z.string().trim().max(60).optional(),
  title: z.string().trim().min(3, 'Informe o título da chamada.').max(150),
  body: z.string().trim().max(400).optional(),
  image_media_id: z.string().optional(),
  image_position_x: z.coerce.number().int().min(0).max(100),
  image_position_y: z.coerce.number().int().min(0).max(100),
  page_scope: z.enum(['all', 'home', 'articles', 'listings', 'specific']),
  include_paths: z.string().max(3000).optional(),
  exclude_paths: z.string().max(3000).optional(),
  devices: z.enum(['all', 'desktop', 'mobile']),
  trigger_type: z.enum(['delay', 'scroll', 'pageviews', 'exit_intent']),
  trigger_value: z.coerce.number().int().min(0).max(1000),
  min_pageviews: z.coerce.number().int().min(1).max(50),
  cooldown_hours: z.coerce.number().int().min(1).max(8760),
  click_cooldown_hours: z.coerce.number().int().min(1).max(8760),
  max_per_session: z.coerce.number().int().min(1).max(5),
  max_impressions_30d: z.coerce.number().int().min(1).max(30),
  priority: z.coerce.number().int().min(1).max(100),
  starts_at: z.string().optional(),
  ends_at: z.string().optional()
})

const ctaLabelSchema = z.string().trim().min(2, 'Informe o texto do botão.').max(50)
const instagramUrlSchema = z.string().trim().url('Informe um link completo do Instagram.').max(500).refine(value => {
  try {
    const hostname = new URL(value).hostname.toLowerCase()
    return hostname === 'instagram.com' || hostname === 'www.instagram.com' || hostname.endsWith('.instagram.com')
  } catch { return false }
}, 'Use um link válido do Instagram.')
const advertisingUrlSchema = z.string().trim().url('Informe o link completo do anunciante.').max(500).refine(value => new URL(value).protocol === 'https:', 'O link publicitário deve usar HTTPS.')

const campaignSchema = z.discriminatedUnion('campaign_type', [
  commonCampaignSchema.extend({
    campaign_type: z.literal('newsletter'),
    cta_label: z.string().trim().max(50).optional()
  }),
  commonCampaignSchema.extend({
    campaign_type: z.literal('editorial'),
    post_id: z.coerce.number().int().positive('Selecione uma matéria publicada.'),
    cta_label: ctaLabelSchema
  }),
  commonCampaignSchema.extend({
    campaign_type: z.literal('instagram'),
    cta_url: instagramUrlSchema,
    cta_label: ctaLabelSchema
  }),
  commonCampaignSchema.extend({
    campaign_type: z.literal('advertising'),
    advertiser_name: z.string().trim().min(2, 'Identifique o anunciante.').max(120),
    cta_url: advertisingUrlSchema,
    cta_label: ctaLabelSchema
  })
]).superRefine((value, ctx) => {
  if (value.page_scope === 'specific' && !value.include_paths?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['include_paths'], message: 'Informe pelo menos um caminho incluído.' })
  }
})

function toIso(value?: string): string | null {
  if (!value) return null
  const date = new Date(`${value}:00-03:00`)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function splitPaths(value?: string): string[] {
  return String(value || '').split(/[\r\n,]+/).map(item => item.trim()).filter(Boolean).slice(0, 50)
}

export function parseEngagementCampaignInput(body: Record<string, unknown>): EngagementCampaignInput {
  const result = campaignSchema.safeParse(body)
  if (!result.success) throw new Error(result.error.issues[0]?.message || 'Revise os dados da campanha.')
  const data = result.data
  const startsAt = toIso(data.starts_at)
  const endsAt = toIso(data.ends_at)
  if (startsAt && endsAt && endsAt <= startsAt) throw new Error('O encerramento deve ocorrer depois do início.')
  const campaignType = data.campaign_type
  const ctaLabel = campaignType === 'newsletter' ? (data.cta_label || 'Quero receber') : data.cta_label
  const ctaUrl = campaignType === 'instagram' || campaignType === 'advertising' ? data.cta_url : ''
  const postId = campaignType === 'editorial' ? data.post_id : null
  const advertiserName = campaignType === 'advertising' ? data.advertiser_name : undefined
  return {
    internalName: data.internal_name, campaignType, displayFormat: data.display_format,
    eyebrow: data.eyebrow, title: data.title, body: data.body,
    ctaLabel, ctaUrl,
    imageMediaId: Number(data.image_media_id) || null,
    imagePositionX: data.image_position_x, imagePositionY: data.image_position_y,
    postId, advertiserName, pageScope: data.page_scope,
    includePaths: splitPaths(data.include_paths), excludePaths: splitPaths(data.exclude_paths),
    devices: data.devices, triggerType: data.trigger_type, triggerValue: data.trigger_value,
    minPageviews: data.min_pageviews, cooldownHours: data.cooldown_hours,
    clickCooldownHours: data.click_cooldown_hours, maxPerSession: data.max_per_session,
    maxImpressions30d: data.max_impressions_30d, priority: data.priority, startsAt, endsAt
  }
}
