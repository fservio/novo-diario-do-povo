import type { Context } from 'hono'
import type { Env, AppContext } from '../types'
import type { Post } from '../types' // Assuming Post type is here
import { renderPublicLayoutGold } from './layout-gold'

// Helper helpers (reused - in a real app, move to util)
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
      return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }) + ' às ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
   } catch (e) {
      return ''
   }
}

function getPostUrl(post: any, baseUrl: string): string {
   return `/v2/noticia/${post.slug}`
}

// ----------------------------------------------------------------------------
// Components
// ----------------------------------------------------------------------------

function renderArticleHeaderGold(post: any): string {
   const categoryName = post.category_name || post.category?.name || 'Geral'
   const authorName = post.author_name || post.author?.name || 'Redação'

   return `
      <header class="gb-article-header">
         <span class="gb-hat">${escapeHtml(categoryName)}</span>
         <h1 class="gb-article-h1">${escapeHtml(post.title)}</h1>
         ${post.hat ? `<p class="gb-article-lead" style="font-size: 18px; margin-bottom: 8px; color: var(--brand-color); font-weight: 600;">${escapeHtml(post.hat)}</p>` : ''}
         ${post.excerpt ? `<p class="gb-article-lead">${escapeHtml(post.excerpt)}</p>` : ''}
         
         <div class="gb-article-meta-block">
            <div class="gb-author-avatar"></div> <!-- Placeholder for avatar -->
            <div class="gb-article-meta-info">
               <span class="gb-author-name">${escapeHtml(authorName)}</span>
               <span class="gb-publish-date">${formatDate(post.published_at)}</span>
            </div>
         </div>
      </header>
    `
}

function renderRecirculationGold(relatedPosts: any[], baseUrl: string): string {
   if (!relatedPosts || relatedPosts.length === 0) return ''

   return `
      <div class="gb-recirc">
         <h3 class="gb-section-title" style="margin-bottom: var(--space-4);">Leia também</h3>
         <div class="gb-grid">
            ${relatedPosts.map(p => `
               <div style="grid-column: span 12; @media (min-width: 640px) { grid-column: span 4; }">
                   <article class="gb-card gb-card--feature">
                      <a href="${getPostUrl(p, baseUrl)}" class="gb-card__media" style="aspect-ratio: 16/9;">
                        <img src="${p.featured_image_r2_key ? `/i/${p.featured_image_r2_key}?w=400` : '/static/placeholder.jpg'}" loading="lazy">
                      </a>
                      <h3 class="gb-title gb-title--feature">
                         <a href="${getPostUrl(p, baseUrl)}">${escapeHtml(p.title)}</a>
                      </h3>
                   </article>
               </div>
            `).join('')}
         </div>
      </div>
    `
}

// ----------------------------------------------------------------------------
// Main Renderer
// ----------------------------------------------------------------------------

export async function renderArticlePageGold(
   c: Context<{ Bindings: Env; Variables: AppContext }>,
   post: any, // Using any for flexibility with joined queries, ideally strictly typed
   relatedPosts: any[],
   params: {
      baseUrl: string
      siteName: string
   }
): Promise<string> {
   const { baseUrl, siteName } = params

   // Image Handling
   const featuredImage = post.coverMedia || (post.featured_image_r2_key ? { r2_key: post.featured_image_r2_key, alt: post.title } : null)
   const featuredImageUrl = featuredImage ? `/i/${featuredImage.r2_key}` : null

   // Body Content (HTML)
   // Ensure content matches the "Gold" typographic expectations.
   // Ideally we might want to process this HTML to inject ad slots or clean up classes.
   const contentHtml = post.content || ''

   const bodyHtml = `
      <div style="height: var(--space-6);"></div>

      <div class="gb-article-container">
         <article class="gb-article-main">
            
            ${renderArticleHeaderGold(post)}

            ${featuredImageUrl ? `
              <figure style="margin-bottom: var(--space-6); border-radius: var(--radius-lg); overflow: hidden;">
                 <img src="${featuredImageUrl}" alt="${escapeHtml(featuredImage.alt || post.title)}" style="width: 100%; height: auto; display: block;">
                 ${featuredImage.alt ? `<figcaption>${escapeHtml(featuredImage.alt)}</figcaption>` : ''}
              </figure>
            ` : ''}

            <!-- AdSlot Top -->
            <div class="gb-ad-slot gb-ad-slot--leaderboard">
               <span style="font-size: 11px; color: #999; text-transform: uppercase;">Publicidade</span>
            </div>

            <div class="gb-article-body">
               ${contentHtml}
            </div>
            
            <!-- AdSlot Bottom -->
            <div class="gb-ad-slot gb-ad-slot--leaderboard">
               <span style="font-size: 11px; color: #999; text-transform: uppercase;">Publicidade</span>
            </div>

            ${renderRecirculationGold(relatedPosts, baseUrl)}

         </article>
      </div>

      <div style="height: var(--space-10);"></div>
    `

   return renderPublicLayoutGold({
      title: `${post.title} | ${siteName}`,
      description: post.excerpt,
      siteName,
      navItems: [
         { label: 'Brasil', href: '/categoria/brasil' },
         { label: 'Política', href: '/categoria/politica' },
         { label: 'Economia', href: '/categoria/economia' },
         { label: 'Esporte', href: '/categoria/esporte' }
      ], // Static for now, can be dynamic
      bodyHtml,
      canonicalUrl: `${baseUrl}/noticia/${post.slug}`,
      image: featuredImageUrl ? `${baseUrl}${featuredImageUrl}` : undefined
   })
}
