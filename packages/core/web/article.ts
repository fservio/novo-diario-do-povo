/**
 * Article Page Renderer
 * Modern, Clean, Typography-focused
 */

import type { Context } from 'hono'
import type { Env, AppContext } from '../types'
import type { ArticlePost, RelatedPost } from '../db/article'
import { renderPublicLayout, escapeHtml, escapeAttr, formatDate, formatTime, estimateReadingTime, truncate, normalizePublicTheme, type PublicLayoutParams } from './layout'
import { getPostUrl } from '../utils/post'
import { renderAdSlot, findActiveSlotsByTemplate, generateAdsLoaderScript } from '../ads'
import { generateArticleJsonLd, generateLiveBlogJsonLd, generateBreadcrumbJsonLd } from '../seo'
import { renderMarkdownToHtml, sanitizeHtml } from '../render/sanitize'
import { renderLiveBlogTimeline, renderLiveBlogScript } from './liveblog'
import { findLiveUpdates, getSetting } from '../db'
import { getActiveCategories } from '../db/categories-cache'
import { renderEditorialLayout } from './layout-editorial'
import { renderEditorialArticleCard } from './components/editorial-card'
import { renderEditorialAd } from './components/editorial-ad'
import {
  appendSiteName,
  buildArticleShareMessage,
  buildTrackedShareUrl,
  normalizeSocialSiteName,
  type SocialMeta
} from './social'

// ============================================================================
// Helpers
// ============================================================================

function truncateContent(html: string, maxLength: number): string {
  const text = html.replace(/<[^>]+>/g, '')
  if (text.length <= maxLength) return html
  const cutoff = html.substring(0, maxLength)
  const lastPTag = cutoff.lastIndexOf('</p>')
  if (lastPTag > 0) {
    return html.substring(0, lastPTag + 4)
  }
  return cutoff + '...'
}

function looksLikeMarkdown(value: string | null | undefined): boolean {
  if (!value) return false
  if (/<[a-z][\s\S]*>/i.test(value)) return false
  return /(^|\n)\s*(?:#{1,6}\s|[-*+]\s|\d+\.\s|> |!\[|\[.+\]\(.+\)|`{3})/.test(value)
}

// ============================================================================
// Component Renderers
// ============================================================================

function renderArticleCard(post: RelatedPost, baseUrl: string, options?: { isLarge?: boolean; isAllType?: boolean }): string {
  const authorName = post.author_name || 'Redação'
  const isLarge = options?.isLarge
  const isAllType = options?.isAllType

  if (isAllType) {
    return `
      <article class="flex flex-col h-full" style="background-color: var(--alltype-background); padding: 24px;">
        <a href="${getPostUrl(post, baseUrl)}" class="group block h-full flex flex-col" style="text-decoration: none;">
          ${post.featured_image_r2_key ? `
            <div class="alltype-media mb-4 border-b border-gray-900 pb-4">
              <img 
                src="/i/${escapeAttr(post.featured_image_r2_key)}?w=${isLarge ? '1200' : '600'}" 
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
            <h3 class="font-bold leading-tight mt-2 mb-3" style="font-family: var(--alltype-font-headline); font-size: ${isLarge ? '32px' : '24px'};">
              ${escapeHtml(post.title)}
            </h3>
            <div class="mt-auto text-xs font-bold uppercase tracking-widest mt-4 block" style="color: var(--alltype-text-variant); font-family: var(--alltype-font-ui);">
              ${escapeHtml(authorName)} • ${formatDate(post.published_at)}
            </div>
          </div>
        </a>
      </article>
    `
  }

  return `
    <article class="gb-card ${isLarge ? 'gb-card--large' : ''}">
      <a href="${getPostUrl(post, baseUrl)}" class="gb-card__link">
        <div class="gb-card__media">
          <img 
            src="${post.featured_image_r2_key ? `/i/${escapeAttr(post.featured_image_r2_key)}?w=${isLarge ? '1200' : '600'}` : '/static/logo-dp.png'}"
            alt="${escapeAttr(post.title)}"
            class="img-aesthetic"
            loading="lazy"
          />
        </div>
        <div class="gb-card__content">
          ${post.hat ? `<span class="gb-hat">${escapeHtml(post.hat)}</span>` : ''}
          
          <h3 class="gb-title--card" ${isLarge ? 'style="font-size: 32px;"' : ''}>
            ${escapeHtml(post.title)}
          </h3>
          
          <div class="gb-meta">
            <span>${escapeHtml(authorName)}</span>
            <span>• ${escapeHtml(post.category_name)}</span>
          </div>
        </div>
      </a>
    </article>
  `
}

function renderArticleHeader(post: ArticlePost, readingTime: number, shareToolbar: string): string {
  const isEditorial = post.author_type === 'editorial'
  const isColumnist = post.author_type === 'columnist'
  const isContributor = post.author_type === 'contributor'

  // Decide selection of hat
  let hatContent = post.hat || ''
  if (isEditorial) hatContent = 'EDITORIAL'
  else if (isContributor) hatContent = 'OPINIÃO'
  else if (isColumnist && post.column_name) hatContent = post.column_name

  return `
    <header class="article-header ${isEditorial ? 'article-header--editorial' : ''}" style="${isEditorial ? 'display: flex; flex-direction: column; align-items: center; text-align: center;' : ''}">
      <nav id="breadcrumb" aria-label="Breadcrumb" style="font-family: var(--font-sans); font-size: 0.8125rem; color: #5f6368; margin-bottom: 1rem;">
        <a href="/" style="color: inherit; text-decoration: none;">Inicio</a>
        <span style="margin: 0 0.5rem;">/</span>
        <a href="/categoria/${escapeAttr(post.category_slug)}" style="color: inherit; text-decoration: none;">${escapeHtml(post.category_name)}</a>
      </nav>
      <!-- Hat (Chapéu) -->\n      ${isColumnist && post.column_name ? `
        <!-- Chapéu de Coluna (grande, azul, bold) -->
        <div class="article-hat article-hat--columnist" style="background-color: #1a73e8; color: #ffffff; padding: 8px 16px; border-radius: 4px; font-size: 1.5rem; font-weight: 950; text-transform: uppercase; margin-bottom: 24px; display: inline-block; line-height: 1;">
          ${escapeHtml(post.column_name)}
        </div>
      ` : hatContent ? `
        <!-- Chapéu Normal (simples, sem fundo) -->
        <div class="article-hat" style="font-family: var(--font-sans); font-size: 0.875rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #1a73e8; margin-bottom: 0.75rem; display: inline-block;">
          ${escapeHtml(hatContent)}
        </div>
      ` : ''}
      
      <!-- Title -->
      <h1 id="articleTitle" class="article-title ${isEditorial ? 'article-title--centered' : ''}">
        ${escapeHtml(post.title)}
      </h1>
      
      <!-- Excerpt -->
      ${post.excerpt ? `
        <div class="article-excerpt ${isEditorial ? 'article-excerpt--centered' : ''}">
          ${escapeHtml(post.excerpt)}
        </div>
      ` : ''}
      
      <!-- Metadata -->
      <div class="article-meta ${isEditorial ? 'article-meta--centered' : ''}" style="display: flex; align-items: center; flex-wrap: wrap; gap: 12px; font-size: 0.9375rem; font-weight: 500; color: #5f6368; border-top: 1px solid #dadce0; border-bottom: 1px solid #dadce0; padding: 1.25rem 0; margin: 1.5rem 0; width: 100%; ${isEditorial ? 'justify-content: center;' : ''}">
        ${!isEditorial && post.author_name && !isColumnist ? `
          <span>
            <strong style="color: #202124;">${escapeHtml(post.author_name)}</strong>
          </span>
          <span class="text-gray-300">•</span>
        ` : ''}
        <span>${formatDate(post.published_at)}</span>
        <span class="text-gray-300">•</span>
        <span>${readingTime} min de leitura</span>
      </div>
      ${shareToolbar}

      <!-- Columnist Biography / Branded Section -->
      ${isColumnist ? `
        <div class="columnist-header-bio" style="display: flex !important; align-items: flex-start !important; gap: 1.5rem !important; margin: 2rem 0 !important; padding: 1.5rem !important; background: #f8fafc !important; border-radius: 12px !important; border: 1px solid #e2e8f0 !important;">
          ${post.author_avatar_r2_key ? `
            <img src="/i/${escapeAttr(post.author_avatar_r2_key)}?w=160&h=160&fit=cover" alt="${escapeAttr(post.author_name || '')}" style="width: 80px !important; height: 80px !important; min-width: 80px !important; min-height: 80px !important; max-width: 80px !important; max-height: 80px !important; border-radius: 50% !important; object-fit: cover !important; flex-shrink: 0 !important; border: 3px solid #fff !important; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1) !important; display: block !important;">
          ` : `
            <div style="width: 80px !important; height: 80px !important; min-width: 80px !important; min-height: 80px !important; max-width: 80px !important; max-height: 80px !important; border-radius: 50% !important; background: #e2e8f0 !important; display: flex !important; align-items: center !important; justify-content: center !important; font-weight: 800 !important; color: #94a3b8 !important; font-size: 1.5rem !important; flex-shrink: 0 !important; border: 3px solid #fff !important; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1) !important;">
              ${post.author_name ? post.author_name.substring(0, 2).toUpperCase() : ''}
            </div>
          `}
          
          <div class="columnist-info" style="flex: 1 !important; min-width: 0 !important;">
            <h3 style="font-size: 1.25rem !important; font-weight: 800 !important; margin: 0 0 0.5rem 0 !important; color: #1e293b !important; line-height: 1.2 !important;">
              <a href="/coluna/${post.author_slug}" class="hover-underline" style="color: inherit; text-decoration: none;">
                ${escapeHtml(post.author_name)}
              </a>
            </h3>
            
            <div class="columnist-description" style="font-size: 1rem !important; color: #475569 !important; line-height: 1.6 !important; margin-bottom: 1rem !important;">
              ${escapeHtml(post.column_description || post.author_bio || '')}
            </div>
            
            <div class="columnist-social" style="display: flex !important; flex-direction: row !important; gap: 0.75rem !important; align-items: center !important; margin-top: 12px !important;">
              ${post.author_social_instagram ? `
                <a href="https://instagram.com/${escapeAttr(post.author_social_instagram)}" target="_blank" rel="noopener" title="Instagram" style="display: inline-block !important; width: 20px !important; height: 20px !important; min-width: 20px !important; min-height: 20px !important; max-width: 20px !important; max-height: 20px !important; flex-shrink: 0 !important; color: #64748b !important; line-height: 0 !important;">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20" style="display: block !important; width: 20px !important; height: 20px !important; min-width: 20px !important; min-height: 20px !important; max-width: 20px !important; max-height: 20px !important;"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
                </a>
              ` : ''}
              ${post.author_social_twitter ? `
                <a href="https://twitter.com/${escapeAttr(post.author_social_twitter)}" target="_blank" rel="noopener" title="Twitter/X" style="display: inline-block !important; width: 20px !important; height: 20px !important; min-width: 20px !important; min-height: 20px !important; max-width: 20px !important; max-height: 20px !important; flex-shrink: 0 !important; color: #64748b !important; line-height: 0 !important;">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20" style="display: block !important; width: 20px !important; height: 20px !important; min-width: 20px !important; min-height: 20px !important; max-width: 20px !important; max-height: 20px !important;"><path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"></path></svg>
                </a>
              ` : ''}
              ${post.author_social_linkedin ? `
                <a href="${escapeAttr(post.author_social_linkedin)}" target="_blank" rel="noopener" title="LinkedIn" style="display: inline-block !important; width: 20px !important; height: 20px !important; min-width: 20px !important; min-height: 20px !important; max-width: 20px !important; max-height: 20px !important; flex-shrink: 0 !important; color: #64748b !important; line-height: 0 !important;">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20" style="display: block !important; width: 20px !important; height: 20px !important; min-width: 20px !important; min-height: 20px !important; max-width: 20px !important; max-height: 20px !important;"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path><rect x="2" y="9" width="4" height="12"></rect><circle cx="4" cy="4" r="2"></circle></svg>
                </a>
              ` : ''}
              ${post.author_email ? `
                <a href="mailto:${escapeAttr(post.author_email)}" title="E-mail" style="display: inline-block !important; width: 20px !important; height: 20px !important; min-width: 20px !important; min-height: 20px !important; max-width: 20px !important; max-height: 20px !important; flex-shrink: 0 !important; color: #64748b !important; line-height: 0 !important;">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20" style="display: block !important; width: 20px !important; height: 20px !important; min-width: 20px !important; min-height: 20px !important; max-width: 20px !important; max-height: 20px !important;"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                </a>
              ` : ''}
            </div>
          </div>
        </div>
      ` : ''}
      
      <!-- Featured Image -->
      ${post.featured_image_r2_key ? `
        <figure class="article-featured-image" style="aspect-ratio: ${post.featured_image_width && post.featured_image_height ? `${post.featured_image_width}/${post.featured_image_height}` : '16/9'}; background: #f1f3f4; overflow: hidden;">
          <img 
            src="/i/${escapeAttr(post.featured_image_r2_key)}?w=1200" 
            srcset="/i/${escapeAttr(post.featured_image_r2_key)}?w=400 400w, /i/${escapeAttr(post.featured_image_r2_key)}?w=800 800w, /i/${escapeAttr(post.featured_image_r2_key)}?w=1200 1200w"
            sizes="(max-width: 768px) 100vw, 800px"
            alt="${escapeAttr(post.featured_image_alt || post.title)}"
            loading="eager"
            fetchpriority="high"
            style="width: 100%; height: auto; display: block;"
            width="${post.featured_image_width || 1200}"
            height="${post.featured_image_height || 675}"
          >
          ${post.featured_image_credits ? `
            <figcaption class="article-featured-caption">
              ${escapeHtml(post.featured_image_credits)}
            </figcaption>
          ` : ''}
        </figure>
      ` : ''}
    </header>
  `
}

import type { AccessCheckResult } from '../paywall'

function renderPaywallGate(access: AccessCheckResult, baseUrl: string, nonce: string): string {
  const reason = access.reason
  const cta = access.cta || { primary: 'subscribe_monthly' }

  // Login URL with redirect back
  // We can't easily get current URL inside this pure function unless passed, 
  // but we can rely on client side or pass generic return url.
  // Ideally client-side handling or refined href.

  let title = 'Conteúdo Exclusivo'
  let description = 'Este artigo é exclusivo para assinantes. Continue lendo e tenha acesso a análises profundas.'
  let buttons = ''

  if (reason === 'not_logged_in') {
    title = 'Faça login para continuar'
    description = 'Já é assinante? Entre na sua conta. Ou assine agora por apenas R$ 9,90/mês.'
    buttons = `
      <a href="/portal/login?next=${encodeURIComponent(access.subscriber?.returnUrl || 'back')}" class="gb-btn gb-btn--primary mb-4 w-full">Entrar</a>
      <form method="POST" action="/api/portal/assinatura/start" class="w-full">
        <input type="hidden" name="plan" value="mensal">
        <button type="submit" class="gb-btn gb-btn--secondary w-full">Assinar (R$ 9,90)</button>
      </form>
    `
  } else if (reason === 'not_subscribed' || reason === 'metering_limit_reached') {
    title = 'Assine para ler tudo'
    description = 'Tenha acesso ilimitado a todas as notícias e colunas exclusivos.'
    buttons = `
      <form method="POST" action="/api/portal/assinatura/start" class="w-full mb-3">
        <input type="hidden" name="plan" value="mensal">
        <button type="submit" class="gb-btn gb-btn--primary w-full">Assinar Mensal (R$ 9,90)</button>
      </form>
       <form method="POST" action="/api/portal/assinatura/start" class="w-full">
        <input type="hidden" name="plan" value="anual">
        <button type="submit" class="gb-btn gb-btn--secondary w-full">Assinar Anual (R$ 89,90)</button>
      </form>
    `
  } else if (reason === 'past_due') {
    title = 'Assinatura Pendente'
    description = 'Sua assinatura está com pagamento em aberto. Regularize para continuar lendo.'
    buttons = `
      <a href="/portal" class="gb-btn gb-btn--primary w-full">Regularizar Agora</a>
    `
  }

  return `
    <div class="paywall-gate">
      <div class="paywall-content">
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(description)}</p>
        <div id="paywallCta" class="paywall-actions">
           ${buttons}
        </div>
      </div>
    </div>
    <style nonce="${nonce}">
      .paywall-gate {
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 2rem;
        text-align: center;
        margin: 2rem auto;
        max-width: 600px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      }
      .paywall-icon { font-size: 3rem; margin-bottom: 1rem; }
      .paywall-content h3 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.5rem; color: #111827; }
      .paywall-content p { color: #4b5563; margin-bottom: 1.5rem; }
      .paywall-actions { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; max-width: 300px; margin: 0 auto; }
      .gb-btn { 
        display: inline-flex; justify-content: center; align-items: center;
        padding: 0.75rem 1.5rem; border-radius: 6px; font-weight: 600; cursor: pointer; text-decoration: none; transition: all 0.2s;
        border: none; font-size: 1rem;
      }
      .gb-btn--primary { background: #2563eb; color: white; }
      .gb-btn--primary:hover { background: #1d4ed8; }
      .gb-btn--secondary { background: white; border: 1px solid #d1d5db; color: #374151; }
      .gb-btn--secondary:hover { background: #f3f4f6; }
      .article-content.teaser-mode {
         mask-image: linear-gradient(to bottom, black 50%, transparent 100%);
         -webkit-mask-image: linear-gradient(to bottom, black 50%, transparent 100%);
         padding-bottom: 0;
         margin-bottom: 0;
      }
    </style>
  `
}

function renderEditorialPaywallGate(access: AccessCheckResult): string {
  const reason = access.reason
  let title = 'Conteúdo Exclusivo'
  let description = 'Este artigo é exclusivo para assinantes. Continue lendo e tenha acesso a análises profundas.'
  let buttons = ''

  if (reason === 'not_logged_in') {
    title = 'Faça login para continuar'
    description = 'Já é assinante? Entre na sua conta. Ou assine agora por apenas R$ 9,90/mês.'
    buttons = `
      <a href="/portal/login?next=${encodeURIComponent(access.subscriber?.returnUrl || 'back')}" class="ed-button">Entrar</a>
      <form method="POST" action="/api/portal/assinatura/start" style="width: 100%;">
        <input type="hidden" name="plan" value="mensal">
        <button type="submit" class="ed-button ed-button--secondary">Assinar (R$ 9,90)</button>
      </form>
    `
  } else if (reason === 'not_subscribed' || reason === 'metering_limit_reached') {
    title = 'Assine para ler tudo'
    description = 'Tenha acesso ilimitado a todas as notícias e colunas exclusivos.'
    buttons = `
      <form method="POST" action="/api/portal/assinatura/start" style="width: 100%; margin-bottom: 12px;">
        <input type="hidden" name="plan" value="mensal">
        <button type="submit" class="ed-button">Assinar mensal (R$ 9,90)</button>
      </form>
       <form method="POST" action="/api/portal/assinatura/start" style="width: 100%;">
        <input type="hidden" name="plan" value="anual">
        <button type="submit" class="ed-button ed-button--secondary">Assinar anual (R$ 89,90)</button>
      </form>
    `
  } else if (reason === 'past_due') {
    title = 'Assinatura Pendente'
    description = 'Sua assinatura está com pagamento em aberto. Regularize para continuar lendo.'
    buttons = `
      <a href="/portal" class="ed-button">Regularizar agora</a>
    `
  }

  return `
    <section class="ed-paywall" aria-labelledby="paywallTitle">
      <p class="ed-kicker">Conteúdo para assinantes</p>
      <h3 id="paywallTitle">${escapeHtml(title)}</h3>
      <p>${escapeHtml(description)}</p>
      <div id="paywallCta" class="ed-paywall__actions">
         ${buttons}
      </div>
    </section>
  `
}

function renderArticleContent(content: string, isBlocked: boolean, nonce: string, authorType?: string, accessCheck?: AccessCheckResult): string {
  const isContributor = authorType === 'contributor'

  const disclaimerHtml = isContributor ? `
    <div class="contributor-disclaimer" style="margin-top: 3rem; padding: 1.5rem; background: #f9fafb; border-left: 4px solid #dadce0; font-size: 0.875rem; color: #5f6368; line-height: 1.5;">
      <strong>Nota da Redação:</strong> Este é um artigo de opinião e reflete a visão de seu autor, não necessariamente a opinião do Novo Diário do Povo.
    </div>
  ` : ''

  if (isBlocked && accessCheck) {
    return `
      <div id="articleBody" class="article-content teaser-mode">
        ${content}
      </div>
      ${renderPaywallGate(accessCheck, '/', nonce)}
    `
  }

  return `
    <div id="articleBody" class="article-content">
      ${content}
      ${disclaimerHtml}
    </div>
  `
}

// ============================================================================
// Related Posts Renderer
// ============================================================================

function renderRelatedPosts(posts: RelatedPost[], baseUrl: string): string {
  if (posts.length === 0) return ''

  return `
    <section class="container" style="margin-top: 4rem; padding-top: 2rem; border-top: 1px solid var(--gray-200);">
      <h2 class="font-bold text-2xl mb-6">Leia também</h2>
      <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
        ${posts.map(post => `
          <a href="${getPostUrl(post, baseUrl)}" class="card hover:shadow-lg transition">
            <div class="card-body">
              <span class="text-xs font-bold text-accent uppercase mb-2 block">
                ${escapeHtml(post.category_name || 'Notícia')}
              </span>
              <h3 class="font-bold text-lg mb-2 leading-tight">
                ${escapeHtml(post.title)}
              </h3>
              <div class="text-xs text-gray-500 mt-auto pt-4">
                ${formatDate(post.published_at)}
              </div>
            </div>
          </a>
        `).join('')}
      </div>
    </section>
  `
}

// ============================================================================
// JSON-LD Helpers
// ============================================================================

export function buildArticleSocialMeta(
  post: ArticlePost,
  baseUrl: string,
  siteName: string,
  canonicalUrl: string
): SocialMeta {
  const toIsoDate = (value: string | null | undefined) => {
    if (!value) return null
    const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`
    const date = new Date(normalized)
    return Number.isNaN(date.getTime()) ? value : date.toISOString()
  }
  const brandName = normalizeSocialSiteName(siteName)
  const socialTitle = appendSiteName(post.social_title || post.seo_title || post.title, brandName)
  const socialDescription = post.social_description || post.seo_description || post.excerpt || post.title
  const customImage = Boolean(post.social_image_r2_key)
  const coverImage = Boolean(post.featured_image_r2_key)
  const rawFocalX = Number(post.social_image_position_x ?? 50)
  const rawFocalY = Number(post.social_image_position_y ?? 50)
  const focalX = Math.max(0, Math.min(100, Number.isFinite(rawFocalX) ? rawFocalX : 50)) / 100
  const focalY = Math.max(0, Math.min(100, Number.isFinite(rawFocalY) ? rawFocalY : 50)) / 100
  const imageUrl = customImage
    ? `${baseUrl}/i/${post.social_image_r2_key}`
    : coverImage
      ? `${baseUrl}/i/${post.featured_image_r2_key}?w=1200&h=630&fit=cover&q=90&fp-x=${focalX}&fp-y=${focalY}`
      : `${baseUrl}/static/logo-dp.png`

  return {
    title: socialTitle,
    description: socialDescription,
    url: canonicalUrl,
    siteName: brandName,
    type: 'article',
    image: {
      url: imageUrl,
      secureUrl: imageUrl,
      type: customImage ? post.social_image_mime_type : coverImage ? null : 'image/png',
      width: customImage ? post.social_image_width || 1200 : coverImage ? 1200 : null,
      height: customImage ? post.social_image_height || 630 : coverImage ? 630 : null,
      alt: customImage ? `Arte de compartilhamento: ${post.title}` : post.featured_image_alt || post.title
    },
    article: {
      publishedTime: toIsoDate(post.published_at),
      modifiedTime: toIsoDate(post.updated_at),
      section: post.category_name
    }
  }
}

function renderArticleShareToolbar(post: ArticlePost, baseUrl: string, siteName: string): string {
  const brandName = normalizeSocialSiteName(siteName)
  const cleanUrl = getPostUrl(post, baseUrl)
  const whatsappUrl = buildTrackedShareUrl(cleanUrl, 'whatsapp')
  const nativeUrl = buildTrackedShareUrl(cleanUrl, 'native')
  const copyUrl = buildTrackedShareUrl(cleanUrl, 'copy')
  const title = post.social_title || post.title
  const description = post.social_description || post.excerpt || ''
  const whatsappMessage = buildArticleShareMessage({
    title,
    description,
    url: whatsappUrl,
    siteName: brandName,
    template: post.social_share_text
  })

  return `
    <div class="ed-article-sharebar" aria-label="Compartilhar esta matéria" data-article-sharebar data-post-id="${post.id}">
      <span class="ed-article-sharebar__label">Compartilhe</span>
      <div class="ed-article-sharebar__actions">
        <a class="ed-share-action ed-share-action--whatsapp" href="https://wa.me/?text=${encodeURIComponent(whatsappMessage)}" target="_blank" rel="noopener noreferrer" data-share-channel="whatsapp" aria-label="Compartilhar no WhatsApp">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.04 2a9.84 9.84 0 0 0-8.4 14.98L2 22l5.2-1.6A9.98 9.98 0 1 0 12.04 2Zm5.8 14.08c-.24.68-1.42 1.3-1.96 1.38-.5.1-1.12.14-1.8-.08-.42-.14-.96-.32-1.66-.62-2.92-1.26-4.82-4.2-4.96-4.4-.14-.2-1.18-1.56-1.18-2.98 0-1.42.74-2.12 1-2.42.26-.3.58-.38.78-.38h.56c.18 0 .42-.06.66.5.24.58.84 2.04.9 2.18.08.14.12.3.02.5-.1.2-.14.32-.28.48-.14.16-.3.36-.42.48-.14.14-.28.3-.12.58.16.3.72 1.18 1.54 1.92 1.06.94 1.94 1.22 2.22 1.36.28.14.44.12.6-.08.18-.2.76-.88.96-1.18.2-.3.4-.24.68-.14.28.1 1.78.84 2.08.98.3.16.5.22.58.34.08.12.08.7-.16 1.38Z"/></svg>
          <span>WhatsApp</span>
        </a>
        <button class="ed-share-action" type="button" data-share-action="native" data-share-url="${escapeAttr(nativeUrl)}" data-share-title="${escapeAttr(title)}" data-share-text="${escapeAttr(`Leia no ${brandName}.`)}" aria-label="Abrir opções de compartilhamento">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a3 3 0 1 0-2.83-4 3 3 0 0 0 .14 1.18L8.91 8.6a3 3 0 1 0 0 6.8l6.4 3.42A3 3 0 1 0 16.25 17l-6.4-3.42c.1-.38.1-.78 0-1.16L16.25 9c.5.62 1.12 1 1.75 1Z"/></svg>
          <span>Enviar</span>
        </button>
        <button class="ed-share-action" type="button" data-share-action="copy" data-share-url="${escapeAttr(copyUrl)}" aria-label="Copiar link da matéria">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7a5 5 0 0 1 5-5h4a5 5 0 0 1 0 10h-2v-2h2a3 3 0 1 0 0-6h-4a3 3 0 0 0-3 3v2H8V7Zm3 4h2v2h-2v-2Zm-4 1h2v2H7a3 3 0 1 0 0 6h4a3 3 0 0 0 3-3v-2h2v2a5 5 0 0 1-5 5H7a5 5 0 0 1 0-10Z"/></svg>
          <span>Copiar link</span>
        </button>
      </div>
      <span class="ed-article-sharebar__feedback" data-share-feedback aria-live="polite"></span>
    </div>
  `
}

function renderArticleShareScript(nonce: string): string {
  return `<script nonce="${escapeAttr(nonce)}">
    (() => {
      const sharebar = document.querySelector('[data-article-sharebar]');
      if (!sharebar) return;
      const feedback = sharebar.querySelector('[data-share-feedback]');
      const postId = sharebar.getAttribute('data-post-id');
      const track = (method) => {
        if (typeof window.gtag === 'function') window.gtag('event', 'article_share', { method, post_id: postId });
        else {
          window.dataLayer = window.dataLayer || [];
          window.dataLayer.push({ event: 'article_share', method, post_id: postId });
        }
      };
      const nativeButton = sharebar.querySelector('[data-share-action="native"]');
      if (nativeButton && !navigator.share) nativeButton.hidden = true;
      sharebar.addEventListener('click', async (event) => {
        const channelLink = event.target.closest('[data-share-channel]');
        if (channelLink) { track(channelLink.dataset.shareChannel); return; }
        const button = event.target.closest('[data-share-action]');
        if (!button) return;
        const action = button.dataset.shareAction;
        try {
          if (action === 'native' && navigator.share) {
            await navigator.share({ title: button.dataset.shareTitle, text: button.dataset.shareText, url: button.dataset.shareUrl });
            track('native');
          }
          if (action === 'copy') {
            await navigator.clipboard.writeText(button.dataset.shareUrl);
            feedback.textContent = 'Link copiado';
            setTimeout(() => { feedback.textContent = ''; }, 2400);
            track('copy');
          }
        } catch (error) {
          if (error && error.name === 'AbortError') return;
          feedback.textContent = 'Não foi possível compartilhar';
        }
      });
    })();
  </script>`
}

// ============================================================================
// Main Renderer
// ============================================================================

export async function renderArticlePage(
  c: Context<{ Bindings: Env; Variables: AppContext }>,
  post: ArticlePost,
  options: {
    baseUrl: string
    siteName: string
    navItems: Array<{ label: string; href: string; active?: boolean }>
    coverOfDay?: { r2Key: string; alt: string; aspectRatio?: string } | null
    relatedPosts: RelatedPost[]
    mostRead: RelatedPost[]
    isBlocked: boolean
    accessCheck?: AccessCheckResult
    googleAnalyticsId?: string
  },
  contentSource?: string
): Promise<string> {
  const { baseUrl, siteName, navItems, coverOfDay, relatedPosts, mostRead, isBlocked, accessCheck, googleAnalyticsId } = options

  // Determine Theme early to pass down
  const themeSetting = (await getSetting(c.env, 'site.public_theme')) || (await getSetting(c.env, 'public_theme'))
  const isEditorial = themeSetting == null || themeSetting === 'editorial' || themeSetting === 'alltype_v2' || themeSetting === 'minimal'
  const theme = normalizePublicTheme(themeSetting)
  const isAllType = theme === 'alltype'
  const opinionType = post.opinion_type !== undefined
    ? post.opinion_type
    : post.author_type === 'columnist' ? 'column'
      : post.author_type === 'contributor' ? 'article'
        : post.author_type === 'editorial' ? 'editorial' : 'news'
  const isOpinion = opinionType !== 'news'

  const nonce = c.get('cspNonce') || ''
  const canonicalUrl = post.seo_canonical || getPostUrl(post, baseUrl)
  const openGraph = buildArticleSocialMeta(post, baseUrl, siteName, canonicalUrl)
  const shareToolbar = renderArticleShareToolbar(post, baseUrl, siteName)
  const shareScript = renderArticleShareScript(nonce)

  // Use passed contentSource (teaser) OR full content
  const contentRaw = contentSource || post.content_markdown || post.content || ''

  const contentHtml = (post.content_markdown && post.content_markdown.length > 0) || looksLikeMarkdown(contentRaw)
    ? renderMarkdownToHtml(contentRaw)
    : sanitizeHtml(contentRaw)

  const readingTime = estimateReadingTime(contentHtml)

  // Optimization: Preload Featured Image for LCP
  let preloadHeadHtml = ''
  if (post.featured_image_r2_key) {
    preloadHeadHtml += `<link rel="preload" as="image" href="/i/${escapeAttr(post.featured_image_r2_key)}?w=1200" 
      imagesrcset="/i/${escapeAttr(post.featured_image_r2_key)}?w=400 400w, /i/${escapeAttr(post.featured_image_r2_key)}?w=800 800w, /i/${escapeAttr(post.featured_image_r2_key)}?w=1200 1200w"
      imagesizes="(max-width: 768px) 100vw, 800px"
      fetchpriority="high">`
  }

  // Get ad slots
  const adSlots = await findActiveSlotsByTemplate(c.env, 'article')
  const adTop = adSlots.find(s => s.name === 'article_top')
  const adInread1 = adSlots.find(s => s.name === 'article_inread_1')
  const adInread2 = adSlots.find(s => s.name === 'article_inread_2')
  const adFooter = adSlots.find(s => s.name === 'article_footer')

  // Render ads context
  const pageContext = { path: c.req.path, referrer: c.req.header('referer') || '', template: 'article' }
  const userContext = { isSubscriber: !isBlocked, isLoggedIn: false }

  const adTopHtml = adTop ? renderAdSlot({ slot: adTop, page: pageContext, user: userContext }) : ''
  const adInread1Html = adInread1 && !isBlocked ? renderAdSlot({ slot: adInread1, page: pageContext, user: userContext }) : ''
  const adInread2Html = adInread2 && !isBlocked ? renderAdSlot({ slot: adInread2, page: pageContext, user: userContext }) : ''
  const adFooterHtml = adFooter ? renderAdSlot({ slot: adFooter, page: pageContext, user: userContext }) : ''

  // Ads loader script
  const adsScript = await generateAdsLoaderScript(c.env, nonce)

  // Split content for ad insertion
  let contentWithAds = contentHtml
  if (!isBlocked) {
    const paragraphs = contentHtml.split('</p>')
    const wrapInreadAd = (html: string) => isEditorial
      ? renderEditorialAd(html)
      : `<div class="container my-8">${html}</div>`
    if (paragraphs.length > 4 && adInread1Html) {
      paragraphs.splice(3, 0, `</p>${wrapInreadAd(adInread1Html)}`)
    }
    if (paragraphs.length > 8 && adInread2Html) {
      paragraphs.splice(7, 0, `</p>${wrapInreadAd(adInread2Html)}`)
    }
    contentWithAds = paragraphs.join('</p>')
  }

  // JSON-LD
  const postForJsonLd = {
    title: post.title,
    excerpt: post.excerpt,
    slug: post.slug,
    published_at: post.published_at,
    updated_at: post.published_at,
    author: { name: opinionType === 'editorial' ? siteName : post.author_name || 'Redação' },
    coverMedia: post.featured_image_r2_key ? {
      r2_key: post.featured_image_r2_key,
      width: 1200,
      height: 675
    } : null
  }

  const isLiveBlog = post.template === 'liveblog'
  const liveUpdates = isLiveBlog ? await findLiveUpdates(c.env, post.id) : []

  const articleJsonLd = isLiveBlog
    ? generateLiveBlogJsonLd(postForJsonLd, liveUpdates, baseUrl, siteName)
    : generateArticleJsonLd(postForJsonLd, baseUrl, siteName)

  const breadcrumbJsonLd = generateBreadcrumbJsonLd([
    { name: 'Home', url: baseUrl },
    isOpinion
      ? { name: 'Opinião', url: `${baseUrl}/opiniao` }
      : { name: post.category_name, url: `${baseUrl}/categoria/${post.category_slug}` },
    { name: post.title, url: canonicalUrl }
  ], baseUrl)

  const extraHeadHtml = `
    ${preloadHeadHtml}
    ${post.seo_noindex ? '<meta name="robots" content="noindex, follow">' : ''}
    <script type="application/ld+json" nonce="${nonce}">
      ${articleJsonLd}
    </script>
    <script type="application/ld+json" nonce="${nonce}">
      ${breadcrumbJsonLd}
    </script>
    ${isLiveBlog && post.is_live ? renderLiveBlogScript(post.slug) : ''}
  `

  // Build body HTML
  if (isEditorial) {
    const opinionKicker = opinionType === 'editorial'
      ? 'Editorial do Jornal'
      : opinionType === 'article'
        ? 'Artigo'
        : opinionType === 'column'
          ? post.column_name || 'Coluna'
          : post.hat || post.category_name
    const bylineName = opinionType === 'editorial' ? 'Editorial do Diário do Povo' : post.author_name || 'Redação'
    const bodyHtml = `
      ${adTopHtml ? renderEditorialAd(adTopHtml) : ''}

      <article class="ed-article">
      <header class="ed-article__header">
        <nav class="ed-opinion-breadcrumb" aria-label="Navegação estrutural">
          <a href="/">Início</a><span>/</span>${isOpinion ? '<a href="/opiniao">Opinião</a>' : `<a href="/categoria/${escapeAttr(post.category_slug)}">${escapeHtml(post.category_name)}</a>`}
        </nav>
        <p class="ed-kicker">${escapeHtml(opinionKicker)}</p>
        <h1 id="articleTitle" class="ed-article__title">${escapeHtml(post.title)}</h1>
        ${post.excerpt ? `<p class="ed-article__deck">${escapeHtml(post.excerpt)}</p>` : ''}
        <div class="ed-article__byline">
          <span>Por <strong>${escapeHtml(bylineName)}</strong></span>
          <span>Publicado em ${escapeHtml(formatDate(post.published_at))}, às ${escapeHtml(formatTime(post.published_at))}</span>
          <span>${readingTime} min de leitura</span>
        </div>
        ${shareToolbar}
        ${opinionType === 'column' ? `
          <a class="ed-article-column-signature" href="/coluna/${escapeAttr(post.author_slug || '')}">
            <span class="ed-article-column-signature__portrait">
              ${post.author_avatar_r2_key
                ? `<img src="/i/${escapeAttr(post.author_avatar_r2_key)}?w=160&h=190&fit=cover" alt="${escapeAttr(post.author_name || '')}" width="160" height="190">`
                : escapeHtml((post.author_name || 'DP').substring(0, 2).toUpperCase())}
            </span>
            <span><small>${escapeHtml(post.column_name || 'Coluna')}</small><strong>${escapeHtml(post.author_name || '')}</strong><em>Veja todas as publicações →</em></span>
          </a>
        ` : opinionType === 'editorial' ? `
          <div class="ed-article-editorial-signature"><span aria-hidden="true">DP</span><p><strong>Posição institucional</strong>Este texto expressa a opinião editorial do Diário do Povo.</p></div>
        ` : ''}
      </header>

      ${post.featured_image_r2_key ? `
        <figure class="ed-article__hero">
          <img
            src="/i/${escapeAttr(post.featured_image_r2_key)}?w=1200"
            srcset="/i/${escapeAttr(post.featured_image_r2_key)}?w=400 400w, /i/${escapeAttr(post.featured_image_r2_key)}?w=800 800w, /i/${escapeAttr(post.featured_image_r2_key)}?w=1200 1200w"
            sizes="(max-width: 768px) 100vw, 1080px"
            alt="${escapeAttr(post.featured_image_alt || post.title)}"
            loading="eager"
            fetchpriority="high"
            width="${post.featured_image_width || 1200}"
            height="${post.featured_image_height || 675}"
          >
          ${post.featured_image_credits ? `
            <figcaption>
              Crédito: ${escapeHtml(post.featured_image_credits)}
            </figcaption>
          ` : ''}
        </figure>
      ` : ''}

      <div class="ed-article__layout">
        <div class="ed-article__content">
          ${isLiveBlog ? renderLiveBlogTimeline(liveUpdates, post.is_live === 1) : `
            <div id="articleBody" class="${isBlocked ? 'article-content teaser-mode' : 'article-content'}">
              ${contentWithAds}
            </div>
            ${isBlocked && accessCheck ? renderEditorialPaywallGate(accessCheck) : ''}
            ${opinionType === 'article' ? `
              <div class="contributor-disclaimer" style="margin-top:3rem;padding:1.5rem;background:var(--ed-soft);border-left:4px solid var(--ed-red);font-family:var(--ed-sans);font-size:14px;color:var(--ed-muted)">
                <strong>Nota da Redação:</strong> Este é um artigo de opinião e reflete a visão de seu autor, não necessariamente a opinião do ${escapeHtml(siteName)}.
              </div>
            ` : ''}
          `}
        </div>

        <aside class="ed-article__rail" aria-label="Mais lidas">
          <h2>Mais lidas</h2>
          <div class="ed-share">
            ${mostRead.slice(0, 5).map((item, index) => `<a href="${getPostUrl(item, baseUrl)}"><strong>${index + 1}.</strong> ${escapeHtml(item.title)}</a>`).join('')}
          </div>
        </aside>
      </div>

      ${relatedPosts.length > 0 ? `
        <section class="ed-section">
          <div class="ed-section__header"><h2 class="ed-section__title">Leia também</h2></div>
          <div class="ed-related-grid">
            ${relatedPosts.slice(0, 3).map(p => renderEditorialArticleCard({
              title: p.title,
              hat: p.hat || p.category_name,
              url: getPostUrl(p, baseUrl),
              published_at: p.published_at,
              author_name: p.author_name,
              featured_image_r2_key: p.featured_image_r2_key,
              size: 'standard'
            })).join('')}
          </div>
        </section>
      ` : ''}
      </article>

      ${adFooterHtml ? renderEditorialAd(adFooterHtml) : ''}
      ${adsScript}
    `

    return renderEditorialLayout({
      title: post.seo_title ? `${post.seo_title} | ${siteName}` : `${post.title} | ${siteName}`,
      description: post.seo_description || post.excerpt || post.title,
      canonicalUrl,
      nonce,
      siteName,
      navItems,
      bodyHtml,
      extraHeadHtml,
      extraScriptsHtml: shareScript,
      openGraph,
      baseUrl,
      googleAnalyticsId
    })
  }

  const bodyHtml = `
    <article class="article-detail" style="padding-bottom: 4rem;">
      <!-- Ad: Top -->
      ${adTopHtml ? `<div class="container mb-8">${adTopHtml}</div>` : ''}
      
      ${renderArticleHeader(post, readingTime, shareToolbar)}
      
      <!-- Content -->
      ${isLiveBlog ? renderLiveBlogTimeline(liveUpdates, post.is_live === 1) : renderArticleContent(contentWithAds, isBlocked, nonce, post.author_type, accessCheck)}
      
      ${!isBlocked ? `
        <!-- Footer Navigation: Next + Related + Most Read -->
        <div class="container mt-12 pt-12 border-t border-gray-200">
          
          <!-- 1. Next Post (Prominent) -->
          ${relatedPosts.length > 0 ? `
            <div class="mb-16">
              <h3 class="gb-section__title mb-6 ${isAllType ? 'font-black uppercase' : ''}" style="${isAllType ? 'font-family: var(--alltype-font-ui);' : ''}">A seguir</h3>
              ${renderArticleCard(relatedPosts[0], baseUrl, { isLarge: true, isAllType })}
            </div>
          ` : ''}

          <!-- 2. Related Posts (Grid) -->
          ${relatedPosts.length > 1 ? `
            <div class="mb-16">
              <h3 class="gb-section__title mb-6 ${isAllType ? 'font-black uppercase' : ''}" style="${isAllType ? 'font-family: var(--alltype-font-ui);' : ''}">Relacionadas</h3>
              <div class="${isAllType ? 'alltype-grid grid-cols-1 md:grid-cols-3' : 'gb-grid'}" ${!isAllType ? 'style="grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));"' : ''}>
                ${relatedPosts.slice(1, 4).map(p => renderArticleCard(p, baseUrl, { isAllType })).join('')}
              </div>
            </div>
          ` : ''}

          <!-- 3. Most Read (Grid) -->
          ${mostRead && mostRead.length > 0 ? `
             <div class="mb-12">
              <h3 class="gb-section__title mb-6 ${isAllType ? 'font-black uppercase' : ''}" style="${isAllType ? 'font-family: var(--alltype-font-ui);' : ''}">Mais Lidas</h3>
              <div class="${isAllType ? 'alltype-grid grid-cols-1 md:grid-cols-4' : 'gb-grid'}" ${!isAllType ? 'style="grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));"' : ''}>
                ${mostRead.slice(0, 4).map(p => renderArticleCard(p, baseUrl, { isAllType })).join('')}
              </div>
            </div>
          ` : ''}

          <!-- Ad: Footer -->
          ${adFooterHtml ? `<div class="mb-12">${adFooterHtml}</div>` : ''}
          
        </div>
      ` : ''}
    </article>
    
    ${adsScript}
  `

  // Fetch categories for mobile menu
  const categories = await getActiveCategories(c.env)

  return renderPublicLayout({
    title: post.seo_title ? `${post.seo_title} | ${siteName}` : `${post.title} | ${siteName}`,
    description: post.seo_description || post.excerpt || post.title,
    canonicalUrl,
    nonce,
    siteName,
    navItems,
    categories,
    coverOfDay,
    bodyHtml,
    extraHeadHtml,
    extraScriptsHtml: shareScript,
    openGraph,
    theme,
    subscriber: options.accessCheck?.subscriber,
    googleAnalyticsId
  })
}
