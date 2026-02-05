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
import { getActiveCategories } from '../db/categories-cache'

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

function renderArticleCard(post: RelatedPost, baseUrl: string, options?: { isLarge?: boolean }): string {
  const authorName = post.author_name || 'Redação'
  const isLarge = options?.isLarge

  // For "Next Post" (Large), we might want a different layout, 
  // but for consistency with Home "gb-card", we'll stick to the aesthetic but maybe wider.
  // Actually, let's make the Large one a horizontal card if possible, or just a big vertical one.
  // Let's us the standard gb-card but ensure image quality.

  return `
    <article class="gb-card ${isLarge ? 'gb-card--large' : ''}">
      <a href="${getPostUrl(post, baseUrl)}" class="gb-card__link">
        <div class="gb-card__media">
          <img 
            src="${post.featured_image_r2_key ? `/i/${escapeAttr(post.featured_image_r2_key)}?w=${isLarge ? '1200' : '600'}` : '/static/placeholder.jpg'}" 
            alt="${escapeAttr(post.title)}"
            class="img-aesthetic"
            loading="lazy"
            onerror="this.onerror=null;this.src='/static/placeholder.jpg';"
          />
        </div>
        <div class="gb-card__content">
          ${post.hat ? `<span class="gb-hat">${escapeHtml(post.hat)}</span>` : ''}
          
          <h3 class="gb-title--card" ${isLarge ? 'style="font-size: 32px;"' : ''}>
            ${escapeHtml(post.title)}
          </h3>
          
          <div class="gb-meta">
            <span>${escapeHtml(authorName)}</span>
            <span>• ${escapeHtml(post.category_name)}</span>
          </div>
        </div>
      </a>
    </article>
  `
}

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

import type { AccessCheckResult } from '../paywall'

function renderPaywallGate(access: AccessCheckResult, baseUrl: string): string {
  const reason = access.reason
  const cta = access.cta || { primary: 'subscribe_monthly' }

  // Login URL with redirect back
  // We can't easily get current URL inside this pure function unless passed, 
  // but we can rely on client side or pass generic return url.
  // Ideally client-side handling or refined href.

  let title = 'Conteúdo Exclusivo'
  let description = 'Este artigo é exclusivo para assinantes. Continue lendo e tenha acesso a análises profundas.'
  let buttons = ''

  if (reason === 'not_logged_in') {
    title = 'Faça login para continuar'
    description = 'Já é assinante? Entre na sua conta. Ou assine agora por apenas R$ 9,90/mês.'
    buttons = `
      <a href="/portal/login?next=${encodeURIComponent(access.subscriber?.returnUrl || 'back')}" class="gb-btn gb-btn--primary mb-4 w-full">Entrar</a>
      <form method="POST" action="/api/portal/assinatura/start" class="w-full">
        <input type="hidden" name="plan" value="mensal">
        <button type="submit" class="gb-btn gb-btn--secondary w-full">Assinar (R$ 9,90)</button>
      </form>
    `
  } else if (reason === 'not_subscribed' || reason === 'metering_limit_reached') {
    title = 'Assine para ler tudo'
    description = 'Tenha acesso ilimitado a todas as notícias e colunas exclusivos.'
    buttons = `
      <form method="POST" action="/api/portal/assinatura/start" class="w-full mb-3">
        <input type="hidden" name="plan" value="mensal">
        <button type="submit" class="gb-btn gb-btn--primary w-full">Assinar Mensal (R$ 9,90)</button>
      </form>
       <form method="POST" action="/api/portal/assinatura/start" class="w-full">
        <input type="hidden" name="plan" value="anual">
        <button type="submit" class="gb-btn gb-btn--secondary w-full">Assinar Anual (R$ 89,90)</button>
      </form>
    `
  } else if (reason === 'past_due') {
    title = 'Assinatura Pendente'
    description = 'Sua assinatura está com pagamento em aberto. Regularize para continuar lendo.'
    buttons = `
      <a href="/portal" class="gb-btn gb-btn--primary w-full">Regularizar Agora</a>
    `
  }

  return `
    <div class="paywall-gate">
      <div class="paywall-content">
        <div class="paywall-icon">🔒</div>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(description)}</p>
        <div class="paywall-actions">
           ${buttons}
        </div>
      </div>
    </div>
    <style>
      .paywall-gate {
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 2rem;
        text-align: center;
        margin: 2rem auto;
        max-width: 600px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      }
      .paywall-icon { font-size: 3rem; margin-bottom: 1rem; }
      .paywall-content h3 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.5rem; color: #111827; }
      .paywall-content p { color: #4b5563; margin-bottom: 1.5rem; }
      .paywall-actions { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; max-width: 300px; margin: 0 auto; }
      .gb-btn { 
        display: inline-flex; justify-content: center; align-items: center;
        padding: 0.75rem 1.5rem; border-radius: 6px; font-weight: 600; cursor: pointer; text-decoration: none; transition: all 0.2s;
        border: none; font-size: 1rem;
      }
      .gb-btn--primary { background: #2563eb; color: white; }
      .gb-btn--primary:hover { background: #1d4ed8; }
      .gb-btn--secondary { background: white; border: 1px solid #d1d5db; color: #374151; }
      .gb-btn--secondary:hover { background: #f3f4f6; }
      .article-content.teaser-mode {
         mask-image: linear-gradient(to bottom, black 50%, transparent 100%);
         -webkit-mask-image: linear-gradient(to bottom, black 50%, transparent 100%);
         padding-bottom: 0;
         margin-bottom: 0;
      }
    </style>
  `
}

function renderArticleContent(content: string, isBlocked: boolean, accessCheck?: AccessCheckResult): string {
  if (isBlocked && accessCheck) {
    return `
      <div id="articleBody" class="article-content teaser-mode">
        ${content}
      </div>
      ${renderPaywallGate(accessCheck, '/')}
    `
  }

  return `
    <div id="articleBody" class="article-content">
      ${content}
    </div>
  `
}

// ============================================================================
// Related Posts Renderer
// ============================================================================

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
    accessCheck?: AccessCheckResult
  },
  contentSource?: string
): Promise<string> {
  const { baseUrl, siteName, navItems, coverOfDay, relatedPosts, mostRead, isBlocked, accessCheck } = options

  const nonce = c.get('cspNonce') || ''
  const canonicalUrl = post.seo_canonical || getPostUrl(post, baseUrl)

  // Use passed contentSource (teaser) OR full content
  const contentRaw = contentSource || post.content_markdown || post.content || ''

  const contentHtml = (post.content_markdown && post.content_markdown.length > 0) || looksLikeMarkdown(contentRaw)
    ? renderMarkdownToHtml(contentRaw)
    : sanitizeHtml(contentRaw)

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
        <!-- Footer Navigation: Next + Related + Most Read -->
        <div class="container mt-12 pt-12 border-t border-gray-200">
          
          <!-- 1. Next Post (Prominent) -->
          ${relatedPosts.length > 0 ? `
            <div class="mb-16">
              <h3 class="gb-section__title mb-6">A seguir</h3>
              ${renderArticleCard(relatedPosts[0], baseUrl, { isLarge: true })}
            </div>
          ` : ''}

          <!-- 2. Related Posts (Grid) -->
          ${relatedPosts.length > 1 ? `
            <div class="mb-16">
              <h3 class="gb-section__title mb-6">Relacionadas</h3>
              <div class="gb-grid" style="grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));">
                ${relatedPosts.slice(1, 4).map(p => renderArticleCard(p, baseUrl)).join('')}
              </div>
            </div>
          ` : ''}

          <!-- 3. Most Read (Grid) -->
          ${mostRead && mostRead.length > 0 ? `
             <div class="mb-12">
              <h3 class="gb-section__title mb-6">Mais Lidas</h3>
              <div class="gb-grid" style="grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));">
                ${mostRead.slice(0, 4).map(p => renderArticleCard(p, baseUrl)).join('')}
              </div>
            </div>
          ` : ''}

          <!-- Ad: Footer -->
          ${adFooterHtml ? `<div class="mb-12">${adFooterHtml}</div>` : ''}
          
        </div>
      ` : ''}
    </article>
    
    ${adsScript}
  `

  // Determine Theme
  const themeSetting = await getSetting(c.env, 'public_theme')
  const theme = (themeSetting === 'minimal' || themeSetting === '"minimal"') ? 'minimal' : 'default'

  // Fetch categories for mobile menu
  const categories = await getActiveCategories(c.env)

  return renderPublicLayout({
    title: post.seo_title ? `${post.seo_title} | ${siteName}` : `${post.title} | ${siteName}`,
    description: post.seo_description || post.excerpt || post.title,
    canonicalUrl,
    nonce,
    siteName,
    navItems,
    categories,
    coverOfDay,
    bodyHtml,
    extraHeadHtml,
    theme,
    subscriber: options.accessCheck?.subscriber
  })
}
