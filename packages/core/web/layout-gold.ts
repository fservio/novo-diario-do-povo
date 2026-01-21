import type { Env } from '../types'

export interface PublicLayoutGoldParams {
  title: string
  description?: string
  image?: string
  canonicalUrl?: string
  bodyHtml: string
  nonce?: string
  siteName: string
  navItems: { label: string; href: string; active?: boolean }[]
  coverOfDay?: { r2Key: string; alt: string; aspectRatio: string } | null
}

const GA_ID = 'G-P016508933' // You may want to pull this from env/settings eventually

export function renderPublicLayoutGold(params: PublicLayoutGoldParams): string {
  const {
    title,
    description = "O seu jornal digital.",
    bodyHtml, // Main Content
    canonicalUrl,
    siteName,
    navItems
  } = params

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  
  ${canonicalUrl ? `<link rel="canonical" href="${canonicalUrl}">` : ''}

  <!-- Fonts: Inter (Google Fonts) -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Merriweather:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">

  <!-- V2 Gold CSS -->
  <link href="/static/gold.css" rel="stylesheet">

  <!-- Google Analytics 4 -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${GA_ID}');
  </script>
</head>
<body>
  
  <!-- Header Gold -->
  <header class="gb-header">
    <div class="gb-container">
      
      <!-- Line 1: Utility & Brand -->
      <div class="gb-header__top">
        
        <!-- Logo -->
        <a href="/v2" class="gb-header__logo">
          ${escapeHtml(siteName)}
        </a>

        <!-- Search (Desktop) & CTAs -->
        <div style="display: flex; align-items: center; gap: var(--space-4);">
          
          <!-- Search Bar (Desktop) -->
          <form action="/busca" method="GET" class="gb-hidden-mobile gb-search-bar">
             <input type="text" name="q" class="gb-search-input" placeholder="Buscar no Diário do Povo...">
             <svg class="gb-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
             </svg>
          </form>

          <!-- Actions -->
          <a href="/login" class="gb-btn gb-btn--ghost">Entrar</a>
          <a href="/assine" class="gb-btn gb-btn--primary">Assine</a>
        </div>
      </div>

      <!-- Line 2: Editorial Nav -->
      <nav class="gb-header__nav">
         <a href="/v2" class="gb-nav-link ${!navItems.some(i => i.active) ? 'gb-nav-link--active' : ''}">Capa</a>
         <span style="width: 1px; height: 16px; background: var(--border-color); margin: 0 var(--space-2);"></span>
         ${navItems.map(item => `
            <a href="${item.href}" class="gb-nav-link ${item.active ? 'gb-nav-link--active' : ''}">${escapeHtml(item.label)}</a>
         `).join('')}
         <a href="/colunas" class="gb-nav-link">Colunistas</a>
         <a href="/mais" class="gb-nav-link">Mais</a>
      </nav>

    </div>
  </header>

  <!-- Main Content -->
  <main>
    ${bodyHtml}
  </main>

  <!-- Footer Gold (Simple Version) -->
  <footer style="background: #111; color: #fff; padding: var(--space-8) 0; margin-top: var(--space-10);">
    <div class="gb-container">
      <div class="gb-grid" style="align-items: center;">
        <div style="grid-column: span 12; text-align: center;">
          <div style="font-weight: 800; font-size: 24px; margin-bottom: var(--space-2);">${escapeHtml(siteName)}</div>
          <p style="color: #888; font-size: 14px;">&copy; ${new Date().getFullYear()} Todos os direitos reservados.</p>
        </div>
      </div>
    </div>
  </footer>

</body>
</html>
`
}

// Simple HTML escaper
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}
