import type { Env } from '../types'
import type {
  NewsletterCampaign,
  NewsletterCampaignWithItems,
  NewsletterPost,
  NewsletterRecipient
} from './types'

export async function listNewsletterCampaigns(env: Env, limit = 50): Promise<NewsletterCampaign[]> {
  const result = await env.DB.prepare(`
    SELECT * FROM newsletter_campaigns
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `).bind(limit).all<NewsletterCampaign>()
  return result.results || []
}

export async function getNewsletterStats(env: Env): Promise<{
  confirmed: number
  drafts: number
  sent: number
  sentLast24h: number
}> {
  const [confirmed, drafts, sent, sentLast24h] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS total FROM newsletter_subscribers WHERE status = 'confirmed'").first<{ total: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS total FROM newsletter_campaigns WHERE status IN ('draft', 'scheduled', 'sending')").first<{ total: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS total FROM newsletter_campaigns WHERE status = 'sent'").first<{ total: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS total FROM newsletter_deliveries WHERE status = 'sent' AND sent_at >= datetime('now', '-24 hours')").first<{ total: number }>()
  ])

  return {
    confirmed: confirmed?.total || 0,
    drafts: drafts?.total || 0,
    sent: sent?.total || 0,
    sentLast24h: sentLast24h?.total || 0
  }
}

export async function listNewsletterPosts(env: Env, limit = 60): Promise<NewsletterPost[]> {
  const result = await env.DB.prepare(`
    SELECT
      p.id, p.slug, p.title, p.hat, p.excerpt, p.published_at, p.created_at,
      c.name AS category_name,
      m.r2_key AS cover_media_url,
      0 AS position
    FROM posts p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN media m ON m.id = p.cover_media_id
    WHERE p.status = 'published'
    ORDER BY COALESCE(p.published_at, p.created_at) DESC
    LIMIT ?
  `).bind(limit).all<NewsletterPost>()
  return result.results || []
}

export async function createNewsletterCampaign(env: Env, input: {
  subject: string
  preheader?: string
  introText?: string
  postIds: number[]
  createdByUserId: number
}): Promise<number> {
  const now = new Date().toISOString()
  const inserted = await env.DB.prepare(`
    INSERT INTO newsletter_campaigns (
      subject, preheader, intro_text, content_html, segments_json, status,
      sent_count, recipient_count, failed_count, created_by_user_id, created_at, updated_at
    ) VALUES (?, ?, ?, '', '["geral"]', 'draft', 0, 0, 0, ?, ?, ?)
  `).bind(
    input.subject.trim(),
    input.preheader?.trim() || null,
    input.introText?.trim() || null,
    input.createdByUserId,
    now,
    now
  ).run()

  const campaignId = Number(inserted.meta.last_row_id)
  const statements = input.postIds.map((postId, position) => env.DB.prepare(`
    INSERT INTO newsletter_campaign_items (campaign_id, post_id, position)
    VALUES (?, ?, ?)
  `).bind(campaignId, postId, position))

  if (statements.length) await env.DB.batch(statements)
  return campaignId
}

export async function updateNewsletterCampaign(env: Env, id: number, input: {
  subject: string
  preheader?: string
  introText?: string
  postIds: number[]
}): Promise<void> {
  const campaign = await env.DB.prepare(
    'SELECT status FROM newsletter_campaigns WHERE id = ? LIMIT 1'
  ).bind(id).first<{ status: string }>()
  if (!campaign) throw new Error('Campanha não encontrada.')
  if (campaign.status === 'sent' || campaign.status === 'sending') {
    throw new Error('Campanhas em envio ou concluídas não podem ser editadas.')
  }

  await env.DB.prepare(`
    UPDATE newsletter_campaigns
    SET subject = ?, preheader = ?, intro_text = ?, content_html = '', updated_at = ?
    WHERE id = ?
  `).bind(
    input.subject.trim(),
    input.preheader?.trim() || null,
    input.introText?.trim() || null,
    new Date().toISOString(),
    id
  ).run()

  await env.DB.prepare('DELETE FROM newsletter_campaign_items WHERE campaign_id = ?').bind(id).run()
  const statements = input.postIds.map((postId, position) => env.DB.prepare(`
    INSERT INTO newsletter_campaign_items (campaign_id, post_id, position)
    VALUES (?, ?, ?)
  `).bind(id, postId, position))
  if (statements.length) await env.DB.batch(statements)
}

export async function getNewsletterCampaign(env: Env, id: number): Promise<NewsletterCampaignWithItems | null> {
  const campaign = await env.DB.prepare(
    'SELECT * FROM newsletter_campaigns WHERE id = ? LIMIT 1'
  ).bind(id).first<NewsletterCampaign>()
  if (!campaign) return null

  const items = await env.DB.prepare(`
    SELECT
      p.id, p.slug, p.title, p.hat, p.excerpt, p.published_at, p.created_at,
      c.name AS category_name,
      m.r2_key AS cover_media_url,
      i.position
    FROM newsletter_campaign_items i
    INNER JOIN posts p ON p.id = i.post_id
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN media m ON m.id = p.cover_media_id
    WHERE i.campaign_id = ?
    ORDER BY i.position ASC, i.id ASC
  `).bind(id).all<NewsletterPost>()

  return { ...campaign, items: items.results || [] }
}

export async function updateCampaignSnapshot(env: Env, id: number, html: string): Promise<void> {
  await env.DB.prepare(`
    UPDATE newsletter_campaigns
    SET content_html = ?, updated_at = ?
    WHERE id = ?
  `).bind(html, new Date().toISOString(), id).run()
}

export async function addConfirmedNewsletterRecipient(env: Env, input: {
  email: string
  name?: string
  token: string
  source?: string
}): Promise<void> {
  const now = new Date().toISOString()
  await env.DB.prepare(`
    INSERT INTO newsletter_subscribers (
      email, name, segments_json, status, confirmation_token, confirmed_at,
      unsubscribed_at, source, created_at, unsubscribe_token, updated_at
    ) VALUES (?, ?, '["geral"]', 'confirmed', NULL, ?, NULL, ?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      name = COALESCE(excluded.name, newsletter_subscribers.name),
      status = 'confirmed',
      confirmed_at = excluded.confirmed_at,
      unsubscribed_at = NULL,
      unsubscribe_token = COALESCE(newsletter_subscribers.unsubscribe_token, excluded.unsubscribe_token),
      updated_at = excluded.updated_at
  `).bind(
    input.email.trim().toLowerCase(),
    input.name?.trim() || null,
    now,
    input.source || 'admin',
    now,
    input.token,
    now
  ).run()
}

export async function listConfirmedRecipientsForCampaign(
  env: Env,
  campaignId: number,
  limit: number
): Promise<NewsletterRecipient[]> {
  const result = await env.DB.prepare(`
    SELECT s.id, s.email, s.name, s.unsubscribe_token
    FROM newsletter_subscribers s
    LEFT JOIN newsletter_deliveries d
      ON d.campaign_id = ?
      AND d.subscriber_id = s.id
      AND d.delivery_type = 'campaign'
      AND d.status = 'sent'
    WHERE s.status = 'confirmed' AND d.id IS NULL
    ORDER BY s.id ASC
    LIMIT ?
  `).bind(campaignId, limit).all<NewsletterRecipient>()
  return result.results || []
}

export async function countPendingCampaignRecipients(env: Env, campaignId: number): Promise<number> {
  const row = await env.DB.prepare(`
    SELECT COUNT(*) AS total
    FROM newsletter_subscribers s
    LEFT JOIN newsletter_deliveries d
      ON d.campaign_id = ?
      AND d.subscriber_id = s.id
      AND d.delivery_type = 'campaign'
      AND d.status = 'sent'
    WHERE s.status = 'confirmed' AND d.id IS NULL
  `).bind(campaignId).first<{ total: number }>()
  return row?.total || 0
}

export async function recordNewsletterDelivery(env: Env, input: {
  campaignId: number
  subscriberId?: number
  recipientEmail: string
  deliveryType: 'campaign' | 'test'
  ok: boolean
  messageId?: string
  error?: string
}): Promise<void> {
  const now = new Date().toISOString()

  if (input.deliveryType === 'campaign' && input.subscriberId) {
    await env.DB.prepare(`
      INSERT INTO newsletter_deliveries (
        campaign_id, subscriber_id, recipient_email, delivery_type, status,
        provider_message_id, error_message, attempted_at, sent_at, created_at
      ) VALUES (?, ?, ?, 'campaign', ?, ?, ?, ?, ?, ?)
      ON CONFLICT DO UPDATE SET
        status = excluded.status,
        provider_message_id = excluded.provider_message_id,
        error_message = excluded.error_message,
        attempted_at = excluded.attempted_at,
        sent_at = excluded.sent_at
    `).bind(
      input.campaignId,
      input.subscriberId,
      input.recipientEmail,
      input.ok ? 'sent' : 'failed',
      input.messageId || null,
      input.error || null,
      now,
      input.ok ? now : null,
      now
    ).run()
  } else {
    await env.DB.prepare(`
      INSERT INTO newsletter_deliveries (
        campaign_id, subscriber_id, recipient_email, delivery_type, status,
        provider_message_id, error_message, attempted_at, sent_at, created_at
      ) VALUES (?, NULL, ?, 'test', ?, ?, ?, ?, ?, ?)
    `).bind(
      input.campaignId,
      input.recipientEmail,
      input.ok ? 'sent' : 'failed',
      input.messageId || null,
      input.error || null,
      now,
      input.ok ? now : null,
      now
    ).run()
  }
}

export async function refreshCampaignDeliveryTotals(env: Env, campaignId: number): Promise<void> {
  const pending = await countPendingCampaignRecipients(env, campaignId)
  const now = new Date().toISOString()
  await env.DB.prepare(`
    UPDATE newsletter_campaigns SET
      sent_count = (
        SELECT COUNT(*) FROM newsletter_deliveries
        WHERE campaign_id = ? AND delivery_type = 'campaign' AND status = 'sent'
      ),
      failed_count = (
        SELECT COUNT(*) FROM newsletter_deliveries
        WHERE campaign_id = ? AND delivery_type = 'campaign' AND status = 'failed'
      ),
      recipient_count = (
        SELECT COUNT(*) FROM newsletter_subscribers WHERE status = 'confirmed'
      ),
      status = ?,
      sent_at = CASE WHEN ? = 0 THEN COALESCE(sent_at, ?) ELSE sent_at END,
      updated_at = ?
    WHERE id = ?
  `).bind(
    campaignId,
    campaignId,
    pending === 0 ? 'sent' : 'sending',
    pending,
    now,
    now,
    campaignId
  ).run()
}

export async function unsubscribeNewsletterRecipient(env: Env, token: string): Promise<boolean> {
  const result = await env.DB.prepare(`
    UPDATE newsletter_subscribers
    SET status = 'unsubscribed', unsubscribed_at = ?, updated_at = ?
    WHERE unsubscribe_token = ? AND status != 'unsubscribed'
  `).bind(new Date().toISOString(), new Date().toISOString(), token).run()
  return Number(result.meta.changes || 0) > 0
}
