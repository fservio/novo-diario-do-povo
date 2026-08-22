import type { Env } from '../types'
import type { WhatsAppCampaign, WhatsAppCampaignType, WhatsAppContact, WhatsAppDestination, WhatsAppDestinationType, WhatsAppFrequency, WhatsAppLead, WhatsAppTopic } from './types'

export async function createWhatsAppLead(env: Env, input: {
  token: string; topics: WhatsAppTopic[]; frequency: WhatsAppFrequency; source: string
  utmSource?: string; utmMedium?: string; utmCampaign?: string; consentVersion: string
}): Promise<number> {
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
  const result = await env.DB.prepare(`INSERT INTO whatsapp_leads
    (token, preferences_json, frequency, source, utm_source, utm_medium, utm_campaign, consent_version, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(input.token, JSON.stringify(input.topics), input.frequency, input.source, input.utmSource || null,
      input.utmMedium || null, input.utmCampaign || null, input.consentVersion, expiresAt).run()
  return Number(result.meta.last_row_id)
}

export async function getWhatsAppLeadByToken(env: Env, token: string): Promise<WhatsAppLead | null> {
  return env.DB.prepare(`SELECT * FROM whatsapp_leads WHERE token = ? AND status = 'pending' AND expires_at > datetime('now') LIMIT 1`)
    .bind(token).first<WhatsAppLead>()
}

export async function activateWhatsAppLead(env: Env, input: { token: string; waId: string; profileName?: string }): Promise<WhatsAppContact | null> {
  const lead = await getWhatsAppLeadByToken(env, input.token)
  if (!lead) return null
  const now = new Date().toISOString()
  const unsubscribeToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
  await env.DB.prepare(`INSERT INTO whatsapp_contacts
    (wa_id, phone_e164, profile_name, status, preferences_json, frequency, source, consent_at, consent_version,
     unsubscribe_token, last_inbound_at, created_at, updated_at)
    VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(wa_id) DO UPDATE SET profile_name = COALESCE(excluded.profile_name, whatsapp_contacts.profile_name),
      status = 'active', preferences_json = excluded.preferences_json, frequency = excluded.frequency,
      source = excluded.source, consent_at = excluded.consent_at, consent_version = excluded.consent_version,
      last_inbound_at = excluded.last_inbound_at, updated_at = excluded.updated_at`)
    .bind(input.waId, `+${input.waId}`, input.profileName || null, lead.preferences_json, lead.frequency, lead.source,
      now, lead.consent_version, unsubscribeToken, now, now, now).run()
  const contact = await env.DB.prepare('SELECT * FROM whatsapp_contacts WHERE wa_id = ? LIMIT 1').bind(input.waId).first<WhatsAppContact>()
  if (!contact) return null
  await env.DB.batch([
    env.DB.prepare(`UPDATE whatsapp_leads SET status = 'activated', contact_id = ?, activated_at = ? WHERE id = ?`).bind(contact.id, now, lead.id),
    env.DB.prepare(`INSERT INTO whatsapp_consent_events (contact_id, action, source, consent_version, metadata_json) VALUES (?, 'opt_in', ?, ?, ?)`)
      .bind(contact.id, lead.source, lead.consent_version, JSON.stringify({ lead_id: lead.id }))
  ])
  return contact
}

export async function upsertInboundWhatsAppContact(env: Env, waId: string, profileName?: string): Promise<WhatsAppContact> {
  const now = new Date().toISOString()
  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
  await env.DB.prepare(`INSERT INTO whatsapp_contacts
    (wa_id, phone_e164, profile_name, status, preferences_json, frequency, source, consent_at, consent_version,
     unsubscribe_token, last_inbound_at, created_at, updated_at)
    VALUES (?, ?, ?, 'paused', '["principais"]', 'daily', 'inbound', ?, 'whatsapp-inbound-v1', ?, ?, ?, ?)
    ON CONFLICT(wa_id) DO UPDATE SET profile_name = COALESCE(excluded.profile_name, whatsapp_contacts.profile_name),
      last_inbound_at = excluded.last_inbound_at, updated_at = excluded.updated_at`)
    .bind(waId, `+${waId}`, profileName || null, now, token, now, now, now).run()
  return (await env.DB.prepare('SELECT * FROM whatsapp_contacts WHERE wa_id = ? LIMIT 1').bind(waId).first<WhatsAppContact>())!
}

export async function unsubscribeWhatsAppContact(env: Env, waId: string, source = 'message'): Promise<boolean> {
  const contact = await env.DB.prepare('SELECT id FROM whatsapp_contacts WHERE wa_id = ? LIMIT 1').bind(waId).first<{ id: number }>()
  if (!contact) return false
  const now = new Date().toISOString()
  await env.DB.batch([
    env.DB.prepare(`UPDATE whatsapp_contacts SET status = 'unsubscribed', updated_at = ? WHERE id = ?`).bind(now, contact.id),
    env.DB.prepare(`INSERT INTO whatsapp_consent_events (contact_id, action, source) VALUES (?, 'opt_out', ?)`).bind(contact.id, source)
  ])
  return true
}

export async function unsubscribeWhatsAppContactByToken(env: Env, token: string): Promise<boolean> {
  const contact = await env.DB.prepare('SELECT id FROM whatsapp_contacts WHERE unsubscribe_token = ? LIMIT 1').bind(token).first<{ id: number }>()
  if (!contact) return false
  const now = new Date().toISOString()
  await env.DB.batch([
    env.DB.prepare(`UPDATE whatsapp_contacts SET status = 'unsubscribed', updated_at = ? WHERE id = ?`).bind(now, contact.id),
    env.DB.prepare(`INSERT INTO whatsapp_consent_events (contact_id, action, source) VALUES (?, 'opt_out', 'web')`).bind(contact.id)
  ])
  return true
}

export async function getWhatsAppStats(env: Env): Promise<Record<string, number>> {
  const [contacts, pending, destinations, campaigns] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) total, SUM(status = 'active') active, SUM(status = 'unsubscribed') unsubscribed FROM whatsapp_contacts`).first<any>(),
    env.DB.prepare(`SELECT COUNT(*) total FROM whatsapp_leads WHERE status = 'pending' AND expires_at > datetime('now')`).first<any>(),
    env.DB.prepare(`SELECT COUNT(*) total FROM whatsapp_destinations WHERE status = 'active'`).first<any>(),
    env.DB.prepare(`SELECT COUNT(*) total FROM whatsapp_campaigns WHERE status IN ('draft','approved')`).first<any>()
  ])
  return { total: Number(contacts?.total || 0), active: Number(contacts?.active || 0), unsubscribed: Number(contacts?.unsubscribed || 0), pending: Number(pending?.total || 0), destinations: Number(destinations?.total || 0), campaigns: Number(campaigns?.total || 0) }
}

export async function listWhatsAppContacts(env: Env, limit = 100): Promise<WhatsAppContact[]> {
  const result = await env.DB.prepare('SELECT * FROM whatsapp_contacts ORDER BY updated_at DESC LIMIT ?').bind(Math.min(500, Math.max(1, limit))).all<WhatsAppContact>()
  return result.results || []
}

export async function listWhatsAppDestinations(env: Env, activeOnly = false): Promise<WhatsAppDestination[]> {
  const result = await env.DB.prepare(`SELECT * FROM whatsapp_destinations ${activeOnly ? "WHERE status = 'active'" : ''} ORDER BY priority, id`).all<WhatsAppDestination>()
  return result.results || []
}

export async function createWhatsAppDestination(env: Env, input: { name: string; type: WhatsAppDestinationType; scope: string; description: string; inviteUrl: string; priority: number; userId: number }): Promise<number> {
  const result = await env.DB.prepare(`INSERT INTO whatsapp_destinations (name, type, scope, description, invite_url, priority, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(input.name, input.type, input.scope || null, input.description || null, input.inviteUrl, input.priority, input.userId).run()
  return Number(result.meta.last_row_id)
}

export async function setWhatsAppDestinationStatus(env: Env, id: number, status: string): Promise<void> {
  await env.DB.prepare('UPDATE whatsapp_destinations SET status = ?, updated_at = ? WHERE id = ?').bind(status, new Date().toISOString(), id).run()
}

export async function getWhatsAppDestination(env: Env, id: number): Promise<WhatsAppDestination | null> {
  return env.DB.prepare("SELECT * FROM whatsapp_destinations WHERE id = ? AND status = 'active' LIMIT 1").bind(id).first<WhatsAppDestination>()
}

export async function countWhatsAppDestinationClick(env: Env, id: number): Promise<void> {
  await env.DB.prepare('UPDATE whatsapp_destinations SET click_count = click_count + 1 WHERE id = ?').bind(id).run()
}

const CAMPAIGN_SELECT = `SELECT c.*, p.title post_title, creator.name created_by_name, approver.name approved_by_name,
  (SELECT COUNT(*) FROM whatsapp_deliveries d WHERE d.campaign_id = c.id) total_deliveries,
  (SELECT COUNT(*) FROM whatsapp_deliveries d WHERE d.campaign_id = c.id AND d.status IN ('sent','delivered','read')) sent_deliveries,
  (SELECT COUNT(*) FROM whatsapp_deliveries d WHERE d.campaign_id = c.id AND d.status = 'read') read_deliveries,
  (SELECT COUNT(*) FROM whatsapp_deliveries d WHERE d.campaign_id = c.id AND d.status = 'failed') failed_deliveries
  FROM whatsapp_campaigns c LEFT JOIN posts p ON p.id = c.post_id
  LEFT JOIN users creator ON creator.id = c.created_by_user_id LEFT JOIN users approver ON approver.id = c.approved_by_user_id`

export async function listWhatsAppCampaigns(env: Env, limit = 100): Promise<WhatsAppCampaign[]> {
  const result = await env.DB.prepare(`${CAMPAIGN_SELECT} WHERE c.status != 'archived' ORDER BY c.updated_at DESC LIMIT ?`).bind(limit).all<WhatsAppCampaign>()
  return result.results || []
}

export async function getWhatsAppCampaign(env: Env, id: number): Promise<WhatsAppCampaign | null> {
  return env.DB.prepare(`${CAMPAIGN_SELECT} WHERE c.id = ? LIMIT 1`).bind(id).first<WhatsAppCampaign>()
}

export async function createWhatsAppCampaign(env: Env, input: { title: string; type: WhatsAppCampaignType; topics: string[]; messageTitle: string; messageBody: string; targetUrl: string; templateName: string; language: string; postId: number | null; userId: number }): Promise<number> {
  const result = await env.DB.prepare(`INSERT INTO whatsapp_campaigns
    (title, campaign_type, segment_json, message_title, message_body, target_url, template_name, template_language, post_id, created_by_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(input.title, input.type, JSON.stringify({ topics: input.topics }), input.messageTitle, input.messageBody, input.targetUrl,
      input.templateName || null, input.language, input.postId, input.userId).run()
  return Number(result.meta.last_row_id)
}

export async function approveWhatsAppCampaign(env: Env, id: number, userId: number): Promise<void> {
  await env.DB.prepare(`UPDATE whatsapp_campaigns SET status = 'approved', approved_by_user_id = ?, approved_at = ?, updated_at = ? WHERE id = ? AND status = 'draft'`)
    .bind(userId, new Date().toISOString(), new Date().toISOString(), id).run()
}

export async function claimWhatsAppCampaignForSend(env: Env, id: number): Promise<boolean> {
  const result = await env.DB.prepare(`UPDATE whatsapp_campaigns SET status = 'sending', updated_at = ? WHERE id = ? AND status = 'approved'`)
    .bind(new Date().toISOString(), id).run()
  return Number(result.meta.changes || 0) === 1
}

export async function listEligibleWhatsAppContacts(env: Env, campaign: WhatsAppCampaign, limit = 200): Promise<WhatsAppContact[]> {
  const topics = (() => { try { return JSON.parse(campaign.segment_json).topics || [] } catch { return [] } })() as string[]
  const result = await env.DB.prepare(`SELECT * FROM whatsapp_contacts WHERE status = 'active'
    AND (? = 0 OR EXISTS (SELECT 1 FROM json_each(whatsapp_contacts.preferences_json) WHERE value IN (${topics.length ? topics.map(() => '?').join(',') : "''"})))
    AND (? = 'breaking' OR last_outbound_at IS NULL OR last_outbound_at < datetime('now', '-20 hours'))
    ORDER BY last_outbound_at IS NOT NULL, last_outbound_at ASC LIMIT ?`)
    .bind(topics.length, ...topics, campaign.campaign_type, Math.min(500, limit)).all<WhatsAppContact>()
  return result.results || []
}

export async function recordWhatsAppDelivery(env: Env, campaignId: number, contactId: number, messageId: string | null, status: 'sent' | 'failed', error?: string): Promise<void> {
  const now = new Date().toISOString()
  await env.DB.prepare(`INSERT INTO whatsapp_deliveries (campaign_id, contact_id, message_id, status, error_message, sent_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(campaign_id, contact_id) DO UPDATE SET message_id = excluded.message_id,
    status = excluded.status, error_message = excluded.error_message, sent_at = excluded.sent_at, updated_at = excluded.updated_at`)
    .bind(campaignId, contactId, messageId, status, error || null, status === 'sent' ? now : null, now).run()
  if (status === 'sent') await env.DB.prepare('UPDATE whatsapp_contacts SET last_outbound_at = ?, updated_at = ? WHERE id = ?').bind(now, now, contactId).run()
}

export async function updateWhatsAppDeliveryStatus(env: Env, messageId: string, status: string): Promise<void> {
  if (!['sent', 'delivered', 'read', 'failed'].includes(status)) return
  const now = new Date().toISOString()
  const column = status === 'delivered' ? 'delivered_at' : status === 'read' ? 'read_at' : status === 'sent' ? 'sent_at' : null
  await env.DB.prepare(`UPDATE whatsapp_deliveries SET status = ?, updated_at = ?${column ? `, ${column} = ?` : ''} WHERE message_id = ?`)
    .bind(...(column ? [status, now, now, messageId] : [status, now, messageId])).run()
}

export async function setWhatsAppCampaignSent(env: Env, id: number, failed: boolean): Promise<void> {
  const now = new Date().toISOString()
  await env.DB.prepare(`UPDATE whatsapp_campaigns SET status = ?, sent_at = ?, updated_at = ? WHERE id = ?`).bind(failed ? 'failed' : 'sent', now, now, id).run()
}
