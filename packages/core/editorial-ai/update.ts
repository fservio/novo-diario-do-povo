import type { D1Database } from '@cloudflare/workers-types'
import { z } from 'zod'
import { HOME_CACHE_REVISION_SETTING } from '../middleware/home-cache'
import { renderMarkdownToHtml } from '../render/sanitize'

const fields = `id, status, category_id, title, excerpt, content, slug, published_at,
  updated_at, content_version, content_format, content_json, content_markdown, original_link`
const snapshot = `json_array(${fields})`

export const editorialUpdate = z.object({
  source_url: z.string().url().max(2048).refine(url => /^https?:\/\//i.test(url)),
  category_id: z.number().int().positive(),
  addition: z.string().trim().min(1).max(42000)
}).strict()

export const editorialUpdateApproval = editorialUpdate.extend({
  snapshot: z.string().min(1).max(5000000),
  evaluated_content: z.string().min(1).max(1000000),
  decision: z.literal('recomendar_publicacao'),
  execution_id: z.string().trim().min(1).max(100),
  reason: z.string().trim().min(1).max(4000),
  blocking_issues: z.array(z.unknown()).length(0)
}).strict()

function sourceKey(url: string) {
  const parsed = new URL(url)
  parsed.hash = ''
  parsed.search = ''
  return parsed.href.replace(/\/$/, '')
}

async function findUpdate(db: D1Database, key: string) {
  return db.prepare('SELECT post_id FROM editorial_post_updates WHERE source_url = ?')
    .bind(key).first<{ post_id: number }>()
}

export async function findEditorialUpdate(db: D1Database, url: string) {
  if (!/^https?:\/\//i.test(url)) return null
  let key: string
  try {
    key = sourceKey(url)
  } catch {
    return null
  }
  return findUpdate(db, key)
}

export async function previewEditorialUpdate(db: D1Database, id: number, input: z.infer<typeof editorialUpdate>) {
  const key = sourceKey(input.source_url)
  const previous = await findUpdate(db, key)
  if (previous) return { status: previous.post_id === id ? 'already_applied' : 'conflict' } as const
  const current = await db.prepare(`
    SELECT id, title, excerpt, content, original_link, ${snapshot} AS snapshot
    FROM posts WHERE id = ? AND category_id = ? AND status = 'published'
  `).bind(id, input.category_id).first<{
    id: number; title: string; excerpt: string | null; content: string; original_link: string | null; snapshot: string
  }>()
  const addition = renderMarkdownToHtml(input.addition)
  if (!current || !addition.trim() || current.content.includes(addition.trim()) ||
      (current.original_link && /^https?:\/\//i.test(current.original_link) && sourceKey(current.original_link) === key)) {
    return { status: 'conflict' } as const
  }
  const sourceLink = input.source_url.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
  const content = current.content + '\n<h2>Atualização</h2>\n' + addition +
    `\n<p><a href="${sourceLink}" rel="noopener noreferrer">Fonte da atualização</a></p>`
  return { status: 'ready', current, content } as const
}

export async function applyEditorialUpdate(db: D1Database, id: number, input: z.infer<typeof editorialUpdateApproval>) {
  const preview = await previewEditorialUpdate(db, id, input)
  if (preview.status !== 'ready') return preview
  if (preview.current.snapshot !== input.snapshot || preview.content !== input.evaluated_content) {
    return { status: 'conflict' } as const
  }
  const now = new Date().toISOString()
  const key = sourceKey(input.source_url)
  const [, updated] = await db.batch([
    db.prepare(`
      INSERT INTO editorial_post_updates (source_url,post_id,previous_snapshot,execution_id,reason,applied_at)
      SELECT ?,id,?,?,?,? FROM posts
      WHERE id = ? AND status = 'published' AND ${snapshot} = ?
      ON CONFLICT(source_url) DO NOTHING
    `).bind(key, input.snapshot, input.execution_id, input.reason, now, id, input.snapshot),
    db.prepare(`
      UPDATE posts
      SET content = ?, content_format = 'legacy', content_json = NULL, content_markdown = NULL,
        content_version = content_version + 1, updated_at = ?
      WHERE id = ? AND changes() = 1
      RETURNING id, slug, content_version
    `).bind(preview.content, now, id),
    db.prepare(`
      INSERT INTO settings (key,value_json,scope,updated_at)
      SELECT ?,?,'private',? WHERE changes() = 1
      ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
    `).bind(HOME_CACHE_REVISION_SETTING, JSON.stringify(crypto.randomUUID()), now)
  ])
  if (updated.results?.[0]) return { status: 'updated', post: updated.results[0] } as const
  const previous = await findUpdate(db, key)
  return { status: previous?.post_id === id ? 'already_applied' : 'conflict' } as const
}
