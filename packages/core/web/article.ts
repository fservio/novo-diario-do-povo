/**
 * Article Page Renderer (Verge Style)
 * Full article layout with paywall, ads, and SEO
 */

import type { Context } from 'hono'
import type { Env, AppContext } from '../types'
import type { ArticlePost, RelatedPost } from '../db/article'
import { renderPublicLayout, escapeHtml, escapeAttr, type PublicLayoutParams } from './layout'
import { renderAdSlot, findActiveSlotsByTemplate, generateAdsLoaderScript } from '../ads'
import { generateArticleJsonLd, generateBreadcrumbJsonLd } from '../seo'

// ============================================================================
// Helpers
// ============================================================================

function formatDate(isoDate: string): string {
  const date = new Date(isoDate)
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  })
}

function estimateReadingTime(content: string): number {
  const words = content.split(/\s+/).length
  const minutes = Math.ceil(words / 200)
  return Math.max(1, minutes)
}

/**
 * Safely truncate HTML content (no tag breaking)
 */
function truncateContent(html: string, maxLength: number): string {
  // Simple truncation - in production, use proper HTML parser
  const text = html.replace(/<[^>]+>/g, '')
  if (text.length <= maxLength) return html
  
  // Find safe cutoff (end of paragraph or sentence)
  const cutoff = html.substring(0, maxLength)
  const lastPTag = cutoff.lastIndexOf('</p>')
  if (lastPTag > 0) {
    return html.substring(0, lastPTag + 4)
  }
  
  return cutoff + '...'
}

// ============================================================================
// Component Renderers
// ============================================================================

function renderBreadcrumb(categoryName: string, categorySlug: string): string {
  return `
    <nav id="breadcrumb" style="margin-bottom: 1rem; font-size: 0.875rem;">
      <a href="/" style="color: var(--text-secondary); text-decoration: none;">Home</a>
      <span style="color: var(--text-secondary); margin: 0 0.5rem;">›</span>
      <a href="/categoria/${escapeAttr(categorySlug)}" style="color: var(--text-secondary); text-decoration: none;">
        ${escapeHtml(categoryName)}
      </a>
    </nav>
  `
}

function renderArticleHeader(post: ArticlePost, readingTime: number): string {
  return `
    <header style="margin-bottom: 2rem;">
      ${renderBreadcrumb(post.category_name, post.category_slug)}
      
      <div style="display: inline-block; background: var(--accent); color: white; padding: 0.25rem 0.75rem; border-radius: 0.25rem; font-size: 0.875rem; font-weight: 600; margin-bottom: 1rem;">
        ${escapeHtml(post.category_name)}
      </div>
      
      <h1 id="articleTitle" style="margin: 0 0 1rem 0; font-size: 2.5rem; font-weight: 900; line-height: 1.2;">
        ${escapeHtml(post.title)}
      </h1>
      
      <div style="display: flex; align-items: center; gap: 1rem; font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 1.5rem;">
        ${post.author_name ? `<span>Por ${escapeHtml(post.author_name)}</span>` : ''}
        <span>${formatDate(post.published_at)}</span>
        <span>${readingTime} min de leitura</span>
      </div>
      
      ${post.featured_image_r2_key ? `
        <div style="margin-bottom: 1.5rem;">
          <img 
            src="/i/${escapeAttr(post.featured_image_r2_key)}" 
            alt="${escapeAttr(post.title)}"
            style="width: 100%; aspect-ratio: 16/9; object-fit: cover; border-radius: 1rem;"
            loading="eager"
            width="1200"
            height="675"
          >
        </div>
      ` : ''}
      
      ${post.excerpt ? `
        <div style="font-size: 1.25rem; color: var(--text-secondary); line-height: 1.6; font-weight: 500; margin-bottom: 2rem;">
          ${escapeHtml(post.excerpt)}
        </div>
      ` : ''}
    </header>
  `
}

function renderArticleContent(content: string, isBlocked: boolean): string {
  if (isBlocked) {
    // Show snippet + paywall
    const snippet = truncateContent(content, 500)
    return `
      <div id="articleBody" style="max-width: 75ch; margin: 0 auto; font-size: 1.125rem; line-height: 1.8; color: var(--text-primary);">
        ${snippet}
      </div>
      
      <div id="paywallCta" style="background: linear-gradient(to bottom, transparent, var(--bg-body)); padding: 3rem 0; text-align: center; margin-top: 2rem;">
        <div class="card" style="max-width: 600px; margin: 0 auto; padding: 2rem; text-align: center;">
          <h3 style="margin: 0 0 1rem 0; font-size: 1.5rem; font-weight: 700;">
            Continue lendo
          </h3>
          <p style="margin: 0 0 1.5rem 0; color: var(--text-secondary);">
            Assine agora e tenha acesso ilimitado a todo conteúdo exclusivo.
          </p>
          <a href="/assine" style="display: inline-block; background: var(--accent); color: white; padding: 0.75rem 2rem; border-radius: 0.5rem; text-decoration: none; font-weight: 600;">
            Assinar agora
          </a>
        </div>
      </div>
    `
  }
  
  return `
    <div id="articleBody" style="max-width: 75ch; margin: 0 auto; font-size: 1.125rem; line-height: 1.8; color: var(--text-primary);">
      ${content}
    </div>
  `
}

function renderRelatedPosts(posts: RelatedPost[], baseUrl: string): string {
  if (posts.length === 0) return ''
  
  return `
    <section style="margin-top: 4rem; padding-top: 2rem; border-top: 1px solid var(--border);">
      <h2 style="margin: 0 0 1.5rem 0; font-size: 1.5rem; font-weight: 700;">Leia também</h2>
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 1.5rem;">
        ${posts.map(post => `
          <article class="card">
            <h3 style="margin: 0 0 0.5rem 0; font-size: 1rem; font-weight: 600;">
              <a href="/noticia/${escapeAttr(post.slug)}" style="text-decoration: none; color: inherit;">
                ${escapeHtml(post.title)}
              </a>
            </h3>
            <div style="font-size: 0.875rem; color: var(--text-secondary);">
              ${formatDate(post.published_at)}
            </div>
          </article>
        `).join('')}
      </div>
    </section>
  `
}

function renderMostRead(posts: RelatedPost[]): string {
  if (posts.length === 0) return ''
  
  return `
    <aside id="mostRead" style="margin-top: 3rem; padding: 1.5rem; background: var(--bg-card); border: 1px solid var(--border); border-radius: 1rem;">
      <h2 style="margin: 0 0 1rem 0; font-size: 1.25rem; font-weight: 700;">Mais Lidas</h2>
      <ol style="margin: 0; padding: 0; list-style: none;">
        ${posts.map((post, index) => `
          <li style="margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border);">
            <span style="color: var(--accent); font-weight: 700; font-size: 1.5rem; margin-right: 0.75rem;">${index + 1}</span>
            <a href="/noticia/${escapeAttr(post.slug)}" style="text-decoration: none; color: inherit; font-weight: 600;">
              ${escapeHtml(post.title)}
            </a>
          </li>
        `).join('')}
      </ol>
    </aside>
  `
}

// ============================================================================
// JSON-LD Helpers
// ============================================================================

function generateOGTags(post: ArticlePost, baseUrl: string): string {
  const imageUrl = post.featured_image_r2_key 
    ? `${baseUrl}/i/${post.featured_image_r2_key}` 
    : `${baseUrl}/static/default-og.jpg`
  
  return `
    <meta property="og:type" content="article">
    <meta property="og:title" content="${escapeAttr(post.title)}">
    <meta property="og:description" content="${escapeAttr(post.excerpt || post.title)}">
    <meta property="og:url" content="${escapeAttr(baseUrl)}/noticia/${escapeAttr(post.slug)}">
    <meta property="og:image" content="${escapeAttr(imageUrl)}">
    <meta property="article:published_time" content="${post.published_at}">
    <meta property="article:section" content="${escapeAttr(post.category_name)}">
    <meta name="twitter:card" content="summary_large_image">
  `
}

// ============================================================================
// Main Renderer
// ============================================================================

export async function renderArticlePage(
  c: Context<{ Bindings: Env; Variables: AppContext }>,
  post: ArticlePost,
  options: {
    baseUrl: string
    siteName: string
    navItems: Array<{ label: string; href: string; active?: boolean }>
    coverOfDay?: { r2Key: string; alt: string; aspectRatio?: string } | null
    relatedPosts: RelatedPost[]
    mostRead: RelatedPost[]
    isBlocked: boolean
  }
): Promise<string> {
  const { baseUrl, siteName, navItems, coverOfDay, relatedPosts, mostRead, isBlocked } = options
  
  const nonce = c.get('cspNonce') || ''
  const canonicalUrl = post.seo_canonical || `${baseUrl}/noticia/${post.slug}`
  const readingTime = estimateReadingTime(post.content)
  
  // Get ad slots
  const adSlots = await findActiveSlotsByTemplate(c.env, 'article')
  const adTop = adSlots.find(s => s.name === 'article_top')
  const adInread1 = adSlots.find(s => s.name === 'article_inread_1')
  const adInread2 = adSlots.find(s => s.name === 'article_inread_2')
  const adFooter = adSlots.find(s => s.name === 'article_footer')
  
  // Render ads
  const pageContext = { path: c.req.path, referrer: c.req.header('referer') || '', template: 'article' }
  const userContext = { isSubscriber: !isBlocked, isLoggedIn: false }
  
  const adTopHtml = adTop ? renderAdSlot({ slot: adTop, page: pageContext, user: userContext }) : ''
  const adInread1Html = adInread1 && !isBlocked ? renderAdSlot({ slot: adInread1, page: pageContext, user: userContext }) : ''
  const adInread2Html = adInread2 && !isBlocked ? renderAdSlot({ slot: adInread2, page: pageContext, user: userContext }) : ''
  const adFooterHtml = adFooter ? renderAdSlot({ slot: adFooter, page: pageContext, user: userContext }) : ''
  
  // Ads loader script
  const adsScript = await generateAdsLoaderScript(c.env)
  
  // Split content for ad insertion (simple approach)
  let contentWithAds = post.content
  if (!isBlocked) {
    const paragraphs = post.content.split('</p>')
    if (paragraphs.length > 4 && adInread1Html) {
      paragraphs.splice(3, 0, '</p>' + adInread1Html)
    }
    if (paragraphs.length > 8 && adInread2Html) {
      paragraphs.splice(7, 0, '</p>' + adInread2Html)
    }
    contentWithAds = paragraphs.join('</p>')
  }
  
  // JSON-LD
  const postForJsonLd = {
    title: post.title,
    excerpt: post.excerpt,
    slug: post.slug,
    published_at: post.published_at,
    updated_at: post.published_at, // Use same as published if no updated_at
    author: { name: post.author_name || 'Redação' },
    coverMedia: post.featured_image_r2_key ? {
      r2_key: post.featured_image_r2_key,
      width: 1200,
      height: 675
    } : null
  }
  
  const articleJsonLd = generateArticleJsonLd(postForJsonLd, baseUrl, siteName)
  const breadcrumbJsonLd = generateBreadcrumbJsonLd([
    { name: 'Home', url: baseUrl },
    { name: post.category_name, url: `${baseUrl}/categoria/${post.category_slug}` },
    { name: post.title, url: canonicalUrl }
  ], baseUrl)
  
  // Extra head HTML (JSON-LD + OG tags) - WITH CSP NONCE
  const extraHeadHtml = `
    ${post.seo_noindex ? '<meta name="robots" content="noindex, follow">' : ''}
    ${generateOGTags(post, baseUrl)}
    <script type="application/ld+json" nonce="${nonce}">
      ${JSON.stringify(articleJsonLd)}
    </script>
    <script type="application/ld+json" nonce="${nonce}">
      ${JSON.stringify(breadcrumbJsonLd)}
    </script>
  `
  
  // Build body HTML
  const bodyHtml = `
    <article class="container" style="padding-top: 2rem; padding-bottom: 4rem;">
      ${renderArticleHeader(post, readingTime)}
      
      <!-- Ad: Top -->
      ${adTopHtml}
      
      <!-- Content -->
      ${renderArticleContent(contentWithAds, isBlocked)}
      
      ${!isBlocked ? `
        <!-- Ad: Footer -->
        ${adFooterHtml}
        
        <!-- Related Posts -->
        ${renderRelatedPosts(relatedPosts, baseUrl)}
        
        <!-- Most Read -->
        ${renderMostRead(mostRead)}
      ` : ''}
    </article>
    
    ${adsScript}
  `
  
  // Use shared layout
  return renderPublicLayout({
    title: `${post.title} | ${siteName}`,
    description: post.excerpt || post.title,
    canonicalUrl,
    nonce,
    siteName,
    navItems,
    coverOfDay,
    bodyHtml,
    extraHeadHtml
  })
}
