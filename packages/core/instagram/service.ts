import type { Env } from '../types'
import { getSetting, getSettings } from '../db'
import { getPostUrl } from '../utils/post'
import {
  getInstagramPublication,
  recordInstagramAttempt,
  saveInstagramCaption,
  setInstagramPublicationState
} from './repository'
import { stripArticleText } from './renderer'
import type { InstagramRuntimeConfig } from './types'

const CONFIG_KEYS = [
  'instagram.caption_webhook_url',
  'instagram.publish_webhook_url',
  'instagram.account_label'
]

function safeWebhookUrl(value: unknown): string {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') return ''
    return url.toString()
  } catch {
    return ''
  }
}

function safeResultUrl(value: unknown): string | null {
  const raw = String(value || '').trim()
  if (!raw) return null
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch { return null }
}

export async function getInstagramRuntimeConfig(env: Env): Promise<InstagramRuntimeConfig> {
  const settings = await getSettings(env, CONFIG_KEYS, 'private')
  const captionWebhookUrl = safeWebhookUrl(settings['instagram.caption_webhook_url'])
  const publishWebhookUrl = safeWebhookUrl(settings['instagram.publish_webhook_url'])
  const accountLabel = String(settings['instagram.account_label'] || '@diariodopovo').trim().slice(0, 100)
  return {
    captionWebhookUrl,
    publishWebhookUrl,
    accountLabel,
    captionReady: Boolean(captionWebhookUrl),
    publishReady: Boolean(publishWebhookUrl)
  }
}

async function n8nHeaders(env: Env): Promise<Record<string, string>> {
  const dbKey = await getSetting(env, 'n8n_api_key', 'private')
  const apiKey = String(dbKey || env.N8N_API_KEY || '')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) headers['X-API-Key'] = apiKey
  if (env.N8N_WEBHOOK_SECRET) headers['X-Webhook-Secret'] = env.N8N_WEBHOOK_SECRET
  return headers
}

async function postWebhook(env: Env, url: string, payload: unknown): Promise<any> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 25000)
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: await n8nHeaders(env),
      body: JSON.stringify(payload),
      signal: controller.signal
    })
    const text = await response.text()
    let data: any = {}
    try { data = text ? JSON.parse(text) : {} } catch { data = { message: text } }
    if (!response.ok) throw new Error(data.error || data.message || `n8n respondeu com HTTP ${response.status}.`)
    return data
  } finally {
    clearTimeout(timeout)
  }
}

function normalizeHashtags(value: unknown): string {
  const source = Array.isArray(value) ? value.join(' ') : String(value || '')
  return source.split(/\s+/).filter(Boolean).slice(0, 8)
    .map(item => item.startsWith('#') ? item : `#${item.replace(/[^\p{L}\p{N}_]/gu, '')}`)
    .filter(item => item.length > 1).join(' ')
}

export async function requestInstagramCaption(env: Env, id: number): Promise<void> {
  const [publication, config] = await Promise.all([
    getInstagramPublication(env, id),
    getInstagramRuntimeConfig(env)
  ])
  if (!publication) throw new Error('Publicação não encontrada.')
  if (!config.captionReady) throw new Error('Configure o webhook de legenda do n8n em Integrações.')
  if (publication.status === 'published' || publication.status === 'publishing' || publication.status === 'scheduled') {
    throw new Error('Esta publicação já foi encaminhada e não pode gerar outra legenda.')
  }

  try {
    const response = await postWebhook(env, config.captionWebhookUrl, {
      event: 'instagram.caption.requested',
      publication_id: publication.id,
      version: publication.version,
      editorial: {
        hat: publication.hat,
        title: publication.title,
        subtitle: publication.subtitle,
        category: publication.category_name,
        author: publication.author_name
      },
      article: {
        id: publication.post_id,
        title: publication.article_title,
        excerpt: publication.article_excerpt,
        content: stripArticleText(publication.article_content_markdown || publication.article_content),
        url: getPostUrl({
          slug: publication.slug,
          published_at: publication.article_published_at,
          created_at: publication.article_created_at
        }, env.PUBLIC_BASE_URL)
      },
      constraints: {
        language: 'pt-BR',
        factual_only: true,
        caption_max_characters: 2200,
        hashtag_maximum: 8,
        human_approval_required: true
      }
    })
    const caption = String(response.caption || response.data?.caption || '').trim()
    if (!caption || caption.length > 2200) throw new Error('O n8n não retornou uma legenda válida de até 2.200 caracteres.')
    await saveInstagramCaption(env, id, {
      caption,
      hashtags: normalizeHashtags(response.hashtags || response.data?.hashtags),
      altText: String(response.alt_text || response.altText || response.data?.alt_text || '').trim().slice(0, 1000),
      executionId: String(response.execution_id || response.executionId || '').trim() || undefined
    })
    await recordInstagramAttempt(env, {
      publicationId: id,
      action: 'caption',
      status: 'success',
      providerReference: response.execution_id || response.executionId,
      response: { caption_length: caption.length, has_alt_text: Boolean(response.alt_text || response.altText) }
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao gerar a legenda.'
    await recordInstagramAttempt(env, { publicationId: id, action: 'caption', status: 'failed', error: message })
    throw error
  }
}

export async function dispatchInstagramPublication(env: Env, id: number, scheduledAt?: string): Promise<void> {
  const [publication, config] = await Promise.all([
    getInstagramPublication(env, id),
    getInstagramRuntimeConfig(env)
  ])
  if (!publication) throw new Error('Publicação não encontrada.')
  if (!publication.approved_at || !['approved', 'failed'].includes(publication.status)) {
    throw new Error('A publicação precisa de aprovação editorial antes do envio.')
  }
  if (!publication.photo_credit?.trim()) throw new Error('Informe o crédito da foto antes do envio.')
  if (!config.publishReady) throw new Error('Configure o webhook de publicação do n8n em Integrações.')
  if (publication.status === 'published') throw new Error('Esta publicação já foi concluída.')

  const normalizedSchedule = scheduledAt ? new Date(scheduledAt).toISOString() : null
  const isFuture = Boolean(normalizedSchedule && new Date(normalizedSchedule).getTime() > Date.now() + 60000)
  await setInstagramPublicationState(env, id, {
    status: isFuture ? 'scheduled' : 'publishing',
    scheduledAt: normalizedSchedule,
    error: null
  })

  try {
    const response = await postWebhook(env, config.publishWebhookUrl, {
      event: isFuture ? 'instagram.publication.scheduled' : 'instagram.publication.requested',
      publication_id: publication.id,
      idempotency_key: `instagram:${publication.id}:v${publication.version}`,
      scheduled_at: normalizedSchedule,
      render: {
        url: `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}/artes/editoriais/${publication.render_token}`,
        width: 1080,
        height: 1350,
        output: 'jpeg',
        quality: 92
      },
      instagram: {
        caption: [publication.caption, publication.hashtags].filter(Boolean).join('\n\n'),
        alt_text: publication.alt_text,
        account_label: config.accountLabel
      },
      callback_url: `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}/api/n8n/instagram/${publication.id}`
    })
    const responseStatus = String(response.status || (isFuture ? 'scheduled' : 'accepted')).toLowerCase()
    const published = responseStatus === 'published' || Boolean(response.media_id || response.meta_media_id)
    await setInstagramPublicationState(env, id, {
      status: published ? 'published' : (isFuture ? 'scheduled' : 'publishing'),
      executionId: response.execution_id || response.executionId,
      containerId: response.container_id || response.meta_container_id,
      mediaId: response.media_id || response.meta_media_id,
      permalink: safeResultUrl(response.permalink),
      outputImageUrl: safeResultUrl(response.image_url || response.output_image_url),
      publishedAt: published ? new Date().toISOString() : null,
      error: null
    })
    await recordInstagramAttempt(env, {
      publicationId: id,
      action: isFuture ? 'schedule' : 'publish',
      status: published ? 'published' : 'accepted',
      providerReference: response.execution_id || response.executionId || response.media_id,
      response
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao encaminhar a publicação.'
    await setInstagramPublicationState(env, id, { status: 'failed', error: message })
    await recordInstagramAttempt(env, { publicationId: id, action: isFuture ? 'schedule' : 'publish', status: 'failed', error: message })
    throw error
  }
}

export async function applyInstagramN8nCallback(env: Env, id: number, payload: Record<string, unknown>): Promise<void> {
  const current = await getInstagramPublication(env, id)
  if (!current) throw new Error('Publicação não encontrada.')

  if (typeof payload.caption === 'string' && payload.caption.trim()) {
    if (current.status === 'publishing' || current.status === 'scheduled' || current.status === 'published') {
      throw new Error('A legenda não pode ser alterada após o encaminhamento.')
    }
    await saveInstagramCaption(env, id, {
      caption: payload.caption.slice(0, 2200),
      hashtags: normalizeHashtags(payload.hashtags),
      altText: String(payload.alt_text || payload.altText || '').slice(0, 1000),
      executionId: String(payload.execution_id || '') || undefined
    })
    await recordInstagramAttempt(env, {
      publicationId: id,
      action: 'caption_callback',
      status: 'success',
      providerReference: String(payload.execution_id || '') || undefined
    })
    return
  }

  const allowed = new Set(['scheduled', 'publishing', 'published', 'failed'])
  const rawStatus = String(payload.status || '').toLowerCase()
  if (!allowed.has(rawStatus)) throw new Error('Status de callback inválido.')
  const status = rawStatus as 'scheduled' | 'publishing' | 'published' | 'failed'
  const error = status === 'failed'
    ? String(payload.error || payload.message || 'Falha informada pelo n8n.').slice(0, 1000)
    : null

  await setInstagramPublicationState(env, id, {
    status,
    executionId: String(payload.execution_id || '') || null,
    containerId: String(payload.container_id || payload.meta_container_id || '') || null,
    mediaId: String(payload.media_id || payload.meta_media_id || '') || null,
    permalink: safeResultUrl(payload.permalink),
    outputImageUrl: safeResultUrl(payload.image_url || payload.output_image_url),
    error,
    publishedAt: status === 'published' ? String(payload.published_at || new Date().toISOString()) : null
  })
  await recordInstagramAttempt(env, {
    publicationId: id,
    action: 'callback',
    status,
    providerReference: String(payload.execution_id || payload.media_id || '') || undefined,
    error: error || undefined,
    response: payload
  })
}
