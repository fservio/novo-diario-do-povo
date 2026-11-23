import type { D1Database } from '@cloudflare/workers-types'
import { z } from 'zod'
import { HOME_CACHE_REVISION_SETTING } from '../middleware/home-cache'
import { hasPublicationLink, publicationLinkError, publicationLinksRequired } from '../seo/internal-links'
import { renderMarkdownToHtml } from '../render/sanitize'

// Include fields that can change without incrementing content_version.
const snapshotFields = `id, status, scheduled_at, updated_at, content_version, title, hat, slug,
  excerpt, content, content_markdown, content_json, content_format, category_id, author_id,
  cover_media_id, social_image_media_id, seo_title, seo_description`
const snapshotSql = `json_array(${snapshotFields})`

export const agentReviewInput = z.object({
  source: z.enum(['news-extractor', 'briefing', 'rss-editorial']),
  auto: z.boolean(),
  sources: z.array(z.object({
    id: z.string().trim().min(1).max(200),
    text: z.string().trim().min(1).max(16000)
  }).strict()).max(8)
}).strict().refine(review => !review.auto || review.sources.length > 0)

export const agentReviewToken = z.string().uuid()
const agentReviewGuard = `AND status = 'review' AND EXISTS (
  SELECT 1 FROM agent_review_queue
  WHERE post_id = posts.id AND automatic = 1 AND result IS NULL AND token = ? AND lease_until > ?
)`

export async function claimAgentReview(db: D1Database) {
  const now = new Date()
  const token = crypto.randomUUID()
  const claimed = await db.prepare(`
    UPDATE agent_review_queue SET token = ?, lease_until = ?
    WHERE post_id = (
      SELECT p.id FROM agent_review_queue q JOIN posts p ON p.id = q.post_id
      WHERE status = 'review' AND q.automatic = 1 AND q.result IS NULL
        AND scheduled_at IS NULL AND datetime(updated_at) <= datetime(?, '-30 minutes')
        AND (q.lease_until IS NULL OR q.lease_until <= ?)
      ORDER BY p.created_at, p.id LIMIT 1
    )
    RETURNING post_id, evidence
  `).bind(token, new Date(now.getTime() + 15 * 60000).toISOString(), now.toISOString(), now.toISOString())
    .first<{ post_id: number; evidence: string }>()
  if (!claimed) return null
  const post = await readPublicationSnapshot(db, claimed.post_id)
  return post?.status === 'review' ? { ...post, token, sources: JSON.parse(claimed.evidence) } : null
}

export async function holdAgentReview(db: D1Database, id: number, token: string, reason: string) {
  return db.prepare(`
    UPDATE agent_review_queue SET result = ?, token = NULL, lease_until = NULL
    WHERE post_id = ? AND automatic = 1 AND result IS NULL AND token = ? AND lease_until > ?
      AND EXISTS (SELECT 1 FROM posts WHERE id = post_id AND status = 'review')
    RETURNING post_id AS id
  `).bind(reason, id, token, new Date().toISOString()).first()
}

export const editorialDraftRevision = z.object({
  snapshot: z.string().min(1).max(5000000),
  title: z.string().trim().min(1).max(500),
  excerpt: z.string().trim().min(1).max(1000).optional(),
  content_markdown: z.string().trim().min(1).max(42000)
}).strict()

export async function stageEditorialDraftRevision(
  db: D1Database,
  id: number,
  draft: z.infer<typeof editorialDraftRevision>,
  agentToken?: string
) {
  const html = renderMarkdownToHtml(draft.content_markdown)
  const now = new Date().toISOString()
  return db.prepare(`
    UPDATE posts
    SET title = ?, excerpt = COALESCE(?, excerpt), content = ?, content_markdown = ?, content_json = NULL,
      content_format = 'markdown', content_version = content_version + 1, updated_at = ?
    WHERE id = ? AND status IN ('draft', 'review') AND scheduled_at IS NULL
      AND ${snapshotSql} = ?
      ${agentToken ? agentReviewGuard : ''}
    RETURNING ${snapshotFields}, ${snapshotSql} AS snapshot
  `).bind(draft.title, draft.excerpt ?? null, html, draft.content_markdown, now, id, draft.snapshot,
    ...(agentToken ? [agentToken, now] : [])).first()
}

export const publicationRecommendation = z.object({
  snapshot: z.string().min(1).max(5000000),
  decision: z.literal('recomendar_publicacao'),
  evaluated_title: z.string().min(1).max(500),
  evaluated_excerpt: z.string().min(1).max(1000).optional(),
  evaluated_content: z.string().min(1).max(1000000),
  execution_id: z.string().trim().min(1).max(100),
  reason: z.string().trim().min(1).max(4000),
  blocking_issues: z.array(z.unknown()).length(0)
}).strict()

export async function readPublicationSnapshot(db: D1Database, id: number) {
  return db.prepare(`
    SELECT ${snapshotFields}, ${snapshotSql} AS snapshot
    FROM posts WHERE id = ? AND status IN ('draft', 'review') AND scheduled_at IS NULL
  `).bind(id).first()
}

export async function publishRecommendedRevision(
  db: D1Database,
  id: number,
  recommendation: z.infer<typeof publicationRecommendation>,
  agentToken?: string
) {
  if (await publicationLinksRequired(db) && !await hasPublicationLink(db, id)) {
    return { status: 'blocked', reason: publicationLinkError } as const
  }

  const { snapshot, evaluated_title, evaluated_excerpt, evaluated_content, ...decision } = recommendation
  const now = new Date().toISOString()
  const receipt = JSON.stringify({
    ...decision,
    snapshot_sha256: Array.from(new Uint8Array(await crypto.subtle.digest(
      'SHA-256', new TextEncoder().encode(snapshot)
    )), byte => byte.toString(16).padStart(2, '0')).join(''),
    published_at: now
  })

  const [published] = await db.batch([
    db.prepare(`
      UPDATE posts
      SET status = 'published', published_at = ?, updated_at = ?, editorial_publication_receipt = ?
      WHERE id = ? AND status IN ('draft', 'review') AND scheduled_at IS NULL
        AND ${snapshotSql} = ? AND title = ? AND content = ?
        AND (? IS NULL OR excerpt = ?)
        ${agentToken ? agentReviewGuard : ''}
      RETURNING id, slug, content_version
    `).bind(now, now, receipt, id, snapshot, evaluated_title, evaluated_content, evaluated_excerpt ?? null, evaluated_excerpt ?? null,
      ...(agentToken ? [agentToken, now] : [])),
    db.prepare(`
      INSERT INTO settings (key, value_json, scope, updated_at)
      SELECT ?, ?, 'private', ? WHERE changes() > 0
      ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
    `).bind(HOME_CACHE_REVISION_SETTING, JSON.stringify(crypto.randomUUID()), now)
  ])
  const post = published.results?.[0]
  return post ? { status: 'published', post } as const : { status: 'conflict' } as const
}
