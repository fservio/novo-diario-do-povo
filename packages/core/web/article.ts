/**
 * Article Page Renderer
 * Modern, Clean, Typography-focused
 */

import type { Context } from 'hono'
import type { Env, AppContext } from '../types'
import type { ArticlePost, RelatedPost } from '../db/article'
import { renderPublicLayout, escapeHtml, escapeAttr, formatDate, estimateReadingTime, truncate, type PublicLayoutParams } from './layout'
import { getPostUrl } from '../utils/post'
import { renderAdSlot, findActiveSlotsByTemplate, generateAdsLoaderScript } from '../ads'
import { generateArticleJsonLd, generateLiveBlogJsonLd, generateBreadcrumbJsonLd } from '../seo'
import { renderMarkdownToHtml, sanitizeHtml } from '../render/sanitize'
import { renderLiveBlogTimeline, renderLiveBlogScript } from './liveblog'
import { findLiveUpdates, getSetting } from '../db'

// ============================================================================
// Helpers
// ============================================================================

function truncateContent(html: string, maxLength: number): string {
  const text = html.replace(/<[^>]+>/g, '')
  if (text.length <= maxLength) return html
  const cutoff = html.substring(0, maxLength)
  const lastPTag = cutoff.lastIndexOf('</p>')
  if (lastPTag > 0) {
    return html.substring(0, lastPTag + 4)
  }
  return cutoff + '...'
}

function looksLikeMarkdown(value: string | null | undefined): boolean {
  if (!value) return false
  if (/<[a-z][\s\S]*>/i.test(value)) return false
  return /(^|\n)\s*(?:#{1,6}\s|[-*+]\s|\d+\.\s|> |!\[|\[.+\]\(.+\)|`{3})/.test(value)
}

// ============================================================================
// Component Renderers
// ============================================================================

function renderArticleHeader(post: ArticlePost, readingTime: number): string {
  return `
    <header class="article-header">
      <!-- Breadcrumb Marker -->
      <nav id="breadcrumb" class="hidden"></nav>
      
      <!-- Hat (Chapéu) -->
      ${post.hat ? `
        <div class="article-hat">
          ${escapeHtml(post.hat)}
        </div>
      ` : ''}
      
      <!-- Title -->
      <h1 id="articleTitle" class="article-title">
        ${escapeHtml(post.title)}
      </h1>
      
      <!-- Excerpt -->
      ${post.excerpt ? `
        <div class="article-excerpt">
          ${escapeHtml(post.excerpt)}
        </div>
      ` : ''}
      
      <!-- Metadata -->
      <div class="article-meta">
        ${post.author_name ? `
          <span class="font-bold" style="color: #202124; font-weight: 500;">${escapeHtml(post.author_name)}</span>
          <span class="text-gray-300">•</span>
        ` : ''}
        <span>${formatDate(post.published_at)}</span>
        <span class="text-gray-300">•</span>
        <span>${readingTime} min de leitura</span>
      </div>
      
      <!-- Featured Image -->
      <!-- Featured Image -->
      ${post.featured_image_r2_key ? `
        <figure class="article-featured-image">
          <img 
            src="/i/${escapeAttr(post.featured_image_r2_key)}?w=1200" 
            alt="${escapeAttr(post.featured_image_alt || post.title)}"
            class="img-aesthetic"
            loading="eager"
            fetchpriority="high"
          >
          ${post.featured_image_credits ? `
            <figcaption class="article-featured-caption">
              ${escapeHtml(post.featured_image_credits)}
            </figcaption>
          ` : ''}
        </figure>
      ` : ''}
    </header>
  `
}

function renderArticleContent(content: string, isBlocked: boolean): string {
  if (isBlocked) {
    const snippet = truncateContent(content, 500)
    return `
      <div id="articleBody" class="article-content">
        ${snippet}
      </div>
      
      <div class="paywall-box container">
        <h3 class="font-bold text-xl mb-4">Conteúdo Exclusivo</h3>
        <p class="mb-6 text-gray-600">
          Este artigo é exclusivo para assinantes. Continue lendo e tenha acesso a análises profundas.
        </p>
        <a href="/assine" class="paywall-cta" id="paywallCta">
          Assinar Agora
        </a>
      </div>
    `
  }

  return `
    <div id="articleBody" class="article-content">
      ${content}
    </div>
  `
}

function renderRelatedPosts(posts: RelatedPost[], baseUrl: string): string {
  if (posts.length === 0) return ''

  return `
    <section class="container" style="margin-top: 4rem; padding-top: 2rem; border-top: 1px solid var(--gray-200);">
      <h2 class="font-bold text-2xl mb-6">Leia também</h2>
      <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
        ${posts.map(post => `
          <a href="${getPostUrl(post, baseUrl)}" class="card hover:shadow-lg transition">
            <div class="card-body">
              <span class="text-xs font-bold text-accent uppercase mb-2 block">
                ${escapeHtml(post.category_name || 'Notícia')}
              </span>
              <h3 class="font-bold text-lg mb-2 leading-tight">
                ${escapeHtml(post.title)}
              </h3>
              <div class="text-xs text-gray-500 mt-auto pt-4">
                ${formatDate(post.published_at)}
              </div>
            </div>
          </a>
        `).join('')}
      </div>
    </section>
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
    <meta property="og:url" content="${getPostUrl(post, baseUrl)}">
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
  const canonicalUrl = post.seo_canonical || getPostUrl(post, baseUrl)
  const contentHtml = post.content_markdown && post.content_markdown.length > 0
    ? renderMarkdownToHtml(post.content_markdown)
    : looksLikeMarkdown(post.content)
      ? renderMarkdownToHtml(post.content)
      : sanitizeHtml(post.content)
  const readingTime = estimateReadingTime(contentHtml)

  // Get ad slots
  const adSlots = await findActiveSlotsByTemplate(c.env, 'article')
  const adTop = adSlots.find(s => s.name === 'article_top')
  const adInread1 = adSlots.find(s => s.name === 'article_inread_1')
  const adInread2 = adSlots.find(s => s.name === 'article_inread_2')
  const adFooter = adSlots.find(s => s.name === 'article_footer')

  // Render ads context
  const pageContext = { path: c.req.path, referrer: c.req.header('referer') || '', template: 'article' }
  const userContext = { isSubscriber: !isBlocked, isLoggedIn: false }

  const adTopHtml = adTop ? renderAdSlot({ slot: adTop, page: pageContext, user: userContext }) : ''
  const adInread1Html = adInread1 && !isBlocked ? renderAdSlot({ slot: adInread1, page: pageContext, user: userContext }) : ''
  const adInread2Html = adInread2 && !isBlocked ? renderAdSlot({ slot: adInread2, page: pageContext, user: userContext }) : ''
  const adFooterHtml = adFooter ? renderAdSlot({ slot: adFooter, page: pageContext, user: userContext }) : ''

  // Ads loader script
  const adsScript = await generateAdsLoaderScript(c.env)

  // Split content for ad insertion
  let contentWithAds = contentHtml
  if (!isBlocked) {
    const paragraphs = contentHtml.split('</p>')
    if (paragraphs.length > 4 && adInread1Html) {
      paragraphs.splice(3, 0, '</p><div class="container my-8">' + adInread1Html + '</div>')
    }
    if (paragraphs.length > 8 && adInread2Html) {
      paragraphs.splice(7, 0, '</p><div class="container my-8">' + adInread2Html + '</div>')
    }
    contentWithAds = paragraphs.join('</p>')
  }

  // JSON-LD
  const postForJsonLd = {
    title: post.title,
    excerpt: post.excerpt,
    slug: post.slug,
    published_at: post.published_at,
    updated_at: post.published_at,
    author: { name: post.author_name || 'Redação' },
    coverMedia: post.featured_image_r2_key ? {
      r2_key: post.featured_image_r2_key,
      width: 1200,
      height: 675
    } : null
  }

  const isLiveBlog = post.template === 'liveblog'
  const liveUpdates = isLiveBlog ? await findLiveUpdates(c.env, post.id) : []

  const articleJsonLd = isLiveBlog
    ? generateLiveBlogJsonLd(postForJsonLd, liveUpdates, baseUrl, siteName)
    : generateArticleJsonLd(postForJsonLd, baseUrl, siteName)

  const breadcrumbJsonLd = generateBreadcrumbJsonLd([
    { name: 'Home', url: baseUrl },
    { name: post.category_name, url: `${baseUrl}/categoria/${post.category_slug}` },
    { name: post.title, url: canonicalUrl }
  ], baseUrl)

  const extraHeadHtml = `
    ${post.seo_noindex ? '<meta name="robots" content="noindex, follow">' : ''}
    ${generateOGTags(post, baseUrl)}
    <script type="application/ld+json" nonce="${nonce}">
      ${articleJsonLd}
    </script>
    <script type="application/ld+json" nonce="${nonce}">
      ${breadcrumbJsonLd}
    </script>
    ${isLiveBlog && post.is_live ? renderLiveBlogScript(post.slug) : ''}
  `

  // Build body HTML
  const bodyHtml = `
    <article class="article-detail" style="padding-bottom: 4rem;">
      <!-- Ad: Top -->
      ${adTopHtml ? `<div class="container mb-8">${adTopHtml}</div>` : ''}
      
      ${renderArticleHeader(post, readingTime)}
      
      <!-- Content -->
      ${isLiveBlog ? renderLiveBlogTimeline(liveUpdates, post.is_live === 1) : renderArticleContent(contentWithAds, isBlocked)}
      
      ${!isBlocked ? `
        <!-- Ad: Footer -->
        ${adFooterHtml ? `<div class="container mt-12">${adFooterHtml}</div>` : ''}
        
        <!-- Related Posts -->
        ${renderRelatedPosts(relatedPosts, baseUrl)}
      ` : ''}
    </article>
    
    ${adsScript}
  `

  // Determine Theme
  const themeSetting = await getSetting(c.env, 'public_theme')
  const theme = (themeSetting === 'minimal' || themeSetting === '"minimal"') ? 'minimal' : 'default'

  return renderPublicLayout({
    title: post.seo_title ? `${post.seo_title} | ${siteName}` : `${post.title} | ${siteName}`,
    description: post.seo_description || post.excerpt || post.title,
    canonicalUrl,
    nonce,
    siteName,
    navItems,
    coverOfDay,
    bodyHtml,
    extraHeadHtml,
    theme
  })
}
