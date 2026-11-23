import type { Context } from 'hono'
import prototype from '../../../prototipos/redacao-viva/index.html?raw'
import style from '../../../prototipos/redacao-viva/style.css?raw'
import script from '../../../public/static/redacao-viva-live.js?raw'
import { worldSnapshot } from './mundo-em-edicao'
import type { AppContext, Env } from '../types'
import { getPostUrl } from '../utils/post'

const assets = '/static/redacao-viva/'

export function renderNewsroom(c: Context) {
  return c.html(prototype
    .replace('<body>', `<body data-newsroom-assets="${assets}">`)
    .replace('href="style.css"', 'href="/redacao-viva/estilo.css?v=eventos-1"')
    .replace('src="app.js"', 'src="/redacao-viva/interface.js?v=eventos-1"')
    .replace('Demonstração interativa', 'Atividade editorial')
    .replace('Acompanhe os agentes de IA e descubra as notícias que eles ajudam a produzir.',
      'Veja os acontecimentos confirmados pelo CMS e as etapas dos agentes disponíveis para consulta pública.')
    .replace(/<span id="simulation-status">[^<]*<\/span>/, '')
    .replace(/<button id="play"[^>]*>[^<]*<\/button>/, '')
    .replace(/<div class="station"[\s\S]*?<\/section>/, '</section>')
    .replace(/<dl class="metrics"[\s\S]*?<\/dl>/, '<p id="live-status" role="status">Carregando atividade editorial…</p>')
    .replace(/<section class="stories" aria-labelledby="stories-title"[\s\S]*?<\/main>/, '</main>')
    .replace(/<dialog[\s\S]*?<\/dialog>/, '')
    .replace(/<div class="published-grid">[\s\S]*?<\/div>/, '<div class="published-grid"></div>'))
}

export async function newsroomActivity(c: Context<{ Bindings: Env; Variables: AppContext }>) {
  const response = await worldSnapshot(c)
  if (!response.ok) return response
  const snapshot = await response.json<{ at: number; posts: { id: number }[]; updates: unknown[] }>()
  const ids = snapshot.posts.map(post => post.id)
  if (!ids.length) return c.json({ ...snapshot, agents: [] }, 200, { 'Cache-Control': 'no-store' })
  const cutoff = new Date(snapshot.at).toISOString()
  const agents = c.env.DB.prepare(`
    SELECT w.post_id AS postId, r.action, r.completed_at AS completedAt
    FROM editorial_ai_workspaces w JOIN editorial_ai_runs r ON r.workspace_id = w.id
    WHERE w.post_id IN (${ids.map(() => '?').join(',')})
      AND w.status = 'approved' AND w.sensitivity = 'normal'
      AND julianday(w.approved_at) <= julianday(?)
      AND r.status = 'completed' AND julianday(r.completed_at) <= julianday(w.approved_at)
      AND r.action IN ('triage', 'draft', 'fact_check', 'rewrite', 'seo')
    ORDER BY r.completed_at DESC LIMIT 30
  `).bind(...ids, cutoff).all<{ postId: number; action: string; completedAt: string }>()
  const editorial = c.env.DB.prepare(`
    WITH recent AS MATERIALIZED (
      SELECT post_id, applied_at FROM editorial_post_updates
      WHERE applied_at BETWEEN ? AND ?
      ORDER BY applied_at DESC LIMIT 24
    )
    SELECT p.id, p.title, p.slug, p.published_at, c.name AS category, u.applied_at
    FROM recent u CROSS JOIN posts p ON p.id = u.post_id
    JOIN categories c ON c.id = p.category_id
    WHERE p.status = 'published' AND p.publication_id = 'diario' AND p.seo_noindex = 0
      AND julianday(p.published_at) <= julianday(u.applied_at)
    ORDER BY u.applied_at DESC LIMIT 12
  `).bind(new Date(snapshot.at - 86400000).toISOString(), cutoff)
    .all<{ id: number; title: string; slug: string; published_at: string; category: string; applied_at: string }>()
  const [agentRows, editorialRows] = await Promise.all([agents, editorial])
  const editorialEvents = editorialRows.results.map(row => ({
    at: Date.parse(row.applied_at),
    post: { id: row.id, title: row.title, category: row.category, url: getPostUrl(row) }
  }))
  return c.json({ ...snapshot, agents: agentRows.results, editorialEvents }, 200, { 'Cache-Control': 'no-store' })
}

export function newsroomStyle(c: Context) {
  return c.text(style.replace("url('redacao.webp')", `url('${assets}redacao.webp')`), 200, {
    'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'public, max-age=300'
  })
}

export function newsroomScript(c: Context) {
  return c.text(script, 200, {
    'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=300'
  })
}
