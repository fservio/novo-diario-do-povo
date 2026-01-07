/**
 * Main Application Entry Point
 * Hono + Cloudflare Pages Functions
 */

import { Hono } from 'hono'
import { serveStatic } from 'hono/cloudflare-workers'
import type { Env, AppContext } from '../packages/core/types'
import { 
  loggingMiddleware, 
  securityHeaders, 
  corsMiddleware,
  errorHandler 
} from '../packages/core/middleware'
import { bootstrapAdmin } from '../packages/core/auth'

// ============================================================================
// Initialize App
// ============================================================================

const app = new Hono<{ Bindings: Env; Variables: AppContext }>()

// ============================================================================
// Global Middleware
// ============================================================================

app.use('*', loggingMiddleware)
app.use('*', securityHeaders)

// ============================================================================
// Static Files (R2-served media)
// ============================================================================

app.get('/i/:key{.+}', async (c) => {
  const { serveMedia } = await import('../packages/core/storage')
  const key = c.req.param('key')
  return serveMedia(c.env, key)
})

// Serve static assets from public/static/
app.use('/static/*', serveStatic({ root: './public' }))

// ============================================================================
// Health Check
// ============================================================================

app.get('/api/health', (c) => {
  return c.json({ 
    success: true, 
    status: 'healthy',
    timestamp: new Date().toISOString() 
  })
})

// ============================================================================
// SEO Routes
// ============================================================================

app.get('/robots.txt', async (c) => {
  const { getSetting } = await import('../packages/core/db')
  const disallow = await getSetting(c.env, 'robots_disallow', 'public') || ['/admin', '/api/admin']
  
  const robots = [
    'User-agent: *',
    ...disallow.map((path: string) => `Disallow: ${path}`),
    '',
    `Sitemap: ${c.env.PUBLIC_BASE_URL}/sitemap-index.xml`,
  ].join('\n')
  
  return c.text(robots, 200, { 'Content-Type': 'text/plain' })
})

app.get('/sitemap-index.xml', async (c) => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${c.env.PUBLIC_BASE_URL}/sitemap.xml</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${c.env.PUBLIC_BASE_URL}/sitemap-news.xml</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
  </sitemap>
</sitemapindex>`
  
  return c.text(xml, 200, { 'Content-Type': 'application/xml' })
})

app.get('/sitemap.xml', async (c) => {
  const { findPublishedPosts } = await import('../packages/core/db')
  const posts = await findPublishedPosts(c.env, { limit: 1000 })
  
  const urls = posts.map(post => `
  <url>
    <loc>${c.env.PUBLIC_BASE_URL}/noticia/${post.slug}</loc>
    <lastmod>${post.updated_at}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`).join('')
  
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${c.env.PUBLIC_BASE_URL}/</loc>
    <changefreq>hourly</changefreq>
    <priority>1.0</priority>
  </url>${urls}
</urlset>`
  
  return c.text(xml, 200, { 'Content-Type': 'application/xml' })
})

// ============================================================================
// Public API Routes
// ============================================================================

// Get Active Plans
app.get('/api/public/plans', async (c) => {
  const { findActivePlans } = await import('../packages/core/db')
  const plans = await findActivePlans(c.env)
  
  // Remove sensitive data
  const publicPlans = plans.map(p => ({
    slug: p.slug,
    name: p.name,
    description: p.description,
    price_cents: p.price_cents,
    currency: p.currency,
    billing_cycle: p.billing_cycle,
    trial_days: p.trial_days,
    benefits: p.benefits_json ? JSON.parse(p.benefits_json) : [],
  }))
  
  return c.json({ success: true, data: publicPlans })
})

// ============================================================================
// Public Web Routes (SSR)
// ============================================================================

app.get('/', async (c) => {
  const { findPublishedPosts, findAllCategories, getSetting } = await import('../packages/core/db')
  
  const posts = await findPublishedPosts(c.env, { limit: 20 })
  const categories = await findAllCategories(c.env)
  const siteName = await getSetting(c.env, 'site_name', 'public') || 'Jornal'
  
  return c.html(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${siteName} - Notícias em tempo real</title>
        <meta name="description" content="Acompanhe as principais notícias do Brasil e do mundo">
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="/static/styles.css" rel="stylesheet">
    </head>
    <body class="bg-gray-50">
        <header class="bg-white border-b">
            <div class="container mx-auto px-4 py-4">
                <h1 class="text-3xl font-bold text-gray-900">${siteName}</h1>
                <nav class="mt-4 flex gap-4">
                    ${categories.map(cat => `
                        <a href="/categoria/${cat.slug}" class="text-gray-700 hover:text-blue-600">${cat.name}</a>
                    `).join('')}
                </nav>
            </div>
        </header>
        
        <main class="container mx-auto px-4 py-8">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                ${posts.map(post => `
                    <article class="bg-white rounded-lg shadow-sm overflow-hidden hover:shadow-md transition">
                        <a href="/noticia/${post.slug}">
                            <div class="p-4">
                                <h2 class="text-xl font-bold mb-2 text-gray-900">${post.title}</h2>
                                <p class="text-gray-600 text-sm">${post.excerpt || ''}</p>
                                <span class="text-xs text-gray-400 mt-2 block">
                                    ${new Date(post.published_at || '').toLocaleDateString('pt-BR')}
                                </span>
                            </div>
                        </a>
                    </article>
                `).join('')}
            </div>
        </main>
        
        <footer class="bg-gray-900 text-white mt-12 py-8">
            <div class="container mx-auto px-4 text-center">
                <p>&copy; 2024 ${siteName}. Todos os direitos reservados.</p>
            </div>
        </footer>
        
        <script src="/static/app.js"></script>
    </body>
    </html>
  `)
})

app.get('/noticia/:slug', async (c) => {
  const slug = c.req.param('slug')
  const { findPostWithRelations, getSetting } = await import('../packages/core/db')
  const { checkPostAccess } = await import('../packages/core/paywall')
  
  const postData = await findPostWithRelations(c.env, slug)
  
  if (!postData || postData.status !== 'published') {
    return c.notFound()
  }
  
  // Check access (simplified - should get reader context from cookie/token)
  const accessCheck = await checkPostAccess(c.env, postData, {
    isSubscriber: false,
    anonIdentifier: 'demo',
  })
  
  const siteName = await getSetting(c.env, 'site_name', 'public') || 'Jornal'
  
  return c.html(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${postData.title} | ${siteName}</title>
        <meta name="description" content="${postData.excerpt || ''}">
        <link rel="canonical" href="${c.env.PUBLIC_BASE_URL}/noticia/${postData.slug}">
        <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-gray-50">
        <header class="bg-white border-b">
            <div class="container mx-auto px-4 py-4">
                <a href="/" class="text-2xl font-bold text-gray-900">${siteName}</a>
            </div>
        </header>
        
        <main class="container mx-auto px-4 py-8 max-w-3xl">
            <article class="bg-white rounded-lg shadow-sm p-8">
                <div class="mb-4">
                    <span class="text-blue-600 font-semibold">${postData.category?.name || ''}</span>
                </div>
                
                <h1 class="text-4xl font-bold mb-4">${postData.title}</h1>
                
                <div class="text-gray-600 mb-6">
                    <span>Por ${postData.author?.name || 'Redação'}</span>
                    <span class="mx-2">•</span>
                    <time>${new Date(postData.published_at || '').toLocaleDateString('pt-BR')}</time>
                </div>
                
                ${postData.excerpt ? `<p class="text-xl text-gray-700 mb-6">${postData.excerpt}</p>` : ''}
                
                <div class="prose max-w-none">
                    ${accessCheck.allowed ? postData.content : `
                        <p>${postData.content.substring(0, 500)}...</p>
                        <div class="bg-blue-50 border-2 border-blue-200 rounded-lg p-6 mt-6 text-center">
                            <h3 class="text-2xl font-bold mb-2">Continue lendo com acesso ilimitado</h3>
                            <p class="text-gray-700 mb-4">Assine para liberar todas as matérias</p>
                            <a href="/assinar" class="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700">
                                Assinar agora
                            </a>
                        </div>
                    `}
                </div>
            </article>
        </main>
        
        <footer class="bg-gray-900 text-white mt-12 py-8">
            <div class="container mx-auto px-4 text-center">
                <p>&copy; 2024 ${siteName}. Todos os direitos reservados.</p>
            </div>
        </footer>
    </body>
    </html>
  `)
})

// ============================================================================
// Webhooks
// ============================================================================

app.post('/api/webhooks/asaas', async (c) => {
  const { rateLimiter } = await import('../packages/core/middleware')
  await rateLimiter('webhook')(c, async () => {})
  
  const { asaasWebhookEventSchema, handleAsaasWebhook } = await import('../packages/core/integrations/asaas')
  
  try {
    const body = await c.req.json()
    const event = asaasWebhookEventSchema.parse(body)
    const requestId = c.get('requestId')
    
    // Idempotency check
    const eventId = `asaas_${event.payment.id}_${event.event}`
    const existing = await c.env.DB.prepare(
      'SELECT id FROM webhook_events WHERE provider = ? AND event_id = ?'
    ).bind('asaas', eventId).first()
    
    if (existing) {
      return c.json({ success: true, message: 'Event already processed' })
    }
    
    // Store event
    await c.env.DB.prepare(`
      INSERT INTO webhook_events (provider, event_id, event_type, payload_hash, payload_json, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'pending', datetime('now'))
    `).bind(
      'asaas',
      eventId,
      event.event,
      'hash',
      JSON.stringify(body)
    ).run()
    
    // Process
    await handleAsaasWebhook(c.env, event, requestId)
    
    // Mark as processed
    await c.env.DB.prepare(
      'UPDATE webhook_events SET status = ?, processed_at = datetime(\'now\') WHERE provider = ? AND event_id = ?'
    ).bind('processed', 'asaas', eventId).run()
    
    return c.json({ success: true })
  } catch (error) {
    return c.json({ success: false, error: (error as Error).message }, 400)
  }
})

// ============================================================================
// Bootstrap (first run)
// ============================================================================

app.use('*', async (c, next) => {
  // Bootstrap admin on first request
  try {
    await bootstrapAdmin(c.env)
  } catch (error) {
    console.error('Bootstrap error:', error)
  }
  await next()
})

// ============================================================================
// Error Handler
// ============================================================================

app.onError(errorHandler)

// ============================================================================
// 404 Handler
// ============================================================================

app.notFound((c) => {
  return c.json({ success: false, error: 'Não encontrado' }, 404)
})

// ============================================================================
// Export
// ============================================================================

export default app
