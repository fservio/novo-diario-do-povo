/**
 * Home Page Renderer (Verge Style)
 * SSR-only, minimal JS, full-width layout
 */

import type { Context } from 'hono'
import type { Env, AppContext } from '../types'
import type { HomeData, HomePost, CategoryBlock } from '../db/home'

// ============================================================================
// Helpers
// ============================================================================

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function escapeAttr(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

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

function renderCoverDrawerHtml(params: {
  r2Key: string
  alt: string
  aspectRatio: string
  nonce: string
}): string {
  const { r2Key, alt, aspectRatio, nonce } = params
  
  return `
    <!-- Cover of the Day Drawer -->
    <div id="coverOverlay" class="fixed inset-0 bg-black/50 z-50 hidden" aria-hidden="true"></div>
    <div id="coverPanel" class="fixed top-0 right-0 bottom-0 w-full md:w-[500px] bg-white shadow-2xl z-50 transform translate-x-full transition-transform duration-300">
      <div class="h-full flex flex-col">
        <div class="flex items-center justify-between p-4 border-b">
          <h2 class="text-xl font-bold">Capa do Dia</h2>
          <button id="coverClose" class="text-gray-500 hover:text-gray-700 p-2" aria-label="Fechar">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div class="flex-1 p-4 overflow-y-auto">
          <div style="aspect-ratio: ${escapeAttr(aspectRatio)}; max-width: 100%;">
            <img 
              src="/i/${escapeAttr(r2Key)}" 
              alt="${escapeAttr(alt)}"
              style="width: 100%; height: 100%; object-fit: contain;"
              loading="lazy"
            />
          </div>
        </div>
      </div>
    </div>
    
    <script nonce="${nonce}">
    (function() {
      const overlay = document.getElementById('coverOverlay');
      const panel = document.getElementById('coverPanel');
      const btn = document.getElementById('coverBtn');
      const closeBtn = document.getElementById('coverClose');
      
      function openDrawer() {
        overlay.classList.remove('hidden');
        overlay.setAttribute('aria-hidden', 'false');
        setTimeout(() => {
          panel.classList.remove('translate-x-full');
        }, 10);
        document.body.style.overflow = 'hidden';
      }
      
      function closeDrawer() {
        panel.classList.add('translate-x-full');
        setTimeout(() => {
          overlay.classList.add('hidden');
          overlay.setAttribute('aria-hidden', 'true');
          document.body.style.overflow = '';
        }, 300);
      }
      
      btn?.addEventListener('click', openDrawer);
      closeBtn?.addEventListener('click', closeDrawer);
      overlay?.addEventListener('click', closeDrawer);
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !overlay.classList.contains('hidden')) {
          closeDrawer();
        }
      });
    })();
    </script>
  `
}

function renderFrontPageHero(post: HomePost, baseUrl: string): string {
  const imgSrc = post.featured_image_r2_key 
    ? `/i/${escapeAttr(post.featured_image_r2_key)}` 
    : '/placeholder-hero.jpg'
    
  return `
    <article class="bg-white rounded-2xl overflow-hidden border border-gray-200 shadow-sm">
      <a href="${baseUrl}/noticia/${escapeAttr(post.slug)}" class="block">
        <div class="relative aspect-[16/9]">
          <img 
            src="${imgSrc}" 
            alt="${escapeAttr(post.title)}"
            width="1200"
            height="675"
            loading="eager"
            fetchpriority="high"
            class="w-full h-full object-cover"
          />
          <div class="absolute top-4 left-4">
            <span class="bg-[#FF4D00] text-white px-3 py-1 text-sm font-bold rounded">
              ${escapeHtml(post.category_name)}
            </span>
          </div>
        </div>
        <div class="p-6">
          <h2 class="text-3xl font-bold mb-2 hover:text-[#FF4D00] transition-colors">
            ${escapeHtml(post.title)}
          </h2>
          <p class="text-gray-600 text-lg">
            ${escapeHtml(truncate(post.excerpt, 200))}
          </p>
        </div>
      </a>
    </article>
  `
}

function renderHotRail(posts: HomePost[], baseUrl: string): string {
  if (posts.length === 0) return ''
  
  const items = posts.map(post => `
    <li>
      <a href="${baseUrl}/noticia/${escapeAttr(post.slug)}" class="flex items-baseline gap-2 hover:text-[#FF4D00] transition-colors">
        <span class="text-xs text-gray-500 font-mono">${formatTime(post.published_at)}</span>
        <span class="flex-1 text-sm font-medium">${escapeHtml(post.title)}</span>
      </a>
    </li>
  `).join('')
  
  return `
    <aside class="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-bold">
          <span style="border-bottom: 3px solid #FF4D00; padding-bottom: 2px;">Agora</span>
        </h2>
        <a href="${baseUrl}/ultimas" class="text-sm text-[#FF4D00] font-medium hover:underline">
          Ver todas →
        </a>
      </div>
      <ul class="space-y-3">
        ${items}
      </ul>
    </aside>
  `
}

function renderDualFeature(posts: HomePost[], baseUrl: string): string {
  if (posts.length === 0) return ''
  
  const cards = posts.map(post => {
    const imgSrc = post.featured_image_r2_key 
      ? `/i/${escapeAttr(post.featured_image_r2_key)}` 
      : '/placeholder.jpg'
      
    return `
      <article class="bg-white rounded-2xl overflow-hidden border border-gray-200 shadow-sm">
        <a href="${baseUrl}/noticia/${escapeAttr(post.slug)}" class="block">
          <div class="relative aspect-[4/3]">
            <img 
              src="${imgSrc}" 
              alt="${escapeAttr(post.title)}"
              width="600"
              height="450"
              loading="lazy"
              class="w-full h-full object-cover"
            />
          </div>
          <div class="p-4">
            <span class="text-xs text-[#FF4D00] font-bold uppercase">${escapeHtml(post.category_name)}</span>
            <h3 class="text-xl font-bold mt-2 hover:text-[#FF4D00] transition-colors">
              ${escapeHtml(post.title)}
            </h3>
            <p class="text-gray-600 mt-2">
              ${escapeHtml(truncate(post.excerpt, 120))}
            </p>
          </div>
        </a>
      </article>
    `
  }).join('')
  
  return `
    <div class="grid md:grid-cols-2 gap-6">
      ${cards}
    </div>
  `
}

function renderCategoryBlockLeadList(block: CategoryBlock, baseUrl: string): string {
  const leadImgSrc = block.lead.featured_image_r2_key 
    ? `/i/${escapeAttr(block.lead.featured_image_r2_key)}` 
    : '/placeholder.jpg'
    
  const listItems = block.list.map(post => `
    <li>
      <a href="${baseUrl}/noticia/${escapeAttr(post.slug)}" class="hover:text-[#FF4D00] transition-colors">
        ${escapeHtml(post.title)}
      </a>
    </li>
  `).join('')
  
  return `
    <section class="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      <h2 class="text-2xl font-bold mb-4">
        <span style="border-bottom: 3px solid #FF4D00; padding-bottom: 2px;">
          ${escapeHtml(block.name)}
        </span>
      </h2>
      
      <!-- Lead -->
      <article class="mb-6">
        <a href="${baseUrl}/noticia/${escapeAttr(block.lead.slug)}" class="block">
          <div class="flex gap-4">
            <div class="w-32 h-24 flex-shrink-0">
              <img 
                src="${leadImgSrc}" 
                alt="${escapeAttr(block.lead.title)}"
                width="128"
                height="96"
                loading="lazy"
                class="w-full h-full object-cover rounded"
              />
            </div>
            <div class="flex-1">
              <h3 class="text-lg font-bold hover:text-[#FF4D00] transition-colors">
                ${escapeHtml(block.lead.title)}
              </h3>
            </div>
          </div>
        </a>
      </article>
      
      <!-- List -->
      ${listItems ? `
        <ul class="space-y-3 text-sm border-t pt-4">
          ${listItems}
        </ul>
      ` : ''}
    </section>
  `
}

function renderExplainersGrid(posts: HomePost[], baseUrl: string): string {
  if (posts.length === 0) return ''
  
  const largePost = posts[0]
  const mediumPosts = posts.slice(1)
  
  const largeCard = `
    <article class="bg-white rounded-2xl overflow-hidden border border-gray-200 shadow-sm md:col-span-2 md:row-span-2">
      <a href="${baseUrl}/noticia/${escapeAttr(largePost.slug)}" class="block h-full">
        <div class="relative aspect-[16/9] md:h-full">
          <img 
            src="${largePost.featured_image_r2_key ? `/i/${escapeAttr(largePost.featured_image_r2_key)}` : '/placeholder.jpg'}" 
            alt="${escapeAttr(largePost.title)}"
            width="800"
            height="600"
            loading="lazy"
            class="w-full h-full object-cover"
          />
        </div>
        <div class="p-6">
          <span class="text-xs text-[#FF4D00] font-bold uppercase">Explicador</span>
          <h3 class="text-2xl font-bold mt-2 hover:text-[#FF4D00] transition-colors">
            ${escapeHtml(largePost.title)}
          </h3>
          <p class="text-gray-600 mt-2">
            ${escapeHtml(truncate(largePost.excerpt, 150))}
          </p>
        </div>
      </a>
    </article>
  `
  
  const mediumCards = mediumPosts.map(post => `
    <article class="bg-white rounded-2xl overflow-hidden border border-gray-200 shadow-sm">
      <a href="${baseUrl}/noticia/${escapeAttr(post.slug)}" class="block">
        <div class="relative aspect-[4/3]">
          <img 
            src="${post.featured_image_r2_key ? `/i/${escapeAttr(post.featured_image_r2_key)}` : '/placeholder.jpg'}" 
            alt="${escapeAttr(post.title)}"
            width="400"
            height="300"
            loading="lazy"
            class="w-full h-full object-cover"
          />
        </div>
        <div class="p-4">
          <h3 class="text-lg font-bold hover:text-[#FF4D00] transition-colors">
            ${escapeHtml(post.title)}
          </h3>
        </div>
      </a>
    </article>
  `).join('')
  
  return `
    <section class="mt-12">
      <h2 class="text-2xl font-bold mb-6">
        <span style="border-bottom: 3px solid #FF4D00; padding-bottom: 2px;">Explicadores</span>
      </h2>
      <div class="grid md:grid-cols-4 gap-6">
        ${largeCard}
        ${mediumCards}
      </div>
    </section>
  `
}

function renderMostRead(posts: HomePost[], baseUrl: string): string {
  if (posts.length === 0) return ''
  
  const items = posts.map((post, i) => `
    <li class="flex gap-3">
      <span class="text-2xl font-bold text-[#FF4D00]">${i + 1}</span>
      <a href="${baseUrl}/noticia/${escapeAttr(post.slug)}" class="flex-1 hover:text-[#FF4D00] transition-colors">
        ${escapeHtml(post.title)}
      </a>
    </li>
  `).join('')
  
  return `
    <aside class="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mt-12">
      <h2 class="text-2xl font-bold mb-6">
        <span style="border-bottom: 3px solid #FF4D00; padding-bottom: 2px;">Mais Lidas</span>
      </h2>
      <ol class="space-y-4">
        ${items}
      </ol>
    </aside>
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
  
  // Get active ad slots for home template
  const adSlots = await findActiveSlotsByTemplate(c.env, 'home')
  const findSlot = (name: string) => adSlots.find(s => s.name === name)
  
  const pageContext = { template: 'home' as const, slug: '' }
  const userContext = { isSubscriber: false }
  
  // Ad slots with anti-CLS placeholders
  const slotTopLeaderboard = findSlot('home_top_leaderboard')
  const adTopLeaderboard = slotTopLeaderboard 
    ? renderAdSlot({ slot: slotTopLeaderboard, page: pageContext, user: userContext })
    : ''
  
  const slotInfeed1 = findSlot('home_infeed_1')
  const adInfeed1 = slotInfeed1
    ? renderAdSlot({ slot: slotInfeed1, page: pageContext, user: userContext })
    : ''
  
  const slotInfeed2 = findSlot('home_infeed_2')
  const adInfeed2 = slotInfeed2
    ? renderAdSlot({ slot: slotInfeed2, page: pageContext, user: userContext })
    : ''
  
  const adsLoaderScript = await generateAdsLoaderScript(c.env)
  
  // Category blocks with ads insertion
  const categoryBlocksHtml = data.categoryBlocks.map((block, i) => {
    const blockHtml = renderCategoryBlockLeadList(block, baseUrl)
    
    // Insert ad after "Economia" (index 1)
    if (i === 1) {
      return blockHtml + '\n' + adInfeed1
    }
    // Insert ad after "Cidades" (index 3)
    if (i === 3) {
      return blockHtml + '\n' + adInfeed2
    }
    return blockHtml
  }).join('\n')
  
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(siteName)} - Notícias e Análises</title>
  <meta name="description" content="Cobertura completa de notícias do Brasil e do mundo">
  <link rel="stylesheet" href="/static/styles.css">
  <style>
    body {
      background-color: #f6f7f8;
      margin: 0;
      font-family: system-ui, -apple-system, sans-serif;
    }
    .container {
      max-width: 1536px;
      margin: 0 auto;
      padding: 0 1rem;
    }
    header {
      background: white;
      border-bottom: 1px solid #e5e7eb;
      position: sticky;
      top: 0;
      z-index: 40;
    }
    nav a {
      color: #374151;
      text-decoration: none;
      padding: 0.5rem 1rem;
      display: inline-block;
      font-weight: 500;
      transition: color 0.2s;
    }
    nav a:hover {
      color: #FF4D00;
    }
    .hero-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 1.5rem;
      margin-bottom: 2rem;
    }
    @media (min-width: 768px) {
      .hero-grid {
        grid-template-columns: 2fr 1fr;
      }
    }
  </style>
</head>
<body>
  <!-- Header -->
  <header>
    <div class="container">
      <!-- Top bar -->
      <div class="flex items-center justify-between py-2 text-sm border-b border-gray-200">
        <time>${new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</time>
        <div class="flex gap-4">
          <a href="/assine" class="text-[#FF4D00] font-medium">Assine</a>
          <a href="/login">Entrar</a>
        </div>
      </div>
      
      <!-- Main header -->
      <div class="flex items-center justify-between py-4">
        <a href="/" class="text-3xl font-bold">${escapeHtml(siteName)}</a>
        <div class="flex items-center gap-4">
          <button id="coverBtn" class="px-4 py-2 bg-[#FF4D00] text-white font-medium rounded hover:bg-[#E04400] transition-colors">
            Capa do Dia
          </button>
        </div>
      </div>
      
      <!-- Nav -->
      <nav class="border-t border-gray-200">
        <a href="/categoria/brasil">Brasil</a>
        <a href="/categoria/economia">Economia</a>
        <a href="/categoria/politica">Política</a>
        <a href="/categoria/cidades">Cidades</a>
        <a href="/categoria/esporte">Esporte</a>
        <a href="/categoria/explicador">Explicadores</a>
      </nav>
    </div>
  </header>
  
  <!-- Main Content -->
  <main class="container py-8">
    <!-- Hero + Hot Rail -->
    <div class="hero-grid">
      ${data.hero ? renderFrontPageHero(data.hero, baseUrl) : ''}
      ${renderHotRail(data.hotRail, baseUrl)}
    </div>
    
    <!-- Dual Feature -->
    ${renderDualFeature(data.dualFeatures, baseUrl)}
    
    <!-- Ad: Top Leaderboard -->
    <div class="my-8">
      ${adTopLeaderboard}
    </div>
    
    <!-- Category Blocks (with ads inserted) -->
    <div class="space-y-8 mt-8">
      ${categoryBlocksHtml}
    </div>
    
    <!-- Explainers -->
    ${renderExplainersGrid(data.explainers, baseUrl)}
    
    <!-- Most Read -->
    ${renderMostRead(data.mostRead, baseUrl)}
  </main>
  
  <!-- Footer -->
  <footer class="bg-gray-900 text-white mt-12 py-8">
    <div class="container text-center">
      <p>&copy; ${new Date().getFullYear()} ${escapeHtml(siteName)}. Todos os direitos reservados.</p>
    </div>
  </footer>
  
  <!-- Cover Drawer -->
  ${renderCoverDrawerHtml({ r2Key: coverR2Key, alt: coverAlt, aspectRatio: coverAspectRatio, nonce })}
  
  <!-- Ads Loader -->
  ${adsLoaderScript}
</body>
</html>`
}
