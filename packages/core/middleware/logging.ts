/**
 * Middleware: Request Logging
 */

import type { Context, Next } from 'hono'
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
