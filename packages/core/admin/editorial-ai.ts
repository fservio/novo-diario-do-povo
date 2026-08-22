import type { Context } from 'hono'
import type { AppContext, Env } from '../types'
import type { AdminUser } from './ui'
import { escapeHtml, renderAdminIcon, renderAdminLayout, renderCsrfInput } from './ui'
import { normalizeRole, roleRank } from '../db/users'
import { listCategories } from '../db/categories'
import { listActiveAuthors } from '../db/authors'
import { logAudit } from '../db'
import {
  addEditorialMaterial,
  approveEditorialWorkspace,
  applyEditorialRevisionToPost,
  createEditorialSource,
  createWorkspaceForPost,
  createWorkspaceFromFeedItem,
  describeSourcePolicy,
  getEditorialAiRuntimeConfig,
  getEditorialAiStats,
  getEditorialFeedItem,
  getEditorialWorkspace,
  listEditorialAiRuns,
  listEditorialClaims,
  listEditorialFeedItems,
  listEditorialMaterials,
  listEditorialRevisions,
  listEditorialSources,
  listEditorialWorkspaces,
  reviewEditorialClaim,
  runEditorialCopydesk,
  runEditorialDraft,
  runEditorialFactCheck,
  runEditorialTriage,
  setEditorialSourceActive,
  syncAllEditorialSources,
  syncEditorialSource,
  updateEditorialFeedItemStatus,
  updateEditorialWorkspaceBrief,
  validateEditorialFeedUrl
} from '../editorial-ai'
import type {
  EditorialClaimStatus,
  EditorialDepth,
  EditorialDraftFormat,
  EditorialFeedItemStatus,
  EditorialMaterial,
  EditorialUsagePolicy
} from '../editorial-ai'

type AdminContext = Context<{ Bindings: Env; Variables: AppContext }>

function message(c: AdminContext, type: 'message' | 'error'): string {
  const value = c.req.query(type)
  if (!value) return ''
  const className = type === 'message' ? 'newsletter-notice--success' : 'newsletter-notice--error'
  const role = type === 'message' ? 'status' : 'alert'
  return `<div class="newsletter-notice ${className}" role="${role}">${escapeHtml(value)}</div>`
}

function formatDate(value?: string | null): string {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString('pt-BR', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    })
  } catch {
    return value
  }
}

function truncate(value: string | null | undefined, length = 180): string {
  const text = String(value || '').trim()
  return text.length > length ? `${text.slice(0, length - 1)}…` : text
}

function parseStringArray(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(item => String(item).trim()).filter(Boolean) : []
  } catch {
    return []
  }
}

function roleCanEdit(user: AdminUser): boolean {
  return roleRank(normalizeRole(user.role)) >= roleRank('writer')
}

function roleCanApprove(user: AdminUser): boolean {
  return roleRank(normalizeRole(user.role)) >= roleRank('editor')
}

function roleCanManageSources(user: AdminUser): boolean {
  return normalizeRole(user.role) === 'director'
}

async function assertWorkspaceOpen(c: AdminContext, workspaceId: number): Promise<void> {
  const workspace = await getEditorialWorkspace(c.env, workspaceId)
  if (!workspace) throw new Error('Pauta não encontrada.')
  if (workspace.status === 'approved' || workspace.status === 'archived') {
    throw new Error('Esta pauta está encerrada e não pode mais ser alterada.')
  }
}

function assertPositiveInt(value: unknown, label: string): number {
  const parsed = Number.parseInt(String(value || ''), 10)
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${label} inválido.`)
  return parsed
}

function safeExternalUrl(value: string): string {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return ''
    return url.toString()
  } catch {
    return ''
  }
}

const workspaceLabels: Record<string, string> = {
  briefing: 'Apuração',
  draft: 'Rascunho',
  fact_check: 'Checagem',
  review: 'Revisão',
  approved: 'Aprovada',
  archived: 'Arquivada'
}

const feedLabels: Record<string, string> = {
  new: 'Nova',
  shortlisted: 'Selecionada',
  in_progress: 'Em produção',
  discarded: 'Descartada',
  converted: 'Convertida'
}

const claimLabels: Record<EditorialClaimStatus, string> = {
  confirmed: 'Confirmada',
  divergent: 'Divergente',
  unsupported: 'Sem evidência',
  needs_review: 'Revisão humana',
  reviewed: 'Revisada'
}

function statusBadge(status: string, labels: Record<string, string>): string {
  return `<span class="ai-status ai-status--${escapeHtml(status)}"><i></i>${escapeHtml(labels[status] || status)}</span>`
}

export async function renderEditorialAiDashboard(c: AdminContext): Promise<Response> {
  const user = c.get('adminUser') as AdminUser
  const csrfToken = c.get('csrfToken') || ''
  const [stats, workspaces, config, sources] = await Promise.all([
    getEditorialAiStats(c.env),
    listEditorialWorkspaces(c.env, 12),
    getEditorialAiRuntimeConfig(c.env),
    listEditorialSources(c.env)
  ])
  const activeSources = sources.filter(source => source.is_active).length
  const readiness = config.enabled && config.apiKeyConfigured
  const bodyHtml = `
    <div class="page-intro ai-page-intro">
      <div>
        <p class="page-kicker">Inteligência editorial</p>
        <h1 class="page-title">Redação IA</h1>
        <p class="page-description">Da descoberta à revisão: fontes, apuração, rascunhos e evidências em um fluxo supervisionado.</p>
      </div>
      <div class="ai-page-actions">
        <a class="btn btn-outline" href="/admin/redacao-ia/fontes"><span class="admin-icon">${renderAdminIcon('source')}</span> Fontes</a>
        <a class="btn" href="/admin/redacao-ia/radar"><span class="admin-icon">${renderAdminIcon('radar')}</span> Abrir Radar</a>
      </div>
    </div>
    ${message(c, 'message')}${message(c, 'error')}

    <section class="ai-command-bar ${readiness ? 'is-ready' : ''}">
      <div class="ai-command-mark"><span class="admin-icon">${renderAdminIcon('ai')}</span></div>
      <div>
        <p class="page-kicker">Sistema editorial supervisionado</p>
        <h2>${readiness ? 'Copiloto disponível para a redação' : 'A estrutura está pronta; falta configurar a chave da API'}</h2>
        <p>${readiness
          ? `Modelo ${escapeHtml(config.model)} · até ${config.maxDailyRuns} operações em 24 horas · publicação sempre manual.`
          : 'Configure OPENAI_API_KEY como segredo do Cloudflare. RSS, dossiês e revisão humana já funcionam sem a chave.'}</p>
      </div>
      <a class="btn btn-outline" href="/admin/integrations">Configurar integração</a>
    </section>

    <section class="ai-metrics" aria-label="Indicadores da Redação IA">
      <article><span>Fontes ativas</span><strong>${activeSources}</strong><small>RSS e Atom monitorados</small></article>
      <article><span>Novidades no radar</span><strong>${stats.feed_new || 0}</strong><small>${stats.feed_total || 0} itens recebidos</small></article>
      <article><span>Pautas em produção</span><strong>${(stats.workspace_briefing || 0) + (stats.workspace_draft || 0) + (stats.workspace_fact_check || 0) + (stats.workspace_review || 0)}</strong><small>${stats.workspace_approved || 0} aprovadas</small></article>
      <article><span>IA em 30 dias</span><strong>${stats.runs_30d || 0}</strong><small>${Number(stats.tokens_30d || 0).toLocaleString('pt-BR')} tokens registrados</small></article>
    </section>

    <div class="ai-dashboard-grid">
      <section class="card ai-worklist">
        <div class="ai-section-head">
          <div><p class="page-kicker">Fluxo editorial</p><h2>Pautas recentes</h2></div>
          <a href="/admin/redacao-ia/radar">Encontrar novas pautas →</a>
        </div>
        ${workspaces.length ? `<div class="ai-workspace-list">${workspaces.map(workspace => `
          <a href="/admin/redacao-ia/pautas/${workspace.id}" class="ai-workspace-row">
            <span class="ai-workspace-number">#${workspace.id}</span>
            <span class="ai-workspace-main">
              <small>${escapeHtml(workspace.source_name || (workspace.post_id ? 'Matéria do CMS' : 'Pauta interna'))}</small>
              <strong>${escapeHtml(workspace.title)}</strong>
              <em>Atualizada em ${escapeHtml(formatDate(workspace.updated_at))}</em>
            </span>
            ${statusBadge(workspace.status, workspaceLabels)}
          </a>
        `).join('')}</div>` : `
          <div class="ai-empty"><span class="admin-icon">${renderAdminIcon('ai')}</span><h3>A primeira pauta começa no Radar</h3><p>Cadastre uma fonte, sincronize e transforme um item relevante em dossiê editorial.</p><a class="btn" href="/admin/redacao-ia/fontes">Cadastrar fonte</a></div>
        `}
      </section>

      <aside class="card ai-principles">
        <p class="page-kicker">Protocolo do Diário</p>
        <h2>IA assistente.<br>Jornalista responsável.</h2>
        <ol>
          <li><span>01</span><div><strong>Fonte rastreável</strong><p>Todo rascunho nasce de materiais identificados.</p></div></li>
          <li><span>02</span><div><strong>Confidencialidade explícita</strong><p>Materiais marcados como confidenciais não são enviados à API.</p></div></li>
          <li><span>03</span><div><strong>Checagem estruturada</strong><p>Nomes, datas, números e afirmações viram itens revisáveis.</p></div></li>
          <li><span>04</span><div><strong>Sem autopublicação</strong><p>A IA somente cria versões; o CMS mantém o post como rascunho.</p></div></li>
        </ol>
      </aside>
    </div>
  `
  return c.html(renderAdminLayout({
    title: 'Redação IA', user, bodyHtml, activeTab: 'redacao-ia', csrfToken
  }))
}

export async function renderEditorialSourcesPage(c: AdminContext): Promise<Response> {
  const user = c.get('adminUser') as AdminUser
  const csrfToken = c.get('csrfToken') || ''
  const sources = await listEditorialSources(c.env)
  const canManage = roleCanManageSources(user)
  const bodyHtml = `
    <div class="page-intro ai-page-intro">
      <div><a class="newsletter-back" href="/admin/redacao-ia">← Redação IA</a><p class="page-kicker">Radar de Fontes</p><h1 class="page-title">Fontes monitoradas</h1><p class="page-description">Cadastre RSS e Atom com regras de confiança, atribuição e reutilização.</p></div>
      <form method="post" action="/admin/redacao-ia/fontes/sincronizar">${renderCsrfInput(csrfToken)}<button class="btn" type="submit" ${sources.some(source => source.is_active) ? '' : 'disabled'}><span class="admin-icon">${renderAdminIcon('radar')}</span> Sincronizar todas</button></form>
    </div>
    ${message(c, 'message')}${message(c, 'error')}

    <div class="ai-sources-layout">
      <section class="card ai-source-form">
        <div class="ai-section-head"><div><p class="page-kicker">Nova conexão</p><h2>Cadastrar fonte</h2></div><span class="ai-access-chip">${canManage ? 'Diretor' : 'Somente leitura'}</span></div>
        <form method="post" action="/admin/redacao-ia/fontes">
          ${renderCsrfInput(csrfToken)}
          <div class="form-group"><label for="source-name">Nome da fonte</label><input class="form-control" id="source-name" name="name" maxlength="160" required placeholder="Agência Brasil"></div>
          <div class="form-group"><label for="source-feed-url">URL RSS ou Atom</label><input class="form-control" id="source-feed-url" name="feed_url" type="url" maxlength="2000" required placeholder="https://exemplo.com/rss.xml"><small>A URL é validada e redes privadas são bloqueadas.</small></div>
          <div class="form-group"><label for="source-site-url">Site da fonte <span>opcional</span></label><input class="form-control" id="source-site-url" name="site_url" type="url" maxlength="2000" placeholder="https://exemplo.com/"></div>
          <div class="ai-source-grid">
            <div class="form-group"><label for="source-trust">Classificação</label><select class="form-control" id="source-trust" name="trust_level"><option value="official">Fonte oficial</option><option value="partner">Parceiro</option><option value="monitored" selected>Monitorada</option></select></div>
            <div class="form-group"><label for="source-policy">Política de uso</label><select class="form-control" id="source-policy" name="usage_policy"><option value="link_only" selected>Somente pauta e link</option><option value="summary">Síntese com atribuição</option><option value="licensed">Conteúdo licenciado</option></select></div>
          </div>
          <div class="form-group"><label for="source-attribution">Atribuição</label><input class="form-control" id="source-attribution" name="attribution_label" maxlength="200" placeholder="Fonte: Agência Brasil"></div>
          <div class="form-group"><label for="source-interval">Intervalo de consulta</label><select class="form-control" id="source-interval" name="fetch_interval_minutes"><option value="15">15 minutos</option><option value="30">30 minutos</option><option value="60" selected>1 hora</option><option value="180">3 horas</option><option value="1440">1 dia</option></select></div>
          <div class="ai-source-checks">
            <label><input type="checkbox" name="allow_full_text" value="1"><span><strong>Texto integral autorizado</strong><small>Somente com licença ou permissão clara.</small></span></label>
            <label><input type="checkbox" name="allow_images" value="1"><span><strong>Imagem autorizada</strong><small>RSS não concede licença automaticamente.</small></span></label>
            <label><input type="checkbox" name="requires_noindex" value="1"><span><strong>Exigir noindex</strong><small>Para conteúdo sindicado conforme acordo.</small></span></label>
          </div>
          <button class="btn" type="submit" ${canManage ? '' : 'disabled'}>Cadastrar e monitorar</button>
        </form>
      </section>

      <section class="card ai-source-list-card">
        <div class="ai-section-head"><div><p class="page-kicker">Governança</p><h2>${sources.length} fontes cadastradas</h2></div></div>
        ${sources.length ? `<div class="ai-source-list">${sources.map(source => `
          <article class="ai-source-item ${source.is_active ? '' : 'is-inactive'}">
            <div class="ai-source-state"><i></i><span>${source.is_active ? 'Ativa' : 'Pausada'}</span></div>
            <div class="ai-source-copy">
              <div><strong>${escapeHtml(source.name)}</strong><span>${escapeHtml(source.trust_level === 'official' ? 'Oficial' : source.trust_level === 'partner' ? 'Parceiro' : 'Monitorada')}</span></div>
              <a href="${escapeHtml(source.feed_url)}" target="_blank" rel="noopener nofollow">${escapeHtml(truncate(source.feed_url, 92))}</a>
              <p>${escapeHtml(describeSourcePolicy(source))}</p>
              ${source.last_error ? `<small class="ai-source-error">${escapeHtml(source.last_error)}</small>` : `<small>Último sucesso: ${escapeHtml(formatDate(source.last_success_at))}</small>`}
            </div>
            <div class="ai-source-actions">
              <form method="post" action="/admin/redacao-ia/fontes/${source.id}/sincronizar">${renderCsrfInput(csrfToken)}<button class="btn btn-outline btn-compact" type="submit" ${source.is_active ? '' : 'disabled'}>Sincronizar</button></form>
              ${canManage ? `<form method="post" action="/admin/redacao-ia/fontes/${source.id}/estado">${renderCsrfInput(csrfToken)}<input type="hidden" name="active" value="${source.is_active ? '0' : '1'}"><button class="ai-text-button" type="submit">${source.is_active ? 'Pausar' : 'Ativar'}</button></form>` : ''}
            </div>
          </article>
        `).join('')}</div>` : `<div class="ai-empty"><span class="admin-icon">${renderAdminIcon('source')}</span><h3>Nenhuma fonte cadastrada</h3><p>O Radar receberá notícias depois que a primeira fonte for configurada.</p></div>`}
      </section>
    </div>
  `
  return c.html(renderAdminLayout({
    title: 'Fontes · Redação IA', user, bodyHtml, activeTab: 'redacao-ia', csrfToken
  }))
}

export async function renderEditorialRadarPage(c: AdminContext): Promise<Response> {
  const user = c.get('adminUser') as AdminUser
  const csrfToken = c.get('csrfToken') || ''
  const statusValue = String(c.req.query('status') || 'new')
  const allowedStatuses = new Set(['new', 'shortlisted', 'in_progress', 'discarded', 'converted'])
  const status = allowedStatuses.has(statusValue) ? statusValue as EditorialFeedItemStatus : 'new'
  const sourceId = Number.parseInt(String(c.req.query('source') || ''), 10) || undefined
  const query = String(c.req.query('q') || '').slice(0, 120)
  const [feed, sources] = await Promise.all([
    listEditorialFeedItems(c.env, { status, sourceId, query, limit: 60 }),
    listEditorialSources(c.env)
  ])
  const bodyHtml = `
    <div class="page-intro ai-page-intro">
      <div><a class="newsletter-back" href="/admin/redacao-ia">← Redação IA</a><p class="page-kicker">Monitoramento</p><h1 class="page-title">Radar de Fontes</h1><p class="page-description">O RSS aponta acontecimentos; a redação decide o que merece apuração.</p></div>
      <a class="btn btn-outline" href="/admin/redacao-ia/fontes"><span class="admin-icon">${renderAdminIcon('source')}</span> Gerenciar fontes</a>
    </div>
    ${message(c, 'message')}${message(c, 'error')}

    <form class="card ai-radar-filters" method="get" action="/admin/redacao-ia/radar">
      <div class="form-group"><label for="radar-q">Buscar</label><input class="form-control" id="radar-q" name="q" value="${escapeHtml(query)}" placeholder="Assunto, título ou veículo"></div>
      <div class="form-group"><label for="radar-status">Situação</label><select class="form-control" id="radar-status" name="status">${Object.entries(feedLabels).map(([value, label]) => `<option value="${value}" ${status === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select></div>
      <div class="form-group"><label for="radar-source">Fonte</label><select class="form-control" id="radar-source" name="source"><option value="">Todas</option>${sources.map(source => `<option value="${source.id}" ${sourceId === source.id ? 'selected' : ''}>${escapeHtml(source.name)}</option>`).join('')}</select></div>
      <button class="btn" type="submit">Filtrar</button>
    </form>

    <div class="ai-radar-summary"><strong>${feed.total}</strong><span>${escapeHtml(feedLabels[status] || status)}${query ? ` para “${escapeHtml(query)}”` : ''}</span></div>
    ${feed.items.length ? `<section class="ai-radar-grid">${feed.items.map(item => `
      <article class="card ai-radar-card">
        <div class="ai-radar-meta">
          <span>${escapeHtml(item.source_name || 'Fonte')}</span>
          <time>${escapeHtml(formatDate(item.published_at || item.imported_at))}</time>
        </div>
        <h2><a href="${escapeHtml(item.source_url)}" target="_blank" rel="noopener nofollow">${escapeHtml(item.title)}</a></h2>
        <p>${escapeHtml(truncate(item.ai_summary || item.summary, 300) || 'A fonte não forneceu um resumo.')}</p>
        ${item.ai_local_angle ? `<div class="ai-local-angle"><strong>Ângulo sugerido</strong><p>${escapeHtml(item.ai_local_angle)}</p></div>` : ''}
        <div class="ai-radar-flags">
          ${statusBadge(item.status, feedLabels)}
          <span>${escapeHtml(item.trust_level === 'official' ? 'Fonte oficial' : item.trust_level === 'partner' ? 'Parceiro' : 'Monitorada')}</span>
          ${item.relevance_score ? `<span>Relevância ${item.relevance_score}</span>` : ''}
        </div>
        ${item.rights_warning ? `<div class="ai-rights-warning"><span class="admin-icon">${renderAdminIcon('shield')}</span><p>${escapeHtml(item.rights_warning)}</p></div>` : ''}
        <div class="ai-radar-actions">
          ${item.status !== 'discarded' && item.status !== 'converted' ? `<form method="post" action="/admin/redacao-ia/radar/${item.id}/pauta">${renderCsrfInput(csrfToken)}<button class="btn" type="submit">Abrir pauta</button></form>` : ''}
          ${item.status !== 'discarded' && item.status !== 'converted' ? `<form method="post" action="/admin/redacao-ia/radar/${item.id}/estado">${renderCsrfInput(csrfToken)}<input type="hidden" name="status" value="discarded"><button class="ai-text-button" type="submit">Descartar</button></form>` : ''}
          <a href="${escapeHtml(item.source_url)}" target="_blank" rel="noopener nofollow">Ler original ↗</a>
        </div>
      </article>
    `).join('')}</section>` : `<div class="card ai-empty"><span class="admin-icon">${renderAdminIcon('radar')}</span><h3>Nenhum item nesta visão</h3><p>Sincronize as fontes ou altere os filtros do Radar.</p><a class="btn btn-outline" href="/admin/redacao-ia/fontes">Ir para fontes</a></div>`}
  `
  return c.html(renderAdminLayout({
    title: 'Radar de Fontes', user, bodyHtml, activeTab: 'redacao-ia', csrfToken
  }))
}

export async function renderEditorialWorkspacePage(c: AdminContext, workspaceId: number): Promise<Response> {
  const user = c.get('adminUser') as AdminUser
  const csrfToken = c.get('csrfToken') || ''
  const workspace = await getEditorialWorkspace(c.env, workspaceId)
  if (!workspace) return c.html('<h1>Pauta não encontrada</h1>', 404)
  const [materials, revisions, runs, categories, authors, config, feedItem] = await Promise.all([
    listEditorialMaterials(c.env, workspace.id),
    listEditorialRevisions(c.env, workspace.id),
    listEditorialAiRuns(c.env, workspace.id),
    listCategories(c.env),
    listActiveAuthors(c.env),
    getEditorialAiRuntimeConfig(c.env),
    workspace.feed_item_id ? getEditorialFeedItem(c.env, workspace.feed_item_id) : Promise.resolve(null)
  ])
  const latestRevision = revisions[0]
  const reportingGaps = parseStringArray(latestRevision?.reporting_gaps_json)
  const claims = latestRevision ? await listEditorialClaims(c.env, workspace.id, latestRevision.id) : []
  const unresolved = claims.filter(claim => !claim.reviewer_user_id || ['needs_review', 'divergent', 'unsupported'].includes(claim.status)).length
  const canApprove = roleCanApprove(user)
  let defaultCategoryId = categories[0]?.id || 0
  let defaultAuthorId = authors[0]?.id || 0
  if (workspace.post_id) {
    const post = await c.env.DB.prepare('SELECT category_id, author_id FROM posts WHERE id = ?').bind(workspace.post_id).first<{ category_id: number; author_id: number }>()
    if (post) {
      defaultCategoryId = post.category_id
      defaultAuthorId = post.author_id
    }
  }
  const locked = workspace.status === 'approved' || workspace.status === 'archived'
  const aiReady = config.enabled && config.apiKeyConfigured
  const formatLabels: Record<EditorialDraftFormat, string> = {
    note: 'Nota factual', news: 'Notícia factual', report: 'Reportagem',
    explainer: 'Explicador', rewrite: 'Reescrita editorial'
  }
  const depthLabels: Record<EditorialDepth, string> = {
    brief: 'Breve', standard: 'Padrão', deep: 'Aprofundada'
  }
  const bodyHtml = `
    <div class="page-intro ai-page-intro">
      <div><a class="newsletter-back" href="/admin/redacao-ia">← Redação IA</a><p class="page-kicker">Pauta #${workspace.id}</p><h1 class="page-title">${escapeHtml(workspace.title)}</h1><p class="page-description">${escapeHtml(workspace.source_name || (workspace.post_id ? 'Vinculada a uma matéria existente' : 'Pauta editorial interna'))}</p></div>
      <div class="ai-page-actions">${statusBadge(workspace.status, workspaceLabels)}${workspace.post_id ? `<a class="btn btn-outline" href="/admin/posts/${workspace.post_id}">Abrir matéria</a>` : ''}</div>
    </div>
    ${message(c, 'message')}${message(c, 'error')}

    <section class="ai-workflow-track" aria-label="Etapas editoriais">
      ${['briefing', 'draft', 'fact_check', 'review', 'approved'].map((step, index) => `<div class="${workspace.status === step ? 'is-current' : ''} ${['briefing', 'draft', 'fact_check', 'review', 'approved'].indexOf(workspace.status) > index ? 'is-complete' : ''}"><span>${index + 1}</span><strong>${workspaceLabels[step]}</strong></div>`).join('')}
    </section>

    <div class="ai-workspace-layout">
      <main>
        ${feedItem ? `<section class="card ai-origin-card">
          <div><p class="page-kicker">Origem da pauta</p><h2>${escapeHtml(feedItem.title)}</h2><p>${escapeHtml(truncate(feedItem.summary, 460))}</p></div>
          <div><span>${escapeHtml(feedItem.source_name || '')}</span><a href="${escapeHtml(feedItem.source_url)}" target="_blank" rel="noopener nofollow">Conferir original ↗</a></div>
          ${feedItem.rights_warning ? `<footer><span class="admin-icon">${renderAdminIcon('shield')}</span><p>${escapeHtml(feedItem.rights_warning)}</p></footer>` : ''}
        </section>` : ''}

        <section class="card ai-brief-card">
          <div class="ai-section-head"><div><p class="page-kicker">Orientação humana</p><h2>Briefing da pauta</h2></div><span>${workspace.sensitivity === 'sensitive' ? 'Conteúdo sensível' : 'Fluxo normal'}</span></div>
          <form method="post" action="/admin/redacao-ia/pautas/${workspace.id}/briefing">
            ${renderCsrfInput(csrfToken)}
            <div class="form-group"><label for="workspace-title">Título de trabalho</label><input class="form-control" id="workspace-title" name="title" maxlength="220" required value="${escapeHtml(workspace.title)}"></div>
            <div class="form-group"><label for="workspace-brief">Orientação editorial</label><textarea class="form-control" id="workspace-brief" name="brief" rows="4" maxlength="10000" placeholder="Qual é a hipótese da pauta e o que precisa ser explicado, confirmado ou contextualizado?">${escapeHtml(workspace.brief || '')}</textarea></div>
            <div class="ai-editorial-direction">
              <div class="ai-direction-heading"><div><p class="page-kicker">Contrato de produção</p><h3>Formato e profundidade</h3></div><p>Estes parâmetros orientam extensão, estrutura e densidade do rascunho.</p></div>
              <div class="ai-direction-grid ai-direction-grid--three">
                <div class="form-group"><label for="workspace-format">Formato</label><select class="form-control" id="workspace-format" name="editorial_format">${(Object.entries(formatLabels) as Array<[EditorialDraftFormat, string]>).map(([value, label]) => `<option value="${value}" ${workspace.editorial_format === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select></div>
                <div class="form-group"><label for="workspace-depth">Profundidade</label><select class="form-control" id="workspace-depth" name="editorial_depth">${(Object.entries(depthLabels) as Array<[EditorialDepth, string]>).map(([value, label]) => `<option value="${value}" ${workspace.editorial_depth === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select></div>
                <div class="form-group"><label for="workspace-word-count">Extensão desejada <span>opcional</span></label><input class="form-control" id="workspace-word-count" name="target_word_count" type="number" min="200" max="2500" step="50" value="${workspace.target_word_count || ''}" placeholder="Automática pelo formato"></div>
              </div>
              <div class="form-group"><label for="workspace-angle">Enfoque principal</label><input class="form-control" id="workspace-angle" name="primary_angle" maxlength="2000" value="${escapeHtml(workspace.primary_angle || '')}" placeholder="Qual é o recorte central desta matéria?"></div>
              <div class="ai-direction-grid">
                <div class="form-group"><label for="workspace-audience">Público prioritário</label><input class="form-control" id="workspace-audience" name="target_audience" maxlength="1000" value="${escapeHtml(workspace.target_audience || '')}" placeholder="Ex.: moradores do Piauí afetados pela medida"></div>
                <div class="form-group"><label for="workspace-scope">Abrangência geográfica</label><input class="form-control" id="workspace-scope" name="geographic_scope" maxlength="1000" value="${escapeHtml(workspace.geographic_scope || '')}" placeholder="Ex.: Teresina e região metropolitana"></div>
              </div>
              <div class="ai-direction-grid">
                <div class="form-group"><label for="workspace-required">Informações obrigatórias</label><textarea class="form-control" id="workspace-required" name="required_information" rows="3" maxlength="5000" placeholder="Dados, personagens, explicações ou contrapontos que não podem faltar.">${escapeHtml(workspace.required_information || '')}</textarea></div>
                <div class="form-group"><label for="workspace-questions">Perguntas que o texto deve responder</label><textarea class="form-control" id="workspace-questions" name="key_questions" rows="3" maxlength="5000" placeholder="Uma pergunta por linha, quando possível.">${escapeHtml(workspace.key_questions || '')}</textarea></div>
              </div>
            </div>
            <label class="ai-sensitive-toggle"><input type="checkbox" name="sensitivity" value="sensitive" ${workspace.sensitivity === 'sensitive' ? 'checked' : ''}><span><strong>Matéria sensível</strong><small>Política, eleições, acusações, saúde, segurança ou menores.</small></span></label>
            <button class="btn btn-outline" type="submit" ${locked ? 'disabled' : ''}>Salvar direção editorial</button>
          </form>
        </section>

        <section class="card ai-materials-card">
          <div class="ai-section-head"><div><p class="page-kicker">Dossiê</p><h2>${materials.length} materiais vinculados</h2></div><span>${materials.filter(item => item.is_confidential).length} confidenciais</span></div>
          <div class="ai-material-list">${materials.map((material, index) => `
            <article>
              <span class="ai-material-index">${String(index + 1).padStart(2, '0')}</span>
              <div><div><strong>${escapeHtml(material.label)}</strong><span>${escapeHtml(material.kind)}</span>${material.is_confidential ? '<em>Não enviado à API</em>' : ''}</div><p>${escapeHtml(truncate(material.content_text, 260) || 'Material referenciado somente por URL.')}</p>${material.source_url ? `<a href="${escapeHtml(material.source_url)}" target="_blank" rel="noopener nofollow">${escapeHtml(truncate(material.source_url, 90))}</a>` : ''}</div>
            </article>
          `).join('')}</div>
          <details class="ai-add-material">
            <summary>+ Adicionar nota ou fonte</summary>
            <form method="post" action="/admin/redacao-ia/pautas/${workspace.id}/materiais">
              ${renderCsrfInput(csrfToken)}
              <div class="ai-source-grid">
                <div class="form-group"><label for="material-label">Identificação</label><input class="form-control" id="material-label" name="label" maxlength="200" required placeholder="Entrevista com a secretária"></div>
                <div class="form-group"><label for="material-kind">Tipo</label><select class="form-control" id="material-kind" name="kind"><option value="note">Nota da apuração</option><option value="url">Página da internet</option><option value="official">Documento oficial</option><option value="interview">Entrevista</option><option value="document">Documento</option></select></div>
              </div>
              <div class="form-group"><label for="material-url">URL <span>opcional</span></label><input class="form-control" id="material-url" name="source_url" type="url" maxlength="2000"></div>
              <div class="form-group"><label for="material-content">Conteúdo ou anotações</label><textarea class="form-control" id="material-content" name="content_text" rows="8" maxlength="50000" placeholder="Cole o trecho, a transcrição ou as anotações relevantes."></textarea></div>
              <div class="ai-source-grid">
                <div class="form-group"><label for="material-rights">Base de uso</label><select class="form-control" id="material-rights" name="rights_basis"><option value="internal">Produção própria</option><option value="link_only">Somente referência</option><option value="quotation">Citação atribuída</option><option value="licensed">Licenciado</option><option value="public_record">Documento público</option></select></div>
                <label class="ai-sensitive-toggle"><input type="checkbox" name="confidential" value="1"><span><strong>Material confidencial</strong><small>Será guardado no dossiê e excluído dos pedidos à OpenAI.</small></span></label>
              </div>
              <button class="btn" type="submit" ${locked ? 'disabled' : ''}>Adicionar ao dossiê</button>
            </form>
          </details>
        </section>

        <section class="card ai-generation-card">
          <div class="ai-section-head"><div><p class="page-kicker">Copiloto editorial</p><h2>Produção assistida</h2></div><span class="newsletter-provider ${aiReady ? 'is-ready' : ''}"><i></i>${aiReady ? escapeHtml(config.model) : 'API não configurada'}</span></div>
          <div class="ai-generation-options">
            <form method="post" action="/admin/redacao-ia/pautas/${workspace.id}/triagem">${renderCsrfInput(csrfToken)}<span class="admin-icon">${renderAdminIcon('radar')}</span><div><strong>Analisar pauta</strong><p>Resume, classifica relevância e aponta riscos.</p></div><button class="btn btn-outline" type="submit" ${!aiReady || locked ? 'disabled' : ''}>Executar</button></form>
            <form method="post" action="/admin/redacao-ia/pautas/${workspace.id}/rascunho">${renderCsrfInput(csrfToken)}<span class="admin-icon">${renderAdminIcon('ai')}</span><div><strong>Preparar primeira versão</strong><p>${escapeHtml(formatLabels[workspace.editorial_format] || formatLabels.news)} · ${escapeHtml(depthLabels[workspace.editorial_depth] || depthLabels.standard)}${workspace.target_word_count ? ` · cerca de ${workspace.target_word_count} palavras` : ''}. Produz plano, texto e matriz de afirmações.</p></div><button class="btn" type="submit" ${!aiReady || locked ? 'disabled' : ''}>Gerar rascunho</button></form>
            <form method="post" action="/admin/redacao-ia/pautas/${workspace.id}/copidesque">${renderCsrfInput(csrfToken)}${latestRevision ? `<input type="hidden" name="revision_id" value="${latestRevision.id}">` : ''}<span class="admin-icon">${renderAdminIcon('posts')}</span><div><strong>Copidesque profissional</strong><p>Refina lide, hierarquia, ritmo, coesão e precisão sem alterar os fatos.</p></div><button class="btn btn-outline" type="submit" ${!aiReady || !latestRevision || locked ? 'disabled' : ''}>Criar versão refinada</button></form>
            <form method="post" action="/admin/redacao-ia/pautas/${workspace.id}/checagem">${renderCsrfInput(csrfToken)}${latestRevision ? `<input type="hidden" name="revision_id" value="${latestRevision.id}">` : ''}<span class="admin-icon">${renderAdminIcon('shield')}</span><div><strong>Checar afirmações</strong><p>Compara o rascunho com os materiais disponíveis.</p></div><button class="btn btn-outline" type="submit" ${!aiReady || !latestRevision || locked ? 'disabled' : ''}>Checar versão</button></form>
          </div>
          <footer><span class="admin-icon">${renderAdminIcon('shield')}</span><p>A OpenAI recebe apenas materiais não confidenciais. Nenhuma ação publica conteúdo no site.</p></footer>
        </section>

        ${latestRevision ? `<section class="card ai-revision-card">
          <div class="ai-section-head"><div><p class="page-kicker">Versão ${revisions.length}</p><h2>${latestRevision.revision_kind === 'copydesk' ? 'Versão de copidesque' : 'Rascunho mais recente'}</h2></div><span>${escapeHtml(formatDate(latestRevision.created_at))}</span></div>
          <div class="ai-revision-headline"><small>${escapeHtml(latestRevision.hat || '')}</small><h2>${escapeHtml(latestRevision.title)}</h2><p>${escapeHtml(latestRevision.excerpt || '')}</p></div>
          <textarea class="form-control ai-revision-content" rows="18" readonly>${escapeHtml(latestRevision.content_markdown)}</textarea>
          <div class="ai-revision-diagnostics">
            <details open><summary>Plano editorial</summary><p>${escapeHtml(latestRevision.editorial_plan || 'Plano não registrado nesta versão.')}</p></details>
            <details><summary>Avaliação de qualidade</summary><p>${escapeHtml(latestRevision.quality_assessment || 'Avaliação não registrada nesta versão.')}</p></details>
            <details class="${reportingGaps.length ? 'has-gaps' : ''}"><summary>Lacunas de apuração · ${reportingGaps.length}</summary>${reportingGaps.length ? `<ul>${reportingGaps.map(gap => `<li>${escapeHtml(gap)}</li>`).join('')}</ul>` : '<p>Nenhuma lacuna adicional foi indicada pela IA. A revisão humana continua obrigatória.</p>'}</details>
          </div>
          <div class="ai-originality"><strong>Valor editorial indicado pela IA</strong><p>${escapeHtml(latestRevision.originality_note || 'Não informado.')}</p></div>
          ${revisions.length > 1 ? `<details class="ai-version-history"><summary>Ver ${revisions.length - 1} versões anteriores</summary><ol>${revisions.slice(1).map(revision => `<li><span>${revision.revision_kind === 'copydesk' ? 'Copidesque' : `Versão ${revision.id}`}</span><strong>${escapeHtml(revision.title)}</strong><time>${escapeHtml(formatDate(revision.created_at))}</time></li>`).join('')}</ol></details>` : ''}
        </section>

        <section class="card ai-claims-card">
          <div class="ai-section-head"><div><p class="page-kicker">Matriz de evidências</p><h2>${claims.length} afirmações · ${unresolved} pendentes</h2></div><span>${claims.length - unresolved} resolvidas</span></div>
          ${claims.length ? `<div class="ai-claim-list">${claims.map(claim => `
            <article class="ai-claim ai-claim--${claim.status}">
              <header>${statusBadge(claim.status, claimLabels)}<strong>${claim.confidence}%</strong></header>
              <h3>${escapeHtml(claim.claim_text)}</h3>
              <blockquote>${escapeHtml(claim.evidence_text || 'Nenhuma evidência textual localizada.')}</blockquote>
              <p><strong>${escapeHtml(claim.source_label || 'Fonte não identificada')}</strong>${claim.source_locator ? ` · ${escapeHtml(claim.source_locator)}` : ''}${claim.source_url && safeExternalUrl(claim.source_url) ? ` · <a href="${escapeHtml(claim.source_url)}" target="_blank" rel="noopener nofollow">abrir fonte</a>` : ''}</p>
              ${canApprove ? `<form method="post" action="/admin/redacao-ia/pautas/${workspace.id}/afirmacoes/${claim.id}">${renderCsrfInput(csrfToken)}<select class="form-control" name="status">${Object.entries(claimLabels).map(([value, label]) => `<option value="${value}" ${claim.status === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select><input class="form-control" name="note" maxlength="1000" value="${escapeHtml(claim.reviewer_note || '')}" placeholder="Decisão ou evidência do editor"><button class="btn btn-outline btn-compact" type="submit">Registrar revisão</button></form>` : ''}
            </article>
          `).join('')}</div>` : `<div class="ai-empty ai-empty--compact"><p>Gere ou cheque uma versão para criar a matriz de afirmações.</p></div>`}
        </section>` : ''}
      </main>

      <aside class="ai-workspace-sidebar">
        <section class="card ai-decision-card">
          <p class="page-kicker">Próxima etapa</p>
          <h2>Levar ao CMS</h2>
          <p>${workspace.post_id ? 'A versão substituirá os campos editoriais da matéria vinculada, ainda sem publicar.' : 'Será criada uma matéria como rascunho para revisão final no editor.'}</p>
          ${latestRevision ? `<form method="post" action="/admin/redacao-ia/pautas/${workspace.id}/aplicar">
            ${renderCsrfInput(csrfToken)}
            <input type="hidden" name="revision_id" value="${latestRevision.id}">
            <div class="form-group"><label for="apply-category">Editoria</label><select class="form-control" id="apply-category" name="category_id" required>${categories.map(category => `<option value="${category.id}" ${category.id === defaultCategoryId ? 'selected' : ''}>${escapeHtml(category.name)}</option>`).join('')}</select></div>
            <div class="form-group"><label for="apply-author">Autor responsável</label><select class="form-control" id="apply-author" name="author_id" required>${authors.map(author => `<option value="${author.id}" ${author.id === defaultAuthorId ? 'selected' : ''}>${escapeHtml(author.name)}</option>`).join('')}</select></div>
            <button class="btn" type="submit" ${locked ? 'disabled' : ''}>${workspace.post_id ? 'Aplicar na matéria' : 'Criar rascunho no CMS'}</button>
          </form>` : '<div class="ai-readiness-note"><i></i><p>Gere uma primeira versão antes de continuar.</p></div>'}
          <div class="ai-safety-note"><span class="admin-icon">${renderAdminIcon('shield')}</span><p><strong>Barreira de segurança</strong>A matéria permanece como rascunho. A publicação ocorre somente no editor tradicional.</p></div>
        </section>

        <section class="card ai-approval-card">
          <p class="page-kicker">Responsabilidade editorial</p>
          <h2>Aprovação humana</h2>
          <p>${unresolved ? `${unresolved} afirmações ainda exigem uma decisão do editor.` : 'A matriz não possui pendências abertas.'}</p>
          <form method="post" action="/admin/redacao-ia/pautas/${workspace.id}/aprovar">${renderCsrfInput(csrfToken)}<button class="btn btn-secondary" type="submit" ${!canApprove || unresolved || !latestRevision || workspace.status === 'approved' ? 'disabled' : ''}>${workspace.status === 'approved' ? 'Pauta aprovada' : 'Aprovar pauta'}</button></form>
          <small>${canApprove ? 'A aprovação registra seu usuário, data e hora.' : 'Somente editores e diretores podem aprovar.'}</small>
        </section>

        <section class="card ai-run-history">
          <div class="ai-section-head"><div><p class="page-kicker">Auditoria</p><h2>Histórico da IA</h2></div></div>
          ${runs.length ? `<ol>${runs.map(run => `<li><i class="${run.status === 'failed' ? 'is-error' : ''}"></i><div><strong>${escapeHtml(run.action === 'fact_check' ? 'Checagem' : run.action === 'draft' ? 'Rascunho' : run.action === 'rewrite' ? 'Copidesque' : 'Triagem')}</strong><p>${escapeHtml(run.model)} · ${escapeHtml(run.prompt_version)} · ${Number(run.total_tokens || 0).toLocaleString('pt-BR')} tokens${run.error_message ? ` · ${escapeHtml(truncate(run.error_message, 100))}` : ''}</p></div><time>${escapeHtml(formatDate(run.created_at))}</time></li>`).join('')}</ol>` : '<p class="ai-muted">Nenhuma operação executada.</p>'}
        </section>
      </aside>
    </div>
  `
  return c.html(renderAdminLayout({
    title: `Pauta #${workspace.id}`, user, bodyHtml, activeTab: 'redacao-ia', csrfToken
  }))
}

export async function handleEditorialSourceCreate(c: AdminContext): Promise<Response> {
  const user = c.get('adminUser') as AdminUser
  if (!roleCanManageSources(user)) return c.html('<h1>Acesso negado</h1>', 403)
  const body = (c.get('parsedBody') || await c.req.parseBody()) as Record<string, string>
  try {
    const name = String(body.name || '').trim()
    if (name.length < 2 || name.length > 160) throw new Error('Informe um nome de fonte válido.')
    const feedUrl = validateEditorialFeedUrl(String(body.feed_url || '').trim())
    const siteUrl = String(body.site_url || '').trim()
    if (siteUrl) validateEditorialFeedUrl(siteUrl)
    const trustLevel = ['official', 'partner', 'monitored'].includes(String(body.trust_level))
      ? String(body.trust_level) as 'official' | 'partner' | 'monitored'
      : 'monitored'
    const usagePolicy = ['link_only', 'summary', 'licensed'].includes(String(body.usage_policy))
      ? String(body.usage_policy) as EditorialUsagePolicy
      : 'link_only'
    const interval = Number.parseInt(String(body.fetch_interval_minutes || '60'), 10)
    if (!Number.isInteger(interval) || interval < 5 || interval > 10080) throw new Error('Intervalo de atualização inválido.')
    if (body.allow_full_text === '1' && usagePolicy !== 'licensed') {
      throw new Error('Texto integral somente pode ser ativado para uma fonte licenciada.')
    }
    const id = await createEditorialSource(c.env, {
      name,
      feedUrl,
      siteUrl,
      trustLevel,
      usagePolicy,
      attributionLabel: String(body.attribution_label || '').trim(),
      allowFullText: body.allow_full_text === '1',
      allowImages: body.allow_images === '1',
      requiresNoindex: body.requires_noindex === '1',
      fetchIntervalMinutes: interval,
      userId: user.id
    })
    await logAudit(c.env, {
      entityType: 'editorial_ai_source', entityId: id, action: 'create',
      actorType: 'user', actorId: user.id, details: { name, feedUrl, usagePolicy }
    })
    return c.redirect(`/admin/redacao-ia/fontes?message=${encodeURIComponent('Fonte cadastrada. Sincronize para receber as primeiras publicações.')}`, 303)
  } catch (error) {
    const text = error instanceof Error ? error.message : 'Não foi possível cadastrar a fonte.'
    return c.redirect(`/admin/redacao-ia/fontes?error=${encodeURIComponent(text)}`, 303)
  }
}

export async function handleEditorialSourceState(c: AdminContext, sourceId: number): Promise<Response> {
  const user = c.get('adminUser') as AdminUser
  if (!roleCanManageSources(user)) return c.html('<h1>Acesso negado</h1>', 403)
  const body = (c.get('parsedBody') || await c.req.parseBody()) as Record<string, string>
  const active = body.active === '1'
  await setEditorialSourceActive(c.env, sourceId, active)
  await logAudit(c.env, {
    entityType: 'editorial_ai_source', entityId: sourceId, action: active ? 'activate' : 'pause',
    actorType: 'user', actorId: user.id
  })
  return c.redirect(`/admin/redacao-ia/fontes?message=${encodeURIComponent(active ? 'Fonte ativada.' : 'Fonte pausada.')}`, 303)
}

export async function handleEditorialSourceSync(c: AdminContext, sourceId: number): Promise<Response> {
  try {
    const result = await syncEditorialSource(c.env, sourceId)
    const text = result.notModified ? 'A fonte não possui atualizações.' : `${result.imported} novas publicações importadas de ${result.read} lidas.`
    return c.redirect(`/admin/redacao-ia/fontes?message=${encodeURIComponent(text)}`, 303)
  } catch (error) {
    return c.redirect(`/admin/redacao-ia/fontes?error=${encodeURIComponent(error instanceof Error ? error.message : 'Falha na sincronização.')}`, 303)
  }
}

export async function handleEditorialSourcesSync(c: AdminContext): Promise<Response> {
  const result = await syncAllEditorialSources(c.env)
  const text = `${result.imported} novas publicações em ${result.sources} fontes${result.failures.length ? ` · ${result.failures.length} falhas` : ''}.`
  return c.redirect(`/admin/redacao-ia/fontes?${result.failures.length === result.sources && result.sources ? 'error' : 'message'}=${encodeURIComponent(text)}`, 303)
}

export async function handleEditorialFeedItemState(c: AdminContext, itemId: number): Promise<Response> {
  const user = c.get('adminUser') as AdminUser
  if (!roleCanEdit(user)) return c.html('<h1>Acesso negado</h1>', 403)
  const body = (c.get('parsedBody') || await c.req.parseBody()) as Record<string, string>
  const allowed = new Set<EditorialFeedItemStatus>(['new', 'shortlisted', 'discarded'])
  const status = String(body.status || '') as EditorialFeedItemStatus
  if (!allowed.has(status)) return c.redirect('/admin/redacao-ia/radar?error=Estado+inválido.', 303)
  await updateEditorialFeedItemStatus(c.env, itemId, status)
  return c.redirect('/admin/redacao-ia/radar?message=Item+atualizado.', 303)
}

export async function handleEditorialFeedItemWorkspace(c: AdminContext, itemId: number): Promise<Response> {
  const user = c.get('adminUser') as AdminUser
  if (!roleCanEdit(user)) return c.html('<h1>Acesso negado</h1>', 403)
  try {
    const workspaceId = await createWorkspaceFromFeedItem(c.env, itemId, user.id)
    return c.redirect(`/admin/redacao-ia/pautas/${workspaceId}?message=${encodeURIComponent('Pauta aberta. Revise a orientação e acrescente sua apuração.')}`, 303)
  } catch (error) {
    return c.redirect(`/admin/redacao-ia/radar?error=${encodeURIComponent(error instanceof Error ? error.message : 'Não foi possível abrir a pauta.')}`, 303)
  }
}

export async function handleEditorialPostWorkspace(c: AdminContext, postId: number): Promise<Response> {
  const user = c.get('adminUser') as AdminUser
  if (!roleCanEdit(user)) return c.html('<h1>Acesso negado</h1>', 403)
  try {
    const workspaceId = await createWorkspaceForPost(c.env, postId, user.id)
    return c.redirect(`/admin/redacao-ia/pautas/${workspaceId}`, 303)
  } catch (error) {
    return c.redirect(`/admin/posts/${postId}?error=${encodeURIComponent(error instanceof Error ? error.message : 'Não foi possível abrir a Redação IA.')}`, 303)
  }
}

export async function handleEditorialWorkspaceBrief(c: AdminContext, workspaceId: number): Promise<Response> {
  const user = c.get('adminUser') as AdminUser
  if (!roleCanEdit(user)) return c.html('<h1>Acesso negado</h1>', 403)
  const body = (c.get('parsedBody') || await c.req.parseBody()) as Record<string, string>
  try {
    await assertWorkspaceOpen(c, workspaceId)
    const title = String(body.title || '').trim()
    if (!title || title.length > 220) throw new Error('Título de trabalho inválido.')
    const formats = new Set<EditorialDraftFormat>(['note', 'news', 'report', 'explainer', 'rewrite'])
    const editorialFormat = String(body.editorial_format || 'news') as EditorialDraftFormat
    if (!formats.has(editorialFormat)) throw new Error('Formato editorial inválido.')
    const depths = new Set<EditorialDepth>(['brief', 'standard', 'deep'])
    const editorialDepth = String(body.editorial_depth || 'standard') as EditorialDepth
    if (!depths.has(editorialDepth)) throw new Error('Profundidade editorial inválida.')
    const targetWordCount = String(body.target_word_count || '').trim()
      ? Number.parseInt(String(body.target_word_count), 10)
      : null
    if (targetWordCount !== null && (!Number.isInteger(targetWordCount) || targetWordCount < 200 || targetWordCount > 2500)) {
      throw new Error('A extensão desejada deve ficar entre 200 e 2.500 palavras.')
    }
    await updateEditorialWorkspaceBrief(c.env, workspaceId, {
      title,
      brief: String(body.brief || '').slice(0, 10000),
      sensitivity: body.sensitivity === 'sensitive' ? 'sensitive' : 'normal',
      editorialFormat,
      editorialDepth,
      primaryAngle: String(body.primary_angle || '').slice(0, 2000),
      targetAudience: String(body.target_audience || '').slice(0, 1000),
      geographicScope: String(body.geographic_scope || '').slice(0, 1000),
      requiredInformation: String(body.required_information || '').slice(0, 5000),
      keyQuestions: String(body.key_questions || '').slice(0, 5000),
      targetWordCount
    })
    return c.redirect(`/admin/redacao-ia/pautas/${workspaceId}?message=Direção+editorial+salva.`, 303)
  } catch (error) {
    return c.redirect(`/admin/redacao-ia/pautas/${workspaceId}?error=${encodeURIComponent(error instanceof Error ? error.message : 'Não foi possível salvar a orientação.')}`, 303)
  }
}

export async function handleEditorialMaterialCreate(c: AdminContext, workspaceId: number): Promise<Response> {
  const user = c.get('adminUser') as AdminUser
  if (!roleCanEdit(user)) return c.html('<h1>Acesso negado</h1>', 403)
  const body = (c.get('parsedBody') || await c.req.parseBody()) as Record<string, string>
  try {
    await assertWorkspaceOpen(c, workspaceId)
    const label = String(body.label || '').trim()
    if (!label || label.length > 200) throw new Error('Identifique o material.')
    const kinds = new Set<EditorialMaterial['kind']>(['note', 'url', 'document', 'interview', 'official'])
    const kind = String(body.kind || 'note') as EditorialMaterial['kind']
    if (!kinds.has(kind)) throw new Error('Tipo de material inválido.')
    const rightsOptions = new Set<EditorialMaterial['rights_basis']>(['internal', 'link_only', 'quotation', 'licensed', 'public_record'])
    const rightsBasis = String(body.rights_basis || 'internal') as EditorialMaterial['rights_basis']
    if (!rightsOptions.has(rightsBasis)) throw new Error('Base de uso inválida.')
    const sourceUrl = String(body.source_url || '').trim()
    if (sourceUrl) validateEditorialFeedUrl(sourceUrl)
    const contentText = String(body.content_text || '').trim()
    if (!sourceUrl && !contentText) throw new Error('Informe uma URL ou o conteúdo do material.')
    await addEditorialMaterial(c.env, {
      workspaceId, kind, label, sourceUrl, contentText: contentText.slice(0, 50000),
      rightsBasis, confidential: body.confidential === '1', userId: user.id
    })
    return c.redirect(`/admin/redacao-ia/pautas/${workspaceId}?message=Material+adicionado+ao+dossiê.`, 303)
  } catch (error) {
    return c.redirect(`/admin/redacao-ia/pautas/${workspaceId}?error=${encodeURIComponent(error instanceof Error ? error.message : 'Não foi possível adicionar o material.')}`, 303)
  }
}

export async function handleEditorialTriage(c: AdminContext, workspaceId: number): Promise<Response> {
  const user = c.get('adminUser') as AdminUser
  if (!roleCanEdit(user)) return c.html('<h1>Acesso negado</h1>', 403)
  try {
    await assertWorkspaceOpen(c, workspaceId)
    await runEditorialTriage(c.env, workspaceId, user.id)
    return c.redirect(`/admin/redacao-ia/pautas/${workspaceId}?message=Análise+concluída.`, 303)
  } catch (error) {
    return c.redirect(`/admin/redacao-ia/pautas/${workspaceId}?error=${encodeURIComponent(error instanceof Error ? error.message : 'Falha na análise.')}`, 303)
  }
}

export async function handleEditorialDraft(c: AdminContext, workspaceId: number): Promise<Response> {
  const user = c.get('adminUser') as AdminUser
  if (!roleCanEdit(user)) return c.html('<h1>Acesso negado</h1>', 403)
  try {
    await assertWorkspaceOpen(c, workspaceId)
    await runEditorialDraft(c.env, workspaceId, user.id)
    return c.redirect(`/admin/redacao-ia/pautas/${workspaceId}?message=Primeira+versão+gerada.+Revise+cada+informação.`, 303)
  } catch (error) {
    return c.redirect(`/admin/redacao-ia/pautas/${workspaceId}?error=${encodeURIComponent(error instanceof Error ? error.message : 'Falha na geração.')}`, 303)
  }
}

export async function handleEditorialCopydesk(c: AdminContext, workspaceId: number): Promise<Response> {
  const user = c.get('adminUser') as AdminUser
  if (!roleCanEdit(user)) return c.html('<h1>Acesso negado</h1>', 403)
  const body = (c.get('parsedBody') || await c.req.parseBody()) as Record<string, string>
  try {
    await assertWorkspaceOpen(c, workspaceId)
    const revisionId = body.revision_id ? assertPositiveInt(body.revision_id, 'Versão') : undefined
    await runEditorialCopydesk(c.env, workspaceId, user.id, revisionId)
    return c.redirect(`/admin/redacao-ia/pautas/${workspaceId}?message=Copidesque+concluído.+Compare+a+nova+versão+antes+da+checagem.`, 303)
  } catch (error) {
    return c.redirect(`/admin/redacao-ia/pautas/${workspaceId}?error=${encodeURIComponent(error instanceof Error ? error.message : 'Falha no copidesque.')}`, 303)
  }
}

export async function handleEditorialFactCheck(c: AdminContext, workspaceId: number): Promise<Response> {
  const user = c.get('adminUser') as AdminUser
  if (!roleCanEdit(user)) return c.html('<h1>Acesso negado</h1>', 403)
  const body = (c.get('parsedBody') || await c.req.parseBody()) as Record<string, string>
  try {
    await assertWorkspaceOpen(c, workspaceId)
    const revisionId = body.revision_id ? assertPositiveInt(body.revision_id, 'Versão') : undefined
    await runEditorialFactCheck(c.env, workspaceId, user.id, revisionId)
    return c.redirect(`/admin/redacao-ia/pautas/${workspaceId}?message=Checagem+estruturada+concluída.`, 303)
  } catch (error) {
    return c.redirect(`/admin/redacao-ia/pautas/${workspaceId}?error=${encodeURIComponent(error instanceof Error ? error.message : 'Falha na checagem.')}`, 303)
  }
}

export async function handleEditorialClaimReview(c: AdminContext, workspaceId: number, claimId: number): Promise<Response> {
  const user = c.get('adminUser') as AdminUser
  if (!roleCanApprove(user)) return c.html('<h1>Acesso negado</h1>', 403)
  const body = (c.get('parsedBody') || await c.req.parseBody()) as Record<string, string>
  const allowed = new Set<EditorialClaimStatus>(['confirmed', 'divergent', 'unsupported', 'needs_review', 'reviewed'])
  const status = String(body.status || '') as EditorialClaimStatus
  if (!allowed.has(status)) return c.redirect(`/admin/redacao-ia/pautas/${workspaceId}?error=Situação+de+checagem+inválida.`, 303)
  try {
    await assertWorkspaceOpen(c, workspaceId)
    await reviewEditorialClaim(c.env, {
      workspaceId, claimId, status, note: String(body.note || '').slice(0, 1000), userId: user.id
    })
    return c.redirect(`/admin/redacao-ia/pautas/${workspaceId}?message=Decisão+editorial+registrada.`, 303)
  } catch (error) {
    return c.redirect(`/admin/redacao-ia/pautas/${workspaceId}?error=${encodeURIComponent(error instanceof Error ? error.message : 'Não foi possível registrar a decisão.')}`, 303)
  }
}

export async function handleEditorialRevisionApply(c: AdminContext, workspaceId: number): Promise<Response> {
  const user = c.get('adminUser') as AdminUser
  if (!roleCanEdit(user)) return c.html('<h1>Acesso negado</h1>', 403)
  const body = (c.get('parsedBody') || await c.req.parseBody()) as Record<string, string>
  try {
    await assertWorkspaceOpen(c, workspaceId)
    const postId = await applyEditorialRevisionToPost(c.env, {
      workspaceId,
      revisionId: assertPositiveInt(body.revision_id, 'Versão'),
      categoryId: assertPositiveInt(body.category_id, 'Editoria'),
      authorId: assertPositiveInt(body.author_id, 'Autor'),
      userId: user.id
    })
    return c.redirect(`/admin/posts/${postId}?message=${encodeURIComponent('Versão da Redação IA aplicada como rascunho. Faça a revisão final antes de publicar.')}`, 303)
  } catch (error) {
    return c.redirect(`/admin/redacao-ia/pautas/${workspaceId}?error=${encodeURIComponent(error instanceof Error ? error.message : 'Não foi possível levar a versão ao CMS.')}`, 303)
  }
}

export async function handleEditorialWorkspaceApprove(c: AdminContext, workspaceId: number): Promise<Response> {
  const user = c.get('adminUser') as AdminUser
  if (!roleCanApprove(user)) return c.html('<h1>Acesso negado</h1>', 403)
  try {
    await approveEditorialWorkspace(c.env, workspaceId, user.id)
    return c.redirect(`/admin/redacao-ia/pautas/${workspaceId}?message=Pauta+aprovada+com+registro+de+responsabilidade+editorial.`, 303)
  } catch (error) {
    return c.redirect(`/admin/redacao-ia/pautas/${workspaceId}?error=${encodeURIComponent(error instanceof Error ? error.message : 'Não foi possível aprovar.')}`, 303)
  }
}

export async function handleN8nEditorialRssSync(c: AdminContext): Promise<Response> {
  try {
    const result = await syncAllEditorialSources(c.env, { respectInterval: true })
    return c.json({ success: result.failures.length === 0, ...result })
  } catch (error) {
    return c.json({ success: false, error: error instanceof Error ? error.message : 'Falha na sincronização.' }, 500)
  }
}
