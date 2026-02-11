/**
 * Middleware: Security Headers & CORS
 */

import type { Context, Next } from 'hono'
import type { Env, AppContext } from '../types'
import { randomBytes, toBase64Url } from '../utils'

/**
 * Generate CSP nonce (16 random bytes → base64url)
 * Uses safe helper without spread operator
 * base64url is URL-safe (no +, /, or = chars)
 */
function generateNonce(): string {
  const bytes = randomBytes(16)
  return toBase64Url(bytes)
}

export async function securityHeaders(c: Context<{ Bindings: Env; Variables: AppContext }>, next: Next): Promise<void> {
  // Generate nonce BEFORE processing request
  const nonce = generateNonce()
  c.set('cspNonce', nonce)

  await next()

  const { getSetting } = await import('../db')

  // Get ads provider mode and CSP settings
  const providerMode = (await getSetting(c.env, 'ads.provider_mode', 'public')) as string || 'off'
  const allowUnsafeEval = (await getSetting(c.env, 'ads.csp_allow_unsafe_eval', 'public')) as boolean || false

  // CSP by directive (fallback to legacy csp_allowlist)
  let scriptHosts = (await getSetting(c.env, 'ads.csp.script_hosts', 'public')) as string[] || []
  let frameHosts = (await getSetting(c.env, 'ads.csp.frame_hosts', 'public')) as string[] || []
  let connectHosts = (await getSetting(c.env, 'ads.csp.connect_hosts', 'public')) as string[] || []
  let imgHosts = (await getSetting(c.env, 'ads.csp.img_hosts', 'public')) as string[] || []

  // Fallback to legacy csp_allowlist if new settings don't exist
  const legacyAllowlist = (await getSetting(c.env, 'ads.csp_allowlist', 'public')) as string[] || []
  if (Array.isArray(legacyAllowlist) && legacyAllowlist.length > 0) {
    if (!scriptHosts || scriptHosts.length === 0) scriptHosts = legacyAllowlist
    if (!frameHosts || frameHosts.length === 0) frameHosts = legacyAllowlist
    if (!connectHosts || connectHosts.length === 0) connectHosts = legacyAllowlist
    if (!imgHosts || imgHosts.length === 0) imgHosts = legacyAllowlist
  }

  // Base sources
  const baseSources = ["'self'", 'https://cdn.jsdelivr.net']

  // Ads sources (only if provider_mode != 'off')
  // We ALWAYS allow Google Analytics (googletagmanager) regardless of ads mode
  const analyticsHosts = [
    '*.googletagmanager.com',
    'https://www.googletagmanager.com',
    '*.google-analytics.com',
    'https://www.google-analytics.com'
  ]

  const adsScriptHosts = providerMode !== 'off' ? [
    '*.googletagservices.com',
    '*.googlesyndication.com',
    '*.google.com',
    '*.doubleclick.net',
    'securepubads.g.doubleclick.net',
    'googleads.g.doubleclick.net',
    'tpc.googlesyndication.com',
    ...analyticsHosts,
    ...scriptHosts
  ] : [...analyticsHosts, ...scriptHosts]

  const adsFrameHosts = providerMode !== 'off' ? [
    '*.googlesyndication.com',
    '*.google.com',
    '*.doubleclick.net',
    ...analyticsHosts,
    ...frameHosts
  ] : [...analyticsHosts, ...frameHosts]

  const adsConnectHosts = providerMode !== 'off' ? [
    '*.googlesyndication.com',
    '*.google.com',
    '*.doubleclick.net',
    'https://ep1.adtrafficquality.google',
    ...analyticsHosts,
    ...connectHosts
  ] : [...analyticsHosts, ...connectHosts]

  const adsImgHosts = providerMode !== 'off' ? [
    '*.googlesyndication.com',
    '*.google.com',
    '*.doubleclick.net',
    ...analyticsHosts,
    ...imgHosts
  ] : [...analyticsHosts, ...imgHosts]

  const scriptSourcesWithPrefix = adsScriptHosts.map(h => h.startsWith('http') ? h : `https://${h}`)
  const frameSourcesWithPrefix = adsFrameHosts.map(h => h.startsWith('http') ? h : `https://${h}`)
  const connectSourcesWithPrefix = adsConnectHosts.map(h => h.startsWith('http') ? h : `https://${h}`)
  const imgSourcesWithPrefix = adsImgHosts.map(h => h.startsWith('http') ? h : `https://${h}`)

  // Build CSP directives with NONCE (NO 'unsafe-inline' for script-src)
  const scriptSources = [
    ...baseSources,
    ...scriptSourcesWithPrefix,
    `'nonce-${nonce}'`,  // ✅ NONCE instead of unsafe-inline
  ]

  // Add 'unsafe-eval' only if explicitly enabled
  if (allowUnsafeEval) {
    scriptSources.push("'unsafe-eval'")
  }

  const csp = [
    `default-src 'self'`,
    `script-src ${scriptSources.join(' ')}`,
    `style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com`,  // style can keep unsafe-inline
    `img-src 'self' data: blob: ${imgSourcesWithPrefix.join(' ')}`,
    `font-src 'self' data: https://cdn.jsdelivr.net https://fonts.gstatic.com`,
    `connect-src 'self' ${connectSourcesWithPrefix.join(' ')}`,
    `frame-src ${frameSourcesWithPrefix.join(' ')}`,
    `media-src 'self' blob:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ].join('; ')

  c.header('Content-Security-Policy', csp)
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  c.header('X-XSS-Protection', '1; mode=block')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')

  // Cache-Control for specific paths
  const path = c.req.path
  if (path.startsWith('/static/') || path.startsWith('/i/')) {
    c.header('Cache-Control', 'public, max-age=31536000, immutable')
  } else if (path === '/robots.txt' || path === '/ads.txt' || path.endsWith('.xml')) {
    c.header('Cache-Control', 'public, max-age=3600, stale-while-revalidate=600') // 1 hour for SEO/Ads files
  } else {
    // Default for public SSR pages
    c.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=59')
  }
}

// ============================================================================
// CORS (para APIs públicas)
// ============================================================================

export async function corsMiddleware(c: Context, next: Next): Promise<Response | void> {
  // Permitir CORS para APIs públicas
  const origin = c.req.header('Origin')
  if (origin) {
    c.header('Access-Control-Allow-Origin', origin)
    c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    c.header('Access-Control-Max-Age', '86400')
  }

  if (c.req.method === 'OPTIONS') {
    return c.body(null, 204)
  }

  await next()
}

// ============================================================================
// CSRF Protection (admin SSR forms + API)
// ============================================================================

export async function csrfProtection(c: Context<{ Bindings: Env; Variables: AppContext }>, next: Next): Promise<Response | void> {
  if (c.req.method === 'GET' || c.req.method === 'HEAD' || c.req.method === 'OPTIONS') {
    await next()
    return
  }

  const path = c.req.path
  let token: string | undefined

  // API routes (/api/admin/*) → check header
  if (path.startsWith('/api/admin/')) {
    token = c.req.header('X-CSRF-Token')
  }
  // SSR routes (/admin/*) → check form field
  else if (path.startsWith('/admin/')) {
    try {
      const contentType = c.req.header('content-type') || ''

      // Handle multipart/form-data (file uploads)
      if (contentType.startsWith('multipart/form-data')) {
        const formData = await c.req.formData()
        token = formData.get('csrf') as string
        // Store formData in context for handler reuse
        c.set('formData', formData)
      }
      // Handle regular form data
      else {
        const body = await c.req.parseBody()
        token = body['csrf'] as string
        // ✅ CRITICAL: Cache parsed body so handlers can reuse it
        c.set('parsedBody', body)
      }
    } catch (error) {
      console.error('Failed to parse body for CSRF:', error)
    }
  }

  if (!token) {
    // Return JSON for API, HTML for SSR
    if (path.startsWith('/api/')) {
      return c.json({ success: false, error: 'CSRF token ausente' }, 403)
    } else {
      return c.html('<h1>403 Forbidden</h1><p>CSRF token ausente</p>', 403)
    }
  }

  // Get admin user from context (set by requireAdmin)
  const adminUser = c.get('adminUser') as { id: number; email: string; role: string } | undefined
  if (!adminUser) {
    // No admin user in context → reject
    if (path.startsWith('/api/')) {
      return c.json({ success: false, error: 'Não autenticado' }, 401)
    } else {
      return c.html('<h1>401 Unauthorized</h1><p>Não autenticado</p>', 401)
    }
  }

  // Get session ID from JWT (via requireAdmin)
  const cookieHeader = c.req.header('cookie')
  let sessionId: string | null = null

  if (cookieHeader) {
    const match = cookieHeader.match(/admin_session=([^;]+)/)
    if (match) {
      const { verifyJWT } = await import('../auth')
      const payload = await verifyJWT(match[1], c.env.JWT_SECRET)
      if (payload && payload.sid) {
        sessionId = payload.sid
      }
    }
  }

  // Verificar token no KV e validar owner + sessionId
  const storedData = await c.env.KV.get(`csrf:${token}`)
  if (!storedData) {
    if (path.startsWith('/api/')) {
      return c.json({ success: false, error: 'CSRF token inválido ou expirado' }, 403)
    } else {
      return c.html('<h1>403 Forbidden</h1><p>CSRF token inválido ou expirado</p>', 403)
    }
  }

  try {
    const { uid, sid } = JSON.parse(storedData)

    // Validate: userId matches AND sessionId matches
    if (uid !== adminUser.id || sid !== sessionId) {
      if (path.startsWith('/api/')) {
        return c.json({ success: false, error: 'CSRF token não pertence à sessão atual' }, 403)
      } else {
        return c.html('<h1>403 Forbidden</h1><p>CSRF token não pertence à sessão atual</p>', 403)
      }
    }
  } catch (error) {
    console.error('Failed to parse CSRF data:', error)
    if (path.startsWith('/api/')) {
      return c.json({ success: false, error: 'CSRF token corrompido' }, 403)
    } else {
      return c.html('<h1>403 Forbidden</h1><p>CSRF token corrompido</p>', 403)
    }
  }

  await next()
}

export async function generateCSRFToken(env: Env, adminUserId: number, sessionId: string): Promise<string> {
  const { randomHex } = await import('../utils')
  const token = randomHex(32)

  // Store with admin user ID and session ID as owner (TTL 1 hora)
  await env.KV.put(
    `csrf:${token}`,
    JSON.stringify({ uid: adminUserId, sid: sessionId }),
    { expirationTtl: 3600 }
  )

  return token
}
