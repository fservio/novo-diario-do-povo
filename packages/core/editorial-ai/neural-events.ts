import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { z } from 'zod'
import type { Env } from '../types'
import { neuralDossierSchema } from './neural-dossier'

const pilotMission = 'politica-distrital-misto-2026-11'
const registryId = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/)
const eventSchema = z.object({
  schema_version: z.literal(1),
  correlation_id: registryId,
  execution_id: z.string().regex(/^\d{1,24}$/),
  agent_id: registryId,
  source_type: z.literal('n8n'),
  source_id: registryId,
  event_type: z.enum([
    'execution.started', 'step.started', 'step.completed', 'dossier.ready',
    'execution.completed', 'execution.failed'
  ]),
  stage: z.enum(['mission', 'model', 'sources', 'reporting', 'evidence', 'drafts']),
  occurred_at: z.string().datetime(),
  dossier: neuralDossierSchema.optional()
}).strict().refine(event => !event.dossier ||
  (event.correlation_id === pilotMission && event.event_type === 'dossier.ready' && event.stage === 'evidence'))

const encoder = new TextEncoder()
const maxBodyBytes = 128_000
export const neuralEvents = new Hono<{ Bindings: Env }>()

neuralEvents.post('/events', async (c, next) => {
  if (c.env.NEURAL_ENABLED !== 'true' || !['dev', 'staging'].includes(c.env.CF_ENV) ||
      !c.env.NEURAL_EVENTS_SECRET) {
    return c.json({ error: 'not_found' }, 404)
  }
  return next()
}, bodyLimit({ maxSize: maxBodyBytes }), async c => {
  const timestamp = c.req.header('X-Neural-Timestamp') ?? ''
  const signature = c.req.header('X-Neural-Signature') ?? ''
  if (!/^\d{10}$/.test(timestamp) || !/^[a-f0-9]{64}$/.test(signature) ||
      Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
    return c.json({ error: 'invalid_signature' }, 401)
  }
  const body = new Uint8Array(await c.req.arrayBuffer())
  if (body.length > maxBodyBytes) return c.json({ error: 'payload_too_large' }, 413)
  const prefix = encoder.encode(timestamp + '.')
  const signed = new Uint8Array(prefix.length + body.length)
  signed.set(prefix)
  signed.set(body, prefix.length)
  const key = await crypto.subtle.importKey('raw', encoder.encode(c.env.NEURAL_EVENTS_SECRET!),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  const mac = Uint8Array.from(signature.match(/../g)!, byte => parseInt(byte, 16))
  if (!await crypto.subtle.verify('HMAC', key, mac, signed)) {
    return c.json({ error: 'invalid_signature' }, 401)
  }

  let input: unknown
  try {
    input = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(body))
  } catch {
    return c.json({ error: 'invalid_json' }, 400)
  }
  const parsed = eventSchema.safeParse(input)
  if (!parsed.success) return c.json({ error: 'invalid_event' }, 422)
  const event = parsed.data
  const occurredAt = new Date(event.occurred_at)
  if (!Number.isFinite(occurredAt.getTime()) || occurredAt.getTime() > Date.now() + 300_000) {
    return c.json({ error: 'invalid_occurred_at' }, 422)
  }
  const eventParts = [event.source_type, event.source_id, event.execution_id, event.stage, event.event_type]
  if (event.correlation_id !== pilotMission) eventParts.push(event.correlation_id)
  const eventId = eventParts.join(':')
  const db = c.env.DB
  const mission = await db.prepare(`
    SELECT m.id FROM neural_missions m JOIN neural_agents a ON a.id = m.agent_id
    WHERE m.id = ? AND a.id = ? AND a.workflow_id = ?
  `).bind(event.correlation_id, event.agent_id, event.source_id).first()
  if (!mission) return c.json({ error: 'unknown_mission' }, 422)

  const insertEvent = db.prepare(`
    INSERT INTO neural_events (external_event_id, mission_id, execution_id, event_type, stage, occurred_at)
    SELECT ?, ?, ?, ?, ?, ?
    WHERE (SELECT COUNT(*) FROM neural_events WHERE mission_id = ? AND received_at >= unixepoch() - 60) < 120
    ON CONFLICT (external_event_id) DO NOTHING
  `).bind(eventId, event.correlation_id, event.execution_id, event.event_type, event.stage,
    occurredAt.toISOString(), event.correlation_id)
  const result = event.dossier
    ? (await db.batch([insertEvent, db.prepare(`
        INSERT INTO neural_dossiers (mission_id, execution_id, dossier_json)
        SELECT mission_id, execution_id, ?
        FROM neural_events WHERE external_event_id = ?
        ON CONFLICT (mission_id, execution_id) DO NOTHING
      `).bind(JSON.stringify(event.dossier), eventId)]))[0]
    : await insertEvent.run()
  if (result.meta.changes === 1) return c.json({ event_id: eventId, duplicate: false }, 201)
  const previous = await db.prepare('SELECT 1 FROM neural_events WHERE external_event_id = ?').bind(eventId).first()
  if (previous) return c.json({ event_id: eventId, duplicate: true })
  return c.json({ error: 'rate_limit' }, 429, { 'Retry-After': '60' })
})
