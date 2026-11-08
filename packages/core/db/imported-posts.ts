import type { D1Database } from '@cloudflare/workers-types'
import { createPost, type CreatePostInput } from './posts'

/** Sequential delivery retries must not create a second article for the same source. */
export async function createImportedPost(db: D1Database, input: CreatePostInput): Promise<{ id: number; reused: boolean }> {
  const originalLink = input.original_link?.trim()
  if (originalLink) {
    const existing = await db.prepare(`
      SELECT id FROM posts WHERE original_link = ? ORDER BY id ASC LIMIT 1
    `).bind(originalLink).first<{ id: number }>()
    if (existing) return { id: existing.id, reused: true }
  }
  const id = await createPost(db, { ...input, original_link: originalLink || undefined })
  return { id, reused: false }
}
