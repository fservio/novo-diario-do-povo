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
  hat?: string | null
  published_at: string
  featured_image_r2_key: string | null
  category_name: string
  category_slug: string
  author_name: string
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
  mostRead: any[] // Legacy: keeping as empty array for template compatibility
  topColumns: HomePost[]
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
    { slug: 'noticias-do-brasil', title: 'Brasil', enabled: true, type: 'category' },
    { slug: 'noticias-de-economia', title: 'Economia', enabled: true, type: 'category' },
    { slug: 'politica', title: 'Política', enabled: true, type: 'category' },
    { slug: 'ultimas-noticias-cidade', title: 'Cidades', enabled: true, type: 'category' },
    { slug: 'esporte', title: 'Esporte', enabled: true, type: 'category' }
  ]
}

// ============================================================================
// Main Query
// ============================================================================

export async function getHomeData(env: Env): Promise<HomeData> {
  // 1. Try Cache (in prod/staging)
  if (env.CF_ENV !== 'dev' && env.CACHE) {
    try {
      const cached = await env.CACHE.get<HomeData>('home_data_v3', 'json')
      if (cached) return cached
    } catch (e) {
      console.error('Cache read error:', e)
    }
  }

  const now = new Date().toISOString()

  // 2. Parallel First Phase: Hero, Sections, TopColumns
  const heroPromise = env.DB.prepare(`
    SELECT 
      p.id, p.slug, p.title, p.hat, p.excerpt, p.published_at, 
      m.r2_key as featured_image_r2_key,
      c.name as category_name, c.slug as category_slug,
      a.name as author_name
    FROM posts p
    INNER JOIN categories c ON p.category_id = c.id
    INNER JOIN authors a ON p.author_id = a.id
    LEFT JOIN media m ON p.cover_media_id = m.id
    WHERE p.status = 'published' 
      AND p.published_at <= ?
      AND p.seo_noindex = 0
      AND c.slug != 'explicador'
    ORDER BY p.is_headline DESC, p.published_at DESC
    LIMIT 1
  `).bind(now).first<HomePost>()

  const sectionsPromise = getHomeSections(env)

  const topColumnsPromise = env.DB.prepare(`
    SELECT * FROM (
      SELECT 
        p.id, p.slug, p.title, p.hat, p.excerpt, p.published_at,
        m.r2_key as featured_image_r2_key,
        c.name as category_name, c.slug as category_slug,
        a.name as author_name
      FROM posts p
      JOIN categories c ON p.category_id = c.id
      JOIN authors a ON p.author_id = a.id
      LEFT JOIN media m ON p.cover_media_id = m.id
      WHERE c.slug = 'politica' AND p.status = 'published' AND p.published_at <= ?1
      ORDER BY p.published_at DESC LIMIT 1
    )
    UNION ALL
    SELECT * FROM (
      SELECT 
        p.id, p.slug, p.title, p.hat, p.excerpt, p.published_at,
        m.r2_key as featured_image_r2_key,
        c.name as category_name, c.slug as category_slug,
        a.name as author_name
      FROM posts p
      JOIN categories c ON p.category_id = c.id
      JOIN authors a ON p.author_id = a.id
      LEFT JOIN media m ON p.cover_media_id = m.id
      WHERE c.slug = 'economia' AND p.status = 'published' AND p.published_at <= ?1
      ORDER BY p.published_at DESC LIMIT 1
    )
    UNION ALL
    SELECT * FROM (
      SELECT 
        p.id, p.slug, p.title, p.hat, p.excerpt, p.published_at,
        m.r2_key as featured_image_r2_key,
        c.name as category_name, c.slug as category_slug,
        a.name as author_name
      FROM posts p
      JOIN categories c ON p.category_id = c.id
      JOIN authors a ON p.author_id = a.id
      LEFT JOIN media m ON p.cover_media_id = m.id
      WHERE c.slug = 'esporte' AND p.status = 'published' AND p.published_at <= ?1
      ORDER BY p.published_at DESC LIMIT 1
    )
  `).bind(now).all<HomePost>()

  // Await Phase 1
  const [heroResult, sections, topColumnsResult] = await Promise.all([
    heroPromise,
    sectionsPromise,
    topColumnsPromise
  ])

  // 3. Parallel Second Phase
  const heroId = heroResult?.id || 0
  const enabledSections = sections.filter(s => s.enabled)
  const categorySections = enabledSections.filter(s => !s.type || s.type === 'category')
  const tagSections = enabledSections.filter(s => s.type === 'tag')

  const dualFeaturesPromise = env.DB.prepare(`
    SELECT 
      p.id, p.slug, p.title, p.hat, p.excerpt, p.published_at, 
      m.r2_key as featured_image_r2_key,
      c.name as category_name, c.slug as category_slug,
      a.name as author_name
    FROM posts p
    INNER JOIN categories c ON p.category_id = c.id
    INNER JOIN authors a ON p.author_id = a.id
    LEFT JOIN media m ON p.cover_media_id = m.id
    WHERE p.status = 'published' 
      AND p.published_at <= ?
      AND p.seo_noindex = 0
      AND c.slug != 'explicador'
      AND p.id != ?
    ORDER BY p.published_at DESC
    LIMIT 2
  `).bind(now, heroId).all<HomePost>()

  const hotRailPromise = env.DB.prepare(`
    SELECT 
      p.id, p.slug, p.title, p.hat, p.published_at,
      m.r2_key as featured_image_r2_key,
      c.name as category_name, c.slug as category_slug,
      a.name as author_name
    FROM posts p
    INNER JOIN categories c ON p.category_id = c.id
    INNER JOIN authors a ON p.author_id = a.id
    LEFT JOIN media m ON p.cover_media_id = m.id
    WHERE p.status = 'published' 
      AND p.published_at <= ?
      AND p.seo_noindex = 0
      AND p.id != ?
    ORDER BY p.published_at DESC
    LIMIT 10
  `).bind(now, heroId).all<HomePost>()

  // Explainers
  const explainersPromise = (async () => {
    const explainersSection = tagSections.find(s =>
      s.slug === 'explicadores' || s.tagSlug === 'explicador'
    )

    if (explainersSection && explainersSection.tagSlug) {
      const tag = await env.DB.prepare(
        'SELECT id FROM tags WHERE slug = ? LIMIT 1'
      ).bind(explainersSection.tagSlug).first<{ id: number }>()

      if (tag) {
        return env.DB.prepare(`
          SELECT 
            p.id, p.slug, p.title, p.excerpt, p.published_at, 
            m.r2_key as featured_image_r2_key,
            c.name as category_name, c.slug as category_slug,
            a.name as author_name
          FROM posts p
          INNER JOIN categories c ON p.category_id = c.id
          INNER JOIN authors a ON p.author_id = a.id
          LEFT JOIN media m ON p.cover_media_id = m.id
          INNER JOIN posts_tags pt ON pt.post_id = p.id
          WHERE p.status = 'published' 
            AND p.published_at <= ?
            AND p.seo_noindex = 0
            AND pt.tag_id = ?
          ORDER BY p.published_at DESC
          LIMIT 5
        `).bind(now, tag.id).all<HomePost>()
      }
    }

    // Fallback: use category 'explicador'
    return env.DB.prepare(`
      SELECT 
        p.id, p.slug, p.title, p.excerpt, p.published_at, 
        m.r2_key as featured_image_r2_key,
        c.name as category_name, c.slug as category_slug,
        a.name as author_name
      FROM posts p
      INNER JOIN categories c ON p.category_id = c.id
      INNER JOIN authors a ON p.author_id = a.id
      LEFT JOIN media m ON m.id = p.cover_media_id
      WHERE p.status = 'published' 
        AND p.published_at <= ?
        AND p.seo_noindex = 0
        AND c.slug = 'explicador'
      ORDER BY p.published_at DESC
      LIMIT 5
    `).bind(now).all<HomePost>()
  })()

  const categoryBlocksPromise = (async () => {
    if (categorySections.length === 0) return [] as Array<CategoryBlock | null>

    try {
      const categorySlugs = [...new Set(categorySections.map(section => section.slug))]
      const placeholders = categorySlugs.map(() => '?').join(',')
      const categoriesResult = await env.DB.prepare(`
        SELECT id, name, slug
        FROM categories
        WHERE slug IN (${placeholders})
      `).bind(...categorySlugs).all<{ id: number; name: string; slug: string }>()

      const categoriesBySlug = new Map(
        (categoriesResult.results || []).map(category => [category.slug, category])
      )

      const postsBySlug = new Map<string, HomePost[]>()
      await Promise.all(categorySections.map(async (section) => {
        const category = categoriesBySlug.get(section.slug)
        if (!category) return

        const postsResult = await env.DB.prepare(`
          SELECT 
            p.id, p.slug, p.title, p.excerpt, p.published_at, 
            m.r2_key as featured_image_r2_key,
            c.name as category_name, c.slug as category_slug,
            a.name as author_name
          FROM posts p
          INNER JOIN categories c ON p.category_id = c.id
          INNER JOIN authors a ON p.author_id = a.id
          LEFT JOIN media m ON p.cover_media_id = m.id
          WHERE p.category_id = ?
            AND p.status = 'published'
            AND p.published_at <= ?
            AND p.seo_noindex = 0
          ORDER BY p.published_at DESC
          LIMIT 12
        `).bind(category.id, now).all<HomePost>()

        postsBySlug.set(section.slug, postsResult.results || [])
      }))

      return categorySections.map((section) => {
        const posts = postsBySlug.get(section.slug) || []
        if (posts.length === 0) return null

        return {
          slug: section.slug,
          name: section.title,
          lead: posts[0],
          list: posts.slice(1)
        } as CategoryBlock
      })
    } catch (e) {
      console.error('Error loading category blocks', e)
      return [] as Array<CategoryBlock | null>
    }
  })()

  const [dualFeaturesResult, hotRailResult, explainersResult, categoryBlocksRaw] = await Promise.all([
    dualFeaturesPromise,
    hotRailPromise,
    explainersPromise,
    categoryBlocksPromise
  ])

  const categoryBlocks = categoryBlocksRaw.filter((b): b is CategoryBlock => b !== null)

  const data = {
    hero: heroResult || null,
    dualFeatures: dualFeaturesResult.results || [],
    hotRail: hotRailResult.results || [],
    explainers: explainersResult.results || [],
    categoryBlocks,
    mostRead: [] as any[], // Analytics disabled
    topColumns: topColumnsResult.results || [],
    sections: enabledSections
  }

  // 4. Save to Cache
  if (env.CF_ENV !== 'dev' && env.CACHE) {
    try {
      // Cache for 3600 seconds (1 hour) to significantly reduce D1 load
      await env.CACHE.put('home_data_v3', JSON.stringify(data), { expirationTtl: 3600 })
    } catch (e) {
      console.error('Cache write error:', e)
    }
  }

  return data
}
