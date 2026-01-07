/**
 * Home Page Data Queries
 * Otimizado para performance: queries em lote, evita N+1
 * CMS-driven: home.fixed_sections controla nav e seções
 */

import type { Env } from '../types'
import { z } from 'zod'

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
  sections: HomeSection[]  // Add sections to home data
}

export interface HomeSection {
  slug: string
  title: string
  enabled: boolean
  type: 'category' | 'tag'
  tagSlug?: string
}

// ============================================================================
// Home Sections (CMS-driven)
// ============================================================================

const homeSectionSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  enabled: z.boolean().default(true),
  type: z.enum(['category', 'tag']).default('category'),
  tagSlug: z.string().optional()
}).refine(
  data => data.type !== 'tag' || data.tagSlug,
  { message: 'tagSlug is required when type is "tag"' }
).transform(data => ({
  slug: data.slug,
  title: data.title,
  enabled: data.enabled,
  type: data.type,
  tagSlug: data.tagSlug
}))

const homeSectionsSchema = z.array(homeSectionSchema)

/**
 * Get home sections from CMS settings with fallback
 */
export async function getHomeSections(env: Env): Promise<HomeSection[]> {
  const { getSetting } = await import('./index')
  
  try {
    const raw = await getSetting(env, 'home.fixed_sections', 'public')
    
    if (!raw) {
      return getDefaultSections()
    }
    
    // Validate with Zod
    const parsed = homeSectionsSchema.safeParse(raw)
    
    if (!parsed.success) {
      console.warn('Invalid home.fixed_sections, using fallback:', parsed.error)
      return getDefaultSections()
    }
    
    return parsed.data
  } catch (error) {
    console.error('Error loading home.fixed_sections:', error)
    return getDefaultSections()
  }
}

/**
 * Deterministic fallback sections
 */
function getDefaultSections(): HomeSection[] {
  return [
    { slug: 'brasil', title: 'Brasil', enabled: true, type: 'category' },
    { slug: 'economia', title: 'Economia', enabled: true, type: 'category' },
    { slug: 'politica', title: 'Política', enabled: true, type: 'category' },
    { slug: 'cidades', title: 'Cidades', enabled: true, type: 'category' },
    { slug: 'esporte', title: 'Esporte', enabled: true, type: 'category' }
  ]
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

  // 4. Get home sections (CMS-driven)
  const sections = await getHomeSections(env)
  const enabledSections = sections.filter(s => s.enabled)
  
  // Separate category sections and tag sections
  const categorySections = enabledSections.filter(s => !s.type || s.type === 'category')
  const tagSections = enabledSections.filter(s => s.type === 'tag')
  
  // 5. Explainers: check if there's a tag section for explainers
  let explainersResult: { results: HomePost[] } = { results: [] }
  const explainersSection = tagSections.find(s => 
    s.slug === 'explicadores' || s.tagSlug === 'explicador'
  )
  
  if (explainersSection && explainersSection.tagSlug) {
    // Get posts by tag
    const tag = await env.DB.prepare(
      'SELECT id FROM tags WHERE slug = ? LIMIT 1'
    ).bind(explainersSection.tagSlug).first<{ id: number }>()
    
    if (tag) {
      explainersResult = await env.DB.prepare(`
        SELECT 
          p.id, p.slug, p.title, p.excerpt, p.published_at, 
          p.featured_image_r2_key,
          c.name as category_name, c.slug as category_slug
        FROM posts p
        INNER JOIN categories c ON p.category_id = c.id
        INNER JOIN post_tags pt ON pt.post_id = p.id
        WHERE p.status = 'published' 
          AND p.published_at <= ?
          AND p.seo_noindex = 0
          AND pt.tag_id = ?
        ORDER BY p.published_at DESC
        LIMIT 5
      `).bind(now, tag.id).all<HomePost>()
    }
  } else {
    // Fallback: use category 'explicador' for backward compatibility
    explainersResult = await env.DB.prepare(`
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
  }
  
  // 6. Category Blocks (dynamic based on sections)
  const categoryBlocks: CategoryBlock[] = []
  
  for (const section of categorySections) {
    try {
      // Get category info
      const category = await env.DB.prepare(
        'SELECT id, name, slug FROM categories WHERE slug = ? LIMIT 1'
      ).bind(section.slug).first<{ id: number; name: string; slug: string }>()
      
      if (!category) {
        console.warn(`Category not found for slug: ${section.slug}`)
        continue
      }
      
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
      `).bind(now, section.slug).all<HomePost>()
      
      const posts = postsResult.results || []
      if (posts.length > 0) {
        categoryBlocks.push({
          slug: section.slug,
          name: section.title,  // Use title from setting, not DB
          lead: posts[0],
          list: posts.slice(1)
        })
      }
    } catch (error) {
      console.error(`Error loading category block for ${section.slug}:`, error)
      // Continue with other sections
    }
  }

  // 7. Most Read (TODO: implement views tracking; fallback to latest for now)
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
    mostRead: mostReadResult.results || [],
    sections: enabledSections  // Include sections for nav rendering
  }
}
