/**
 * Public Layout - Shared HTML structure for Home/Category/Article
 * Verge-style design: #f6f7f8 bg, white cards, #FF4D00 accent
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
}

// ============================================================================
// Helpers
// ============================================================================

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function escapeAttr(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

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
    extraHeadHtml = ''
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
        
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' && !coverOverlay.classList.contains('hidden')) {
            closeDrawer();
          }
        });
      }
    `, nonce).replace('<script', '<script data-script="cover-drawer"') : ''

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  ${description ? `<meta name="description" content="${escapeAttr(description)}">` : ''}
  <link rel="canonical" href="${escapeAttr(canonicalUrl)}">
  <link href="/static/styles.css" rel="stylesheet">
  ${extraHeadHtml}
  <style>
    /* Verge-style design tokens */
    :root {
      --accent: #FF4D00;
      --bg-body: #f6f7f8;
      --bg-card: #ffffff;
      --text-primary: #111827;
      --text-secondary: #6b7280;
      --border: #e5e7eb;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      line-height: 1.6;
      color: var(--text-primary);
      background: var(--bg-body);
      margin: 0;
      padding: 0;
    }
    
    /* Container */
    .container {
      max-width: 1536px; /* screen-2xl */
      margin: 0 auto;
      padding: 0 1rem;
    }
    
    /* Header */
    #publicHeader {
      background: white;
      border-bottom: 1px solid var(--border);
      position: sticky;
      top: 0;
      z-index: 50;
    }
    
    .header-top {
      border-bottom: 1px solid var(--border);
      padding: 0.5rem 0;
      font-size: 0.875rem;
      color: var(--text-secondary);
    }
    
    .header-main {
      padding: 1rem 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 2rem;
    }
    
    .site-logo {
      font-size: 1.5rem;
      font-weight: 900;
      color: var(--text-primary);
      text-decoration: none;
    }
    
    #coverBtn {
      background: var(--accent);
      color: white;
      border: none;
      padding: 0.5rem 1rem;
      border-radius: 0.375rem;
      cursor: pointer;
      font-weight: 600;
      font-size: 0.875rem;
    }
    
    #coverBtn:hover {
      opacity: 0.9;
    }
    
    /* Nav */
    .nav-main {
      border-bottom: 1px solid var(--border);
      overflow-x: auto;
      white-space: nowrap;
    }
    
    .nav-main nav {
      display: flex;
      gap: 2rem;
      padding: 0.75rem 0;
    }
    
    .nav-main a {
      text-decoration: none;
      color: var(--text-primary);
      font-weight: 600;
      font-size: 0.9375rem;
      padding-bottom: 0.25rem;
      border-bottom: 2px solid transparent;
      transition: border-color 0.2s;
    }
    
    .nav-main a:hover,
    .nav-main a.active {
      color: var(--accent);
      border-bottom-color: var(--accent);
    }
    
    /* Footer */
    #publicFooter {
      background: var(--text-primary);
      color: white;
      padding: 2rem 0;
      margin-top: 4rem;
      text-align: center;
      font-size: 0.875rem;
    }
    
    /* Cover Drawer */
    #coverOverlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 999;
      opacity: 0;
      transition: opacity 0.3s;
    }
    
    #coverOverlay.hidden {
      display: none;
    }
    
    #coverOverlay.opacity-100 {
      opacity: 1;
    }
    
    #coverPanel {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      width: 90%;
      max-width: 600px;
      background: white;
      box-shadow: -4px 0 24px rgba(0, 0, 0, 0.15);
      transform: translateX(100%);
      transition: transform 0.3s;
      overflow-y: auto;
    }
    
    #coverPanel.translate-x-0 {
      transform: translateX(0);
    }
    
    .cover-header {
      padding: 1rem;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    #coverClose {
      background: none;
      border: none;
      font-size: 1.5rem;
      cursor: pointer;
      padding: 0.5rem;
      color: var(--text-secondary);
    }
    
    #coverClose:hover {
      color: var(--text-primary);
    }
    
    .cover-content {
      padding: 2rem 1rem;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    
    .cover-image {
      max-width: 100%;
      height: auto;
      object-fit: contain;
    }
    
    /* Cards */
    .card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 1rem;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
    }
    
    /* Utility */
    .text-accent { color: var(--accent); }
    .hidden { display: none; }
  </style>
</head>
<body class="bg-[#f6f7f8] text-gray-900">
  <!-- Header -->
  <header id="publicHeader">
    <!-- Top bar -->
    <div class="header-top">
      <div class="container">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span>${escapeHtml(today)}</span>
          <div style="display: flex; gap: 1rem;">
            <a href="/assine" style="text-decoration: none; color: inherit;">Assine</a>
            <a href="/login" style="text-decoration: none; color: inherit;">Entrar</a>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Main header -->
    <div class="header-main">
      <div class="container" style="display: flex; align-items: center; justify-content: space-between;">
        <a href="/" class="site-logo">${escapeHtml(siteName)}</a>
        ${coverOfDay ? `<button id="coverBtn">📰 Capa do Dia</button>` : ''}
      </div>
    </div>
    
    <!-- Navigation -->
    <div class="nav-main">
      <div class="container">
        <nav>
          ${navItems.map(item => `
            <a href="${escapeAttr(item.href)}"${item.active ? ' class="active" aria-current="page"' : ''}>
              ${escapeHtml(item.label)}
            </a>
          `).join('')}
        </nav>
      </div>
    </div>
  </header>

  <!-- Main Content -->
  <main id="mainContent">
    ${bodyHtml}
  </main>

  <!-- Footer -->
  <footer id="publicFooter">
    <div class="container">
      <p>&copy; ${new Date().getFullYear()} ${escapeHtml(siteName)}. Todos os direitos reservados.</p>
    </div>
  </footer>

  <!-- Cover Drawer -->
  ${coverOfDay ? `
    <div id="coverOverlay" class="hidden">
      <div id="coverPanel">
        <div class="cover-header">
          <h2 style="margin: 0; font-size: 1.25rem; font-weight: 700;">Capa do Dia</h2>
          <button id="coverClose" aria-label="Fechar">×</button>
        </div>
        <div class="cover-content">
          <img 
            src="/i/${escapeAttr(coverOfDay.r2Key)}" 
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
</body>
</html>`
}
