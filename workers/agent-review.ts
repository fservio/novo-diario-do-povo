import { Hono } from 'hono'
import type { Env } from '../packages/core/types'
import { agentReviewRouter } from '../packages/core/editorial-ai/agent-review-router'
import { handleN8nCreatePost } from '../packages/core/web/n8n-create-post'

const app = new Hono<{ Bindings: Env }>()

app.use('/api/n8n/agent-reviews/*', async (c, next) => {
  c.header('Cache-Control', 'private, no-store')
  const key = c.req.header('X-API-Key')
  if (!key) return c.json({ success: false, error: 'Chave de acesso ausente.' }, 401)
  const setting = await c.env.DB.prepare("SELECT value_json FROM settings WHERE key = 'n8n_api_key' AND scope = 'private'")
    .first<string>('value_json')
  if (!setting || JSON.parse(setting) !== key) {
    return c.json({ success: false, error: 'Chave de acesso inválida.' }, 401)
  }
  return next()
})

app.route('/api/n8n/agent-reviews', agentReviewRouter)
app.post('/api/n8n/agent-reviews/posts', c => handleN8nCreatePost(c, true))

export default app
