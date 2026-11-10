/**
 * SEO Module
 * Advanced Sitemaps (News, Categories, Archives) & RSS
 */

import type { Env } from '../types'
import { getPostUrl } from '../utils/post'

// Hardcoded production domain to ensure compliance
const PROD_DOMAIN = 'https://diario.dopovo.com.br'
export const SITEMAP_PAGE_SIZE = 10000

// ============================================================================
// 1. Sitemap Index (Central Hub)
// ============================================================================

export async function generateSitemapIndex(env: Env): Promise<string> {

  // Get available months for archives
  const months = await listPostMonths(env)

  const archiveSitemaps = months.flatMap(m => {
    const pages = Math.max(1, Math.ceil(Number(m.total || 0) / SITEMAP_PAGE_SIZE))
    return Array.from({ length: pages }, (_, index) => `
  <sitemap>
    <loc>${PROD_DOMAIN}/sitemap/archive/${m.year}/${m.month}.xml${index ? `?page=${index + 1}` : ''}</loc>
  </sitemap>`)
  }).join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${PROD_DOMAIN}/sitemap-news.xml</loc>
  </sitemap>
  <sitemap>
    <loc>${PROD_DOMAIN}/sitemap-categories.xml</loc>
  </sitemap>
  <sitemap>
    <loc>${PROD_DOMAIN}/sitemap-guias.xml</loc>
  </sitemap>
${archiveSitemaps}
</sitemapindex>`
}

// ============================================================================
// 2. News Sitemap (Google News - Last 48h)
// ============================================================================

export async function generateNewsSitemap(env: Env): Promise<string> {
  // STRICT: 48 hours window
  const timeWindow = new Date()
  timeWindow.setHours(timeWindow.getHours() - 48)

  const { getSetting } = await import('../db')
  // Ensure we use the exact name from Publisher Center
  const siteName = (await getSetting(env, 'site_name', 'public')) || 'Jornal Diário do Povo'

  const recentPosts = await env.DB.prepare(`
    SELECT 
      p.*, 
      c.name as category_name,
      m.r2_key as featured_image_key,
      m.alt as featured_image_alt,
      m.credits as featured_image_credits
    FROM posts p
    INNER JOIN categories c ON c.id = p.category_id
    LEFT JOIN media m ON p.cover_media_id = m.id
    WHERE p.status = 'published'
    AND datetime(p.published_at) >= datetime(?)
    AND datetime(p.published_at) <= datetime('now')
    AND p.seo_noindex = 0
    AND p.slug NOT LIKE 'previsao-do-tempo-%'
    ORDER BY p.published_at DESC
    LIMIT 1000
  `).bind(timeWindow.toISOString()).all()

  const urls = (recentPosts.results || []).filter((post: any) => isSitemapCanonical(post) && !isAutomatedWeatherBulletin(post)).map((post: any) => {
    const url = getPostUrl(post, PROD_DOMAIN)

    // Format date with timezone -03:00 (Sao Paulo)
    // We assume stored dates are UTC, so we strictly format them for XML
    const pubDate = new Date(post.published_at)
    // Convert to ISO string but force the offset if needed, or rely on reliable server time
    // Ideally, we output ISO 8601 complete: YYYY-MM-DDThh:mm:ss+TZ
    const isoDate = pubDate.toISOString()

    let imageTag = ''
    if (post.featured_image_key) {
      const imgUrl = `${PROD_DOMAIN}/i/${post.featured_image_key}`
      imageTag = `
    <image:image>
      <image:loc>${escapeXml(imgUrl)}</image:loc>
      ${post.featured_image_alt ? `<image:title>${escapeXml(post.featured_image_alt)}</image:title>` : ''}
    </image:image>`
    }

    return `
  <url>
    <loc>${escapeXml(url)}</loc>
    <news:news>
      <news:publication>
        <news:name>${escapeXml(siteName)}</news:name>
        <news:language>pt</news:language>
      </news:publication>
      <news:publication_date>${isoDate}</news:publication_date>
      <news:title>${escapeXml(post.title)}</news:title>
    </news:news>
    ${imageTag}
  </url>`
  }).join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls}
</urlset>`
}

// ============================================================================
// 3. Category Sitemap
// ============================================================================

export async function generateCategorySitemap(env: Env): Promise<string> {
  const categories = await env.DB.prepare(`SELECT slug FROM categories WHERE is_active = 1`).all()

  const urls = (categories.results || []).map((c: any) => `
  <url>
    <loc>${PROD_DOMAIN}/categoria/${escapeXml(c.slug)}</loc>
    <changefreq>hourly</changefreq>
    <priority>0.9</priority>
  </url>`).join('')

  // Add Home
  const homeUrl = `
  <url>
    <loc>${PROD_DOMAIN}/</loc>
    <changefreq>hourly</changefreq>
    <priority>1.0</priority>
  </url>`

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${homeUrl}
${urls}
</urlset>`
}

export async function generateFullSitemap(env: Env, _baseUrl?: string): Promise<string> {
  // Preserve the submitted legacy endpoint while discovering the entire archive.
  // A flat list of 50,000 articles plus home/categories exceeds Google's limit.
  return generateSitemapIndex(env)
}

// ============================================================================
// 4. Monthly Archive Sitemap
// ============================================================================

export async function generateMonthlyPostSitemap(env: Env, year: string, month: string, page = 1): Promise<string> {
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger((page - 1) * SITEMAP_PAGE_SIZE)) {
    throw new Error('Invalid sitemap page')
  }
  // Construct date range for SQLite (ISO 8601 strings)
  const validMonth = month.padStart(2, '0')
  const startDate = `${year}-${validMonth}-01T00:00:00`

  // Calculate start of next month
  let nextYear = parseInt(year)
  let nextMonth = parseInt(month) + 1
  if (nextMonth > 12) {
    nextMonth = 1
    nextYear++
  }
  const nextMonthStr = String(nextMonth).padStart(2, '0')
  const endDate = `${nextYear}-${nextMonthStr}-01T00:00:00`

  try {
    console.log(`[Sitemap] Generating archive for ${year}-${month}. Range: ${startDate} to ${endDate}`)

    const posts = await env.DB.prepare(`
      SELECT 
        p.slug, p.updated_at, p.published_at, p.seo_canonical,
        m.r2_key as featured_image_key,
        m.alt as featured_image_alt
      FROM posts p
      LEFT JOIN media m ON p.cover_media_id = m.id
      WHERE p.status = 'published' 
      AND p.seo_noindex = 0
      AND datetime(p.published_at) >= datetime(?)
      AND datetime(p.published_at) < datetime(?)
      AND datetime(p.published_at) <= datetime('now')
      ORDER BY p.published_at DESC, p.id DESC
      LIMIT ? OFFSET ?
    `).bind(startDate, endDate, SITEMAP_PAGE_SIZE, (page - 1) * SITEMAP_PAGE_SIZE).all()

    console.log(`[Sitemap] Found ${posts.results?.length || 0} posts for ${year}-${month}`)

    // Safe Date Helper
    const safeIsoDate = (dateStr: string | null | undefined, fallback: string | undefined): string => {
      if (!dateStr) return fallback ? new Date(fallback).toISOString() : new Date().toISOString()
      try {
        // Handle SQLite "YYYY-MM-DD HH:MM:SS" format by replacing space with T
        const isoLike = dateStr.replace(' ', 'T')
        const d = new Date(isoLike)
        if (isNaN(d.getTime())) {
          // Try standard parse if replace failed to help
          const d2 = new Date(dateStr)
          return isNaN(d2.getTime()) ? (fallback ? new Date(fallback).toISOString() : new Date().toISOString()) : d2.toISOString()
        }
        return d.toISOString()
      } catch (e) {
        console.warn(`[Sitemap] Date parse error for ${dateStr}:`, e)
        return new Date().toISOString()
      }
    }

    const urls = (posts.results || []).filter((post: any) => isSitemapCanonical(post)).map((p: any) => {
      try {
        const url = getPostUrl(p, PROD_DOMAIN)
        const lastMod = p.updated_at ? safeIsoDate(p.updated_at, p.published_at) : safeIsoDate(p.published_at, null)

        let imageTag = ''
        if (p.featured_image_key) {
          const imgUrl = `${PROD_DOMAIN}/i/${p.featured_image_key}`
          imageTag = `
      <image:image>
        <image:loc>${escapeXml(imgUrl)}</image:loc>
      </image:image>`
        }

        return `
    <url>
      <loc>${escapeXml(url)}</loc>
      <lastmod>${lastMod}</lastmod>
      <changefreq>monthly</changefreq>
      <priority>0.5</priority>
      ${imageTag}
    </url>`
      } catch (err) {
        console.error(`[Sitemap] Error processing post slug ${p.slug}:`, err)
        return ''
      }
    }).join('')

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls}
</urlset>`

  } catch (error) {
    console.error(`[Sitemap] Critical error generating archive ${year}-${month}:`, error)
    // Let the route return an error so crawlers retry instead of accepting an empty archive.
    throw error
  }
}

// Helper: List available months
async function listPostMonths(env: Env): Promise<Array<{ year: string, month: string, total?: number }>> {
  const result = await env.DB.prepare(`
    SELECT strftime('%Y', published_at) as year, strftime('%m', published_at) as month, COUNT(*) as total
    FROM posts
    WHERE status = 'published' AND seo_noindex = 0
    AND strftime('%Y', published_at) IS NOT NULL
    AND datetime(published_at) <= datetime('now')
    GROUP BY strftime('%Y', published_at), strftime('%m', published_at)
    ORDER BY year DESC, month DESC
  `).all()

  return (result.results || []) as Array<{ year: string, month: string, total?: number }>
}

// ============================================================================
// Robots.txt
// ============================================================================

export async function generateRobotsTxt(baseUrl: string): Promise<string> {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin/',
    'Disallow: /api/',
    '',
    `Sitemap: ${PROD_DOMAIN}/sitemap-index.xml`
  ].join('\n')
}

// ============================================================================
// RSS Feed (Maintained for backward compatibility but using PROD domain)
// ============================================================================

export async function generateRssFeed(
  env: Env,
  _baseUrl: string, // Ignored, using PROD_DOMAIN
  categorySlug?: string
): Promise<string> {
  const { getSetting } = await import('../db')
  const siteName = await getSetting(env, 'site_name', 'public') || 'Jornal Diário do Povo'
  const siteDescription = await getSetting(env, 'site_description', 'public') || 'Portal de notícias'

  let query = `
    SELECT p.*, c.name as category_name, a.name as author_name
    FROM posts p
    INNER JOIN categories c ON c.id = p.category_id
    INNER JOIN authors a ON a.id = p.author_id
    WHERE p.status = 'published'
    AND p.seo_noindex = 0 AND p.slug NOT LIKE 'previsao-do-tempo-%'
  `
  const bindings: any[] = []

  if (categorySlug) {
    query += ` AND c.slug = ?`
    bindings.push(categorySlug)
  }

  query += ` ORDER BY p.published_at DESC LIMIT 50`

  const result = await env.DB.prepare(query).bind(...bindings).all()
  const posts = result.results || []

  const items = posts.map((post: any) => `
    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${getPostUrl(post, PROD_DOMAIN)}</link>
      <guid isPermaLink="true">${getPostUrl(post, PROD_DOMAIN)}</guid>
      <description>${escapeXml(post.excerpt || '')}</description>
      <category>${escapeXml(post.category_name)}</category>
      <author>${escapeXml(post.author_name)}</author>
      <pubDate>${new Date(post.published_at).toUTCString()}</pubDate>
    </item>`).join('')

  const title = categorySlug
    ? `${siteName} - ${categorySlug}`
    : siteName

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${PROD_DOMAIN}</link>
    <description>${escapeXml(siteDescription)}</description>
    <language>pt-BR</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${PROD_DOMAIN}/rss${categorySlug ? `/${categorySlug}` : ''}.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`
}


// ============================================================================
// JSON-LD NewsArticle
// ============================================================================

export function generateArticleJsonLd(
  post: any,
  _baseUrl: string,
  siteName: string
): string {
  const jsonLd: any = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: post.title,
    description: post.excerpt || '',
    url: getPostUrl(post, PROD_DOMAIN),
    datePublished: post.published_at,
    dateModified: post.updated_at || post.published_at,
    articleSection: post.category_name || undefined,
    author: {
      '@type': 'Person',
      name: post.author?.name || 'Redação',
      url: post.author?.slug ? `${PROD_DOMAIN}/autor/${post.author.slug}` : undefined
    },
    publisher: {
      '@type': 'Organization',
      name: siteName,
      url: PROD_DOMAIN,
      logo: {
        '@type': 'ImageObject',
        url: `${PROD_DOMAIN}/static/logo-dp.png`
      }
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': getPostUrl(post, PROD_DOMAIN),
    },
  }

  if (post.coverMedia) {
    jsonLd['image'] = {
      '@type': 'ImageObject',
      url: `${PROD_DOMAIN}/i/${post.coverMedia.r2_key}`,
      width: post.coverMedia.width,
      height: post.coverMedia.height,
    }
  }

  return JSON.stringify(post.coverMedia ? jsonLd : { ...jsonLd, image: { '@type': 'ImageObject', url: `${PROD_DOMAIN}/static/article-placeholder-v1.png`, width: 1200, height: 1200 } }, null, 2).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
}

// ============================================================================
// JSON-LD LiveBlogPosting
// ============================================================================

export function generateLiveBlogJsonLd(
  post: any,
  updates: any[],
  _baseUrl: string,
  siteName: string
): string {
  const jsonLd: any = {
    '@context': 'https://schema.org',
    '@type': 'LiveBlogPosting',
    headline: post.title,
    description: post.excerpt || '',
    author: {
      '@type': 'Person',
      name: post.author?.name || 'Redação',
    },
    publisher: {
      '@type': 'Organization',
      name: siteName,
      url: PROD_DOMAIN,
    },
    url: getPostUrl(post, PROD_DOMAIN),
    datePublished: post.published_at,
    dateModified: updates.length > 0 ? updates[0].published_at : (post.updated_at || post.published_at),
    coverageStartTime: post.published_at,
    liveBlogUpdate: updates.map(update => ({
      '@type': 'BlogPosting',
      headline: update.title || '',
      articleBody: update.content,
      datePublished: update.published_at,
      author: {
        '@type': 'Person',
        name: update.author_name || 'Redação',
      }
    })),
  }

  if (post.coverMedia) {
    jsonLd['image'] = {
      '@type': 'ImageObject',
      url: `${PROD_DOMAIN}/i/${post.coverMedia.r2_key}`,
      width: post.coverMedia.width,
      height: post.coverMedia.height,
    }
  }

  return JSON.stringify(post.coverMedia ? jsonLd : { ...jsonLd, image: { '@type': 'ImageObject', url: `${PROD_DOMAIN}/static/article-placeholder-v1.png`, width: 1200, height: 1200 } }, null, 2).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
}

// ============================================================================
// JSON-LD BreadcrumbList
// ============================================================================

export function generateBreadcrumbJsonLd(
  items: Array<{ name: string; url: string }>,
  _baseUrl: string
): string {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url.startsWith('http') ? item.url : `${PROD_DOMAIN}${item.url}`,
    })),
  }

  return JSON.stringify(jsonLd, null, 2)
}

// ============================================================================
// Helpers
// ============================================================================

// Do not advertise an alternate article as canonical in a sitemap.
function isSitemapCanonical(post: { slug: string; published_at?: string; seo_canonical?: string | null }): boolean {
  const canonical = post.seo_canonical?.trim()
  return !canonical || canonical.replace(/\/$/, '') === getPostUrl(post, PROD_DOMAIN).replace(/\/$/, '')
}

function isAutomatedWeatherBulletin(post: { slug?: string | null }): boolean {
  return typeof post.slug === 'string' && /^previsao-do-tempo-/i.test(post.slug.trim())
}

function escapeXml(text: string): string {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function escapeAttr(text: string): string {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
