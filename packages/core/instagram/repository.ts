import type { Env } from '../types'
import type {
  InstagramPublication,
  InstagramPublicationAttempt,
  InstagramPublicationStatus,
  InstagramSourcePost
} from './types'

const PUBLICATION_SELECT = `
  SELECT
    ip.*,
    p.slug,
    p.title AS article_title,
    p.excerpt AS article_excerpt,
    p.content AS article_content,
    p.content_markdown AS article_content_markdown,
    p.published_at AS article_published_at,
    p.created_at AS article_created_at,
    c.name AS category_name,
    a.name AS author_name,
    m.r2_key AS cover_media_url,
    m.alt AS cover_alt,
    m.credits AS cover_credits,
    creator.name AS created_by_name,
    approver.name AS approved_by_name
  FROM instagram_publications ip
  INNER JOIN posts p ON p.id = ip.post_id
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN authors a ON a.id = p.author_id
  LEFT JOIN media m ON m.id = p.cover_media_id
  LEFT JOIN users creator ON creator.id = ip.created_by_user_id
  LEFT JOIN users approver ON approver.id = ip.approved_by_user_id
`

export async function listInstagramSourcePosts(env: Env, limit = 80): Promise<InstagramSourcePost[]> {
  const result = await env.DB.prepare(`
    SELECT
      p.id, p.slug, p.title, p.hat, p.excerpt, p.content, p.content_markdown,
      p.published_at, p.created_at,
      c.name AS category_name,
      a.name AS author_name,
      m.r2_key AS cover_media_url,
      m.alt AS cover_alt,
      m.credits AS cover_credits
    FROM posts p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN authors a ON a.id = p.author_id
    LEFT JOIN media m ON m.id = p.cover_media_id
    WHERE p.status = 'published'
    ORDER BY COALESCE(p.published_at, p.created_at) DESC
    LIMIT ?
  `).bind(limit).all<InstagramSourcePost>()
  return result.results || []
}

export async function listInstagramPublications(env: Env, limit = 60): Promise<InstagramPublication[]> {
  const result = await env.DB.prepare(`${PUBLICATION_SELECT}
    ORDER BY ip.created_at DESC, ip.id DESC
    LIMIT ?
  `).bind(limit).all<InstagramPublication>()
  return result.results || []
}

export async function getInstagramPublication(env: Env, id: number): Promise<InstagramPublication | null> {
  return env.DB.prepare(`${PUBLICATION_SELECT} WHERE ip.id = ? LIMIT 1`)
    .bind(id).first<InstagramPublication>()
}

export async function getInstagramPublicationByToken(env: Env, token: string): Promise<InstagramPublication | null> {
  return env.DB.prepare(`${PUBLICATION_SELECT} WHERE ip.render_token = ? LIMIT 1`)
    .bind(token).first<InstagramPublication>()
}

export async function getInstagramStats(env: Env): Promise<Record<string, number>> {
  const result = await env.DB.prepare(`
    SELECT status, COUNT(*) AS total
    FROM instagram_publications
    GROUP BY status
  `).all<{ status: string; total: number }>()
  const stats: Record<string, number> = { total: 0 }
  for (const row of result.results || []) {
    stats[row.status] = row.total
    stats.total += row.total
  }
  return stats
}

export async function createInstagramPublication(env: Env, input: {
  postId: number
  userId: number
  renderToken: string
}): Promise<number> {
  const source = await env.DB.prepare(`
    SELECT p.id, p.title, p.hat, p.excerpt, p.status, p.cover_media_id, c.name AS category_name
    FROM posts p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.id = ? LIMIT 1
  `).bind(input.postId).first<{
    id: number; title: string; hat: string | null; excerpt: string | null
    status: string; cover_media_id: number | null; category_name: string | null
  }>()
  if (!source || source.status !== 'published') throw new Error('Selecione uma matéria publicada.')
  if (!source.cover_media_id) throw new Error('A matéria precisa ter uma imagem de capa.')

  const now = new Date().toISOString()
  const result = await env.DB.prepare(`
    INSERT INTO instagram_publications (
      post_id, status, format, template, hat, title, subtitle, render_token,
      created_by_user_id, created_at, updated_at
    ) VALUES (?, 'draft', 'feed_4x5', 'editorial_overlay', ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    source.id,
    source.hat || source.category_name || 'Notícia',
    source.title,
    source.excerpt || null,
    input.renderToken,
    input.userId,
    now,
    now
  ).run()
  return Number(result.meta.last_row_id)
}

export async function updateInstagramEditorial(env: Env, id: number, input: {
  hat: string
  title: string
  subtitle: string
  photoCredit: string
  caption: string
  hashtags: string
  altText: string
  imagePositionX: number
  imagePositionY: number
}): Promise<void> {
  const current = await getInstagramPublication(env, id)
  if (!current) throw new Error('Publicação não encontrada.')
  if (current.status === 'published' || current.status === 'publishing' || current.status === 'scheduled') {
    throw new Error('Esta publicação não pode mais ser editada.')
  }
  const nextStatus: InstagramPublicationStatus = input.caption.trim() ? 'caption_ready' : 'draft'
  await env.DB.prepare(`
    UPDATE instagram_publications
    SET hat = ?, title = ?, subtitle = ?, photo_credit = ?, caption = ?, hashtags = ?, alt_text = ?,
        image_position_x = ?, image_position_y = ?,
        status = ?, approved_by_user_id = NULL, approved_at = NULL,
        last_error = NULL, version = version + 1, updated_at = ?
    WHERE id = ?
  `).bind(
    input.hat.trim() || null,
    input.title.trim(),
    input.subtitle.trim() || null,
    input.photoCredit.trim(),
    input.caption.trim() || null,
    input.hashtags.trim() || null,
    input.altText.trim() || null,
    Math.max(0, Math.min(100, Math.round(input.imagePositionX))),
    Math.max(0, Math.min(100, Math.round(input.imagePositionY))),
    nextStatus,
    new Date().toISOString(),
    id
  ).run()
}

export async function saveInstagramCaption(env: Env, id: number, input: {
  caption: string
  hashtags?: string
  altText?: string
  executionId?: string
}): Promise<void> {
  await env.DB.prepare(`
    UPDATE instagram_publications
    SET caption = ?, hashtags = ?, alt_text = ?, status = 'caption_ready',
        n8n_execution_id = COALESCE(?, n8n_execution_id), last_error = NULL,
        approved_by_user_id = NULL, approved_at = NULL,
        version = version + 1, updated_at = ?
    WHERE id = ? AND status NOT IN ('publishing', 'scheduled', 'published')
  `).bind(
    input.caption.trim(),
    input.hashtags?.trim() || null,
    input.altText?.trim() || null,
    input.executionId || null,
    new Date().toISOString(),
    id
  ).run()
}

export async function approveInstagramPublication(env: Env, id: number, userId: number): Promise<void> {
  const current = await getInstagramPublication(env, id)
  if (!current) throw new Error('Publicação não encontrada.')
  if (!current.caption?.trim()) throw new Error('Revise e salve uma legenda antes da aprovação.')
  if (!current.title.trim()) throw new Error('O título da arte não pode ficar vazio.')
  if (!current.photo_credit?.trim()) throw new Error('Informe o crédito da foto antes da aprovação.')
  if (!current.cover_media_url) throw new Error('A imagem de capa não está disponível.')
  if (current.status === 'published' || current.status === 'publishing' || current.status === 'scheduled') {
    throw new Error('Esta publicação já foi encaminhada.')
  }
  const now = new Date().toISOString()
  await env.DB.prepare(`
    UPDATE instagram_publications
    SET status = 'approved', approved_by_user_id = ?, approved_at = ?,
        last_error = NULL, updated_at = ?
    WHERE id = ?
  `).bind(userId, now, now, id).run()
}

export async function setInstagramPublicationState(env: Env, id: number, input: {
  status: InstagramPublicationStatus
  scheduledAt?: string | null
  executionId?: string | null
  containerId?: string | null
  mediaId?: string | null
  permalink?: string | null
  outputImageUrl?: string | null
  error?: string | null
  publishedAt?: string | null
}): Promise<void> {
  await env.DB.prepare(`
    UPDATE instagram_publications
    SET status = ?, scheduled_at = COALESCE(?, scheduled_at),
        n8n_execution_id = COALESCE(?, n8n_execution_id),
        meta_container_id = COALESCE(?, meta_container_id),
        meta_media_id = COALESCE(?, meta_media_id),
        permalink = COALESCE(?, permalink),
        output_image_url = COALESCE(?, output_image_url),
        last_error = ?, published_at = COALESCE(?, published_at), updated_at = ?
    WHERE id = ?
  `).bind(
    input.status,
    input.scheduledAt || null,
    input.executionId || null,
    input.containerId || null,
    input.mediaId || null,
    input.permalink || null,
    input.outputImageUrl || null,
    input.error || null,
    input.publishedAt || null,
    new Date().toISOString(),
    id
  ).run()
}

export async function recordInstagramAttempt(env: Env, input: {
  publicationId: number
  action: string
  status: string
  providerReference?: string
  error?: string
  response?: unknown
}): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO instagram_publication_attempts (
      publication_id, action, status, provider_reference, error_message, response_json, attempted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    input.publicationId,
    input.action,
    input.status,
    input.providerReference || null,
    input.error || null,
    input.response === undefined ? null : JSON.stringify(input.response),
    new Date().toISOString()
  ).run()
}

export async function listInstagramAttempts(env: Env, publicationId: number): Promise<InstagramPublicationAttempt[]> {
  const result = await env.DB.prepare(`
    SELECT * FROM instagram_publication_attempts
    WHERE publication_id = ?
    ORDER BY attempted_at DESC, id DESC
    LIMIT 30
  `).bind(publicationId).all<InstagramPublicationAttempt>()
  return result.results || []
}
