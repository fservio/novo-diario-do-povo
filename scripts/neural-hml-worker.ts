import { timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import { neuralEvents } from '../packages/core/editorial-ai/neural-events'
import type { Env } from '../packages/core/types'

export const app = new Hono<{ Bindings: Env }>()
app.use('/api/n8n/neural/*', async (c, next) => {
  const expected = Buffer.from(c.env.N8N_API_KEY ?? '')
  const provided = Buffer.from(c.req.header('X-API-Key') ?? '')
  if (!expected.length || provided.length !== expected.length || !timingSafeEqual(expected, provided)) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  return next()
})
app.route('/api/n8n/neural', neuralEvents)

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env) {
    if (!env.NEURAL_DISPATCH_KEY) return
    const response = await fetch('https://diario.dopovo.com.br/api/internal/neural/dispatch', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + env.NEURAL_DISPATCH_KEY },
      redirect: 'manual',
      signal: AbortSignal.timeout(600_000)
    })
    if (!response.ok) throw new Error('Redação Neural: despacho HTTP ' + response.status)
    await response.text()
  }
}
