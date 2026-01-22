/**
 * Article Page Data Queries
 * Extended from existing post queries with relations
 */

import type { Env } from '../types'

export interface ArticlePost {
  id: number
  slug: string
  title: string
  hat: string | null
  excerpt: string | null
  content: string
  content_markdown: string | null
  published_at: string
  featured_image_r2_key: string | null
  featured_image_credits: string | null
  featured_image_alt: string | null
  seo_title: string | null
  seo_description: string | null
  seo_noindex: number
  seo_canonical: string | null
  category_id: number
  category_name: string
  category_slug: string
  author_name?: string
  is_premium: number
  template?: string
  is_live: number
}

export interface RelatedPost {
  id: number
  slug: string
  title: string
  published_at: string
  category_name?: string
  hat?: string
  featured_image_r2_key?: string
  author_name?: string
}

/**
 * Find post by slug with all relations
 */
export async function findArticleBySlug(env: Env, slug: string): Promise<ArticlePost | null> {
  const result = await env.DB.prepare(`
    SELECT 
      p.id, p.slug, p.title, p.hat, p.excerpt, p.content, p.content_markdown, p.published_at,
      p.template,
      m.r2_key as featured_image_r2_key,
      m.credits as featured_image_credits,
      m.alt as featured_image_alt,
      p.seo_title, p.seo_description, 
      p.seo_noindex, p.seo_canonical, p.is_premium, p.is_live,
      c.id as category_id,
      c.name as category_name,
      c.slug as category_slug,
      u.name as author_name
    FROM posts p
    JOIN categories c ON p.category_id = c.id
    LEFT JOIN users u ON p.author_id = u.id
    LEFT JOIN media m ON p.cover_media_id = m.id
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
    SELECT 
      p.id, p.slug, p.title, p.published_at, p.hat,
      c.name as category_name,
      m.r2_key as featured_image_r2_key,
      u.name as author_name
    FROM posts p
    JOIN categories c ON p.category_id = c.id
    LEFT JOIN users u ON p.author_id = u.id
    LEFT JOIN media m ON p.cover_media_id = m.id
    WHERE p.category_id = ?
      AND p.id != ?
      AND p.status = 'published'
      AND p.published_at <= ?
      AND p.seo_noindex = 0
    ORDER BY p.published_at DESC
    LIMIT ?
  `).bind(categoryId, postId, now, limit).all<RelatedPost>()

  return result.results || []
}

/**
 * Increment post views
 */
export async function incrementPostViews(env: Env, postId: number): Promise<void> {
  // Fire and forget insert to avoid blocking
  // In a real high-scale app, this would go to a queue or aggregation table
  try {
    await env.DB.prepare('INSERT INTO post_views (post_id) VALUES (?)').bind(postId).run()
  } catch (error) {
    console.warn('Failed to track view for post', postId, error)
  }
}

/**
 * Find most read posts (based on last 7 days views)
 */
export async function findMostRead(env: Env, options: { limit: number; days?: number }): Promise<RelatedPost[]> {
  const { limit, days = 7 } = options

  // Query: Posts with most views in the last X days
  const result = await env.DB.prepare(`
    SELECT 
      p.id, p.slug, p.title, p.published_at, p.hat,
      COUNT(v.id) as views_count,
      c.name as category_name,
      m.r2_key as featured_image_r2_key,
      u.name as author_name
    FROM posts p
    JOIN categories c ON p.category_id = c.id
    LEFT JOIN users u ON p.author_id = u.id
    LEFT JOIN media m ON p.cover_media_id = m.id
    LEFT JOIN post_views v ON p.id = v.post_id
    WHERE p.status = 'published'
      AND p.seo_noindex = 0
      AND v.created_at >= datetime('now', '-' || ? || ' days')
    GROUP BY p.id
    ORDER BY views_count DESC, p.published_at DESC
    LIMIT ?
  `).bind(days, limit).all<RelatedPost>()

  // Fallback if no views data found yet (empty result or low counts), fill with latest
  if (!result.results || result.results.length < limit) {
    const existingIds = (result.results || []).map(p => p.id)
    const needed = limit - existingIds.length

    if (needed > 0) {
      const fallback = await env.DB.prepare(`
        SELECT 
          p.id, p.slug, p.title, p.published_at, p.hat,
          c.name as category_name,
          m.r2_key as featured_image_r2_key,
          u.name as author_name
        FROM posts p
        JOIN categories c ON p.category_id = c.id
        LEFT JOIN users u ON p.author_id = u.id
        LEFT JOIN media m ON p.cover_media_id = m.id
        WHERE p.status = 'published'
          AND p.seo_noindex = 0
          AND p.id NOT IN (${existingIds.length ? existingIds.join(',') : '0'})
        ORDER BY p.published_at DESC
        LIMIT ?
      `).bind(needed).all<RelatedPost>()

      return [...(result.results || []), ...(fallback.results || [])]
    }
  }

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
