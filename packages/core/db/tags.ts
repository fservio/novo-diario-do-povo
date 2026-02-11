/**
 * Tags Repository
 * CRUD operations for tag management
 */

import type { Env, Tag } from '../types'
import { slugify } from './categories'

export interface CreateTagPayload {
    name: string
    slug?: string
    description?: string
    seo_noindex?: boolean
}

export interface UpdateTagPayload {
    name?: string
    slug?: string
    description?: string
    seo_noindex?: boolean
}

/**
 * Ensure slug is unique by adding suffix -2, -3, etc
 */
async function ensureUniqueSlug(db: D1Database, baseSlug: string, excludeId?: number): Promise<string> {
    let slug = baseSlug
    let suffix = 1

    while (true) {
        const query = excludeId
            ? 'SELECT id FROM tags WHERE slug = ? AND id != ? LIMIT 1'
            : 'SELECT id FROM tags WHERE slug = ? LIMIT 1'

        const params = excludeId ? [slug, excludeId] : [slug]
        const existing = await db.prepare(query).bind(...params).first()

        if (!existing) {
            return slug
        }

        suffix++
        slug = `${baseSlug}-${suffix}`
    }
}

/**
 * List all tags
 */
export async function listTags(env: Env): Promise<Tag[]> {
    const result = await env.DB.prepare(
        'SELECT * FROM tags ORDER BY name ASC'
    ).all<Tag>()
    return result.results || []
}

/**
 * Find tag by ID
 */
export async function findTagById(env: Env, id: number): Promise<Tag | null> {
    const result = await env.DB.prepare(
        'SELECT * FROM tags WHERE id = ? LIMIT 1'
    ).bind(id).first<Tag>()

    return result || null
}

/**
 * Create new tag
 */
export async function createTag(
    env: Env,
    payload: CreateTagPayload
): Promise<{ id: number }> {
    const {
        name,
        slug: inputSlug,
        description,
        seo_noindex = false
    } = payload

    const baseSlug = inputSlug || slugify(name)
    const uniqueSlug = await ensureUniqueSlug(env.DB, baseSlug)

    const result = await env.DB.prepare(`
    INSERT INTO tags (
      slug, name, description, seo_noindex,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
        uniqueSlug,
        name,
        description || null,
        seo_noindex ? 1 : 0
    ).run()

    return { id: Number(result.meta.last_row_id) }
}

/**
 * Update existing tag
 */
export async function updateTag(
    env: Env,
    id: number,
    payload: UpdateTagPayload
): Promise<void> {
    const tag = await findTagById(env, id)
    if (!tag) {
        throw new Error('Tag not found')
    }

    const updates: string[] = []
    const params: any[] = []

    if (payload.name !== undefined) {
        updates.push('name = ?')
        params.push(payload.name)
    }

    if (payload.slug !== undefined) {
        const uniqueSlug = await ensureUniqueSlug(env.DB, payload.slug, id)
        updates.push('slug = ?')
        params.push(uniqueSlug)
    }

    if (payload.description !== undefined) {
        updates.push('description = ?')
        params.push(payload.description || null)
    }

    if (payload.seo_noindex !== undefined) {
        updates.push('seo_noindex = ?')
        params.push(payload.seo_noindex ? 1 : 0)
    }

    if (updates.length === 0) {
        return
    }

    updates.push('updated_at = datetime(\'now\')')
    params.push(id)

    await env.DB.prepare(`
    UPDATE tags SET ${updates.join(', ')} WHERE id = ?
  `).bind(...params).run()
}

/**
 * Delete tag
 */
export async function deleteTag(env: Env, id: number): Promise<void> {
    // Check if tag is used in posts
    const postsCount = await env.DB.prepare(
        'SELECT COUNT(*) as count FROM post_tags WHERE tag_id = ?'
    ).bind(id).first<{ count: number }>()

    if (postsCount && postsCount.count > 0) {
        throw new Error('Não é possível excluir uma tag que está sendo usada em matérias')
    }

    await env.DB.prepare('DELETE FROM tags WHERE id = ?').bind(id).run()
}
