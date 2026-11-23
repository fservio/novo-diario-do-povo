import type { Context } from 'hono'
import { timingSafeEqual } from 'node:crypto'
import { streamText } from 'hono/streaming'
import type { AppContext, Env } from '../types'
import { hasRole } from '../db/users'
import { neuralDossierSchema, type NeuralDossier } from '../editorial-ai/neural-dossier'
import { followupLimit, followupResultSchema, investigateFollowup } from '../editorial-ai/neural-followup'
import { editorialDraftZod } from '../editorial-ai/openai'
import { runNeuralEditorialPipeline } from '../editorial-ai/neural-pipeline'
import { renderMarkdownToHtml } from '../render/sanitize'
import { escapeHtml, renderAdminLayout, renderScript } from './ui'

const basePath = '/admin/redacao-neural'
const missionId = 'politica-distrital-misto-2026-11'
const missionTitle = 'Voto distrital misto: o que mudou entre as propostas?'
const missionPath = basePath + '/missoes/' + missionId
const n8nWorkflow = 'https://n8n.srv797269.hstgr.cloud/workflow/SIu6TIuEk2Ya5uPD'
const executionIdPattern = /^\d{1,24}$/
const followupIdPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
const dateFormat = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Fortaleza', dateStyle: 'short', timeStyle: 'medium'
})
const statuses: Record<string, string> = {
  failed: 'Com falha', completed: 'Concluída', dossier_ready: 'Dossiê pronto',
  running: 'Início registrado', unknown: 'Estado desconhecido'
}
const stages: Record<string, string> = {
  mission: 'Missão', model: 'Validação do modelo', sources: 'Consulta às fontes',
  reporting: 'Apuração documental', evidence: 'Conferência de evidências', drafts: 'Rascunhos'
}
const eventTypes: Record<string, string> = {
  'execution.started': 'Execução iniciada', 'step.started': 'Etapa iniciada',
  'step.completed': 'Etapa concluída', 'dossier.ready': 'Dossiê pronto',
  'execution.completed': 'Execução concluída', 'execution.failed': 'Falha registrada'
}

type AdminContext = Context<{ Bindings: Env; Variables: AppContext }>
type Execution = { execution_id: string; status: string; last_activity_at: string }
type Event = { event_type: string; stage: string; occurred_at: string }
type Followup = {
  id: string
  questions_json: string
  result_json: string | null
  status: 'running' | 'completed' | 'failed'
  rounds: number
  created_at: number
}
type Draft = {
  id: string
  status: 'running' | 'completed' | 'failed'
  draft_json: string | null
  created_at: number
}
type DraftStep = {
  draft_id: string
  stage: string
  started_at: number
  outcome: 'completed' | 'failed' | null
  result_json: string | null
}
const agentNames: Record<string, string> = {
  chief: 'Chefe de redação', reporter: 'Repórter', writer: 'Redator',
  checker: 'Checador', copydesk: 'Copidesque', editor: 'Editor',
  copydesk_retry: 'Copidesque · ajuste', editor_retry: 'Editor · nova conferência'
}

function draftIsRunning(draft: Draft, steps: DraftStep[]): boolean {
  const lastActivity = Math.max(draft.created_at, ...steps.filter(step => step.draft_id === draft.id)
    .map(step => step.started_at))
  return draft.status === 'running' && Date.now() / 1000 - lastActivity < 135
}

function renderDrafts(executionId: string, csrf: string, drafts: Draft[], steps: DraftStep[], queued: boolean): string {
  const running = drafts.some(draft => draftIsRunning(draft, steps))
  return `<section class="card" id="redacao" data-active="${queued || running}">
    <h3>Redação</h3>
    ${queued ? '<p>Na fila para início automático.</p>' : running ? '<p>Rascunho em preparação.</p>' : `<form method="post" action="${missionPath}/rascunhos">
      <input type="hidden" name="csrf" value="${escapeHtml(csrf)}">
      <input type="hidden" name="execution" value="${escapeHtml(executionId)}">
      <input type="hidden" name="request" value="${crypto.randomUUID()}">
      <button class="btn" type="submit">${drafts.some(draft => draft.status === 'completed')
        ? 'Executar nova rodada editorial' : 'Iniciar fluxo editorial'}</button>
    </form>`}
    ${drafts.map(draft => {
      const parsed = draft.draft_json && editorialDraftZod.safeParse(JSON.parse(draft.draft_json))
      const activity = steps.filter(step => step.draft_id === draft.id)
      const decision = activity.find(step => step.stage === 'editor_retry' && step.outcome === 'completed')
        ?? activity.find(step => step.stage === 'editor' && step.outcome === 'completed')
      const evaluation = decision?.result_json ? JSON.parse(decision.result_json) as {
        overall_assessment: string
        needsReview: boolean
      } : null
      return `<article id="rascunho-${escapeHtml(draft.id)}">
        <h4>${time(new Date(draft.created_at * 1000).toISOString())}
        · ${parsed && parsed.success ? (evaluation?.needsReview ? 'Com pendências editoriais'
          : evaluation ? 'Versão revisada para aprovação' : 'Rascunho para revisão')
          : draftIsRunning(draft, steps) ? 'Em preparação' : 'Interrompido. Você pode tentar novamente.'}</h4>
        ${activity.length ? `<ol aria-label="Atividade dos agentes">${activity.map(step => `<li>
          ${escapeHtml(agentNames[step.stage] ?? step.stage)} · ${time(new Date(step.started_at * 1000).toISOString())}
          · ${step.outcome === 'completed' ? 'Concluído' : step.outcome === 'failed' ? 'Falhou'
            : draftIsRunning(draft, steps) ? 'Em execução' : 'Interrompido'}
        </li>`).join('')}</ol>` : ''}
        ${evaluation ? `<p>${escapeHtml(evaluation.overall_assessment)}</p>` : ''}
        ${parsed && parsed.success ? `<p>${escapeHtml(parsed.data.hat)}</p>
          <h5>${escapeHtml(parsed.data.title)}</h5>
          <p>${escapeHtml(parsed.data.excerpt)}</p>
          ${renderMarkdownToHtml(parsed.data.content_markdown)}
          ${parsed.data.claims.length ? `<details><summary>Afirmações e fontes para conferência</summary>
            <ul>${parsed.data.claims.map(claim => `<li>${escapeHtml(claim.claim)}
              ${claim.source_url ? `· ${sourceLink(claim.source_url, claim.source_label || claim.source_url)}` : ''}
            </li>`).join('')}</ul></details>` : ''}
          ${parsed.data.reporting_gaps.length ? `<h5>Pendências de apuração</h5><ul>${parsed.data.reporting_gaps
            .map(gap => `<li>${escapeHtml(gap)}</li>`).join('')}</ul>` : ''}` : ''}
      </article>`
    }).join('')}
  </section>`
}

export async function requestNeuralDraft(c: AdminContext, requestedMission: string): Promise<Response> {
  c.header('Cache-Control', 'private, no-store')
  const user = c.get('adminUser')
  if (requestedMission !== missionId || !user || !canReadNeural(c.env, user.role)) return c.notFound()
  const form = await c.req.parseBody({ all: true })
  const executionId = form.execution
  const requestId = form.request
  if (typeof executionId !== 'string' || !executionIdPattern.test(executionId) ||
      typeof requestId !== 'string' || !followupIdPattern.test(requestId)) return c.notFound()
  const url = missionPath + '?execucao=' + executionId
  const db = c.env.NEURAL_PILOT_DB ?? c.env.DB
  const stored = await db.prepare(`
    SELECT dossier_json FROM neural_dossiers WHERE mission_id = ? AND execution_id = ?
  `).bind(missionId, executionId).first<{ dossier_json: string }>()
  const dossier = stored && neuralDossierSchema.safeParse(JSON.parse(stored.dossier_json))
  if (!dossier?.success) return c.notFound()
  const insertion = await db.prepare(`
    INSERT INTO neural_drafts (id, mission_id, execution_id, requested_by, status)
    SELECT ?, ?, ?, ?, 'running'
    WHERE NOT EXISTS (
      SELECT 1 FROM neural_drafts d WHERE mission_id = ? AND execution_id = ? AND status = 'running'
        AND COALESCE((SELECT MAX(s.started_at) FROM neural_draft_steps s WHERE s.draft_id = d.id),
          d.created_at) > unixepoch() - 135
    )
    ON CONFLICT (id) DO NOTHING
  `).bind(requestId, missionId, executionId, user.id, missionId, executionId).run()
  if (insertion.meta.changes !== 1) return c.redirect(url + '#redacao', 303)
  const run = () => runStoredNeuralDraft(c.env, db, requestId, executionId, dossier.data)
  if (c.req.header('X-Neural-Stream') === '1') return streamNeuralDraft(c, run)
  await run()
  return c.redirect(url + '#rascunho-' + requestId, 303)
}

async function runStoredNeuralDraft(env: Env, db: D1Database, requestId: string,
  executionId: string, dossier: NeuralDossier): Promise<void> {
    try {
      const followups = await db.prepare(`
        SELECT result_json FROM neural_followups
        WHERE mission_id = ? AND execution_id = ? AND status = 'completed'
        ORDER BY created_at DESC, id DESC LIMIT 30
      `).bind(missionId, executionId).all<{ result_json: string | null }>()
      const results = followups.results.flatMap(item => {
        const parsed = item.result_json && followupResultSchema.safeParse(JSON.parse(item.result_json))
        return parsed && parsed.success ? parsed.data : []
      })
      const draft = await runNeuralEditorialPipeline(env, db, requestId, missionTitle, dossier, results)
      await db.prepare("UPDATE neural_drafts SET status = 'completed', draft_json = ? WHERE id = ?")
        .bind(JSON.stringify(draft), requestId).run()
    } catch (error) {
      console.error('Falha na redação da Mesa', requestId, error instanceof Error ? error.name : '')
      await db.prepare("UPDATE neural_drafts SET status = 'failed' WHERE id = ?").bind(requestId).run()
    }
}

function streamNeuralDraft(c: AdminContext, run: () => Promise<void>): Response {
  return streamText(c, async stream => {
      await stream.writeln('Iniciando fluxo editorial')
      const heartbeat = setInterval(() => { void stream.writeln('Em andamento').catch(() => {}) }, 4000)
      try {
        await run()
      } finally {
        clearInterval(heartbeat)
      }
  })
}

export async function dispatchNeuralDraft(c: AdminContext): Promise<Response> {
  c.header('Cache-Control', 'private, no-store')
  const db = c.env.NEURAL_PILOT_DB
  const secret = c.env.NEURAL_DISPATCH_KEY
  if (!db || !secret) return c.json({ error: 'dispatch_unavailable' }, 503)
  const expected = Buffer.from('Bearer ' + secret)
  const actual = Buffer.from(c.req.header('Authorization') ?? '')
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  const token = crypto.randomUUID()
  const job = await db.prepare(`
    INSERT INTO neural_drafts (id, mission_id, execution_id, requested_by, status)
    SELECT ?, q.mission_id, q.execution_id, 0, 'running'
    FROM neural_dispatch q
    WHERE q.mission_id = ? AND NOT EXISTS (
      SELECT 1 FROM neural_drafts d
      WHERE d.mission_id = q.mission_id AND d.execution_id = q.execution_id
    )
    ORDER BY q.queued_at, q.execution_id LIMIT 1
    RETURNING execution_id
  `).bind(token, missionId).first<{ execution_id: string }>()
  if (!job) return c.body(null, 204)
  const row = await db.prepare('SELECT dossier_json FROM neural_dossiers WHERE mission_id = ? AND execution_id = ?')
    .bind(missionId, job.execution_id).first<{ dossier_json: string }>()
  const dossier = row && neuralDossierSchema.safeParse(JSON.parse(row.dossier_json))
  if (!dossier?.success) {
    await db.prepare("UPDATE neural_drafts SET status = 'failed' WHERE id = ?").bind(token).run()
    return c.json({ error: 'invalid_dossier' }, 422)
  }
  return streamNeuralDraft(c, () => runStoredNeuralDraft(c.env, db, token, job.execution_id, dossier.data))
}
function sourceLink(value: string, label = value): string {
  let url: URL
  try { url = new URL(value) } catch { return escapeHtml(label) }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    return escapeHtml(label)
  }
  return `<a href="${escapeHtml(url.href)}">${escapeHtml(label)}</a>`
}

function renderFollowups(followups: Followup[]): string {
  return followups.map(request => {
    const result = request.result_json && followupResultSchema.safeParse(JSON.parse(request.result_json))
    const status = request.status === 'completed' ? 'Concluído'
      : request.status === 'running' && Date.now() / 1000 - request.created_at < 180
        ? 'Em apuração' : 'Interrompido. Você pode solicitar novamente.'
    const answers = result && result.success ? result.data
      : (JSON.parse(request.questions_json) as string[]).map(question => ({
        question, answer: null as string | null, urls: [] as string[]
      }))
    return `<article id="aprofundamento-${escapeHtml(request.id)}">
      <h4>${time(new Date(request.created_at * 1000).toISOString())} · ${status}</h4>
      <p>${request.rounds} ${request.rounds === 1 ? 'rodada concluída' : 'rodadas concluídas'}</p>
      <ul>${answers.map(({ question, answer, urls }) => `<li>
        <strong>${escapeHtml(question)}</strong>
        ${answer ? `<p>${escapeHtml(answer)}</p><ul>${urls.map(url => `<li>${sourceLink(url)}</li>`).join('')}</ul>`
          : request.status === 'running' && Date.now() / 1000 - request.created_at < 180 ? ''
            : '<p>Pergunta em aberto.</p>'}
      </li>`).join('')}</ul>
    </article>`
  }).join('')
}

function renderDossier(dossier: NeuralDossier, executionId: string, csrf: string,
  followups: Followup[], invalidSelection: boolean): string {
  const questions = dossier.open_questions
  const questionList = questions.length ? `<form method="post" action="${missionPath}/aprofundamentos">
    <input type="hidden" name="csrf" value="${escapeHtml(csrf)}">
    <input type="hidden" name="execution" value="${escapeHtml(executionId)}">
    <input type="hidden" name="request" value="${crypto.randomUUID()}">
    <fieldset>
      <legend>Selecione até três perguntas</legend>
      ${invalidSelection ? '<p role="alert">Selecione de uma a três perguntas do dossiê.</p>' : ''}
      ${questions.map((question, index) => `<p><label>
        <input type="checkbox" name="question-${index}" value="1"> ${escapeHtml(question)}
      </label></p>`).join('')}
    </fieldset>
    <button class="btn" type="submit">Solicitar aprofundamento</button>
  </form>` : '<p>Nenhuma pergunta em aberto registrada.</p>'
  return `<section class="card" id="dossie" aria-labelledby="dossie-titulo">
    <h2 id="dossie-titulo">Dossiê de apuração</h2>
    <h3>Fontes consultadas</h3>
    <ul>${dossier.source_results.map(source => `<li>${sourceLink(source.url)} ·
      ${source.kind === 'institucional' ? 'Institucional' : 'Jornalística'} ·
      ${source.status === null ? 'Sem resposta registrada' : 'HTTP ' + source.status}</li>`).join('')}</ul>
    <h3>Achados e evidências</h3>
    ${dossier.findings.map(finding => `<article>
      <p><strong>${escapeHtml(finding.claim)}</strong></p>
      <blockquote>${escapeHtml(finding.quote)}</blockquote>
      <p>${sourceLink(finding.url, finding.source_title)} · ${time(finding.consulted_at)}</p>
    </article>`).join('') || '<p>Nenhum achado com evidência validada.</p>'}
    <h3>Perguntas em aberto</h3>
    ${questionList}
    ${followups.length ? `<h3>Aprofundamentos</h3>${renderFollowups(followups)}` : ''}
  </section>`
}

export async function requestNeuralFollowup(c: AdminContext, requestedMission: string): Promise<Response> {
  c.header('Cache-Control', 'private, no-store')
  const user = c.get('adminUser')
  if (requestedMission !== missionId || !user || !canReadNeural(c.env, user.role)) return c.notFound()
  const form = await c.req.parseBody({ all: true })
  const executionId = form.execution
  const requestId = form.request
  if (typeof executionId !== 'string' || !executionIdPattern.test(executionId) ||
      typeof requestId !== 'string' || !followupIdPattern.test(requestId)) return c.notFound()

  const db = c.env.NEURAL_PILOT_DB ?? c.env.DB
  const stored = await db.prepare(`
    SELECT dossier_json FROM neural_dossiers WHERE mission_id = ? AND execution_id = ?
  `).bind(missionId, executionId).first<{ dossier_json: string }>()
  const dossier = stored && neuralDossierSchema.safeParse(JSON.parse(stored.dossier_json))
  if (!dossier?.success) return c.notFound()
  const url = missionPath + '?execucao=' + executionId
  const indices = Object.entries(form).filter(([key]) => key.startsWith('question-'))
  const questions = indices.map(([key, value]) =>
    /^question-(0|[1-9]\d*)$/.test(key) && value === '1'
      ? dossier.data.open_questions[Number(key.slice('question-'.length))] : undefined)
  if (!questions.length || questions.length > followupLimit || questions.some(question => !question)) {
    return c.redirect(url + '&selecao=invalida#dossie', 303)
  }
  const destination = url + '#aprofundamento-' + requestId
  const insertion = await db.prepare(`
    INSERT INTO neural_followups (id, mission_id, execution_id, requested_by, questions_json, status)
    VALUES (?, ?, ?, ?, ?, 'running') ON CONFLICT (id) DO NOTHING
  `).bind(requestId, missionId, executionId, user.id, JSON.stringify(questions)).run()
  if (insertion.meta.changes !== 1) return c.redirect(destination, 303)
  try {
    await investigateFollowup(c.env, questions as string[], missionTitle, async (round, results) => {
      await db.prepare('UPDATE neural_followups SET rounds = ?, result_json = ? WHERE id = ?')
        .bind(round, JSON.stringify(results), requestId).run()
    })
    await db.prepare("UPDATE neural_followups SET status = 'completed' WHERE id = ?").bind(requestId).run()
  } catch (error) {
    console.error('Falha no aprofundamento da Redação Neural', requestId, error instanceof Error ? error.name : '')
    await db.prepare("UPDATE neural_followups SET status = 'failed' WHERE id = ?").bind(requestId).run()
  }
  return c.redirect(destination, 303)
}

export function canReadNeural(env: Env, role: string): boolean {
  const enabledInTest = env.NEURAL_ENABLED === 'true' && ['dev', 'staging'].includes(env.CF_ENV)
  return hasRole(role, 'editor') && (enabledInTest || Boolean(env.NEURAL_PILOT_DB))
}

function time(iso: string): string {
  const date = new Date(iso)
  return Number.isFinite(date.getTime())
    ? `<time datetime="${escapeHtml(iso)}">${dateFormat.format(date)}</time>`
    : 'Horário indisponível'
}

function statusBadge(status: string): string {
  const tone = status === 'completed' ? 'success' : status === 'failed' ? 'danger' : 'neutral'
  return `<span class="badge badge-${tone}">${escapeHtml(statuses[status] ?? statuses.unknown)}</span>`
}

export async function renderNeuralPage(c: AdminContext, requestedMission?: string): Promise<Response> {
  c.header('Cache-Control', 'private, no-store')
  const user = c.get('adminUser')
  if (!user || !canReadNeural(c.env, user.role)) return c.notFound()
  if (requestedMission !== undefined && requestedMission !== missionId) return c.notFound()

  const requestedExecution = c.req.query('execucao')
  if (requestedExecution !== undefined && !executionIdPattern.test(requestedExecution)) return c.notFound()

  const db = c.env.NEURAL_PILOT_DB ?? c.env.DB
  const mission = await db.prepare(`
    SELECT c.name AS category FROM neural_missions m
    JOIN neural_agents a ON a.id = m.agent_id
    JOIN categories c ON c.id = a.category_id WHERE m.id = ?
  `).bind(missionId).first<{ category: string }>()
  if (!mission && requestedMission) return c.notFound()

  const execution = !mission ? null : await db.prepare(`
    SELECT execution_id, status, last_activity_at FROM neural_executions
    WHERE mission_id = ? AND (? IS NULL OR execution_id = ?)
    ORDER BY last_activity_at DESC, execution_id DESC LIMIT 1
  `).bind(missionId, requestedExecution ?? null, requestedExecution ?? null).first<Execution>()
  if (requestedExecution !== undefined && !execution) return c.notFound()

  let body: string
  if (requestedMission && mission) {
    const [history, timeline, storedDossier, followups, drafts, draftSteps, queued] = await Promise.all([
      db.prepare(`
        SELECT execution_id, status, last_activity_at FROM neural_executions WHERE mission_id = ?
        ORDER BY last_activity_at DESC, execution_id DESC LIMIT 30
      `).bind(missionId).all<Execution>(),
      execution ? db.prepare(`
        SELECT event_type, stage, occurred_at FROM neural_events
        WHERE mission_id = ? AND execution_id = ? ORDER BY occurred_at, id LIMIT 120
      `).bind(missionId, execution.execution_id).all<Event>() : Promise.resolve({ results: [] }),
      execution ? db.prepare(`
        SELECT dossier_json FROM neural_dossiers WHERE mission_id = ? AND execution_id = ?
      `).bind(missionId, execution.execution_id).first<{ dossier_json: string }>() : null,
      execution ? db.prepare(`
        SELECT id, questions_json, result_json, status, rounds, created_at FROM neural_followups
        WHERE mission_id = ? AND execution_id = ? ORDER BY created_at DESC LIMIT 30
      `).bind(missionId, execution.execution_id).all<Followup>() : Promise.resolve({ results: [] }),
      execution ? db.prepare(`
        SELECT id, status, draft_json, created_at FROM neural_drafts
        WHERE mission_id = ? AND execution_id = ? ORDER BY created_at DESC, id DESC LIMIT 10
      `).bind(missionId, execution.execution_id).all<Draft>() : Promise.resolve({ results: [] }),
      execution ? db.prepare(`
        SELECT s.draft_id, s.stage, s.started_at, s.outcome,
          CASE WHEN s.stage IN ('editor', 'editor_retry') THEN s.result_json END AS result_json
        FROM neural_draft_steps s
        WHERE s.draft_id IN (
          SELECT id FROM neural_drafts WHERE mission_id = ? AND execution_id = ?
          ORDER BY created_at DESC, id DESC LIMIT 10
        )
        ORDER BY s.rowid
      `).bind(missionId, execution.execution_id).all<DraftStep>() : Promise.resolve({ results: [] }),
      execution ? db.prepare('SELECT 1 FROM neural_dispatch WHERE mission_id = ? AND execution_id = ?')
        .bind(missionId, execution.execution_id).first() : null
    ])
    const dossier = storedDossier && neuralDossierSchema.safeParse(JSON.parse(storedDossier.dossier_json))
    const dossierMissing = !dossier?.success && (
      execution?.status === 'completed' || timeline.results.some(event => event.event_type === 'dossier.ready')
    )
    const selectedId = execution?.execution_id
    const historyOptions = history.results.filter(entry => entry.execution_id !== selectedId)
    const trace = execution ? `
      <section class="card">
        <div class="page-intro">
          <div><h2>Execução ${escapeHtml(execution.execution_id)}</h2>
            <p class="page-description">${timeline.results.length} eventos registrados · horários de Fortaleza</p>
            ${statusBadge(execution.status)}
            ${dossierMissing ? '<p>Dossiê indisponível na Mesa de Política.</p>' : ''}
          </div>
          <div class="ai-page-actions">
            ${dossier?.success ? '<a class="btn" href="#dossie">Ver dossiê</a>' : ''}
            ${dossier?.success ? '<a class="btn btn-outline" href="#redacao">Redação</a>' : ''}
            <a class="btn btn-outline" href="${n8nWorkflow}/executions/${encodeURIComponent(execution.execution_id)}">Abrir execução no n8n</a>
          </div>
        </div>
        <div class="table-container"><table>
          <thead><tr><th>Horário</th><th>Etapa</th><th>Evento</th></tr></thead>
          <tbody>${timeline.results.map(event => `<tr>
            <td>${time(event.occurred_at)}</td>
            <td>${escapeHtml(stages[event.stage] ?? event.stage)}</td>
            <td>${escapeHtml(eventTypes[event.event_type] ?? event.event_type)}</td>
          </tr>`).join('')}</tbody>
        </table></div>
      </section>
      ${dossier?.success ? renderDossier(dossier.data, execution.execution_id, c.get('csrfToken') || '',
        followups.results, c.req.query('selecao') === 'invalida') : ''}
      ${dossier?.success ? renderDrafts(execution.execution_id, c.get('csrfToken') || '', drafts.results,
        draftSteps.results, Boolean(queued) && !drafts.results.length) : ''}
      ${dossier?.success ? renderScript(`
        const refreshEditorialActivity = async () => {
          const response = await fetch(location.href, { cache: 'no-store' });
          if (!response.ok) return;
          const updated = new DOMParser().parseFromString(await response.text(), 'text/html').getElementById('redacao');
          if (updated) document.getElementById('redacao').replaceWith(updated);
        };
        let refreshing = false;
        setInterval(async () => {
          if (refreshing || document.querySelector('#redacao')?.dataset.active !== 'true') return;
          refreshing = true;
          try { await refreshEditorialActivity(); } catch {} finally { refreshing = false; }
        }, 5000);
        document.addEventListener('submit', async event => {
          const form = event.target;
          if (!(form instanceof HTMLFormElement) || !form.closest('#redacao')) return;
          event.preventDefault();
          const submit = form.querySelector('button');
          submit.disabled = true;
          submit.textContent = 'Iniciando fluxo editorial…';
          const timer = setInterval(() => refreshEditorialActivity().catch(() => {}), 4000);
          try {
            const data = new FormData(form);
            const response = await fetch(form.action, {
              method: 'POST', body: new URLSearchParams(data), headers: { 'X-Neural-Stream': '1' }
            });
            if (!response.ok) throw new Error('Falha ao iniciar o fluxo');
            await response.text();
            await refreshEditorialActivity();
            const result = document.getElementById('rascunho-' + data.get('request'));
            if (result) location.hash = result.id;
          } catch {
            location.reload();
          } finally {
            clearInterval(timer);
          }
        });
      `, c.get('cspNonce')) : ''}
      ${historyOptions.length ? `<section class="card"><h2>Outras execuções recentes</h2>
        <div class="table-container"><table>
          <thead><tr><th>Execução</th><th>Último evento</th><th>Estado</th></tr></thead>
          <tbody>${historyOptions.map(entry => `<tr>
            <td><a href="${missionPath}?execucao=${encodeURIComponent(entry.execution_id)}">${escapeHtml(entry.execution_id)}</a></td>
            <td>${time(entry.last_activity_at)}</td><td>${statusBadge(entry.status)}</td>
          </tr>`).join('')}</tbody>
        </table></div></section>` : ''}` : '<section class="card"><p>Esta pauta ainda não tem eventos registrados.</p></section>'
    body = `
      <div class="page-intro">
        <div><p class="page-kicker">Redação Neural · ${escapeHtml(mission.category)}</p>
          <h1 class="page-title">${missionTitle}</h1>
          <p class="page-description">Repórter Documental · Piloto de Política</p>
        </div>
        <a class="btn btn-outline" href="${basePath}">Mesa de Política</a>
      </div>${trace}`
  } else {
    body = `
      <div class="page-intro">
        <div><p class="page-kicker">Redação Neural · Piloto de Política</p>
          <h1 class="page-title">Mesa de Política</h1>
          <p class="page-description">Acompanhe as apurações do Repórter Documental.</p>
        </div>
        <a class="btn btn-outline" href="/admin/redacao-ia">Redação IA</a>
      </div>
      <section class="card"><h2>Pautas</h2>
        ${mission ? `<div class="table-container"><table>
          <thead><tr><th>Pauta</th><th>Estado</th><th>Último evento em Fortaleza</th></tr></thead>
          <tbody><tr>
            <td><a href="${missionPath}">${missionTitle}</a></td>
            <td>${execution ? statusBadge(execution.status) : 'Aguardando eventos'}</td>
            <td>${execution ? time(execution.last_activity_at) : '—'}</td>
          </tr></tbody>
        </table></div>` : '<p>Nenhuma pauta cadastrada no piloto de Política.</p>'}
      </section>`
  }

  return c.html(renderAdminLayout({
    title: requestedMission ? missionTitle : 'Mesa de Política · Redação Neural',
    user, activeTab: 'redacao-ia', bodyHtml: body, csrfToken: c.get('csrfToken') || ''
  }))
}
