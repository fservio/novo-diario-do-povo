/**
 * Capas editoriais geradas por IA (n8n).
 *
 * Fluxo: o n8n consulta a fila de matérias/colunas sem imagem, gera a ilustração e envia o arquivo
 * WebP 16:9 de volta. O CMS valida o arquivo, grava no R2 e só então vincula a capa, respeitando
 * um limite diário de custo configurável no CMS (media.ai_cover.daily_limit).
 */

import type { Context } from 'hono'
import type { Env, AppContext } from '../types'

type CoverContext = Context<{ Bindings: Env; Variables: AppContext }>

export const AI_COVER_CREDIT = 'Ilustração gerada por IA'
export const AI_COVER_ENABLED_KEY = 'media.ai_cover.enabled'
export const AI_COVER_DAILY_LIMIT_KEY = 'media.ai_cover.daily_limit'
export const AI_COVER_DEFAULT_DAILY_LIMIT = 120
export const AI_COVER_MANUAL_LIMIT_KEY = 'media.ai_cover.manual_daily_limit'
export const AI_COVER_DEFAULT_MANUAL_LIMIT = 60
export const AI_COVER_WEBHOOK_KEY = 'ai_cover.webhook_url'

const MAX_ATTEMPTS = 2
const MIN_BYTES = 8_000
const MAX_BYTES = 900_000
const MIN_WIDTH = 1200

export interface CoverFileCheck {
  ok: boolean
  error?: string
  width?: number
  height?: number
}

/** Valida o arquivo recebido: WebP, tamanho razoável, largura mínima do Discover e proporção 16:9. */
export function validateCoverFile(bytes: ArrayBuffer, mimeType: string, dimensions: { width: number; height: number } | null): CoverFileCheck {
  if (mimeType !== 'image/webp') return { ok: false, error: 'O arquivo precisa ser WebP.' }
  if (bytes.byteLength < MIN_BYTES) return { ok: false, error: 'Arquivo pequeno demais para ser uma ilustração válida.' }
  if (bytes.byteLength > MAX_BYTES) return { ok: false, error: 'Arquivo acima de 900 KB. Reduza a qualidade do WebP.' }
  if (!dimensions) return { ok: false, error: 'Não foi possível ler as dimensões do WebP.' }
  const { width, height } = dimensions
  if (width < MIN_WIDTH) return { ok: false, error: `Largura mínima de ${MIN_WIDTH}px para o Google Discover.`, width, height }
  const ratio = width / height
  if (Math.abs(ratio - 16 / 9) > 0.05) return { ok: false, error: 'A imagem precisa ter proporção 16:9.', width, height }
  return { ok: true, width, height }
}

async function readNumberSetting(env: Env, key: string, fallback: number): Promise<number> {
  try {
    const { getSetting } = await import('../db')
    const value = await getSetting(env, key, 'public')
    if (value === null || value === undefined || value === '') return fallback
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback
  } catch {
    return fallback
  }
}

async function readEnabled(env: Env): Promise<boolean> {
  try {
    const { getSetting } = await import('../db')
    const value = await getSetting(env, AI_COVER_ENABLED_KEY, 'public')
    return value === null || value === undefined ? true : value !== false && value !== 'false' && value !== 0
  } catch {
    return true
  }
}

async function generatedToday(env: Env): Promise<number> {
  // Dia contado no fuso de Brasília (UTC-3).
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM media WHERE credits = ? AND deleted_at IS NULL AND uploaded_at >= datetime('now', '-3 hours', 'start of day', '+3 hours')"
  ).bind(AI_COVER_CREDIT).first<{ total: number }>()
  return Number(row?.total || 0)
}

async function failureCount(env: Env, postId: number): Promise<number> {
  try {
    return Number(await env.KV?.get(`cover-fail:${postId}`)) || 0
  } catch {
    return 0
  }
}

/** GET /api/n8n/covers/queue?limit=5&days=3 */
export async function handleCoverQueue(c: CoverContext): Promise<Response> {
  c.header('Cache-Control', 'private, no-store')
  const env = c.env
  const limit = Math.min(Math.max(Number(c.req.query('limit')) || 5, 1), 20)
  const days = Math.min(Math.max(Number(c.req.query('days')) || 3, 1), 14)

  if (!(await readEnabled(env))) {
    return c.json({ success: true, enabled: false, remaining_today: 0, data: [] })
  }

  const dailyLimit = await readNumberSetting(env, AI_COVER_DAILY_LIMIT_KEY, AI_COVER_DEFAULT_DAILY_LIMIT)
  const done = await generatedToday(env)
  const remaining = Math.max(0, dailyLimit - done)
  if (remaining === 0) {
    return c.json({ success: true, enabled: true, daily_limit: dailyLimit, generated_today: done, remaining_today: 0, data: [] })
  }

  const take = Math.min(limit, remaining)
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString()
  const rows = await env.DB.prepare(`
    SELECT p.id, p.title, p.hat, p.excerpt, p.opinion_type, p.slug, p.published_at,
           c.name AS category_name, c.slug AS category_slug
    FROM posts p
    JOIN categories c ON c.id = p.category_id
    WHERE p.status = 'published'
      AND p.seo_noindex = 0
      AND p.cover_media_id IS NULL
      AND p.published_at >= ?
      AND datetime(p.published_at) <= datetime('now')
      AND p.slug NOT LIKE 'previsao-do-tempo-%'
      AND NOT EXISTS (SELECT 1 FROM seo_pilot_members m WHERE m.post_id = p.id)
    ORDER BY CASE WHEN p.opinion_type IN ('column', 'article') THEN 0 ELSE 1 END, p.published_at DESC
    LIMIT ?
  `).bind(cutoff, take * 4).all<any>()

  const data: any[] = []
  for (const row of rows.results || []) {
    if (data.length >= take) break
    if ((await failureCount(env, row.id)) >= MAX_ATTEMPTS) continue
    data.push({
      id: row.id,
      title: row.title,
      hat: row.hat || '',
      excerpt: row.excerpt || '',
      kind: row.opinion_type === 'column' || row.opinion_type === 'article' ? 'column' : 'news',
      category: row.category_name,
      category_slug: row.category_slug,
      slug: row.slug,
      published_at: row.published_at
    })
  }

  return c.json({ success: true, enabled: true, daily_limit: dailyLimit, generated_today: done, remaining_today: remaining, data })
}

/** POST /api/n8n/covers/:id (multipart: file, alt) */
export async function handleCoverUpload(c: CoverContext): Promise<Response> {
  c.header('Cache-Control', 'private, no-store')
  const env = c.env
  const postId = Number(c.req.param('id'))
  if (!Number.isInteger(postId) || postId <= 0) return c.json({ success: false, error: 'ID inválido.' }, 400)

  if (!(await readEnabled(env))) return c.json({ success: false, error: 'Geração de capas por IA desativada no CMS.' }, 403)

  const dailyLimit = await readNumberSetting(env, AI_COVER_DAILY_LIMIT_KEY, AI_COVER_DEFAULT_DAILY_LIMIT)
  // Geração manual (botão do CMS) tem uma folga própria acima do limite automático.
  const manual = c.req.query('manual') === '1'
  const replace = c.req.query('replace') === '1'
  const manualLimit = manual ? await readNumberSetting(env, AI_COVER_MANUAL_LIMIT_KEY, AI_COVER_DEFAULT_MANUAL_LIMIT) : 0
  if ((await generatedToday(env)) >= dailyLimit + manualLimit) {
    return c.json({ success: false, error: 'Limite diário de capas por IA atingido.' }, 429)
  }

  const post = await env.DB.prepare(`
    SELECT p.id, p.title, p.status, p.cover_media_id,
           EXISTS (SELECT 1 FROM seo_pilot_members m WHERE m.post_id = p.id) AS in_pilot
    FROM posts p WHERE p.id = ?
  `).bind(postId).first<any>()
  if (!post) return c.json({ success: false, error: 'Matéria não encontrada.' }, 404)
  if (post.status !== 'published' && !manual) return c.json({ success: false, error: 'A matéria não está publicada.' }, 409)
  if (post.cover_media_id && !replace) return c.json({ success: false, skipped: 'already_has_cover', error: 'A matéria já tem capa.' }, 409)
  if (post.in_pilot) return c.json({ success: false, skipped: 'seo_pilot', error: 'Matéria do piloto de SEO não pode ser alterada.' }, 409)

  const form = await c.req.formData()
  const fileEntry = form.get('file')
  if (!fileEntry || typeof fileEntry === 'string') return c.json({ success: false, error: 'Arquivo não enviado.' }, 400)
  const file = fileEntry as File
  const bytes = await file.arrayBuffer()

  const { createMedia, extractImageDimensions } = await import('../db/media')
  const mime = (file.type || '').toLowerCase()
  const dimensions = extractImageDimensions(bytes, mime)
  const check = validateCoverFile(bytes, mime, dimensions)
  if (!check.ok) return c.json({ success: false, error: check.error }, 422)

  const now = new Date()
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(8))).map(b => b.toString(16).padStart(2, '0')).join('')
  const r2Key = `media/${year}/${month}/${hex}.webp`
  const alt = String(form.get('alt') || post.title || '').trim().slice(0, 200)

  await env.R2.put(r2Key, bytes, { httpMetadata: { contentType: 'image/webp' } })
  const mediaId = await createMedia(env, {
    r2_key: r2Key,
    filename: `${hex}.webp`,
    mime_type: 'image/webp',
    size_bytes: bytes.byteLength,
    width: check.width,
    height: check.height,
    alt: alt || null,
    credits: AI_COVER_CREDIT,
    uploaded_by_user_id: 1
  })

  const result = replace
    ? await env.DB.prepare('UPDATE posts SET cover_media_id = ? WHERE id = ?').bind(mediaId, postId).run()
    : await env.DB.prepare('UPDATE posts SET cover_media_id = ? WHERE id = ? AND cover_media_id IS NULL').bind(mediaId, postId).run()
  if (!(result.meta?.changes > 0)) {
    // Outra rotina colocou uma capa no meio do caminho: descarta o arquivo para não deixar órfãos.
    await env.R2.delete(r2Key).catch(() => {})
    await env.DB.prepare('DELETE FROM media WHERE id = ?').bind(mediaId).run().catch(() => {})
    return c.json({ success: false, skipped: 'already_has_cover', error: 'A matéria recebeu outra capa durante o envio.' }, 409)
  }

  return c.json({ success: true, data: { post_id: postId, media_id: mediaId, url: `/i/${r2Key}`, width: check.width, height: check.height, bytes: bytes.byteLength } })
}

/** POST /api/n8n/covers/:id/fail - registra uma tentativa que falhou para não travar a fila. */
export async function handleCoverFailure(c: CoverContext): Promise<Response> {
  const postId = Number(c.req.param('id'))
  if (!Number.isInteger(postId) || postId <= 0) return c.json({ success: false, error: 'ID inválido.' }, 400)
  const attempts = (await failureCount(c.env, postId)) + 1
  try {
    await c.env.KV?.put(`cover-fail:${postId}`, String(attempts), { expirationTtl: 86_400 })
  } catch {
    // Sem KV a fila apenas tentará de novo na próxima rodada.
  }
  return c.json({ success: true, attempts, blocked: attempts >= MAX_ATTEMPTS })
}

/** Monta o corpo enviado ao fluxo do n8n a partir da matéria e da ideia opcional do editor. */
export function buildAdminCoverPayload(post: any, idea: string, seed: number) {
  return {
    id: post.id,
    title: String(post.title || ''),
    excerpt: String(post.excerpt || ''),
    hat: String(post.hat || ''),
    kind: post.opinion_type === 'column' || post.opinion_type === 'article' ? 'column' : 'news',
    category: post.category_name || '',
    category_slug: post.category_slug || '',
    idea: idea.replace(/\s+/g, ' ').trim().slice(0, 300),
    seed
  }
}

/** POST /api/admin/posts/:id/ai-cover - botão "Gerar capa por IA" do editor do CMS. */
export async function handleAdminAiCover(c: CoverContext): Promise<Response> {
  c.header('Cache-Control', 'private, no-store')
  const env = c.env
  const postId = Number(c.req.param('id'))
  if (!Number.isInteger(postId) || postId <= 0) return c.json({ success: false, error: 'ID inválido.' }, 400)

  if (!(await readEnabled(env))) {
    return c.json({ success: false, error: 'A geração de capas por IA está desativada nas configurações.' }, 403)
  }

  const { getSetting, logAudit } = await import('../db')
  const webhookUrl = await getSetting(env, AI_COVER_WEBHOOK_KEY, 'private')
  if (typeof webhookUrl !== 'string' || !/^https:\/\//i.test(webhookUrl)) {
    return c.json({ success: false, error: 'O fluxo de geração de capas ainda não foi conectado ao CMS.' }, 503)
  }
  const apiKey = (await getSetting(env, 'n8n_api_key', 'private')) || (env as any).N8N_API_KEY || ''

  const post = await env.DB.prepare(`
    SELECT p.id, p.title, p.excerpt, p.hat, p.status, p.opinion_type,
           c.name AS category_name, c.slug AS category_slug
    FROM posts p LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.id = ?
  `).bind(postId).first<any>()
  if (!post) return c.json({ success: false, error: 'Matéria não encontrada.' }, 404)

  let idea = ''
  try {
    const body: any = await c.req.json()
    idea = String(body?.idea || '')
  } catch {
    // Sem corpo: usa apenas o título e o resumo.
  }

  const payload = buildAdminCoverPayload(post, idea, Math.floor(Math.random() * 1_000_000_000))

  let result: any = null
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': String(apiKey) },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(110_000)
    })
    result = await res.json().catch((): null => null)
    if (!res.ok && !result) {
      return c.json({ success: false, error: `O fluxo de geração respondeu com erro ${res.status}.` }, 502)
    }
  } catch (error: any) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError'
    return c.json({ success: false, error: timedOut ? 'A geração demorou demais. Tente novamente.' : 'Não foi possível falar com o fluxo de geração.' }, 504)
  }

  if (!result || result.success !== true || !result.data?.media_id) {
    const reason = String(result?.error || result?.message || 'A geração da capa falhou.').slice(0, 300)
    return c.json({ success: false, error: reason }, 502)
  }

  try {
    const user = c.get('adminUser') as any
    await logAudit(env, {
      entityType: 'post',
      entityId: postId,
      action: 'ai_cover_generated',
      actorType: 'user',
      actorId: user?.id,
      details: { mediaId: result.data.media_id, idea: payload.idea || null },
      requestId: c.get('requestId')
    })
  } catch {
    // A auditoria não pode desfazer uma capa já aplicada.
  }

  return c.json({ success: true, media_id: result.data.media_id, url: result.data.url, credit: AI_COVER_CREDIT })
}
