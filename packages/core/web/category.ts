/**
 * Category Page Renderer
 * Modern & Minimalist Design System
 */

import type { Context } from 'hono'
import type { Env, AppContext } from '../types'
import type { CategoryPageData, CategoryPost } from '../db/category'
import { renderPublicLayout, escapeHtml, escapeAttr, formatDate, truncate, generateSrcSet, normalizePublicTheme, type PublicLayoutParams } from './layout'
import { getPostUrl } from '../utils/post'
import { renderAdSlot, findActiveSlotsByTemplate, generateAdsLoaderScript } from '../ads'
import { getSetting } from '../db'
import { getActiveCategories } from '../db/categories-cache'
import { renderEditorialLayout } from './layout-editorial'
import { renderEditorialArticleCard } from './components/editorial-card'
import { renderEditorialAd } from './components/editorial-ad'

// ============================================================================
// Shared Renderers (Ported from Home)
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

function renderPostGB(post: CategoryPost, baseUrl: string, params?: { isLcp?: boolean; isAllType?: boolean }): string {
  const authorName = post.author_name || 'Redação'
  const isLive = isRecentlyPublished(post.published_at)
  const isAllType = params?.isAllType || false

  return `
    <article class="gb-card">
      <a href="${getPostUrl(post, baseUrl)}" class="gb-card__link">
        ${!isAllType ? `
        <div class="gb-card__media" style="aspect-ratio: 3/2; overflow: hidden; background: #f0f0f0;">
          <img 
            src="${post.featured_image_r2_key ? `/i/${escapeAttr(post.featured_image_r2_key)}?w=600` : '/static/logo-dp.png'}" 
            ${post.featured_image_r2_key ? `srcset="${generateSrcSet(post.featured_image_r2_key)}"` : ''}
            sizes="(max-width: 600px) 100vw, 600px"
            alt="${escapeAttr(post.title)}"
            style="width: 100%; height: 100%; object-fit: cover;"
            loading="${params?.isLcp ? 'eager' : 'lazy'}"
            ${params?.isLcp ? 'fetchpriority="high"' : ''}
          />
        </div>
        ` : ''}
        <div class="gb-card__content">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            ${post.hat ? `<span class="gb-hat" style="margin-bottom: 0;">${escapeHtml(post.hat)}</span>` : `<span class="gb-hat" style="margin-bottom: 0;">${escapeHtml(post.category_name)}</span>`}
            ${isLive ? `<span class="gb-live-indicator" style="background: #d93025; color: white; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; animation: gb-pulse 2s infinite;">AO VIVO</span>` : ''}
          </div>
          
          <h3 class="gb-title--card">
            ${escapeHtml(post.title)}
          </h3>
          
          <div class="gb-meta">
            <span>${escapeHtml(authorName)}</span>
            <span>• ${formatDate(post.published_at)}</span>
          </div>
        </div>
      </a>
    </article>
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
    subscriber?: any
    googleAnalyticsId?: string
  }
): Promise<string> {
  const { category, posts, page, hasNextPage } = data
  const { baseUrl, siteName, navItems, coverOfDay } = options
  const nonce = c.get('cspNonce') || ''

  // Determine Theme
  const themeSetting = (await getSetting(c.env, 'site.public_theme')) || (await getSetting(c.env, 'public_theme'))
  const isEditorial = themeSetting == null || themeSetting === 'editorial' || themeSetting === 'alltype_v2' || themeSetting === 'minimal'
  const theme = normalizePublicTheme(themeSetting)
  const isAllType = theme === 'alltype'

  // Ads
  const adSlots = await findActiveSlotsByTemplate(c.env, 'category')
  const adTop = adSlots.find(s => s.name === 'category_top_leaderboard')
  const adMid = adSlots.find(s => s.name === 'category_infeed')

  const pageContext = { template: 'category' as const, slug: category.slug }
  const userContext = { isSubscriber: false } // Todo: check user

  const adTopHtml = adTop ? renderAdSlot({ slot: adTop, page: pageContext, user: userContext }) : ''
  const adMidHtml = adMid ? renderAdSlot({ slot: adMid, page: pageContext, user: userContext }) : ''
  const adsScript = await generateAdsLoaderScript(c.env, nonce)

  // Fetch active categories for mobile menu
  const categories = await getActiveCategories(c.env)

  // Layout Logic: Hero + Carousel
  const hero = posts.length > 0 ? posts[0] : null
  const list = posts.length > 1 ? posts.slice(1) : []

  if (isEditorial) {
    const coverPosts = page === 1 ? posts.slice(0, 4) : []
    const coverLead = coverPosts[0] || null
    const coverSecondary = coverPosts.slice(1)
    const latestPosts = page === 1 ? posts.slice(4) : posts

    const coverHtml = coverLead ? `
      <section class="ed-category-cover${coverSecondary.length === 0 ? ' ed-category-cover--solo' : ''}" aria-label="Destaques de ${escapeAttr(category.name)}">
        <div class="ed-category-cover__lead">
          ${renderEditorialArticleCard({
            title: coverLead.title,
            hat: coverLead.hat || coverLead.category_name,
            excerpt: truncate(coverLead.excerpt, 220),
            published_at: coverLead.published_at,
            author_name: coverLead.author_name || 'Redação',
            featured_image_r2_key: coverLead.featured_image_r2_key,
            url: getPostUrl(coverLead, baseUrl),
            isLcp: true,
            size: 'lead'
          })}
        </div>
        ${coverSecondary.length > 0 ? `
          <div class="ed-category-cover__secondary">
            ${coverSecondary.map((post, index) => renderEditorialArticleCard({
              title: post.title,
              hat: post.hat || post.category_name,
              published_at: post.published_at,
              featured_image_r2_key: post.featured_image_r2_key,
              url: getPostUrl(post, baseUrl),
              size: index === 0 ? 'standard' : 'compact'
            })).join('')}
          </div>
        ` : ''}
      </section>
    ` : ''

    const latestHtml = latestPosts.length > 0 ? `
      <section class="ed-category-latest" aria-labelledby="categoryLatestTitle">
        <div class="ed-category-latest__header">
          <div>
            <p class="ed-kicker">Em ordem cronológica</p>
            <h2 id="categoryLatestTitle">${page === 1 ? `Últimas de ${escapeHtml(category.name)}` : `Arquivo de ${escapeHtml(category.name)}`}</h2>
          </div>
          ${page > 1 ? `<p>Página ${page}</p>` : ''}
        </div>
        <div class="ed-listing">
          ${latestPosts.map((post, idx) => renderEditorialArticleCard({
            title: post.title,
            hat: post.hat || post.category_name,
            excerpt: truncate(post.excerpt, 180),
            published_at: post.published_at,
            author_name: post.author_name || 'Redação',
            featured_image_r2_key: post.featured_image_r2_key,
            url: getPostUrl(post, baseUrl),
            isLcp: page > 1 && idx === 0,
            size: 'standard'
          })).join('')}
        </div>
      </section>
    ` : ''

    const bodyHtml = `
      <header class="ed-category-heading">
        <div>
          <p class="ed-kicker">Editoria</p>
          <h1 id="categoryTitle" class="ed-page-title">${escapeHtml(category.name)}</h1>
        </div>
        ${hero ? `
          <p class="ed-category-heading__updated">
            <span>Última atualização</span>
            <time datetime="${escapeAttr(hero.published_at)}">${escapeHtml(formatDate(hero.published_at))}</time>
          </p>
        ` : ''}
      </header>

      ${adTopHtml ? renderEditorialAd(adTopHtml) : ''}

      <div id="categoryList">
        ${coverHtml}
        ${coverHtml && adMidHtml ? renderEditorialAd(adMidHtml) : ''}
        ${latestHtml}
        ${!coverHtml && adMidHtml ? renderEditorialAd(adMidHtml) : ''}
      </div>

      ${(page > 1 || hasNextPage) ? `
        <nav id="pagination" class="ed-pagination" aria-label="Paginação">
          ${page > 1 ? `<a class="ed-button ed-button--secondary" href="/categoria/${escapeAttr(category.slug)}?page=${page - 1}">Anterior</a>` : ''}
          <span>Página ${page}</span>
          ${hasNextPage ? `<a class="ed-button ed-button--secondary" href="/categoria/${escapeAttr(category.slug)}?page=${page + 1}">Próxima</a>` : ''}
        </nav>
      ` : ''}

      ${posts.length === 0 ? `<div class="ed-empty">Nenhum artigo encontrado nesta editoria.</div>` : ''}
      ${adsScript}
    `

    return renderEditorialLayout({
      title: `${category.name} — ${siteName}`,
      description: category.description || `Notícias sobre ${category.name}`,
      canonicalUrl: `${baseUrl}/categoria/${category.slug}`,
      nonce,
      siteName,
      navItems,
      bodyHtml,
      baseUrl,
      googleAnalyticsId: options.googleAnalyticsId,
      lcpPreloadUrl: hero?.featured_image_r2_key ? `/i/${escapeAttr(hero.featured_image_r2_key)}?w=1200` : undefined,
      lcpSrcSet: hero?.featured_image_r2_key ? generateSrcSet(hero.featured_image_r2_key) : undefined
    })
  }

  const bodyHtml = isAllType ? `
    <div style="background-color: var(--alltype-background); min-height: 100vh;">
      
      <!-- Category Header -->
      <header class="gb-container py-8 border-b-4 border-gray-900 mb-8 editorial-heavy-divider">
        <h1 id="categoryTitle" class="text-6xl font-black tracking-tight mb-2 uppercase" style="font-family: var(--alltype-font-ui); letter-spacing: -0.02em;">${escapeHtml(category.name)}</h1>
        ${category.description ? `<p class="text-xl" style="color: var(--alltype-text-variant); font-family: var(--alltype-font-body);">${escapeHtml(category.description)}</p>` : ''}
      </header>

      ${adTopHtml ? `<div class="gb-container mb-8 text-center">${adTopHtml}</div>` : ''}

      <!-- List Section -->
      <section class="gb-container mb-12">
        <div class="alltype-grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          ${[hero, ...list].filter((p): p is CategoryPost => p !== null).map(post => `
            <article class="flex flex-col" style="background-color: var(--alltype-background); padding: 24px;">
              <a href="${getPostUrl(post, baseUrl)}" class="group block h-full flex flex-col" style="text-decoration: none;">
                ${post.featured_image_r2_key ? `
                  <div class="alltype-media mb-4 border-b border-gray-900 pb-4">
                    <img 
                      src="/i/${escapeAttr(post.featured_image_r2_key)}?w=600" 
                      alt="${escapeAttr(post.title)}"
                      class="w-full h-auto object-cover"
                      loading="lazy"
                    />
                  </div>
                ` : ''}
                <div class="flex flex-col flex-1">
                  <span class="category-chip self-start">
                    ${escapeHtml(post.hat || post.category_name)}
                  </span>
                  <h3 class="font-bold text-2xl leading-tight mt-2 mb-3" style="font-family: var(--alltype-font-headline);">
                    ${escapeHtml(post.title)}
                  </h3>
                  <p class="text-lg line-clamp-3 mb-4" style="color: var(--alltype-text-variant); font-family: var(--alltype-font-body);">
                    ${escapeHtml(truncate(post.excerpt, 120))}
                  </p>
                  <div class="mt-auto text-xs font-bold uppercase tracking-widest mt-4 block" style="color: var(--alltype-text-variant); font-family: var(--alltype-font-ui);">
                    ${formatDate(post.published_at)}
                  </div>
                </div>
              </a>
            </article>
          `).join('')}
        </div>
      </section>

      ${adMidHtml ? `<div class="gb-container mb-12 text-center">${adMidHtml}</div>` : ''}

      ${(page > 1 || hasNextPage) ? `
        <nav id="pagination" class="gb-container" style="display: flex; justify-content: center; gap: 12px; margin: 32px auto;" aria-label="Paginacao">
          ${page > 1 ? `<a class="btn-primary" href="/categoria/${escapeAttr(category.slug)}?page=${page - 1}" style="padding: 8px 16px;">Anterior</a>` : ''}
          <span style="align-self: center; font-weight: bold; font-family: var(--alltype-font-ui);">Página ${page}</span>
          ${hasNextPage ? `<a class="btn-primary" href="/categoria/${escapeAttr(category.slug)}?page=${page + 1}" style="padding: 8px 16px;">Próxima</a>` : ''}
        </nav>
      ` : ''}

      ${posts.length === 0 ? `
        <div class="gb-container py-12 text-center text-gray-500 font-bold" style="font-family: var(--alltype-font-ui);">
          Nenhum artigo encontrado nesta categoria.
        </div>
      ` : ''}

    </div>
    
    ${adsScript}
  ` : `
    <div style="font-family: var(--font-sans); background: var(--gb-bg); color: var(--gb-text); min-height: 100vh;">
      
      <!-- Category Header -->
      <header class="gb-container py-8 border-b border-gray-100 mb-8">
        <h1 id="categoryTitle" class="text-4xl font-black tracking-tight mb-2">${escapeHtml(category.name)}</h1>
        ${category.description ? `<p class="text-gray-500 text-lg">${escapeHtml(category.description)}</p>` : ''}
      </header>

      ${adTopHtml ? `<div class="gb-container mb-8 text-center">${adTopHtml}</div>` : ''}

      <!-- Hero Section -->
      ${hero ? `
        <section class="gb-container gb-hero mb-12">
          <div class="gb-grid gb-hero__grid">
            <div class="gb-hero__content">
              <span class="gb-hat">${escapeHtml(hero.category_name)}</span>
              <h2 class="gb-title--hero">
                <a href="${getPostUrl(hero, baseUrl)}">${escapeHtml(hero.title)}</a>
              </h2>
              <p class="gb-excerpt--hero">
                ${escapeHtml(truncate(hero.excerpt, 120))}
              </p>
              <div class="gb-meta">
                 <div style="display: flex; align-items: center; gap: 12px;">
                    ${hero.author_name ? `<span style="font-weight: 500; color: var(--gb-text);">${hero.author_name}</span>` : ''}
                    <span>${formatDate(hero.published_at)}</span>
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

      ${adMidHtml ? `<div class="gb-container mb-12 text-center">${adMidHtml}</div>` : ''}

      <!-- Carousel / List Section -->
      ${list.length > 0 ? `
         <section class="gb-container gb-section">
            <div class="gb-section__header">
              <h2 class="gb-section__title">Mais em ${escapeHtml(category.name)}</h2>
              <div class="gb-carousel-controls">
                 <button class="gb-control-btn" data-carousel-target="carousel-cat" data-direction="prev" aria-label="Previous">←</button>
                 <button class="gb-control-btn" data-carousel-target="carousel-cat" data-direction="next" aria-label="Next">→</button>
              </div>
            </div>
            <div id="categoryList" class="gb-carousel">
              ${list.map(p => renderPostGB(p, baseUrl, { isAllType })).join('')}
            </div>
         </section>
      ` : ''}

      ${(page > 1 || hasNextPage) ? `
        <nav id="pagination" class="gb-container" style="display: flex; justify-content: center; gap: 12px; margin: 32px auto;" aria-label="Paginacao">
          ${page > 1 ? `<a class="gb-btn gb-btn--text" href="/categoria/${escapeAttr(category.slug)}?page=${page - 1}">Anterior</a>` : ''}
          <span style="align-self: center; color: #5f6368; font-size: 0.875rem;">Pagina ${page}</span>
          ${hasNextPage ? `<a class="gb-btn gb-btn--text" href="/categoria/${escapeAttr(category.slug)}?page=${page + 1}">Proxima</a>` : ''}
        </nav>
      ` : ''}

      ${posts.length === 0 ? `
        <div class="gb-container py-12 text-center text-gray-500">
          Nenhum artigo encontrado nesta categoria.
        </div>
      ` : ''}

    </div>
    
    ${adsScript}
    
    <!-- Carousel Script (Reused) -->
    <script nonce="${nonce}">
      document.addEventListener('click', function(e) {
        const btn = e.target.closest('.gb-control-btn');
        if (!btn) return;
        
        const targetId = btn.getAttribute('data-carousel-target');
        const direction = btn.getAttribute('data-direction');
        const carousel = targetId === 'carousel-cat'
          ? document.getElementById('categoryList')
          : document.getElementById(targetId);
        
        if (carousel) {
          const scrollAmount = carousel.clientWidth * 0.8; 
          carousel.scrollBy({
            left: direction === 'next' ? scrollAmount : -scrollAmount,
            behavior: 'smooth'
          });
        }
      });
    </script>
  `

  return renderPublicLayout({
    title: `${category.name} - ${siteName}`,
    description: category.description || `Notícias sobre ${category.name}`,
    canonicalUrl: `${baseUrl}/categoria/${category.slug}`,
    nonce,
    siteName,
    navItems,
    categories,
    coverOfDay,
    bodyHtml,
    theme,
    subscriber: options.subscriber,
    googleAnalyticsId: options.googleAnalyticsId,
    lcpPreloadUrl: hero?.featured_image_r2_key ? `/i/${escapeAttr(hero.featured_image_r2_key)}?w=1200` : undefined,
    lcpSrcSet: hero?.featured_image_r2_key ? generateSrcSet(hero.featured_image_r2_key) : undefined
  })
}
