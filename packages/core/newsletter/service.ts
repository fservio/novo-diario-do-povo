import type { Env } from '../types'
import { randomHex } from '../utils'
import { getSettings } from '../db'
import {
  addConfirmedNewsletterRecipient,
  getNewsletterCampaign,
  getNewsletterStats,
  listConfirmedRecipientsForCampaign,
  recordNewsletterDelivery,
  refreshCampaignDeliveryTotals,
  updateCampaignSnapshot
} from './repository'
import { renderNewsletterEmail } from './renderer'
import { sendSmtpBatch, type SmtpConfig, type SmtpMessage } from './smtp'

const NEWSLETTER_SETTING_KEYS = [
  'newsletter.smtp_host',
  'newsletter.smtp_port',
  'newsletter.smtp_username',
  'newsletter.from_email',
  'newsletter.from_name',
  'newsletter.daily_limit'
]

export interface NewsletterRuntimeConfig {
  host: string
  port: number
  username: string
  fromEmail: string
  fromName: string
  dailyLimit: number
  passwordConfigured: boolean
  smtpReady: boolean
}

export async function getNewsletterRuntimeConfig(env: Env): Promise<NewsletterRuntimeConfig> {
  const settings = await getSettings(env, NEWSLETTER_SETTING_KEYS, 'private')
  const host = String(settings['newsletter.smtp_host'] || env.SMTP_HOST || '').trim()
  const portValue = String(settings['newsletter.smtp_port'] || env.SMTP_PORT || '465')
  const username = String(settings['newsletter.smtp_username'] || env.SMTP_USERNAME || '').trim()
  const fromEmail = String(settings['newsletter.from_email'] || env.SMTP_FROM_EMAIL || '').trim()
  const fromName = String(settings['newsletter.from_name'] || env.SMTP_FROM_NAME || 'Diário do Povo').trim()
  const dailyLimitValue = String(settings['newsletter.daily_limit'] || env.NEWSLETTER_DAILY_LIMIT || '80')
  const parsedPort = Number.parseInt(portValue, 10)
  const parsedLimit = Number.parseInt(dailyLimitValue, 10)
  const dailyLimit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(100, parsedLimit)) : 80
  const port = Number.isFinite(parsedPort) ? parsedPort : 465
  const passwordConfigured = Boolean(env.SMTP_PASSWORD)

  return {
    host,
    port,
    username,
    fromEmail,
    fromName,
    dailyLimit,
    passwordConfigured,
    smtpReady: Boolean(host && username && fromEmail && passwordConfigured && port === 465)
  }
}

export async function getNewsletterDailyLimit(env: Env): Promise<number> {
  const configured = (await getNewsletterRuntimeConfig(env)).dailyLimit
  if (!Number.isFinite(configured)) return 80
  return Math.max(1, Math.min(100, configured))
}

export async function getSmtpConfig(env: Env): Promise<SmtpConfig | null> {
  const runtime = await getNewsletterRuntimeConfig(env)
  if (!runtime.smtpReady || !env.SMTP_PASSWORD) return null
  return {
    host: runtime.host,
    port: runtime.port,
    username: runtime.username,
    password: env.SMTP_PASSWORD,
    fromEmail: runtime.fromEmail,
    fromName: runtime.fromName
  }
}

export async function addNewsletterTestRecipient(env: Env, email: string, name?: string): Promise<void> {
  await addConfirmedNewsletterRecipient(env, {
    email,
    name,
    token: randomHex(24),
    source: 'admin-consent'
  })
}

export async function refreshNewsletterCampaignSnapshot(env: Env, campaignId: number): Promise<string> {
  const campaign = await getNewsletterCampaign(env, campaignId)
  if (!campaign) throw new Error('Campanha não encontrada.')
  const baseUrl = env.PUBLIC_BASE_URL || 'http://localhost:3000'
  const rendered = renderNewsletterEmail({
    campaign,
    baseUrl,
    unsubscribeUrl: `${baseUrl.replace(/\/$/, '')}/newsletter/unsubscribe/preview`
  })
  await updateCampaignSnapshot(env, campaignId, rendered.html)
  return rendered.html
}

export async function sendNewsletterTest(env: Env, campaignId: number, recipientEmail: string): Promise<void> {
  const config = await getSmtpConfig(env)
  if (!config) throw new Error('SMTP ainda não configurado. Cadastre os segredos antes do primeiro teste.')

  const campaign = await getNewsletterCampaign(env, campaignId)
  if (!campaign) throw new Error('Campanha não encontrada.')
  const stats = await getNewsletterStats(env)
  const dailyLimit = await getNewsletterDailyLimit(env)
  if (stats.sentLast24h >= dailyLimit) throw new Error(`Limite operacional de ${dailyLimit} mensagens em 24 horas atingido.`)

  const baseUrl = env.PUBLIC_BASE_URL || 'http://localhost:3000'
  const unsubscribeUrl = `${baseUrl.replace(/\/$/, '')}/newsletter/unsubscribe/preview`
  const rendered = renderNewsletterEmail({ campaign, baseUrl, unsubscribeUrl })

  let recorded = false
  const results = await sendSmtpBatch(config, [{
    to: recipientEmail.trim().toLowerCase(),
    subject: `[TESTE] ${campaign.subject}`,
    html: rendered.html,
    text: rendered.text
  }], async result => {
    recorded = true
    await recordNewsletterDelivery(env, {
      campaignId,
      recipientEmail: result.recipient,
      deliveryType: 'test',
      ok: result.ok,
      messageId: result.messageId,
      error: result.error
    })
  })

  if (!recorded && results[0]) {
    await recordNewsletterDelivery(env, {
      campaignId,
      recipientEmail,
      deliveryType: 'test',
      ok: results[0].ok,
      messageId: results[0].messageId,
      error: results[0].error
    })
  }
  if (!results[0]?.ok) throw new Error(results[0]?.error || 'Falha no envio de teste.')
}

export async function sendNewsletterCampaign(env: Env, campaignId: number): Promise<{
  sent: number
  failed: number
  remaining: number
  limited: boolean
}> {
  const config = await getSmtpConfig(env)
  if (!config) throw new Error('SMTP ainda não configurado. Cadastre os segredos antes do envio.')

  const campaign = await getNewsletterCampaign(env, campaignId)
  if (!campaign) throw new Error('Campanha não encontrada.')
  if (!campaign.items.length) throw new Error('Selecione pelo menos uma matéria para a campanha.')
  if (campaign.status === 'sent') throw new Error('Esta campanha já foi concluída.')

  const stats = await getNewsletterStats(env)
  const dailyLimit = await getNewsletterDailyLimit(env)
  const available = Math.max(0, dailyLimit - stats.sentLast24h)
  if (available === 0) throw new Error(`Limite operacional de ${dailyLimit} mensagens em 24 horas atingido.`)

  const recipients = await listConfirmedRecipientsForCampaign(env, campaignId, available)
  if (!recipients.length) {
    await refreshCampaignDeliveryTotals(env, campaignId)
    return { sent: 0, failed: 0, remaining: 0, limited: false }
  }

  const baseUrl = env.PUBLIC_BASE_URL || 'http://localhost:3000'
  const tokenUpdates = recipients
    .filter(recipient => !recipient.unsubscribe_token)
    .map(recipient => ({ ...recipient, unsubscribe_token: randomHex(24) }))
  if (tokenUpdates.length) {
    await env.DB.batch(tokenUpdates.map(recipient => env.DB.prepare(`
      UPDATE newsletter_subscribers SET unsubscribe_token = ?, updated_at = ? WHERE id = ?
    `).bind(recipient.unsubscribe_token, new Date().toISOString(), recipient.id)))
  }
  const tokenMap = new Map(tokenUpdates.map(recipient => [recipient.id, recipient.unsubscribe_token]))

  const messages: SmtpMessage[] = recipients.map(recipient => {
    const token = recipient.unsubscribe_token || tokenMap.get(recipient.id) || ''
    const unsubscribeUrl = `${baseUrl.replace(/\/$/, '')}/newsletter/unsubscribe/${token}`
    const rendered = renderNewsletterEmail({
      campaign,
      baseUrl,
      unsubscribeUrl,
      recipientName: recipient.name
    })
    return {
      to: recipient.email,
      subject: campaign.subject,
      html: rendered.html,
      text: rendered.text,
      unsubscribeUrl
    }
  })

  const byEmail = new Map(recipients.map(recipient => [recipient.email.toLowerCase(), recipient]))
  const results = await sendSmtpBatch(config, messages, async result => {
    const recipient = byEmail.get(result.recipient.toLowerCase())
    await recordNewsletterDelivery(env, {
      campaignId,
      subscriberId: recipient?.id,
      recipientEmail: result.recipient,
      deliveryType: 'campaign',
      ok: result.ok,
      messageId: result.messageId,
      error: result.error
    })
    if (result.ok && recipient) {
      await env.DB.prepare('UPDATE newsletter_subscribers SET last_sent_at = ?, updated_at = ? WHERE id = ?')
        .bind(new Date().toISOString(), new Date().toISOString(), recipient.id).run()
    }
  })

  await refreshCampaignDeliveryTotals(env, campaignId)
  const refreshed = await getNewsletterCampaign(env, campaignId)
  const remaining = refreshed ? Math.max(0, refreshed.recipient_count - refreshed.sent_count) : 0
  return {
    sent: results.filter(result => result.ok).length,
    failed: results.filter(result => !result.ok).length,
    remaining,
    limited: recipients.length === available && remaining > 0
  }
}
