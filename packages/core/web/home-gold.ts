import type { Context } from 'hono'
import type { Env, AppContext } from '../types'
import type { HomeData, HomePost } from '../db/home'
import { renderPublicLayoutGold } from './layout-gold'

// Helper helpers
function escapeHtml(unsafe: string | null | undefined): string {
  if (!unsafe) return ''
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

function getPostUrl(post: HomePost, baseUrl: string): string {
  // If external or special logic needed, add here.
  // For now, simple slug structure
  return `/v2/noticia/${post.slug}`
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }) + ' • ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  } catch (e) {
    return ''
  }
}

// ----------------------------------------------------------------------------
// Components
// ----------------------------------------------------------------------------

function renderHeroGold(hero: HomePost | null, baseUrl: string): string {
  if (!hero) return ''

  // 16:9 Aspect Ratio Container for Image
  const imageUrl = hero.featured_image_r2_key
    ? `/i/${hero.featured_image_r2_key}`
    : '/static/placeholder.jpg'

  return `
    <article class="gb-card gb-card--hero">
      <a href="${getPostUrl(hero, baseUrl)}" class="gb-card__media">
         <img src="${imageUrl}" alt="${escapeHtml(hero.title)}" loading="eager" />
      </a>
      <div style="margin-top: var(--space-3);">
         <span class="gb-hat">${escapeHtml(hero.category_name)}</span>
         <h1 class="gb-title gb-title--hero">
            <a href="${getPostUrl(hero, baseUrl)}">${escapeHtml(hero.title)}</a>
         </h1>
         ${hero.excerpt ? `<p class="gb-excerpt" style="font-size: 18px; margin-top: var(--space-2); margin-bottom: var(--space-3);">${escapeHtml(hero.excerpt)}</p>` : ''}
         <div class="gb-meta">
            ${escapeHtml(hero.author_name || 'Redação')} • ${formatDate(hero.published_at)}
         </div>
      </div>
    </article>
  `
}

function renderLatestListGold(posts: HomePost[], baseUrl: string): string {
  return `
      <div style="padding-left: var(--space-3); border-left: 1px solid var(--border-subtle); height: 100%;">
        <h3 style="font-size: 14px; font-weight: 800; text-transform: uppercase; color: var(--brand-color); margin-bottom: var(--space-3); letter-spacing: 0.05em;">
           Últimas
        </h3>
        <div style="display: flex; flex-direction: column;">
           ${posts.map(post => `
             <article class="gb-card gb-card--list">
               <div>
                  <h3 class="gb-title gb-title--list">
                    <a href="${getPostUrl(post, baseUrl)}">${escapeHtml(post.title)}</a>
                  </h3>
                  <div class="gb-meta">
                    ${new Date(post.published_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
               </div>
             </article>
           `).join('')}
        </div>
      </div>
    `
}

// ----------------------------------------------------------------------------
// Main Page Renderer
// ----------------------------------------------------------------------------

export async function renderHomePageGold(
  c: Context<{ Bindings: Env; Variables: AppContext }>,
  data: HomeData,
  params: {
    baseUrl: string
    siteName: string
    coverR2Key: string
    coverAlt: string
    coverAspectRatio: string
  }
): Promise<string> {
  const { baseUrl, siteName, coverR2Key, coverAlt, coverAspectRatio } = params

  // Extract Data
  const heroPost = data.hero
  const latestPosts = data.hotRail.slice(0, 8) // Top 8 for dense sidebar
  const featuredPosts = await Promise.all(data.categoryBlocks.map(async cat => {
    // Just grabbing one feature from each category for the "Feed" below
    return { category: cat.name, posts: cat.list.slice(0, 3) }
  }))

  const navItems = data.categoryBlocks.map(cat => ({
    label: cat.name,
    href: `/categoria/${cat.slug}`
  }))


  // Layout Assembly
  const bodyHtml = `
    <!-- Top Spacer -->
    <div style="height: var(--space-5);"></div>

    <div class="gb-container">
      
      <!-- HERO + LATEST GRID -->
      <div class="gb-grid">
        
        <!-- Hero Column (8 cols desktop) -->
        <div style="grid-column: span 12; @media (min-width: 1024px) { grid-column: span 8; }">
           ${renderHeroGold(heroPost, baseUrl)}
        </div>

        <!-- Latest Column (4 cols desktop) -->
        <div class="gb-hidden-mobile" style="grid-column: span 12; @media (min-width: 1024px) { grid-column: span 4; }">
           ${renderLatestListGold(latestPosts, baseUrl)}
        </div>
      
      </div> 
      <!-- End Grid -->

      <!-- SECTIONS (Grid Layout) -->
      <div style="margin-top: var(--space-8); border-top: 1px solid var(--border-color); padding-top: var(--space-5);">
          ${featuredPosts.map(block => `
              <section style="margin-bottom: var(--space-8);">
                 <div class="gb-section-header">
                    <h2 class="gb-section-title">${escapeHtml(block.category)}</h2>
                    <a href="/categoria/${block.category.toLowerCase()}" class="gb-section-link">Ver mais &rarr;</a>
                 </div>
                 <div class="gb-grid">
                    ${block.posts.map(post => `
                        <div style="grid-column: span 12; @media (min-width: 640px) { grid-column: span 4; }">
                           <article class="gb-card gb-card--feature">
                              <a href="${getPostUrl(post, baseUrl)}" class="gb-card__media" style="aspect-ratio: 16/9;">
                                <img src="${post.featured_image_r2_key ? `/i/${post.featured_image_r2_key}?w=400` : '/static/placeholder.jpg'}" loading="lazy">
                              </a>
                              <span class="gb-hat">${escapeHtml(block.category)}</span>
                              <h3 class="gb-title gb-title--feature">
                                 <a href="${getPostUrl(post, baseUrl)}">${escapeHtml(post.title)}</a>
                              </h3>
                              <div class="gb-meta">${formatDate(post.published_at)}</div>
                           </article>
                        </div>
                    `).join('')}
                 </div>
              </section>
          `).join('')}
      </div>

    </div>
  `

  return renderPublicLayoutGold({
    title: siteName,
    siteName,
    navItems,
    bodyHtml,
    canonicalUrl: `${baseUrl}/v2`,
    coverOfDay: coverR2Key ? { r2Key: coverR2Key, alt: coverAlt, aspectRatio: coverAspectRatio } : null
  })
}
