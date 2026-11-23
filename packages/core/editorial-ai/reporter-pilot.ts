import { Hono } from 'hono'
import { z } from 'zod'
import type { AppContext, Env } from '../types'

const text = z.string().trim().min(1).max(12000)
const draft = z.object({ title: text, excerpt: text, content: text }).strict()
const findings = z.object({
  claim: text,
  url: z.string().url().max(2048),
  quote: text,
  source_title: text,
  consulted_at: z.string().datetime()
}).strict()
const result = z.object({
  model: z.literal('gpt-6-luna'),
  execution_id: z.string().regex(/^\d{1,24}$/),
  publication_blocked: z.literal(true),
  dossier: z.object({
    mission: z.object({
      id: z.literal('politica-distrital-misto-2026-11'),
      editoria: z.literal('politica'),
      started: z.number().int().positive(),
      question: text,
      publication_blocked: z.literal(true)
    }).strict(),
    findings: z.array(findings).max(30),
    open_questions: z.array(text).max(50),
    source_results: z.array(z.object({
      url: z.string().url().max(2048),
      kind: z.enum(['jornalistica', 'institucional']),
      status: z.number().int().nullable()
    }).strict()).max(8)
  }).strict(),
  draft_a: draft,
  draft_b: draft
}).strict()

export const reporterPilot = new Hono<{ Bindings: Env; Variables: AppContext }>()

reporterPilot.post('/runs', async (c) => {
  const raw = await c.req.text()
  if (raw.length > 128_000) return c.json({ success: false, error: 'Dossiê muito grande' }, 413)
  let input: unknown
  try {
    input = JSON.parse(raw)
  } catch {
    return c.json({ success: false, error: 'JSON inválido' }, 400)
  }
  const parsed = result.safeParse(input)
  if (!parsed.success) return c.json({ success: false, error: 'Resultado do piloto inválido' }, 400)
  const run = parsed.data
  const payload = JSON.stringify(run)
  await c.env.DB.prepare(`
    INSERT INTO editorial_reporter_pilot_runs (execution_id, mission_id, result_json)
    VALUES (?, ?, ?) ON CONFLICT(execution_id) DO NOTHING
  `).bind(run.execution_id, run.dossier.mission.id, payload).run()
  const stored = await c.env.DB.prepare(
    'SELECT result_json FROM editorial_reporter_pilot_runs WHERE execution_id = ?'
  ).bind(run.execution_id).first<{ result_json: string }>()
  if (stored?.result_json !== payload) {
    return c.json({ success: false, error: 'Já existe outro resultado para esta execução' }, 409)
  }
  return c.json({ success: true, execution_id: run.execution_id })
})

reporterPilot.get('/runs/:id{[0-9]+}', async (c) => {
  const stored = await c.env.DB.prepare(
    'SELECT result_json FROM editorial_reporter_pilot_runs WHERE execution_id = ?'
  ).bind(c.req.param('id')).first<{ result_json: string }>()
  if (!stored) return c.json({ success: false, error: 'Execução não encontrada' }, 404)
  return c.json({ success: true, data: JSON.parse(stored.result_json) })
})
