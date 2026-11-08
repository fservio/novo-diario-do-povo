/**
 * Middleware: Request Logging
 */

import type { Context, Next } from 'hono'
import { html } from 'hono/html'
import { generateRequestId, createLogger } from '../types'

export async function loggingMiddleware(c: Context, next: Next): Promise<void> {
  const requestId = generateRequestId()
  const logger = createLogger(requestId)

  // Adicionar ao contexto
  c.set('requestId', requestId)

  const startTime = Date.now()
  const method = c.req.method
  const url = c.req.url
  const userAgent = c.req.header('user-agent') || 'unknown'
  const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown'

  logger.info('Request started', {
    method,
    url,
    userAgent,
    ip,
  })

  try {
    await next()
    
    const duration = Date.now() - startTime
    const status = c.res.status

    logger.info('Request completed', {
      status,
      duration,
    })
  } catch (error) {
    const duration = Date.now() - startTime
    
    logger.error('Request failed', {
      error: error instanceof Error ? error.message : String(error),
      duration,
    })
    
    throw error
  }
}

// ============================================================================
// Error Handler
// ============================================================================

export function errorHandler(error: Error, c: Context) {
  const requestId = c.get('requestId') || 'unknown'
  const logger = createLogger(requestId)
  
  // Log detalhado no console (interno do Cloudflare)
  console.error(`[Unhandled Error] [${requestId}] ${error.message}\nStack: ${error.stack}`)

  logger.error('Unhandled error', {
    error: error.message,
    stack: error.stack,
  })

  if (/D1(?:_ERROR| DB).*?(?:overloaded|Too many resources consumed)/i.test(error.message)) {
    c.header('Retry-After', '15')
    c.header('Cache-Control', 'no-store')
    const message = 'O site está temporariamente ocupado. Aguarde alguns segundos e tente novamente.'
    if (['GET', 'HEAD'].includes(c.req.method) && !c.req.path.startsWith('/api/') && c.req.header('Accept')?.includes('text/html')) {
      return c.html(html`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Tente novamente em instantes · Diário do Povo</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f4ee;color:#153b4b;font:17px/1.6 system-ui,sans-serif}main{box-sizing:border-box;width:min(560px,100%);padding:32px}h1{font-size:clamp(26px,6vw,36px);line-height:1.2}a{display:inline-block;background:#153b4b;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none}small{display:block;margin-top:24px;color:#53646c;overflow-wrap:anywhere}</style></head><body><main><p>DIÁRIO DO POVO</p><h1>Voltamos em instantes</h1><p>${message}</p><a href="">Tentar novamente</a><small>Referência: ${requestId}</small></main></body></html>`, 503)
    }
    return c.json({ success: false, error: message, code: 'DB_TEMPORARILY_BUSY', requestId }, 503)
  }

  // Não expor detalhes internos em produção, exceto se for dev ou flag de debug
  const isDev = c.env?.CF_ENV !== 'prod'
  const isDebug = c.req.query('debug') === 'true'
  
  return c.json(
    {
      success: false,
      error: (isDev || isDebug) ? error.message : 'Erro interno do servidor',
      ...((isDev || isDebug) && { stack: error.stack, requestId }),
    },
    500
  )
}
