/**
 * Home Page Data Queries
 * Otimizado para performance: queries em lote, evita N+1
 */

import type { Env } from '../types'

// ============================================================================
// Types
// ============================================================================

export interface HomePost {
  id: number
  slug: string
  title: string
  excerpt: string
  published_at: string
  featured_image_r2_key: string | null
  category_name: string
  category_slug: string
}

export interface CategoryBlock {
  slug: string
  name: string
  lead: HomePost
  list: HomePost[]
}

export interface HomeData {
  hero: HomePost | null
  dualFeatures: HomePost[]
  hotRail: HomePost[]
  explainers: HomePost[]
  categoryBlocks: CategoryBlock[]
  mostRead: HomePost[]
}

// ============================================================================
// Main Query
// ============================================================================

export async function getHomeData(env: Env): Promise<HomeData> {
  const now = new Date().toISOString()
  
  // 1. Hero: latest published post (not in categoria "explicador")
  const heroResult = await env.DB.prepare(`
    SELECT 
      p.id, p.slug, p.title, p.excerpt, p.published_at, 
      p.featured_image_r2_key,
      c.name as category_name, c.slug as category_slug
    FROM posts p
    INNER JOIN categories c ON p.category_id = c.id
    WHERE p.status = 'published' 
      AND p.published_at <= ?
      AND p.seo_noindex = 0
      AND c.slug != 'explicador'
    ORDER BY p.published_at DESC
    LIMIT 1
  `).bind(now).first<HomePost>()

  // 2. Dual Features: next 2 posts (skip hero)
  const dualFeaturesResult = await env.DB.prepare(`
    SELECT 
      p.id, p.slug, p.title, p.excerpt, p.published_at, 
      p.featured_image_r2_key,
      c.name as category_name, c.slug as category_slug
    FROM posts p
    INNER JOIN categories c ON p.category_id = c.id
    WHERE p.status = 'published' 
      AND p.published_at <= ?
      AND p.seo_noindex = 0
      AND c.slug != 'explicador'
      AND p.id != ?
    ORDER BY p.published_at DESC
    LIMIT 2
  `).bind(now, heroResult?.id || 0).all<HomePost>()

  // 3. Hot Rail: latest 10 posts (text-only, with time)
  const hotRailResult = await env.DB.prepare(`
    SELECT 
      p.id, p.slug, p.title, p.published_at,
      c.name as category_name, c.slug as category_slug
    FROM posts p
    INNER JOIN categories c ON p.category_id = c.id
    WHERE p.status = 'published' 
      AND p.published_at <= ?
      AND p.seo_noindex = 0
    ORDER BY p.published_at DESC
    LIMIT 10
  `).bind(now).all<HomePost>()

  // 4. Explainers: posts with tag "explicador" or category "explicador"
  const explainersResult = await env.DB.prepare(`
    SELECT 
      p.id, p.slug, p.title, p.excerpt, p.published_at, 
      p.featured_image_r2_key,
      c.name as category_name, c.slug as category_slug
    FROM posts p
    INNER JOIN categories c ON p.category_id = c.id
    WHERE p.status = 'published' 
      AND p.published_at <= ?
      AND p.seo_noindex = 0
      AND c.slug = 'explicador'
    ORDER BY p.published_at DESC
    LIMIT 5
  `).bind(now).all<HomePost>()

  // 5. Category Blocks (fixed order: brasil, economia, politica, cidades, esporte)
  const categoryBlocks: CategoryBlock[] = []
  const categorySlugs = ['brasil', 'economia', 'politica', 'cidades', 'esporte']
  
  for (const slug of categorySlugs) {
    // Get category info
    const category = await env.DB.prepare(
      'SELECT id, name, slug FROM categories WHERE slug = ? LIMIT 1'
    ).bind(slug).first<{ id: number; name: string; slug: string }>()
    
    if (!category) continue
    
    // Get posts for this category (1 lead + 5 list)
    const postsResult = await env.DB.prepare(`
      SELECT 
        p.id, p.slug, p.title, p.excerpt, p.published_at, 
        p.featured_image_r2_key,
        c.name as category_name, c.slug as category_slug
      FROM posts p
      INNER JOIN categories c ON p.category_id = c.id
      WHERE p.status = 'published' 
        AND p.published_at <= ?
        AND p.seo_noindex = 0
        AND c.slug = ?
      ORDER BY p.published_at DESC
      LIMIT 6
    `).bind(now, slug).all<HomePost>()
    
    const posts = postsResult.results || []
    if (posts.length > 0) {
      categoryBlocks.push({
        slug: category.slug,
        name: category.name,
        lead: posts[0],
        list: posts.slice(1)
      })
    }
  }

  // 6. Most Read (TODO: implement views tracking; fallback to latest for now)
  // Preferir: SELECT post_id, COUNT(*) FROM paywall_views WHERE created_at >= date('now', '-7 days') GROUP BY post_id ORDER BY COUNT(*) DESC
  // Fallback atual: latest published
  const mostReadResult = await env.DB.prepare(`
    SELECT 
      p.id, p.slug, p.title, p.published_at,
      c.name as category_name, c.slug as category_slug
    FROM posts p
    INNER JOIN categories c ON p.category_id = c.id
    WHERE p.status = 'published' 
      AND p.published_at <= ?
      AND p.seo_noindex = 0
    ORDER BY p.published_at DESC
    LIMIT 10
  `).bind(now).all<HomePost>()

  return {
    hero: heroResult || null,
    dualFeatures: dualFeaturesResult.results || [],
    hotRail: hotRailResult.results || [],
    explainers: explainersResult.results || [],
    categoryBlocks,
    mostRead: mostReadResult.results || []
  }
}
