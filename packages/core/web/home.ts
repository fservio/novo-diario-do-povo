/**
 * Home Page Renderer
 * Modern & Minimalist Design System
 * Layout: Magazine / Bento Grid
 */

import type { Context } from 'hono'
import type { Env, AppContext } from '../types'
import type { HomeData, HomePost, CategoryBlock } from '../db/home'
import { renderPublicLayout, escapeHtml, escapeAttr } from './layout'

// ============================================================================
// Helpers
// ============================================================================

function formatTime(isoDate: string): string {
  const date = new Date(isoDate)
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength) + '...'
}

// ============================================================================
// Component Renderers
// ============================================================================

function renderHeroSection(hero: HomePost | null, sidePosts: HomePost[], baseUrl: string): string {
  if (!hero) return ''

  // Left Column: Main Hero (Big)
  const heroHtml = `
    <article class="card card-hero h-full">
      <a href="${baseUrl}/noticia/${escapeAttr(hero.slug)}" class="flex-col h-full relative group" style="display: flex;">
        <div style="position: relative; width: 100%; height: 400px; overflow: hidden;">
          <img 
            src="${hero.featured_image_r2_key ? `/i/${escapeAttr(hero.featured_image_r2_key)}` : '/placeholder-hero.jpg'}" 
            alt="${escapeAttr(hero.title)}"
            class="card-img w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            loading="eager"
            fetchpriority="high"
          />
          <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60"></div>
          <span class="btn btn-accent absolute top-4 left-4 text-xs font-bold px-3 py-1 uppercase tracking-wider">
            ${escapeHtml(hero.category_name)}
          </span>
        </div>
        <div class="card-body relative -mt-16 bg-white mx-6 mb-6 rounded-lg shadow-lg p-6 border border-gray-100">
          ${hero.hat ? `
            <div class="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
              ${escapeHtml(hero.hat)}
            </div>
          ` : ''}
          <h2 class="hero-title font-black mb-3 group-hover:text-accent transition-colors">
            ${escapeHtml(hero.title)}
          </h2>
          <p class="text-gray-600 text-lg line-clamp-3">
            ${escapeHtml(truncate(hero.excerpt, 180))}
          </p>
          <div class="mt-4 flex items-center text-sm text-gray-400 font-medium">
            <span>Por ${escapeHtml('Redação')}</span>
            <span class="mx-2">•</span>
            <span>${formatTime(hero.published_at)}</span>
          </div>
        </div>
      </a>
    </article>
  `

  // Right Column: 2 Stacked Cards (Visual Hot Rail)
  const sideHtml = sidePosts.slice(0, 2).map(post => `
    <article class="card h-full">
      <a href="${baseUrl}/noticia/${escapeAttr(post.slug)}" class="flex flex-col h-full group">
        <div style="position: relative; aspect-ratio: 3/2; overflow: hidden;">
          <img 
            src="${post.featured_image_r2_key ? `/i/${escapeAttr(post.featured_image_r2_key)}` : '/placeholder.jpg'}" 
            alt="${escapeAttr(post.title)}"
            class="card-img w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        </div>
        <div class="p-5 flex flex-col flex-1">
          ${post.hat ? `
            <div class="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">
              ${escapeHtml(post.hat)}
            </div>
          ` : `
            <span class="text-xs font-bold text-accent uppercase mb-2">${escapeHtml(post.category_name)}</span>
          `}
          <h3 class="font-bold text-lg leading-tight mb-2 group-hover:text-accent transition-colors">
            ${escapeHtml(post.title)}
          </h3>
          <div class="mt-auto text-xs text-gray-400">
            ${formatTime(post.published_at)}
          </div>
        </div>
      </a>
    </article>
  `).join('')

  // Remaining Hot Rail as List
  const listPosts = sidePosts.slice(2, 5)
  const listHtml = listPosts.length > 0 ? `
    <div class="card p-5 mt-6 bg-gray-50 border-none">
      <h4 class="font-bold text-sm uppercase text-gray-500 mb-4 tracking-wider">Mais Recentes</h4>
      <ul class="space-y-4">
        ${listPosts.map(post => `
          <li class="border-b border-gray-200 last:border-0 pb-3 last:pb-0">
            <a href="${baseUrl}/noticia/${escapeAttr(post.slug)}" class="group">
              ${post.hat ? `
                <div class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
                  ${escapeHtml(post.hat)}
                </div>
              ` : ''}
              <h4 class="font-semibold text-sm group-hover:text-accent transition-colors leading-snug">
                ${escapeHtml(post.title)}
              </h4>
              <span class="text-xs text-gray-400 mt-1 block">${formatTime(post.published_at)}</span>
            </a>
          </li>
        `).join('')}
      </ul>
    </div>
  ` : ''

  return `
    <section class="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-12">
      <div class="lg:col-span-8">
        ${heroHtml}
      </div>
      <div class="lg:col-span-4 flex flex-col gap-6">
        ${sideHtml}
        ${listHtml}
      </div>
    </section>
  `
}

function renderRadarSection(posts: HomePost[], baseUrl: string): string {
  if (posts.length === 0) return ''
  
  return `
    <section class="mb-12">
      <div class="flex items-center justify-between mb-6 border-b border-gray-200 pb-2">
        <h2 class="text-2xl font-black tracking-tight">Em Alta</h2>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        ${posts.map(post => `
          <a href="${baseUrl}/noticia/${escapeAttr(post.slug)}" class="group block">
            <div class="aspect-video rounded-lg overflow-hidden mb-3 bg-gray-100">
              <img 
                src="${post.featured_image_r2_key ? `/i/${escapeAttr(post.featured_image_r2_key)}` : '/placeholder.jpg'}" 
                alt="${escapeAttr(post.title)}"
                class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                loading="lazy"
              />
            </div>
            ${post.hat ? `
              <div class="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">
                ${escapeHtml(post.hat)}
              </div>
            ` : `
              <span class="text-xs font-bold text-gray-400 uppercase">${escapeHtml(post.category_name)}</span>
            `}
            <h3 class="font-bold text-base leading-snug mt-1 group-hover:text-accent transition-colors">
              ${escapeHtml(post.title)}
            </h3>
          </a>
        `).join('')}
      </div>
    </section>
  `
}

function renderCategorySection(block: CategoryBlock, baseUrl: string, index: number): string {
  const isInverted = index % 2 !== 0 // Alternate layout
  const lead = block.lead
  const list = block.list
  
  const leadImage = lead.featured_image_r2_key ? `/i/${escapeAttr(lead.featured_image_r2_key)}` : '/placeholder.jpg'

  return `
    <section class="py-8 border-t border-gray-200">
      <h2 class="text-2xl font-black mb-6 flex items-center gap-3">
        <span class="w-3 h-3 rounded-full bg-accent"></span>
        ${escapeHtml(block.name)}
      </h2>
      
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <!-- Lead Story -->
        <div class="lg:col-span-7 ${isInverted ? 'lg:order-2' : ''}">
          <a href="${baseUrl}/noticia/${escapeAttr(lead.slug)}" class="group block relative aspect-video rounded-xl overflow-hidden">
            <img 
              src="${leadImage}"
              alt="${escapeAttr(lead.title)}"
              class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              loading="lazy"
            />
            <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent"></div>
            <div class="absolute bottom-0 left-0 p-6 w-full">
              ${lead.hat ? `
                <div class="text-xs font-bold text-gray-300 uppercase tracking-widest mb-2">
                  ${escapeHtml(lead.hat)}
                </div>
              ` : ''}
              <h3 class="text-white font-bold text-2xl leading-tight mb-2 group-hover:text-gray-200">
                ${escapeHtml(lead.title)}
              </h3>
              <p class="text-gray-300 text-sm line-clamp-2 hidden md:block">
                ${escapeHtml(truncate(lead.excerpt, 120))}
              </p>
            </div>
          </a>
        </div>

        <!-- Sidebar List -->
        <div class="lg:col-span-5 flex flex-col justify-center ${isInverted ? 'lg:order-1' : ''}">
          <ul class="space-y-6">
            ${list.map(post => `
              <li class="group">
                <a href="${baseUrl}/noticia/${escapeAttr(post.slug)}" class="flex gap-4">
                  <div class="w-24 h-16 rounded bg-gray-100 overflow-hidden flex-shrink-0">
                    <img 
                      src="${post.featured_image_r2_key ? `/i/${escapeAttr(post.featured_image_r2_key)}` : '/placeholder.jpg'}"
                      class="w-full h-full object-cover group-hover:scale-110 transition-transform"
                      loading="lazy"
                    />
                  </div>
                  <div>
                    ${post.hat ? `
                      <div class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
                        ${escapeHtml(post.hat)}
                      </div>
                    ` : ''}
                    <h4 class="font-bold text-sm leading-snug group-hover:text-accent transition-colors">
                      ${escapeHtml(post.title)}
                    </h4>
                    <span class="text-xs text-gray-400 mt-1 block">${formatTime(post.published_at)}</span>
                  </div>
                </a>
              </li>
            `).join('')}
          </ul>
        </div>
      </div>
    </section>
  `
}

// ============================================================================
// Main Renderer
// ============================================================================

export async function renderHomePage(
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
  const nonce = c.get('cspNonce') || ''
  const { renderAdSlot, generateAdsLoaderScript, findActiveSlotsByTemplate } = await import('../ads')
  const { baseUrl, siteName, coverR2Key, coverAlt, coverAspectRatio } = params
  
  // Ad Slots
  const adSlots = await findActiveSlotsByTemplate(c.env, 'home')
  const findSlot = (name: string) => adSlots.find(s => s.name === name)
  const pageContext = { template: 'home' as const, slug: '' }
  const userContext = { isSubscriber: false }
  
  const adTop = findSlot('home_top_leaderboard') ? renderAdSlot({ slot: findSlot('home_top_leaderboard')!, page: pageContext, user: userContext }) : ''
  const adMid = findSlot('home_infeed_1') ? renderAdSlot({ slot: findSlot('home_infeed_1')!, page: pageContext, user: userContext }) : ''
  
  const adsScript = await generateAdsLoaderScript(c.env)
  
  // Prepare Nav
  const navItems = data.sections.map(s => ({
    label: s.title,
    href: s.type === 'tag' ? `/tag/${s.tagSlug}` : `/categoria/${s.slug}`,
    active: false
  }))

  // --- Content Assembly ---

  // 1. Hero Section (Manchete + 2 Destaques)
  // We use data.hotRail to fill the side column of the hero
  const heroHtml = renderHeroSection(data.hero, data.hotRail, baseUrl)

  // 2. Radar Section (4 Featured Posts)
  // We use data.dualFeatures + maybe some explainers or extra hotRail items
  // Let's create a curated list of 4 items for the "Radar" strip
  const radarPosts = [...data.dualFeatures, ...data.explainers].slice(0, 4)
  const radarHtml = renderRadarSection(radarPosts, baseUrl)

  // 3. Categories (Alternating Layout)
  const categoriesHtml = data.categoryBlocks.map((block, i) => {
    let html = renderCategorySection(block, baseUrl, i)
    if (i === 1 && adMid) { // Insert ad after 2nd category
      html += `<div class="container my-8">${adMid}</div>`
    }
    return html
  }).join('')

  const bodyHtml = `
    <div class="container py-8">
      ${adTop ? `<div class="mb-12 text-center">${adTop}</div>` : ''}
      
      ${heroHtml}
      
      ${radarHtml}
      
      <div class="space-y-4">
        ${categoriesHtml}
      </div>
    </div>
    
    ${adsScript}
  `

  return renderPublicLayout({
    title: `${siteName} - Notícias e Análises`,
    description: "Cobertura completa",
    canonicalUrl: baseUrl,
    nonce,
    siteName,
    navItems,
    coverOfDay: coverR2Key ? { r2Key: coverR2Key, alt: coverAlt, aspectRatio: coverAspectRatio } : null,
    bodyHtml
  })
}
