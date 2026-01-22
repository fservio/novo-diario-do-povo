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
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
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
 * Count published posts in category
 */
export async function countPublishedPostsByCategory(env: Env, categoryId: number): Promise<number> {
  const now = new Date().toISOString()

  const result = await env.DB.prepare(`
    SELECT COUNT(*) as count
    FROM posts
    WHERE category_id = ?
      AND status = 'published'
      AND published_at <= ?
      AND seo_noindex = 0
  `).bind(categoryId, now).first<{ count: number }>()

  return result?.count || 0
}

/**
 * Find published posts by category with pagination
 */
export async function findPublishedPostsByCategory(
  env: Env,
  categoryId: number,
  options: { limit: number; offset: number }
): Promise<CategoryPost[]> {
  const { limit, offset } = options
  const now = new Date().toISOString()

  const result = await env.DB.prepare(`
    SELECT 
      p.id, p.slug, p.title, p.hat, p.excerpt, p.published_at,
      m.r2_key as featured_image_r2_key,
      c.name as category_name,
      c.slug as category_slug,
      u.name as author_name
    FROM posts p
    JOIN categories c ON p.category_id = c.id
    LEFT JOIN users u ON p.author_id = u.id
    LEFT JOIN media m ON p.cover_media_id = m.id
    WHERE p.category_id = ?
      AND p.status = 'published'
      AND p.published_at <= ?
      AND p.seo_noindex = 0
    ORDER BY p.published_at DESC
    LIMIT ? OFFSET ?
  `).bind(categoryId, now, limit, offset).all<CategoryPost>()

  return result.results || []
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
  // Find category
  const category = await findCategoryBySlug(env, slug)
  if (!category) {
    return null
  }

  // Count total posts
  const totalCount = await countPublishedPostsByCategory(env, category.id)
  const totalPages = Math.ceil(totalCount / pageSize)

  // Validate page number
  const validPage = Math.max(1, Math.min(page, totalPages || 1))
  const offset = (validPage - 1) * pageSize

  // Get posts for current page
  const posts = await findPublishedPostsByCategory(env, category.id, {
    limit: pageSize,
    offset
  })

  return {
    category,
    posts,
    totalCount,
    page: validPage,
    pageSize,
    totalPages
  }
}
