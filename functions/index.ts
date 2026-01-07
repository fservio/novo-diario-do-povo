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
  errorHandler 
} from '../packages/core/middleware'
import { bootstrapAdmin } from '../packages/core/auth'

// ============================================================================
// Initialize App
// ============================================================================

const app = new Hono<{ Bindings: Env; Variables: AppContext }>()

// ============================================================================
// Bootstrap Admin (PRIMEIRO - Idempotente)
// ============================================================================

const BOOTSTRAP_FLAG = 'bootstrap:done'
let bootstrapExecuted = false // In-memory cache

app.use('*', async (c, next) => {
  // Check in-memory first (fastest)
  if (bootstrapExecuted) {
    await next()
    return
  }

  try {
    // Check KV flag (persistent)
    const flagValue = await c.env.CACHE.get(BOOTSTRAP_FLAG)
    
    if (flagValue === 'true') {
      bootstrapExecuted = true
      await next()
      return
    }

    // Execute bootstrap only once
    console.log('Executing admin bootstrap...')
    await bootstrapAdmin(c.env)
    
    // Set flags
    await c.env.CACHE.put(BOOTSTRAP_FLAG, 'true', { expirationTtl: 3600 * 24 * 365 })
    bootstrapExecuted = true
    
    console.log('✅ Admin bootstrap completed')
  } catch (error) {
    console.error('❌ Bootstrap error:', error)
    // Don't block requests on bootstrap failure
  }
  
  await next()
})

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
app.use('/static/*', serveStatic({ root: './public', manifest: '_worker.js' } as any))

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

app.get('/sitemap-news.xml', async (c) => {
  const { generateNewsSitemap } = await import('../packages/core/seo')
  const xml = await generateNewsSitemap(c.env, c.env.PUBLIC_BASE_URL)
  return c.text(xml, 200, { 'Content-Type': 'application/xml' })
})

// ============================================================================
// RSS Feeds
// ============================================================================

app.get('/rss.xml', async (c) => {
  const { generateRssFeed } = await import('../packages/core/seo')
  const xml = await generateRssFeed(c.env, c.env.PUBLIC_BASE_URL)
  return c.text(xml, 200, { 'Content-Type': 'application/rss+xml' })
})

app.get('/rss/:section.xml', async (c) => {
  const section = c.req.param('section')
  const { generateRssFeed } = await import('../packages/core/seo')
  const xml = await generateRssFeed(c.env, c.env.PUBLIC_BASE_URL, section)
  return c.text(xml, 200, { 'Content-Type': 'application/rss+xml' })
})

// ============================================================================
// Admin Routes (Protected)
// ============================================================================

// Apply admin middleware to all /admin routes
app.use('/admin/*', async (c, next) => {
  const { requireAdmin } = await import('../packages/core/middleware')
  return requireAdmin(c, next)
})

app.use('/api/admin/*', async (c, next) => {
  const { requireAdmin } = await import('../packages/core/middleware')
  return requireAdmin(c, next)
})

// GET /admin/login (public)
app.get('/admin/login', async (c) => {
  const { renderLoginPage } = await import('../packages/core/admin/ui')
  const error = c.req.query('error')
  return c.html(renderLoginPage(error))
})

// POST /admin/login
app.post('/admin/login', async (c) => {
  const { renderLoginPage } = await import('../packages/core/admin/ui')
  const { signJWT } = await import('../packages/core/auth')
  const { z } = await import('zod')

  const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6)
  })

  try {
    const formData = await c.req.parseBody()
    const { email, password } = loginSchema.parse(formData)

    // Authenticate
    const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1 LIMIT 1')
      .bind(email)
      .first<any>()

    if (!user) {
      return c.html(renderLoginPage('Credenciais inválidas'), 401)
    }

    // Verify password (bcrypt)
    const bcrypt = await import('bcryptjs')
    const isValid = await bcrypt.compare(password, user.password_hash)

    if (!isValid) {
      return c.html(renderLoginPage('Credenciais inválidas'), 401)
    }

    // Generate JWT
    const token = await signJWT(
      {
        sub: user.id.toString(),
        email: user.email,
        role: user.role,
        type: 'admin'
      },
      c.env.JWT_SECRET,
      7 * 24 * 60 * 60 // 7 days
    )

    // Set cookie
    c.header(
      'Set-Cookie',
      `admin_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`
    )

    return c.redirect('/admin', 302)
  } catch (error) {
    console.error('Login error:', error)
    return c.html(renderLoginPage('Erro ao fazer login'), 500)
  }
})

// POST /admin/logout
app.post('/admin/logout', async (c) => {
  c.header('Set-Cookie', 'admin_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0')
  return c.redirect('/admin/login', 302)
})

// GET /admin (Dashboard)
app.get('/admin', async (c) => {
  const { renderAdminLayout } = await import('../packages/core/admin/ui')
  const { getSetting } = await import('../packages/core/db')
  const user = c.get('adminUser')

  // Get stats
  const postsCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM posts WHERE status = ?')
    .bind('published')
    .first<{ count: number }>()

  const plansCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM plans WHERE is_active = 1')
    .first<{ count: number }>()

  const adsCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM ads_slots WHERE is_active = 1')
    .first<{ count: number }>()

  const asaasConfigured = await getSetting(c.env, 'asaas.api_key', 'private')

  const bodyHtml = `
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="bg-white p-6 rounded-lg shadow">
        <div class="text-gray-500 text-sm">Posts Publicados</div>
        <div class="text-3xl font-bold mt-2">${postsCount?.count || 0}</div>
      </div>

      <div class="bg-white p-6 rounded-lg shadow">
        <div class="text-gray-500 text-sm">Planos Ativos</div>
        <div class="text-3xl font-bold mt-2">${plansCount?.count || 0}</div>
      </div>

      <div class="bg-white p-6 rounded-lg shadow">
        <div class="text-gray-500 text-sm">Slots de Ads Ativos</div>
        <div class="text-3xl font-bold mt-2">${adsCount?.count || 0}</div>
      </div>

      <div class="bg-white p-6 rounded-lg shadow">
        <div class="text-gray-500 text-sm">Asaas</div>
        <div class="text-lg font-semibold mt-2 ${asaasConfigured ? 'text-green-600' : 'text-red-600'}">
          ${asaasConfigured ? '✓ Configurado' : '✗ Não configurado'}
        </div>
      </div>
    </div>

    <div class="mt-6">
      <h2 class="text-xl font-semibold mb-4">Ações Rápidas</h2>
      <div class="space-y-2">
        <a href="/admin/settings" class="block bg-white p-4 rounded-lg shadow hover:bg-gray-50">
          → Gerenciar Settings
        </a>
        <a href="/admin/asaas" class="block bg-white p-4 rounded-lg shadow hover:bg-gray-50">
          → Configurar Asaas
        </a>
        <a href="/admin/ads" class="block bg-white p-4 rounded-lg shadow hover:bg-gray-50">
          → Gerenciar Anúncios
        </a>
      </div>
    </div>
  `

  return c.html(renderAdminLayout({
    title: 'Dashboard',
    user,
    bodyHtml,
    activeTab: 'dashboard'
  }))
})

// GET /admin/settings
app.get('/admin/settings', async (c) => {
  const { renderSettingsListPage } = await import('../packages/core/admin/settings')
  return renderSettingsListPage(c)
})

// GET /admin/settings/:scope/:key
app.get('/admin/settings/:scope/:key', async (c) => {
  const { renderSettingEditPage } = await import('../packages/core/admin/settings')
  const scope = c.req.param('scope') as 'public' | 'private'
  const key = c.req.param('key')
  const error = c.req.query('error')
  return renderSettingEditPage(c, scope, key, error)
})

// POST /admin/settings/:scope/:key
app.post('/admin/settings/:scope/:key', async (c) => {
  const { handleSettingUpdate } = await import('../packages/core/admin/settings')
  const scope = c.req.param('scope') as 'public' | 'private'
  const key = c.req.param('key')
  return handleSettingUpdate(c, scope, key)
})

// GET /admin/asaas
app.get('/admin/asaas', async (c) => {
  const { renderAsaasPage } = await import('../packages/core/admin/asaas')
  const error = c.req.query('error')
  return renderAsaasPage(c, error)
})

// POST /admin/asaas
app.post('/admin/asaas', async (c) => {
  const { handleAsaasSave } = await import('../packages/core/admin/asaas')
  return handleAsaasSave(c)
})

// GET /admin/ads
app.get('/admin/ads', async (c) => {
  const { renderAdsListPage } = await import('../packages/core/admin/ads')
  return renderAdsListPage(c)
})

// GET /admin/ads/slots/new
app.get('/admin/ads/slots/new', async (c) => {
  const { renderAdSlotForm } = await import('../packages/core/admin/ads')
  const error = c.req.query('error')
  return renderAdSlotForm(c, undefined, error)
})

// POST /admin/ads/slots
app.post('/admin/ads/slots', async (c) => {
  const { handleAdSlotSave } = await import('../packages/core/admin/ads')
  return handleAdSlotSave(c)
})

// GET /admin/ads/slots/:id
app.get('/admin/ads/slots/:id', async (c) => {
  const { renderAdSlotForm } = await import('../packages/core/admin/ads')
  const id = parseInt(c.req.param('id'))
  const error = c.req.query('error')
  return renderAdSlotForm(c, id, error)
})

// POST /admin/ads/slots/:id
app.post('/admin/ads/slots/:id', async (c) => {
  const { handleAdSlotSave } = await import('../packages/core/admin/ads')
  const id = parseInt(c.req.param('id'))
  return handleAdSlotSave(c, id)
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

app.get('/categoria/:slug', async (c) => {
  const slug = c.req.param('slug')
  const { findCategoryBySlug, findPublishedPosts, getSetting } = await import('../packages/core/db')
  
  const category = await findCategoryBySlug(c.env, slug)
  if (!category) {
    return c.notFound()
  }
  
  const posts = await findPublishedPosts(c.env, { categoryId: category.id, limit: 30 })
  const siteName = await getSetting(c.env, 'site_name', 'public') || 'Jornal'
  
  return c.html(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${category.name} | ${siteName}</title>
        <meta name="description" content="${category.description || `Notícias de ${category.name}`}">
        <link href="/static/styles.css" rel="stylesheet">
    </head>
    <body class="bg-gray-50">
        <header class="bg-white border-b">
            <div class="container mx-auto px-4 py-4">
                <a href="/" class="text-2xl font-bold text-gray-900">${siteName}</a>
            </div>
        </header>
        
        <main class="container mx-auto px-4 py-8">
            <h1 class="text-4xl font-bold mb-8">${category.name}</h1>
            
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
    </body>
    </html>
  `)
})

app.get('/tag/:slug', async (c) => {
  const slug = c.req.param('slug')
  const { findTagBySlug, getSetting } = await import('../packages/core/db')
  
  const tag = await findTagBySlug(c.env, slug)
  if (!tag) {
    return c.notFound()
  }
  
  // Get posts by tag
  const posts = await c.env.DB.prepare(`
    SELECT p.* FROM posts p
    INNER JOIN post_tags pt ON pt.post_id = p.id
    WHERE pt.tag_id = ? AND p.status = 'published'
    ORDER BY p.published_at DESC
    LIMIT 30
  `).bind(tag.id).all()
  
  const siteName = await getSetting(c.env, 'site_name', 'public') || 'Jornal'
  
  return c.html(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${tag.name} | ${siteName}</title>
        <meta name="description" content="${tag.description || `Notícias sobre ${tag.name}`}">
        ${tag.seo_noindex ? '<meta name="robots" content="noindex, follow">' : ''}
        <link href="/static/styles.css" rel="stylesheet">
    </head>
    <body class="bg-gray-50">
        <header class="bg-white border-b">
            <div class="container mx-auto px-4 py-4">
                <a href="/" class="text-2xl font-bold text-gray-900">${siteName}</a>
            </div>
        </header>
        
        <main class="container mx-auto px-4 py-8">
            <h1 class="text-4xl font-bold mb-8">${tag.name}</h1>
            
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                ${(posts.results || []).map((post: any) => `
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
    </body>
    </html>
  `)
})

app.get('/autor/:slug', async (c) => {
  const slug = c.req.param('slug')
  const { findAuthorBySlug, findPublishedPosts, getSetting } = await import('../packages/core/db')
  
  const author = await findAuthorBySlug(c.env, slug)
  if (!author) {
    return c.notFound()
  }
  
  const posts = await findPublishedPosts(c.env, { authorId: author.id, limit: 30 })
  const siteName = await getSetting(c.env, 'site_name', 'public') || 'Jornal'
  
  return c.html(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${author.name} | ${siteName}</title>
        <meta name="description" content="${author.bio || `Artigos de ${author.name}`}">
        <link href="/static/styles.css" rel="stylesheet">
    </head>
    <body class="bg-gray-50">
        <header class="bg-white border-b">
            <div class="container mx-auto px-4 py-4">
                <a href="/" class="text-2xl font-bold text-gray-900">${siteName}</a>
            </div>
        </header>
        
        <main class="container mx-auto px-4 py-8 max-w-4xl">
            <div class="mb-8">
                <h1 class="text-4xl font-bold mb-4">${author.name}</h1>
                ${author.bio ? `<p class="text-xl text-gray-700">${author.bio}</p>` : ''}
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
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
    </body>
    </html>
  `)
})

app.get('/noticia/:slug', async (c) => {
  const slug = c.req.param('slug')
  const { findPostWithRelations, getSetting } = await import('../packages/core/db')
  const { checkPostAccess } = await import('../packages/core/paywall')
  const { getReaderContext } = await import('../packages/core/paywall/helpers')
  const { createSafeSnippet, escapeHtml } = await import('../packages/core/paywall/snippet')
  const { generateArticleJsonLd, generateBreadcrumbJsonLd } = await import('../packages/core/seo')
  
  const postData = await findPostWithRelations(c.env, slug)
  
  if (!postData || postData.status !== 'published') {
    return c.notFound()
  }
  
  // Get reader context (with cookie)
  const readerContext = await getReaderContext(c as any)
  
  // Check access
  const accessCheck = await checkPostAccess(c.env, postData, {
    isSubscriber: readerContext.isSubscriber,
    readerUserId: readerContext.readerId,
    anonIdentifier: readerContext.anonIdentifier,
  })
  
  const siteName = await getSetting(c.env, 'site_name', 'public') || 'Jornal'
  
  // Prepare content
  let contentHtml = postData.content
  if (!accessCheck.allowed) {
    const ratio = accessCheck.lockRatio || 0.22
    contentHtml = createSafeSnippet(postData.content, ratio)
  }
  
  // JSON-LD
  const articleJsonLd = generateArticleJsonLd(postData, c.env.PUBLIC_BASE_URL, siteName)
  const breadcrumbJsonLd = generateBreadcrumbJsonLd([
    { name: 'Home', url: c.env.PUBLIC_BASE_URL },
    { name: postData.category?.name || 'Notícias', url: `${c.env.PUBLIC_BASE_URL}/categoria/${postData.category?.slug}` },
    { name: postData.title, url: `${c.env.PUBLIC_BASE_URL}/noticia/${postData.slug}` },
  ], c.env.PUBLIC_BASE_URL)
  
  return c.html(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${postData.seo_title || postData.title} | ${siteName}</title>
        <meta name="description" content="${postData.seo_description || postData.excerpt || ''}">
        <link rel="canonical" href="${postData.seo_canonical || `${c.env.PUBLIC_BASE_URL}/noticia/${postData.slug}`}">
        <meta property="og:title" content="${escapeHtml(postData.title)}">
        <meta property="og:description" content="${escapeHtml(postData.excerpt || '')}">
        <meta property="og:url" content="${c.env.PUBLIC_BASE_URL}/noticia/${postData.slug}">
        <meta property="og:type" content="article">
        <meta name="twitter:card" content="summary_large_image">
        <link href="/static/styles.css" rel="stylesheet">
        <script type="application/ld+json">${articleJsonLd}</script>
        <script type="application/ld+json">${breadcrumbJsonLd}</script>
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
                    <a href="/categoria/${postData.category?.slug}" class="text-blue-600 font-semibold hover:text-blue-700">
                        ${postData.category?.name || ''}
                    </a>
                </div>
                
                <h1 class="text-4xl font-bold mb-4">${postData.title}</h1>
                
                <div class="text-gray-600 mb-6">
                    <span>Por <a href="/autor/${postData.author?.slug}" class="hover:text-blue-600">${postData.author?.name || 'Redação'}</a></span>
                    <span class="mx-2">•</span>
                    <time>${new Date(postData.published_at || '').toLocaleDateString('pt-BR')}</time>
                </div>
                
                ${postData.excerpt ? `<p class="text-xl text-gray-700 mb-6">${postData.excerpt}</p>` : ''}
                
                <div class="prose max-w-none">
                    ${contentHtml}
                    ${!accessCheck.allowed ? `
                        <div class="paywall-box">
                            <h3 class="text-2xl font-bold mb-2">Continue lendo com acesso ilimitado</h3>
                            <p class="text-gray-700 mb-4">Assine para liberar todas as matérias e apoiar o jornalismo independente</p>
                            <a href="/assinar" class="paywall-cta">
                                Assinar agora
                            </a>
                            <div class="mt-4">
                                <a href="/conta" class="text-sm text-gray-600 hover:text-blue-600">Já sou assinante</a>
                            </div>
                        </div>
                    ` : ''}
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

app.get('/assinar', async (c) => {
  const { findActivePlans, getSetting } = await import('../packages/core/db')
  
  const plans = await findActivePlans(c.env)
  const siteName = await getSetting(c.env, 'site_name', 'public') || 'Jornal'
  
  return c.html(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Assine | ${siteName}</title>
        <meta name="description" content="Assine e tenha acesso ilimitado a todo o conteúdo">
        <link href="/static/styles.css" rel="stylesheet">
    </head>
    <body class="bg-gray-50">
        <header class="bg-white border-b">
            <div class="container mx-auto px-4 py-4">
                <a href="/" class="text-2xl font-bold text-gray-900">${siteName}</a>
            </div>
        </header>
        
        <main class="container mx-auto px-4 py-8 max-w-4xl">
            <div class="text-center mb-12">
                <h1 class="text-4xl font-bold mb-4">Assine ${siteName}</h1>
                <p class="text-xl text-gray-700">Acesso ilimitado a todas as notícias</p>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                ${plans.map(plan => {
                  const benefits = plan.benefits_json ? JSON.parse(plan.benefits_json) : []
                  const price = (plan.price_cents / 100).toFixed(2).replace('.', ',')
                  
                  return `
                    <div class="bg-white rounded-lg shadow-sm p-8 hover:shadow-md transition">
                        <h2 class="text-2xl font-bold mb-4">${plan.name}</h2>
                        <div class="mb-6">
                            <span class="text-4xl font-bold">R$ ${price}</span>
                            <span class="text-gray-600">/${plan.billing_cycle === 'monthly' ? 'mês' : 'ano'}</span>
                        </div>
                        ${plan.trial_days > 0 ? `<p class="text-sm text-blue-600 mb-4">${plan.trial_days} dias grátis</p>` : ''}
                        <ul class="mb-6">
                            ${benefits.map((benefit: string) => `
                                <li class="mb-2 text-gray-700">✓ ${benefit}</li>
                            `).join('')}
                        </ul>
                        <a href="#" class="block bg-blue-600 text-white text-center px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition">
                            Assinar ${plan.name}
                        </a>
                    </div>
                  `
                }).join('')}
            </div>
            
            <div class="mt-12 text-center text-gray-600">
                <p class="mb-4">Pagamento seguro via ASAAS</p>
                <p class="text-sm">
                    <a href="/p/termos" class="hover:text-blue-600">Termos de Uso</a> •
                    <a href="/p/privacidade" class="hover:text-blue-600">Privacidade</a>
                </p>
            </div>
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

app.get('/conta', async (c) => {
  const { getSetting } = await import('../packages/core/db')
  const siteName = await getSetting(c.env, 'site_name', 'public') || 'Jornal'
  
  // TODO: Implementar página de conta com status de assinatura
  return c.html(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Minha Conta | ${siteName}</title>
        <link href="/static/styles.css" rel="stylesheet">
    </head>
    <body class="bg-gray-50">
        <header class="bg-white border-b">
            <div class="container mx-auto px-4 py-4">
                <a href="/" class="text-2xl font-bold text-gray-900">${siteName}</a>
            </div>
        </header>
        
        <main class="container mx-auto px-4 py-8 max-w-4xl">
            <h1 class="text-4xl font-bold mb-8">Minha Conta</h1>
            
            <div class="bg-white rounded-lg shadow-sm p-8">
                <h2 class="text-2xl font-bold mb-4">Status da Assinatura</h2>
                <p class="text-gray-700 mb-6">Funcionalidade em desenvolvimento. Em breve você poderá gerenciar sua assinatura aqui.</p>
                <a href="/assinar" class="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700">
                    Assinar Agora
                </a>
            </div>
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
  const { getSetting } = await import('../packages/core/db')
  const { asaasWebhookSchema, handleAsaasWebhook } = await import('../packages/core/integrations/asaas')
  
  // Rate limiting
  const limiter = rateLimiter('webhook')
  await limiter(c as any, async () => {})
  
  try {
    // Authenticate webhook via settings
    const webhookToken = await getSetting(c.env, 'asaas.webhook_token', 'private')
    const providedToken = c.req.header('x-asaas-token')
    
    if (!webhookToken || providedToken !== webhookToken) {
      return c.json({ success: false, error: 'Unauthorized' }, 401)
    }
    
    const rawBody = await c.req.text()
    const body = JSON.parse(rawBody)
    
    // Validate with Zod
    const validation = asaasWebhookSchema.safeParse(body)
    if (!validation.success) {
      console.error('Webhook validation error:', validation.error)
      return c.json({ success: false, error: 'Invalid webhook payload' }, 400)
    }
    
    const event = validation.data
    const requestId = c.get('requestId') || 'unknown'
    
    // Compute payload hash (SHA-256) - more robust idempotency
    const encoder = new TextEncoder()
    const data = encoder.encode(rawBody)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const payloadHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    
    // Idempotency check by hash
    const eventId = payloadHash
    
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
      payloadHash,
      rawBody
    ).run()
    
    // Process
    await handleAsaasWebhook(c.env, event, requestId)
    
    // Mark as processed
    await c.env.DB.prepare(
      'UPDATE webhook_events SET status = ?, processed_at = datetime(\'now\') WHERE provider = ? AND event_id = ?'
    ).bind('processed', 'asaas', eventId).run()
    
    return c.json({ success: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return c.json({ success: false, error: (error as Error).message }, 400)
  }
})

// ============================================================================
// Error Handler
// ============================================================================

app.onError(errorHandler)

// ============================================================================
// 404 Handler (JSON para /api/*, HTML para resto)
// ============================================================================

app.notFound((c) => {
  const path = new URL(c.req.url).pathname
  
  if (path.startsWith('/api/')) {
    return c.json({ success: false, error: 'Endpoint não encontrado' }, 404)
  }
  
  // HTML 404
  return c.html(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Página não encontrada</title>
        <link href="/static/styles.css" rel="stylesheet">
    </head>
    <body class="bg-gray-50">
        <div class="container mx-auto px-4 py-8 text-center">
            <h1 class="text-6xl font-bold text-gray-900 mb-4">404</h1>
            <p class="text-xl text-gray-700 mb-8">Página não encontrada</p>
            <a href="/" class="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700">
                Voltar para Home
            </a>
        </div>
    </body>
    </html>
  `, 404)
})

// ============================================================================
// 13. R2 Image Serving
// ============================================================================

app.get('/i/:key{.+}', async (c) => {
  try {
    const key = c.req.param('key')
    const { getMediaFromR2 } = await import('../packages/core/storage')
    
    const object = await getMediaFromR2(c.env, key)
    
    if (!object) {
      return c.notFound()
    }
    
    const headers = new Headers()
    headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream')
    headers.set('Cache-Control', 'public, max-age=31536000, immutable')
    headers.set('ETag', object.httpEtag || '')
    
    // Check If-None-Match for 304
    const ifNoneMatch = c.req.header('If-None-Match')
    if (ifNoneMatch && ifNoneMatch === object.httpEtag) {
      return c.body(null, 304, Object.fromEntries(headers))
    }
    
    return new Response(object.body, {
      headers,
      status: 200
    })
  } catch (error) {
    console.error('Image serving error:', error)
    return c.notFound()
  }
})

// ============================================================================
// 14. 404 Handler
// ============================================================================

export default app
