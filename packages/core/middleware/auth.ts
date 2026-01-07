/**
 * Middleware: Authentication & Authorization
 */

import type { Context, Next } from 'hono'
import { verifyJWT } from '../auth'
import type { Env, AppContext } from '../types'

export async function authMiddleware(c: Context<{ Bindings: Env; Variables: AppContext }>, next: Next): Promise<Response | void> {
  const authHeader = c.req.header('Authorization')
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Não autorizado' }, 401)
  }

  const token = authHeader.substring(7)
  const payload = await verifyJWT(token, c.env.JWT_SECRET)

  if (!payload || payload.type !== 'admin') {
    return c.json({ success: false, error: 'Token inválido ou expirado' }, 401)
  }

  // Buscar usuário
  const user = await c.env.DB.prepare(
    'SELECT id, email, name, role FROM users WHERE id = ? AND is_active = 1'
  ).bind(payload.sub).first()

  if (!user) {
    return c.json({ success: false, error: 'Usuário não encontrado' }, 401)
  }

  // Adicionar ao contexto
  c.set('user', {
    id: user.id as number,
    email: user.email as string,
    role: user.role as 'admin' | 'editor',
  })

  await next()
}

export async function readerAuthMiddleware(c: Context<{ Bindings: Env; Variables: AppContext }>, next: Next): Promise<Response | void> {
  const authHeader = c.req.header('Authorization')
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Não autorizado' }, 401)
  }

  const token = authHeader.substring(7)
  const payload = await verifyJWT(token, c.env.JWT_SECRET)

  if (!payload || payload.type !== 'reader') {
    return c.json({ success: false, error: 'Token inválido ou expirado' }, 401)
  }

  // Buscar leitor e verificar assinatura
  const reader = await c.env.DB.prepare(`
    SELECT 
      ru.id,
      ru.email,
      ru.name,
      CASE WHEN e.id IS NOT NULL AND e.status = 'active' THEN 1 ELSE 0 END as is_subscriber
    FROM reader_users ru
    LEFT JOIN entitlements e ON e.reader_user_id = ru.id 
      AND e.status = 'active' 
      AND (e.current_period_end IS NULL OR e.current_period_end > datetime('now'))
    WHERE ru.id = ?
    LIMIT 1
  `).bind(payload.sub).first()

  if (!reader) {
    return c.json({ success: false, error: 'Leitor não encontrado' }, 401)
  }

  c.set('readerUser', {
    id: reader.id as number,
    email: reader.email as string,
    isSubscriber: (reader.is_subscriber as number) === 1,
  })

  await next()
}

export function requireRole(...roles: Array<'admin' | 'editor'>) {
  return async (c: Context<{ Bindings: Env; Variables: AppContext }>, next: Next): Promise<Response | void> => {
    const user = c.get('user')
    
    if (!user || !roles.includes(user.role)) {
      return c.json({ success: false, error: 'Permissão negada' }, 403)
    }

    await next()
  }
}
