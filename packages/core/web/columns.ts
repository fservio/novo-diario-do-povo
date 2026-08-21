/**
 * Columns Page Renderer
 * Modern & Minimalist Design System
 */

import type { Context } from 'hono'
import type { Env, AppContext } from '../types'
import { renderPublicLayout, escapeHtml, escapeAttr, formatDate, normalizePublicTheme, type PublicLayoutParams } from './layout'
import { getPostUrl } from '../utils/post'
import { listActiveAuthors, findAuthorBySlug, type Author } from '../db/authors'
import { getSetting } from '../db'
import { listPosts, type Post } from '../db/posts'
import { getActiveCategories } from '../db/categories-cache'
import { renderEditorialLayout } from './layout-editorial'
import { renderEditorialArticleCard } from './components/editorial-card'

// ============================================================================
// Types
// ============================================================================

export type ColumnsPageData = {
  columnists: Author[]
}

export type ColumnistPageData = {
  author: Author
  posts: Post[]
  page: number
  totalPages: number
}

// ============================================================================
// Helpers
// ============================================================================

// Helpers imported from layout.ts

// ============================================================================
// Component Renderers
// ============================================================================

function renderColumnistCard(author: Author): string {
  const avatarUrl = author.avatar_r2_key ? `/i/${author.avatar_r2_key}?w=200&h=200&fit=cover` : '/static/default-avatar.png'
  // The listActiveAuthors query DOES NOT join media.
  // Users will need to update the query if they want avatars in the list.
  // Let's check authors.ts listActiveAuthors again. It selects avatar_media_id but not the URL/Key.
  // For MVP, we'll try to use a standard placeholder or if we can resolved it. 
  // Actually, listActiveAuthors calls `env.DB.prepare` which matches `Author` interface.
  // `avatar_media_id` is just an ID.

  // To avoid N+1, we will leave avatar as placeholder or handle it later.
  // Or better, let's just show initials if no image.

  return `
    <a href="/coluna/${escapeAttr(author.slug)}" class="card hover:shadow-lg transition p-6 flex flex-col items-center text-center h-full">
      <div class="w-24 h-24 rounded-full bg-gray-200 mb-4 overflow-hidden relative">
         ${author.avatar_r2_key ? `<img src="/i/${author.avatar_r2_key}?w=200&h=200&fit=cover" class="w-full h-full object-cover" alt="${escapeAttr(author.name)}">` : `<span class="absolute inset-0 flex items-center justify-center text-2xl font-bold text-gray-400">${escapeHtml(author.name.substring(0, 2).toUpperCase())}</span>`}
      </div>
      
      <div style="background-color: #1a73e8; color: #ffffff; padding: 4px 12px; border-radius: 4px; font-size: 14px; font-weight: 800; text-transform: uppercase; margin-bottom: 12px; display: inline-block;">
        ${escapeHtml(author.column_name || 'Coluna')}
      </div>
      
      <h3 class="font-bold text-xl mb-3 text-gray-900">
        ${escapeHtml(author.name)}
      </h3>
      
      ${author.column_description ? `
        <p class="text-sm text-gray-500 line-clamp-3">
          ${escapeHtml(author.column_description)}
        </p>
      ` : ''}
    </a>
  `
}

function renderPostCard(post: Post): string {
  return `
    <article class="card hover:shadow-lg transition">
      <a href="${getPostUrl(post)}" class="card-body">
         <h3 class="font-bold text-xl mb-2">
          ${escapeHtml(post.title)}
        </h3>
        <div class="text-xs text-gray-500 mb-3">
          ${formatDate(post.published_at || post.created_at)}
        </div>
        ${post.excerpt ? `
          <p class="text-gray-600 text-sm m-0">
            ${escapeHtml(post.excerpt)}
          </p>
        ` : ''}
      </a>
    </article>
  `
}

// ============================================================================
// Main Renderers
// ============================================================================

/**
 * Render List of All Columns
 */
/**
 * Render List of All Columns (Folha Style)
 */
export async function renderColumnsList(
  c: Context<{ Bindings: Env; Variables: AppContext }>,
  options: {
    baseUrl: string
    siteName: string
    navItems: Array<{ label: string; href: string; active?: boolean }>
    coverOfDay?: any
    googleAnalyticsId?: string
  }
): Promise<string> {
  const { baseUrl, siteName, navItems, coverOfDay, googleAnalyticsId } = options

  // 1. Fetch active authors who are columnists
  const allAuthors = await listActiveAuthors(c.env)
  const columnists = allAuthors.filter(a => a.is_columnist === 1)

  // 2. Fetch latest post for each columnist
  const columnistsWithLatestPost = await Promise.all(columnists.map(async (author) => {
    const { posts } = await listPosts(c.env.DB, { author_id: author.id, limit: 1, status: 'published' })
    return {
      ...author,
      latestPost: posts[0] || null
    }
  }))

  // Sort by latest post date (most recent first)
  columnistsWithLatestPost.sort((a, b) => {
    const dateA = a.latestPost ? new Date(a.latestPost.published_at || 0).getTime() : 0
    const dateB = b.latestPost ? new Date(b.latestPost.published_at || 0).getTime() : 0
    return dateB - dateA
  })

  const themeSetting = (await getSetting(c.env, 'site.public_theme')) || (await getSetting(c.env, 'public_theme'))
  const isEditorialTheme = themeSetting == null || themeSetting === 'editorial' || themeSetting === 'alltype_v2' || themeSetting === 'minimal'

  if (isEditorialTheme) {
    const bodyHtml = `
      <header class="ed-page-header">
        <p class="ed-kicker">Análise e opinião</p>
        <h1 class="ed-page-title">Colunistas</h1>
        <p class="ed-page-description">Diferentes perspectivas para compreender os fatos e seus impactos.</p>
      </header>
      <section class="ed-columnists-grid">
        ${columnistsWithLatestPost.map(author => `
          <article class="ed-columnist-profile">
            <a class="ed-columnist-profile__header" href="/coluna/${escapeAttr(author.slug)}">
              <div class="ed-columnist-profile__avatar">
                ${author.avatar_r2_key
                  ? `<img src="/i/${author.avatar_r2_key}?w=160&h=160&fit=cover" alt="${escapeAttr(author.name)}">`
                  : `<span>${escapeHtml(author.name.substring(0, 2).toUpperCase())}</span>`}
              </div>
              <div>
                <p class="ed-kicker">${escapeHtml(author.column_name || 'Coluna')}</p>
                <h2>${escapeHtml(author.name)}</h2>
              </div>
            </a>
            ${author.column_description ? `<p>${escapeHtml(author.column_description)}</p>` : ''}
            ${author.latestPost ? `
              <a class="ed-columnist-profile__latest" href="${getPostUrl(author.latestPost)}">
                <span>Publicação mais recente</span>
                <strong>${escapeHtml(author.latestPost.title)}</strong>
              </a>
            ` : '<p class="ed-columnist-profile__empty">Sem publicações recentes.</p>'}
          </article>
        `).join('')}
      </section>
    `

    return renderEditorialLayout({
      title: `Colunistas — ${siteName}`,
      description: 'Opinião e análise dos colunistas do Diário do Povo.',
      canonicalUrl: `${baseUrl}/colunas`,
      nonce: c.get('cspNonce') || '',
      siteName,
      navItems,
      bodyHtml,
      baseUrl,
      googleAnalyticsId
    })
  }

  const bodyHtml = `
    <div class="container py-8">
      <div class="border-b border-gray-200 mb-8 pb-4 flex justify-between items-end">
        <h1 class="text-3xl font-bold tracking-tight text-gray-900">Colunas e Blogs</h1>
      </div>
      
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12">
        ${columnistsWithLatestPost.map(author => {
    return `
            <div class="flex flex-col h-full border-b border-gray-100 pb-6 md:border-none md:pb-0">
                <!-- Header: Avatar + Column Info -->
                <div class="flex items-center gap-4 mb-3">
                    <a href="/coluna/${escapeAttr(author.slug)}" class="shrink-0 group">
                         <div class="w-12 h-12 rounded-full bg-gray-200 overflow-hidden relative group-hover:ring-2 ring-accent transition">
                            ${author.avatar_r2_key
        ? `<img src="/i/${author.avatar_r2_key}?w=100&h=100&fit=cover" class="w-full h-full object-cover" alt="${escapeAttr(author.name)}">`
        : `<span class="absolute inset-0 flex items-center justify-center text-xs font-bold text-gray-500">${escapeHtml(author.name.substring(0, 2).toUpperCase())}</span>`
      }
                        </div>
                    </a>
                    <div>
                        ${author.column_name ? `
                        <a href="/coluna/${escapeAttr(author.slug)}" class="inline-block text-[16px] font-black uppercase tracking-wider bg-[#1a73e8] color-white px-3 py-1 rounded mb-2 transition hover:opacity-90" style="color: white; text-decoration: none;">
                            ${escapeHtml(author.column_name)}
                        </a>
                        ` : ''}
                         <a href="/coluna/${escapeAttr(author.slug)}" class="block font-bold text-gray-900 leading-tight hover:text-accent transition">
                            ${escapeHtml(author.name)}
                        </a>
                    </div>
                </div>

                <!-- Latest Post (Headline) -->
                ${author.latestPost ? `
                    <div class="mt-1">
                        <a href="${getPostUrl(author.latestPost)}" class="group">
                             <h3 class="font-serif text-lg leading-snug text-gray-900 group-hover:text-blue-700 transition">
                                ${escapeHtml(author.latestPost.title)}
                            </h3>
                             <time class="block text-xs text-gray-500 mt-2">
                                ${formatDate(author.latestPost.published_at || author.latestPost.created_at)}
                            </time>
                        </a>
                    </div>
                ` : `
                    <p class="text-sm text-gray-400 italic mt-1">Sem publicações recentes.</p>
                `}
            </div>
            `
  }).join('')}
      </div>
    </div>
  `

  // Determine Theme
  const theme = normalizePublicTheme(themeSetting)

  // Fetch categories for mobile menu
  const categories = await getActiveCategories(c.env)

  return renderPublicLayout({
    title: `Colunistas | ${siteName}`,
    description: 'Opinião, análise e blogs dos nossos especialistas.',
    canonicalUrl: `${baseUrl}/colunas`,
    siteName,
    navItems,
    categories,
    coverOfDay,
    bodyHtml,
    theme,
    googleAnalyticsId
  })
}

/**
 * Render Individual Column Page
 */
export async function renderColumnPage(
  c: Context<{ Bindings: Env; Variables: AppContext }>,
  authorSlug: string,
  options: {
    baseUrl: string
    siteName: string
    navItems: Array<{ label: string; href: string; active?: boolean }>
    coverOfDay?: any
    googleAnalyticsId?: string
  }
): Promise<string | null> {
  const { baseUrl, siteName, navItems, coverOfDay, googleAnalyticsId } = options

  const author = await findAuthorBySlug(c.env, authorSlug)

  if (!author || !author.is_active) {
    return null
  }

  if (author.author_type !== 'columnist' && author.is_columnist !== 1) {
    return null
  }

  // Pagination
  const page = parseInt(c.req.query('page') || '1')
  const limit = 12
  const offset = (page - 1) * limit

  // Fetch posts
  const { posts, total } = await listPosts(c.env.DB, {
    author_id: author.id,
    status: 'published',
    opinion_type: 'column',
    limit,
    offset,
    includeCount: true
  })

  const totalPages = Math.ceil(total / limit)

  const themeSetting = (await getSetting(c.env, 'site.public_theme')) || (await getSetting(c.env, 'public_theme'))
  const isEditorialTheme = themeSetting == null || themeSetting === 'editorial' || themeSetting === 'alltype_v2' || themeSetting === 'minimal'

  if (isEditorialTheme) {
    const leadPost = page === 1 ? posts[0] : null
    const archivePosts = leadPost ? posts.slice(1) : posts
    const canonicalUrl = `${baseUrl}/coluna/${author.slug}${page > 1 ? `?page=${page}` : ''}`
    const jsonLd = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'ProfilePage',
      name: author.column_name || `Coluna de ${author.name}`,
      url: canonicalUrl,
      mainEntity: {
        '@type': 'Person',
        name: author.name,
        description: author.bio || author.column_description || undefined,
        url: `${baseUrl}/coluna/${author.slug}`,
        image: author.avatar_r2_key ? `${baseUrl}/i/${author.avatar_r2_key}?w=600` : undefined
      }
    }).replace(/</g, '\\u003c')
    const bodyHtml = `
      <nav class="ed-opinion-breadcrumb" aria-label="Navegação estrutural">
        <a href="/">Início</a><span>/</span><a href="/opiniao">Opinião</a><span>/</span><strong>${escapeHtml(author.column_name || author.name)}</strong>
      </nav>

      <header class="ed-column-masthead">
        <div class="ed-column-masthead__portrait">
          ${author.avatar_r2_key
            ? `<img src="/i/${escapeAttr(author.avatar_r2_key)}?w=420&h=520&fit=cover" alt="${escapeAttr(author.name)}" width="420" height="520">`
            : `<span>${escapeHtml(author.name.substring(0, 2).toUpperCase())}</span>`}
        </div>
        <div class="ed-column-masthead__copy">
          <p class="ed-kicker">Coluna</p>
          <h1>${escapeHtml(author.column_name || `Coluna de ${author.name}`)}</h1>
          <p class="ed-column-masthead__author">Por <strong>${escapeHtml(author.name)}</strong></p>
          ${author.column_description ? `<p class="ed-column-masthead__deck">${escapeHtml(author.column_description)}</p>` : ''}
          <div class="ed-column-masthead__links">
            ${author.social_instagram ? `<a href="https://instagram.com/${escapeAttr(author.social_instagram)}" target="_blank" rel="noopener">Instagram</a>` : ''}
            ${author.social_twitter ? `<a href="https://twitter.com/${escapeAttr(author.social_twitter)}" target="_blank" rel="noopener">X/Twitter</a>` : ''}
            ${author.social_linkedin ? `<a href="${escapeAttr(author.social_linkedin)}" target="_blank" rel="noopener">LinkedIn</a>` : ''}
          </div>
        </div>
      </header>

      ${leadPost ? `
        <section class="ed-column-latest">
          <div class="ed-opinion-section__header"><div><p class="ed-kicker">Publicação mais recente</p><h2>Em destaque</h2></div></div>
          ${renderEditorialArticleCard({
            title: leadPost.title,
            hat: author.column_name || 'Coluna',
            excerpt: leadPost.excerpt,
            published_at: leadPost.published_at || leadPost.created_at,
            author_name: author.name,
            featured_image_r2_key: leadPost.cover_media_url,
            url: getPostUrl(leadPost),
            size: 'lead',
            isLcp: true
          })}
        </section>
      ` : ''}

      <section class="ed-opinion-section ed-column-archive">
        <div class="ed-opinion-section__header"><div><p class="ed-kicker">Arquivo da coluna</p><h2>${page > 1 ? `Publicações — página ${page}` : 'Publicações anteriores'}</h2></div></div>
        ${archivePosts.length > 0 ? `
          <div class="ed-listing">
            ${archivePosts.map(post => renderEditorialArticleCard({
              title: post.title,
              hat: author.column_name || 'Coluna',
              excerpt: post.excerpt,
              published_at: post.published_at || post.created_at,
              author_name: author.name,
              featured_image_r2_key: post.cover_media_url,
              url: getPostUrl(post),
              size: 'standard'
            })).join('')}
          </div>
        ` : `<div class="ed-empty">${leadPost ? 'Esta é a primeira publicação desta coluna.' : 'Nenhuma publicação encontrada nesta página.'}</div>`}
      </section>

      ${author.bio ? `
        <aside class="ed-column-about">
          <p class="ed-kicker">Sobre o colunista</p>
          <h2>${escapeHtml(author.name)}</h2>
          <p>${escapeHtml(author.bio)}</p>
        </aside>
      ` : ''}

      ${totalPages > 1 ? `
        <nav class="ed-pagination" aria-label="Paginação">
          ${page > 1 ? `<a class="ed-button ed-button--secondary" href="?page=${page - 1}">Anterior</a>` : ''}
          <span>Página ${page} de ${totalPages}</span>
          ${page < totalPages ? `<a class="ed-button ed-button--secondary" href="?page=${page + 1}">Próxima</a>` : ''}
        </nav>
      ` : ''}
    `

    return renderEditorialLayout({
      title: `${author.column_name || author.name} — ${siteName}`,
      description: author.column_description || author.bio || `Coluna de ${author.name}`,
      canonicalUrl,
      nonce: c.get('cspNonce') || '',
      siteName,
      navItems,
      bodyHtml,
      baseUrl,
      googleAnalyticsId,
      ogImage: author.avatar_r2_key ? `${baseUrl}/i/${author.avatar_r2_key}?w=1200` : undefined,
      extraHeadHtml: `${posts.length === 0 ? '<meta name="robots" content="noindex, follow">' : ''}<script type="application/ld+json" nonce="${escapeAttr(c.get('cspNonce') || '')}">${jsonLd}</script>`
    })
  }

  const bodyHtml = `
    <div class="bg-gray-50 py-12 border-b border-gray-200">
      <div class="container max-w-4xl text-left">
        <div class="w-32 h-32 rounded-full bg-white shadow-md mb-6 overflow-hidden relative border-4 border-white">
          ${author.avatar_r2_key ? `<img src="/i/${author.avatar_r2_key}?w=300&h=300&fit=cover" class="w-full h-full object-cover" alt="${escapeAttr(author.name)}">` : `<span class="absolute inset-0 flex items-center justify-center text-4xl font-bold text-gray-300">${escapeHtml(author.name.substring(0, 2).toUpperCase())}</span>`}
        </div>
        
        <div class="inline-block text-lg font-black uppercase tracking-widest bg-[#1a73e8] text-white px-4 py-1.5 rounded-md mb-6 shadow-sm">
          ${author.author_type === 'columnist' ? escapeHtml(author.column_name || 'Coluna') :
      author.author_type === 'editorial' ? 'Editorial' :
        author.author_type === 'contributor' ? 'Opinião' : 'Autor'}
        </div>
        
        <h1 class="text-4xl font-black mb-6 text-gray-900 leading-tight">
          ${escapeHtml(author.name)}
        </h1>
        
        ${author.bio ? `
          <div class="prose prose-lg mx-auto text-gray-600 mb-6">
            ${escapeHtml(author.bio)}
          </div>
        ` : ''}
        
        <div class="flex justify-start gap-4">
          ${author.social_twitter ? `<a href="https://twitter.com/${author.social_twitter}" target="_blank" class="text-gray-400 hover:text-accent transition">Twitter</a>` : ''}
          ${author.social_instagram ? `<a href="https://instagram.com/${author.social_instagram}" target="_blank" class="text-gray-400 hover:text-accent transition">Instagram</a>` : ''}
          ${author.social_linkedin ? `<a href="${author.social_linkedin}" target="_blank" class="text-gray-400 hover:text-accent transition">LinkedIn</a>` : ''}
        </div>
      </div>
    </div>
    
    <div class="container py-12">
      <h2 class="text-2xl font-bold mb-8 border-l-4 border-accent pl-4">Últimas Publicações</h2>
      
      ${posts.length === 0 ? `
        <div class="py-12 text-center text-gray-500">
          Nenhuma publicação encontrada.
        </div>
      ` : `
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          ${posts.map(renderPostCard).join('')}
        </div>
        
        <!-- Pagination -->
        ${totalPages > 1 ? `
          <nav class="flex justify-center items-center gap-4 my-12">
            ${page > 1 ? `<a href="?page=${page - 1}" class="btn btn-outline">← Anterior</a>` : ''}
            <span class="text-gray-500 font-medium">Página ${page} de ${totalPages}</span>
            ${page < totalPages ? `<a href="?page=${page + 1}" class="btn btn-outline">Próxima →</a>` : ''}
          </nav>
        ` : ''}
      `}
    </div>
  `

  // Determine Theme
  const theme = normalizePublicTheme(themeSetting)

  // Fetch categories for mobile menu
  const categories = await getActiveCategories(c.env)

  return renderPublicLayout({
    title: `${author.column_name || author.name} | ${siteName}`,
    description: author.column_description || author.bio || `Coluna de ${author.name}`,
    canonicalUrl: `${baseUrl}/coluna/${author.slug}`,
    siteName,
    navItems,
    categories,
    coverOfDay,
    bodyHtml,
    theme,
    googleAnalyticsId
  })
}
