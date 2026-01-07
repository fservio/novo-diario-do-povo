/**
 * Middleware: Security Headers & CORS
 */

import type { Context, Next } from 'hono'
import type { Env } from '../types'

export async function securityHeaders(c: Context<{ Bindings: Env }>, next: Next): Promise<void> {
  await next()

  const { getSetting } = await import('../db')
  
  // Get ads provider mode and CSP settings
  const providerMode = (await getSetting(c.env, 'ads.provider_mode', 'public')) as string || 'off'
  const allowUnsafeEval = (await getSetting(c.env, 'ads.csp_allow_unsafe_eval', 'public')) as boolean || false
  const cspAllowlistRaw = (await getSetting(c.env, 'ads.csp_allowlist', 'public')) as string[] || []
  
  // Ensure allowlist is array of hosts (no https:// prefix)
  const cspAllowlist: string[] = Array.isArray(cspAllowlistRaw) ? cspAllowlistRaw : []

  // Base sources (NO cdn.tailwindcss.com)
  const baseSources = ["'self'", 'https://cdn.jsdelivr.net']
  
  // Ads sources (only if provider_mode != 'off')
  const adsHosts = providerMode !== 'off' ? [
    '*.googletagservices.com',
    '*.googlesyndication.com',
    '*.google.com',
    '*.doubleclick.net',
    'securepubads.g.doubleclick.net',
    'googleads.g.doubleclick.net',
    'tpc.googlesyndication.com',
    ...cspAllowlist
  ] : []
  
  const adsSourcesWithPrefix = adsHosts.map(h => `https://${h}`)

  // Build CSP directives
  const scriptSources = [
    ...baseSources,
    ...adsSourcesWithPrefix,
    "'unsafe-inline'", // Required for inline scripts
  ]
  
  // Add 'unsafe-eval' only if explicitly enabled
  if (allowUnsafeEval) {
    scriptSources.push("'unsafe-eval'")
  }

  const csp = [
    `default-src 'self'`,
    `script-src ${scriptSources.join(' ')}`,
    `style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net`,
    `img-src 'self' data: blob: ${adsSourcesWithPrefix.join(' ')}`,
    `font-src 'self' data: https://cdn.jsdelivr.net`,
    `connect-src 'self' ${adsSourcesWithPrefix.join(' ')}`,
    `frame-src ${adsSourcesWithPrefix.join(' ')}`,
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

export async function csrfProtection(c: Context<{ Bindings: Env }>, next: Next): Promise<Response | void> {
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
      const body = await c.req.parseBody()
      token = body['csrf'] as string
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

  // Verificar token no KV (gerado no login)
  const storedToken = await c.env.KV.get(`csrf:${token}`)
  if (!storedToken) {
    if (path.startsWith('/api/')) {
      return c.json({ success: false, error: 'CSRF token inválido ou expirado' }, 403)
    } else {
      return c.html('<h1>403 Forbidden</h1><p>CSRF token inválido ou expirado</p>', 403)
    }
  }

  await next()
}

export async function generateCSRFToken(env: Env): Promise<string> {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const token = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  
  // Armazenar por 1 hora
  await env.KV.put(`csrf:${token}`, 'valid', { expirationTtl: 3600 })
  
  return token
}
