/**
 * Categories Repository
 * CRUD operations for category management
 */

import type { Env } from '../types'

export interface Category {
  id: number
  slug: string
  name: string
  description: string | null
  parent_id: number | null
  seo_title: string | null
  seo_description: string | null
  is_active: number
  display_order: number
  created_at: string
  updated_at: string
}

export interface CreateCategoryPayload {
  name: string
  slug?: string
  description?: string
  parent_id?: number
  seo_title?: string
  seo_description?: string
  display_order?: number
  is_active?: boolean
}

export interface UpdateCategoryPayload {
  name?: string
  slug?: string
  description?: string
  parent_id?: number
  seo_title?: string
  seo_description?: string
  display_order?: number
  is_active?: boolean
}

export interface ListCategoriesFilters {
  includeInactive?: boolean
  parent_id?: number | null
}

/**
 * Slugify a string for URL use
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Ensure slug is unique by adding suffix -2, -3, etc
 */
async function ensureUniqueSlug(db: D1Database, baseSlug: string, excludeId?: number): Promise<string> {
  let slug = baseSlug
  let suffix = 1

  while (true) {
    const query = excludeId
      ? 'SELECT id FROM categories WHERE slug = ? AND id != ? LIMIT 1'
      : 'SELECT id FROM categories WHERE slug = ? LIMIT 1'
    
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
 * List all categories with optional filters
 */
export async function listCategories(
  env: Env,
  filters: ListCategoriesFilters = {}
): Promise<Category[]> {
  const { includeInactive = false, parent_id } = filters

  let query = 'SELECT * FROM categories WHERE 1=1'
  const params: any[] = []

  if (!includeInactive) {
    query += ' AND is_active = 1'
  }

  if (parent_id !== undefined) {
    if (parent_id === null) {
      query += ' AND parent_id IS NULL'
    } else {
      query += ' AND parent_id = ?'
      params.push(parent_id)
    }
  }

  query += ' ORDER BY display_order ASC, name ASC'

  const stmt = params.length > 0 
    ? env.DB.prepare(query).bind(...params)
    : env.DB.prepare(query)

  const result = await stmt.all<Category>()
  return result.results || []
}

/**
 * Find category by ID
 */
export async function findCategoryById(env: Env, id: number): Promise<Category | null> {
  const result = await env.DB.prepare(
    'SELECT * FROM categories WHERE id = ? LIMIT 1'
  ).bind(id).first<Category>()

  return result || null
}

/**
 * Find category by slug
 */
export async function findCategoryBySlug(env: Env, slug: string): Promise<Category | null> {
  const result = await env.DB.prepare(
    'SELECT * FROM categories WHERE slug = ? LIMIT 1'
  ).bind(slug).first<Category>()

  return result || null
}

/**
 * Create new category
 */
export async function createCategory(
  env: Env,
  payload: CreateCategoryPayload,
  createdBy: number
): Promise<{ id: number }> {
  const {
    name,
    slug: inputSlug,
    description,
    parent_id,
    seo_title,
    seo_description,
    display_order = 0,
    is_active = true
  } = payload

  // Generate slug if not provided
  const baseSlug = inputSlug || slugify(name)
  const uniqueSlug = await ensureUniqueSlug(env.DB, baseSlug)

  const result = await env.DB.prepare(`
    INSERT INTO categories (
      slug, name, description, parent_id, 
      seo_title, seo_description, 
      is_active, display_order,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    uniqueSlug,
    name,
    description || null,
    parent_id || null,
    seo_title || null,
    seo_description || null,
    is_active ? 1 : 0,
    display_order
  ).run()

  console.log('[Categories] Created', {
    id: result.meta.last_row_id,
    slug: uniqueSlug,
    name,
    createdBy
  })

  return { id: Number(result.meta.last_row_id) }
}

/**
 * Update existing category
 */
export async function updateCategory(
  env: Env,
  id: number,
  payload: UpdateCategoryPayload,
  updatedBy: number
): Promise<void> {
  const category = await findCategoryById(env, id)
  if (!category) {
    throw new Error('Category not found')
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

  if (payload.parent_id !== undefined) {
    updates.push('parent_id = ?')
    params.push(payload.parent_id || null)
  }

  if (payload.seo_title !== undefined) {
    updates.push('seo_title = ?')
    params.push(payload.seo_title || null)
  }

  if (payload.seo_description !== undefined) {
    updates.push('seo_description = ?')
    params.push(payload.seo_description || null)
  }

  if (payload.display_order !== undefined) {
    updates.push('display_order = ?')
    params.push(payload.display_order)
  }

  if (payload.is_active !== undefined) {
    updates.push('is_active = ?')
    params.push(payload.is_active ? 1 : 0)
  }

  if (updates.length === 0) {
    return
  }

  updates.push('updated_at = datetime(\'now\')')
  params.push(id)

  await env.DB.prepare(`
    UPDATE categories SET ${updates.join(', ')} WHERE id = ?
  `).bind(...params).run()

  console.log('[Categories] Updated', {
    id,
    fields: updates.length - 1,
    updatedBy
  })
}

/**
 * Toggle category active status
 */
export async function toggleCategory(env: Env, id: number): Promise<boolean> {
  const category = await findCategoryById(env, id)
  if (!category) {
    throw new Error('Category not found')
  }

  const newStatus = category.is_active === 1 ? 0 : 1

  await env.DB.prepare(`
    UPDATE categories 
    SET is_active = ?, updated_at = datetime('now')
    WHERE id = ?
  `).bind(newStatus, id).run()

  console.log('[Categories] Toggled', {
    id,
    oldStatus: category.is_active,
    newStatus
  })

  return newStatus === 1
}

/**
 * Delete category (soft delete by marking inactive)
 */
export async function deleteCategory(env: Env, id: number): Promise<void> {
  // Check if category has posts
  const postsCount = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM posts WHERE category_id = ?'
  ).bind(id).first<{ count: number }>()

  if (postsCount && postsCount.count > 0) {
    throw new Error('Cannot delete category with existing posts')
  }

  // Soft delete
  await env.DB.prepare(`
    UPDATE categories 
    SET is_active = 0, updated_at = datetime('now')
    WHERE id = ?
  `).bind(id).run()

  console.log('[Categories] Deleted (soft)', { id })
}
