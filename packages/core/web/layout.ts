/**
 * Public Layout - Shared HTML structure for Home/Category/Article
 * Modern & Minimalist Design System
 */

import { renderScript } from '../admin/ui'

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
  coverOfDay?: { r2Key: string; alt: string; aspectRatio?: string } | null
  bodyHtml: string
  extraHeadHtml?: string  // JSON-LD scripts and OG tags
  theme?: 'default' | 'minimal'
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
      year: 'numeric'
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
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
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

export { getPostUrl } from '../utils/post'

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
    coverOfDay,
    bodyHtml,
    extraHeadHtml = '',
    theme = 'default'
  } = params

  const today = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

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
  `, nonce).replace('<script', '<script data-script="header-scroll"')

  // Theme Selection
  const cssFile = theme === 'minimal' ? '/static/minimal.css' : '/static/styles.css'

  // Header Logic
  const headerHtml = theme === 'minimal' ? `
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
          <img src="/static/logo-dp.png" alt="${escapeAttr(siteName)}" style="height: 32px; width: auto; opacity: 1;">
        </a>

        <!-- Spacer -->
        <div style="flex: 1;"></div>

        <!-- 3. Actions (Modern Google Style) -->
        <div class="gb-actions" style="display: flex; gap: 8px; align-items: center;">
          <a href="/login" class="gb-btn gb-btn--text">Entrar</a>
          <a href="/assinar" class="gb-btn gb-btn--primary">Assine</a>
        </div>
      </div>
    </header>
  ` : `
    <header class="site-header">
    <div class="container header-inner">
      <div class="flex items-center gap-8">
        <a href="/" class="logo">${escapeHtml(siteName)}</a>
        
        <!-- Desktop Nav -->
        <nav class="nav-links desktop-only">
          ${navItems.slice(0, 5).map(item => `
            <a href="${escapeAttr(item.href)}" class="nav-link ${item.active ? 'active' : ''}">
              ${escapeHtml(item.label)}
            </a>
          `).join('')}
        </nav>
      </div>

      <div class="flex items-center gap-4">
        <!-- Mobile Menu trigger -->
        <button id="mobileMenuBtn" class="btn btn-outline mobile-only" aria-label="Menu">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>

        ${coverOfDay ? `
          <button id="coverBtn" class="btn btn-outline text-xs uppercase tracking-wide desktop-only">
            Capa do Dia
          </button>
        ` : ''}
        <a href="/assinar" class="btn btn-primary">Assine</a>
        <a href="/login" class="btn btn-outline desktop-only">Entrar</a>
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
  
  <link rel="dns-prefetch" href="https://securepubads.g.doubleclick.net">
  <link rel="dns-prefetch" href="https://pagead2.googlesyndication.com">
  <link rel="dns-prefetch" href="https://www.googletagservices.com">

  <!-- Fonts - Faster Loading -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Merriweather:ital,wght@0,300;0,400;0,700;0,900;1,300;1,400&display=swap">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Merriweather:ital,wght@0,300;0,400;0,700;0,900;1,300;1,400&display=swap" media="print" onload="this.media='all'">
  <noscript>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Merriweather:ital,wght@0,300;0,400;0,700;0,900;1,300;1,400&display=swap">
  </noscript>
  
  <!-- CSS -->
  <link rel="preload" href="${cssFile}" as="style">
  <link href="${cssFile}" rel="stylesheet" fetchpriority="high">
  
  <style>
    body { font-family: 'Inter', sans-serif; }
    .img-aesthetic {
      filter: url(#aesthetic-newspaper) contrast(1.05) brightness(1.02) saturate(0.85);
      transition: filter 0.6s cubic-bezier(0.4, 0, 0.2, 1);
      object-fit: cover;
    }
    .img-aesthetic:hover {
      filter: none;
    }
    
    /* CRITICAL: Mobile Padding Fix */
    @media (max-width: 768px) {
      html, body {
        overflow-x: hidden !important;
        max-width: 100vw !important;
      }
      
      .gb-container {
        padding-left: 16px !important;
        padding-right: 16px !important;
      }
      
      .gb-grid {
        padding-left: 0 !important;
        padding-right: 0 !important;
      }
    }
  </style>

  ${extraHeadHtml}
</head>
<body>
  <!-- Header -->
  ${headerHtml}

  <!-- Mobile Menu Overlay -->
  <div id="mobileMenuOverlay" class="mobile-menu-overlay hidden">
    <div class="mobile-menu-panel">
      <div class="gb-menu-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
        <span class="gb-logo" style="margin: 0; opacity: 1;">
          <img src="/static/logo-dp.png" alt="Logo" style="height: 24px; width: auto;">
        </span>
        <button id="mobileMenuClose" class="gb-icon-btn" aria-label="Fechar">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#5f6368" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      
      <nav style="display: flex; flex-direction: column; gap: 8px;">
        ${navItems.map(item => `
          <a href="${escapeAttr(item.href)}" class="mobile-nav-link">
            ${escapeHtml(item.label)}
          </a>
        `).join('')}
        
        <hr style="border: 0; border-top: 1px solid #dadce0; margin: 16px 0;">
        
        <a href="/assinar" class="gb-btn gb-btn--primary" style="width: 100%; justify-content: center; margin-bottom: 12px;">Assine</a>
        <a href="/login" class="gb-btn gb-btn--text" style="width: 100%; justify-content: flex-start; padding-left: 0;">Entrar</a>
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
          <img src="/static/logo-dp.png" alt="${escapeAttr(siteName)}" style="height: 28px; width: auto; filter: grayscale(100%); opacity: 0.6;">
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
              <svg viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
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
  
  <!-- Aesthetic Identity Filter -->
  <svg style="position: absolute; width: 0; height: 0;" aria-hidden="true" focusable="false">
    <filter id="aesthetic-newspaper">
      <feColorMatrix type="matrix" values="0.3333 0.3333 0.3333 0 0
                                           0.3333 0.3333 0.3333 0 0
                                           0.3333 0.3333 0.3333 0 0
                                           0      0      0      1 0" />
      <feComponentTransfer color-interpolation-filters="sRGB">
        <feFuncR type="table" tableValues="0.05 0.94" />
        <feFuncG type="table" tableValues="0.09 0.96" />
        <feFuncB type="table" tableValues="0.16 0.97" />
      </feComponentTransfer>
    </filter>
  </svg>
</body>
</html>`
}
