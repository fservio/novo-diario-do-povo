import type { D1Database } from '@cloudflare/workers-types'
import { createPost, type CreatePostInput } from './posts'

function slugifyTitle(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Sequential delivery retries and duplicate syndication feeds must not create a second article for the same story. */
export async function createImportedPost(db: D1Database, input: CreatePostInput): Promise<{ id: number; reused: boolean }> {
  const originalLink = input.original_link?.trim()
  if (originalLink) {
    const existing = await db.prepare(`
      SELECT id FROM posts WHERE original_link = ? ORDER BY id ASC LIMIT 1
    `).bind(originalLink).first<{ id: number }>()
    if (existing) return { id: existing.id, reused: true }

    const candidateSlug = (input.slug?.trim() || slugifyTitle(input.title || '')).trim()
    const candidateTitle = (input.title || '').trim()
    if (candidateSlug || candidateTitle) {
      const recentDuplicate = await db.prepare(`
        SELECT id FROM posts
        WHERE (slug = ? OR lower(trim(title)) = lower(?))
          AND datetime(created_at) >= datetime('now', '-7 days')
        ORDER BY id ASC
        LIMIT 1
      `).bind(candidateSlug, candidateTitle).first<{ id: number }>()
      if (recentDuplicate) return { id: recentDuplicate.id, reused: true }
    }
  }
  const id = await createPost(db, { ...input, original_link: originalLink || undefined })
  return { id, reused: false }
}
