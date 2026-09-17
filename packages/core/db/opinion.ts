import type { Env } from '../types'

export type OpinionType = 'editorial' | 'article' | 'column'

export interface OpinionPost {
  id: number
  slug: string
  title: string
  hat: string | null
  excerpt: string | null
  published_at: string
  opinion_type: OpinionType
  opinion_featured: number
  author_id: number
  author_name: string | null
  author_slug: string | null
  author_bio: string | null
  author_avatar_r2_key: string | null
  column_name: string | null
  featured_image_r2_key: string | null
}

export interface OpinionColumnist {
  id: number
  slug: string
  name: string
  bio: string | null
  column_name: string | null
  column_description: string | null
  avatar_r2_key: string | null
  latest_post_slug: string | null
  latest_post_title: string | null
  latest_post_published_at: string | null
}

export async function listPublishedOpinionPosts(env: Env, limit = 36): Promise<OpinionPost[]> {
  const result = await env.DB.prepare(`
    SELECT
      p.id, p.slug, p.title, p.hat, p.excerpt, p.published_at,
      p.opinion_type, p.opinion_featured, p.author_id,
      a.name AS author_name, a.slug AS author_slug, a.bio AS author_bio,
      a.column_name,
      ma.r2_key AS author_avatar_r2_key,
      mc.r2_key AS featured_image_r2_key
    FROM posts p
    LEFT JOIN authors a ON a.id = p.author_id
    LEFT JOIN media ma ON ma.id = a.avatar_media_id
    LEFT JOIN media mc ON mc.id = p.cover_media_id
    WHERE p.status = 'published'
      AND p.published_at <= datetime('now')
      AND p.seo_noindex = 0
      AND p.opinion_type IN ('editorial', 'article', 'column')
    ORDER BY p.opinion_featured DESC, p.published_at DESC
    LIMIT ?
  `).bind(Math.max(1, Math.min(60, limit))).all<OpinionPost>()

  return result.results || []
}

export async function listOpinionColumnists(env: Env): Promise<OpinionColumnist[]> {
  const result = await env.DB.prepare(`
    WITH ranked_columns AS (
      SELECT
        p.author_id, p.slug, p.title, p.published_at,
        ROW_NUMBER() OVER (PARTITION BY p.author_id ORDER BY p.published_at DESC) AS row_number
      FROM posts p
      WHERE p.status = 'published'
        AND p.published_at <= datetime('now')
        AND p.seo_noindex = 0
        AND p.opinion_type = 'column'
    )
    SELECT
      a.id, a.slug, a.name, a.bio, a.column_name, a.column_description,
      m.r2_key AS avatar_r2_key,
      latest.slug AS latest_post_slug,
      latest.title AS latest_post_title,
      latest.published_at AS latest_post_published_at
    FROM authors a
    LEFT JOIN media m ON m.id = a.avatar_media_id
    LEFT JOIN ranked_columns latest ON latest.author_id = a.id AND latest.row_number = 1
    WHERE a.is_active = 1
      AND (a.author_type = 'columnist' OR a.is_columnist = 1)
    ORDER BY
      CASE WHEN latest.published_at IS NULL THEN 1 ELSE 0 END,
      latest.published_at DESC,
      a.name ASC
  `).all<OpinionColumnist>()

  return result.results || []
}
