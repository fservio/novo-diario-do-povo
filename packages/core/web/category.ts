/**
 * Category Page Renderer
 * Modern & Minimalist Design System
 */

import type { Context } from 'hono'
import type { Env, AppContext } from '../types'
import type { CategoryPageData, CategoryPost } from '../db/category'
import { renderPublicLayout, escapeHtml, escapeAttr, formatDate, truncate, generateSrcSet, normalizePublicTheme, type PublicLayoutParams } from './layout'
import { getPostUrl } from '../utils/post'
import { renderAdSlot, findActiveSlotsByTemplate, generateAdsLoaderScript } from '../ads'
import { getSetting } from '../db'
import { getActiveCategories } from '../db/categories-cache'

// ============================================================================
// Shared Renderers (Ported from Home)
// ============================================================================

function isRecentlyPublished(isoDate: string): boolean {
  try {
    const published = new Date(isoDate).getTime()
    const now = new Date().getTime()
    const diffMinutes = (now - published) / (1000 * 60)
    return diffMinutes >= 0 && diffMinutes <= 30
  } catch {
    return false
  }
}

function renderPostGB(post: CategoryPost, baseUrl: string, params?: { isLcp?: boolean; isAllType?: boolean }): string {
  const authorName = post.author_name || 'Redação'
  const isLive = isRecentlyPublished(post.published_at)
  const isAllType = params?.isAllType || false

  return `
    <article class="gb-card">
      <a href="${getPostUrl(post, baseUrl)}" class="gb-card__link">
        ${!isAllType ? `
        <div class="gb-card__media" style="aspect-ratio: 3/2; overflow: hidden; background: #f0f0f0;">
          <img 
            src="${post.featured_image_r2_key ? `/i/${escapeAttr(post.featured_image_r2_key)}?w=600` : '/static/logo-dp.png'}" 
            ${post.featured_image_r2_key ? `srcset="${generateSrcSet(post.featured_image_r2_key)}"` : ''}
            sizes="(max-width: 600px) 100vw, 600px"
            alt="${escapeAttr(post.title)}"
            style="width: 100%; height: 100%; object-fit: cover;"
            loading="${params?.isLcp ? 'eager' : 'lazy'}"
            ${params?.isLcp ? 'fetchpriority="high"' : ''}
          />
        </div>
        ` : ''}
        <div class="gb-card__content">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            ${post.hat ? `<span class="gb-hat" style="margin-bottom: 0;">${escapeHtml(post.hat)}</span>` : `<span class="gb-hat" style="margin-bottom: 0;">${escapeHtml(post.category_name)}</span>`}
            ${isLive ? `<span class="gb-live-indicator" style="background: #d93025; color: white; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; animation: gb-pulse 2s infinite;">AO VIVO</span>` : ''}
          </div>
          
          <h3 class="gb-title--card">
            ${escapeHtml(post.title)}
          </h3>
          
          <div class="gb-meta">
            <span>${escapeHtml(authorName)}</span>
            <span>• ${formatDate(post.published_at)}</span>
          </div>
        </div>
      </a>
    </article>
  `
}

// ============================================================================
// Main Renderer
// ============================================================================

export async function renderCategoryPage(
  c: Context<{ Bindings: Env; Variables: AppContext }>,
  data: CategoryPageData,
  options: {
    baseUrl: string
    siteName: string
    navItems: Array<{ label: string; href: string; active?: boolean }>
    coverOfDay?: { r2Key: string; alt: string; aspectRatio?: string } | null
    subscriber?: any
    googleAnalyticsId?: string
  }
): Promise<string> {
  const { category, posts, page, hasNextPage } = data
  const { baseUrl, siteName, navItems, coverOfDay } = options
  const nonce = c.get('cspNonce') || ''

  // Determine Theme
  const themeSetting = await getSetting(c.env, 'public_theme')
  const theme = normalizePublicTheme(themeSetting)
  const isAllType = theme === 'alltype'

  // Ads
  const adSlots = await findActiveSlotsByTemplate(c.env, 'category')
  const adTop = adSlots.find(s => s.name === 'category_top_leaderboard')
  const adMid = adSlots.find(s => s.name === 'category_infeed')

  const pageContext = { template: 'category' as const, slug: category.slug }
  const userContext = { isSubscriber: false } // Todo: check user

  const adTopHtml = adTop ? renderAdSlot({ slot: adTop, page: pageContext, user: userContext }) : ''
  const adMidHtml = adMid ? renderAdSlot({ slot: adMid, page: pageContext, user: userContext }) : ''
  const adsScript = await generateAdsLoaderScript(c.env, nonce)

  // Fetch active categories for mobile menu
  const categories = await getActiveCategories(c.env)

  // Layout Logic: Hero + Carousel
  const hero = posts.length > 0 ? posts[0] : null
  const list = posts.length > 1 ? posts.slice(1) : []

  const bodyHtml = `
    <div style="font-family: var(--font-sans); background: var(--gb-bg); color: var(--gb-text); min-height: 100vh;">
      
      <!-- Category Header -->
      <header class="gb-container py-8 border-b border-gray-100 mb-8 ${isAllType ? 'editorial-heavy-divider' : ''}">
        <h1 id="categoryTitle" class="text-4xl font-black tracking-tight mb-2">${escapeHtml(category.name)}</h1>
        ${category.description ? `<p class="text-gray-500 text-lg">${escapeHtml(category.description)}</p>` : ''}
      </header>

      ${adTopHtml ? `<div class="gb-container mb-8 text-center">${adTopHtml}</div>` : ''}

      <!-- Hero Section -->
      ${hero ? `
        <section class="gb-container gb-hero mb-12">
          <div class="gb-grid gb-hero__grid">
            <div class="gb-hero__content">
              <span class="gb-hat ${isAllType ? 'category-chip' : ''}">${escapeHtml(hero.category_name)}</span>
              <h2 class="gb-title--hero">
                <a href="${getPostUrl(hero, baseUrl)}">${escapeHtml(hero.title)}</a>
              </h2>
              <p class="gb-excerpt--hero">
                ${escapeHtml(truncate(hero.excerpt, 120))}
              </p>
              <div class="gb-meta">
                 <div style="display: flex; align-items: center; gap: 12px;">
                    ${hero.author_name ? `<span style="font-weight: 500; color: var(--gb-text);">${hero.author_name}</span>` : ''}
                    <span>${formatDate(hero.published_at)}</span>
                 </div>
              </div>
            </div>
            ${!isAllType ? `
            <div class="gb-hero__media">
               <a href="${getPostUrl(hero, baseUrl)}">
                <div class="gb-media-wrapper" style="aspect-ratio: 16 / 9; background: #f0f0f0;">
                  <img 
                    src="${hero.featured_image_r2_key ? `/i/${escapeAttr(hero.featured_image_r2_key)}?w=1200` : '/hero-placeholder.jpg'}" 
                    ${hero.featured_image_r2_key ? `srcset="${generateSrcSet(hero.featured_image_r2_key)}"` : ''}
                    sizes="(max-width: 800px) 100vw, 1200px"
                    alt="${escapeAttr(hero.title)}" 
                    width="1200"
                    height="675"
                    loading="eager"
                    fetchpriority="high"
                  />
                </div>
               </a>
            </div>
            ` : ''}
          </div>
        </section>
      ` : ''}

      ${adMidHtml ? `<div class="gb-container mb-12 text-center">${adMidHtml}</div>` : ''}

      <!-- Carousel / List Section -->
      ${list.length > 0 ? `
         <section class="gb-container gb-section">
            <div class="gb-section__header">
              <h2 class="gb-section__title">Mais em ${escapeHtml(category.name)}</h2>
              <div class="gb-carousel-controls">
                 <button class="gb-control-btn" data-carousel-target="carousel-cat" data-direction="prev" aria-label="Previous">←</button>
                 <button class="gb-control-btn" data-carousel-target="carousel-cat" data-direction="next" aria-label="Next">→</button>
              </div>
            </div>
            <div id="categoryList" class="gb-carousel">
              ${list.map(p => renderPostGB(p, baseUrl, { isAllType })).join('')}
            </div>
         </section>
      ` : ''}

      ${(page > 1 || hasNextPage) ? `
        <nav id="pagination" class="gb-container" style="display: flex; justify-content: center; gap: 12px; margin: 32px auto;" aria-label="Paginacao">
          ${page > 1 ? `<a class="gb-btn gb-btn--text" href="/categoria/${escapeAttr(category.slug)}?page=${page - 1}">Anterior</a>` : ''}
          <span style="align-self: center; color: #5f6368; font-size: 0.875rem;">Pagina ${page}</span>
          ${hasNextPage ? `<a class="gb-btn gb-btn--text" href="/categoria/${escapeAttr(category.slug)}?page=${page + 1}">Proxima</a>` : ''}
        </nav>
      ` : ''}

      ${posts.length === 0 ? `
        <div class="gb-container py-12 text-center text-gray-500">
          Nenhum artigo encontrado nesta categoria.
        </div>
      ` : ''}

    </div>
    
    ${adsScript}
    
    <!-- Carousel Script (Reused) -->
    <script nonce="${nonce}">
      document.addEventListener('click', function(e) {
        const btn = e.target.closest('.gb-control-btn');
        if (!btn) return;
        
        const targetId = btn.getAttribute('data-carousel-target');
        const direction = btn.getAttribute('data-direction');
        const carousel = targetId === 'carousel-cat'
          ? document.getElementById('categoryList')
          : document.getElementById(targetId);
        
        if (carousel) {
          const scrollAmount = carousel.clientWidth * 0.8; 
          carousel.scrollBy({
            left: direction === 'next' ? scrollAmount : -scrollAmount,
            behavior: 'smooth'
          });
        }
      });
    </script>
  `

  return renderPublicLayout({
    title: `${category.name} - ${siteName}`,
    description: category.description || `Notícias sobre ${category.name}`,
    canonicalUrl: `${baseUrl}/categoria/${category.slug}`,
    nonce,
    siteName,
    navItems,
    categories,
    coverOfDay,
    bodyHtml,
    theme,
    subscriber: options.subscriber,
    googleAnalyticsId: options.googleAnalyticsId,
    lcpPreloadUrl: hero?.featured_image_r2_key ? `/i/${escapeAttr(hero.featured_image_r2_key)}?w=1200` : undefined,
    lcpSrcSet: hero?.featured_image_r2_key ? generateSrcSet(hero.featured_image_r2_key) : undefined
  })
}
