import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { app as worker } from '../../scripts/neural-hml-worker'
import type { AppContext, Env } from '../../packages/core/types'
import { dispatchNeuralDraft } from '../../packages/core/admin/neural'

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')
const secret = 'local-fixture-secret'
let sql: InstanceType<typeof DatabaseSync>
let env: Env

beforeEach(() => {
  sql = new DatabaseSync(':memory:')
  sql.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE categories (id INTEGER PRIMARY KEY, slug TEXT);
    CREATE TABLE posts (id INTEGER PRIMARY KEY);
    CREATE TABLE editorial_ai_workspaces (id INTEGER PRIMARY KEY);
    INSERT INTO categories VALUES (73, 'politica');
  `)
  sql.exec(readFileSync(new URL('../../migrations/0068_neural_events.sql', import.meta.url), 'utf8'))
  sql.exec(readFileSync(new URL('../../migrations/0069_neural_dossiers.sql', import.meta.url), 'utf8'))
  sql.exec(readFileSync(new URL('../../migrations/0071_neural_drafts.sql', import.meta.url), 'utf8'))
  sql.exec(readFileSync(new URL('../../migrations/0073_neural_dispatch.sql', import.meta.url), 'utf8'))
  sql.exec(readFileSync(new URL('../../migrations/0074_neural_editorial_categories.sql', import.meta.url), 'utf8'))
  env = {
    CF_ENV: 'staging', NEURAL_ENABLED: 'true', NEURAL_EVENTS_SECRET: secret, N8N_API_KEY: 'local-fixture-key',
    DB: { prepare: (query: string) => ({
      bind: (...args: (string | number)[]) => ({
        first: async () => sql.prepare(query).get(...args) ?? null,
        run: () => ({ meta: { changes: Number(sql.prepare(query).run(...args).changes) } })
      })
    }), batch: async (statements: { run: () => unknown }[]) => {
      sql.exec('BEGIN')
      try {
        const results = statements.map(statement => statement.run())
        sql.exec('COMMIT')
        return results
      } catch (error) {
        sql.exec('ROLLBACK')
        throw error
      }
    } } as unknown as D1Database
  } as Env
})

afterEach(() => sql.close())

function send(patch = {}, options: { age?: number; tamper?: boolean; omitKey?: boolean } = {}) {
  const body = JSON.stringify({
    schema_version: 1, correlation_id: 'politica-distrital-misto-2026-11',
    execution_id: '417', agent_id: 'reporter_politica', source_type: 'n8n',
    source_id: 'politica-documental-staging', event_type: 'execution.started', stage: 'mission',
    occurred_at: new Date().toISOString(), ...patch
  })
  const timestamp = String(Math.floor(Date.now() / 1000) - (options.age ?? 0))
  const signature = createHmac('sha256', secret).update(timestamp + '.' + body).digest('hex')
  const headers: Record<string, string> = { 'X-Neural-Timestamp': timestamp, 'X-Neural-Signature': signature }
  if (!options.omitKey) headers['X-API-Key'] = env.N8N_API_KEY
  return worker.request('/api/n8n/neural/events', {
    method: 'POST', body: options.tamper ? body + ' ' : body,
    headers
  }, env)
}

describe('Telemetria de Política', () => {
  it('aceita o mesmo contrato em outras editorias e exige o cadastro correspondente', async () => {
    sql.exec("INSERT INTO categories VALUES (80, 'cidades')")
    const event = { correlation_id: 'editorial-cidades', agent_id: 'reporter-editorial-cidades', source_id: 'diario-editorial-cidades' }
    expect((await send({ ...event, source_id: 'diario-editorial-politica' })).status).toBe(422)
    expect((await send(event)).status).toBe(201)
    expect(await (await send(event)).json()).toMatchObject({ duplicate: true })
    expect((await send()).status).toBe(201)
  })
  it('restringe o despacho ao Worker e consome uma entrega apenas uma vez', async () => {
    // A simulated legacy payload lets us exercise the claim without calling the model.
    sql.prepare('INSERT INTO neural_dossiers VALUES (?, ?, ?)').run(
      'politica-distrital-misto-2026-11', '417', '{}')
    const app = new Hono<{ Bindings: Env; Variables: AppContext }>()
    app.post('/dispatch', dispatchNeuralDraft)
    const bindings = { ...env, NEURAL_PILOT_DB: env.DB, NEURAL_DISPATCH_KEY: 'fixture-dispatch-key' }
    const dispatch = (key: string) => app.request('/dispatch',
      { method: 'POST', headers: { Authorization: 'Bearer ' + key } }, bindings)
    expect((await dispatch('incorrect')).status).toBe(401)
    expect(sql.prepare('SELECT count(*) AS total FROM neural_drafts').get().total).toBe(0)
    const responses = await Promise.all([dispatch('fixture-dispatch-key'), dispatch('fixture-dispatch-key')])
    expect(responses.map(response => response.status).sort()).toEqual([204, 422])
    expect(sql.prepare('SELECT execution_id, status FROM neural_drafts').all())
      .toEqual([{ execution_id: '417', status: 'failed' }])
  })

  it('salva o dossiê na execução certa e preserva o primeiro envio', async () => {
    const dossier = { findings: [], source_results: [], open_questions: ['Qual é o prazo?'] }
    const event = { event_type: 'dossier.ready', stage: 'evidence', dossier }
    expect((await send({ dossier })).status).toBe(422)
    expect((await send({ ...event, dossier: { ...dossier, original: 'privado' } })).status).toBe(422)
    expect((await send(event)).status).toBe(201)
    expect(await (await send({ ...event, dossier: { ...dossier, open_questions: [] } })).json())
      .toMatchObject({ duplicate: true })
    const stored = sql.prepare('SELECT execution_id, dossier_json FROM neural_dossiers').all()
    expect(stored).toEqual([{ execution_id: '417', dossier_json: JSON.stringify(dossier) }])
    expect(sql.prepare('SELECT execution_id FROM neural_dispatch').all()).toEqual([{ execution_id: '417' }])
  })

  it('recusa assinatura alterada ou vencida, campos confidenciais e produção', async () => {
    expect((await send({}, { omitKey: true })).status).toBe(401)
    expect((await send({}, { tamper: true })).status).toBe(401)
    expect((await send({}, { age: 301 })).status).toBe(401)
    expect((await send({ payload: { prompt: 'privado' } })).status).toBe(422)
    expect((await send({ correlation_id: 'desconhecida' })).status).toBe(422)
    env.CF_ENV = 'prod'
    expect((await send()).status).toBe(404)
    expect(sql.prepare('SELECT COUNT(*) AS n FROM neural_events').get().n).toBe(0)
  })

  it('deduplica o mesmo acontecimento e preserva falha depois de eventos atrasados', async () => {
    const failed = { event_type: 'execution.failed', stage: 'reporting' }
    expect((await send(failed)).status).toBe(201)
    const retry = await send(failed)
    expect(await retry.json()).toMatchObject({ duplicate: true })
    expect((await send({ occurred_at: new Date(Date.now() - 10_000).toISOString() })).status).toBe(201)
    expect(sql.prepare('SELECT status FROM neural_executions').get().status).toBe('failed')
    expect(sql.prepare('SELECT COUNT(*) AS n FROM neural_events').get().n).toBe(2)
  })

  it('limita eventos novos e confirma reenvios durante o limite', async () => {
    expect((await send()).status).toBe(201)
    sql.exec(`
      WITH RECURSIVE ids(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM ids WHERE n < 119)
      INSERT INTO neural_events (external_event_id, mission_id, execution_id, event_type, stage, occurred_at)
      SELECT 'fixture:' || n, 'politica-distrital-misto-2026-11', '400',
        'execution.started', 'mission', '2026-11-15T00:00:00.000Z'
      FROM ids
    `)
    expect((await send({ execution_id: '418' })).status).toBe(429)
    expect((await send({
      execution_id: '418', event_type: 'dossier.ready', stage: 'evidence',
      dossier: { findings: [], source_results: [], open_questions: [] }
    })).status).toBe(429)
    expect(sql.prepare('SELECT COUNT(*) AS n FROM neural_dossiers').get().n).toBe(0)
    expect(await (await send()).json()).toMatchObject({ duplicate: true })
  })
})
