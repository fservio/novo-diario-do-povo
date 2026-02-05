/**
 * Latest News (/ultimas) Page Renderer
 * Modern Timeline Design System
 */

import type { Context } from 'hono'
import type { Env, AppContext } from '../types'
import { renderPublicLayout, escapeHtml, escapeAttr, formatTime, estimateReadingTime } from './layout'
import { getPostUrl } from '../utils/post'
import { getActiveCategories } from '../db/categories-cache'

export interface UltimasPost {
    id: number
    slug: string
    title: string
    published_at: string
    category_name: string
    category_slug: string
    content?: string
    excerpt?: string
}

function getRelativeGroup(publishedAt: string): string {
    const now = new Date()
    const pubDate = new Date(publishedAt)
    const diffMs = now.getTime() - pubDate.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))

    if (diffMins < 60) return 'Agora'
    if (diffHours < 6) return 'Hoje Cedo'

    const isToday = now.toDateString() === pubDate.toDateString()
    if (isToday) return 'Hoje'

    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    if (yesterday.toDateString() === pubDate.toDateString()) return 'Ontem'

    return pubDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })
}

function isLive(publishedAt: string): boolean {
    const now = new Date()
    const pubDate = new Date(publishedAt)
    const diffMins = Math.floor((now.getTime() - pubDate.getTime()) / (1000 * 60))
    return diffMins <= 30
}

export async function renderUltimasPage(
    c: Context<{ Bindings: Env; Variables: AppContext }>,
    posts: UltimasPost[],
    params: {
        baseUrl: string
        siteName: string
        page: number
        limit: number
        subscriber?: any
    }
): Promise<string> {
    const nonce = c.get('cspNonce') || ''
    const { baseUrl, siteName, page, limit } = params
    const categories = await getActiveCategories(c.env)

    // Group posts by relative time
    const groups: Record<string, UltimasPost[]> = {}
    posts.forEach(post => {
        const group = getRelativeGroup(post.published_at)
        if (!groups[group]) groups[group] = []
        groups[group].push(post)
    })

    const bodyHtml = `
    <div class="container py-12">
      <header class="mb-12">
        <h1 class="text-5xl font-black mb-4 tracking-tighter" style="display: block !important;">Últimas Notícias</h1>
        <p class="text-xl text-gray-400 font-medium">O que está acontecendo agora no Diário do Povo.</p>
      </header>

      <div class="timeline-container relative">
        <!-- Vertical Line -->
        <div class="absolute left-4 md:left-8 top-0 bottom-0 w-px bg-gray-800 opacity-50"></div>

        ${Object.entries(groups).map(([groupName, groupPosts]) => `
          <div class="timeline-group mb-12">
             <div class="relative flex items-center mb-8 pl-12 md:pl-20">
                <div class="absolute left-3 md:left-7 w-3 h-3 rounded-full bg-accent shadow-[0_0_10px_var(--accent)] z-10"></div>
                <h2 class="text-xs font-black uppercase tracking-[0.2em] text-accent">${groupName}</h2>
             </div>

             <div class="space-y-8">
               ${groupPosts.map(post => {
        const liveIndicator = isLive(post.published_at)
            ? `<span class="pulse-live"></span>`
            : ''
        const readingTime = estimateReadingTime(post.content || post.excerpt || '')

        return `
                   <article class="relative pl-12 md:pl-20 group">
                      <!-- Dot on hover -->
                      <div class="absolute left-3.5 md:left-7.5 w-2 h-2 rounded-full bg-gray-700 group-hover:bg-white transition-colors z-10 mt-2"></div>
                      
                      <a href="${getPostUrl(post, baseUrl)}" class="block">
                        <div class="flex flex-col md:flex-row md:items-baseline gap-2 md:gap-4">
                          <time class="text-xs font-mono text-gray-500 whitespace-nowrap pt-1">
                            ${formatTime(post.published_at)}
                          </time>
                          
                          <div class="flex-1">
                            <h3 class="text-xl md:text-2xl font-bold group-hover:text-accent transition-colors leading-tight mb-2">
                              ${liveIndicator}
                              ${escapeHtml(post.title)}
                            </h3>
                            
                            <div class="flex items-center gap-4 text-xs">
                              <span class="font-black uppercase tracking-wider text-accent bg-accent/10 px-2 py-0.5 rounded">
                                ${escapeHtml(post.category_name)}
                              </span>
                              <span class="text-gray-500 font-medium">${readingTime} min de leitura</span>
                            </div>
                          </div>
                        </div>
                      </a>
                   </article>
                 `
    }).join('')}
             </div>
          </div>
        `).join('')}
      </div>

      <!-- Pagination -->
      <div class="mt-16 pt-8 border-t border-gray-800 flex justify-center gap-4">
        ${page > 1 ? `
          <a href="/ultimas?page=${page - 1}" class="btn btn-outline px-8 py-3 rounded-full border-gray-700 hover:border-accent hover:text-accent">
            ← Anterior
          </a>
        ` : ''}
        ${posts.length === limit ? `
          <a href="/ultimas?page=${page + 1}" class="btn btn-accent px-8 py-3 rounded-full">
            Próximo →
          </a>
        ` : ''}
      </div>
    </div>

    <style nonce="${nonce}">
      .pulse-live {
        display: inline-block;
        width: 8px;
        height: 8px;
        background-color: var(--success);
        border-radius: 50%;
        margin-right: 12px;
        position: relative;
        top: -2px;
        box-shadow: 0 0 0 rgba(0, 169, 110, 0.4);
        animation: pulse-green 2s infinite;
      }

      @keyframes pulse-green {
        0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(0, 169, 110, 0.7); }
        70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(0, 169, 110, 0); }
        100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(0, 169, 110, 0); }
      }

      .timeline-container::before {
        content: '';
        position: absolute;
        left: 4px;
        top: 0;
        bottom: 0;
        width: 1px;
        background: linear-gradient(to bottom, var(--accent), transparent);
        opacity: 0.3;
      }
      
      @media (min-width: 768px) {
        .timeline-container::before { left: 8px; }
      }

      .timeline-group:first-child .absolute.left-3 {
        box-shadow: 0 0 20px var(--accent);
      }
    </style>
  `

    return renderPublicLayout({
        title: `Últimas Notícias | ${siteName}`,
        description: "Confira as últimas notícias e atualizações em tempo real no Diário do Povo.",
        canonicalUrl: `${baseUrl}/ultimas${page > 1 ? `?page=${page}` : ''}`,
        nonce,
        siteName,
        navItems: [], // Will be injected or fetched if needed
        categories,
        bodyHtml,
        theme: 'default', // Using modern default theme
        subscriber: params.subscriber
    })
}
