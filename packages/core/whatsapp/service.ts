import type { Env } from '../types'
import { getSetting } from '../db'
import { randomHex } from '../utils'
import { activateWhatsAppLead, claimWhatsAppCampaignForSend, createWhatsAppLead, getWhatsAppCampaign, listEligibleWhatsAppContacts, recordWhatsAppDelivery, setWhatsAppCampaignSent, unsubscribeWhatsAppContact, updateWhatsAppDeliveryStatus, upsertInboundWhatsAppContact } from './repository'
import { WHATSAPP_TOPICS, type WhatsAppFrequency, type WhatsAppRuntimeConfig, type WhatsAppTopic } from './types'

export const WHATSAPP_CONSENT_VERSION = 'whatsapp-noticias-v1'

function digits(value: string): string { return value.replace(/\D/g, '') }

export async function getWhatsAppRuntimeConfig(env: Env): Promise<WhatsAppRuntimeConfig> {
  const [enabled, businessNumber, phoneNumberId, wabaId, defaultTemplate] = await Promise.all([
    getSetting(env, 'whatsapp.enabled', 'private'), getSetting(env, 'whatsapp.business_number', 'private'),
    getSetting(env, 'whatsapp.phone_number_id', 'private'), getSetting(env, 'whatsapp.waba_id', 'private'),
    getSetting(env, 'whatsapp.default_template', 'private')
  ])
  const number = digits(String(businessNumber || env.WHATSAPP_BUSINESS_NUMBER || ''))
  const phoneId = String(phoneNumberId || env.WHATSAPP_PHONE_NUMBER_ID || '').trim()
  const accessTokenConfigured = Boolean(env.WHATSAPP_ACCESS_TOKEN)
  const appSecretConfigured = Boolean(env.WHATSAPP_APP_SECRET)
  const verifyTokenConfigured = Boolean(env.WHATSAPP_VERIFY_TOKEN)
  return {
    enabled: enabled === true || enabled === 'true' || enabled === 1,
    businessNumber: number, phoneNumberId: phoneId, wabaId: String(wabaId || env.WHATSAPP_WABA_ID || ''),
    defaultTemplate: String(defaultTemplate || 'dp_noticias_v1'), accessTokenConfigured, appSecretConfigured, verifyTokenConfigured,
    apiReady: Boolean(phoneId && accessTokenConfigured && appSecretConfigured && verifyTokenConfigured)
  }
}

export function normalizeWhatsAppTopics(values: unknown[]): WhatsAppTopic[] {
  const allowed = new Set<string>(WHATSAPP_TOPICS)
  return [...new Set(values.map(String).filter(value => allowed.has(value)))] as WhatsAppTopic[]
}

export async function startWhatsAppOptIn(env: Env, input: { topics: unknown[]; frequency: string; source: string; utmSource?: string; utmMedium?: string; utmCampaign?: string }): Promise<{ token: string; redirectUrl: string }> {
  const config = await getWhatsAppRuntimeConfig(env)
  if (!config.businessNumber) throw new Error('O número oficial do WhatsApp ainda não foi configurado.')
  const topics = normalizeWhatsAppTopics(input.topics)
  if (!topics.length) topics.push('principais')
  const frequency = (['breaking', 'daily', 'twice_daily'].includes(input.frequency) ? input.frequency : 'daily') as WhatsAppFrequency
  const token = randomHex(12).toUpperCase()
  await createWhatsAppLead(env, { token, topics, frequency, source: input.source || 'landing', utmSource: input.utmSource, utmMedium: input.utmMedium, utmCampaign: input.utmCampaign, consentVersion: WHATSAPP_CONSENT_VERSION })
  const text = `QUERO NOTICIAS ${token}`
  return { token, redirectUrl: `https://wa.me/${config.businessNumber}?text=${encodeURIComponent(text)}` }
}

async function postWhatsAppMessage(env: Env, waId: string, payload: Record<string, unknown>): Promise<string> {
  const config = await getWhatsAppRuntimeConfig(env)
  if (!config.enabled || !config.apiReady || !env.WHATSAPP_ACCESS_TOKEN) throw new Error('A Cloud API do WhatsApp não está pronta para envio.')
  const response = await fetch(`https://graph.facebook.com/v23.0/${config.phoneNumberId}/messages`, {
    method: 'POST', headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: waId, ...payload })
  })
  const data: any = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(String(data?.error?.message || `WhatsApp respondeu com HTTP ${response.status}`).slice(0, 500))
  return String(data?.messages?.[0]?.id || '')
}

async function sendTextReply(env: Env, waId: string, body: string): Promise<void> {
  const config = await getWhatsAppRuntimeConfig(env)
  if (!config.enabled || !config.apiReady) return
  await postWhatsAppMessage(env, waId, { type: 'text', text: { body, preview_url: false } })
}

export async function processWhatsAppWebhook(env: Env, payload: any): Promise<void> {
  for (const entry of payload?.entry || []) for (const change of entry?.changes || []) {
    const value = change?.value || {}
    for (const status of value.statuses || []) await updateWhatsAppDeliveryStatus(env, String(status.id || ''), String(status.status || ''))
    for (const message of value.messages || []) {
      const waId = digits(String(message.from || ''))
      if (!waId) continue
      const profileName = String(value.contacts?.find((item: any) => item.wa_id === waId)?.profile?.name || '')
      const text = String(message.text?.body || '').trim()
      const upper = text.toUpperCase()
      const match = upper.match(/^QUERO\s+NOT[IÍ]CIAS\s+([A-F0-9]{24})$/i)
      if (match) {
        const contact = await activateWhatsAppLead(env, { token: match[1].toUpperCase(), waId, profileName })
        if (contact) await sendTextReply(env, waId, 'Inscrição confirmada. Você receberá notícias do Diário do Povo conforme as preferências escolhidas. Para sair, responda SAIR.')
        else await sendTextReply(env, waId, 'Este convite expirou ou já foi utilizado. Acesse diario.dopovo.com.br/whatsapp para gerar um novo.')
      } else if (/^(SAIR|PARAR|CANCELAR)$/i.test(text)) {
        await unsubscribeWhatsAppContact(env, waId)
        await sendTextReply(env, waId, 'Você não receberá mais alertas do Diário do Povo. A inscrição pode ser refeita a qualquer momento em nosso site.')
      } else {
        await upsertInboundWhatsAppContact(env, waId, profileName)
      }
    }
  }
}

export async function verifyWhatsAppSignature(env: Env, rawBody: string, signature: string): Promise<boolean> {
  if (!env.WHATSAPP_APP_SECRET || !signature.startsWith('sha256=')) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.WHATSAPP_APP_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  const expected = `sha256=${[...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')}`
  if (expected.length !== signature.length) return false
  let mismatch = 0
  for (let i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  return mismatch === 0
}

export async function sendWhatsAppCampaign(env: Env, campaignId: number): Promise<{ sent: number; failed: number }> {
  const campaign = await getWhatsAppCampaign(env, campaignId)
  if (!campaign || campaign.status !== 'approved') throw new Error('A campanha precisa estar aprovada.')
  const config = await getWhatsAppRuntimeConfig(env)
  if (!config.enabled || !config.apiReady) throw new Error('Configure e habilite a Cloud API antes do envio.')
  const template = campaign.template_name || config.defaultTemplate
  if (!template) throw new Error('Informe um template aprovado pela Meta.')
  if (!(await claimWhatsAppCampaignForSend(env, campaign.id))) throw new Error('Esta campanha já está sendo processada ou deixou de estar aprovada.')
  const contacts = await listEligibleWhatsAppContacts(env, campaign, 200)
  let sent = 0; let failed = 0
  for (const contact of contacts) {
    try {
      const messageId = await postWhatsAppMessage(env, contact.wa_id, {
        type: 'template', template: { name: template, language: { code: campaign.template_language }, components: [{ type: 'body', parameters: [
          { type: 'text', text: campaign.message_title }, { type: 'text', text: campaign.message_body }, { type: 'text', text: campaign.target_url }
        ] }] }
      })
      await recordWhatsAppDelivery(env, campaign.id, contact.id, messageId, 'sent'); sent++
    } catch (error) {
      await recordWhatsAppDelivery(env, campaign.id, contact.id, null, 'failed', error instanceof Error ? error.message : 'Falha no envio'); failed++
    }
  }
  await setWhatsAppCampaignSent(env, campaign.id, sent === 0 && failed > 0)
  return { sent, failed }
}
