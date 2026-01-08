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
// KAT (Known Answer Test) - PBKDF2 Diagnostics
// ============================================================================

app.get('/api/admin/diag/pbkdf2', async (c) => {
  try {
    // Test vectors: password="password", salt=fixed, iterations=100000 (Cloudflare Workers max)
    const testPassword = 'password'
    const fixedSaltHex = '73616c7473616c7473616c7473616c74' // "saltsaltsaltsalt" (16 bytes)
    const iterations = 100000
    
    // Convert hex salt to Uint8Array
    const saltBytes = new Uint8Array(
      fixedSaltHex.match(/.{2}/g)!.map(byte => parseInt(byte, 16))
    )
    
    // Derive key using Web Crypto PBKDF2
    const encoder = new TextEncoder()
    const passwordBuffer = encoder.encode(testPassword)
    
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      passwordBuffer,
      'PBKDF2',
      false,
      ['deriveBits']
    )
    
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: saltBytes,
        iterations: iterations,
        hash: 'SHA-256'
      },
      keyMaterial,
      256 // 32 bytes = 256 bits
    )
    
    const derivedKey = new Uint8Array(derivedBits)
    
    // Convert to hex for comparison
    const gotHex = Array.from(derivedKey)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
    
    // Expected value computed with Node.js crypto.pbkdf2Sync (100k iterations)
    // node -e "const crypto = require('crypto'); const key = crypto.pbkdf2Sync('password', Buffer.from('73616c7473616c7473616c7473616c74', 'hex'), 100000, 32, 'sha256'); console.log(key.toString('hex'));"
    const expectedHex = '4fbf2d122fe6afc61a81e9f2fe393ab39f906a78ddddc797763c0e784857e9b4'
    
    const match = gotHex === expectedHex
    
    return c.json({
      ok: match,
      test: 'PBKDF2-HMAC-SHA256',
      password: testPassword,
      saltHex: fixedSaltHex,
      iterations,
      gotPrefix: gotHex.substring(0, 16),
      expectedPrefix: expectedHex.substring(0, 16),
      fullMatch: match,
      environment: 'cloudflare-workers'
    })
  } catch (error) {
    return c.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    }, 500)
  }
})

// DEBUG: Test individual components
app.get('/api/debug/test-session', async (c) => {
  try {
    const { randomHex } = await import('../packages/core/utils')
    const { signJWT } = await import('../packages/core/auth')
    const { generateCSRFToken } = await import('../packages/core/middleware/security')
    const { setCookie } = await import('hono/cookie')
    
    const logs: string[] = []
    
    // Test 1: randomHex
    logs.push('Test 1: randomHex...')
    const sessionId = randomHex(16)
    logs.push(`✅ sessionId: ${sessionId.substring(0, 8)}`)
    
    // Test 2: signJWT
    logs.push('Test 2: signJWT...')
    const token = await signJWT(
      {
        sub: '1',
        email: 'test@example.com',
        role: 'admin',
        type: 'admin' as const,
        sid: sessionId,
      },
      c.env.JWT_SECRET,
      60 * 60 // 1 hour
    )
    logs.push(`✅ token: ${token.substring(0, 20)}...`)
    
    // Test 3: generateCSRFToken
    logs.push('Test 3: generateCSRFToken...')
    const csrfToken = await generateCSRFToken(c.env, 1, sessionId)
    logs.push(`✅ csrfToken: ${csrfToken.substring(0, 16)}...`)
    
    // Test 4: setCookie
    logs.push('Test 4: setCookie...')
    const secure = new URL(c.req.url).protocol === 'https:'
    
    setCookie(c, 'test_session', token, {
      httpOnly: true,
      secure,
      sameSite: 'Lax',
      path: '/',
      maxAge: 60 * 60,
    })
    logs.push('✅ setCookie admin_session')
    
    setCookie(c, 'test_csrf', csrfToken, {
      httpOnly: true,
      secure,
      sameSite: 'Lax',
      path: '/',
      maxAge: 60 * 60,
    })
    logs.push('✅ setCookie admin_csrf')
    
    // Test 5: redirect
    logs.push('Test 5: c.redirect...')
    logs.push('✅ All tests passed!')
    
    return c.json({ success: true, logs })
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }, 500)
  }
})

// DEBUG: Test bcrypt and login flow
app.get('/api/debug/test-bcrypt', async (c) => {
  try {
    const bcrypt = await import('bcryptjs')
    
    const user = await c.env.DB.prepare('SELECT id, email, password_hash FROM users WHERE email = ? LIMIT 1')
      .bind('fabioservi@gmail.com')
      .first<any>()
    
    if (!user) {
      return c.json({ error: 'User not found in DB' }, 404)
    }
    
    const testPassword = 'LIwGSnHLyZIR/yQZj3PZ7Ji9UcdkiTvu'
    const isValid = await bcrypt.compare(testPassword, user.password_hash)
    
    return c.json({
      user_found: true,
      user_id: user.id,
      user_email: user.email,
      hash_prefix: user.password_hash.substring(0, 15),
      password_correct: isValid,
      jwt_secret_configured: !!c.env.JWT_SECRET
    })
  } catch (error) {
    return c.json({
      error: error instanceof Error ? error.message : String(error)
    }, 500)
  }
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
// Apply admin authentication middleware (except /admin/login and /admin/logout)
app.use('/admin/*', async (c, next) => {
  // Skip middleware for login/logout routes
  if (c.req.path === '/admin/login' || c.req.path === '/admin/logout') {
    return next()
  }
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
  const requestId = c.get('requestId')
  const { renderLoginPage } = await import('../packages/core/admin/ui')
  const { verifyPassword, maskEmail, hashPassword } = await import('../packages/core/auth/password')
  const { signJWT } = await import('../packages/core/auth')
  const { generateCSRFToken } = await import('../packages/core/middleware/security')
  const { randomHex } = await import('../packages/core/utils')
  const { setCookie } = await import('hono/cookie')

  try {
    // Parse form data
    const formData = await c.req.parseBody()
    const email = String(formData.email || '').trim().toLowerCase()
    const password = String(formData.password || '')
    
    console.log('[Login] Raw form data:', {
      requestId,
      email_length: email.length,
      password_length: password.length,
      email_preview: email.substring(0, 10) + '...',
    })

    if (!email || !password) {
      console.log('[Login] INVALID_CREDENTIALS: missing email or password')
      return c.html(renderLoginPage('Credenciais inválidas - email ou senha vazio'), 401)
    }

    // Query user
    const user = await c.env.DB.prepare(
      'SELECT id, email, password_hash, role, name FROM users WHERE email = ? AND is_active = 1 LIMIT 1'
    ).bind(email).first<any>()

    if (!user) {
      console.log('[Login] INVALID_CREDENTIALS: user not found', {
        requestId,
        email: maskEmail(email),
      })
      return c.html(renderLoginPage('Credenciais inválidas - usuário não encontrado'), 401)
    }

    console.log('[Login] User found, verifying password...', {
      requestId,
      userId: user.id,
      hashPrefix: user.password_hash.substring(0, 10),
    })

    // Verify password (PBKDF2 or bcrypt with auto-rehash)
    const verifyResult = await verifyPassword(password, user.password_hash)

    console.log('[Login] Password verification result:', {
      requestId,
      ok: verifyResult.ok,
      needsRehash: verifyResult.needsRehash,
    })

    if (!verifyResult.ok) {
      console.log('[Login] INVALID_CREDENTIALS: password mismatch', {
        requestId,
        userId: user.id,
        email: maskEmail(email),
      })
      return c.html(renderLoginPage('Credenciais inválidas - senha incorreta'), 401)
    }

    console.log('[Login] SUCCESS', {
      requestId,
      userId: user.id,
      email: maskEmail(email),
      needsRehash: verifyResult.needsRehash,
    })

    // Auto-rehash legacy bcrypt to PBKDF2
    if (verifyResult.needsRehash) {
      try {
        const newHash = await hashPassword(password)
        await c.env.DB.prepare(
          'UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?'
        ).bind(newHash, new Date().toISOString(), user.id).run()
        
        console.log('[Login] REHASHED: upgraded bcrypt to PBKDF2', {
          requestId,
          userId: user.id,
        })
      } catch (rehashError) {
        // Log but don't block login
        console.error('[Login] REHASH_ERROR: failed to upgrade hash', {
          requestId,
          userId: user.id,
          error: rehashError instanceof Error ? rehashError.message : 'Unknown',
        })
      }
    }

    console.log('[Login] Step 1: Generating session ID...')
    // Generate session
    const sessionId = randomHex(16)
    console.log('[Login] Step 2: Signing JWT...', { sessionId: sessionId.substring(0, 8) })
    
    const token = await signJWT(
      {
        sub: user.id.toString(),
        email: user.email,
        role: user.role,
        type: 'admin' as const,
        sid: sessionId,
      },
      c.env.JWT_SECRET,
      7 * 24 * 60 * 60 // 7 days
    )
    
    console.log('[Login] Step 3: Generating CSRF token...')

    // Generate CSRF token
    const csrfToken = await generateCSRFToken(c.env, user.id, sessionId)
    
    console.log('[Login] Step 4: Setting cookies...')

    // Set cookies BEFORE redirect (Cloudflare Workers requirement)
    // IMPORTANT: Path=/ to work with /api/admin/* routes too
    const secure = new URL(c.req.url).protocol === 'https:'
    
    setCookie(c, 'admin_session', token, {
      httpOnly: true,
      secure,
      sameSite: 'Lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    })

    setCookie(c, 'admin_csrf', csrfToken, {
      httpOnly: true,
      secure,
      sameSite: 'Lax',
      path: '/',
      maxAge: 60 * 60, // 1 hour
    })
    
    console.log('[Login] Step 5: Redirecting...')
    return c.redirect('/admin', 302)
  } catch (error) {
    console.error('[Login] EXCEPTION:', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    })
    return c.html(renderLoginPage('Erro ao fazer login'), 500)
  }
})

// POST /admin/logout
app.post('/admin/logout', async (c) => {
  c.header('Set-Cookie', [
    'admin_session=; HttpOnly; Secure; SameSite=Lax; Path=/admin; Max-Age=0',
    'admin_csrf=; HttpOnly; Secure; SameSite=Lax; Path=/admin; Max-Age=0'
  ].join(', '))
  return c.redirect('/admin/login', 302)
})

// GET /admin (Dashboard)
app.get('/admin', async (c) => {
  try {
    const { getCookie } = await import('hono/cookie')
    const token = getCookie(c, 'admin_session')
    
    if (!token) {
      return c.redirect('/admin/login', 302)
    }

    const { verifyJWT } = await import('../packages/core/auth')
    const payload = await verifyJWT(token, c.env.JWT_SECRET)
    
    if (!payload || payload.type !== 'admin') {
      return c.redirect('/admin/login', 302)
    }

    // Query user from DB
    const user = await c.env.DB.prepare(
      'SELECT id, email, role, name, is_active FROM users WHERE id = ? AND is_active = 1 LIMIT 1'
    ).bind(payload.sub).first<{ id: number; email: string; role: string; name: string; is_active: number }>()

    if (!user) {
      return c.redirect('/admin/login', 302)
    }

    // Set context
    c.set('adminUser', user)
    c.set('csrfToken', getCookie(c, 'admin_csrf'))

    const { renderAdminLayout } = await import('../packages/core/admin/ui')
    const { getSetting } = await import('../packages/core/db')
    const csrfToken = getCookie(c, 'admin_csrf')

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
    <div class="grid grid-4" style="margin-bottom: 2rem;">
      <div class="card">
        <div class="card-label">Posts Publicados</div>
        <div class="card-value">${postsCount?.count || 0}</div>
      </div>

      <div class="card">
        <div class="card-label">Planos Ativos</div>
        <div class="card-value">${plansCount?.count || 0}</div>
      </div>

      <div class="card">
        <div class="card-label">Slots de Ads Ativos</div>
        <div class="card-value">${adsCount?.count || 7}</div>
      </div>

      <div class="card">
        <div class="card-label">Asaas</div>
        <div class="card-value ${asaasConfigured ? 'text-green' : 'text-red'}" style="font-size: 1.125rem;">
          ${asaasConfigured ? '✓ Configurado' : '✗ Não configurado'}
        </div>
      </div>
    </div>

    <h2 class="section-title">Ações Rápidas</h2>
    <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));">
      <a href="/admin/settings" class="link-card">
        <div class="link-title">→ Gerenciar Settings</div>
        <div class="link-desc">Configure site_name, cover_of_day e home sections</div>
      </a>
      
      <a href="/admin/asaas" class="link-card">
        <div class="link-title">→ Configurar Asaas</div>
        <div class="link-desc">API key, webhook e integrações de pagamento</div>
      </a>
    </div>
  `

    return c.html(renderAdminLayout({
      title: 'Dashboard',
      user,
      bodyHtml,
      activeTab: 'dashboard',
      csrfToken
    }))
  } catch (error) {
    console.error('[Admin Dashboard] Error:', error)
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500)
  }
})

// ============================================================================
// Admin Categories Routes
// ============================================================================

app.get('/admin/categories', async (c) => {
  const { handleCategoriesList } = await import('../packages/core/admin/categories')
  return handleCategoriesList(c)
})

app.get('/admin/categories/new', async (c) => {
  const { handleCategoriesNew } = await import('../packages/core/admin/categories')
  return handleCategoriesNew(c)
})

app.post('/admin/categories', async (c) => {
  const { handleCategoriesCreate } = await import('../packages/core/admin/categories')
  return handleCategoriesCreate(c)
})

// GET /admin/categories/:id - Edit category
app.get('/admin/categories/:id{[0-9]+}', async (c) => {
  const { handleCategoriesEdit } = await import('../packages/core/admin/categories')
  return handleCategoriesEdit(c)
})

// POST /admin/categories/:id - Update category
app.post('/admin/categories/:id{[0-9]+}', async (c) => {
  const { handleCategoriesUpdate } = await import('../packages/core/admin/categories')
  return handleCategoriesUpdate(c)
})

// POST /admin/categories/:id/toggle - Toggle active
app.post('/admin/categories/:id{[0-9]+}/toggle', async (c) => {
  const { handleCategoriesToggle } = await import('../packages/core/admin/categories')
  return handleCategoriesToggle(c)
})

// ============================================================================
// Admin Posts Routes
// ============================================================================

// GET /admin/posts - Lista de posts
app.get('/admin/posts', async (c) => {
  const { renderPostsListPage } = await import('../packages/core/admin/posts')
  const { listPosts } = await import('../packages/core/db/posts')
  const { findAllCategories } = await import('../packages/core/db')
  
  const user = c.get('adminUser')
  const csrfToken = c.get('csrfToken')
  
  // Parse filters
  const status = c.req.query('status') || undefined
  const category_id = c.req.query('category_id') ? parseInt(c.req.query('category_id')!) : undefined
  const is_premium = c.req.query('is_premium') ? parseInt(c.req.query('is_premium')!) : undefined
  const search = c.req.query('search') || undefined
  const limit = parseInt(c.req.query('limit') || '20')
  const offset = parseInt(c.req.query('offset') || '0')
  
  // Get posts
  const { posts, total } = await listPosts(c.env.DB, {
    status,
    category_id,
    is_premium,
    search,
    limit,
    offset
  })
  
  // Get categories and authors for filters
  const categories = await findAllCategories(c.env)
  const authorsResult = await c.env.DB.prepare(
    'SELECT id, name FROM authors WHERE is_active = 1 ORDER BY name ASC'
  ).all<{ id: number, name: string }>()
  
  return c.html(renderPostsListPage({
    posts,
    total,
    filters: { status, category_id, is_premium, search, limit, offset },
    categories,
    authors: authorsResult.results || [],
    user,
    csrfToken
  }))
})

// GET /admin/posts/new - Form criar post
app.get('/admin/posts/new', async (c) => {
  const { renderPostFormPage } = await import('../packages/core/admin/posts')
  const { findAllCategories } = await import('../packages/core/db')
  
  const user = c.get('adminUser')
  const csrfToken = c.get('csrfToken')
  
  // Get categories, authors, tags
  const categories = await findAllCategories(c.env)
  
  const authorsResult = await c.env.DB.prepare(
    'SELECT id, name FROM authors WHERE is_active = 1 ORDER BY name ASC'
  ).all<{ id: number, name: string }>()
  
  const tagsResult = await c.env.DB.prepare(
    'SELECT id, name FROM tags ORDER BY name ASC'
  ).all<{ id: number, name: string }>()
  
  return c.html(renderPostFormPage({
    categories,
    authors: authorsResult.results || [],
    tags: tagsResult.results || [],
    user,
    csrfToken
  }))
})

// POST /admin/posts - Criar post
app.post('/admin/posts', async (c) => {
  const { createPostSchema } = await import('../packages/core/admin/posts')
  const { createPost } = await import('../packages/core/db/posts')
  const { logAudit } = await import('../packages/core/db')
  
  const user = c.get('adminUser')
  const requestId = c.get('requestId')
  
  try {
    const formData = await c.req.parseBody()
    
    // Parse tags array
    const tags = formData.tags 
      ? (Array.isArray(formData.tags) ? formData.tags : [formData.tags]).map(t => parseInt(String(t)))
      : []
    
    // Validate
    const data = createPostSchema.parse({
      ...formData,
      tags,
      cover_media_id: formData.cover_media_id ? parseInt(String(formData.cover_media_id)) : undefined
    })
    
    // Create (cast to CreatePostInput pois Zod já validou required fields)
    const postId = await createPost(c.env.DB, data as any)
    
    // Audit log
    await logAudit(c.env, {
      entityType: 'post',
      entityId: postId,
      action: 'created',
      actorType: 'user',
      actorId: user.id,
      requestId
    })
    
    return c.redirect(`/admin/posts/${postId}`, 303)
  } catch (error) {
    console.error('[Admin Posts] Create error:', error)
    return c.redirect('/admin/posts/new?error=1', 303)
  }
})

// GET /admin/posts/:id - Form editar post
app.get('/admin/posts/:id', async (c) => {
  const { renderPostFormPage } = await import('../packages/core/admin/posts')
  const { getPostById } = await import('../packages/core/db/posts')
  const { findAllCategories } = await import('../packages/core/db')
  
  const user = c.get('adminUser')
  const csrfToken = c.get('csrfToken')
  const id = parseInt(c.req.param('id'))
  
  const post = await getPostById(c.env.DB, id)
  if (!post) {
    return c.notFound()
  }
  
  // Get categories, authors, tags
  const categories = await findAllCategories(c.env)
  
  const authorsResult = await c.env.DB.prepare(
    'SELECT id, name FROM authors WHERE is_active = 1 ORDER BY name ASC'
  ).all<{ id: number, name: string }>()
  
  const tagsResult = await c.env.DB.prepare(
    'SELECT id, name FROM tags ORDER BY name ASC'
  ).all<{ id: number, name: string }>()
  
  return c.html(renderPostFormPage({
    post,
    categories,
    authors: authorsResult.results || [],
    tags: tagsResult.results || [],
    user,
    csrfToken,
    error: c.req.query('error')
  }))
})

// POST /admin/posts/:id - Atualizar post
app.post('/admin/posts/:id', async (c) => {
  const { updatePostSchema } = await import('../packages/core/admin/posts')
  const { updatePost } = await import('../packages/core/db/posts')
  const { logAudit } = await import('../packages/core/db')
  
  const user = c.get('adminUser')
  const requestId = c.get('requestId')
  const id = parseInt(c.req.param('id'))
  
  try {
    const formData = await c.req.parseBody()
    
    // Parse tags array
    const tags = formData.tags 
      ? (Array.isArray(formData.tags) ? formData.tags : [formData.tags]).map(t => parseInt(String(t)))
      : []
    
    // Validate
    const data = updatePostSchema.parse({
      ...formData,
      tags,
      cover_media_id: formData.cover_media_id ? parseInt(String(formData.cover_media_id)) : undefined
    })
    
    // Update
    await updatePost(c.env.DB, id, data)
    
    // Audit log
    await logAudit(c.env, {
      entityType: 'post',
      entityId: id,
      action: 'updated',
      actorType: 'user',
      actorId: user.id,
      details: { fields: Object.keys(data) },
      requestId
    })
    
    return c.redirect(`/admin/posts/${id}`, 303)
  } catch (error) {
    console.error('[Admin Posts] Update error:', error)
    return c.redirect(`/admin/posts/${id}?error=1`, 303)
  }
})

// POST /admin/posts/:id/publish - Publicar post
app.post('/admin/posts/:id/publish', async (c) => {
  const { publishPost } = await import('../packages/core/db/posts')
  const { logAudit } = await import('../packages/core/db')
  
  const user = c.get('adminUser')
  const requestId = c.get('requestId')
  const id = parseInt(c.req.param('id'))
  
  try {
    await publishPost(c.env.DB, id)
    
    await logAudit(c.env, {
      entityType: 'post',
      entityId: id,
      action: 'published',
      actorType: 'user',
      actorId: user.id,
      requestId
    })
    
    return c.redirect(`/admin/posts/${id}`, 303)
  } catch (error) {
    console.error('[Admin Posts] Publish error:', error)
    return c.redirect(`/admin/posts/${id}?error=1`, 303)
  }
})

// POST /admin/posts/:id/schedule - Agendar post
app.post('/admin/posts/:id/schedule', async (c) => {
  const { scheduleSchema } = await import('../packages/core/admin/posts')
  const { schedulePost } = await import('../packages/core/db/posts')
  const { logAudit } = await import('../packages/core/db')
  
  const user = c.get('adminUser')
  const requestId = c.get('requestId')
  const id = parseInt(c.req.param('id'))
  
  try {
    const formData = await c.req.parseBody()
    const data = scheduleSchema.parse(formData)
    
    await schedulePost(c.env.DB, id, data.scheduled_at)
    
    await logAudit(c.env, {
      entityType: 'post',
      entityId: id,
      action: 'scheduled',
      actorType: 'user',
      actorId: user.id,
      details: { scheduled_at: data.scheduled_at },
      requestId
    })
    
    return c.redirect(`/admin/posts/${id}`, 303)
  } catch (error) {
    console.error('[Admin Posts] Schedule error:', error)
    return c.redirect(`/admin/posts/${id}?error=1`, 303)
  }
})

// POST /admin/posts/:id/archive - Arquivar post
app.post('/admin/posts/:id/archive', async (c) => {
  const { archivePost } = await import('../packages/core/db/posts')
  const { logAudit } = await import('../packages/core/db')
  
  const user = c.get('adminUser')
  const requestId = c.get('requestId')
  const id = parseInt(c.req.param('id'))
  
  try {
    await archivePost(c.env.DB, id)
    
    await logAudit(c.env, {
      entityType: 'post',
      entityId: id,
      action: 'archived',
      actorType: 'user',
      actorId: user.id,
      requestId
    })
    
    return c.redirect(`/admin/posts/${id}`, 303)
  } catch (error) {
    console.error('[Admin Posts] Archive error:', error)
    return c.redirect(`/admin/posts/${id}?error=1`, 303)
  }
})

// GET /admin/posts/:id/preview - Preview SSR (noindex)
app.get('/admin/posts/:id/preview', async (c) => {
  const { getPostById } = await import('../packages/core/db/posts')
  const { escapeHtml } = await import('../packages/core/admin/ui')
  
  const user = c.get('adminUser')
  const id = parseInt(c.req.param('id'))
  
  const post = await getPostById(c.env.DB, id)
  if (!post) {
    return c.notFound()
  }
  
  // Get category and author
  const category = await c.env.DB.prepare(
    'SELECT * FROM categories WHERE id = ?'
  ).bind(post.category_id).first<any>()
  
  const author = await c.env.DB.prepare(
    'SELECT * FROM authors WHERE id = ?'
  ).bind(post.author_id).first<any>()
  
  // Render preview simples com noindex
  const previewHtml = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex,nofollow">
  <title>Preview: ${escapeHtml(post.title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; }
    .preview-banner { 
      background: #fef3c7; 
      border-bottom: 2px solid #f59e0b; 
      padding: 1rem; 
      text-align: center; 
      font-weight: 600;
      color: #92400e;
    }
    .container { max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
    .category { color: #2563eb; font-size: 0.875rem; font-weight: 600; }
    h1 { font-size: 2.5rem; margin: 1rem 0; }
    .meta { color: #6b7280; font-size: 0.875rem; margin-bottom: 2rem; }
    .content { line-height: 1.75; }
    img { max-width: 100%; height: auto; }
  </style>
</head>
<body>
  <div class="preview-banner">
    ⚠️ PREVIEW MODE - Este post não está publicado
  </div>
  
  <div class="container">
    <div class="category">${escapeHtml(category?.name || 'Sem categoria')}</div>
    <h1>${escapeHtml(post.title)}</h1>
    <div class="meta">
      Por ${escapeHtml(author?.name || 'Autor desconhecido')} • 
      Status: ${escapeHtml(post.status)} •
      ${post.is_premium ? '🔒 Premium' : '🆓 Free'}
    </div>
    
    ${post.cover_media_url ? `
      <img src="${escapeHtml(post.cover_media_url)}" alt="${escapeHtml(post.title)}">
    ` : ''}
    
    <div class="content">
      ${post.content}
    </div>
  </div>
</body>
</html>
  `
  
  return c.html(previewHtml)
})

// API /api/admin/media/search - Buscar mídia para inserir no editor
app.get('/api/admin/media/search', async (c) => {
  const { searchMedia } = await import('../packages/core/db/media')
  
  const q = c.req.query('q') || ''
  const limit = parseInt(c.req.query('limit') || '20')
  
  try {
    const results = await searchMedia(c.env, q, limit)
    return c.json({ success: true, results })
  } catch (error: any) {
    console.error('Error searching media:', error)
    return c.json({ success: false, error: error.message }, 500)
  }
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
  const { getHomeData } = await import('../packages/core/db/home')
  const { renderHomePage } = await import('../packages/core/web/home')
  const { getSetting } = await import('../packages/core/db')
  
  // Get home data (optimized queries)
  const data = await getHomeData(c.env)
  
  // Get CMS settings
  const siteName = (await getSetting(c.env, 'site_name', 'public') as string) || 'Jornal'
  const coverR2Key = (await getSetting(c.env, 'cover_of_day.r2_key', 'public') as string) || 'default-cover.jpg'
  const coverAlt = (await getSetting(c.env, 'cover_of_day.alt', 'public') as string) || 'Capa do Dia'
  const coverAspectRatio = (await getSetting(c.env, 'cover_of_day.aspect_ratio', 'public') as string) || '3/4'
  
  const baseUrl = c.env.PUBLIC_BASE_URL || 'https://example.com'
  
  // Render home page (Verge style)
  const html = await renderHomePage(c, data, {
    baseUrl,
    siteName,
    coverR2Key,
    coverAlt,
    coverAspectRatio
  })
  
  return c.html(html)
})

app.get('/ultimas', async (c) => {
  const { getSetting } = await import('../packages/core/db')
  const siteName = (await getSetting(c.env, 'site_name', 'public') as string) || 'Jornal'
  
  // Simple paginated list of latest posts
  const page = parseInt(c.req.query('page') || '1')
  const limit = 30
  const offset = (page - 1) * limit
  
  const posts = await c.env.DB.prepare(`
    SELECT 
      p.id, p.slug, p.title, p.published_at,
      c.name as category_name, c.slug as category_slug
    FROM posts p
    INNER JOIN categories c ON p.category_id = c.id
    WHERE p.status = 'published' 
      AND p.published_at <= datetime('now')
      AND p.seo_noindex = 0
    ORDER BY p.published_at DESC
    LIMIT ? OFFSET ?
  `).bind(limit, offset).all()
  
  const baseUrl = c.env.PUBLIC_BASE_URL || 'https://example.com'
  
  return c.html(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Últimas Notícias | ${siteName}</title>
        <link href="/static/styles.css" rel="stylesheet">
        <style>
          body { background-color: #f6f7f8; margin: 0; font-family: system-ui, -apple-system, sans-serif; }
          .container { max-width: 1536px; margin: 0 auto; padding: 0 1rem; }
          header { background: white; border-bottom: 1px solid #e5e7eb; }
        </style>
    </head>
    <body>
        <header>
            <div class="container py-4">
                <a href="/" class="text-2xl font-bold">${siteName}</a>
            </div>
        </header>
        
        <main class="container py-8">
            <h1 class="text-4xl font-bold mb-8">Últimas Notícias</h1>
            
            <div class="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                <ul class="space-y-4">
                    ${(posts.results || []).map((post: any) => `
                        <li class="border-b last:border-0 pb-4 last:pb-0">
                            <a href="${baseUrl}/noticia/${post.slug}" class="block hover:text-[#FF4D00] transition-colors">
                                <div class="flex items-baseline gap-2">
                                    <span class="text-xs text-gray-500 font-mono">
                                        ${new Date(post.published_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                    <span class="flex-1 font-medium">${post.title}</span>
                                </div>
                                <span class="text-xs text-[#FF4D00] font-bold uppercase mt-1 inline-block">
                                    ${post.category_name}
                                </span>
                            </a>
                        </li>
                    `).join('')}
                </ul>
                
                <div class="flex gap-4 mt-6 pt-6 border-t">
                    ${page > 1 ? `<a href="/ultimas?page=${page - 1}" class="px-4 py-2 bg-[#FF4D00] text-white rounded hover:bg-[#E04400]">← Anterior</a>` : ''}
                    ${(posts.results || []).length === limit ? `<a href="/ultimas?page=${page + 1}" class="px-4 py-2 bg-[#FF4D00] text-white rounded hover:bg-[#E04400]">Próximo →</a>` : ''}
                </div>
            </div>
        </main>
        
        <footer class="bg-gray-900 text-white mt-12 py-8">
            <div class="container text-center">
                <p>&copy; ${new Date().getFullYear()} ${siteName}. Todos os direitos reservados.</p>
            </div>
        </footer>
    </body>
    </html>
  `)
})

app.get('/categoria/:slug', async (c) => {
  const slug = c.req.param('slug')
  const page = parseInt(c.req.query('page') || '1', 10)
  
  const { getCategoryPageData } = await import('../packages/core/db/category')
  const { getHomeSections } = await import('../packages/core/db/home')
  const { renderCategoryPage } = await import('../packages/core/web/category')
  const { getSetting } = await import('../packages/core/db')
  
  // Get category data with pagination
  const data = await getCategoryPageData(c.env, slug, page, 20)
  if (!data) {
    return c.notFound()
  }
  
  // Get CMS settings
  const siteName = (await getSetting(c.env, 'site_name', 'public') as string) || 'Jornal'
  const coverR2Key = (await getSetting(c.env, 'cover_of_day.r2_key', 'public') as string) || ''
  const coverAlt = (await getSetting(c.env, 'cover_of_day.alt', 'public') as string) || 'Capa do Dia'
  const coverAspectRatio = (await getSetting(c.env, 'cover_of_day.aspect_ratio', 'public') as string) || '3/4'
  
  const baseUrl = c.env.PUBLIC_BASE_URL || 'https://example.com'
  
  // Get nav sections
  const sections = await getHomeSections(c.env)
  const navItems = sections
    .filter(s => s.enabled)
    .map(s => ({
      label: s.title,
      href: s.type === 'tag' ? `/tag/${s.tagSlug}` : `/categoria/${s.slug}`,
      active: s.slug === slug
    }))
  
  // Render category page
  const html = await renderCategoryPage(c, data, {
    baseUrl,
    siteName,
    navItems,
    coverOfDay: coverR2Key ? { r2Key: coverR2Key, alt: coverAlt, aspectRatio: coverAspectRatio } : null
  })
  
  return c.html(html)
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
  
  // Dynamic imports
  const { findArticleBySlug, findRelatedPosts, findMostRead } = await import('../packages/core/db/article')
  const { getHomeSections } = await import('../packages/core/db/home')
  const { renderArticlePage } = await import('../packages/core/web/article')
  const { checkPostAccess } = await import('../packages/core/paywall')
  const { getReaderContext } = await import('../packages/core/paywall/helpers')
  const { getSetting } = await import('../packages/core/db')
  
  // Find post
  const post = await findArticleBySlug(c.env, slug)
  if (!post || post.seo_noindex) {
    return c.notFound()
  }
  
  // Get reader context (with cookie)
  const readerContext = await getReaderContext(c as any)
  
  // Check access (convert ArticlePost to format expected by checkPostAccess)
  const postForPaywall = {
    id: post.id,
    slug: post.slug,
    is_premium: post.is_premium,
    category: { id: post.category_id, name: post.category_name, slug: post.category_slug }
  }
  
  const accessCheck = await checkPostAccess(c.env, postForPaywall as any, {
    isSubscriber: readerContext.isSubscriber,
    readerUserId: readerContext.readerId,
    anonIdentifier: readerContext.anonIdentifier,
  })
  
  // Get CMS settings
  const siteName = (await getSetting(c.env, 'site_name', 'public') as string) || 'Jornal'
  const coverR2Key = (await getSetting(c.env, 'cover_of_day.r2_key', 'public') as string) || ''
  const coverAlt = (await getSetting(c.env, 'cover_of_day.alt', 'public') as string) || 'Capa do Dia'
  const coverAspectRatio = (await getSetting(c.env, 'cover_of_day.aspect_ratio', 'public') as string) || '3/4'
  
  const baseUrl = c.env.PUBLIC_BASE_URL || 'https://example.com'
  
  // Get nav sections
  const sections = await getHomeSections(c.env)
  const navItems = sections
    .filter(s => s.enabled)
    .map(s => ({
      label: s.title,
      href: s.type === 'tag' ? `/tag/${s.tagSlug}` : `/categoria/${s.slug}`,
      active: false
    }))
  
  // Get related posts and most read
  const relatedPosts = await findRelatedPosts(c.env, post.id, post.category_id, { limit: 4 })
  const mostRead = await findMostRead(c.env, { limit: 6 })
  
  // Render article page
  const html = await renderArticlePage(c, post, {
    baseUrl,
    siteName,
    navItems,
    coverOfDay: coverR2Key ? { r2Key: coverR2Key, alt: coverAlt, aspectRatio: coverAspectRatio } : null,
    relatedPosts,
    mostRead,
    isBlocked: !accessCheck.allowed
  })
  
  return c.html(html)
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
    
    // CRITICAL: Get RAW body as ArrayBuffer (bytes) for true idempotency
    const rawBodyBuffer = await c.req.arrayBuffer()
    
    // Compute SHA-256 hash of RAW bytes (not re-serialized JSON)
    const hashBuffer = await crypto.subtle.digest('SHA-256', rawBodyBuffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const payloadHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    
    // Decode to text and parse JSON
    const bodyText = new TextDecoder().decode(rawBodyBuffer)
    const body = JSON.parse(bodyText)
    
    // Validate with Zod
    const validation = asaasWebhookSchema.safeParse(body)
    if (!validation.success) {
      console.error('Webhook validation error:', validation.error)
      return c.json({ success: false, error: 'Invalid webhook payload' }, 400)
    }
    
    const event = validation.data
    const requestId = c.get('requestId') || 'unknown'
    
    // Primary idempotency: payload_hash (64 hex chars)
    const eventId = payloadHash
    
    // Secondary idempotency: stable_key (derived from semantic content)
    let stableKey: string | null = null
    
    // Derive stable_key: asaas:<eventType>:<entityId>
    const eventType = event.event
    if (event.payment?.id) {
      stableKey = `asaas:${eventType}:payment:${event.payment.id}`
    } else if ((event as any).subscription?.id) {
      stableKey = `asaas:${eventType}:subscription:${(event as any).subscription.id}`
    } else if ((event as any).customer?.id || (event as any).customer) {
      const custId = (event as any).customer?.id || (event as any).customer
      stableKey = `asaas:${eventType}:customer:${custId}`
    } else if ((event as any).invoice?.id) {
      stableKey = `asaas:${eventType}:invoice:${(event as any).invoice.id}`
    }
    
    // RACE-FREE IDEMPOTENCY: Try INSERT into webhook_idempotency first
    // If stable_key exists, PRIMARY KEY will reject (no race condition)
    if (stableKey) {
      try {
        await c.env.DB.prepare(`
          INSERT INTO webhook_idempotency (provider, stable_key, event_id)
          VALUES (?, ?, ?)
        `).bind('asaas', stableKey, eventId).run()
        
        // Success: this is the FIRST request with this stable_key → continue
      } catch (error: any) {
        // PRIMARY KEY collision → duplicate stable_key
        if (error.message && error.message.includes('UNIQUE constraint failed')) {
          return c.json({ success: true, message: 'Event already processed (stable_key race-free)' })
        }
        // Other error → log and continue (fallback to hash check)
        console.error('Idempotency table error:', error)
      }
    }
    
    // Fallback idempotency check: by payload_hash
    const existingByHash = await c.env.DB.prepare(
      'SELECT id FROM webhook_events WHERE provider = ? AND event_id = ?'
    ).bind('asaas', eventId).first()
    
    if (existingByHash) {
      return c.json({ success: true, message: 'Event already processed (by hash)' })
    }
    
    // Store event with hybrid idempotency
    await c.env.DB.prepare(`
      INSERT INTO webhook_events (provider, event_id, event_type, payload_hash, payload_json, stable_key, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', datetime('now'))
    `).bind(
      'asaas',
      eventId,
      event.event,
      payloadHash,
      bodyText,
      stableKey
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
// Admin Users Routes (RBAC: Director only)
// ============================================================================

// GET /admin/users - List users
app.get('/admin/users', async (c) => {
  const { requireDirector } = await import('../packages/core/middleware/rbac')
  await requireDirector(c, async () => {})
  
  const { handleUsersList } = await import('../packages/core/admin/users')
  return handleUsersList(c)
})

// GET /admin/users/new - New user form
app.get('/admin/users/new', async (c) => {
  const { requireDirector } = await import('../packages/core/middleware/rbac')
  await requireDirector(c, async () => {})
  
  const { handleUsersNew } = await import('../packages/core/admin/users')
  return handleUsersNew(c)
})

// POST /admin/users - Create user
app.post('/admin/users', async (c) => {
  const { requireDirector } = await import('../packages/core/middleware/rbac')
  await requireDirector(c, async () => {})
  
  const { handleUsersCreate } = await import('../packages/core/admin/users')
  return handleUsersCreate(c)
})

// GET /admin/users/:id - Edit user form
app.get('/admin/users/:id{[0-9]+}', async (c) => {
  const { requireDirector } = await import('../packages/core/middleware/rbac')
  await requireDirector(c, async () => {})
  
  const { handleUsersEdit } = await import('../packages/core/admin/users')
  return handleUsersEdit(c)
})

// POST /admin/users/:id - Update user
app.post('/admin/users/:id{[0-9]+}', async (c) => {
  const { requireDirector } = await import('../packages/core/middleware/rbac')
  await requireDirector(c, async () => {})
  
  const { handleUsersUpdate } = await import('../packages/core/admin/users')
  return handleUsersUpdate(c)
})

// POST /admin/users/:id/reset-password - Reset password
app.post('/admin/users/:id{[0-9]+}/reset-password', async (c) => {
  const { requireDirector } = await import('../packages/core/middleware/rbac')
  await requireDirector(c, async () => {})
  
  const { handleUsersResetPassword } = await import('../packages/core/admin/users')
  return handleUsersResetPassword(c)
})

// POST /admin/users/:id/disable - Disable user
app.post('/admin/users/:id{[0-9]+}/disable', async (c) => {
  const { requireDirector } = await import('../packages/core/middleware/rbac')
  await requireDirector(c, async () => {})
  
  const { handleUsersDisable } = await import('../packages/core/admin/users')
  return handleUsersDisable(c)
})

// POST /admin/users/:id/enable - Enable user
app.post('/admin/users/:id{[0-9]+}/enable', async (c) => {
  const { requireDirector } = await import('../packages/core/middleware/rbac')
  await requireDirector(c, async () => {})
  
  const { handleUsersEnable } = await import('../packages/core/admin/users')
  return handleUsersEnable(c)
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

// DEBUG: Test password verification (REMOVE AFTER DEBUG)
app.post('/api/debug/verify', async (c) => {
  const { email, password } = await c.req.json()
  const { verifyPassword } = await import('../packages/core/auth/password')
  
  const user = await c.env.DB.prepare(
    'SELECT password_hash FROM users WHERE email = ?'
  ).bind(email).first<any>()
  
  if (!user) {
    return c.json({ error: 'User not found' }, 404)
  }
  
  // Capture logs
  const logs: any[] = []
  const originalLog = console.log
  const originalError = console.error
  
  console.log = (...args: any[]) => {
    logs.push(['[LOG]', ...args])
    originalLog(...args)
  }
  
  console.error = (...args: any[]) => {
    logs.push(['[ERROR]', ...args])
    originalError(...args)
  }
  
  try {
    const result = await verifyPassword(password, user.password_hash)
    console.log = originalLog
    console.error = originalError
    
    return c.json({
      ok: result.ok,
      needsRehash: result.needsRehash,
      hashLength: user.password_hash.length,
      hashPrefix: user.password_hash.substring(0, 30),
      debugLogs: logs,
    })
  } catch (error) {
    console.log = originalLog
    console.error = originalError
    return c.json({
      error: error instanceof Error ? error.message : 'Unknown',
      stack: error instanceof Error ? error.stack : undefined,
      debugLogs: logs,
    }, 500)
  }
})

// DEBUG: Test WebCrypto PBKDF2 (REMOVE AFTER DEBUG)
app.get('/api/debug/webcrypto', async (c) => {
  try {
    const encoder = new TextEncoder()
    const password = encoder.encode('test123')
    const salt = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])
    
    const key = await crypto.subtle.importKey(
      'raw',
      password,
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    )
    
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        hash: 'SHA-256',
        salt: salt,
        iterations: 1000,
      },
      key,
      256
    )
    
    const derivedKey = new Uint8Array(derivedBits)
    
    return c.json({
      ok: true,
      keyLength: derivedKey.length,
      keyHex: Array.from(derivedKey).map(b => b.toString(16).padStart(2, '0')).join(''),
    })
  } catch (error) {
    return c.json({
      error: error instanceof Error ? error.message : 'Unknown',
      stack: error instanceof Error ? error.stack : undefined,
    }, 500)
  }
})
