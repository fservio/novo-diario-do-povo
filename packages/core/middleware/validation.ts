/**
 * Middleware: Request Validation (Zod)
 */

import type { Context, Next } from 'hono'
import { z } from 'zod'

type ValidationType = 'body' | 'query' | 'params' | 'headers'

export function validateRequest(schema: z.ZodSchema, type: ValidationType = 'body') {
  return async (c: Context, next: Next): Promise<Response | void> => {
    let data: any

    try {
      switch (type) {
        case 'body':
          data = await c.req.json()
          break
        case 'query':
          data = Object.fromEntries(new URL(c.req.url).searchParams)
          break
        case 'params':
          data = c.req.param()
          break
        case 'headers':
          data = Object.fromEntries(c.req.raw.headers)
          break
      }
    } catch (error) {
      return c.json(
        {
          success: false,
          error: 'Dados inválidos',
        },
        400
      )
    }

    const result = schema.safeParse(data)
    
    if (!result.success) {
      return c.json(
        {
          success: false,
          error: 'Validação falhou',
          details: result.error.errors,
        },
        400
      )
    }

    // Adicionar dados validados ao contexto
    c.set(`validated${type.charAt(0).toUpperCase() + type.slice(1)}`, result.data)

    await next()
  }
}
