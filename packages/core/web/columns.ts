/**
 * Columns Page Renderer
 * Modern & Minimalist Design System
 */

import type { Context } from 'hono'
import type { Env, AppContext } from '../types'
import { renderPublicLayout, escapeHtml, escapeAttr, formatDate, type PublicLayoutParams } from './layout'
import { listActiveAuthors, findAuthorBySlug, type Author } from '../db/authors'
import { getSetting } from '../db'
import { listPosts, type Post } from '../db/posts'

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
  const avatarUrl = author.avatar_media_id ? `/i/media-id-placeholder` : '/static/default-avatar.png' // Needs proper media resolution
  // We don't have media URL in Author struct easily without a join or extra fetch.
  // For now, let's assume we might need to fetch it or use a placeholder if not joined.
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
         ${author.avatar_media_id ? `<img src="/api/media/${author.avatar_media_id}/thumb" class="w-full h-full object-cover" alt="${escapeAttr(author.name)}">` : `<span class="absolute inset-0 flex items-center justify-center text-2xl font-bold text-gray-400">${escapeHtml(author.name.substring(0, 2).toUpperCase())}</span>`}
      </div>
      
      <div class="text-xs font-bold uppercase tracking-widest text-accent mb-2">
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
      <a href="/noticia/${escapeAttr(post.slug)}" class="card-body">
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
  }
): Promise<string> {
  const { baseUrl, siteName, navItems, coverOfDay } = options

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
                            ${author.avatar_media_id
        ? `<img src="/api/media/${author.avatar_media_id}/thumb" class="w-full h-full object-cover" alt="${escapeAttr(author.name)}">`
        : `<span class="absolute inset-0 flex items-center justify-center text-xs font-bold text-gray-500">${escapeHtml(author.name.substring(0, 2).toUpperCase())}</span>`
      }
                        </div>
                    </a>
                    <div>
                        ${author.column_name ? `
                        <a href="/coluna/${escapeAttr(author.slug)}" class="block text-xs font-bold uppercase tracking-wider text-accent hover:underline mb-0.5">
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
                        <a href="/noticia/${escapeAttr(author.latestPost.slug)}" class="group">
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
  const themeSetting = await getSetting(c.env, 'public_theme')
  const theme = (themeSetting === 'minimal' || themeSetting === '"minimal"') ? 'minimal' : 'default'

  return renderPublicLayout({
    title: `Colunistas | ${siteName}`,
    description: 'Opinião, análise e blogs dos nossos especialistas.',
    canonicalUrl: `${baseUrl}/colunas`,
    siteName,
    navItems,
    coverOfDay,
    bodyHtml,
    theme
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
  }
): Promise<string | null> {
  const { baseUrl, siteName, navItems, coverOfDay } = options

  const author = await findAuthorBySlug(c.env, authorSlug)

  if (!author || !author.is_active) {
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
    limit,
    offset
  })

  const totalPages = Math.ceil(total / limit)

  const bodyHtml = `
    <div class="bg-gray-50 py-12 border-b border-gray-200">
      <div class="container max-w-4xl mx-auto text-center">
        <div class="w-32 h-32 rounded-full bg-white shadow-md mx-auto mb-6 overflow-hidden relative border-4 border-white">
          ${author.avatar_media_id ? `<img src="/api/media/${author.avatar_media_id}/thumb" class="w-full h-full object-cover" alt="${escapeAttr(author.name)}">` : `<span class="absolute inset-0 flex items-center justify-center text-4xl font-bold text-gray-300">${escapeHtml(author.name.substring(0, 2).toUpperCase())}</span>`}
        </div>
        
        <div class="text-sm font-bold uppercase tracking-widest text-accent mb-2">
          ${escapeHtml(author.column_name || 'Coluna')}
        </div>
        
        <h1 class="text-4xl font-black mb-6 text-gray-900 leading-tight">
          ${escapeHtml(author.name)}
        </h1>
        
        ${author.bio ? `
          <div class="prose prose-lg mx-auto text-gray-600 mb-6">
            ${escapeHtml(author.bio)}
          </div>
        ` : ''}
        
        <div class="flex justify-center gap-4">
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
  const themeSetting = await getSetting(c.env, 'public_theme')
  const theme = (themeSetting === 'minimal' || themeSetting === '"minimal"') ? 'minimal' : 'default'

  return renderPublicLayout({
    title: `${author.column_name || author.name} | ${siteName}`,
    description: author.column_description || author.bio || `Coluna de ${author.name}`,
    canonicalUrl: `${baseUrl}/coluna/${author.slug}`,
    siteName,
    navItems,
    coverOfDay,
    bodyHtml,
    theme
  })
}
