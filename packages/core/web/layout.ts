/**
 * Public Layout - Shared HTML structure for Home/Category/Article
 * Modern & Minimalist Design System
 */

import { renderScript } from '../admin/ui'
import { renderSocialMetaTags, type SocialMeta } from './social'

const STATIC_ASSET_VERSION = '20260504'

// ============================================================================
// Types
// ============================================================================

export type PublicLayoutParams = {
  title: string
  description?: string
  canonicalUrl: string
  nonce?: string
  siteName: string
  navItems: Array<{ label: string; href: string; active?: boolean }>
  categories: Array<{ id: number; name: string; slug: string }>
  coverOfDay?: { r2Key: string; alt: string; aspectRatio?: string } | null
  bodyHtml: string
  extraHeadHtml?: string  // JSON-LD scripts and OG tags
  extraScriptsHtml?: string
  googleAnalyticsId?: string
  theme?: 'default' | 'minimal' | 'alltype'
  subscriber?: any
  lcpPreloadUrl?: string
  lcpSrcSet?: string
  openGraph?: SocialMeta
}

// ============================================================================
// Helpers
// ============================================================================

export function escapeHtml(text: string | null | undefined): string {
  if (text === undefined || text === null) return ''
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function escapeAttr(text: string | null | undefined): string {
  if (text === undefined || text === null) return ''
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function truncate(text: string | null | undefined, maxLength: number): string {
  if (!text) return ''
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength) + '...'
}

export function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return ''
  try {
    const date = new Date(isoDate)
    if (isNaN(date.getTime())) return ''
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      timeZone: 'America/Sao_Paulo'
    })
  } catch {
    return ''
  }
}

export function formatTime(isoDate: string | null | undefined): string {
  if (!isoDate) return ''
  try {
    const date = new Date(isoDate)
    if (isNaN(date.getTime())) return ''
    return date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo'
    })
  } catch {
    return ''
  }
}

export function estimateReadingTime(content: string | null | undefined): number {
  if (!content) return 1
  const text = content.replace(/<[^>]+>/g, ' ')
  const words = text.trim().split(/\s+/).filter(Boolean).length
  const minutes = Math.ceil(words / 200)
  return Math.max(1, minutes)
}

export function generateSrcSet(r2Key: string): string {
  if (!r2Key) return ''
  return `/i/${escapeAttr(r2Key)}?w=400 400w, /i/${escapeAttr(r2Key)}?w=800 800w, /i/${escapeAttr(r2Key)}?w=1200 1200w`
}

export { getPostUrl } from '../utils/post'

// ============================================================================
// Theme Whitelist & Registry
// ============================================================================

export const allowedPublicThemes = new Set(["minimal", "alltype"]);

export function normalizePublicTheme(value: unknown): "minimal" | "alltype" {
  return value === "alltype" ? "alltype" : "minimal";
}

export const PUBLIC_THEMES = {
  minimal: {
    label: "Minimalista (Google Style)",
    cssHref: "/static/minimal.css"
  },
  alltype: {
    label: "AllType",
    cssHref: "/static/alltype.css"
  }
} as const;

// ============================================================================
// Public Layout
// ============================================================================

export function renderPublicLayout(params: PublicLayoutParams): string {
  const {
    title,
    description,
    canonicalUrl,
    nonce = '',
    siteName,
    navItems,
  categories = [],
    coverOfDay,
    bodyHtml,
    extraHeadHtml = '',
    googleAnalyticsId,
    theme = 'default',
    subscriber
  } = params

  const today = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
  const defaultSocialImage = `${new URL(canonicalUrl).origin}/static/logo-dp.png`
  const openGraph = params.openGraph || {
    title,
    description: description || `Notícias, análises e serviço público no ${siteName}`,
    url: canonicalUrl,
    siteName,
    type: 'website' as const,
    image: {
      url: defaultSocialImage,
      secureUrl: defaultSocialImage,
      alt: siteName
    }
  }

  // Cover drawer JS (if cover exists)
  const drawerScript = coverOfDay ? renderScript(`
      const coverBtn = document.getElementById('coverBtn');
      const coverOverlay = document.getElementById('coverOverlay');
      const coverPanel = document.getElementById('coverPanel');
      const coverClose = document.getElementById('coverClose');
      
      if (coverBtn && coverOverlay && coverPanel && coverClose) {
        coverBtn.addEventListener('click', () => {
          coverOverlay.classList.remove('hidden');
          setTimeout(() => {
            coverOverlay.classList.add('opacity-100');
            coverPanel.classList.add('translate-x-0');
          }, 10);
        });
        
        const closeDrawer = () => {
          coverOverlay.classList.remove('opacity-100');
          coverPanel.classList.remove('translate-x-0');
          setTimeout(() => coverOverlay.classList.add('hidden'), 300);
        };
        
        coverClose.addEventListener('click', closeDrawer);
        coverOverlay.addEventListener('click', (e) => {
          if (e.target === coverOverlay) closeDrawer();
        });
        
        /* Aesthetic Filter Support */
        const applyAesthetic = (img) => {
           if (img) img.classList.add('img-aesthetic');
        };
        
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' && !coverOverlay.classList.contains('hidden')) {
            closeDrawer();
          }
        });
      }
    `, nonce).replace('<script', '<script data-script="cover-drawer"') : ''

  // Header scroll effect & Mobile Menu
  const headerScript = renderScript(`
    const header = document.querySelector('.gb-header');
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const mobileMenuOverlay = document.getElementById('mobileMenuOverlay');
    const mobileMenuClose = document.getElementById('mobileMenuClose');
    const mobileCoverBtn = document.getElementById('mobileCoverBtn');

    if (header) {
      window.addEventListener('scroll', () => {
        if (window.scrollY > 10) {
          header.classList.add('scrolled');
        } else {
          header.classList.remove('scrolled');
        }
      }, { passive: true });
    }

    if (mobileMenuBtn && mobileMenuOverlay && mobileMenuClose) {
      const toggleMenu = () => {
        const isHidden = mobileMenuOverlay.classList.contains('hidden');
        if (isHidden) {
          mobileMenuOverlay.classList.remove('hidden');
          setTimeout(() => mobileMenuOverlay.classList.add('open'), 10);
          document.body.style.overflow = 'hidden';
        } else {
          mobileMenuOverlay.classList.remove('open');
          setTimeout(() => mobileMenuOverlay.classList.add('hidden'), 300);
          document.body.style.overflow = '';
        }
      };

      mobileMenuBtn.addEventListener('click', toggleMenu);
      mobileMenuClose.addEventListener('click', toggleMenu);
      
      // Close menu when clicking a link
      mobileMenuOverlay.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', toggleMenu);
      });

      // Handle Cover button inside mobile menu
      if (mobileCoverBtn) {
        mobileCoverBtn.addEventListener('click', () => {
          toggleMenu(); // Close mobile menu
          setTimeout(() => {
             const coverBtn = document.getElementById('coverBtn');
             if (coverBtn) coverBtn.click(); // Trigger desktop cover drawer
          }, 300);
        });
      }
    }

    // Auto-append 'next' parameter to login/register links
    const currentPath = window.location.pathname + window.location.search;
    document.querySelectorAll('a[href^="/portal/login"], a[href^="/portal/register"]').forEach(link => {
      const url = new URL(link.href, window.location.origin);
      if (!url.searchParams.has('next')) {
        url.searchParams.set('next', currentPath);
        link.href = url.pathname + url.search;
      }
    });
    // Newsletter form submit handler
    const newsletterForm = document.getElementById('newsletterForm');
    if (newsletterForm) {
      newsletterForm.addEventListener('submit', (e) => {
        e.preventDefault();
        alert('Inscrição realizada com sucesso! Obrigado por assinar nossa newsletter.');
        newsletterForm.reset();
      });
    }
  `, nonce).replace('<script', '<script data-script="header-scroll" defer')

  // Theme Selection & Normalization
  const normalizedTheme = normalizePublicTheme(theme)
  const cssFile = PUBLIC_THEMES[normalizedTheme].cssHref
  const cssHref = `${cssFile}?v=${STATIC_ASSET_VERSION}`
  const isAllType = normalizedTheme === 'alltype'

  // Header Logic
  const headerHtml = isAllType ? `
    <header class="bg-background text-on-background top-0 border-b border-line-separator flat no-shadows w-full" style="padding-top: 16px; padding-bottom: 16px; border-bottom: var(--alltype-line) solid var(--alltype-border) !important;">
      <div class="flex flex-col items-center w-full px-md py-sm md:px-xl">
        <div class="w-full flex justify-between items-center mb-md max-w-container-max mx-auto" style="margin-bottom: 16px;">
          <!-- 1. Menu (Left) -->
          <button id="mobileMenuBtn" class="hover:bg-surface-container-highest transition-colors duration-200 p-sm scale-95 active:opacity-80 transition-all border-none bg-transparent" aria-label="Menu" style="cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 8px;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>

          <!-- 2. Logo and Edition (Center) -->
          <div class="flex flex-col items-center">
            <a href="/" class="alltype-logo-image" aria-label="${escapeAttr(siteName)}" style="display: flex; align-items: center; justify-content: center; text-decoration: none;">
              <img src="/static/logo-dp.png" alt="${escapeAttr(siteName)}" width="162" height="56" fetchpriority="high" style="max-height: 48px; max-width: 240px; height: auto; width: auto; object-fit: contain;">
            </a>
            <div class="flex gap-md font-label-caps text-label-caps mt-sm text-text-muted-light desktop-only" style="margin-top: 8px; font-family: var(--alltype-font-ui); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--alltype-outline); gap: 16px;">
              <span>${today}</span>
              <span>|</span>
              <span>Edição Nº 4.521</span>
            </div>
          </div>

          <!-- 3. Actions (Right) -->
          <div class="flex items-center gap-md">
            <div class="gb-actions desktop-only" style="display: flex; gap: 16px; align-items: center; font-family: var(--alltype-font-ui); font-size: 14px; font-weight: 700; text-transform: uppercase;">
              ${subscriber ? `
                <a href="/portal" style="color: var(--alltype-text); text-decoration: none;">Minha Conta</a>
              ` : `
                <a href="/portal/login" style="color: var(--alltype-text); text-decoration: none;">Entrar</a>
              `}
              <a href="/assinar" class="btn-primary px-lg py-sm" style="padding: 8px 16px; text-decoration: none;">Assine</a>
            </div>
            <!-- Mobile Actions -->
            <div class="gb-actions" style="display: none;" id="mobileActions">
               <a href="/assinar" class="btn-primary" style="padding: 4px 12px; font-size: 12px; text-decoration: none;">Assine</a>
            </div>
          </div>
        </div>

        <!-- 4. Sub-Navigation (Bottom Row - Desktop Only) -->
        <nav class="w-full max-w-container-max mx-auto flex justify-center gap-xl border-t-4 border-line-separator pt-md desktop-only" style="margin-top: 16px; border-top: 4px solid var(--alltype-border); padding-top: 16px; gap: 32px; font-family: var(--alltype-font-ui); font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em;">
          ${navItems.map(item => `
            <a class="text-on-surface-variant font-label-caps hover:text-on-surface hover:bg-surface-container-highest transition-colors duration-200 p-sm scale-95 active:opacity-80 transition-all uppercase" href="${escapeAttr(item.href)}" style="text-decoration: none; padding: 4px 8px;">
              ${escapeHtml(item.label)}
            </a>
          `).join('')}
        </nav>
      </div>
      <style nonce="\${nonce}">
        @media (max-width: 768px) {
          #mobileActions { display: flex !important; align-items: center; }
          .alltype-logo-image img { max-height: 32px !important; }
        }
      </style>
    </header>
  ` : `
    <header class="gb-header">
      <div class="gb-container gb-header__inner">
        <!-- 1. Hamburger (Always Visible) -->
        <button id="mobileMenuBtn" class="gb-icon-btn" aria-label="Menu" style="margin-right: 16px;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#5f6368" stroke-width="2">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>

        <!-- 2. Logo (Image Only, Larger) -->
        <a href="/" class="gb-logo" aria-label="${escapeAttr(siteName)}">
          <img src="/static/logo-dp.png" alt="${escapeAttr(siteName)}" width="162" height="56" fetchpriority="high" style="max-height: 32px; max-width: 180px; height: auto; width: auto; object-fit: contain;">
        </a>

        <!-- Spacer -->
        <div style="flex: 1;"></div>

        <!-- 3. Actions (Modern Google Style) -->
        <div class="gb-actions" style="display: flex; gap: 8px; align-items: center;">
          ${coverOfDay ? `
            <button id="coverBtn" class="gb-btn gb-btn--text" style="font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em;">Capa do Dia</button>
          ` : ''}
          ${subscriber ? `
            <a href="/portal" class="gb-btn gb-btn--text">Minha Conta</a>
          ` : `
            <a href="/portal/login" class="gb-btn gb-btn--text">Entrar</a>
          `}
          <a href="/assinar" class="gb-btn gb-btn--primary">Assine</a>
        </div>
      </div>
    </header>
  `

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  ${description ? `<meta name="description" content="${escapeAttr(description)}">` : ''}
  <link rel="canonical" href="${escapeAttr(canonicalUrl)}">
  ${renderSocialMetaTags(openGraph)}
  ${params.lcpPreloadUrl ? `
    <link rel="preload" as="image" href="${escapeAttr(params.lcpPreloadUrl)}" 
      ${params.lcpSrcSet ? `imagesrcset="${escapeAttr(params.lcpSrcSet)}"` : ''} 
      imagesizes="(max-width: 768px) 100vw, 1200px"
      fetchpriority="high">` : ''}
  
  <link rel="dns-prefetch" href="https://securepubads.g.doubleclick.net">
  <link rel="dns-prefetch" href="https://pagead2.googlesyndication.com">
  <link rel="dns-prefetch" href="https://www.googletagmanager.com">
  <link rel="dns-prefetch" href="https://www.google-analytics.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>

  <!-- Fonts - Faster Loading -->
  <link rel="preconnect" href="https://fonts.googleapis.com" media="(min-width: 769px)">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin media="(min-width: 769px)">
  <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&family=Merriweather:ital,wght@0,300;0,400;0,700;0,900;1,300;1,400&family=Playfair+Display:ital,wght@0,700;0,800;0,900;1,700&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;0,8..60,700;1,8..60,400&display=optional" media="(min-width: 769px)">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&family=Merriweather:ital,wght@0,300;0,400;0,700;0,900;1,300;1,400&family=Playfair+Display:ital,wght@0,700;0,800;0,900;1,700&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;0,8..60,700;1,8..60,400&display=optional" media="print" id="google-fonts-link" data-desktop-media="(min-width: 769px)">
  <script nonce="${nonce}">
    (function() {
      const fontsLink = document.getElementById('google-fonts-link');
      if (!fontsLink) return;
      const desktopMedia = fontsLink.getAttribute('data-desktop-media') || '(min-width: 769px)';
      if (window.matchMedia && !window.matchMedia(desktopMedia).matches) return;
      fontsLink.addEventListener('load', function() {
        this.media = desktopMedia;
      });
    })();
  </script>
  <noscript>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&family=Merriweather:ital,wght@0,300;0,400;0,700;0,900;1,300;1,400&family=Playfair+Display:ital,wght@0,700;0,800;0,900;1,700&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;0,8..60,700;1,8..60,400&display=optional" media="(min-width: 769px)">
  </noscript>
  
  <!-- Critical CSS - Inlined for FCP -->
  <style nonce="${nonce}">
    :root {
      --gb-bg: #ffffff;
      --gb-surface: #f8f9fa;
      --gb-text: #202124;
      --gb-text-secondary: #5f6368;
      --gb-blue: #1a73e8;
      --gb-border: #dadce0;
      --gb-header-height: 64px;
      --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
      --accent: #1a73e8;
    }
    html, body {
      margin: 0;
      padding: 0;
      background-color: var(--gb-bg);
      color: var(--gb-text);
      font-family: var(--font-sans);
      -webkit-font-smoothing: antialiased;
      overflow-x: hidden;
      min-height: 100vh;
    }
    .gb-header {
      height: var(--gb-header-height);
      background: #fff;
      display: flex;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 1000;
      border-bottom: 1px solid var(--gb-border);
    }
    .gb-container {
      width: 100%;
      max-width: 1296px;
      margin: 0 auto;
      padding: 0 24px;
      box-sizing: border-box;
    }
    @media (max-width: 768px) {
      .gb-container { padding: 0 16px !important; }
      .desktop-only { display: none !important; }
    }
    .img-aesthetic {
       aspect-ratio: 16/9;
       background: #f0f0f0;
       object-fit: cover;
    }
    /* Anti-CLS for Ads - Optimized */
    .ad-slot {
      min-height: 90px;
      background: #fdfdfd;
      margin: 16px 0;
      display: flex !important;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .ad-slot[data-provider="adsense"], .ad-slot--adsense {
      display: block !important;
      width: 100%;
      text-align: center;
      overflow: visible;
    }
    .ad-slot[data-provider="adsense"] .adsbygoogle {
      display: block !important;
      width: 100%;
    }
    @media (max-width: 768px) {
      .ad-slot { min-height: 100px !important; }
      .ad-slot[data-ad-slot="home_top_leaderboard"] {
        height: 100px !important;
        min-height: 100px !important;
        max-height: 100px !important;
        margin: 12px 0 !important;
        overflow: hidden !important;
      }
      .ad-slot[data-ad-slot="home_top_leaderboard"] .adsbygoogle {
        height: 100px !important;
        min-height: 100px !important;
      }
      .ad-slot[data-ad-slot^="article_top"],
      .ad-slot[data-ad-slot^="article_footer"] {
        height: 100px !important;
        min-height: 100px !important;
        max-height: 100px !important;
        overflow: hidden !important;
      }
    }
    /* Critical Typography */
    h1, h2, h3 { line-height: 1.2; margin: 0; }
    a { text-decoration: none; color: inherit; }
    @keyframes gb-pulse {
      0% { opacity: 1; }
      50% { opacity: 0.6; }
      100% { opacity: 1; }
    }
  </style>

  <!-- Main CSS -->
  <link rel="preload" href="${cssHref}" as="style">
  <link href="${cssHref}" rel="stylesheet" fetchpriority="high">

  ${extraHeadHtml}
  ${googleAnalyticsId ? `
    <!-- Google Analytics (GA4) - Delayed Loading with FCP Tracking -->
    <script nonce="${nonce}">
      (function() {
        let loaded = false;
        let fcpSent = false;
        let fcpValue = null;
        const gaId = '${googleAnalyticsId}';

        // 1. Start observing FCP immediately
        if (window.PerformanceObserver) {
          try {
            const observer = new PerformanceObserver((list) => {
              const entries = list.getEntriesByName('first-contentful-paint');
              if (entries.length > 0) {
                fcpValue = entries[0].startTime;
                if (loaded) sendFCP();
              }
            });
            observer.observe({ type: 'paint', buffered: true });
          } catch (e) {
            console.warn('PerformanceObserver not supported for paint');
          }
        }

        function sendFCP() {
          if (fcpValue !== null && !fcpSent && typeof gtag === 'function') {
            fcpSent = true;
            gtag('event', 'web_vitals_fcp', {
              value: Math.round(fcpValue),
              event_category: 'Web Vitals',
              event_label: 'FCP',
              non_interaction: true
            });
            console.log('FCP recorded and sent to GA:', Math.round(fcpValue) + 'ms');
          }
        }

        function loadGA() {
          if (loaded) return;
          loaded = true;
          const script = document.createElement('script');
          script.src = 'https://www.googletagmanager.com/gtag/js?id=' + gaId;
          script.async = true;
          document.head.appendChild(script);
          
          window.dataLayer = window.dataLayer || [];
          window.gtag = function(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', gaId);
          console.log('Third-party scripts (GA) loaded.');
          
          // Send FCP if it was already captured
          if (fcpValue !== null) sendFCP();
        }
        
        // Listen for common interactions
        ['mousedown', 'mousemove', 'scroll', 'touchstart', 'keydown'].forEach(event => {
          window.addEventListener(event, loadGA, { once: true, passive: true });
        });
        
        // Fallback after 6s
        setTimeout(loadGA, 6000);
      })();
    </script>
  ` : ''}
</head>
<body class="theme-${normalizedTheme}" style="padding: 0 !important;">
  <div style="padding-inline: 16px; max-width: 100vw; overflow-x: hidden;">
  <!-- Header -->
  ${headerHtml}

  <!-- Mobile Menu Overlay -->
  <div id="mobileMenuOverlay" class="mobile-menu-overlay hidden">
    <div class="mobile-menu-panel">
      <div class="gb-menu-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
        <span class="gb-logo" style="margin: 0; opacity: 1;">
          <img src="/static/logo-dp.png" alt="Logo" width="120" height="42" loading="lazy" style="height: 24px; width: auto;">
        </span>
        <button id="mobileMenuClose" class="gb-icon-btn" aria-label="Fechar">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#5f6368" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      
      <nav style="display: flex; flex-direction: column; gap: 8px;">
        ${categories.map(cat => `
          <a href="/categoria/${encodeURIComponent(cat.slug)}" class="mobile-nav-link">
            ${escapeHtml(cat.name)}
          </a>
        `).join('')}
        
        <hr style="border: 0; border-top: 1px solid #dadce0; margin: 16px 0;">
        
        <a href="/assinar" class="gb-btn gb-btn--primary" style="width: 100%; justify-content: center; margin-bottom: 12px;">Assine</a>
        ${subscriber ? `
          <a href="/portal" class="gb-btn gb-btn--text" style="width: 100%; justify-content: flex-start; padding-left: 0;">Minha Conta</a>
        ` : `
          <a href="/portal/login" class="gb-btn gb-btn--text" style="width: 100%; justify-content: flex-start; padding-left: 0;">Entrar</a>
        `}
      </nav>
    </div>
  </div>

  <!-- Main Content -->
  <main id="mainContent">
    ${bodyHtml}
  </main>

  <!-- Footer (Novo Diário do Povo) -->
  <footer class="gblog-footer">
    <div class="gblog-footer__container">
      
      <!-- Top Section: Brand & Social -->
      <div class="gblog-footer__top">
        <div class="gblog-brand">
          <img src="/static/logo-dp.png" alt="${escapeAttr(siteName)}" width="142" height="49" loading="lazy" style="height: 28px; width: auto; filter: grayscale(100%); opacity: 0.6;">
        </div>

        <div class="gblog-social">
          <span class="gblog-social__label">Siga-nos</span>
          <div class="gblog-social__list">
            <!-- Twitter/X -->
            <a href="https://twitter.com" target="_blank" rel="noopener" class="gblog-icon-link" aria-label="Twitter">
              <svg viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path></svg>
            </a>
            <!-- Instagram -->
            <a href="https://instagram.com" target="_blank" rel="noopener" class="gblog-icon-link" aria-label="Instagram">
              <svg viewBox="0 0 24 24"><path d="M7.75 2h8.5A5.75 5.75 0 0 1 22 7.75v8.5A5.75 5.75 0 0 1 16.25 22h-8.5A5.75 5.75 0 0 1 2 16.25v-8.5A5.75 5.75 0 0 1 7.75 2zm0 1.5a4.25 4.25 0 0 0-4.25 4.25v8.5a4.25 4.25 0 0 0 4.25 4.25h8.5a4.25 4.25 0 0 0 4.25-4.25v-8.5a4.25 4.25 0 0 0-4.25-4.25h-8.5zM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 1.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm5.25-2a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/></svg>
            </a>
            <!-- LinkedIn -->
            <a href="https://linkedin.com" target="_blank" rel="noopener" class="gblog-icon-link" aria-label="LinkedIn">
              <svg viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>
            </a>
            <!-- YouTube -->
            <a href="https://youtube.com" target="_blank" rel="noopener" class="gblog-icon-link" aria-label="YouTube">
              <svg viewBox="0 0 24 24"><path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/></svg>
            </a>
          </div>
        </div>
      </div>

      <!-- Bottom Section: Links & Selector -->
      <div class="gblog-footer__bottom">
        <nav class="gblog-links">
          <a href="/p/sobre" class="gblog-link">Sobre nós</a>
          <a href="/p/privacidade" class="gblog-link">Privacidade</a>
          <a href="/p/termos" class="gblog-link">Termos de Uso</a>
          <a href="/contato" class="gblog-link">Contato</a>
        </nav>

        <div class="gblog-copyright" style="font-size: 0.75rem; color: #5f6368; opacity: 0.8;">
          &copy; ${new Date().getFullYear()} ${escapeHtml(siteName)}. Todos os direitos reservados.
        </div>
      </div>
    
    </div>
  </footer>

  <!-- Cover Drawer -->
  ${coverOfDay ? `
    <div id="coverOverlay" class="hidden">
      <div id="coverPanel">
        <div class="cover-header">
          <h2 class="font-bold text-lg">Capa do Dia</h2>
          <button id="coverClose" aria-label="Fechar">×</button>
        </div>
        <div class="cover-content">
          <img 
            src="/i/${escapeAttr(coverOfDay.r2Key)}?w=600" 
            alt="${escapeAttr(coverOfDay.alt)}"
            class="cover-image"
            style="aspect-ratio: ${coverOfDay.aspectRatio || '3/4'};"
            loading="lazy"
          >
        </div>
      </div>
    </div>
    ${drawerScript}
  ` : ''}
  
  ${headerScript}
  ${params.extraScriptsHtml || ''}
  
  
  </div>
</body>
</html>`
}
