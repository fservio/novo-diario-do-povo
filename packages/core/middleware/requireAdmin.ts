/**
 * Admin Auth Middleware
 * Protege rotas /admin e /api/admin
 * Lê CSRF do cookie admin_csrf (gerado no login)
 */

import type { Context, Next } from 'hono'
import type { Env, AppContext } from '../types'
import { verifyJWT } from '../auth'

export async function requireAdmin(c: Context<{ Bindings: Env; Variables: AppContext }>, next: Next): Promise<Response | void> {
  const path = c.req.path
  const isAdminRoute = path.startsWith('/admin')
  const isAdminApiRoute = path.startsWith('/api/admin')

  if (!isAdminRoute && !isAdminApiRoute) {
    await next()
    return
  }

  // Skip for login page (GET) and login POST
  if (path === '/admin/login') {
    await next()
    return
  }

  // Extract cookie
  const cookieHeader = c.req.header('cookie')
  let token: string | null = null
  let csrfToken: string | null = null

  if (cookieHeader) {
    const sessionMatch = cookieHeader.match(/admin_session=([^;]+)/)
    if (sessionMatch) {
      token = sessionMatch[1]
    }
    
    const csrfMatch = cookieHeader.match(/admin_csrf=([^;]+)/)
    if (csrfMatch) {
      csrfToken = csrfMatch[1]
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

  // Store CSRF token from cookie (no KV write per request)
  if (csrfToken) {
    c.set('csrfToken', csrfToken)
  }

  await next()
}
