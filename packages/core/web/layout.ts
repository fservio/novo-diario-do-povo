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
  
  // Header scroll effect
  const headerScript = renderScript(`
    const header = document.querySelector('.site-header');
    if (header) {
      window.addEventListener('scroll', () => {
        if (window.scrollY > 10) {
          header.classList.add('scrolled');
        } else {
          header.classList.remove('scrolled');
        }
      });
    }
  `, nonce).replace('<script', '<script data-script="header-scroll"')

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  ${description ? `<meta name="description" content="${escapeAttr(description)}">` : ''}
  <link rel="canonical" href="${escapeAttr(canonicalUrl)}">
  
  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Merriweather:ital,wght@0,300;0,400;0,700;0,900;1,300;1,400&display=swap" rel="stylesheet">
  
  <link href="/static/styles.css" rel="stylesheet">
  ${extraHeadHtml}
</head>
<body>
  <!-- Header -->
  <header class="site-header">
    <div class="container header-inner">
      <div class="flex items-center gap-8">
        <a href="/" class="logo">${escapeHtml(siteName)}</a>
        
        <!-- Desktop Nav -->
        <nav class="nav-links md:hidden">
          ${navItems.slice(0, 5).map(item => `
            <a href="${escapeAttr(item.href)}" class="nav-link ${item.active ? 'active' : ''}">
              ${escapeHtml(item.label)}
            </a>
          `).join('')}
        </nav>
      </div>

      <div class="flex items-center gap-4">
        ${coverOfDay ? `
          <button id="coverBtn" class="btn btn-outline text-xs uppercase tracking-wide">
            Capa do Dia
          </button>
        ` : ''}
        <a href="/assine" class="btn btn-primary">Assine</a>
        <a href="/login" class="btn btn-outline">Entrar</a>
      </div>
    </div>
  </header>

  <!-- Mobile Nav Scrollable (Optional) -->
  <div class="md:grid-cols-1" style="border-bottom: 1px solid var(--gray-200); overflow-x: auto; -webkit-overflow-scrolling: touch; display: none;">
    <div class="container" style="display: flex; gap: 1.5rem; padding: 0.75rem 1rem;">
       ${navItems.map(item => `
          <a href="${escapeAttr(item.href)}" class="text-sm font-bold whitespace-nowrap" style="color: var(--gray-700);">
            ${escapeHtml(item.label)}
          </a>
        `).join('')}
    </div>
  </div>

  <!-- Main Content -->
  <main>
    ${bodyHtml}
  </main>

  <!-- Footer -->
  <footer class="site-footer">
    <div class="container">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
        <div>
          <h3 class="logo mb-4">${escapeHtml(siteName)}</h3>
          <p>Jornalismo independente e moderno.</p>
        </div>
        <div>
          <h4 class="font-bold mb-4">Seções</h4>
          <div class="flex flex-col gap-2">
            ${navItems.map(item => `<a href="${item.href}">${item.label}</a>`).join('')}
          </div>
        </div>
        <div>
          <h4 class="font-bold mb-4">Conta</h4>
          <div class="flex flex-col gap-2">
            <a href="/assine">Assinar</a>
            <a href="/login">Entrar</a>
            <a href="/p/termos">Termos de Uso</a>
          </div>
        </div>
      </div>
      <div class="text-center pt-8 border-t border-gray-200">
        <p>&copy; ${new Date().getFullYear()} ${escapeHtml(siteName)}. Todos os direitos reservados.</p>
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
  
  ${headerScript}
</body>
</html>`
}
