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

import type { CreatePostInput } from '../packages/core/db/posts'
import { getPostUrl } from '../packages/core/utils/post'

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
  const path = c.req.path
  if (path.startsWith('/static/') || path.startsWith('/i/') || path.startsWith('/favicon.ico') || path.startsWith('/api/debug/')) {
    return next()
  }

  // Check in-memory first (fastest)
  if (bootstrapExecuted) {
    return next()
    return
  }

  try {
    // Check KV flag (persistent)
    const flagValue = await c.env.CACHE.get(BOOTSTRAP_FLAG)

    if (flagValue === 'true') {
      bootstrapExecuted = true
      return next()
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
// n8n Integration Routes
// ============================================================================

// Middleware validation
app.use('/api/n8n/*', async (c, next) => {
  const apiKeyHeader = c.req.header('X-API-Key')

  if (!apiKeyHeader) {
    return c.json({ success: false, error: 'Unauthorized: Missing Key' }, 401)
  }

  // Check DB setting first (new method)
  const { getSetting } = await import('../packages/core/db')
  const dbKey = await getSetting(c.env, 'n8n_api_key', 'private')

  if (dbKey && apiKeyHeader === dbKey) {
    return next()
  }

  // Check Env var (legacy/fallback)
  if (c.env.N8N_API_KEY && apiKeyHeader === c.env.N8N_API_KEY) {
    return next()
  }

  return c.json({ success: false, error: 'Unauthorized: Invalid Key' }, 401)
})

// POST /api/n8n/media - Upload media
app.post('/api/n8n/media', async (c) => {
  try {
    const { createMedia, extractImageDimensions } = await import('../packages/core/db/media')

    // Parse multipart form
    const formData = await c.req.formData()
    const fileEntry = formData.get('file')
    const alt = (formData.get('alt') as string) || ''
    const credits = (formData.get('credits') as string) || ''

    if (!fileEntry || typeof fileEntry === 'string') {
      return c.json({ success: false, error: 'No file provided' }, 400)
    }

    const file = fileEntry as File

    // Generate R2 key
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const randomHex = Array.from(crypto.getRandomValues(new Uint8Array(8)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    const ext = file.name.split('.').pop() || 'jpg'
    const r2Key = `media/${year}/${month}/${randomHex}.${ext}`

    // Upload to R2
    const arrayBuffer = await file.arrayBuffer()
    await c.env.R2.put(r2Key, arrayBuffer, {
      httpMetadata: { contentType: file.type }
    })

    // Extract dimensions
    const dimensions = extractImageDimensions(arrayBuffer, file.type)

    // Create DB record
    const mediaId = await createMedia(c.env, {
      r2_key: r2Key,
      filename: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      width: dimensions?.width,
      height: dimensions?.height,
      alt: alt || null,
      credits: credits || null,
      uploaded_by_user_id: 1 // Defaults to ID 1 (Admin)
    })

    return c.json({
      success: true,
      data: {
        id: mediaId,
        url: `/i/${r2Key}`,
        r2_key: r2Key,
        width: dimensions?.width,
        height: dimensions?.height,
        mime_type: file.type
      }
    })
  } catch (error: any) {
    console.error('[n8n] Media upload error:', error)
    return c.json({ success: false, error: error.message }, 500)
  }
})

// POST /api/n8n/posts - Create post
app.post('/api/n8n/posts', async (c) => {
  try {
    const { createPost, getPostById } = await import('../packages/core/db/posts')
    const body = await c.req.json() as any // Cast mostly to any to allow flexible input, validated below

    // Basic validation
    if (!body.title || !body.content) {
      return c.json({ success: false, error: 'Missing title or content' }, 400)
    }

    // Default values suitable for n8n
    const input: CreatePostInput = {
      title: body.title,
      content: body.content,
      slug: body.slug,
      hat: body.hat,
      excerpt: body.excerpt,
      content_markdown: body.content_markdown,
      category_id: body.category_id || 1,
      author_id: body.author_id || 1,
      cover_media_id: body.cover_media_id,
      template: body.template || 'article',
      seo_title: body.seo_title,
      seo_description: body.seo_description,
      social_title: body.social_title,
      social_description: body.social_description,
      social_share_text: body.social_share_text,
      social_image_media_id: body.social_image_media_id,
      social_image_position_x: body.social_image_position_x,
      social_image_position_y: body.social_image_position_y,
      is_premium: body.is_premium || 0,
      seo_noindex: body.seo_noindex || 0,
      is_headline: body.is_headline || 0,
      tags: body.tags,
      original_link: body.original_link
    }

    const postId = await createPost(c.env.DB, input)

    // If status is 'published', we need to publish it
    if (body.status === 'published') {
      const { publishPost } = await import('../packages/core/db/posts')
      await publishPost(c.env.DB, postId)
    }

    // Fetch to get the final slug/status
    const post = await getPostById(c.env.DB, postId)

    return c.json({
      success: true,
      data: {
        id: postId,
        slug: post?.slug,
        status: post?.status,
        url: post ? getPostUrl(post, c.env.PUBLIC_BASE_URL) : ''
      }
    })
  } catch (error: any) {
    console.error('[n8n] Create post error:', error)
    return c.json({ success: false, error: error.message }, 500)
  }
})

// GET /api/n8n/posts - List posts (with filters like missing_cover)
app.get('/api/n8n/posts', async (c) => {
  try {
    const { listPosts } = await import('../packages/core/db/posts')
    const limit = Number(c.req.query('limit')) || 20
    const offset = Number(c.req.query('offset')) || 0
    const missing_cover = c.req.query('missing_cover') === 'true'
    const status = c.req.query('status') || undefined
    const slug = c.req.query('slug') || undefined
    const original_link = c.req.query('original_link') || undefined
    let search = c.req.query('search') || undefined

    // Truncate search if too long to avoid D1 "LIKE pattern too complex" error
    if (search && search.length > 30) {
      search = search.substring(0, 30)
    }

    const result = await listPosts(c.env.DB, {
      limit,
      offset,
      missing_cover,
      status,
      slug,
      original_link,
      search
    })

    return c.json({ success: true, count: result.total, data: result.posts })
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

// PATCH /api/n8n/posts/:id - Update post
app.patch('/api/n8n/posts/:id', async (c) => {
  try {
    const { updatePost } = await import('../packages/core/db/posts')
    const id = Number(c.req.param('id'))
    const body = await c.req.json() as any

    await updatePost(c.env.DB, id, body)

    return c.json({ success: true, id })
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500)
  }
})

// GET /api/n8n/media - List media (search by query/filename)
app.get('/api/n8n/media', async (c) => {
  try {
    const { listMedia } = await import('../packages/core/db/media')
    const query = c.req.query('query') || ''
    const filename = c.req.query('filename') || ''
    const limit = Number(c.req.query('limit')) || 20

    const result = await listMedia(c.env, { query, filename, limit })

    return c.json({ success: true, count: result.total, data: result.items })
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500)
  }
})

// ============================================================================
// Static Files (R2-served media)
// ============================================================================

app.get('/i/:key{.+}', async (c) => {
  const { serveMedia } = await import('../packages/core/storage')
  const key = c.req.param('key')
  return serveMedia(c.env, key, c.req.raw)
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

app.get('/api/debug/env', (c) => {
  return c.json({
    has_db: !!c.env.DB,
    has_kv: !!c.env.KV,
    has_cache: !!c.env.CACHE,
    has_r2: !!c.env.R2,
    has_jwt_secret: !!c.env.JWT_SECRET,
    jwt_secret_len: c.env.JWT_SECRET?.length || 0,
    cf_env: c.env.CF_ENV,
    node_version: process.version
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
  const { generateRobotsTxt } = await import('../packages/core/seo')
  const baseUrl = c.env.PUBLIC_BASE_URL || new URL(c.req.url).origin
  const robots = await generateRobotsTxt(baseUrl)
  return c.text(robots, 200, { 'Content-Type': 'text/plain' })
})

app.get('/ads.txt', async (c) => {
  const { getSetting } = await import('../packages/core/db')
  const content = await getSetting(c.env, 'ads_txt', 'public')

  if (!content) {
    return c.notFound()
  }

  return c.text(content, 200, { 'Content-Type': 'text/plain' })
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
  const { generateFullSitemap } = await import('../packages/core/seo')
  const baseUrl = c.env.PUBLIC_BASE_URL || new URL(c.req.url).origin
  const xml = await generateFullSitemap(c.env, baseUrl)
  return c.text(xml, 200, { 'Content-Type': 'application/xml' })
})

app.get('/sitemap-news.xml', async (c) => {
  const { generateNewsSitemap } = await import('../packages/core/seo')
  const xml = await generateNewsSitemap(c.env)
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
app.get('/login', async (c) => {
  const { renderLoginPage } = await import('../packages/core/admin/ui')
  const error = c.req.query('error')
  return c.html(renderLoginPage(error))
})

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

// O editor de matérias altera conteúdo editorial e usa autosave via API.
app.use('/admin/posts', async (c, next) => {
  const { csrfProtection } = await import('../packages/core/middleware')
  return csrfProtection(c, next)
})
app.use('/admin/posts/*', async (c, next) => {
  const { csrfProtection } = await import('../packages/core/middleware')
  return csrfProtection(c, next)
})
app.use('/api/admin/posts/*', async (c, next) => {
  if (!/^\/api\/admin\/posts\/\d+\/(autosave|social-card)$/.test(c.req.path)) return next()
  const { csrfProtection } = await import('../packages/core/middleware')
  return csrfProtection(c, next)
})

// Newsletter forms always validate the session-bound CSRF token.
app.use('/admin/newsletters', async (c, next) => {
  const { csrfProtection } = await import('../packages/core/middleware')
  return csrfProtection(c, next)
})
app.use('/admin/newsletters/*', async (c, next) => {
  const { csrfProtection } = await import('../packages/core/middleware')
  return csrfProtection(c, next)
})

// Social publishing forms use the same session-bound CSRF protection.
app.use('/admin/instagram', async (c, next) => {
  const { csrfProtection } = await import('../packages/core/middleware')
  return csrfProtection(c, next)
})
app.use('/admin/instagram/*', async (c, next) => {
  const { csrfProtection } = await import('../packages/core/middleware')
  return csrfProtection(c, next)
})

// Editorial AI forms change source, dossier and review state.
app.use('/admin/redacao-ia', async (c, next) => {
  const { csrfProtection } = await import('../packages/core/middleware')
  return csrfProtection(c, next)
})
app.use('/admin/redacao-ia/*', async (c, next) => {
  const { csrfProtection } = await import('../packages/core/middleware')
  return csrfProtection(c, next)
})

app.use('/admin/integrations', async (c, next) => {
  const { csrfProtection } = await import('../packages/core/middleware')
  return csrfProtection(c, next)
})
app.use('/admin/integrations/*', async (c, next) => {
  const { csrfProtection } = await import('../packages/core/middleware')
  return csrfProtection(c, next)
})

// Settings forms change operational data and must use the session-bound token.
app.use('/admin/settings', async (c, next) => {
  const { csrfProtection } = await import('../packages/core/middleware')
  return csrfProtection(c, next)
})
app.use('/admin/settings/*', async (c, next) => {
  const { csrfProtection } = await import('../packages/core/middleware')
  return csrfProtection(c, next)
})

// Team governance is director-only and every mutation is CSRF protected.
const requireDirectorForTeam = async (c: any, next: any) => {
  const { requireDirector } = await import('../packages/core/middleware/rbac')
  return requireDirector(c, next)
}
const protectTeamCsrf = async (c: any, next: any) => {
  const { csrfProtection } = await import('../packages/core/middleware')
  return csrfProtection(c, next)
}
app.use('/admin/users', requireDirectorForTeam, protectTeamCsrf)
app.use('/admin/users/*', requireDirectorForTeam, protectTeamCsrf)
app.use('/admin/authors', requireDirectorForTeam, protectTeamCsrf)
app.use('/admin/authors/*', requireDirectorForTeam, protectTeamCsrf)

const requireEditorForTags = async (c: any, next: any) => {
  const { requireEditor } = await import('../packages/core/middleware/rbac')
  return requireEditor(c, next)
}
app.use('/admin/tags', requireEditorForTags, protectTeamCsrf)
app.use('/admin/tags/*', requireEditorForTags, protectTeamCsrf)

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
    const errorMsg = error instanceof Error ? error.message : 'Erro ao fazer login'
    console.error('[Login] EXCEPTION:', errorMsg)
    return c.html(renderLoginPage(errorMsg), 500)
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

    const { renderAdminLayout, renderAdminIcon, escapeHtml } = await import('../packages/core/admin/ui')
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

    const dashboardIcon = (name: string) => `<span class="admin-icon">${renderAdminIcon(name)}</span>`
    const bodyHtml = `
      <div class="page-intro">
        <div>
          <p class="page-kicker">Painel editorial</p>
          <h1 class="page-title">Bom trabalho, ${escapeHtml(user.name?.split(/\s+/)[0] || 'Editor')}.</h1>
          <p class="page-description">Acompanhe a operação do jornal e acesse as tarefas mais frequentes da redação.</p>
        </div>
        <a href="/admin/posts/new" class="btn">${dashboardIcon('posts')} Nova matéria</a>
      </div>

      <section aria-labelledby="dashboard-overview-title">
        <h2 id="dashboard-overview-title" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);">Indicadores gerais</h2>
        <div class="stats-grid">
          <article class="stat-card">
            <div class="stat-top">
              <span class="stat-label">Matérias publicadas</span>
              <span class="stat-icon">${dashboardIcon('posts')}</span>
            </div>
            <strong class="stat-value">${postsCount?.count || 0}</strong>
          </article>

          <article class="stat-card is-accent">
            <div class="stat-top">
              <span class="stat-label">Planos ativos</span>
              <span class="stat-icon">${dashboardIcon('users')}</span>
            </div>
            <strong class="stat-value">${plansCount?.count || 0}</strong>
          </article>

          <article class="stat-card">
            <div class="stat-top">
              <span class="stat-label">Espaços publicitários</span>
              <span class="stat-icon">${dashboardIcon('ads')}</span>
            </div>
            <strong class="stat-value">${adsCount?.count || 0}</strong>
          </article>

          <article class="stat-card ${asaasConfigured ? 'is-success' : 'is-danger'}">
            <div class="stat-top">
              <span class="stat-label">Pagamentos</span>
              <span class="stat-icon">${dashboardIcon('billing')}</span>
            </div>
            <strong class="stat-value is-status" style="color:${asaasConfigured ? 'var(--success)' : 'var(--danger)'}">
              <span class="status-inline"><span class="status-dot"></span>${asaasConfigured ? 'Conexão ativa' : 'Configuração pendente'}</span>
            </strong>
          </article>
        </div>
      </section>

      <section aria-labelledby="quick-actions-title">
        <div class="dashboard-section-heading">
          <div>
            <h2 id="quick-actions-title">Ações rápidas</h2>
            <p>Atalhos para o fluxo diário de publicação.</p>
          </div>
        </div>

        <div class="quick-actions">
          <a href="/admin/posts/new" class="quick-action">
            <div class="quick-action-top"><span class="quick-action-icon">${dashboardIcon('posts')}</span><span class="admin-icon quick-action-arrow">${renderAdminIcon('arrow')}</span></div>
            <div><h3>Escrever matéria</h3><p>Crie, revise e publique um novo conteúdo.</p></div>
          </a>

          <a href="/admin/daily-cover" class="quick-action">
            <div class="quick-action-top"><span class="quick-action-icon">${dashboardIcon('cover')}</span><span class="admin-icon quick-action-arrow">${renderAdminIcon('arrow')}</span></div>
            <div><h3>Organizar a capa</h3><p>Defina as principais chamadas do jornal.</p></div>
          </a>

          <a href="/admin/media/upload" class="quick-action">
            <div class="quick-action-top"><span class="quick-action-icon">${dashboardIcon('media')}</span><span class="admin-icon quick-action-arrow">${renderAdminIcon('arrow')}</span></div>
            <div><h3>Adicionar mídia</h3><p>Envie fotografias para a biblioteca editorial.</p></div>
          </a>

          ${user.role === 'admin' || user.role === 'director' ? `<a href="/admin/users" class="quick-action">
            <div class="quick-action-top"><span class="quick-action-icon">${dashboardIcon('shield')}</span><span class="admin-icon quick-action-arrow">${renderAdminIcon('arrow')}</span></div>
            <div><h3>Gerenciar equipe</h3><p>Administre colaboradores e permissões.</p></div>
          </a>` : ''}
        </div>
      </section>
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
// Admin Authors Routes
// ============================================================================

app.get('/admin/authors', async (c) => {
  const { handleAuthorsList } = await import('../packages/core/admin/authors')
  return handleAuthorsList(c)
})

app.get('/admin/authors/new', async (c) => {
  const { handleAuthorsNew } = await import('../packages/core/admin/authors')
  return handleAuthorsNew(c)
})

app.post('/admin/authors', async (c) => {
  const { handleAuthorsCreate } = await import('../packages/core/admin/authors')
  return handleAuthorsCreate(c)
})

app.get('/admin/authors/:id{[0-9]+}', async (c) => {
  const { handleAuthorsEdit } = await import('../packages/core/admin/authors')
  return handleAuthorsEdit(c)
})

app.post('/admin/authors/:id{[0-9]+}', async (c) => {
  const { handleAuthorsUpdate } = await import('../packages/core/admin/authors')
  return handleAuthorsUpdate(c)
})

app.post('/admin/authors/:id{[0-9]+}/disable', async (c) => {
  const { handleAuthorsDisable } = await import('../packages/core/admin/authors')
  return handleAuthorsDisable(c)
})

app.post('/admin/authors/:id{[0-9]+}/enable', async (c) => {
  const { handleAuthorsEnable } = await import('../packages/core/admin/authors')
  return handleAuthorsEnable(c)
})

app.post('/admin/authors/:id{[0-9]+}/delete', async (c) => {
  const { handleAuthorsDelete } = await import('../packages/core/admin/authors')
  return handleAuthorsDelete(c)
})

// ============================================================================
// Admin Tags Routes (RBAC: Editor or Director)
// ============================================================================

app.get('/admin/tags', async (c) => {
  const { handleTagsList } = await import('../packages/core/admin/tags')
  return handleTagsList(c)
})

app.get('/admin/tags/new', async (c) => {
  const { handleTagsNew } = await import('../packages/core/admin/tags')
  return handleTagsNew(c)
})

app.post('/admin/tags', async (c) => {
  const { handleTagsCreate } = await import('../packages/core/admin/tags')
  return handleTagsCreate(c)
})

app.get('/admin/tags/:id{[0-9]+}', async (c) => {
  const { handleTagsEdit } = await import('../packages/core/admin/tags')
  return handleTagsEdit(c)
})

app.post('/admin/tags/:id{[0-9]+}', async (c) => {
  const { handleTagsUpdate } = await import('../packages/core/admin/tags')
  return handleTagsUpdate(c)
})

app.post('/admin/tags/:id{[0-9]+}/delete', async (c) => {
  const { handleTagsDelete } = await import('../packages/core/admin/tags')
  return handleTagsDelete(c)
})

// ============================================================================
// Admin Integrations Routes
// ============================================================================

app.get('/admin/integrations', async (c) => {
  const { renderIntegrationsPage } = await import('../packages/core/admin/integrations')
  return c.html(await renderIntegrationsPage(c))
})


app.post('/admin/integrations/n8n/generate', async (c) => {
  const { handleGenerateKey } = await import('../packages/core/admin/integrations')
  return handleGenerateKey(c)
})

app.post('/admin/integrations/instagram', async (c) => {
  const { handleInstagramIntegrationSave } = await import('../packages/core/admin/integrations')
  return handleInstagramIntegrationSave(c)
})

app.post('/admin/integrations/openai', async (c) => {
  const { handleEditorialAiIntegrationSave } = await import('../packages/core/admin/integrations')
  return handleEditorialAiIntegrationSave(c)
})

// ============================================================================
// Admin Media Routes
// ============================================================================

// GET /admin/media - List media
app.get('/admin/media', async (c) => {
  const { handleMediaList } = await import('../packages/core/admin/media')
  return handleMediaList(c)
})

// GET /admin/media/upload - Upload form
app.get('/admin/media/upload', async (c) => {
  const { handleMediaUpload } = await import('../packages/core/admin/media')
  return handleMediaUpload(c)
})

// POST /admin/media - Handle upload
app.post('/admin/media', async (c) => {
  const { handleMediaCreate } = await import('../packages/core/admin/media')
  return handleMediaCreate(c)
})

// GET /admin/media/:id - Media detail
app.get('/admin/media/:id{[0-9]+}', async (c) => {
  const { handleMediaDetail } = await import('../packages/core/admin/media')
  return handleMediaDetail(c)
})

// POST /admin/media/:id - Update metadata
app.post('/admin/media/:id{[0-9]+}', async (c) => {
  const { handleMediaUpdate } = await import('../packages/core/admin/media')
  return handleMediaUpdate(c)
})

// POST /admin/media/:id/delete - Delete media
app.post('/admin/media/:id{[0-9]+}/delete', async (c) => {
  const { handleMediaDelete } = await import('../packages/core/admin/media')
  return handleMediaDelete(c)
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
  const year = c.req.query('year') ? parseInt(c.req.query('year')!) : undefined
  const month = c.req.query('month') ? parseInt(c.req.query('month')!) : undefined
  const day = c.req.query('day') ? parseInt(c.req.query('day')!) : undefined

  const limit = parseInt(c.req.query('limit') || '20')
  const page = parseInt(c.req.query('page') || '1')
  const offset = (page - 1) * limit

  // Get posts
  const { posts, total } = await listPosts(c.env.DB, {
    status,
    category_id,
    is_premium,
    search,
    year,
    month,
    day,
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
    filters: { status, category_id, is_premium, search, year, month, day, limit, offset, page },
    categories,
    authors: authorsResult.results || [],
    user,
    csrfToken
  }))
})

// GET /admin/posts/new - Form criar post
app.get('/admin/posts/new', async (c) => {
  const { renderPostFormPage } = await import('../packages/core/admin/posts')
  const { findAllCategories, listActiveAuthors, ensureAuthorForAdminUser, ensureDefaultRedacao } = await import('../packages/core/db')

  const user = c.get('adminUser')
  const csrfToken = c.get('csrfToken')
  const cspNonce = c.get('cspNonce')

  // Garantir que existe autor para o usuário logado
  const ensuredAuthor = await ensureAuthorForAdminUser(c.env, user)

  // Garantir que existe autor "Redação" (fallback)
  await ensureDefaultRedacao(c.env)

  // Get categories, authors, tags
  const categories = await findAllCategories(c.env)
  const authors = await listActiveAuthors(c.env)

  const tagsResult = await c.env.DB.prepare(
    'SELECT id, name FROM tags ORDER BY name ASC'
  ).all<{ id: number, name: string }>()

  // Determinar autor padrão para pré-selecionar
  let defaultAuthorId: number | undefined
  if (ensuredAuthor) {
    defaultAuthorId = ensuredAuthor.id
  } else if (authors.length > 0) {
    // Fallback: primeiro da lista (provavelmente "Redação")
    defaultAuthorId = authors[0].id
  }

  return c.html(renderPostFormPage({
    categories,
    authors,
    tags: tagsResult.results || [],
    user,
    csrfToken,
    cspNonce,
    defaultAuthorId
  }))
})

// POST /admin/posts - Criar post
app.post('/admin/posts', async (c) => {
  const { createPostSchema } = await import('../packages/core/admin/posts')
  const { createPost } = await import('../packages/core/db/posts')
  const { logAudit, ensureAuthorForAdminUser, validateAuthorId } = await import('../packages/core/db')

  const user = c.get('adminUser')
  const requestId = c.get('requestId')

  try {
    // ✅ CRITICAL: Reuse cached body from CSRF middleware
    const formData = (c.get('parsedBody') || await c.req.parseBody()) as Record<string, any>

    // Se author_id vier vazio, garantir autor para o usuário logado
    let authorId = formData.author_id ? parseInt(String(formData.author_id)) : undefined

    if (!authorId || isNaN(authorId)) {
      const ensuredAuthor = await ensureAuthorForAdminUser(c.env, user)
      if (ensuredAuthor) {
        authorId = ensuredAuthor.id
      } else {
        return c.redirect('/admin/posts/new?error=author_required', 303)
      }
    }

    // Validar que o autor existe e está ativo
    const isValidAuthor = await validateAuthorId(c.env, authorId)
    if (!isValidAuthor) {
      return c.redirect('/admin/posts/new?error=invalid_author', 303)
    }

    // Parse tags array
    const tags = formData.tags
      ? (Array.isArray(formData.tags) ? formData.tags : [formData.tags]).map(t => parseInt(String(t)))
      : []

    // Validate
    console.log('[POST /admin/posts] Before Zod validation')
    let data
    try {
      data = createPostSchema.parse({
        ...formData,
        author_id: authorId,
        tags,
        opinion_featured: formData.opinion_featured ? 1 : 0,
        cover_media_id: formData.cover_media_id ? parseInt(String(formData.cover_media_id)) : undefined,
        social_image_media_id: formData.social_image_media_id ? parseInt(String(formData.social_image_media_id)) : undefined
      })
      console.log('[POST /admin/posts] Zod validation passed')
    } catch (zodError) {
      console.error('[POST /admin/posts] ZOD VALIDATION FAILED:', zodError)
      throw zodError
    }

    // Create (cast to CreatePostInput pois Zod já validou required fields)
    const createPayload = data.content_json?.trim()
      ? { ...data, content_json: data.content_json, content_markdown: undefined }
      : { ...data, content_markdown: data.content }
    const postId = await createPost(c.env.DB, createPayload as any)
    console.log('✅ [PROD] Post created successfully. ID:', postId, 'Title:', data.title)

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

    // ✅ MOSTRAR ERRO NA TELA
    const { renderPostFormPage } = await import('../packages/core/admin/posts')
    const { findAllCategories, listActiveAuthors } = await import('../packages/core/db')

    const categories = await findAllCategories(c.env)
    const authors = await listActiveAuthors(c.env)
    const tagsResult = await c.env.DB.prepare(`SELECT id, name FROM tags ORDER BY name ASC`).all<{ id: number, name: string }>()

    const errorMessage = error instanceof Error ? error.message : String(error)

    return c.html(renderPostFormPage({
      categories,
      authors,
      tags: tagsResult.results || [],
      user: c.get('adminUser'),
      csrfToken: c.get('csrfToken'),
      cspNonce: c.get('cspNonce'),
      error: `❌ ERRO AO CRIAR POST: ${errorMessage}`,
      defaultAuthorId: authors.length > 0 ? authors[0].id : undefined
    }))
  }
})


// GET /admin/posts/:id - Form editar post
app.get('/admin/posts/:id', async (c) => {
  const { renderPostFormPage } = await import('../packages/core/admin/posts')
  const { getPostById, listPostRevisions } = await import('../packages/core/db/posts')
  const { findAllCategories, listActiveAuthors, ensureDefaultRedacao } = await import('../packages/core/db')

  const user = c.get('adminUser')
  const csrfToken = c.get('csrfToken')
  const cspNonce = c.get('cspNonce')
  const id = parseInt(c.req.param('id'))

  const post = await getPostById(c.env.DB, id)
  if (!post) {
    return c.notFound()
  }

  // Garantir que existe autor "Redação" (fallback)
  await ensureDefaultRedacao(c.env)

  // Get categories, authors, tags
  const categories = await findAllCategories(c.env)
  const authors = await listActiveAuthors(c.env)

  const tagsResult = await c.env.DB.prepare(
    'SELECT id, name FROM tags ORDER BY name ASC'
  ).all<{ id: number, name: string }>()
  const revisions = await listPostRevisions(c.env.DB, id, 8)

  return c.html(renderPostFormPage({
    post,
    categories,
    authors,
    tags: tagsResult.results || [],
    user,
    csrfToken,
    cspNonce,
    error: c.req.query('error'),
    message: c.req.query('message'),
    revisions
  }))
})

// POST /admin/posts/:id - Atualizar post
app.post('/admin/posts/:id', async (c) => {
  const { updatePostSchema } = await import('../packages/core/admin/posts')
  const { createPostRevision, getPostById, updatePost } = await import('../packages/core/db/posts')
  const { logAudit, ensureAuthorForAdminUser, validateAuthorId } = await import('../packages/core/db')

  const user = c.get('adminUser')
  const requestId = c.get('requestId')
  const id = parseInt(c.req.param('id'))

  try {
    // ✅ CRITICAL: Reuse cached body from CSRF middleware
    const formData = (c.get('parsedBody') || await c.req.parseBody()) as Record<string, any>

    // Se author_id vier, validar que existe e está ativo
    let authorId = formData.author_id ? parseInt(String(formData.author_id)) : undefined

    if (authorId && !isNaN(authorId)) {
      const isValidAuthor = await validateAuthorId(c.env, authorId)
      if (!isValidAuthor) {
        return c.redirect(`/admin/posts/${id}?error=invalid_author`, 303)
      }
    }

    // Parse tags array
    const tags = formData.tags
      ? (Array.isArray(formData.tags) ? formData.tags : [formData.tags]).map(t => parseInt(String(t)))
      : []

    // Validate
    console.log('[DEBUG] formData.cover_media_id:', formData.cover_media_id)

    // Parse cover_media_id robustly
    let coverMediaId: number | null | undefined = undefined
    if (formData.cover_media_id !== undefined && formData.cover_media_id !== null) {
      const val = String(formData.cover_media_id).trim()
      if (val === '' || val === '0') {
        coverMediaId = null
      } else {
        const parsed = parseInt(val)
        if (!isNaN(parsed) && parsed > 0) {
          coverMediaId = parsed
        }
      }
    }

    let socialImageMediaId: number | null | undefined = undefined
    if (formData.social_image_media_id !== undefined && formData.social_image_media_id !== null) {
      const value = String(formData.social_image_media_id).trim()
      if (value === '' || value === '0') {
        socialImageMediaId = null
      } else {
        const parsed = parseInt(value)
        if (!isNaN(parsed) && parsed > 0) socialImageMediaId = parsed
      }
    }

    const data = updatePostSchema.parse({
      ...formData,
      author_id: authorId,
      tags,
      opinion_featured: formData.opinion_featured ? 1 : 0,
      cover_media_id: coverMediaId,
      social_image_media_id: socialImageMediaId
    })

    console.log('[DEBUG] parsed data.cover_media_id:', data.cover_media_id)

    const currentPost = await getPostById(c.env.DB, id)
    if (!currentPost) return c.notFound()
    const expectedVersion = data.content_version || currentPost.content_version || 1
    if ((currentPost.content_version || 1) !== expectedVersion) {
      return c.redirect(`/admin/posts/${id}?error=content_conflict`, 303)
    }

    const updatePayload = data.content_json?.trim()
      ? { ...data, content_json: data.content_json, content_markdown: undefined as string | undefined, expected_content_version: expectedVersion }
      : { ...data, ...(data.content !== undefined ? { content_markdown: data.content } : {}) }

    // Update
    await createPostRevision(c.env.DB, currentPost, user.id, 'manual')
    await updatePost(c.env.DB, id, updatePayload as any)

    // Audit log
    await logAudit(c.env, {
      entityType: 'post',
      entityId: id,
      action: 'updated',
      actorType: 'user',
      actorId: user.id,
      details: { fields: Object.keys(updatePayload) },
      requestId
    })

    return c.redirect(`/admin/posts/${id}`, 303)
  } catch (error) {
    console.error('[Admin Posts] Update error:', error)
    if (error instanceof Error && error.message === 'CONTENT_VERSION_CONFLICT') {
      return c.redirect(`/admin/posts/${id}?error=content_conflict`, 303)
    }
    return c.redirect(`/admin/posts/${id}?error=1`, 303)
  }
})

// POST /api/admin/posts/:id/autosave - Salva conteúdo visual sem publicar
app.post('/api/admin/posts/:id{[0-9]+}/autosave', async (c) => {
  const { autosaveVisualPost } = await import('../packages/core/db/posts')
  const id = Number(c.req.param('id'))
  try {
    const body = await c.req.json<Record<string, unknown>>()
    const title = String(body.title || '').trim()
    const contentJson = String(body.content_json || '')
    const expectedVersion = Number(body.content_version || 0)
    if (!title || title.length > 500) return c.json({ success: false, error: 'Título inválido.' }, 400)
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) return c.json({ success: false, error: 'Versão editorial inválida.' }, 400)
    const contentVersion = await autosaveVisualPost(c.env.DB, {
      postId: id,
      contentJson,
      expectedVersion,
      title,
      hat: String(body.hat || ''),
      excerpt: String(body.excerpt || '')
    })
    return c.json({ success: true, content_version: contentVersion })
  } catch (error) {
    if (error instanceof Error && error.message === 'CONTENT_VERSION_CONFLICT') {
      return c.json({ success: false, error: 'A matéria foi alterada em outra sessão.' }, 409)
    }
    console.error('[Admin Posts] Autosave error:', error)
    return c.json({ success: false, error: error instanceof Error ? error.message : 'Falha no salvamento automático.' }, 400)
  }
})

// POST /api/admin/posts/:id/social-card - Salva a arte Open Graph gerada no CMS
app.post('/api/admin/posts/:id{[0-9]+}/social-card', async (c) => {
  const { createMedia, extractImageDimensions } = await import('../packages/core/db/media')
  const { getPostById, updatePost } = await import('../packages/core/db/posts')
  const { logAudit } = await import('../packages/core/db')

  const id = parseInt(c.req.param('id'))
  const user = c.get('adminUser')
  const post = await getPostById(c.env.DB, id)
  if (!post) return c.json({ success: false, error: 'Matéria não encontrada.' }, 404)

  try {
    const formData = await c.req.formData()
    const fileEntry = formData.get('file')
    if (!fileEntry || typeof fileEntry === 'string') {
      return c.json({ success: false, error: 'Arquivo da arte não enviado.' }, 400)
    }

    const file = fileEntry as File
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      return c.json({ success: false, error: 'A arte deve ser JPEG ou PNG.' }, 400)
    }
    if (file.size > 4 * 1024 * 1024) {
      return c.json({ success: false, error: 'A arte ultrapassa o limite de 4 MB.' }, 400)
    }

    const bytes = await file.arrayBuffer()
    const dimensions = extractImageDimensions(bytes, file.type)
    if (!dimensions || dimensions.width !== 1200 || dimensions.height !== 630) {
      return c.json({ success: false, error: 'A arte deve ter exatamente 1200 × 630 pixels.' }, 400)
    }

    const random = Array.from(crypto.getRandomValues(new Uint8Array(8)))
      .map(value => value.toString(16).padStart(2, '0'))
      .join('')
    const extension = file.type === 'image/png' ? 'png' : 'jpg'
    const r2Key = `social/posts/${id}/${Date.now()}-${random}.${extension}`
    await c.env.R2.put(r2Key, bytes, {
      httpMetadata: { contentType: file.type },
      customMetadata: { postId: String(id), purpose: 'open-graph' }
    })

    let mediaId: number
    try {
      mediaId = await createMedia(c.env, {
        r2_key: r2Key,
        filename: `diario-do-povo-og-${id}.${extension}`,
        mime_type: file.type,
        size_bytes: file.size,
        width: 1200,
        height: 630,
        alt: `Arte de compartilhamento: ${post.title}`,
        credits: post.cover_media_credits || undefined,
        uploaded_by_user_id: user.id
      })
    } catch (error) {
      await c.env.R2.delete(r2Key)
      throw error
    }

    const clampPosition = (value: unknown) => {
      const number = Number(value)
      return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : 50
    }
    await updatePost(c.env.DB, id, {
      social_image_media_id: mediaId,
      social_title: String(formData.get('social_title') || '').trim().slice(0, 90),
      social_description: String(formData.get('social_description') || '').trim().slice(0, 220),
      social_share_text: String(formData.get('social_share_text') || '').trim().slice(0, 700),
      social_image_position_x: clampPosition(formData.get('social_image_position_x')),
      social_image_position_y: clampPosition(formData.get('social_image_position_y'))
    })

    await logAudit(c.env, {
      entityType: 'post',
      entityId: id,
      action: 'social_card_generated',
      actorType: 'user',
      actorId: user.id,
      details: { mediaId, width: 1200, height: 630 },
      requestId: c.get('requestId')
    })

    return c.json({ success: true, media_id: mediaId, url: `/i/${r2Key}` })
  } catch (error) {
    console.error('[Admin Posts] Social card error:', error)
    return c.json({ success: false, error: error instanceof Error ? error.message : 'Falha ao gerar a arte.' }, 500)
  }
})

app.post('/admin/posts/:id{[0-9]+}/revisions/:revisionId{[0-9]+}/restore', async (c) => {
  const { restorePostRevision } = await import('../packages/core/db/posts')
  const { logAudit } = await import('../packages/core/db')
  const postId = Number(c.req.param('id'))
  const revisionId = Number(c.req.param('revisionId'))
  const user = c.get('adminUser')
  try {
    await restorePostRevision(c.env.DB, postId, revisionId, user.id)
    await logAudit(c.env, {
      entityType: 'post', entityId: postId, action: 'revision_restored',
      actorType: 'user', actorId: user.id, details: { revisionId }, requestId: c.get('requestId')
    })
    return c.redirect(`/admin/posts/${postId}?message=revision_restored`, 303)
  } catch (error) {
    console.error('[Admin Posts] Restore revision error:', error)
    return c.redirect(`/admin/posts/${postId}?error=revision_restore_failed`, 303)
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

// ============================================================================
// Live Central Routes
// ============================================================================

// GET /admin/live - Dashboard
app.get('/admin/live', async (c) => {
  const { listPosts } = await import('../packages/core/db/posts')
  const { renderLiveCentralDashboard } = await import('../packages/core/admin/live')
  const user = c.get('adminUser')
  const csrfToken = c.get('csrfToken')

  const { posts: activeLiveBlogs } = await listPosts(c.env.DB, {
    status: 'published'
  })

  // Filter manually for template === 'liveblog'
  const active = activeLiveBlogs.filter(p => p.template === 'liveblog' && p.is_live === 1)
  const recent = activeLiveBlogs.filter(p => p.template === 'liveblog' && p.is_live === 0).slice(0, 10)

  return c.html(renderLiveCentralDashboard({
    activeLiveBlogs: active,
    recentLiveBlogs: recent,
    user,
    csrfToken
  }))
})

// GET /admin/live/:id - Control Panel
app.get('/admin/live/:id', async (c) => {
  const { getPostById } = await import('../packages/core/db/posts')
  const { findLiveUpdates } = await import('../packages/core/db')
  const { renderLiveControlPanel } = await import('../packages/core/admin/live')
  const user = c.get('adminUser')
  const csrfToken = c.get('csrfToken')
  const cspNonce = c.get('cspNonce')
  const id = parseInt(c.req.param('id'))

  const post = await getPostById(c.env.DB, id)
  if (!post || post.template !== 'liveblog') {
    return c.notFound()
  }

  const updates = await findLiveUpdates(c.env, post.id)

  return c.html(renderLiveControlPanel({
    post,
    updates,
    user,
    csrfToken,
    cspNonce
  }))
})

// POST /admin/live/:id/toggle-status - Iniciar/Encerrar cobertura
app.post('/admin/live/:id/toggle-status', async (c) => {
  const { getPostById, updatePost } = await import('../packages/core/db/posts')
  const { logAudit } = await import('../packages/core/db')
  const user = c.get('adminUser')
  const requestId = c.get('requestId')
  const id = parseInt(c.req.param('id'))

  const post = await getPostById(c.env.DB, id)
  if (!post) return c.notFound()

  const nextStatus = post.is_live ? 0 : 1
  await updatePost(c.env.DB, id, { is_live: nextStatus })

  await logAudit(c.env, {
    entityType: 'post',
    entityId: id,
    action: nextStatus ? 'live_started' : 'live_ended',
    actorType: 'user',
    actorId: user.id,
    requestId
  })

  return c.redirect(`/admin/live/${id}`, 303)
})

// POST /api/admin/live-updates/:id/delete - Excluir update
app.post('/api/admin/live-updates/:id/delete', async (c) => {
  const { deleteLiveBlogUpdate, logAudit } = await import('../packages/core/db')
  const user = c.get('adminUser')
  const requestId = c.get('requestId')
  const id = parseInt(c.req.param('id'))
  const redirectUrl = c.req.query('redirect')

  try {
    await deleteLiveBlogUpdate(c.env, id)

    await logAudit(c.env, {
      entityType: 'live_blog_update',
      entityId: id,
      action: 'deleted',
      actorType: 'user',
      actorId: user.id,
      requestId
    })

    if (redirectUrl) return c.redirect(redirectUrl, 303)
    return c.json({ success: true })
  } catch (error: any) {
    if (redirectUrl) return c.redirect(`${redirectUrl}?error=delete_failed`, 303)
    return c.json({ success: false, error: error.message }, 500)
  }
})

// GET /admin/posts/:id/preview - Preview SSR (noindex)
app.get('/admin/posts/:id/preview', async (c) => {
  const { getPostById } = await import('../packages/core/db/posts')
  const { escapeHtml } = await import('../packages/core/admin/ui')
  const { renderMarkdownToHtml, sanitizeHtml } = await import('../packages/core/render/sanitize')

  const user = c.get('adminUser')
  const id = parseInt(c.req.param('id'))

  const post = await getPostById(c.env.DB, id)
  if (!post) {
    return c.notFound()
  }

  const looksLikeMarkdown = (value: string | null | undefined): boolean => {
    if (!value) return false
    if (/<[a-z][\s\S]*>/i.test(value)) return false
    return /(^|\n)\s*(?:#{1,6}\s|[-*+]\s|\d+\.\s|> |!\[|\[.+\]\(.+\)|`{3})/.test(value)
  }

  const contentHtml = post.content_markdown && post.content_markdown.length > 0
    ? renderMarkdownToHtml(post.content_markdown)
    : looksLikeMarkdown(post.content)
      ? renderMarkdownToHtml(post.content)
      : sanitizeHtml(post.content || '')

  // Get category and author
  const category = await c.env.DB.prepare(
    'SELECT * FROM categories WHERE id = ?'
  ).bind(post.category_id).first<any>()

  const author = await c.env.DB.prepare(
    'SELECT * FROM authors WHERE id = ?'
  ).bind(post.author_id).first<any>()

  // Render preview simples com noindex
  return c.html(`
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
  </style>
</head>
<body>
  <div class="preview-banner">MODO PREVIEW: Esta página não é pública</div>
  <div class="container">
    <div style="color: #2563eb; font-size: 0.875rem; font-weight: 600; text-transform: uppercase; margin-bottom: 0.5rem;">
      ${escapeHtml(category?.name || 'Sem Categoria')}
    </div>
    <h1 style="font-size: 2.5rem; line-height: 1.1; margin-bottom: 1rem;">${escapeHtml(post.title)}</h1>
    <div style="color: #4b5563; font-size: 1.125rem; font-weight: 500; margin-bottom: 1.5rem;">
      ${escapeHtml(post.excerpt || '')}
    </div>
    <div style="border-top: 1px solid #e5e7eb; padding-top: 1rem; margin-bottom: 2rem; color: #6b7280; font-size: 0.875rem;">
      Por <strong>${escapeHtml(author?.name || 'Equipe')}</strong> • 
      ${new Date(post.created_at).toLocaleDateString('pt-BR')}
    </div>
    <div class="prose" style="line-height: 1.6; font-size: 1.125rem;">
      ${contentHtml}
    </div>
  </div>
</body>
</html>
  `)
})

// POST /admin/posts/:id/delete - Deletar post
app.post('/admin/posts/:id/delete', async (c) => {
  const { deletePost } = await import('../packages/core/db/posts')
  const { logAudit } = await import('../packages/core/db')

  const user = c.get('adminUser')
  const requestId = c.get('requestId')
  const id = parseInt(c.req.param('id'))

  try {
    await deletePost(c.env.DB, id)

    await logAudit(c.env, {
      entityType: 'post',
      entityId: id,
      action: 'deleted',
      actorType: 'user',
      actorId: user.id,
      requestId
    })

    return c.redirect('/admin/posts', 303)
  } catch (error) {
    console.error('[Admin Posts] Delete error:', error)
    return c.redirect(`/admin/posts/${id}?error=delete_failed`, 303)
  }
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

// API /api/admin/media/:id - Get media by ID (JSON)
app.get('/api/admin/media/:id{[0-9]+}', async (c) => {
  const { getMediaById } = await import('../packages/core/db/media')

  const id = parseInt(c.req.param('id'))

  try {
    const media = await getMediaById(c.env, id)
    if (!media) {
      return c.json({ success: false, error: 'Media not found' }, 404)
    }
    return c.json({ success: true, media })
  } catch (error: any) {
    console.error('Error getting media:', error)
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

// POST /admin/settings/newsletter
app.post('/admin/settings/newsletter', async (c) => {
  const { handleNewsletterSettingsUpdate } = await import('../packages/core/admin/settings')
  return handleNewsletterSettingsUpdate(c)
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

// POST /admin/ads/txt
app.post('/admin/ads/txt', async (c) => {
  const { handleAdsTxtSave } = await import('../packages/core/admin/ads')
  return handleAdsTxtSave(c)
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

// Daily Cover Admin Page
app.get('/admin/daily-cover', async (c) => {
  const { getSetting, getMediaById } = await import('../packages/core/db')
  const { renderDailyCoverPage } = await import('../packages/core/admin/daily-cover')
  const user = c.get('adminUser')
  const csrfToken = c.get('csrfToken') as string
  const cspNonce = c.get('cspNonce')

  const success = c.req.query('success') === 'true'
  const error = c.req.query('error')

  // Fetch current setting
  const setting = await getSetting(c.env, 'daily_cover') as { media_id: number } | null
  let currentCoverId: number | null = null
  let currentCoverMedia: any = null

  if (setting?.media_id) {
    currentCoverId = setting.media_id
    currentCoverMedia = await getMediaById(c.env, currentCoverId)
  }

  const html = renderDailyCoverPage({
    currentCoverId,
    currentCoverMedia,
    user,
    csrfToken,
    cspNonce,
    success,
    error
  })

  return c.html(html)
})

// Settings API (Admin)
app.post('/api/admin/settings', async (c) => {
  const { setSetting } = await import('../packages/core/db')
  const user = c.get('adminUser')

  try {
    const formData = await c.req.parseBody()
    const key = formData.setting_key as string
    const valueJson = formData.value_json as string

    if (!key) return c.redirect('/admin?error=missing_key')

    // Handle Daily Cover specific parsing
    let value: any = valueJson
    if (key === 'daily_cover') {
      const mediaId = parseInt(valueJson)
      if (isNaN(mediaId) || mediaId <= 0) {
        // Clearing the cover
        value = { media_id: null }
      } else {
        value = { media_id: mediaId }
      }
    } else {
      // Generic JSON parsing for other settings?? Or strict?
      // For now only daily_cover supported via form
    }

    await setSetting(c.env, key, value, 'public', user.id)

    if (key === 'daily_cover') {
      return c.redirect('/admin/daily-cover?success=true', 303)
    }

    return c.json({ success: true })
  } catch (e: any) {
    console.error('Settings update error:', e)
    return c.redirect(`/admin?error=${encodeURIComponent(e.message)}`, 303)
  }
})

// Public Settings API
app.get('/api/public/settings/:key', async (c) => {
  const { getSetting, getMediaById } = await import('../packages/core/db')
  const { key } = c.req.param()

  const setting = await getSetting(c.env, key)

  if (!setting) {
    return c.json({ error: 'Not found' }, 404)
  }

  // Enrich with media if specialized
  if (key === 'daily_cover' && (setting as any).media_id) {
    const media = await getMediaById(c.env, (setting as any).media_id)
    return c.json({ ...setting, media })
  }

  return c.json(setting)
})

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

// LiveBlog Updates (Public)
app.get('/api/public/posts/:slug/live-updates', async (c) => {
  const { slug } = c.req.param()
  const { findPostBySlug, findLiveUpdates } = await import('../packages/core/db')

  const post = await findPostBySlug(c.env, slug)
  if (!post) {
    return c.json({ success: false, error: 'Post not found' }, 404)
  }

  const updates = await findLiveUpdates(c.env, post.id)
  return c.json({ success: true, data: updates })
})

// LiveBlog Updates (Admin - Create)
app.post('/api/admin/posts/:id/live-updates', async (c) => {
  const { id } = c.req.param()
  const { createLiveBlogUpdate, logAudit } = await import('../packages/core/db')
  const user = c.get('adminUser')
  const redirectUrl = c.req.query('redirect')
  const requestId = c.get('requestId')

  try {
    let body: any
    const contentType = c.req.header('content-type') || ''

    if (contentType.includes('application/json')) {
      body = await c.req.json()
    } else {
      body = await c.req.parseBody()
    }

    const postId = parseInt(id)

    // Resolve author_id correctly (authors table ID, not users table ID)
    const { ensureAuthorForAdminUser } = await import('../packages/core/db')
    const author = await ensureAuthorForAdminUser(c.env, user)
    const authorId = author ? author.id : 0

    const updateId = await createLiveBlogUpdate(c.env, {
      post_id: postId,
      author_id: authorId,
      title: body.title as string,
      content: body.content as string,
      content_markdown: (body.content_markdown || body.content) as string,
      is_pinned: body.is_pinned ? 1 : 0
    })

    await logAudit(c.env, {
      entityType: 'live_blog_update',
      entityId: updateId,
      action: 'created',
      actorType: 'user',
      actorId: user.id,
      details: { post_id: postId, author_id: authorId },
      requestId
    })

    if (redirectUrl) return c.redirect(redirectUrl, 303)
    return c.json({ success: true, data: { id: updateId } })
  } catch (error: any) {
    console.error('[Admin Live] Create update error:', error)
    if (redirectUrl) return c.redirect(`${redirectUrl}?error=create_failed`, 303)
    return c.json({ success: false, error: error.message }, 500)
  }
})

// ============================================================================
// Public Web Routes (SSR)
// ============================================================================

// ============================================================================
// Public Web Routes (SSR)
// ============================================================================

// V2 Gold Route (Isolated)
app.get('/v2', async (c) => {
  return c.redirect('/', 301)
})

// V2 Article Route (Isolated for testing)
app.get('/v2/noticia/:slug', async (c) => {
  const slug = c.req.param('slug')
  return c.redirect(`/noticia/${encodeURIComponent(slug)}`, 301)
})

// V2 Category Route
app.get('/v2/categoria/:slug', async (c) => {
  const slug = c.req.param('slug')
  const page = c.req.query('page')
  return c.redirect(`/categoria/${encodeURIComponent(slug)}${page ? `?page=${encodeURIComponent(page)}` : ''}`, 301)
})

// ============================================================================
// Public Columns Routes
// ============================================================================

app.get('/colunas', (c) => c.redirect('/opiniao', 301))

app.get('/opiniao', async (c) => {
  const { renderOpinionPage } = await import('../packages/core/web/opinion')
  const { getSetting } = await import('../packages/core/db')
  const { getHomeSections } = await import('../packages/core/db/home')

  const siteName = await getSetting(c.env, 'site_name', 'public') || 'Jornal'
  const baseUrl = new URL(c.req.url).origin

  // Get nav sections
  const sections = await getHomeSections(c.env)
  const navItems = sections
    .filter(s => s.enabled && s.slug !== 'colunas' && s.slug !== 'opiniao')
    .map(s => ({
      label: s.title,
      href: s.type === 'tag' ? `/tag/${s.tagSlug}` : `/categoria/${s.slug}`,
      active: false
    }))

  navItems.push({ label: 'Opinião', href: '/opiniao', active: true })

  const html = await renderOpinionPage(c, {
    baseUrl,
    siteName,
    navItems
  })

  return c.html(html)
})

app.get('/coluna/:slug', async (c) => {
  const { renderColumnPage } = await import('../packages/core/web/columns')
  const { getSetting } = await import('../packages/core/db')
  const { getHomeSections } = await import('../packages/core/db/home')
  const slug = c.req.param('slug')

  const siteName = await getSetting(c.env, 'site_name', 'public') || 'Jornal'
  const baseUrl = new URL(c.req.url).origin

  // Daily Cover
  const { getMediaById } = await import('../packages/core/db')
  const dailyCover = await getSetting(c.env, 'daily_cover') as { media_id: number } | null
  let coverR2Key = ''
  let coverAlt = 'Capa do Dia'
  let coverAspectRatio = '3/4'

  if (dailyCover?.media_id) {
    const media = await getMediaById(c.env, dailyCover.media_id)
    if (media) {
      coverR2Key = media.r2_key
      coverAlt = media.alt || media.filename
      if (media.width && media.height) {
        coverAspectRatio = `${media.width}/${media.height}`
      }
    }
  }

  // Get nav sections
  const sections = await getHomeSections(c.env)
  const navItems = sections
    .filter(s => s.enabled && s.slug !== 'colunas' && s.slug !== 'opiniao')
    .map(s => ({
      label: s.title,
      href: s.type === 'tag' ? `/tag/${s.tagSlug}` : `/categoria/${s.slug}`,
      active: false
    }))

  navItems.push({ label: 'Opinião', href: '/opiniao', active: true })

  const html = await renderColumnPage(c, slug, {
    baseUrl,
    siteName,
    navItems,
    coverOfDay: coverR2Key ? { r2Key: coverR2Key, alt: coverAlt, aspectRatio: coverAspectRatio } : null
  })

  if (!html) return c.notFound()

  return c.html(html)
})

// ============================================================================
// Public Author Route
// ============================================================================

app.get('/autor/:slug', async (c) => {
  const slug = c.req.param('slug')
  const { findAuthorBySlug, findPublishedPosts, getSetting } = await import('../packages/core/db')

  const author = await findAuthorBySlug(c.env, slug)
  if (!author) {
    return c.notFound()
  }

  const posts = await findPublishedPosts(c.env, { authorId: author.id, limit: 30 })
  const siteName = await getSetting(c.env, 'site_name', 'public') || 'Jornal'

  const themeSetting = (await getSetting(c.env, 'site.public_theme')) || (await getSetting(c.env, 'public_theme'))
  const isEditorial = themeSetting == null || themeSetting === 'editorial' || themeSetting === 'alltype_v2' || themeSetting === 'minimal'

  if (isEditorial) {
    const { getHomeSections } = await import('../packages/core/db/home')
    const { renderEditorialLayout } = await import('../packages/core/web/layout-editorial')
    const { renderEditorialArticleCard } = await import('../packages/core/web/components/editorial-card')
    const { escapeHtml } = await import('../packages/core/web/layout')

    const sections = await getHomeSections(c.env)
    const navItems = sections
      .filter(s => s.enabled)
      .map(s => ({
        label: s.title,
        href: s.type === 'tag' ? `/tag/${s.tagSlug}` : `/categoria/${s.slug}`,
        active: false
      }))

    const baseUrl = c.env.PUBLIC_BASE_URL || new URL(c.req.url).origin

    const bodyHtml = `
      <header class="ed-page-header">
        <p class="ed-kicker">Autor</p>
        <h1 class="ed-page-title">${escapeHtml(author.name)}</h1>
        ${author.bio ? `<p class="ed-page-description">${escapeHtml(author.bio)}</p>` : ''}
      </header>

      <section class="ed-listing">
            ${posts.map((post: any) => renderEditorialArticleCard({
              title: post.title,
              hat: post.hat || author.name,
              excerpt: post.excerpt,
              published_at: post.published_at,
              featured_image_r2_key: post.featured_image_r2_key,
              url: getPostUrl(post, baseUrl),
              size: 'standard'
            })).join('')}
      </section>

      ${posts.length === 0 ? `<div class="ed-empty">Nenhum artigo encontrado para este autor.</div>` : ''}
    `

    const html = renderEditorialLayout({
      title: `${author.name} | ${siteName}`,
      description: author.bio || `Artigos de ${author.name}`,
      canonicalUrl: `${baseUrl}/autor/${author.slug}`,
      nonce: c.get('cspNonce') || '',
      siteName,
      navItems,
      bodyHtml,
      baseUrl
    })
    return c.html(html)
  }

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
                        <a href="${getPostUrl(post)}">
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


// ============================================================================
// V1 Public Web Routes (Google Blog Style)
// ============================================================================
// Mount V1 Router
app.route('/', await import('../packages/core/web/routes-v1').then(m => m.default))


app.get('/assinar', async (c) => {
  const { renderSubscribePage } = await import('../packages/core/web/subscribe')
  const { getHomeSections } = await import('../packages/core/db/home')
  const { getSetting } = await import('../packages/core/db')

  const baseUrl = new URL(c.req.url).origin
  const siteName = await getSetting(c.env, 'site_name', 'public') || 'Jornal'
  const sections = await getHomeSections(c.env)

  const navItems = sections.map(s => ({
    label: s.title,
    href: s.type === 'tag' ? `/tag/${s.tagSlug}` : `/categoria/${s.slug}`,
    active: false
  }))

  const html = await renderSubscribePage(c, {
    baseUrl,
    siteName,
    navItems
  })

  return c.html(html)
})

app.get('/conta', async (c) => {
  const { renderAccountPage } = await import('../packages/core/web/portal/account')
  return c.html(await renderAccountPage(c))
})

app.get('/portal/account', (c) => c.redirect('/conta', 301))

// ============================================================================
// Subscriber Portal UI
// ============================================================================

app.get('/portal/login', async (c) => {
  const { renderLoginPage } = await import('../packages/core/web/portal/login')
  return c.html(await renderLoginPage(c))
})

app.get('/portal/register', async (c) => {
  const { renderRegisterPage } = await import('../packages/core/web/portal/register')
  return c.html(await renderRegisterPage(c))
})

app.get('/portal', async (c) => {
  const { renderDashboardPage } = await import('../packages/core/web/portal/dashboard')
  return c.html(await renderDashboardPage(c))
})

// ============================================================================
// Subscriber Portal API
// ============================================================================

// POST /api/portal/auth/register - Register new subscriber
app.post('/api/portal/auth/register', async (c) => {
  const { createSubscriber, createSubscriberSession, getSubscriberByEmail } = await import('../packages/core/db')
  const { validateEmail } = await import('../packages/core/middleware/validation')
  const { setCookie } = await import('hono/cookie')
  const { v4: uuidv4 } = await import('uuid')

  const body = await c.req.json()
  const { email, password, name, phone, cpf } = body

  if (!email || !password || password.length < 8) {
    return c.json({ success: false, error: 'Email required and password must be at least 8 chars' }, 400)
  }

  if (!validateEmail(email)) {
    return c.json({ success: false, error: 'Invalid email format' }, 400)
  }

  try {
    const existing = await getSubscriberByEmail(c.env, email)
    if (existing) {
      return c.json({ success: false, error: 'Email already registered' }, 400)
    }

    const subscriberId = await createSubscriber(c.env, {
      email,
      password,
      name,
      phone,
      cpf
    })

    // Create session
    const token = uuidv4()
    // For MVP we just use the token as hash. In prod, hash it.
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    await createSubscriberSession(c.env, subscriberId, token, expiresAt)

    // Set Cookie
    setCookie(c, 'subscriber_session', token, {
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'Lax',
      maxAge: 30 * 24 * 60 * 60,
    })

    return c.json({ success: true, message: 'Welcome to the club', subscriberId })
  } catch (err: any) {
    console.error('Registration error:', err)
    return c.json({ success: false, error: 'Registration failed' }, 500)
  }
})

// POST /api/portal/auth/login - Login subscriber
app.post('/api/portal/auth/login', async (c) => {
  const { getSubscriberByEmail, createSubscriberSession, updateSubscriberLastLogin } = await import('../packages/core/db')
  const { verifyPassword } = await import('../packages/core/auth/password')
  const { setCookie } = await import('hono/cookie')
  const { v4: uuidv4 } = await import('uuid')

  const body = await c.req.json()
  const { email, password } = body

  if (!email || !password) {
    return c.json({ success: false, error: 'Missing credentials' }, 400)
  }

  const subscriber = await getSubscriberByEmail(c.env, email)

  if (!subscriber || !subscriber.password_hash) {
    // Timing attack mitigation + privacy
    return c.json({ success: false, error: 'Invalid credentials' }, 401)
  }

  const isValid = await verifyPassword(password, subscriber.password_hash)

  if (!isValid) {
    return c.json({ success: false, error: 'Invalid credentials' }, 401)
  }

  // Success
  const token = uuidv4()
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
  await createSubscriberSession(c.env, subscriber.id, token, expiresAt)
  await updateSubscriberLastLogin(c.env, subscriber.id)

  setCookie(c, 'subscriber_session', token, {
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'Lax',
    maxAge: 30 * 24 * 60 * 60,
  })

  return c.json({ success: true, message: 'Authenticated' })
})

// POST /api/portal/auth/logout - Logout
app.post('/api/portal/auth/logout', async (c) => {
  const { getCookie, deleteCookie } = await import('hono/cookie')
  const { deleteSubscriberSession } = await import('../packages/core/db')

  const token = getCookie(c, 'subscriber_session')
  if (token) {
    await deleteSubscriberSession(c.env, token)
  }

  deleteCookie(c, 'subscriber_session')
  return c.json({ success: true })
})

// GET /api/portal/dashboard - Main Dashboard Data
app.get('/api/portal/dashboard', async (c) => {
  const { subscriberAuthMiddleware } = await import('../packages/core/middleware')
  const { getSubscriptionStatus, getLatestOpenInvoice } = await import('../packages/core/db')

  await subscriberAuthMiddleware(c, async () => { })
  const subscriber = c.get('subscriber')

  if (!subscriber) {
    return c.json({ success: false, error: 'Unauthorized' }, 401)
  }

  // Parallel fetch for speed
  const [subStatus, latestInvoice, allInvoices] = await Promise.all([
    getSubscriptionStatus(c.env, subscriber.id),
    getLatestOpenInvoice(c.env, subscriber.id),
    c.env.DB.prepare('SELECT id, amount, status, due_date, payment_url, paid_at FROM invoices WHERE subscriber_id = ? ORDER BY due_date DESC LIMIT 12').bind(subscriber.id).all()
  ])

  // Construct Contract Response
  return c.json({
    subscriber: {
      name: subscriber.name || subscriber.email.split('@')[0],
      email: subscriber.email
    },
    subscription: {
      plan_type: subStatus.planType || 'none', // monthly, yearly, none
      status: subStatus.status, // active, past_due, canceled, none
      current_period_end: subStatus.periodEnd,
      is_premium: subStatus.isPremium,
      grace_until: null // TODO: implement grace logic if needed
    },
    next_invoice: latestInvoice ? {
      status: latestInvoice.status,
      amount: latestInvoice.amount,
      due_date: latestInvoice.due_date.includes('T')
        ? latestInvoice.due_date
        : `${latestInvoice.due_date}T00:00:00.000Z`,
      payment_url: latestInvoice.payment_url
    } : null,
    invoices: (allInvoices.results || []).map((inv: any) => ({
      id: inv.id,
      amount: inv.amount,
      status: inv.status,
      due_date: inv.due_date,
      paid_at: inv.paid_at,
      payment_url: inv.payment_url
    }))
  })
})

// GET /api/portal/me - Current user session
app.get('/api/portal/me', async (c) => {
  const { subscriberAuthMiddleware } = await import('../packages/core/middleware')

  // Manual middleware call for this route
  await subscriberAuthMiddleware(c, async () => { })

  const subscriber = c.get('subscriber')
  if (!subscriber) {
    return c.json({ success: false, isAuthenticated: false }, 401)
  }

  return c.json({
    success: true,
    isAuthenticated: true,
    subscriber: {
      id: subscriber.id,
      email: subscriber.email,
      name: subscriber.name,
      phone: subscriber.phone,
      cpf: subscriber.cpf,
      status: subscriber.status,
      created_at: subscriber.created_at
    }
  })
})

// POST /api/portal/assinatura/start - Initiate checkout
app.post('/api/portal/assinatura/start', async (c) => {
  const { subscriberAuthMiddleware } = await import('../packages/core/middleware')
  const { createSubscriptionFlow } = await import('../packages/core/integrations/asaas')

  await subscriberAuthMiddleware(c, async () => { })
  const subscriber = c.get('subscriber')
  if (!subscriber) return c.json({ success: false, error: 'Unauthorized' }, 401)

  const body = await c.req.json()
  const { plan } = body

  if (plan !== 'mensal' && plan !== 'anual') {
    return c.json({ success: false, error: 'Invalid plan' }, 400)
  }

  try {
    const result = await createSubscriptionFlow(c.env, subscriber.id, plan)
    return c.json({ success: true, ...result })
  } catch (err: any) {
    console.error('Subscription error details:', {
      message: err.message,
      stack: err.stack,
      subscriberId: subscriber.id,
      plan
    })
    return c.json({ success: false, error: 'Checkout failed: ' + err.message }, 500)
  }
})

// PATCH /api/portal/account - Update profile
app.patch('/api/portal/account', async (c) => {
  const { subscriberAuthMiddleware } = await import('../packages/core/middleware')
  const { updateSubscriberProfile } = await import('../packages/core/db')

  await subscriberAuthMiddleware(c, async () => { })
  const subscriber = c.get('subscriber')
  if (!subscriber) return c.json({ success: false, error: 'Unauthorized' }, 401)

  try {
    const body = await c.req.json()
    const { name, phone } = body

    await updateSubscriberProfile(c.env, subscriber.id, { name, phone })

    return c.json({ success: true })
  } catch (err: any) {
    console.error('Update profile error:', err)
    return c.json({ success: false, error: err.message }, 500)
  }
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
  await limiter(c as any, async () => { })

  try {
    // Authenticate webhook via settings
    const webhookToken = await getSetting(c.env, 'asaas.webhook_token', 'private')
    const providedToken = c.req.header('asaas-access-token') // Asaas header

    // If token configured, validate it
    if (webhookToken && providedToken !== webhookToken) {
      //   return c.json({ success: false, error: 'Unauthorized' }, 401)
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
    }

    // RACE-FREE IDEMPOTENCY: Try INSERT into webhook_events UNIQUE(stable_key)
    // Using Migration 0018 expanded fields
    try {
      await c.env.DB.prepare(`
          INSERT INTO webhook_events(
            provider, event_id, event_type, payload_hash, payload_json, stable_key, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'pending', datetime('now'))
        `).bind(
        'asaas',
        eventId,
        event.event,
        payloadHash,
        bodyText,
        stableKey
      ).run()

    } catch (error: any) {
      // PRIMARY KEY collision → duplicate stable_key
      if (error.message && (error.message.includes('UNIQUE constraint failed') || error.message.includes('ConstraintViolation'))) {
        return c.json({ success: true, message: 'Event already processed' })
      }
      throw error
    }

    // Process
    await handleAsaasWebhook(c.env, event, requestId)

    // Mark as processed
    await c.env.DB.prepare(
      'UPDATE webhook_events SET status = ?, processed_at = datetime(\'now\') WHERE event_id = ?'
    ).bind('processed', eventId).run()

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
      < !DOCTYPE html >
        <html lang="pt-BR" >
          <head>
          <meta charset="UTF-8" >
            <meta name="viewport" content = "width=device-width, initial-scale=1.0" >
              <title>Página não encontrada </title>
                < link href = "/static/styles.css" rel = "stylesheet" >
                  </head>
                  < body class="bg-gray-50" >
                    <div class="container mx-auto px-4 py-8 text-center" >
                      <h1 class="text-6xl font-bold text-gray-900 mb-4" > 404 </h1>
                        < p class="text-xl text-gray-700 mb-8" > Página não encontrada </p>
                          < a href = "/" class="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700" >
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
  const { handleUsersList } = await import('../packages/core/admin/users')
  return handleUsersList(c)
})

// GET /admin/users/new - New user form
app.get('/admin/users/new', async (c) => {
  const { handleUsersNew } = await import('../packages/core/admin/users')
  return handleUsersNew(c)
})

// POST /admin/users - Create user
app.post('/admin/users', async (c) => {
  const { handleUsersCreate } = await import('../packages/core/admin/users')
  return handleUsersCreate(c)
})

// GET /admin/users/:id - Edit user form
app.get('/admin/users/:id{[0-9]+}', async (c) => {
  const { handleUsersEdit } = await import('../packages/core/admin/users')
  return handleUsersEdit(c)
})

// POST /admin/users/:id - Update user
app.post('/admin/users/:id{[0-9]+}', async (c) => {
  const { handleUsersUpdate } = await import('../packages/core/admin/users')
  return handleUsersUpdate(c)
})

// POST /admin/users/:id/reset-password - Reset password
app.post('/admin/users/:id{[0-9]+}/reset-password', async (c) => {
  const { handleUsersResetPassword } = await import('../packages/core/admin/users')
  return handleUsersResetPassword(c)
})

// POST /admin/users/:id/disable - Disable user
app.post('/admin/users/:id{[0-9]+}/disable', async (c) => {
  const { handleUsersDisable } = await import('../packages/core/admin/users')
  return handleUsersDisable(c)
})

// POST /admin/users/:id/enable - Enable user
app.post('/admin/users/:id{[0-9]+}/enable', async (c) => {
  const { handleUsersEnable } = await import('../packages/core/admin/users')
  return handleUsersEnable(c)
})

app.post('/admin/users/:id{[0-9]+}/ensure-author', async (c) => {
  const { handleUsersEnsureAuthor } = await import('../packages/core/admin/users')
  return handleUsersEnsureAuthor(c)
})

app.post('/admin/users/:id{[0-9]+}/delete', async (c) => {
  const { handleUsersDelete } = await import('../packages/core/admin/users')
  return handleUsersDelete(c)
})

// ============================================================================
// Admin Subscribers Routes (RBAC: Director only)
// ============================================================================

// ============================================================================
// Admin Redação IA Routes
// ============================================================================

app.get('/admin/redacao-ia', async (c) => {
  const { renderEditorialAiDashboard } = await import('../packages/core/admin/editorial-ai')
  return renderEditorialAiDashboard(c)
})

app.get('/admin/redacao-ia/fontes', async (c) => {
  const { renderEditorialSourcesPage } = await import('../packages/core/admin/editorial-ai')
  return renderEditorialSourcesPage(c)
})

app.post('/admin/redacao-ia/fontes', async (c) => {
  const { handleEditorialSourceCreate } = await import('../packages/core/admin/editorial-ai')
  return handleEditorialSourceCreate(c)
})

app.post('/admin/redacao-ia/fontes/sincronizar', async (c) => {
  const { handleEditorialSourcesSync } = await import('../packages/core/admin/editorial-ai')
  return handleEditorialSourcesSync(c)
})

app.post('/admin/redacao-ia/fontes/:id{[0-9]+}/sincronizar', async (c) => {
  const { handleEditorialSourceSync } = await import('../packages/core/admin/editorial-ai')
  return handleEditorialSourceSync(c, Number(c.req.param('id')))
})

app.post('/admin/redacao-ia/fontes/:id{[0-9]+}/estado', async (c) => {
  const { handleEditorialSourceState } = await import('../packages/core/admin/editorial-ai')
  return handleEditorialSourceState(c, Number(c.req.param('id')))
})

app.get('/admin/redacao-ia/radar', async (c) => {
  const { renderEditorialRadarPage } = await import('../packages/core/admin/editorial-ai')
  return renderEditorialRadarPage(c)
})

app.post('/admin/redacao-ia/radar/:id{[0-9]+}/pauta', async (c) => {
  const { handleEditorialFeedItemWorkspace } = await import('../packages/core/admin/editorial-ai')
  return handleEditorialFeedItemWorkspace(c, Number(c.req.param('id')))
})

app.post('/admin/redacao-ia/radar/:id{[0-9]+}/estado', async (c) => {
  const { handleEditorialFeedItemState } = await import('../packages/core/admin/editorial-ai')
  return handleEditorialFeedItemState(c, Number(c.req.param('id')))
})

app.post('/admin/redacao-ia/pautas/post/:postId{[0-9]+}', async (c) => {
  const { handleEditorialPostWorkspace } = await import('../packages/core/admin/editorial-ai')
  return handleEditorialPostWorkspace(c, Number(c.req.param('postId')))
})

app.get('/admin/redacao-ia/pautas/:id{[0-9]+}', async (c) => {
  const { renderEditorialWorkspacePage } = await import('../packages/core/admin/editorial-ai')
  return renderEditorialWorkspacePage(c, Number(c.req.param('id')))
})

app.post('/admin/redacao-ia/pautas/:id{[0-9]+}/briefing', async (c) => {
  const { handleEditorialWorkspaceBrief } = await import('../packages/core/admin/editorial-ai')
  return handleEditorialWorkspaceBrief(c, Number(c.req.param('id')))
})

app.post('/admin/redacao-ia/pautas/:id{[0-9]+}/materiais', async (c) => {
  const { handleEditorialMaterialCreate } = await import('../packages/core/admin/editorial-ai')
  return handleEditorialMaterialCreate(c, Number(c.req.param('id')))
})

app.post('/admin/redacao-ia/pautas/:id{[0-9]+}/triagem', async (c) => {
  const { handleEditorialTriage } = await import('../packages/core/admin/editorial-ai')
  return handleEditorialTriage(c, Number(c.req.param('id')))
})

app.post('/admin/redacao-ia/pautas/:id{[0-9]+}/rascunho', async (c) => {
  const { handleEditorialDraft } = await import('../packages/core/admin/editorial-ai')
  return handleEditorialDraft(c, Number(c.req.param('id')))
})

app.post('/admin/redacao-ia/pautas/:id{[0-9]+}/copidesque', async (c) => {
  const { handleEditorialCopydesk } = await import('../packages/core/admin/editorial-ai')
  return handleEditorialCopydesk(c, Number(c.req.param('id')))
})

app.post('/admin/redacao-ia/pautas/:id{[0-9]+}/checagem', async (c) => {
  const { handleEditorialFactCheck } = await import('../packages/core/admin/editorial-ai')
  return handleEditorialFactCheck(c, Number(c.req.param('id')))
})

app.post('/admin/redacao-ia/pautas/:id{[0-9]+}/afirmacoes/:claimId{[0-9]+}', async (c) => {
  const { handleEditorialClaimReview } = await import('../packages/core/admin/editorial-ai')
  return handleEditorialClaimReview(c, Number(c.req.param('id')), Number(c.req.param('claimId')))
})

app.post('/admin/redacao-ia/pautas/:id{[0-9]+}/aplicar', async (c) => {
  const { handleEditorialRevisionApply } = await import('../packages/core/admin/editorial-ai')
  return handleEditorialRevisionApply(c, Number(c.req.param('id')))
})

app.post('/admin/redacao-ia/pautas/:id{[0-9]+}/aprovar', async (c) => {
  const { handleEditorialWorkspaceApprove } = await import('../packages/core/admin/editorial-ai')
  return handleEditorialWorkspaceApprove(c, Number(c.req.param('id')))
})

app.post('/api/n8n/editorial/rss/sync', async (c) => {
  const { handleN8nEditorialRssSync } = await import('../packages/core/admin/editorial-ai')
  return handleN8nEditorialRssSync(c)
})

// ============================================================================
// Admin Newsletters Routes
// ============================================================================

app.get('/admin/newsletters', async (c) => {
  const { requireEditor } = await import('../packages/core/middleware/rbac')
  const accessResponse = await requireEditor(c, async () => { })
  if (accessResponse) return accessResponse
  const { handleNewslettersList } = await import('../packages/core/admin/newsletters')
  return handleNewslettersList(c)
})

app.get('/admin/newsletters/new', async (c) => {
  const { requireEditor } = await import('../packages/core/middleware/rbac')
  const accessResponse = await requireEditor(c, async () => { })
  if (accessResponse) return accessResponse
  const { handleNewsletterNew } = await import('../packages/core/admin/newsletters')
  return handleNewsletterNew(c)
})

app.post('/admin/newsletters', async (c) => {
  const { requireEditor } = await import('../packages/core/middleware/rbac')
  const accessResponse = await requireEditor(c, async () => { })
  if (accessResponse) return accessResponse
  const { handleNewsletterCreate } = await import('../packages/core/admin/newsletters')
  return handleNewsletterCreate(c)
})

app.post('/admin/newsletters/audience', async (c) => {
  const { requireDirector } = await import('../packages/core/middleware/rbac')
  const accessResponse = await requireDirector(c, async () => { })
  if (accessResponse) return accessResponse
  const { handleNewsletterAudienceAdd } = await import('../packages/core/admin/newsletters')
  return handleNewsletterAudienceAdd(c)
})

app.get('/admin/newsletters/:id{[0-9]+}', async (c) => {
  const { requireEditor } = await import('../packages/core/middleware/rbac')
  const accessResponse = await requireEditor(c, async () => { })
  if (accessResponse) return accessResponse
  const { handleNewsletterDetail } = await import('../packages/core/admin/newsletters')
  return handleNewsletterDetail(c)
})

app.get('/admin/newsletters/:id{[0-9]+}/edit', async (c) => {
  const { requireEditor } = await import('../packages/core/middleware/rbac')
  const accessResponse = await requireEditor(c, async () => { })
  if (accessResponse) return accessResponse
  const { handleNewsletterEdit } = await import('../packages/core/admin/newsletters')
  return handleNewsletterEdit(c)
})

app.post('/admin/newsletters/:id{[0-9]+}/edit', async (c) => {
  const { requireEditor } = await import('../packages/core/middleware/rbac')
  const accessResponse = await requireEditor(c, async () => { })
  if (accessResponse) return accessResponse
  const { handleNewsletterUpdate } = await import('../packages/core/admin/newsletters')
  return handleNewsletterUpdate(c)
})

app.get('/admin/newsletters/:id{[0-9]+}/preview', async (c) => {
  const { requireEditor } = await import('../packages/core/middleware/rbac')
  const accessResponse = await requireEditor(c, async () => { })
  if (accessResponse) return accessResponse
  const { handleNewsletterPreview } = await import('../packages/core/admin/newsletters')
  return handleNewsletterPreview(c)
})

app.post('/admin/newsletters/:id{[0-9]+}/test', async (c) => {
  const { requireEditor } = await import('../packages/core/middleware/rbac')
  const accessResponse = await requireEditor(c, async () => { })
  if (accessResponse) return accessResponse
  const { handleNewsletterTest } = await import('../packages/core/admin/newsletters')
  return handleNewsletterTest(c)
})

app.post('/admin/newsletters/:id{[0-9]+}/send', async (c) => {
  const { requireDirector } = await import('../packages/core/middleware/rbac')
  const accessResponse = await requireDirector(c, async () => { })
  if (accessResponse) return accessResponse
  const { handleNewsletterSend } = await import('../packages/core/admin/newsletters')
  return handleNewsletterSend(c)
})

// ============================================================================
// Admin Instagram Routes
// ============================================================================

app.get('/admin/instagram', async (c) => {
  const { handleInstagramList } = await import('../packages/core/admin/instagram')
  return handleInstagramList(c)
})

app.get('/admin/instagram/new', async (c) => {
  const { handleInstagramNew } = await import('../packages/core/admin/instagram')
  return handleInstagramNew(c)
})

app.post('/admin/instagram', async (c) => {
  const { handleInstagramCreate } = await import('../packages/core/admin/instagram')
  return handleInstagramCreate(c)
})

app.get('/admin/instagram/:id{[0-9]+}', async (c) => {
  const { handleInstagramDetail } = await import('../packages/core/admin/instagram')
  return handleInstagramDetail(c)
})

app.post('/admin/instagram/:id{[0-9]+}/edit', async (c) => {
  const { handleInstagramUpdate } = await import('../packages/core/admin/instagram')
  return handleInstagramUpdate(c)
})

app.post('/admin/instagram/:id{[0-9]+}/story/edit', async (c) => {
  const { handleInstagramStoryUpdate } = await import('../packages/core/admin/instagram')
  return handleInstagramStoryUpdate(c)
})

app.post('/admin/instagram/:id{[0-9]+}/caption', async (c) => {
  const { handleInstagramCaption } = await import('../packages/core/admin/instagram')
  return handleInstagramCaption(c)
})

app.post('/admin/instagram/:id{[0-9]+}/approve', async (c) => {
  const { handleInstagramApprove } = await import('../packages/core/admin/instagram')
  return handleInstagramApprove(c)
})

app.post('/admin/instagram/:id{[0-9]+}/publish', async (c) => {
  const { handleInstagramPublish } = await import('../packages/core/admin/instagram')
  return handleInstagramPublish(c)
})

// Public tokenized artwork URL consumed by the n8n rasterization step.
app.get('/artes/editoriais/:token', async (c) => {
  const { handleInstagramArtwork } = await import('../packages/core/web/instagram')
  return handleInstagramArtwork(c)
})

app.get('/artes/stories/:token', async (c) => {
  const { handleInstagramStoryArtwork } = await import('../packages/core/web/instagram')
  return handleInstagramStoryArtwork(c)
})

// Authenticated n8n callback for caption and Meta publication status.
app.patch('/api/n8n/instagram/:id{[0-9]+}', async (c) => {
  const { handleInstagramN8nCallback } = await import('../packages/core/web/instagram')
  return handleInstagramN8nCallback(c)
})

app.post('/api/n8n/instagram/:id{[0-9]+}', async (c) => {
  const { handleInstagramN8nCallback } = await import('../packages/core/web/instagram')
  return handleInstagramN8nCallback(c)
})

// Public, tokenized newsletter preference routes.
app.get('/newsletter/unsubscribe/:token', async (c) => {
  const { handleNewsletterUnsubscribePage } = await import('../packages/core/web/newsletter')
  return handleNewsletterUnsubscribePage(c)
})

app.post('/newsletter/unsubscribe/:token', async (c) => {
  const { handleNewsletterUnsubscribe } = await import('../packages/core/web/newsletter')
  return handleNewsletterUnsubscribe(c)
})

app.post('/api/newsletter/unsubscribe/:token', async (c) => {
  const { handleNewsletterOneClickUnsubscribe } = await import('../packages/core/web/newsletter')
  return handleNewsletterOneClickUnsubscribe(c)
})

// GET /admin/subscribers - List subscribers
app.get('/admin/subscribers', async (c) => {
  const { requireDirector } = await import('../packages/core/middleware/rbac')
  const accessResponse = await requireDirector(c, async () => { })
  if (accessResponse) return accessResponse
  const { handleSubscribersList } = await import('../packages/core/admin/subscribers')
  return handleSubscribersList(c)
})

// GET /admin/subscribers/:id - Subscriber detail
app.get('/admin/subscribers/:id{[0-9]+}', async (c) => {
  const { requireDirector } = await import('../packages/core/middleware/rbac')
  const accessResponse = await requireDirector(c, async () => { })
  if (accessResponse) return accessResponse
  const { handleSubscriberDetail } = await import('../packages/core/admin/subscribers')
  return handleSubscriberDetail(c)
})

// POST /admin/subscribers/:id/status - Update account status
app.post('/admin/subscribers/:id{[0-9]+}/status', async (c) => {
  const { requireDirector } = await import('../packages/core/middleware/rbac')
  const accessResponse = await requireDirector(c, async () => { })
  if (accessResponse) return accessResponse
  const { handleUpdateStatus } = await import('../packages/core/admin/subscribers')
  return handleUpdateStatus(c)
})

// POST /admin/subscribers/:id/grant-complimentary - Grant manual subscription
app.post('/admin/subscribers/:id{[0-9]+}/grant-complimentary', async (c) => {
  const { requireDirector } = await import('../packages/core/middleware/rbac')
  const accessResponse = await requireDirector(c, async () => { })
  if (accessResponse) return accessResponse
  const { handleGrantComplimentary } = await import('../packages/core/admin/subscribers')
  return handleGrantComplimentary(c)
})

// ============================================================================
// 13. R2 Image Serving
// ============================================================================

app.get('/i/:key{.+}', async (c) => {
  const key = c.req.param('key')
  const w = c.req.query('w')
  const h = c.req.query('h')
  const fit = c.req.query('fit')
  const noredir = c.req.query('noredir')

  // 1. If it's a request for a static asset from the repo
  if (key.startsWith('static/')) {
    const origin = new URL(c.req.url).origin
    const assetUrl = `${origin}/${key}`

    if (w || h) {
      try {
        // @ts-ignore - Cloudflare Image Resizing
        const response = await fetch(assetUrl, {
          cf: {
            image: {
              width: w ? parseInt(w) : undefined,
              height: h ? parseInt(h) : undefined,
              fit: (fit as any) || 'scale-down',
              quality: 85
            }
          }
        })
        if (response.ok) return response
      } catch (e) {
        console.error('Static resizing failed:', e)
      }
    }
    return fetch(assetUrl)
  }

  // 2. If it's an R2 request with resizing requested
  if ((w || h) && noredir !== '1') {
    const url = new URL(c.req.url)
    url.searchParams.set('noredir', '1')

    try {
      // @ts-ignore - Cloudflare Image Resizing
      const response = await fetch(url.toString(), {
        cf: {
          image: {
            width: w ? parseInt(w) : undefined,
            height: h ? parseInt(h) : undefined,
            fit: (fit as any) || 'scale-down',
            quality: 85
          }
        }
      })
      if (response.ok) return response
    } catch (e) {
      console.error('R2 resizing failed:', e)
    }
  }

  // 3. Raw serving from R2
  try {
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
// Public Static Pages Routes
// ============================================================================

app.get('/p/:slug', async (c) => {
  const slug = c.req.param('slug')
  const { renderStaticPage } = await import('../packages/core/web/pages')

  const html = await renderStaticPage(c as any, slug)

  if (!html) {
    return c.notFound()
  }

  return c.html(html)
})

// ============================================================================
// 14. 404 Handler
// ============================================================================

// Fallback debug
app.get('*', (c) => {
  console.log(`[DEBUG] Fallback route matched for: ${c.req.url}`)
  return c.notFound()
})

export default app
