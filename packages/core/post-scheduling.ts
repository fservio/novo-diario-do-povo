import type { D1Database } from '@cloudflare/workers-types'
import { HOME_CACHE_REVISION_SETTING } from './middleware/home-cache'

/** datetime-local values in the editorial UI always use Fortaleza (UTC-3). */
export function normalizePublicationSchedule(value: string, now = Date.now()): string {
  const input = value.trim()
  const local = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input)
  if (!local && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(input)) {
    throw new Error('Informe uma data e hora válidas.')
  }
  const date = new Date(local ? `${input}:00-03:00` : input)
  if (!Number.isFinite(date.getTime()) || (local && formatPublicationScheduleInput(date.toISOString()) !== input)) {
    throw new Error('Informe uma data e hora válidas.')
  }
  if (date.getTime() <= now) throw new Error('Escolha uma data e hora futuras, no horário de Fortaleza.')
  return date.toISOString()
}

export function formatPublicationScheduleInput(value?: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  return new Date(date.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 16)
}

/** A single D1 transaction publishes due drafts and switches the home cache revision. */
export async function publishDuePosts(db: D1Database, now = new Date().toISOString()): Promise<number> {
  const due = await db.prepare(`
    SELECT id FROM posts INDEXED BY idx_posts_scheduled_publication
    WHERE status = 'draft' AND scheduled_at IS NOT NULL AND scheduled_at <= ?
    ORDER BY scheduled_at, id LIMIT 100
  `).bind(now).all<{ id: number }>()
  const { publicationLinksRequired, hasPublicationLink } = await import('./seo/internal-links')
  const ids = []
  const required = Boolean(due.results?.length) && await publicationLinksRequired(db)
  for (const post of due.results || []) {
    if (!required || await hasPublicationLink(db, post.id)) ids.push(post.id)
  }
  if (!ids.length) return 0
  const placeholders = ids.map(() => '?').join(', ')
  const results = await db.batch([
    db.prepare(`
      UPDATE posts SET status = 'published', published_at = scheduled_at, scheduled_at = NULL, updated_at = ?
      WHERE status = 'draft' AND scheduled_at IS NOT NULL AND scheduled_at <= ? AND id IN (${placeholders})
      RETURNING id
    `).bind(now, now, ...ids),
    db.prepare(`
      INSERT INTO settings (key, value_json, scope, updated_at) VALUES (?, ?, 'private', ?)
      ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
    `).bind(HOME_CACHE_REVISION_SETTING, JSON.stringify(crypto.randomUUID()), now)
  ])
  const count = results[0]?.meta.changes || 0
  if (count) console.log('[Post scheduler] Published', { count, postIds: results[0]?.results })
  return count
}
