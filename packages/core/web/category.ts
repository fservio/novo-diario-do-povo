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
// Helpers
// ============================================================================

// Helpers removed and imported from layout.ts

// ============================================================================
// Component Renderers
// ============================================================================

function renderPostCard(post: CategoryPost, baseUrl: string, showImage: boolean): string {
  const imageHtml = showImage && post.featured_image_r2_key ? `
    <div style="aspect-ratio: 16/9; margin-bottom: 1rem;">
      <img 
        src="/i/${escapeAttr(post.featured_image_r2_key)}" 
        alt="${escapeAttr(post.title)}"
        class="card-img"
        loading="lazy"
        style="height: 100%; border-radius: var(--radius-md);"
      >
    </div>
  ` : ''

  return `
    <article class="card hover:shadow-lg transition">
      <a href="${getPostUrl(post, baseUrl)}" class="card-body">
        ${imageHtml}
        <h3 class="font-bold text-xl mb-2">
          ${escapeHtml(post.title)}
        </h3>
        <div class="text-xs text-gray-500 mb-3">
          ${formatDate(post.published_at)}
        </div>
        ${post.excerpt ? `
          <p class="text-gray-600 text-sm m-0">
            ${escapeHtml(truncate(post.excerpt, 150))}
          </p>
        ` : ''}
      </a>
    </article>
  `
}

function renderPagination(page: number, totalPages: number, baseUrl: string): string {
  if (totalPages <= 1) return ''

  const prevPage = page > 1 ? page - 1 : null
  const nextPage = page < totalPages ? page + 1 : null

  return `
    <nav id="pagination" class="flex justify-center items-center gap-4 my-12">
      ${prevPage ? `
        <a href="${escapeAttr(baseUrl)}?page=${prevPage}" class="btn btn-outline">
          ← Anterior
        </a>
      ` : ''}
      
      <span class="text-gray-500 font-medium">
        Página ${page} de ${totalPages}
      </span>
      
      ${nextPage ? `
        <a href="${escapeAttr(baseUrl)}?page=${nextPage}" class="btn btn-outline">
          Próxima →
        </a>
      ` : ''}
    </nav>
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
  const canonicalUrl = `${baseUrl}/categoria/${category.slug}${page > 1 ? `?page=${page}` : ''}`

  // Get ad slots
  const adSlots = await findActiveSlotsByTemplate(c.env, 'listing')
  const adTop = adSlots.find(s => s.name === 'listing_top')
  const adInfeed1 = adSlots.find(s => s.name === 'listing_infeed_1')
  const adInfeed2 = adSlots.find(s => s.name === 'listing_infeed_2')

  // Render ads
  const pageContext = { path: c.req.path, referrer: c.req.header('referer') || '', template: 'listing' }
  const userContext = { isSubscriber: false, isLoggedIn: false }

  const adTopHtml = adTop ? renderAdSlot({ slot: adTop, page: pageContext, user: userContext }) : ''
  const adInfeed1Html = adInfeed1 ? renderAdSlot({ slot: adInfeed1, page: pageContext, user: userContext }) : ''
  const adInfeed2Html = adInfeed2 ? renderAdSlot({ slot: adInfeed2, page: pageContext, user: userContext }) : ''

  // Ads loader script
  const adsScript = await generateAdsLoaderScript(c.env)

  // Build body HTML
  let bodyHtml = `
    <div class="container py-8">
      <!-- Category Header -->
      <div class="mb-8 text-center max-w-3xl mx-auto">
        <h1 id="categoryTitle" class="text-4xl font-black mb-4">
          ${escapeHtml(category.name)}
        </h1>
        ${category.description ? `
          <p class="text-xl text-gray-500">
            ${escapeHtml(category.description)}
          </p>
        ` : ''}
      </div>
      
      <!-- Ad: Top -->
      ${adTopHtml ? `<div class="mb-8">${adTopHtml}</div>` : ''}
      
      <!-- Posts Grid -->
      <div id="categoryList" class="grid grid-cols-1 md:grid-cols-3 gap-6">
  `

  // Render posts
  posts.forEach((post, index) => {
    // Show image for first post and every 3rd post thereafter
    const showImage = index === 0 || index % 3 === 0
    bodyHtml += renderPostCard(post, baseUrl, showImage)

    // Insert ads (spanning full width)
    if (index === 5 && adInfeed1Html) {
      bodyHtml += `</div><div class="my-8">${adInfeed1Html}</div><div class="grid grid-cols-1 md:grid-cols-3 gap-6">`
    }
    if (index === 13 && adInfeed2Html) {
      bodyHtml += `</div><div class="my-8">${adInfeed2Html}</div><div class="grid grid-cols-1 md:grid-cols-3 gap-6">`
    }
  })

  bodyHtml += `
      </div>
      
      <!-- Pagination -->
      ${renderPagination(page, totalPages, `/categoria/${category.slug}`)}
    </div>
    
    ${adsScript}
  `

  // Determine Theme
  const themeSetting = await getSetting(c.env, 'public_theme')
  const theme = (themeSetting === 'minimal' || themeSetting === '"minimal"') ? 'minimal' : 'default'

  // Fetch categories for mobile menu
  const categories = await getActiveCategories(c.env)

  // Use shared layout
  return renderPublicLayout({
    title: `${category.name} | ${siteName}`,
    description: category.description || `Notícias de ${category.name}`,
    canonicalUrl,
    nonce,
    siteName,
    navItems,
    categories,
    coverOfDay,
    bodyHtml,
    theme
  })
}
