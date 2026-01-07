/**
 * Middleware: Rate Limiting (KV-based)
 */

import type { Context, Next } from 'hono'
import type { Env } from '../types'

interface RateLimitConfig {
  maxRequests: number
  windowSeconds: number
  keyPrefix: string
}

const defaultConfigs: Record<string, RateLimitConfig> = {
  public: { maxRequests: 100, windowSeconds: 60, keyPrefix: 'rl:public' },
  auth: { maxRequests: 10, windowSeconds: 60, keyPrefix: 'rl:auth' },
  admin: { maxRequests: 200, windowSeconds: 60, keyPrefix: 'rl:admin' },
  webhook: { maxRequests: 50, windowSeconds: 60, keyPrefix: 'rl:webhook' },
  newsletter: { maxRequests: 5, windowSeconds: 300, keyPrefix: 'rl:newsletter' },
}

export function rateLimiter(configName: keyof typeof defaultConfigs = 'public') {
  return async (c: Context<{ Bindings: Env }>, next: Next): Promise<Response | void> => {
    const config = defaultConfigs[configName]
    if (!config) {
      // Fail open se config inválida
      await next()
      return
    }
    
    const identifier = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown'
    const key = `${config.keyPrefix}:${identifier}`

    try {
      const current = await c.env.KV.get(key)
      const count = current ? parseInt(current, 10) : 0

      if (count >= config.maxRequests) {
        return c.json(
          {
            success: false,
            error: 'Muitas requisições. Tente novamente mais tarde.',
          },
          429
        )
      }

      // Incrementar contador
      await c.env.KV.put(key, (count + 1).toString(), {
        expirationTtl: config.windowSeconds,
      })

      // Headers de rate limit
      c.header('X-RateLimit-Limit', config.maxRequests.toString())
      c.header('X-RateLimit-Remaining', (config.maxRequests - count - 1).toString())
      c.header('X-RateLimit-Reset', (Date.now() + config.windowSeconds * 1000).toString())

      await next()
    } catch (error) {
      console.error('Rate limiter error:', error)
      // Fail open: permitir requisição em caso de erro
      await next()
    }
  }
}

// ============================================================================
// Anti-Replay (webhooks)
// ============================================================================

export function antiReplay(windowSeconds: number = 300) {
  return async (c: Context<{ Bindings: Env }>, next: Next): Promise<Response | void> => {
    const timestamp = c.req.header('x-timestamp')
    
    if (!timestamp) {
      return c.json({ success: false, error: 'Header x-timestamp ausente' }, 400)
    }

    const timestampNum = parseInt(timestamp, 10)
    if (isNaN(timestampNum)) {
      return c.json({ success: false, error: 'Timestamp inválido' }, 400)
    }

    const now = Math.floor(Date.now() / 1000)
    const diff = Math.abs(now - timestampNum)

    if (diff > windowSeconds) {
      return c.json({ success: false, error: 'Requisição expirada (replay attack?)' }, 400)
    }

    await next()
  }
}
