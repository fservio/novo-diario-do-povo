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
  updated_at: string
  featured_image_r2_key: string | null
  featured_image_credits: string | null
  featured_image_alt: string | null
  featured_image_width?: number | null
  featured_image_height?: number | null
  featured_image_mime_type?: string | null
  seo_title: string | null
  seo_description: string | null
  seo_noindex: number
  seo_canonical: string | null
  social_title: string | null
  social_description: string | null
  social_share_text: string | null
  social_image_r2_key: string | null
  social_image_mime_type: string | null
  social_image_width: number | null
  social_image_height: number | null
  social_image_position_x: number
  social_image_position_y: number
  category_id: number
  category_name: string
  category_slug: string
  author_name?: string
  author_slug?: string
  author_bio?: string | null
  author_avatar_r2_key?: string | null
  author_type?: 'staff' | 'columnist' | 'editorial' | 'contributor'
  opinion_type?: 'news' | 'editorial' | 'article' | 'column'
  opinion_featured?: number
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
  reading_path?: 'next' | 'origin' | null
  excerpt?: string | null
}

/**
 * Find post by slug with all relations
 */
export async function findArticleBySlug(env: Env, slug: string): Promise<ArticlePost | null> {
  const result = await env.DB.prepare(`
    SELECT 
      p.id, p.slug, p.title, p.hat, p.excerpt, p.content, p.content_markdown, p.published_at, p.updated_at,
      p.template, p.opinion_type, p.opinion_featured,
      m.r2_key as featured_image_r2_key,
      m.credits as featured_image_credits,
      m.alt as featured_image_alt,
      m.width as featured_image_width,
      m.height as featured_image_height,
      m.mime_type as featured_image_mime_type,
      p.seo_title, p.seo_description, 
      p.seo_noindex, p.seo_canonical, p.is_premium, p.is_live, p.paywall_tier,
      p.social_title, p.social_description, p.social_share_text,
      p.social_image_position_x, p.social_image_position_y,
      ms.r2_key as social_image_r2_key,
      ms.mime_type as social_image_mime_type,
      ms.width as social_image_width,
      ms.height as social_image_height,
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
    LEFT JOIN media ms ON p.social_image_media_id = ms.id
    LEFT JOIN media ma ON a.avatar_media_id = ma.id
    WHERE p.slug = ? AND p.status = 'published'
    LIMIT 1
  `).bind(slug).first<ArticlePost>()

  return result || null
}

/**
 * Prioritize explicit links, then fill from the category's last 24 hours.
 * Limit both candidate sets before joining metadata or sorting them together.
 */
export async function findRelatedPosts(
  env: Env,
  postId: number,
  categoryId: number,
  options: { limit: number }
): Promise<RelatedPost[]> {
  const { limit } = options
  const now = new Date().toISOString()
  // A space lower bound includes both SQLite and ISO timestamps in the index.
  // julianday then enforces the exact interval without excluding either format.
  const since = new Date(Date.parse(now) - 24 * 60 * 60 * 1000).toISOString()
  const indexSince = since.replace('T', ' ').slice(0, 19)

  const result = await env.DB.prepare(`
    WITH related_ids AS (
      SELECT related_post_id AS id FROM post_related_articles WHERE post_id = ?2
      UNION
      SELECT post_id AS id FROM post_related_articles WHERE related_post_id = ?2
    ), explicit AS MATERIALIZED (
      SELECT p.id, p.published_at, 0 AS priority
      FROM related_ids r CROSS JOIN posts p ON p.id = r.id
      WHERE p.id != ?2 AND p.status = 'published'
        AND p.published_at >= ?6 AND p.published_at <= ?3 AND p.seo_noindex = 0
        AND julianday(p.published_at) BETWEEN julianday(?5) AND julianday(?3)
      ORDER BY julianday(p.published_at) DESC
      LIMIT ?4
    ), category_latest AS MATERIALIZED (
      SELECT p.id, p.published_at, 1 AS priority
      FROM posts p
      WHERE p.category_id = ?1 AND p.id != ?2
        AND p.status = 'published' AND p.seo_noindex = 0
        AND p.published_at >= ?6 AND p.published_at <= ?3
        AND julianday(p.published_at) BETWEEN julianday(?5) AND julianday(?3)
        AND p.id NOT IN (SELECT id FROM explicit)
      ORDER BY julianday(p.published_at) DESC
      LIMIT ?4
    ), candidates AS (
      SELECT * FROM explicit
      UNION ALL
      SELECT * FROM category_latest
    ), selected AS MATERIALIZED (
      SELECT * FROM candidates
      ORDER BY priority, julianday(published_at) DESC
      LIMIT ?4
    )
    SELECT 
      p.id, p.slug, p.title, p.published_at, p.hat, p.excerpt,
      CASE
        WHEN p.original_link LIKE '%/ia/relacionada/v1/' || CAST(?2 AS INTEGER) THEN 'next'
        WHEN (SELECT original_link FROM posts WHERE id=?2) LIKE '%/ia/relacionada/v1/' || p.id THEN 'origin'
        ELSE NULL
      END AS reading_path,
      c.name as category_name,
      m.r2_key as featured_image_r2_key,
      a.name as author_name,
      a.author_type,
      ma.r2_key as author_avatar_r2_key
    FROM selected s CROSS JOIN posts p ON p.id = s.id
    JOIN categories c ON p.category_id = c.id
    LEFT JOIN authors a ON p.author_id = a.id
    LEFT JOIN media m ON p.cover_media_id = m.id
    LEFT JOIN media ma ON a.avatar_media_id = ma.id
    ORDER BY s.priority, julianday(s.published_at) DESC
  `).bind(categoryId, postId, now, limit, since, indexSince).all<RelatedPost>()

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
