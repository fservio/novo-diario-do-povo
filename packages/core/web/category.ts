/**
 * Category Page Renderer
 * Modern & Minimalist Design System
 */

import type { Context } from 'hono'
import type { Env, AppContext } from '../types'
import type { CategoryPageData, CategoryPost } from '../db/category'
import { renderPublicLayout, escapeHtml, escapeAttr, formatDate, truncate, type PublicLayoutParams } from './layout'
import { getPostUrl } from '../utils/post'
import { renderAdSlot, findActiveSlotsByTemplate, generateAdsLoaderScript } from '../ads'
import { getSetting } from '../db'
import { getActiveCategories } from '../db/categories-cache'

// ============================================================================
// Shared Renderers (Ported from Home)
// ============================================================================

function renderPostGB(post: CategoryPost, baseUrl: string, params?: { isLcp?: boolean }): string {
  const authorName = post.author_name || 'Redação'
  return `
    <article class="gb-card">
      <a href="${getPostUrl(post, baseUrl)}" class="gb-card__link">
        <div class="gb-card__media">
          <img 
            src="${post.featured_image_r2_key ? `/i/${escapeAttr(post.featured_image_r2_key)}?w=600` : '/static/placeholder.jpg'}" 
            alt="${escapeAttr(post.title)}"
            class="img-aesthetic"
            loading="${params?.isLcp ? 'eager' : 'lazy'}"
            ${params?.isLcp ? 'fetchpriority="high"' : ''}
            onerror="this.onerror=null;this.src='/static/placeholder.jpg';"
          />
        </div>
        <div class="gb-card__content">
          ${post.hat ? `<span class="gb-hat">${escapeHtml(post.hat)}</span>` : ''}
          
          <h3 class="gb-title--card">
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
  }
): Promise<string> {
  const { category, posts, page, totalPages } = data
  const { baseUrl, siteName, navItems, coverOfDay } = options
  const nonce = c.get('cspNonce') || ''

  // Ads
  const adSlots = await findActiveSlotsByTemplate(c.env, 'category')
  const adTop = adSlots.find(s => s.name === 'category_top_leaderboard')
  const adMid = adSlots.find(s => s.name === 'category_infeed')

  const pageContext = { template: 'category' as const, slug: category.slug }
  const userContext = { isSubscriber: false } // Todo: check user

  const adTopHtml = adTop ? renderAdSlot({ slot: adTop, page: pageContext, user: userContext }) : ''
  const adMidHtml = adMid ? renderAdSlot({ slot: adMid, page: pageContext, user: userContext }) : ''
  const adsScript = await generateAdsLoaderScript(c.env)

  // Fetch active categories for mobile menu
  const categories = await getActiveCategories(c.env)

  // Layout Logic: Hero + Carousel
  const hero = posts.length > 0 ? posts[0] : null
  const list = posts.length > 1 ? posts.slice(1) : []

  const bodyHtml = `
    <div style="font-family: var(--font-sans); background: var(--gb-bg); color: var(--gb-text); min-height: 100vh;">
      
      <!-- Category Header -->
      <header class="gb-container py-8 border-b border-gray-100 mb-8">
        <h1 class="text-4xl font-black tracking-tight mb-2">${escapeHtml(category.name)}</h1>
        ${category.description ? `<p class="text-gray-500 text-lg">${escapeHtml(category.description)}</p>` : ''}
      </header>

      ${adTopHtml ? `<div class="gb-container mb-8 text-center">${adTopHtml}</div>` : ''}

      <!-- Hero Section -->
      ${hero ? `
        <section class="gb-container gb-hero mb-12">
          <div class="gb-grid gb-hero__grid">
            <div class="gb-hero__content">
              <span class="gb-hat">${escapeHtml(hero.category_name)}</span>
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
            <div class="gb-hero__media">
               <a href="${getPostUrl(hero, baseUrl)}">
                <img 
                  src="${hero.featured_image_r2_key ? `/i/${escapeAttr(hero.featured_image_r2_key)}` : '/hero-placeholder.jpg'}" 
                  alt="${escapeAttr(hero.title)}" 
                  class="img-aesthetic"
                  loading="eager"
                  fetchpriority="high"
                />
               </a>
            </div>
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
           <div id="carousel-cat" class="gb-carousel">
              ${list.map(p => renderPostGB(p, baseUrl)).join('')}
           </div>
        </section>
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
        const carousel = document.getElementById(targetId);
        
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

  // Determine Theme
  const themeSetting = await getSetting(c.env, 'public_theme')
  const theme = (themeSetting === 'minimal' || themeSetting === '"minimal"') ? 'minimal' : 'default'

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
    theme
  })
}
