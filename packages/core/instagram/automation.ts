import { Hono } from 'hono'
import { z } from 'zod'
import type { AppContext, Env } from '../types'
import { getPostUrl } from '../utils/post'
import { stripArticleText } from './renderer'

const SELECT_SOURCE = `
  SELECT p.id, p.slug, p.title, p.hat, p.excerpt, p.content, p.content_markdown,
    p.published_at, p.created_at, p.updated_at, c.name AS category,
    m.r2_key AS cover, m.alt AS cover_alt, m.credits AS cover_credits,
    ip.id AS publication_id, ip.version, ip.title AS social_title,
    ip.status AS social_status, ip.n8n_execution_id, ip.approved_at,
    ip.caption, ip.hashtags, ip.alt_text, ip.photo_credit
  FROM posts p
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN media m ON m.id = p.cover_media_id
  LEFT JOIN instagram_publications ip ON ip.id = (
    SELECT id FROM instagram_publications WHERE post_id = p.id
    ORDER BY created_at DESC, id DESC LIMIT 1
  )
  WHERE p.status = 'published' AND p.published_at IS NOT NULL
`

const ELIGIBLE = `(ip.id IS NULL OR (
  ip.status IN ('draft','caption_ready') AND ip.approved_at IS NULL
  AND ip.n8n_execution_id IS NULL
  AND (NULLIF(TRIM(ip.caption),'') IS NULL OR NULLIF(TRIM(ip.hashtags),'') IS NULL
    OR NULLIF(TRIM(ip.alt_text),'') IS NULL
    OR (NULLIF(TRIM(ip.photo_credit),'') IS NULL AND NULLIF(TRIM(m.credits),'') IS NOT NULL))
))`

interface Source {
  id: number
  slug: string
  title: string
  hat: string | null
  excerpt: string | null
  content: string
  content_markdown: string | null
  created_at: string
  published_at: string
  updated_at: string
  category: string | null
  cover: string | null
  cover_alt: string | null
  cover_credits: string | null
  publication_id: number | null
  version: number | null
  social_title: string | null
  caption: string | null
  hashtags: string | null
  alt_text: string | null
}

const submission = z.object({
  article_version: z.string().min(1).max(60),
  publication_id: z.number().int().positive().nullable(),
  publication_version: z.number().int().positive().nullable(),
  caption: z.string().trim().min(1).max(2200),
  hashtags: z.array(z.string().regex(/^#[\p{L}\p{N}_]{1,36}$/u)).max(8),
  alt_text: z.string().trim().min(1).max(1000),
  execution_id: z.string().regex(/^\d{1,24}$/)
}).strict()

function imageUrl(cover: string | null, base: string): string | null {
  if (!cover) return null
  if (/^https:\/\//i.test(cover)) return cover
  if (/^[a-z][a-z\d+.-]*:/i.test(cover)) return null
  const path = cover.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/')
  return `${base.replace(/\/$/, '')}/i/${path}?w=900&q=85`
}

export const instagramAutomation = new Hono<{ Bindings: Env; Variables: AppContext }>()

instagramAutomation.get('/candidates', async (c) => {
  c.header('Cache-Control', 'private, no-store')
  const since = c.req.query('since')
  if (!since || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(since) ||
    !Number.isFinite(Date.parse(since))) {
    return c.json({ success: false, error: 'Data inicial inválida.' }, 400)
  }
  const requested = Number(c.req.query('limit') || 15)
  const limit = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, 50) : 15
  const rows = await c.env.DB.prepare(`${SELECT_SOURCE}
    AND p.published_at >= ? AND julianday(p.published_at) >= julianday(?) AND ${ELIGIBLE}
    ORDER BY julianday(p.published_at) DESC, p.id DESC LIMIT ?`)
    .bind(new Date(since).toISOString().slice(0, 10), since, limit).all<Source>()
  return c.json({ success: true, data: (rows.results ?? []).map(post => ({
    post_id: post.id,
    article_version: post.updated_at,
    publication_id: post.publication_id,
    publication_version: post.version,
    title: post.title,
    social_title: post.social_title || post.title.slice(0, 120).trim(),
    excerpt: post.excerpt || '',
    content: stripArticleText(post.content_markdown || post.content, 7500),
    category: post.category,
    url: getPostUrl(post, c.env.PUBLIC_BASE_URL),
    image_url: imageUrl(post.cover, c.env.PUBLIC_BASE_URL),
    existing_alt_text: post.alt_text || post.cover_alt || '',
    existing_caption: post.caption || '',
    existing_hashtags: post.hashtags || ''
  })) })
})

instagramAutomation.post('/posts/:id{[0-9]+}', async (c) => {
  c.header('Cache-Control', 'private, no-store')
  const postId = Number(c.req.param('id'))
  const parsed = submission.safeParse(await c.req.json().catch((): null => null))
  if (!Number.isSafeInteger(postId) || postId < 1 || !parsed.success) {
    return c.json({ success: false, error: 'Dados do Instagram inválidos.' }, 400)
  }
  const input = parsed.data
  const source = await c.env.DB.prepare(`${SELECT_SOURCE} AND p.id = ? AND ${ELIGIBLE}`)
    .bind(postId).first<Source>()
  if (!source || source.updated_at !== input.article_version || source.publication_id !== input.publication_id ||
    source.version !== input.publication_version) {
    return c.json({ success: true, status: 'skipped', post_id: postId })
  }
  const credit = source.cover ? source.cover_credits?.trim().slice(0, 160) || null : null
  let hashtags = [...new Map(input.hashtags.map(tag => [tag.toLowerCase(), tag])).values()].join(' ')
  if (hashtags.length > 300 || [input.caption, hashtags].filter(Boolean).join('\n\n').length > 2200) {
    return c.json({ success: false, error: 'Legenda e hashtags excedem o limite.' }, 400)
  }
  if (source.caption?.trim() && [source.caption.trim(), hashtags].filter(Boolean).join('\n\n').length > 2200) {
    hashtags = ''
  }
  const caption = source.hashtags?.trim() && !source.caption?.trim()
    ? input.caption.slice(0, Math.max(0, 2198 - source.hashtags.trim().length)).trim()
    : input.caption
  const now = new Date().toISOString()
  const executionId = `instagram-prep:${input.execution_id}`
  const db = c.env.DB
  const stillPublished = "EXISTS (SELECT 1 FROM posts WHERE id = ? AND status = 'published' AND updated_at = ?)"
  if (source.publication_id) {
    const [changed] = await db.batch([
      db.prepare(`UPDATE instagram_publications SET
        caption = COALESCE(NULLIF(TRIM(caption),''), ?),
        hashtags = COALESCE(NULLIF(TRIM(hashtags),''), ?),
        alt_text = COALESCE(NULLIF(TRIM(alt_text),''), ?),
        photo_credit = COALESCE(NULLIF(TRIM(photo_credit),''), ?),
        status = 'caption_ready', n8n_execution_id = ?, updated_at = ?, version = version + 1
        WHERE id = ? AND post_id = ? AND version = ? AND n8n_execution_id IS NULL AND approved_at IS NULL
        AND status IN ('draft','caption_ready') AND ${stillPublished}`)
        .bind(caption, hashtags || null, input.alt_text, credit, executionId, now,
          source.publication_id, postId, source.version, postId, input.article_version),
      db.prepare(`UPDATE instagram_story_variants SET photo_credit = ?, updated_at = ?
        WHERE publication_id = ? AND NULLIF(TRIM(photo_credit),'') IS NULL
          AND ? IS NOT NULL AND changes() = 1`).bind(credit, now, source.publication_id, credit)
    ])
    return c.json({ success: true, status: changed.meta.changes ? 'prepared' : 'skipped', post_id: postId,
      publication_id: source.publication_id })
  }
  const renderToken = crypto.randomUUID().replaceAll('-', '')
  const storyToken = crypto.randomUUID().replaceAll('-', '')
  const hat = (source.hat || source.category || 'Notícia').slice(0, 40)
  const title = source.title.slice(0, 120).trim()
  const subtitle = source.excerpt?.slice(0, 180).trim() || null
  const [created] = await db.batch([
    db.prepare(`INSERT INTO instagram_publications (
        post_id, status, hat, title, subtitle, photo_credit, caption, hashtags, alt_text,
        render_token, n8n_execution_id, created_by_user_id, created_at, updated_at
      )
      SELECT ?, 'caption_ready', ?, ?, ?, ?, ?, ?, ?, ?, ?, id, ?, ?
      FROM users WHERE role = 'admin' AND is_active = 1
        AND NOT EXISTS (SELECT 1 FROM instagram_publications WHERE post_id = ?)
        AND ${stillPublished}
      ORDER BY id LIMIT 1`).bind(postId, hat, title, subtitle, credit, input.caption, hashtags || null,
      input.alt_text, renderToken, executionId, now, now, postId, postId, input.article_version),
    db.prepare(`INSERT INTO instagram_story_variants
      (publication_id, hat, title, subtitle, photo_credit, render_token, created_at, updated_at)
      SELECT id, hat, title, subtitle, photo_credit, ?, ?, ?
      FROM instagram_publications WHERE render_token = ?`).bind(storyToken, now, now, renderToken)
  ])
  return c.json({ success: true, status: created.meta.changes ? 'prepared' : 'skipped', post_id: postId,
    publication_id: created.meta.changes ? Number(created.meta.last_row_id) : null })
})
