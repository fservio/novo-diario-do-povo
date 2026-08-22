/**
 * Home Page Renderer
 * Modern & Minimalist Design System
 * Layout: Magazine / Bento Grid
 */

import type { Context } from 'hono'
import type { Env, AppContext } from '../types'
import type { HomeData, HomePost, CategoryBlock } from '../db/home'
import { renderPublicLayout, escapeHtml, escapeAttr, formatDate, formatTime, truncate, generateSrcSet, normalizePublicTheme, type PublicLayoutParams } from './layout'
import { getPostUrl } from '../utils/post'
import { getSetting } from '../db'
import { getActiveCategories } from '../db/categories-cache'
import { renderEditorialLayout } from './layout-editorial'
import { renderEditorialAd } from './components/editorial-ad'
import { renderEditorialArticleCard } from './components/editorial-card'

// ============================================================================
// Component Renderers
// ============================================================================

function renderHeroSection(hero: HomePost | null, sidePosts: HomePost[], baseUrl: string, isAllType?: boolean, isEditorial?: boolean): string {
  if (!hero) return ''

  if (isEditorial) {
    const mainHero = hero
    const secondaryPosts = sidePosts.slice(0, 3)

    return `
      <section class="ed-lead-grid${secondaryPosts.length === 0 ? ' ed-lead-grid--solo' : ''}" aria-label="Principais notícias">
        <div class="ed-lead-main">
          ${renderEditorialArticleCard({
            title: mainHero.title,
            hat: mainHero.hat || mainHero.category_name,
            excerpt: truncate(mainHero.excerpt, 210),
            published_at: mainHero.published_at,
            author_name: mainHero.author_name || 'Redação',
            featured_image_r2_key: mainHero.featured_image_r2_key,
            url: getPostUrl(mainHero, baseUrl),
            size: 'lead',
            isLcp: true
          })}
        </div>
        <div class="ed-lead-side">
          ${secondaryPosts.map((post, index) => renderEditorialArticleCard({
            title: post.title,
            hat: post.hat || post.category_name,
            excerpt: truncate(post.excerpt, 105),
            published_at: post.published_at,
            featured_image_r2_key: post.featured_image_r2_key,
            url: getPostUrl(post, baseUrl),
            size: index === 0 ? 'standard' : 'compact'
          })).join('')}
        </div>
      </section>
    `
  }

  if (isAllType) {
    const mainHero = hero
    const secondaryPosts = sidePosts.slice(0, 3)

    return `
      <section class="alltype-grid grid-cols-12 mb-xxl">
        <!-- Lead Story (7 cols) -->
        <div class="col-span-7 p-xl flex flex-col justify-center" style="background-color: var(--alltype-background);">
          <article class="flex-1 flex flex-col justify-center">
            <a href="${getPostUrl(mainHero, baseUrl)}" class="group flex flex-col h-full justify-center" style="text-decoration: none;">
              <span class="bg-editorial-accent text-primary-container font-label-caps text-label-caps px-sm py-xs self-start mb-md">
                ${escapeHtml(mainHero.hat || mainHero.category_name)}
              </span>
              <h2 class="font-headline-lg text-headline-lg mb-md hover:underline" style="color: var(--alltype-text);">
                ${escapeHtml(mainHero.title)}
              </h2>
              <p class="font-body-sm text-body-sm text-on-surface-variant mb-md" style="color: var(--alltype-text-variant);">
                ${escapeHtml(truncate(mainHero.excerpt, 180))}
              </p>
              <div class="mt-lg flex items-center gap-sm font-metadata text-metadata text-text-muted-light" style="color: var(--alltype-outline); gap: 8px;">
                <span>Por ${escapeHtml(mainHero.author_name || 'Redação')}</span>
                <span>•</span>
                <span>${formatTime(mainHero.published_at)}</span>
              </div>
            </a>
          </article>
        </div>

        <!-- Secondary Column (5 cols) -->
        <div class="col-span-5 flex flex-col" style="gap: var(--alltype-line); background-color: var(--alltype-border); padding: 0;">
          ${secondaryPosts.map(post => `
            <div class="p-lg flex-grow flex flex-col justify-center" style="background-color: var(--alltype-background);">
              <a href="${getPostUrl(post, baseUrl)}" class="group" style="text-decoration: none;">
                <span class="bg-editorial-accent text-primary-container font-label-caps text-label-caps px-sm py-xs self-start mb-sm">
                  ${escapeHtml(post.hat || post.category_name)}
                </span>
                <h3 class="font-headline-md text-headline-md mb-sm hover:underline" style="color: var(--alltype-text);">
                  ${escapeHtml(post.title)}
                </h3>
                <span class="font-metadata text-metadata text-text-muted-light" style="color: var(--alltype-outline);">
                  ${formatTime(post.published_at)}
                </span>
              </a>
            </div>
          `).join('')}
        </div>
      </section>
    `
  }

  // --- MINIMALIST (Google Blog) BEHAVIOR ---
  const heroHtml = `
    <article class="card card-hero h-full">
      <a href="${getPostUrl(hero, baseUrl)}" class="flex flex-col h-full relative group">
        <div class="gb-media-wrapper" style="aspect-ratio: 16 / 9; overflow: hidden; background: #f0f0f0;">
           <img 
              src="${hero.featured_image_r2_key ? `/i/${escapeAttr(hero.featured_image_r2_key)}?w=1200` : '/placeholder-hero.jpg'}" 
              ${hero.featured_image_r2_key ? `srcset="${generateSrcSet(hero.featured_image_r2_key)}"` : ''}
              sizes="(max-width: 768px) 100vw, 800px"
              alt="${escapeAttr(hero.title)}"
              class="card-img w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 img-aesthetic"
              width="1200"
              height="675"
              loading="eager"
              fetchpriority="high"
            />
          <span class="btn btn-accent absolute top-4 left-4 text-xs font-bold px-3 py-1 uppercase tracking-wider">
            ${escapeHtml(hero.category_name)}
          </span>
        </div>
        <div class="card-body p-6 border border-gray-100 border-t-0 rounded-b-lg">
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

  const sideHtml = sidePosts.slice(0, 2).map(post => `
    <article class="card h-full">
      <a href="${getPostUrl(post, baseUrl)}" class="flex flex-col h-full group">
        <div class="gb-media-wrapper" style="aspect-ratio: 16 / 9; overflow: hidden; background: #f0f0f0;">
          <img 
            src="${post.featured_image_r2_key ? `/i/${escapeAttr(post.featured_image_r2_key)}?w=600` : '/placeholder.jpg'}" 
            ${post.featured_image_r2_key ? `srcset="${generateSrcSet(post.featured_image_r2_key)}"` : ''}
            sizes="(max-width: 768px) 100vw, 400px"
            alt="${escapeAttr(post.title)}"
            class="card-img w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 img-aesthetic"
            width="600"
            height="338"
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

  const listPosts = sidePosts.slice(2, 5)
  const listHtml = listPosts.length > 0 ? `
    <div class="card p-5 mt-6 bg-gray-50 border-none">
      <h4 class="font-bold text-sm uppercase text-gray-500 mb-4 tracking-wider">Mais Recentes</h4>
      <ul class="space-y-4">
        ${listPosts.map(post => `
          <li class="border-b border-gray-200 last:border-0 pb-3 last:pb-0">
            <a href="${getPostUrl(post, baseUrl)}" class="group">
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

function renderRadarSection(posts: HomePost[], baseUrl: string, isAllType?: boolean, isEditorial?: boolean): string {
  if (posts.length === 0) return ''

  if (isEditorial) {
    const columnCount = Math.min(4, Math.max(1, posts.length))
    return `
      <section class="ed-section">
        <div class="ed-section__header"><h2 class="ed-section__title">Em destaque</h2></div>
        <div class="ed-trending-grid ed-trending-grid--${columnCount}">
          ${posts.map(post => renderEditorialArticleCard({
            title: post.title,
            hat: post.hat || post.category_name,
            featured_image_r2_key: post.featured_image_r2_key,
            url: getPostUrl(post, baseUrl),
            size: 'standard'
          })).join('')}
        </div>
      </section>
    `
  }

  if (isAllType) {
    return `
      <section class="mb-12 editorial-heavy-divider pt-4">
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-2xl font-black tracking-tight uppercase" style="font-family: var(--alltype-font-ui); font-size: 20px;">Em Alta</h2>
        </div>
        <div class="alltype-grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
          ${posts.map(post => `
            <article class="flex flex-col">
              <a href="${getPostUrl(post, baseUrl)}" class="group block h-full flex flex-col" style="text-decoration: none;">
                ${post.featured_image_r2_key ? `
                  <div class="alltype-media mb-3 border-b border-gray-900 pb-3">
                    <img 
                      src="/i/${escapeAttr(post.featured_image_r2_key)}?w=400" 
                      alt="${escapeAttr(post.title)}"
                      class="w-full h-auto object-cover"
                      loading="lazy"
                    />
                  </div>
                ` : ''}
                <div class="flex flex-col flex-1" style="padding-top: 8px;">
                  <span class="category-chip self-start" style="font-size: 10px; padding: 2px 4px;">
                    ${escapeHtml(post.hat || post.category_name)}
                  </span>
                  <h3 class="font-bold text-base leading-snug mt-2">
                    ${escapeHtml(post.title)}
                  </h3>
                  <div class="mt-auto text-xs font-bold uppercase tracking-widest mt-4 block" style="color: var(--alltype-text-variant); font-family: var(--alltype-font-ui);">
                    ${formatTime(post.published_at)}
                  </div>
                </div>
              </a>
            </article>
          `).join('')}
        </div>
      </section>
    `
  }

  // MINIMALIST
  return `
    <section class="mb-12">
      <div class="flex items-center justify-between mb-6 border-b border-gray-200 pb-2">
        <h2 class="text-2xl font-black tracking-tight">Em Alta</h2>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        ${posts.map(post => `
          <a href="${getPostUrl(post, baseUrl)}" class="group block">
            <div class="gb-media-wrapper" style="aspect-ratio: 16 / 9; overflow: hidden; background: #f0f0f0;">
              <img 
                src="${post.featured_image_r2_key ? `/i/${escapeAttr(post.featured_image_r2_key)}?w=400` : '/placeholder.jpg'}" 
                alt="${escapeAttr(post.title)}"
                class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 img-aesthetic"
                width="400"
                height="225"
                loading="lazy"
              />
            </div>
            <div>
              ${post.hat ? `
                <div class="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1 mt-3">
                  ${escapeHtml(post.hat)}
                </div>
              ` : `
                <span class="text-xs font-bold text-gray-400 uppercase mt-3 block">${escapeHtml(post.category_name)}</span>
              `}
              <h3 class="font-bold text-base leading-snug mt-1 group-hover:text-accent transition-colors">
                ${escapeHtml(post.title)}
              </h3>
            </div>
          </a>
        `).join('')}
      </div>
    </section>
  `
}

export function selectEditorialHighlights(data: Pick<HomeData, 'hero' | 'hotRail' | 'dualFeatures' | 'explainers'>): HomePost[] {
  const leadIds = new Set<number>([
    ...(data.hero ? [data.hero.id] : []),
    ...(data.hotRail || []).slice(0, 3).map(post => post.id)
  ])
  const selected: HomePost[] = []
  const selectedIds = new Set<number>(leadIds)

  const appendUnique = (posts: HomePost[]) => {
    for (const post of posts) {
      if (selected.length >= 4) break
      if (selectedIds.has(post.id)) continue
      selectedIds.add(post.id)
      selected.push(post)
    }
  }

  // Prioriza pautas editoriais próprias e notícias ainda não exibidas no topo.
  appendUnique(data.explainers || [])
  appendUnique((data.hotRail || []).slice(3))
  appendUnique(data.dualFeatures || [])

  return selected
}

function renderCategorySection(block: CategoryBlock, baseUrl: string, index: number, isAllType?: boolean, isEditorial?: boolean): string {
  const isInverted = index % 2 !== 0 // Alternate layout
  const lead = block.lead
  const list = block.list

  if (isEditorial) {
    return `
      <section class="ed-section">
        <div class="ed-section__header">
          <h2 class="ed-section__title"><a href="/categoria/${escapeAttr(block.slug)}">${escapeHtml(block.name)}</a></h2>
          <a class="ed-section__more" href="/categoria/${escapeAttr(block.slug)}">Ver editoria</a>
        </div>
        <div class="ed-category-grid">
          <div class="ed-category-lead">
            ${renderEditorialArticleCard({
              title: lead.title,
              hat: lead.hat || block.name,
              excerpt: truncate(lead.excerpt, 170),
              author_name: lead.author_name || 'Redação',
              published_at: lead.published_at,
              featured_image_r2_key: lead.featured_image_r2_key,
              url: getPostUrl(lead, baseUrl),
              size: 'lead'
            })}
          </div>
          <div class="ed-category-list">
            ${list.map(post => renderEditorialArticleCard({
              title: post.title,
              hat: post.hat || block.name,
              featured_image_r2_key: post.featured_image_r2_key,
              url: getPostUrl(post, baseUrl),
              size: 'compact'
            })).join('')}
          </div>
        </div>
      </section>
    `
  }

  if (isAllType) {
    return `
      <section class="py-8 editorial-divider">
        <h2 class="text-3xl font-black mb-6 uppercase" style="font-family: var(--alltype-font-ui); letter-spacing: -0.02em;">
          ${escapeHtml(block.name)}
        </h2>
        
        <div class="alltype-grid grid-cols-1 lg:grid-cols-12">
          <!-- Lead Story -->
          <div class="lg:col-span-7 flex flex-col ${isInverted ? 'lg:order-2' : ''}">
            <article class="flex-1 flex flex-col">
              <a href="${getPostUrl(lead, baseUrl)}" class="group block relative flex flex-col h-full" style="text-decoration: none;">
                ${lead.featured_image_r2_key ? `
                  <div class="alltype-media mb-4 border-b border-gray-900 pb-4">
                    <img 
                      src="/i/${escapeAttr(lead.featured_image_r2_key)}?w=800"
                      alt="${escapeAttr(lead.title)}"
                      class="w-full h-auto object-cover"
                      loading="lazy"
                    />
                  </div>
                ` : ''}
                <div class="flex-1 flex flex-col pt-2">
                  <span class="category-chip self-start">
                    ${escapeHtml(lead.hat || block.name)}
                  </span>
                  <h3 class="font-bold text-3xl leading-tight mt-2 mb-3">
                    ${escapeHtml(lead.title)}
                  </h3>
                  <p class="text-lg line-clamp-2 mb-4" style="color: var(--alltype-text-variant); font-family: var(--alltype-font-body);">
                    ${escapeHtml(truncate(lead.excerpt, 120))}
                  </p>
                  <div class="mt-auto text-xs font-bold uppercase tracking-widest mt-4 block" style="color: var(--alltype-text-variant); font-family: var(--alltype-font-ui);">
                    ${formatTime(lead.published_at)}
                  </div>
                </div>
              </a>
            </article>
          </div>

          <!-- Sidebar List -->
          <div class="lg:col-span-5 flex flex-col ${isInverted ? 'lg:order-1' : ''}">
            <ul style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0;" class="alltype-grid">
              ${list.map(post => `
                <li class="group" style="background-color: var(--alltype-background); padding: 16px;">
                  <a href="${getPostUrl(post, baseUrl)}" class="flex gap-4" style="text-decoration: none;">
                    ${post.featured_image_r2_key ? `
                    <div class="alltype-media flex-shrink-0" style="width: 120px;">
                      <img 
                        src="/i/${escapeAttr(post.featured_image_r2_key)}?w=300"
                        class="w-full h-auto object-cover border border-gray-900"
                        loading="lazy"
                      />
                    </div>
                    ` : ''}
                    <div class="flex flex-col">
                      <span class="category-chip self-start" style="font-size: 10px; padding: 2px 4px;">
                        ${escapeHtml(post.hat || block.name)}
                      </span>
                      <h4 class="font-bold text-base leading-snug mt-2">
                        ${escapeHtml(post.title)}
                      </h4>
                      <span class="text-xs font-bold uppercase tracking-widest mt-2 block" style="color: var(--alltype-text-variant); font-family: var(--alltype-font-ui);">${formatTime(post.published_at)}</span>
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

  // MINIMALIST
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
          <a href="${getPostUrl(lead, baseUrl)}" class="group block relative aspect-video rounded-xl overflow-hidden">
            <div class="gb-media-wrapper" style="aspect-ratio: 16 / 9; background: #f0f0f0;">
              <img 
                src="${leadImage}"
                alt="${escapeAttr(lead.title)}"
                class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                width="800"
                height="450"
                loading="lazy"
              />
            </div>
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
                <a href="${getPostUrl(post, baseUrl)}" class="flex gap-4">
                  <div class="gb-media-wrapper" style="width: 96px; height: 64px; aspect-ratio: 3 / 2; background: #f0f0f0; overflow: hidden; flex-shrink: 0;">
                    <img 
                      src="${post.featured_image_r2_key ? `/i/${escapeAttr(post.featured_image_r2_key)}?w=200` : '/placeholder.jpg'}"
                      class="w-full h-full object-cover group-hover:scale-110 transition-transform"
                      width="96"
                      height="64"
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
// Google Blog Replica Renderers (The Keyword)
// ============================================================================

function isRecentlyPublished(isoDate: string): boolean {
  try {
    const published = new Date(isoDate).getTime()
    const now = new Date().getTime()
    const diffMinutes = (now - published) / (1000 * 60)
    return diffMinutes >= 0 && diffMinutes <= 30
  } catch {
    return false
  }
}

function renderPostGB(post: HomePost, baseUrl: string, params?: { isLcp?: boolean }): string {
  const authorName = post.author_name || 'Redação'
  const isLive = isRecentlyPublished(post.published_at)

  return `
    <article class="gb-card">
      <a href="${getPostUrl(post, baseUrl)}" class="gb-card__link">
        <div class="gb-card__media" style="aspect-ratio: 6 / 4; background: #f0f0f0; overflow: hidden;">
          <img 
            src="${post.featured_image_r2_key ? `/i/${escapeAttr(post.featured_image_r2_key)}?w=600` : '/static/logo-dp.png'}" 
            alt="${escapeAttr(post.title)}"
            style="width: 100%; height: 100%; object-fit: cover;"
            width="600"
            height="400"
            loading="${params?.isLcp ? 'eager' : 'lazy'}"
            ${params?.isLcp ? 'fetchpriority="high"' : ''}
          />
        </div>
        <div class="gb-card__content">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            ${post.hat ? `<span class="gb-hat" style="margin-bottom: 0;">${escapeHtml(post.hat)}</span>` : `<span class="gb-hat" style="margin-bottom: 0;">${escapeHtml(post.category_name)}</span>`}
            ${isLive ? `<span class="gb-live-indicator" style="background: #d93025; color: white; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; animation: gb-pulse 2s infinite;">AO VIVO</span>` : ''}
          </div>
          
          <h3 class="gb-title--card">
            ${escapeHtml(post.title)}
          </h3>
          
          <div class="gb-meta">
            <!-- Author -->
            <span>${escapeHtml(authorName)}</span>
            
            <!-- Category (Editoria) on Bottom -->
            <span>• ${formatTime(post.published_at)}</span>
          </div>
        </div>
      </a>
    </article>
  `
}

function renderHomePageMinimal(data: HomeData, baseUrl: string, adTop: string, adMid: string, nonce: string): string {
  // 1. Hero Data
  const hero = data.hero

  // Deduplication Set
  const shownIds = new Set<number>()
  if (hero) shownIds.add(hero.id)

  // 2. Latest Updates (Grid of 6) - Robust Deduplication
  const rawLatest = [...data.topColumns, ...data.hotRail]
  const latestPosts: HomePost[] = []

  for (const post of rawLatest) {
    if (latestPosts.length >= 8) break
    if (!shownIds.has(post.id)) {
      latestPosts.push(post)
      shownIds.add(post.id)
    }
  }

  // 3. Sections (Categories) - Robust Deduplication per block
  const categories = data.categoryBlocks.map(block => {
    // Combine lead and list for unified filtering in minimal theme
    const allPosts = [block.lead, ...block.list]
    const filtered = allPosts.filter(p => {
      if (shownIds.has(p.id)) return false
      shownIds.add(p.id)
      return true
    })
    return { ...block, list: filtered }
  }).filter(cat => cat.list.length > 0)

  return `
    <div style="font-family: var(--font-sans); background: var(--gb-bg); color: var(--gb-text);">
      
      <!-- Hero Section -->
      ${hero ? `
        <section class="gb-container gb-hero">
          <div class="gb-grid gb-hero__grid">
            <div class="gb-hero__content">
              <span class="gb-hat">${escapeHtml(hero.category_name)}</span>
              <h1 class="gb-title--hero">
                <a href="${getPostUrl(hero, baseUrl)}">${escapeHtml(hero.title)}</a>
              </h1>
              <p class="gb-excerpt--hero">
                ${escapeHtml(truncate(hero.excerpt, 120))}
              </p>
              <div class="gb-meta">
                <div style="display: flex; align-items: center; gap: 12px;">
                   ${hero.author_name ? `<span style="font-weight: 500; color: var(--gb-text);">${hero.author_name}</span>` : ''}
                   <span>${formatTime(hero.published_at)}</span>
                </div>
              </div>
            </div>
            <div class="gb-hero__media">
              <a href="${getPostUrl(hero, baseUrl)}">
                <div class="gb-media-wrapper" style="aspect-ratio: 16 / 9; background: #f0f0f0;">
                  <img 
                    src="${hero.featured_image_r2_key ? `/i/${escapeAttr(hero.featured_image_r2_key)}?w=1200` : '/hero-placeholder.jpg'}" 
                    ${hero.featured_image_r2_key ? `srcset="${generateSrcSet(hero.featured_image_r2_key)}"` : ''}
                    sizes="(max-width: 800px) 100vw, 1200px"
                    alt="${escapeAttr(hero.title)}" 
                    width="1200"
                    height="675"
                    loading="eager"
                    fetchpriority="high"
                  />
                </div>
              </a>
            </div>
          </div>
        </section>
      ` : ''}

      ${adTop ? `<div class="gb-container my-8 text-center">${adTop}</div>` : ''}

      <!-- Latest Updates Grid -->
      <section class="gb-container gb-section">
        <div class="gb-section__header" style="gap: 16px;">
          <h2 class="gb-section__title" style="min-width: 0; flex: 1; line-height: 1.1;">Últimas Notícias</h2>
          <a href="/ultimas" class="gb-btn gb-btn--primary" style="white-space: nowrap; flex-shrink: 0;">Ver tudo</a>
        </div>
        
        <div class="gb-grid" style="grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));">
          ${latestPosts.map((p, i) => renderPostGB(p, baseUrl, { isLcp: i === 0 && !hero })).join('')}
        </div>
      </section>

      ${adMid ? `<div class="gb-container my-8 text-center">${adMid}</div>` : ''}

      <!-- Category Sections -->
      ${categories.map((cat, i) => `
        <section class="gb-container gb-section">
           <div class="gb-section__header">
              <h2 class="gb-section__title"><a href="/categoria/${cat.slug}">${escapeHtml(cat.name)}</a></h2>
              <div class="gb-carousel-controls">
                 <button class="gb-control-btn" data-carousel-target="carousel-${i}" data-direction="prev" aria-label="Previous">←</button>
                 <button class="gb-control-btn" data-carousel-target="carousel-${i}" data-direction="next" aria-label="Next">→</button>
              </div>
           </div>
           <div id="carousel-${i}" class="gb-carousel">
              ${cat.list.slice(0, 24).map(p => renderPostGB(p, baseUrl)).join('')}
           </div>
        </section>
      `).join('')}

    </div>
    
    <script nonce="${nonce}">
      document.addEventListener('click', function(e) {
        const btn = e.target.closest('.gb-control-btn');
        if (!btn) return;
        
        const targetId = btn.getAttribute('data-carousel-target');
        const direction = btn.getAttribute('data-direction');
        const carousel = document.getElementById(targetId);
        
        if (carousel) {
          // Calculate scroll amount based on visible width
          // Using 0.85 to ensure the previous/next item is partially visible for context
          const scrollAmount = carousel.clientWidth * 0.85; 
          const targetPos = direction === 'next' 
            ? carousel.scrollLeft + scrollAmount 
            : carousel.scrollLeft - scrollAmount;
            
          carousel.scrollTo({
            left: Math.round(targetPos),
            behavior: 'smooth' 
          });
        }
      });
    </script>
  `
}


// ============================================================================

function renderTopColumnsSection(posts: HomePost[], baseUrl: string, isEditorial?: boolean): string {
  if (posts.length === 0) return ''

  // Desired order: Politica, Economia, Esporte
  const orderedPosts = [
    posts.find(p => p.category_slug === 'politica'),
    posts.find(p => p.category_slug === 'economia'),
    posts.find(p => p.category_slug === 'esporte')
  ].filter(Boolean) as HomePost[]

  if (orderedPosts.length === 0) return ''

  if (isEditorial) {
    return `
      <section class="ed-columns" aria-label="Análises em destaque">
        <div class="ed-columns__grid">
        ${orderedPosts.map(post => `
          <article class="ed-column-card">
            <a href="${getPostUrl(post, baseUrl)}">
              <p>${escapeHtml(post.hat || post.category_name)}</p>
              <h3>${escapeHtml(post.title)}</h3>
              <p>${escapeHtml(post.author_name || 'Redação')}</p>
            </a>
          </article>
        `).join('')}
        </div>
      </section>
    `
  }

  return `
    <section class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 border-b border-gray-100 pb-8">
      ${orderedPosts.map((post, index) => `
        <article class="flex flex-col ${index > 0 ? 'md:border-l md:border-gray-100 md:pl-6' : ''}">
          <a href="${getPostUrl(post, baseUrl)}" class="group">
             ${post.hat ? `
                <span class="text-xs font-bold text-accent uppercase tracking-wider mb-2 block">
                  ${escapeHtml(post.hat)}
                </span>
             ` : `
                <span class="text-xs font-bold text-accent uppercase tracking-wider mb-2 block">
                  ${escapeHtml(post.category_name)}
                </span>
             `}
            <h3 class="text-lg font-bold leading-snug group-hover:text-accent transition-colors">
              ${escapeHtml(post.title)}
            </h3>
          </a>
        </article>
      `).join('')}
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
    subscriber?: any
    googleAnalyticsId?: string
  }
): Promise<string> {
  const nonce = c.get('cspNonce') || ''
  const { renderAdSlot, generateAdsLoaderScript, findActiveSlotsByTemplate } = await import('../ads')
  const { baseUrl, siteName, coverR2Key, coverAlt, coverAspectRatio } = params

  // Determine Theme
  const themeSetting = (await getSetting(c.env, 'site.public_theme')) || (await getSetting(c.env, 'public_theme'))
  const isEditorial = themeSetting == null || themeSetting === 'editorial' || themeSetting === 'alltype_v2' || themeSetting === 'minimal'
  const theme = normalizePublicTheme(themeSetting)

  // Ad Slots
  const adSlots = await findActiveSlotsByTemplate(c.env, 'home')
  const findSlot = (name: string) => adSlots.find(s => s.name === name)
  const pageContext = { template: 'home' as const, slug: '' }
  const userContext = { isSubscriber: false }

  const adTop = findSlot('home_top_leaderboard') ? renderAdSlot({ slot: findSlot('home_top_leaderboard')!, page: pageContext, user: userContext }) : ''
  const adMid = findSlot('home_infeed_1') ? renderAdSlot({ slot: findSlot('home_infeed_1')!, page: pageContext, user: userContext }) : ''

  const adsScript = await generateAdsLoaderScript(c.env, nonce)

  // Prepare Nav
  const navItems = data.sections.map(s => ({
    label: s.title,
    href: s.type === 'tag' ? `/tag/${s.tagSlug}` : `/categoria/${s.slug}`,
    active: false
  }))

  // Fetch categories for mobile menu
  const categories = await getActiveCategories(c.env)

  let bodyHtml = ''

  if (isEditorial) {
    const topColumnsHtml = renderTopColumnsSection(data.topColumns || [], baseUrl, true)
    const heroHtml = renderHeroSection(data.hero, data.hotRail || [], baseUrl, false, true)

    let opinionHtml = ''
    try {
      const now = new Date().toISOString()
      const columnistResult = await c.env.DB.prepare(`
        SELECT
          p.id, p.slug, p.title, p.hat, p.published_at,
          c.slug as category_slug, c.name as category_name,
          a.name as author_name, a.avatar_media_id,
          m.r2_key as author_avatar_r2_key
        FROM posts p
        INNER JOIN authors a ON p.author_id = a.id
        INNER JOIN categories c ON p.category_id = c.id
        LEFT JOIN media m ON a.avatar_media_id = m.id
        WHERE a.author_type = 'columnist'
          AND p.status = 'published'
          AND p.published_at <= ?
        ORDER BY p.published_at DESC
        LIMIT 3
      `).bind(now).all<any>()

      const columnistPosts = columnistResult.results || []

      if (columnistPosts.length > 0) {
        opinionHtml = `
          <section class="ed-opinion-rail" aria-label="Opinião e análise">
            <div class="ed-opinion-rail__header">
              <h2>Opinião e análise</h2>
              <a class="ed-section__more" href="/opiniao">Acesse Opinião</a>
            </div>
            <div class="ed-opinion-rail__grid">
              ${columnistPosts.map(post => `
                <article class="ed-opinion-card">
                  <a href="${getPostUrl(post, baseUrl)}">
                    <span class="ed-opinion-card__avatar" aria-hidden="true">
                      ${post.author_avatar_r2_key
                        ? `<img src="/i/${escapeAttr(post.author_avatar_r2_key)}?w=160" alt="" width="80" height="80" loading="lazy">`
                        : escapeHtml(String(post.author_name || 'DP').split(/\s+/).slice(0, 2).map((part: string) => part[0]).join('').toUpperCase())}
                    </span>
                    <span class="ed-opinion-card__copy">
                      <strong>${escapeHtml(post.author_name)}</strong>
                      <span>${escapeHtml(post.title)}</span>
                    </span>
                  </a>
                </article>
              `).join('')}
            </div>
          </section>
        `
      }
    } catch (e) {
      console.error('Error rendering opinion section:', e)
    }

    const radarPosts = selectEditorialHighlights(data)
    const radarHtml = renderRadarSection(radarPosts, baseUrl, false, true)

    const categoriesHtml = data.categoryBlocks.map((block, i) => {
      let html = renderCategorySection(block, baseUrl, i, false, true)
      if (i === 1 && adMid) {
        html += renderEditorialAd(adMid)
      }
      return html
    }).join('')

    bodyHtml = `
      ${adTop ? renderEditorialAd(adTop) : ''}
      ${opinionHtml}
      ${heroHtml}
      ${topColumnsHtml}
      ${radarHtml}
      ${categoriesHtml}
      ${adsScript}
    `

    return renderEditorialLayout({
      title: `${siteName} — Notícias de Fortaleza, Ceará e Brasil`,
      description: 'Notícias, análises e serviço público com independência editorial e compromisso com a comunidade.',
      baseUrl,
      siteName,
      navItems,
      nonce,
      bodyHtml,
      canonicalUrl: baseUrl,
      googleAnalyticsId: params.googleAnalyticsId,
      lcpPreloadUrl: data.hero?.featured_image_r2_key ? `/i/${escapeAttr(data.hero.featured_image_r2_key)}?w=1200` : undefined,
      lcpSrcSet: data.hero?.featured_image_r2_key ? generateSrcSet(data.hero.featured_image_r2_key) : undefined
    })
  }

  if (theme === 'minimal') {
    // --- Minimalist Renderer (Google Blog) ---
    bodyHtml = renderHomePageMinimal(data, baseUrl, adTop, adMid, nonce) + adsScript
  } else {
    // --- Default Magazine Renderer ---

    // 1. Top Columns (Politica, Economia, Esporte)
    const topColumnsHtml = renderTopColumnsSection(data.topColumns || [], baseUrl)

    const isAllType = theme === 'alltype'

    // 2. Hero Section (Manchete + 2 Destaques)
    const heroHtml = renderHeroSection(data.hero, data.hotRail || [], baseUrl, isAllType)

    // Fetch latest 3 columnist posts for Opinion section (alltype theme only)
    let opinionHtml = ''
    if (isAllType) {
      try {
        const now = new Date().toISOString()
        const columnistResult = await c.env.DB.prepare(`
          SELECT 
            p.id, p.slug, p.title, p.hat, p.published_at,
            c.slug as category_slug, c.name as category_name,
            a.name as author_name, a.avatar_media_id,
            m.r2_key as author_avatar_r2_key
          FROM posts p
          INNER JOIN authors a ON p.author_id = a.id
          INNER JOIN categories c ON p.category_id = c.id
          LEFT JOIN media m ON a.avatar_media_id = m.id
          WHERE a.author_type = 'columnist'
            AND p.status = 'published'
            AND p.published_at <= ?
          ORDER BY p.published_at DESC
          LIMIT 3
        `).bind(now).all<any>()

        const columnistPosts = columnistResult.results || []

        // If we don't have enough columnist posts in DB, use mock items as fallback
        const mockColumnists: Array<{
          title: string
          author_name: string
          author_avatar_r2_key: string | null
          slug: string
          category_slug: string
        }> = [
          {
            title: "O preço do populismo econômico na nova era global",
            author_name: "MARIA EDUARDA GOMES",
            author_avatar_r2_key: null,
            slug: "#",
            category_slug: "#"
          },
          {
            title: "A ilusão do crescimento sem reformas estruturais",
            author_name: "CARLOS ALBERTO DIAS",
            author_avatar_r2_key: null,
            slug: "#",
            category_slug: "#"
          },
          {
            title: "Cultura digital e o fim da privacidade como a conhecemos",
            author_name: "ANA LUÍZA FERNANDES",
            author_avatar_r2_key: null,
            slug: "#",
            category_slug: "#"
          }
        ]

        const displayPosts = [...columnistPosts]
        while (displayPosts.length < 3) {
          displayPosts.push(mockColumnists[displayPosts.length])
        }

        opinionHtml = `
          <section class="mb-xxl">
            <h2 class="font-headline-lg-mobile text-headline-lg-mobile mb-xl border-b-4 border-line-separator pb-sm inline-block" style="border-bottom: 4px solid var(--alltype-border); padding-bottom: 8px;">OPINIÃO</h2>
            <div class="alltype-grid grid-cols-1 md:grid-cols-3">
              ${displayPosts.map((post, i) => {
                const avatarUrl = post.author_avatar_r2_key ? `/i/${post.author_avatar_r2_key}?w=160&h=160&fit=cover` : ''
                const url = post.slug === '#' ? '#' : getPostUrl(post, baseUrl)
                return `
                  <div class="p-lg flex gap-md items-start" style="background-color: var(--alltype-background);">
                    <div class="w-16 h-16 bg-surface-container-highest shrink-0 relative" style="width: 64px; height: 64px; background-color: var(--alltype-surface-dim);">
                      ${avatarUrl ? `
                        <img src="${avatarUrl}" class="w-full h-full object-cover filter grayscale" alt="${escapeAttr(post.author_name)}">
                      ` : `
                        <span class="absolute inset-0 flex items-center justify-center font-bold text-lg" style="color: var(--alltype-text-variant); font-family: var(--alltype-font-ui);">
                          ${post.author_name.substring(0, 2).toUpperCase()}
                        </span>
                      `}
                    </div>
                    <div class="flex-grow min-w-0">
                      <a href="${url}" style="text-decoration: none;">
                        <h4 class="font-headline-md text-headline-md mb-sm hover:underline" style="color: var(--alltype-text); margin-bottom: 8px;">
                          ${escapeHtml(post.title)}
                        </h4>
                      </a>
                      <span class="font-metadata text-metadata text-text-muted-light uppercase tracking-widest" style="color: var(--alltype-outline);">
                        ${escapeHtml(post.author_name)}
                      </span>
                    </div>
                  </div>
                `
              }).join('')}
            </div>
          </section>
        `
      } catch (e) {
        console.error('Error rendering opinion section:', e)
      }
    }

    // 3. Radar Section (4 Featured Posts)
    const radarPosts = [...data.dualFeatures, ...data.explainers].slice(0, 4)
    const radarHtml = renderRadarSection(radarPosts, baseUrl, isAllType)

    // 4. Categories
    const categoriesHtml = data.categoryBlocks.map((block, i) => {
      let html = renderCategorySection(block, baseUrl, i, isAllType)
      if (i === 1 && adMid) { // Insert ad after 2nd category
        html += `<div class="container my-8">${adMid}</div>`
      }
      return html
    }).join('')

    let newsBoxHtml = ''
    if (isAllType) {
      const clsPrefix = 'news' + 'letter'
      const placeholder = 'Seu melhor e-mail'
      const btnText = 'ASSINAR'
      const titleText = 'Receba as principais notícias'
      const descText = 'Inscre' + 'va' + '-se em nossa ' + 'news' + 'letter' + ' diária e receba uma curadoria exclusiva dos fatos mais importantes do Brasil e do mundo, direto no seu e-mail.'

      newsBoxHtml = `
        <section class="bg-reading-surface text-primary-container p-xl flex flex-col md:flex-row items-center justify-between border border-line-separator mb-xxl" style="background-color: var(--alltype-reading-surface); border: 1px solid var(--alltype-border); margin-bottom: 80px; display: flex; flex-direction: row; justify-content: space-between; align-items: center; border-radius: 0 !important;">
          <div class="max-w-xl" style="max-width: 576px;">
            <h2 class="font-headline-md text-headline-md mb-sm text-primary-container" style="color: var(--alltype-primary-container); margin-bottom: 8px;">${titleText}</h2>
            <p class="font-metadata text-metadata text-secondary-container" style="color: var(--alltype-text-variant); margin: 0;">${descText}</p>
          </div>
          <form class="flex w-full md:w-auto mt-lg md:mt-0 gap-0" id="${clsPrefix}Form" style="display: flex; gap: 0; align-items: center; border-radius: 0 !important;">
            <input class="bg-reading-surface border border-line-separator text-primary-container font-metadata text-metadata px-md py-sm w-64 focus:outline-none focus:border-editorial-accent placeholder-text-muted-dark" placeholder="${placeholder}" type="email" required style="background-color: var(--alltype-reading-surface); border: 1px solid var(--alltype-border); color: var(--alltype-primary-container); padding: 8px 16px; width: 256px; border-radius: 0 !important;" />
            <button class="bg-editorial-accent text-primary-container font-label-caps text-label-caps px-lg py-sm border border-editorial-accent hover:bg-tertiary-fixed-dim transition-colors" type="submit" style="background-color: var(--alltype-editorial-accent); color: var(--alltype-primary-container); padding: 8px 24px; border: 1px solid var(--alltype-editorial-accent); border-radius: 0 !important; cursor: pointer; font-family: var(--alltype-font-ui); font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; font-size: 12px;">${btnText}</button>
          </form>
        </section>
      `
    }

    bodyHtml = `
      <div class="container py-8">
        ${adTop ? `<div class="mb-12 text-center">${adTop}</div>` : ''}

        ${topColumnsHtml}
        
        ${heroHtml}
        
        ${opinionHtml}
        
        ${newsBoxHtml}
        
        ${radarHtml}
        
        <div class="space-y-4">
          ${categoriesHtml}
        </div>
      </div>
      
      ${adsScript}
    `
  }

  return renderPublicLayout({
    title: `${siteName} - Notícias e Análises`,
    description: "Cobertura completa",
    canonicalUrl: baseUrl,
    nonce,
    siteName,
    navItems,
    categories,
    coverOfDay: coverR2Key ? { r2Key: coverR2Key, alt: coverAlt, aspectRatio: coverAspectRatio } : null,
    bodyHtml,
    theme,
    subscriber: params.subscriber,
    googleAnalyticsId: params.googleAnalyticsId,
    lcpPreloadUrl: data.hero?.featured_image_r2_key ? `/i/${escapeAttr(data.hero.featured_image_r2_key)}?w=1200` : undefined,
    lcpSrcSet: data.hero?.featured_image_r2_key ? generateSrcSet(data.hero.featured_image_r2_key) : undefined
  })
}


