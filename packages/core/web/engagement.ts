import type { Context } from 'hono'
import type { Env } from '../types'
import { classifyPublicPath, listEligibleEngagementCampaigns, recordEngagementEvent } from '../engagement'
import type { EngagementEventType } from '../engagement'

export async function handleEngagementEligible(c: Context) {
  const rawPath = String(c.req.query('path') || '/')
  let path = '/'
  try {
    path = rawPath.startsWith('http') ? new URL(rawPath).pathname : new URL(rawPath, 'https://jornal.local').pathname
  } catch {
    path = '/'
  }
  const device = c.req.query('device') === 'mobile' ? 'mobile' : 'desktop'
  const campaigns = await listEligibleEngagementCampaigns(c.env as Env, path, device)
  return c.json({ success: true, pageType: classifyPublicPath(path), campaigns })
}

export async function handleEngagementEvent(c: Context) {
  try {
    const body = await c.req.json<Record<string, unknown>>()
    const campaignId = Number(body.campaignId)
    const eventType = String(body.eventType || '') as EngagementEventType
    const device = body.device === 'mobile' ? 'mobile' : 'desktop'
    const pageType = String(body.pageType || 'other')
    if (!Number.isInteger(campaignId) || campaignId < 1 || !['impression', 'close', 'click'].includes(eventType)) {
      return c.json({ success: false, error: 'Evento inválido.' }, 400)
    }
    await recordEngagementEvent(c.env as Env, campaignId, eventType, device, pageType)
    return c.body(null, 204)
  } catch {
    return c.json({ success: false, error: 'Evento inválido.' }, 400)
  }
}
