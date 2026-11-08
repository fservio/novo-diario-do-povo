import type { Context } from 'hono'
import type { Env, AppContext } from '../types'
import type { Post } from '../db/posts'
import { getPostById } from '../db/posts'
import { listSeoHistory, readSeoMetadata, restoreSeoRevision, SeoAutomationError, seoStats } from '../seo-automation'
import { getPostUrl } from '../utils/post'
import { hasPermission } from '../middleware/rbac'
import { escapeHtml as esc, renderAdminLayout, renderCsrfInput } from './ui'

const DEFAULT_BRAND = 'Jornal Diário do Povo'
type AdminContext = Context<{ Bindings: Env; Variables: AppContext }>
type HistoryRow = Awaited<ReturnType<typeof listSeoHistory>>[number]

export function renderSeoAutomationPanel(params: { post?: Post; csrfToken: string; siteName?: string }): string {
  const { post } = params
  const metadata = readSeoMetadata(post || {})
  const brand = params.siteName || DEFAULT_BRAND
  const title = metadata.seo_title || post?.title || 'Título da matéria'
  const description = metadata.seo_description || post?.excerpt || post?.title || 'A descrição da matéria aparecerá aqui.'
  const url = post?.slug ? getPostUrl(post, 'https://diario.dopovo.com.br') : 'https://diario.dopovo.com.br/materia/'
  return `<link rel="stylesheet" href="/static/admin-seo.css?v=20261106">
  <details class="post-seo-panel" data-seo-panel data-seo-brand="${esc(brand)}" ${post?.id ? `data-seo-post-id="${post.id}"` : ''}>
    <summary>🔍 SEO &amp; Metadados <span>Pesquisa Google</span></summary>
    <div class="post-seo-panel__body">
      <p class="post-seo-hint">Título e descrição próprios ajudam a apresentar a matéria na busca. Campos vazios usam a manchete e o resumo. As palavras-chave orientam a edição e não alteram as tags da matéria.</p>
      <input type="hidden" name="expected_seo_version" value="${post?.seo_version || 0}">
      <div class="form-group"><label for="seoTitle">Título SEO (Meta Title)</label><input id="seoTitle" class="form-control" name="seo_title" maxlength="200" value="${esc(metadata.seo_title)}" placeholder="Automático: manchete da matéria"><small data-seo-counter="seoTitle">${metadata.seo_title.length}/200</small></div>
      <div class="form-group"><label for="seoDescription">Descrição SEO (Meta Description)</label><textarea id="seoDescription" class="form-control" name="seo_description" maxlength="500" rows="3" placeholder="Automático: resumo da matéria">${esc(metadata.seo_description)}</textarea><small data-seo-counter="seoDescription">${metadata.seo_description.length}/500</small></div>
      <div class="form-group"><label for="seoPrimaryKeyword">Palavra-chave principal</label><input id="seoPrimaryKeyword" class="form-control" name="seo_primary_keyword" maxlength="120" value="${esc(metadata.seo_primary_keyword)}" placeholder="Expressão de busca atendida pela matéria"></div>
      <div class="form-group"><label for="seoSecondaryKeywords">Palavras-chave secundárias</label><textarea id="seoSecondaryKeywords" class="form-control" name="seo_secondary_keywords" rows="4" maxlength="604" aria-describedby="seoKeywordsHint">${esc(metadata.seo_secondary_keywords.join('\n'))}</textarea><small id="seoKeywordsHint">Até cinco expressões distintas, uma por linha, com até 120 caracteres cada.</small></div>
      <section class="post-seo-preview" aria-label="Prévia estimada do resultado de busca">
        <small>Prévia estimada · o Google pode escolher outro título ou trecho</small>
        <span class="post-seo-preview__url">${esc(url)}</span>
        <strong data-seo-preview-title>${esc(`${title} | ${brand}`)}</strong>
        <p data-seo-preview-description>${esc(description)}</p>
      </section>
      ${post?.id ? `<section class="post-seo-history" aria-label="Histórico e origem dos metadados"><div class="post-seo-history__heading"><strong>Histórico e origem dos termos</strong><a href="/admin/posts/${post.id}/seo/history">Abrir histórico completo</a></div><p class="post-seo-hint">Confira versões, justificativas e dados de conteúdo, Search Console e Trends usados na otimização.</p><button type="button" class="btn btn-outline" data-seo-load-history>Carregar histórico</button><div data-seo-history-target aria-live="polite"></div></section>` : '<p class="post-seo-hint">O histórico ficará disponível depois de salvar a matéria.</p>'}
      <a class="post-seo-hint" href="/admin/posts/seo/automation">Ver fila e resultados da automação SEO</a>
      <details class="post-seo-technical"><summary>Configurações de indexação</summary><div class="form-group"><label for="seoCanonical">URL Canônica (opcional)</label><input id="seoCanonical" class="form-control" type="url" name="seo_canonical" value="${esc(post?.seo_canonical || '')}" placeholder="https://exemplo.com/url-original"></div><label class="post-seo-checkbox"><input type="checkbox" name="seo_noindex" value="1" ${post?.seo_noindex ? 'checked' : ''}> Não indexar nos buscadores</label><p class="post-seo-hint">Estas opções são editoriais e não são modificadas pela automação SEO.</p></details>
    </div>
  </details><script src="/static/admin-seo.js?v=20261106" defer></script>`
}

function formatDate(value: string): string {
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z')
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' })
}

export function seoEvidenceSources(evidence: unknown): string[] {
  if (!evidence || typeof evidence !== 'object') return []
  const record = evidence as Record<string, unknown>
  const declared = Array.isArray(record.used_sources) ? record.used_sources.filter(value => typeof value === 'string') as string[] : []
  const search = asRecord(record.search_console)
  const trends = asRecord(record.trends)
  const labels = new Set<string>()
  if (declared.includes('content') && record.content && typeof record.content === 'object') labels.add('Conteúdo')
  if (declared.includes('search_console') && search.status === 'available' && Array.isArray(search.rows) && search.rows.length) labels.add('Search Console')
  if (declared.includes('trends') && trends.status === 'available' && Array.isArray(trends.items) && trends.items.length) labels.add('Trends')
  return [...labels]
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
}

function evidenceStatus(source: Record<string, any>, used: boolean): string {
  if (used) return 'Utilizado nesta versão'
  if (source.status === 'available') return 'Disponível; não utilizado nesta versão'
  if (source.status === 'not_configured') return 'Não conectado'
  if (source.status === 'pending') return 'Consulta pendente'
  if (source.status === 'no_relevant_queries') return 'Sem consultas relacionadas'
  if (source.status === 'unavailable_or_no_fresh_signals') return 'Sem sinais recentes disponíveis'
  if (source.status === 'unavailable') return 'Indisponível nesta consulta'
  return 'Não informado'
}

function displayNumber(value: unknown, kind: 'integer' | 'position' | 'ctr' = 'integer'): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (kind === 'ctr' && value > 1)) return '—'
  return kind === 'ctr' ? `${(value * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
    : value.toLocaleString('pt-BR', { maximumFractionDigits: kind === 'integer' ? 0 : 1 })
}

export function renderSeoEvidence(evidence: unknown): string {
  const record = asRecord(evidence), search = asRecord(record.search_console), trends = asRecord(record.trends)
  const used = seoEvidenceSources(record)
  const rows = Array.isArray(search.rows) ? search.rows.slice(0, 5).map(asRecord) : []
  const items = Array.isArray(trends.items) ? trends.items.slice(0, 5).map(asRecord) : []
  const support = Array.isArray(record.support) ? record.support.slice(0, 6).map(asRecord) : []
  const start = typeof search.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(search.startDate) ? search.startDate : ''
  const end = typeof search.endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(search.endDate) ? search.endDate : ''
  return `<details class="post-seo-evidence"><summary>Dados usados na decisão e disponibilidade das fontes</summary><p class="post-seo-hint"><strong>Search Console:</strong> ${evidenceStatus(search, used.includes('Search Console'))}${start && end ? ` · ${esc(start)} a ${esc(end)} · Brasil · Pesquisa Web` : ''}.</p>${search.status === 'available' && rows.length ? `<div class="post-seo-evidence__table"><table><thead><tr><th>Consulta</th><th>Impressões</th><th>Cliques</th><th>CTR</th><th>Posição</th></tr></thead><tbody>${rows.map(row => `<tr><td>${esc(String(row.query || '').slice(0, 300))}</td><td>${displayNumber(row.impressions)}</td><td>${displayNumber(row.clicks)}</td><td>${displayNumber(row.ctr, 'ctr')}</td><td>${displayNumber(row.position, 'position')}</td></tr>`).join('')}</tbody></table></div>` : ''}<p class="post-seo-hint"><strong>Trends:</strong> ${evidenceStatus(trends, used.includes('Trends'))}${typeof trends.fetched_at === 'string' ? ` · Consultado em ${esc(formatDate(trends.fetched_at))}` : ''}.</p>${trends.status === 'available' && items.length ? `<ul>${items.map(item => `<li>${esc(String(item.term || '').slice(0, 300))}${typeof item.published_at === 'string' ? ` <small>(${esc(formatDate(item.published_at))})</small>` : ''}</li>`).join('')}</ul>` : ''}${support.length ? `<strong>Trechos que sustentam os termos</strong><dl class="post-seo-values">${support.filter(item => typeof item.term === 'string' && typeof item.quote === 'string').map(item => `<dt>${esc(item.term.slice(0, 120))}</dt><dd>${esc(item.quote.slice(0, 600))}</dd>`).join('')}</dl>` : ''}</details>`
}

function renderMetadata(metadata: ReturnType<typeof readSeoMetadata>): string {
  return `<dl class="post-seo-values"><dt>Título SEO</dt><dd>${esc(metadata.seo_title) || '—'}</dd><dt>Descrição SEO</dt><dd>${esc(metadata.seo_description) || '—'}</dd><dt>Palavra-chave principal</dt><dd>${esc(metadata.seo_primary_keyword) || '—'}</dd><dt>Secundárias</dt><dd>${metadata.seo_secondary_keywords.map(value => `<span class="post-seo-term">${esc(value)}</span>`).join(' ') || '—'}</dd></dl>`
}

export function renderSeoHistoryFragment(params: { postId: number; seoVersion: number; history: HistoryRow[]; csrfToken: string; allowRestore?: boolean }): string {
  return `<div data-seo-history-content>${params.history.length ? params.history.map(row => {
    const sources = seoEvidenceSources(row.evidence)
    return `<article class="post-seo-revision" id="seo-revision-${row.id}"><header><strong>Versão registrada #${row.id}</strong><span>${esc(formatDate(row.created_at))}</span></header><p>${esc(row.reason || 'Alteração de metadados SEO.')}</p><p class="post-seo-hint">Origem: ${sources.length ? sources.map(esc).join(' · ') : 'Não informada'} · Responsável: ${esc(row.actor || 'Não informado')}</p><div class="post-seo-revision__comparison"><section><h3>Antes</h3>${renderMetadata(readSeoMetadata(row.before))}</section><section><h3>Depois</h3>${renderMetadata(readSeoMetadata(row.after))}</section></div>${renderSeoEvidence(row.evidence)}${params.allowRestore ? `<form method="post" action="/admin/posts/${params.postId}/seo/revisions/${row.id}/restore">${renderCsrfInput(params.csrfToken)}<input type="hidden" name="expected_seo_version" value="${params.seoVersion}"><button class="btn btn-outline" type="submit">Restaurar os valores anteriores a esta alteração</button><small>A restauração cria outra revisão e preserva manchete, texto e datas editoriais.</small></form>` : `<a href="/admin/posts/${params.postId}/seo/history#seo-revision-${row.id}">Revisar e restaurar esta versão</a>`}</article>`
  }).join('') : '<p class="post-seo-hint">Ainda não há alterações registradas. A origem dos termos aparecerá com a primeira otimização.</p>'}</div>`
}

export async function handleSeoHistory(c: AdminContext) {
  const user = c.get('adminUser')
  if (!user || !hasPermission(user.role, 'view')) return c.text('Acesso restrito à redação.', 403)
  const postId = Number(c.req.param('id'))
  if (!Number.isSafeInteger(postId) || postId < 1) return c.notFound()
  const post = await getPostById(c.env.DB, postId)
  if (!post) return c.notFound()
  const history = await listSeoHistory(c.env.DB, postId)
  const fragment = c.req.query('fragment') === '1'
  const content = renderSeoHistoryFragment({ postId, seoVersion: post.seo_version || 0, history, csrfToken: c.get('csrfToken') || '', allowRestore: !fragment })
  c.header('Cache-Control', 'private, no-store')
  if (fragment) return c.html(content)
  return c.html(renderAdminLayout({ title: 'Histórico SEO', user: c.get('adminUser'), csrfToken: c.get('csrfToken') || '', activeTab: 'posts', bodyHtml: `<link rel="stylesheet" href="/static/admin-seo.css?v=20261106"><div class="page-intro"><div><p class="page-kicker">SEO e metadados · Matéria #${post.id}</p><h1 class="page-title">Histórico SEO</h1><p class="page-description">${esc(post.title)}</p></div><a class="btn btn-outline" href="/admin/posts/${post.id}">Voltar à matéria</a></div>${c.req.query('error') ? '<p role="alert" class="admin-flash">Não foi possível restaurar. Recarregue o histórico se os metadados tiverem sido alterados.</p>' : ''}${content}` }))
}

export async function handleSeoRestore(c: AdminContext) {
  const user = c.get('adminUser')
  if (!user || !hasPermission(user.role, 'edit')) return c.text('Acesso restrito à edição.', 403)
  const postId = Number(c.req.param('id'))
  const revisionId = Number(c.req.param('revisionId'))
  if (!Number.isSafeInteger(postId) || postId < 1 || !Number.isSafeInteger(revisionId) || revisionId < 1) return c.notFound()
  const body = (c.get('parsedBody') || await c.req.parseBody()) as Record<string, unknown>
  const version = Number(body.expected_seo_version)
  if (body.expected_seo_version === undefined || !Number.isSafeInteger(version) || version < 0) return c.text('Versão SEO inválida.', 422)
  try {
    await restoreSeoRevision(c.env.DB, postId, revisionId, version, `user:${user.id}`)
    return c.redirect(`/admin/posts/${postId}?message=seo_restored`, 303)
  } catch (error) {
    if (error instanceof SeoAutomationError && error.status === 404) return c.notFound()
    return c.redirect(`/admin/posts/${postId}/seo/history?error=restore`, 303)
  }
}

export function renderSeoPilotStatuses(pilots: unknown): string {
  if (!Array.isArray(pilots) || !pilots.length) return '<p class="post-seo-hint">Nenhum piloto do acervo foi preparado.</p>'
  const labels: Record<string, string> = { pending: 'pendente', leased: 'em processamento', no_change: 'sem alteração aplicada', needs_review: 'revisão necessária', conflict: 'conflito', exhausted: 'tentativas esgotadas', missing_job: 'trabalho não encontrado' }
  return `<section class="card"><h2>Piloto do acervo</h2>${pilots.map(asRecord).map(pilot => `<article class="post-seo-revision"><header><strong>Piloto #${Number(pilot.pilot_id) || 0}</strong><span>${pilot.status === 'observing' ? 'Em observação' : pilot.status === 'empty' ? 'Sem páginas elegíveis' : 'Aguardando aplicação nas tratadas'}</span></header><p>${Number(pilot.applied_count) || 0} de ${Number(pilot.treatment_count) || 0} páginas tratadas receberam uma alteração SEO.</p>${pilot.started_at ? `<p class="post-seo-hint">Referência de início: ${esc(formatDate(String(pilot.started_at)))}. As janelas de avaliação começam após a aplicação na última página tratada.</p>` : pilot.status !== 'empty' ? `<p class="post-seo-hint">${Number(pilot.pending_count) || 0} páginas ainda não receberam a alteração. A observação de 14 e 28 dias só começa quando todas as tratadas forem aplicadas.</p>` : ''}${Array.isArray(pilot.pending) && pilot.pending.length ? `<details><summary>Consultar pendências</summary><ul>${pilot.pending.slice(0, 30).map(asRecord).map(item => `<li><a href="/admin/posts/${Number(item.post_id) || 0}">Matéria #${Number(item.post_id) || 0}</a> · ${esc(labels[String(item.state)] || 'situação não informada')}</li>`).join('')}</ul></details>` : ''}</article>`).join('')}</section>`
}

export async function handleSeoAutomationStatus(c: AdminContext) {
  const user = c.get('adminUser')
  if (!user || !hasPermission(user.role, 'view')) return c.text('Acesso restrito à redação.', 403)
  const stats = await seoStats(c.env.DB)
  const states = new Map<string, number>(stats.states.map((row: { state: string; count: number }) => [row.state, Number(row.count)]))
  const labels: Record<string, string> = { pending: 'Pendentes', leased: 'Em processamento', applied: 'Aplicadas', no_change: 'Sem alteração', needs_review: 'Revisão necessária', conflict: 'Conflitos', exhausted: 'Falhas após tentativas' }
  const body = `<link rel="stylesheet" href="/static/admin-seo.css?v=20261106"><div class="page-intro"><div><p class="page-kicker">Redação · Automação SEO</p><h1 class="page-title">Fila e resultados SEO</h1><p class="page-description">${stats.config?.enabled ? 'Ativa' : 'Desativada'} · Dia editorial ${esc(stats.day)} · ${Number(stats.generations) || 0} gerações de ${Number(stats.config?.daily_limit) || 300} permitidas hoje.</p></div><a class="btn btn-outline" href="/admin/posts">Voltar às matérias</a></div><section class="card"><p>As pendências continuam na fila quando o limite diário é atingido. Cada alteração pode ser conferida e restaurada no histórico da matéria.</p><dl class="post-seo-stats">${Object.entries(labels).map(([key, label]) => `<div><dt>${label}</dt><dd>${states.get(key) || 0}</dd></div>`).join('')}</dl><p class="post-seo-hint">As contagens representam os trabalhos registrados, não ganhos de posições ou cliques. O resultado na busca exige acompanhamento no Search Console.</p>${stats.config?.activated_at ? `<p class="post-seo-hint">Primeira ativação: ${esc(formatDate(stats.config.activated_at))}.</p>` : ''}</section>${renderSeoPilotStatuses(stats.pilots)}`
  c.header('Cache-Control', 'private, no-store')
  return c.html(renderAdminLayout({ title: 'Automação SEO', user, csrfToken: c.get('csrfToken') || '', activeTab: 'posts', bodyHtml: body }))
}
