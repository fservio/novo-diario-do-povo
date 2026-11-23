import { Hono } from 'hono'
import type { D1Database } from '@cloudflare/workers-types'

export const agentReviewRouter = new Hono<{ Bindings: { DB: D1Database } }>()

agentReviewRouter.post('/claim', async (c) => {
  c.header('Cache-Control', 'private, no-store')
  const { claimAgentReview } = await import('./publication')
  return c.json({ success: true, data: await claimAgentReview(c.env.DB) })
})

agentReviewRouter.post('/:id{[0-9]+}/:operation{stage|publish|hold}', async (c) => {
  c.header('Cache-Control', 'private, no-store')
  const editorial = await import('./publication')
  const body = await c.req.json().catch((): null => null)
  const token = editorial.agentReviewToken.safeParse(body?.token)
  if (!token.success) return c.json({ success: false, error: 'Reserva editorial inválida.' }, 400)
  const id = Number(c.req.param('id'))
  const operation = c.req.param('operation')
  if (operation === 'publish') {
    const recommendation = editorial.publicationRecommendation.safeParse(body?.data)
    if (!recommendation.success) return c.json({ success: false, error: 'Recomendação inválida.' }, 400)
    const result = await editorial.publishRecommendedRevision(c.env.DB, id, recommendation.data, token.data)
    if (result.status === 'published') return c.json({ success: true, data: result.post })
    return c.json({ success: false, error: result.status === 'blocked' ? result.reason : 'A matéria mudou ou saiu da revisão.' }, 409)
  }
  if (operation === 'stage') {
    const revision = editorial.editorialDraftRevision.safeParse(body?.data)
    if (!revision.success) return c.json({ success: false, error: 'Versão editorial inválida.' }, 400)
    const data = await editorial.stageEditorialDraftRevision(c.env.DB, id, revision.data, token.data)
    return data ? c.json({ success: true, data }) : c.json({ success: false, error: 'A matéria mudou ou saiu da revisão.' }, 409)
  }
  const reason = typeof body?.data?.reason === 'string' ? body.data.reason.trim() : ''
  if (!reason || reason.length > 4000) return c.json({ success: false, error: 'Motivo editorial inválido.' }, 400)
  const data = await editorial.holdAgentReview(c.env.DB, id, token.data, reason)
  return data ? c.json({ success: true, data }) : c.json({ success: false, error: 'A matéria saiu da revisão.' }, 409)
})
