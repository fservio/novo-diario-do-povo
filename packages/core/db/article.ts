/**
 * Article Page Data Queries
 * Extended from existing post queries with relations
 */

import type { Env } from '../types'

export interface ArticlePost {
  id: number
  slug: string
  title: string
  excerpt: string | null
  content: string
  published_at: string
  featured_image_r2_key: string | null
  seo_noindex: number
  seo_canonical: string | null
  category_id: number
  category_name: string
  category_slug: string
  author_name?: string
  is_premium: number
}

export interface RelatedPost {
  id: number
  slug: string
  title: string
  published_at: string
}

/**
 * Find post by slug with all relations
 */
export async function findArticleBySlug(env: Env, slug: string): Promise<ArticlePost | null> {
  const result = await env.DB.prepare(`
    SELECT 
      p.id, p.slug, p.title, p.excerpt, p.content, p.published_at,
      p.featured_image_r2_key, p.seo_noindex, p.seo_canonical, p.is_premium,
      c.id as category_id,
      c.name as category_name,
      c.slug as category_slug,
      u.name as author_name
    FROM posts p
    JOIN categories c ON p.category_id = c.id
    LEFT JOIN users u ON p.author_id = u.id
    WHERE p.slug = ? AND p.status = 'published'
    LIMIT 1
  `).bind(slug).first<ArticlePost>()
  
  return result || null
}

/**
 * Find related posts by category
 */
export async function findRelatedPosts(
  env: Env,
  postId: number,
  categoryId: number,
  options: { limit: number }
): Promise<RelatedPost[]> {
  const { limit } = options
  const now = new Date().toISOString()
  
  const result = await env.DB.prepare(`
    SELECT id, slug, title, published_at
    FROM posts
    WHERE category_id = ?
      AND id != ?
      AND status = 'published'
      AND published_at <= ?
      AND seo_noindex = 0
    ORDER BY published_at DESC
    LIMIT ?
  `).bind(categoryId, postId, now, limit).all<RelatedPost>()
  
  return result.results || []
}

/**
 * Find most read posts (fallback to latest if views tracking not available)
 */
export async function findMostRead(env: Env, options: { limit: number; days?: number }): Promise<RelatedPost[]> {
  const { limit } = options
  const now = new Date().toISOString()
  
  // TODO: Implement views tracking
  // For now, fallback to latest published
  const result = await env.DB.prepare(`
    SELECT id, slug, title, published_at
    FROM posts
    WHERE status = 'published'
      AND published_at <= ?
      AND seo_noindex = 0
    ORDER BY published_at DESC
    LIMIT ?
  `).bind(now, limit).all<RelatedPost>()
  
  return result.results || []
}

/**
 * Estimate reading time (words / 200 wpm)
 */
export function estimateReadingTime(content: string): number {
  const words = content.split(/\s+/).length
  const minutes = Math.ceil(words / 200)
  return Math.max(1, minutes)
}
