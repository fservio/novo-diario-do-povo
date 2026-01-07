/**
 * Admin Auth Middleware
 * Protege rotas /admin e /api/admin
 * Gera CSRF token para cada request
 */

import type { Context, Next } from 'hono'
import type { Env, AppContext } from '../types'
import { verifyJWT } from '../auth'
import { generateCSRFToken } from './security'

export async function requireAdmin(c: Context<{ Bindings: Env; Variables: AppContext }>, next: Next): Promise<Response | void> {
  const path = c.req.path
  const isAdminRoute = path.startsWith('/admin')
  const isAdminApiRoute = path.startsWith('/api/admin')

  if (!isAdminRoute && !isAdminApiRoute) {
    await next()
    return
  }

  // Skip CSRF generation for login page (GET)
  if (path === '/admin/login' && c.req.method === 'GET') {
    await next()
    return
  }

  // Extract cookie
  const cookieHeader = c.req.header('cookie')
  let token: string | null = null

  if (cookieHeader) {
    const match = cookieHeader.match(/admin_session=([^;]+)/)
    if (match) {
      token = match[1]
    }
  }

  // Verify JWT
  let payload = null
  if (token) {
    payload = await verifyJWT(token, c.env.JWT_SECRET)
  }

  // Unauthorized
  if (!payload || payload.role !== 'admin') {
    if (isAdminApiRoute) {
      return c.json({ success: false, error: 'Unauthorized' }, 401)
    } else {
      return c.redirect('/admin/login', 302)
    }
  }

  // Store user in context
  const adminUserId = parseInt(payload.sub, 10)
  c.set('adminUser', {
    id: adminUserId,
    email: payload.email || 'admin@example.com',
    role: payload.role
  })

  // Generate CSRF token for this session
  const csrfToken = await generateCSRFToken(c.env, adminUserId)
  c.set('csrfToken', csrfToken)

  await next()
}
