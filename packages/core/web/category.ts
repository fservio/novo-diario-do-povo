/**
 * Category Page Renderer (Verge Style)
 * Sub-home layout with pagination
 */

import type { Context } from 'hono'
import type { Env, AppContext } from '../types'
import type { CategoryPageData, CategoryPost } from '../db/category'
import { renderPublicLayout, escapeHtml, escapeAttr, type PublicLayoutParams } from './layout'
import { renderAdSlot, findActiveSlotsByTemplate, generateAdsLoaderScript } from '../ads'

// ============================================================================
// Helpers
// ============================================================================

function formatDate(isoDate: string): string {
  const date = new Date(isoDate)
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength) + '...'
}

// ============================================================================
// Component Renderers
// ============================================================================

function renderPostCard(post: CategoryPost, baseUrl: string, showImage: boolean): string {
  const imageHtml = showImage && post.featured_image_r2_key ? `
    <div style="margin-bottom: 1rem;">
      <img 
        src="/i/${escapeAttr(post.featured_image_r2_key)}" 
        alt="${escapeAttr(post.title)}"
        style="width: 100%; aspect-ratio: 16/9; object-fit: cover; border-radius: 0.5rem;"
        loading="lazy"
        width="400"
        height="225"
      >
    </div>
  ` : ''
  
  return `
    <article class="card" style="margin-bottom: 1.5rem;">
      ${imageHtml}
      <h3 style="margin: 0 0 0.5rem 0; font-size: 1.25rem; font-weight: 700;">
        <a href="/noticia/${escapeAttr(post.slug)}" style="text-decoration: none; color: inherit;">
          ${escapeHtml(post.title)}
        </a>
      </h3>
      <div style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.75rem;">
        ${formatDate(post.published_at)}
      </div>
      ${post.excerpt ? `
        <p style="margin: 0; color: var(--text-secondary); line-height: 1.6;">
          ${escapeHtml(truncate(post.excerpt, 150))}
        </p>
      ` : ''}
    </article>
  `
}

function renderPagination(page: number, totalPages: number, baseUrl: string): string {
  if (totalPages <= 1) return ''
  
  const prevPage = page > 1 ? page - 1 : null
  const nextPage = page < totalPages ? page + 1 : null
  
  return `
    <nav id="pagination" style="margin: 3rem 0; display: flex; justify-content: center; align-items: center; gap: 1rem;">
      ${prevPage ? `
        <a href="${escapeAttr(baseUrl)}?page=${prevPage}" 
           style="padding: 0.5rem 1rem; background: white; border: 1px solid var(--border); border-radius: 0.375rem; text-decoration: none; color: inherit;">
          ← Anterior
        </a>
      ` : ''}
      
      <span style="color: var(--text-secondary);">
        Página ${page} de ${totalPages}
      </span>
      
      ${nextPage ? `
        <a href="${escapeAttr(baseUrl)}?page=${nextPage}"
           style="padding: 0.5rem 1rem; background: white; border: 1px solid var(--border); border-radius: 0.375rem; text-decoration: none; color: inherit;">
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
    <div class="container" style="padding-top: 2rem; padding-bottom: 4rem;">
      <!-- Category Header -->
      <div style="margin-bottom: 2rem;">
        <h1 id="categoryTitle" style="margin: 0 0 0.5rem 0; font-size: 2.5rem; font-weight: 900;">
          ${escapeHtml(category.name)}
        </h1>
        ${category.description ? `
          <p style="font-size: 1.125rem; color: var(--text-secondary); margin: 0;">
            ${escapeHtml(category.description)}
          </p>
        ` : ''}
      </div>
      
      <!-- Ad: Top -->
      ${adTopHtml}
      
      <!-- Posts List -->
      <div id="categoryList">
  `
  
  // Render posts with smart image distribution (1 every 3 posts)
  posts.forEach((post, index) => {
    const showImage = index % 3 === 0
    bodyHtml += renderPostCard(post, baseUrl, showImage)
    
    // Insert ads
    if (index === 5 && adInfeed1Html) {
      bodyHtml += adInfeed1Html
    }
    if (index === 13 && adInfeed2Html) {
      bodyHtml += adInfeed2Html
    }
  })
  
  bodyHtml += `
      </div>
      
      <!-- Pagination -->
      ${renderPagination(page, totalPages, `/categoria/${category.slug}`)}
    </div>
    
    ${adsScript}
  `
  
  // Use shared layout
  return renderPublicLayout({
    title: `${category.name} | ${siteName}`,
    description: category.description || `Notícias de ${category.name}`,
    canonicalUrl,
    nonce,
    siteName,
    navItems,
    coverOfDay,
    bodyHtml
  })
}
