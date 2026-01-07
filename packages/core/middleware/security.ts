/**
 * Middleware: Security Headers & CORS
 */

import { Context, Next } from 'hono'
import type { Env } from '../types'

export async function securityHeaders(c: Context<{ Bindings: Env }>, next: Next) {
  await next()

  // Get CSP allowlist from settings (cached in KV)
  let cspAllowlist: string[] = []
  try {
    const cached = await c.env.KV.get('settings:public:csp_allowlist')
    if (cached) {
      cspAllowlist = JSON.parse(cached)
    }
  } catch (error) {
    console.error('Failed to load CSP allowlist:', error)
  }

  // Default CSP
  const defaultSources = [
    "'self'",
    'https://cdn.tailwindcss.com',
    'https://cdn.jsdelivr.net',
    'https://*.cloudflare.com',
  ]

  // Adicionar ads se configurado
  const adSources = [
    'https://*.googletagservices.com',
    'https://*.googlesyndication.com',
    'https://*.google.com',
    'https://*.doubleclick.net',
  ]

  const allSources = [...defaultSources, ...adSources, ...cspAllowlist]

  const csp = [
    `default-src 'self'`,
    `script-src ${allSources.join(' ')} 'unsafe-inline' 'unsafe-eval'`, // unsafe necessário para ads
    `style-src ${allSources.join(' ')} 'unsafe-inline'`,
    `img-src ${allSources.join(' ')} data: blob:`,
    `font-src ${allSources.join(' ')} data:`,
    `connect-src ${allSources.join(' ')}`,
    `frame-src ${allSources.join(' ')}`,
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
}

// ============================================================================
// CORS (para APIs públicas)
// ============================================================================

export async function corsMiddleware(c: Context, next: Next) {
  // Permitir CORS para APIs públicas
  const origin = c.req.header('Origin')
  if (origin) {
    c.header('Access-Control-Allow-Origin', origin)
    c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    c.header('Access-Control-Max-Age', '86400')
  }

  if (c.req.method === 'OPTIONS') {
    return c.text('', 204)
  }

  await next()
}

// ============================================================================
// CSRF Protection (admin apenas)
// ============================================================================

export async function csrfProtection(c: Context<{ Bindings: Env }>, next: Next) {
  if (c.req.method === 'GET' || c.req.method === 'HEAD' || c.req.method === 'OPTIONS') {
    await next()
    return
  }

  const token = c.req.header('X-CSRF-Token')
  if (!token) {
    return c.json({ success: false, error: 'CSRF token ausente' }, 403)
  }

  // Verificar token no KV (gerado no login)
  const storedToken = await c.env.KV.get(`csrf:${token}`)
  if (!storedToken) {
    return c.json({ success: false, error: 'CSRF token inválido ou expirado' }, 403)
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
