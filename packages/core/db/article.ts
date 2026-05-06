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
  featured_image_width?: number | null
  featured_image_height?: number | null
  seo_title: string | null
  seo_description: string | null
  seo_noindex: number
  seo_canonical: string | null
  category_id: number
  category_name: string
  category_slug: string
  author_name?: string
  author_slug?: string
  author_bio?: string | null
  author_avatar_r2_key?: string | null
  author_type?: 'staff' | 'columnist' | 'editorial' | 'contributor'
  author_social_instagram?: string | null
  author_social_twitter?: string | null
  author_social_linkedin?: string | null
  author_email?: string | null
  column_name?: string | null
  column_description?: string | null
  is_premium: number
  paywall_tier?: 'hard' | 'metered' | 'free'
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
  author_type?: string
  author_avatar_r2_key?: string
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
      m.width as featured_image_width,
      m.height as featured_image_height,
      p.seo_title, p.seo_description, 
      p.seo_noindex, p.seo_canonical, p.is_premium, p.is_live, p.paywall_tier,
      c.id as category_id,
      c.name as category_name,
      c.slug as category_slug,
      a.name as author_name,
      a.slug as author_slug,
      a.bio as author_bio,
      a.author_type,
      a.social_instagram as author_social_instagram,
      a.social_twitter as author_social_twitter,
      a.social_linkedin as author_social_linkedin,
      a.email as author_email,
      a.column_name,
      a.column_description,
      ma.r2_key as author_avatar_r2_key
    FROM posts p
    JOIN categories c ON p.category_id = c.id
    LEFT JOIN authors a ON p.author_id = a.id
    LEFT JOIN media m ON p.cover_media_id = m.id
    LEFT JOIN media ma ON a.avatar_media_id = ma.id
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
      a.name as author_name,
      a.author_type,
      ma.r2_key as author_avatar_r2_key
    FROM posts p
    JOIN categories c ON p.category_id = c.id
    LEFT JOIN authors a ON p.author_id = a.id
    LEFT JOIN media m ON p.cover_media_id = m.id
    LEFT JOIN media ma ON a.avatar_media_id = ma.id
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
 * Estimate reading time (words / 200 wpm)
 */
export function estimateReadingTime(content: string): number {
  const words = content.split(/\s+/).length
  const minutes = Math.ceil(words / 200)
  return Math.max(1, minutes)
}
