/**
 * Category Page Data Queries
 * Optimized for listing pages with pagination
 */

import type { Env } from '../types'

export interface Category {
  id: number
  slug: string
  name: string
  description: string | null
}

export interface CategoryPost {
  id: number
  slug: string
  title: string
  excerpt: string
  published_at: string
  featured_image_r2_key: string | null
  category_name: string
  category_slug: string
  hat: string | null
  author_name: string | null
}

export interface CategoryPageData {
  category: Category
  posts: CategoryPost[]
  page: number
  pageSize: number
  hasNextPage: boolean
}

/**
 * Find category by slug
 */
export async function findCategoryBySlug(env: Env, slug: string): Promise<Category | null> {
  const result = await env.DB.prepare(`
    SELECT id, slug, name, description
    FROM categories
    WHERE slug = ?
    LIMIT 1
  `).bind(slug).first<Category>()

  return result || null
}

/**
 * Find published posts by category with pagination
 */
export async function findPublishedPostsByCategory(
  env: Env,
  categoryId: number,
  category: Pick<Category, 'name' | 'slug'>,
  options: { limit: number; offset: number }
): Promise<CategoryPost[]> {
  const { limit, offset } = options
  const now = new Date().toISOString()

  const result = await env.DB.prepare(`
    SELECT 
      p.id, p.slug, p.title, p.hat, p.excerpt, p.published_at,
      m.r2_key as featured_image_r2_key,
      a.name as author_name
    FROM posts p
    LEFT JOIN media m ON p.cover_media_id = m.id
    LEFT JOIN authors a ON p.author_id = a.id
    WHERE p.category_id = ?
      AND p.status = 'published'
      AND p.published_at <= ?
      AND p.seo_noindex = 0
    ORDER BY p.published_at DESC
    LIMIT ? OFFSET ?
  `).bind(categoryId, now, limit, offset).all<CategoryPost>()

  return (result.results || []).map(post => ({
    ...post,
    category_name: category.name,
    category_slug: category.slug
  }))
}

/**
 * Get latest posts for "Agora" rail (optional)
 */
export async function findLatestPosts(env: Env, options: { limit: number }): Promise<CategoryPost[]> {
  const { limit } = options
  const now = new Date().toISOString()

  const result = await env.DB.prepare(`
    SELECT 
      p.id, p.slug, p.title, p.excerpt, p.published_at,
      m.r2_key as featured_image_r2_key,
      c.name as category_name,
      c.slug as category_slug
    FROM posts p
    JOIN categories c ON p.category_id = c.id
    LEFT JOIN media m ON p.cover_media_id = m.id
    WHERE p.status = 'published'
      AND p.published_at <= ?
      AND p.seo_noindex = 0
    ORDER BY p.published_at DESC
    LIMIT ?
  `).bind(now, limit).all<CategoryPost>()

  return result.results || []
}

/**
 * Get category page data with pagination
 */
export async function getCategoryPageData(
  env: Env,
  slug: string,
  page: number = 1,
  pageSize: number = 20
): Promise<CategoryPageData | null> {
  const validRequestedPage = Math.max(1, page)
  const normalizedPageSize = Math.min(Math.max(pageSize, 1), 30)
  const cacheKey = `category-page:v4:${slug}:${validRequestedPage}:${normalizedPageSize}`

  if (env.KV) {
    const cached = await env.KV.get(cacheKey)
    if (cached) {
      try {
        return JSON.parse(cached) as CategoryPageData
      } catch {
        await env.KV.delete(cacheKey).catch(() => {})
      }
    }
  }

  // Find category
  const category = await findCategoryBySlug(env, slug)
  if (!category) {
    return null
  }

  const offset = (validRequestedPage - 1) * normalizedPageSize

  // Fetch one extra row to know whether a next page exists without COUNT(*).
  const postsPlusOne = await findPublishedPostsByCategory(env, category.id, category, {
    limit: normalizedPageSize + 1,
    offset
  })

  const data = {
    category,
    posts: postsPlusOne.slice(0, normalizedPageSize),
    page: validRequestedPage,
    pageSize: normalizedPageSize,
    hasNextPage: postsPlusOne.length > normalizedPageSize
  }

  if (env.KV) {
    await env.KV.put(cacheKey, JSON.stringify(data), { expirationTtl: 300 }).catch(() => {})
  }

  return data
}
