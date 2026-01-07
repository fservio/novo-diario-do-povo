/**
 * SEO Module
 * Sitemaps, RSS, JSON-LD
 */

import type { Env, Post, Category } from '../types'

// ============================================================================
// Sitemap News (Google News - últimos 2 dias)
// ============================================================================

export async function generateNewsSitemap(env: Env, baseUrl: string): Promise<string> {
  const twoDaysAgo = new Date()
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)

  const recentPosts = await env.DB.prepare(`
    SELECT p.*, c.name as category_name
    FROM posts p
    INNER JOIN categories c ON c.id = p.category_id
    WHERE p.status = 'published'
    AND p.published_at >= ?
    AND p.seo_noindex = 0
    ORDER BY p.published_at DESC
    LIMIT 1000
  `).bind(twoDaysAgo.toISOString()).all()

  const urls = (recentPosts.results || []).map((post: any) => `
  <url>
    <loc>${baseUrl}/noticia/${post.slug}</loc>
    <news:news>
      <news:publication>
        <news:name>Jornal Demo</news:name>
        <news:language>pt</news:language>
      </news:publication>
      <news:publication_date>${post.published_at}</news:publication_date>
      <news:title>${escapeXml(post.title)}</news:title>
    </news:news>
  </url>`).join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${urls}
</urlset>`
}

// ============================================================================
// RSS Feed
// ============================================================================

export async function generateRssFeed(
  env: Env,
  baseUrl: string,
  categorySlug?: string
): Promise<string> {
  const { getSetting } = await import('../db')
  const siteName = await getSetting(env, 'site_name', 'public') || 'Jornal Demo'
  const siteDescription = await getSetting(env, 'site_description', 'public') || 'Portal de notícias'

  let query = `
    SELECT p.*, c.name as category_name, a.name as author_name
    FROM posts p
    INNER JOIN categories c ON c.id = p.category_id
    INNER JOIN authors a ON a.id = p.author_id
    WHERE p.status = 'published'
    AND p.seo_noindex = 0
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
      <link>${baseUrl}/noticia/${post.slug}</link>
      <guid isPermaLink="true">${baseUrl}/noticia/${post.slug}</guid>
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
    <link>${baseUrl}</link>
    <description>${escapeXml(siteDescription)}</description>
    <language>pt-BR</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${baseUrl}/rss${categorySlug ? `/${categorySlug}` : ''}.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`
}

// ============================================================================
// JSON-LD NewsArticle
// ============================================================================

export function generateArticleJsonLd(
  post: any,
  baseUrl: string,
  siteName: string
): string {
  const jsonLd: any = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: post.title,
    description: post.excerpt || '',
    url: `${baseUrl}/noticia/${post.slug}`,
    datePublished: post.published_at,
    dateModified: post.updated_at,
    author: {
      '@type': 'Person',
      name: post.author?.name || 'Redação',
    },
    publisher: {
      '@type': 'Organization',
      name: siteName,
      url: baseUrl,
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${baseUrl}/noticia/${post.slug}`,
    },
  }

  if (post.coverMedia) {
    jsonLd['image'] = {
      '@type': 'ImageObject',
      url: `${baseUrl}/i/${post.coverMedia.r2_key}`,
      width: post.coverMedia.width,
      height: post.coverMedia.height,
    }
  }

  return JSON.stringify(jsonLd, null, 2)
}

// ============================================================================
// JSON-LD BreadcrumbList
// ============================================================================

export function generateBreadcrumbJsonLd(
  items: Array<{ name: string; url: string }>,
  baseUrl: string
): string {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  }

  return JSON.stringify(jsonLd, null, 2)
}

// ============================================================================
// Helpers
// ============================================================================

function escapeXml(text: string): string {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
