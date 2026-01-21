import type { Context } from 'hono'
import type { Env, AppContext } from '../types'
import { renderPublicLayoutGold } from './layout-gold'

// Type definitions (approximate, based on usage)
interface CategoryPost {
  id: number
  title: string
  slug: string
  excerpt?: string
  published_at: string
  featured_image_r2_key?: string
  author_name?: string
  category_name?: string
}

interface CategoryData {
  category: {
    name: string
    slug: string
    description?: string
  }
  posts: CategoryPost[]
  page: number
  totalPages: number
}

// Helpers
function escapeHtml(unsafe: string | null | undefined): string {
  if (!unsafe) return ''
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
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

function getPostUrl(post: CategoryPost, baseUrl: string): string {
  return `/v2/noticia/${post.slug}`
}

function renderPagination(page: number, totalPages: number, baseUrl: string): string {
  if (totalPages <= 1) return ''

  const prevPage = page > 1 ? page - 1 : null
  const nextPage = page < totalPages ? page + 1 : null
  const url = (p: number) => `${baseUrl}${p > 1 ? `?page=${p}` : ''}`

  return `
      <div style="display: flex; justify-content: center; gap: var(--space-4); margin-top: var(--space-8);">
        ${prevPage ? `<a href="${url(prevPage)}" class="gb-btn gb-btn--ghost">← Anterior</a>` : ''}
        <span style="font-size: 14px; font-weight: 600; padding: 8px;">Página ${page} de ${totalPages}</span>
        ${nextPage ? `<a href="${url(nextPage)}" class="gb-btn gb-btn--ghost">Próxima →</a>` : ''}
      </div>
    `
}

// ----------------------------------------------------------------------------
// Components
// ----------------------------------------------------------------------------

function renderCategoryHero(hero: CategoryPost, sidebarPosts: CategoryPost[], baseUrl: string): string {
  if (!hero) return ''

  const imageUrl = hero.featured_image_r2_key
    ? `/i/${hero.featured_image_r2_key}`
    : '/static/placeholder.jpg'

  return `
      <div class="gb-grid" style="margin-bottom: var(--space-8);">
         
         <!-- Hero (8 cols) -->
         <div style="grid-column: span 12; @media (min-width: 1024px) { grid-column: span 8; }">
            <article class="gb-card gb-card--hero">
              <a href="${getPostUrl(hero, baseUrl)}" class="gb-card__media" style="aspect-ratio: 16/9; display: block;">
                 <img src="${imageUrl}" alt="${escapeHtml(hero.title)}" loading="eager" />
              </a>
              <div style="margin-top: var(--space-3);">
                 <span class="gb-hat">${escapeHtml(hero.category_name || 'Destaque')}</span>
                 <h1 class="gb-title gb-title--hero">
                    <a href="${getPostUrl(hero, baseUrl)}">${escapeHtml(hero.title)}</a>
                 </h1>
                 ${hero.excerpt ? `<p class="gb-article-lead" style="font-size: 18px; margin-bottom: var(--space-2); margin-top: var(--space-2);">${escapeHtml(hero.excerpt)}</p>` : ''}
              </div>
            </article>
         </div>

         <!-- Sidebar (4 cols) - 4 items listing -->
         <div class="gb-hidden-mobile" style="grid-column: span 12; @media (min-width: 1024px) { grid-column: span 4; }">
            <div style="padding-left: var(--space-4); border-left: 1px solid var(--border-subtle); height: 100%;">
                <h3 style="font-size: 14px; font-weight: 800; text-transform: uppercase; color: var(--brand-color); margin-bottom: var(--space-3); letter-spacing: 0.05em;">
                   Mais em ${escapeHtml(hero.category_name || 'Categoria')}
                </h3>
                <div style="display: flex; flex-direction: column;">
                   ${sidebarPosts.map(post => `
                     <article class="gb-card gb-card--list" style="padding: 12px 0; border-bottom: 1px solid var(--border-subtle);">
                       <div>
                          <h3 class="gb-title gb-title--list" style="font-size: 16px;">
                            <a href="${getPostUrl(post, baseUrl)}">${escapeHtml(post.title)}</a>
                          </h3>
                          <div class="gb-meta">
                            ${formatDate(post.published_at)}
                          </div>
                       </div>
                     </article>
                   `).join('')}
                </div>
            </div>
         </div>

      </div>
    `
}

function renderFeedGrid(posts: CategoryPost[], baseUrl: string): string {
  return `
      <div class="gb-grid">
         ${posts.map(post => `
             <div style="grid-column: span 12; @media (min-width: 640px) { grid-column: span 4; }">
                 <article class="gb-card gb-card--feature">
                    <a href="${getPostUrl(post, baseUrl)}" class="gb-card__media" style="aspect-ratio: 16/9;">
                      <img src="${post.featured_image_r2_key ? `/i/${post.featured_image_r2_key}?w=400` : '/static/placeholder.jpg'}" loading="lazy">
                    </a>
                    <h3 class="gb-title gb-title--feature" style="font-size: 18px;">
                       <a href="${getPostUrl(post, baseUrl)}">${escapeHtml(post.title)}</a>
                    </h3>
                    <div class="gb-meta">${formatDate(post.published_at)}</div>
                 </article>
             </div>
         `).join('')}
      </div>
    `
}

// ----------------------------------------------------------------------------
// Main Renderer
// ----------------------------------------------------------------------------

export async function renderCategoryPageGold(
  c: Context<{ Bindings: Env; Variables: AppContext }>,
  data: CategoryData,
  params: {
    baseUrl: string
    siteName: string
  }
): Promise<string> {
  const { baseUrl, siteName } = params
  const { category, posts, page, totalPages } = data

  // Logic:
  // If Page 1: Show "1 + 4" Curated Block + Feed (Rest)
  // If Page > 1: Just Feed

  let bodyHtml = `
      <div style="height: var(--space-6);"></div>
      <div class="gb-container">
         
         <div style="text-align: center; margin-bottom: var(--space-8);">
            <h1 class="gb-article-h1" style="font-size: 36px; margin-bottom: var(--space-2);">${escapeHtml(category.name)}</h1>
            ${category.description ? `<p style="font-size: 18px; color: var(--text-secondary);">${escapeHtml(category.description)}</p>` : ''}
         </div>
    `

  if (page === 1 && posts.length > 0) {
    const hero = posts[0]
    const sidebar = posts.slice(1, 5) // Up to 4 items
    const feed = posts.slice(5) // The rest

    bodyHtml += renderCategoryHero(hero, sidebar, baseUrl)

    if (feed.length > 0) {
      bodyHtml += `
             <div style="margin: var(--space-8) 0; height: 1px; background: var(--border-color);"></div>
             <h3 class="gb-section-title" style="font-size: 20px; margin-bottom: var(--space-4);">Todas as notícias</h3>
             ${renderFeedGrid(feed, baseUrl)}
           `
    }
  } else {
    // Just Grid
    bodyHtml += renderFeedGrid(posts, baseUrl)
  }

  bodyHtml += `
         ${renderPagination(page, totalPages, `/v2/categoria/${category.slug}`)}
      </div>
      <div style="height: var(--space-10);"></div>
    `

  return renderPublicLayoutGold({
    title: `${category.name} | ${siteName}`,
    siteName,
    navItems: [
      { label: 'Brasil', href: '/categoria/brasil' },
      { label: 'Política', href: '/categoria/politica' },
      { label: 'Economia', href: '/categoria/economia' },
      { label: 'Esporte', href: '/categoria/esporte' }
    ],
    bodyHtml,
    canonicalUrl: `${baseUrl}/v2/categoria/${category.slug}${page > 1 ? `?page=${page}` : ''}`
  })
}
