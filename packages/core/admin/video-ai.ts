import type { Context } from 'hono'
import type { AppContext, Env } from '../types'
import { getEditorialAiRuntimeConfig } from '../editorial-ai/openai'
import { logAudit } from '../db'
import { normalizeRole } from '../db/users'
import {
  approveVideoProject,
  countVideoWords,
  createVideoAvatar,
  createVideoProjectFromPost,
  estimateVideoSeconds,
  generateVideoProjectScript,
  getLatestVideoVersion,
  getVideoProject,
  getVideoProjectStats,
  getVideoVersion,
  listVideoAiRuns,
  listVideoAvatars,
  listVideoProjects,
  listVideoVersions,
  parseVideoReview,
  parseVideoScript,
  resolveVideoReviewIssue,
  reviewVideoProjectScript,
  setVideoAvatarActive,
  setVideoProjectStatus,
  updateVideoVersionScript
} from '../video-ai'
import type {
  VideoAvatar,
  VideoAvatarRole,
  VideoOrientation,
  VideoProject,
  VideoProjectFormat,
  VideoReviewOutput,
  VideoScriptOutput,
  VideoTone,
  VideoVersion
} from '../video-ai'
import { escapeHtml, renderAdminIcon, renderAdminLayout, renderCsrfInput } from './ui'

type AdminContext = Context<{ Bindings: Env; Variables: AppContext }>

const roleLabels: Record<VideoAvatarRole, string> = { anchor: 'Âncora', reporter: 'Repórter', commentator: 'Comentarista' }
const formatLabels: Record<VideoProjectFormat, string> = { bulletin: 'Boletim rápido', report: 'Reportagem', explainer: 'Explicador', commentary: 'Comentário ou análise' }
const statusLabels: Record<string, string> = { draft: 'Configuração', review: 'Em revisão', approved: 'Aprovado', ready: 'Pronto para produção', archived: 'Arquivado' }
const orientationLabels: Record<VideoOrientation, string> = { vertical: 'Vertical · 9:16', horizontal: 'Horizontal · 16:9', square: 'Quadrado · 1:1' }
const toneLabels: Record<VideoTone, string> = { factual: 'Factual', didactic: 'Didático', urgent: 'Urgente e sóbrio', analytical: 'Analítico', conversational: 'Conversacional' }
const segmentLabels: Record<string, string> = { opening: 'Abertura', transition: 'Transição', report: 'Reportagem', context: 'Contexto', analysis: 'Análise', service: 'Serviço', closing: 'Encerramento' }

interface VideoSourcePost {
  id: number
  title: string
  hat: string | null
  category_name: string | null
  published_at: string | null
  created_at: string
}

function notice(message?: string, error?: string): string {
  if (error) return `<div class="video-ai-notice is-error" role="alert">${escapeHtml(error)}</div>`
  if (message) return `<div class="video-ai-notice" role="status">${escapeHtml(message)}</div>`
  return ''
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function statusBadge(status: string): string {
  return `<span class="video-ai-status is-${escapeHtml(status)}"><i></i>${escapeHtml(statusLabels[status] || status)}</span>`
}

function roleBadge(role: VideoAvatarRole): string {
  return `<span class="video-avatar-role is-${role}">${escapeHtml(roleLabels[role])}</span>`
}

async function listRecentVideoPosts(env: Env, limit = 15): Promise<VideoSourcePost[]> {
  const result = await env.DB.prepare(`
    SELECT p.id, p.title, p.hat, p.published_at, p.created_at, c.name AS category_name
    FROM posts p LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.status = 'published'
    ORDER BY COALESCE(p.published_at, p.created_at) DESC, p.id DESC LIMIT ?
  `).bind(limit).all<VideoSourcePost>()
  return result.results || []
}

function postOption(post: VideoSourcePost): string {
  return `<button type="button" class="video-post-option" role="option" aria-selected="false" data-video-post data-post-id="${post.id}" data-title="${escapeHtml(post.title)}"><span>${escapeHtml(post.hat || post.category_name || 'Matéria')}</span><strong>${escapeHtml(post.title)}</strong><small>${escapeHtml(formatDate(post.published_at || post.created_at))}</small></button>`
}

function avatarOptions(avatars: VideoAvatar[], role: VideoAvatarRole, selectFirst = false): string {
  return avatars.filter(item => item.role === role).map((item, index) => `<option value="${item.id}" ${selectFirst && index === 0 ? 'selected' : ''}>${escapeHtml(item.name)}${item.external_label ? ` · ${escapeHtml(item.external_label)}` : ''}</option>`).join('')
}

function selectedAvatarNames(project: VideoProject): Array<{ role: VideoAvatarRole; name: string }> {
  return [
    project.anchor_name ? { role: 'anchor' as const, name: project.anchor_name } : null,
    project.reporter_name ? { role: 'reporter' as const, name: project.reporter_name } : null,
    project.commentator_name ? { role: 'commentator' as const, name: project.commentator_name } : null
  ].filter(Boolean) as Array<{ role: VideoAvatarRole; name: string }>
}

function avatarNameForRole(project: VideoProject, role: VideoAvatarRole): string {
  return role === 'anchor' ? project.anchor_name || 'Âncora' : role === 'reporter' ? project.reporter_name || 'Repórter' : project.commentator_name || 'Comentarista'
}

function canApprove(role: string): boolean {
  return ['editor', 'director'].includes(normalizeRole(role))
}

export async function renderVideoAiDashboard(c: AdminContext): Promise<Response> {
  const [projects, stats, avatars, config] = await Promise.all([
    listVideoProjects(c.env), getVideoProjectStats(c.env), listVideoAvatars(c.env, true), getEditorialAiRuntimeConfig(c.env)
  ])
  const csrfToken = c.get('csrfToken') || ''
  const bodyHtml = `<div class="page-intro video-ai-heading"><div><p class="page-kicker">Produção audiovisual</p><h1 class="page-title">Estúdio de Vídeo IA</h1><p class="page-description">Transforme matérias em roteiros jornalísticos para âncoras, repórteres e comentaristas, com revisão humana antes da produção.</p></div><div class="video-ai-heading__actions"><a class="btn btn-outline" href="/admin/video-ia/avatares">Avatares da Redação</a><a class="btn" href="/admin/video-ia/novo"><span class="admin-icon">${renderAdminIcon('video')}</span>Novo roteiro</a></div></div>
    ${notice(c.req.query('message'), c.req.query('error'))}
    <section class="video-ai-readiness ${config.enabled && config.apiKeyConfigured ? 'is-ready' : 'is-warning'}"><span class="admin-icon">${renderAdminIcon('ai')}</span><div><strong>${config.enabled && config.apiKeyConfigured ? 'OpenAI pronta para produção' : 'Integração de IA requer atenção'}</strong><p>${config.enabled && config.apiKeyConfigured ? `${escapeHtml(config.model)} · ${avatars.length} avatar(es) ativo(s)` : 'Revise a chave e a ativação da OpenAI em Integrações.'}</p></div><a href="/admin/integrations">Ver integração</a></section>
    <section class="video-ai-stats" aria-label="Resumo do Estúdio"><article><span>Em configuração</span><strong>${stats.draft || 0}</strong></article><article><span>Em revisão</span><strong>${stats.review || 0}</strong></article><article><span>Aprovados</span><strong>${stats.approved || 0}</strong></article><article><span>Prontos</span><strong>${stats.ready || 0}</strong></article></section>
    <section class="card video-ai-list-card"><div class="video-ai-section-head"><div><p class="page-kicker">Produções</p><h2>Roteiros recentes</h2></div><p>${projects.length} projeto(s)</p></div>
      ${projects.length ? `<div class="video-ai-project-list">${projects.map(project => `<a href="/admin/video-ia/${project.id}" class="video-ai-project-row"><div><span>${escapeHtml(formatLabels[project.format])} · ${project.duration_seconds}s</span><strong>${escapeHtml(project.internal_title)}</strong><small>${escapeHtml(project.post_title || 'Matéria indisponível')} · atualizado ${escapeHtml(formatDate(project.updated_at))}</small></div><div class="video-ai-project-row__team">${selectedAvatarNames(project).map(item => roleBadge(item.role)).join('')}</div>${statusBadge(project.status)}<span class="admin-icon">${renderAdminIcon('arrow')}</span></a>`).join('')}</div>` : `<div class="video-ai-empty"><span class="admin-icon">${renderAdminIcon('video')}</span><h3>O primeiro roteiro começa por uma matéria</h3><p>Cadastre os avatares da redação e transforme uma publicação em linguagem audiovisual.</p><a class="btn" href="${avatars.length ? '/admin/video-ia/novo' : '/admin/video-ia/avatares'}">${avatars.length ? 'Criar roteiro' : 'Cadastrar avatares'}</a></div>`}
    </section>
    <form hidden method="post">${renderCsrfInput(csrfToken)}</form>`
  return c.html(renderAdminLayout({ title: 'Estúdio de Vídeo IA', user: c.get('adminUser'), bodyHtml, activeTab: 'video-ia', csrfToken }))
}

export async function renderVideoAvatarPage(c: AdminContext): Promise<Response> {
  const avatars = await listVideoAvatars(c.env)
  const csrfToken = c.get('csrfToken') || ''
  const canManage = normalizeRole(c.get('adminUser').role) === 'director'
  const bodyHtml = `<div class="page-intro video-ai-heading"><div><a class="newsletter-back" href="/admin/video-ia">← Estúdio de Vídeo</a><p class="page-kicker">Equipe virtual</p><h1 class="page-title">Avatares da Redação</h1><p class="page-description">Cadastre os personagens já existentes no HeyGen e atribua uma função jornalística inequívoca.</p></div></div>
    ${notice(c.req.query('message'), c.req.query('error'))}
    <div class="video-avatar-layout ${canManage ? '' : 'is-readonly'}"><section class="card video-avatar-form-card" ${canManage ? '' : 'hidden'}><div class="video-ai-section-head"><div><p class="page-kicker">Novo perfil</p><h2>Cadastrar avatar</h2></div></div><form method="post" action="/admin/video-ia/avatares" class="video-avatar-form">${renderCsrfInput(csrfToken)}
      <div class="form-group"><label for="avatar_name">Nome do avatar</label><input class="form-control" id="avatar_name" name="name" maxlength="120" required placeholder="Ex.: Marina Alves"></div>
      <div class="form-group"><label for="avatar_role">Função jornalística</label><select class="form-control" id="avatar_role" name="role" required><option value="anchor">Âncora</option><option value="reporter">Repórter</option><option value="commentator">Comentarista</option></select></div>
      <div class="form-group"><label for="external_label">Identificação no HeyGen</label><input class="form-control" id="external_label" name="external_label" maxlength="180" placeholder="Nome ou código usado pela equipe"></div>
      <div class="form-group"><label for="speaking_style">Estilo de fala</label><textarea class="form-control" id="speaking_style" name="speaking_style" rows="4" maxlength="1200" placeholder="Ritmo, formalidade, personalidade e construções preferidas"></textarea></div>
      <div class="form-group"><label for="pronunciation_notes">Observações de pronúncia</label><textarea class="form-control" id="pronunciation_notes" name="pronunciation_notes" rows="3" maxlength="1200" placeholder="Nomes, siglas ou limitações conhecidas"></textarea></div>
      <button class="btn" type="submit">Cadastrar avatar</button></form></section>
      <section class="card video-avatar-list-card"><div class="video-ai-section-head"><div><p class="page-kicker">Elenco</p><h2>Perfis cadastrados</h2></div><p>${avatars.length} avatar(es)</p></div>${avatars.length ? `<div class="video-avatar-list">${avatars.map(avatar => `<article class="video-avatar-card ${avatar.is_active ? '' : 'is-inactive'}"><div class="video-avatar-card__identity"><span class="video-avatar-initial">${escapeHtml(avatar.name.charAt(0).toUpperCase())}</span><div>${roleBadge(avatar.role)}<strong>${escapeHtml(avatar.name)}</strong><small>${escapeHtml(avatar.external_label || 'Sem identificação externa')}</small></div></div>${avatar.speaking_style ? `<p>${escapeHtml(avatar.speaking_style)}</p>` : ''}${canManage ? `<form method="post" action="/admin/video-ia/avatares/${avatar.id}/estado">${renderCsrfInput(csrfToken)}<input type="hidden" name="active" value="${avatar.is_active ? '0' : '1'}"><button class="btn btn-outline btn-compact" type="submit">${avatar.is_active ? 'Arquivar' : 'Reativar'}</button></form>` : `<span class="video-avatar-access-note">Somente leitura</span>`}</article>`).join('')}</div>` : '<div class="video-ai-empty"><h3>Nenhum avatar cadastrado</h3><p>Comece pelo âncora ou repórter mais utilizado pela equipe.</p></div>'}</section></div>`
  return c.html(renderAdminLayout({ title: 'Avatares · Vídeo IA', user: c.get('adminUser'), bodyHtml, activeTab: 'video-ia', csrfToken }))
}

export async function handleVideoAvatarCreate(c: AdminContext): Promise<Response> {
  const body = await c.req.parseBody()
  const role = String(body.role || '') as VideoAvatarRole
  const name = String(body.name || '').trim()
  if (!name || name.length > 120) return c.redirect('/admin/video-ia/avatares?error=Informe+um+nome+válido.', 303)
  if (!['anchor', 'reporter', 'commentator'].includes(role)) return c.redirect('/admin/video-ia/avatares?error=Função+jornalística+inválida.', 303)
  const id = await createVideoAvatar(c.env, {
    name, role, externalLabel: String(body.external_label || ''), speakingStyle: String(body.speaking_style || ''),
    pronunciationNotes: String(body.pronunciation_notes || ''), userId: c.get('adminUser').id
  })
  await logAudit(c.env, { entityType: 'video_ai_avatar', entityId: id, action: 'create', actorType: 'user', actorId: c.get('adminUser').id, requestId: c.get('requestId') })
  return c.redirect('/admin/video-ia/avatares?message=Avatar+cadastrado+na+Redação.', 303)
}

export async function handleVideoAvatarState(c: AdminContext, id: number): Promise<Response> {
  const body = await c.req.parseBody()
  const active = String(body.active || '') === '1'
  await setVideoAvatarActive(c.env, id, active)
  await logAudit(c.env, { entityType: 'video_ai_avatar', entityId: id, action: active ? 'activate' : 'archive', actorType: 'user', actorId: c.get('adminUser').id, requestId: c.get('requestId') })
  return c.redirect(`/admin/video-ia/avatares?message=${encodeURIComponent(active ? 'Avatar reativado.' : 'Avatar arquivado.')}`, 303)
}

export async function renderVideoProjectNew(c: AdminContext): Promise<Response> {
  const [avatars, recentPosts] = await Promise.all([listVideoAvatars(c.env, true), listRecentVideoPosts(c.env)])
  let posts = recentPosts
  const requestedPostId = Number(c.req.query('post') || 0)
  let selectedPost = requestedPostId ? posts.find(post => post.id === requestedPostId) : undefined
  if (requestedPostId && !selectedPost) {
    selectedPost = await c.env.DB.prepare(`
      SELECT p.id, p.title, p.hat, p.published_at, p.created_at, c.name AS category_name
      FROM posts p LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.id = ? AND p.status IN ('published', 'review') LIMIT 1
    `).bind(requestedPostId).first<VideoSourcePost>() || undefined
    if (selectedPost) posts = [selectedPost, ...posts]
  }
  const csrfToken = c.get('csrfToken') || ''
  const anchors = avatarOptions(avatars, 'anchor', true); const reporters = avatarOptions(avatars, 'reporter', true); const commentators = avatarOptions(avatars, 'commentator')
  const hasAvatar = avatars.length > 0
  const bodyHtml = `<div class="page-intro video-ai-heading"><div><a class="newsletter-back" href="/admin/video-ia">← Estúdio de Vídeo</a><p class="page-kicker">Novo projeto</p><h1 class="page-title">Transformar matéria em vídeo</h1><p class="page-description">Defina a linguagem, o tempo e a equipe virtual antes de gerar o primeiro roteiro.</p></div></div>
    ${notice(undefined, c.req.query('error'))}
    ${!hasAvatar ? `<div class="video-ai-notice is-error">Cadastre pelo menos um avatar antes de criar um roteiro. <a href="/admin/video-ia/avatares">Ir para Avatares da Redação</a></div>` : ''}
    <form class="video-project-form" method="post" action="/admin/video-ia" data-video-project-form>${renderCsrfInput(csrfToken)}
      <main class="video-project-form__main"><section class="card video-form-section"><div class="video-form-section__head"><span>1</span><div><h2>Matéria de origem</h2><p>O roteiro será fundamentado no conteúdo registrado neste momento.</p></div></div>
        <div class="form-group video-post-picker" data-video-post-picker><label for="video_post_search">Matéria publicada</label><div class="video-post-combobox" ${selectedPost ? 'hidden' : ''}><input class="form-control" id="video_post_search" type="search" role="combobox" aria-expanded="false" aria-controls="video_post_results" autocomplete="off" placeholder="Busque por título, chapéu ou editoria" data-video-post-search><span aria-hidden="true">⌄</span><div class="video-post-dropdown" data-video-post-dropdown hidden><div id="video_post_results" class="video-post-results" role="listbox" data-video-post-results>${posts.map(postOption).join('')}</div><small data-video-post-status>${posts.length} matéria(s) recente(s). Digite para pesquisar todo o acervo.</small></div></div><input type="hidden" name="post_id" value="${selectedPost?.id || ''}" data-video-post-id><div class="video-post-selection" data-video-post-selection ${selectedPost ? '' : 'hidden'}><span><small>Matéria selecionada</small><strong data-video-post-title>${escapeHtml(selectedPost?.title || '')}</strong></span><button type="button" class="btn btn-outline btn-compact" data-video-post-clear>Trocar</button></div><p class="video-field-error" data-video-post-error hidden>Selecione uma matéria.</p></div>
        <div class="form-group"><label for="internal_title">Nome interno do projeto</label><input class="form-control" id="internal_title" name="internal_title" maxlength="180" required value="${selectedPost ? `Vídeo · ${escapeHtml(selectedPost.title)}` : ''}" placeholder="Ex.: Boletim · Reforma tributária"></div></section>
        <section class="card video-form-section"><div class="video-form-section__head"><span>2</span><div><h2>Formato audiovisual</h2><p>O ritmo e a distribuição das falas serão ajustados ao objetivo.</p></div></div><div class="video-form-grid">
          <div class="form-group"><label for="format">Formato</label><select class="form-control" id="format" name="format"><option value="report">Reportagem</option><option value="bulletin">Boletim rápido</option><option value="explainer">Explicador</option><option value="commentary">Comentário ou análise</option></select></div>
          <div class="form-group"><label for="duration_seconds">Duração</label><select class="form-control" id="duration_seconds" name="duration_seconds"><option value="30">30 segundos</option><option value="60">60 segundos</option><option value="90" selected>90 segundos</option><option value="120">2 minutos</option><option value="180">3 minutos</option><option value="300">5 minutos</option></select></div>
          <div class="form-group"><label for="orientation">Orientação</label><select class="form-control" id="orientation" name="orientation">${Object.entries(orientationLabels).map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`).join('')}</select></div>
          <div class="form-group"><label for="tone">Tom</label><select class="form-control" id="tone" name="tone">${Object.entries(toneLabels).map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`).join('')}</select></div>
        </div></section>
        <section class="card video-form-section"><div class="video-form-section__head"><span>3</span><div><h2>Avatares da Redação</h2><p>Escolha somente as funções que participarão desta produção. <a href="/admin/video-ia/avatares">Gerenciar perfis</a></p></div></div><div class="video-avatar-select-grid">
          <label><span class="video-avatar-select__role">Âncora</span><select class="form-control" name="anchor_avatar_id"><option value="">Não participa</option>${anchors}</select><small>Abre, conduz transições e encerra.</small></label>
          <label><span class="video-avatar-select__role">Repórter</span><select class="form-control" name="reporter_avatar_id"><option value="">Não participa</option>${reporters}</select><small>Desenvolve fatos, contexto e serviço.</small></label>
          <label><span class="video-avatar-select__role">Comentarista</span><select class="form-control" name="commentator_avatar_id"><option value="">Não participa</option>${commentators}</select><small>Interpreta consequências com análise identificada.</small></label>
        </div><p class="video-field-error" data-video-avatar-error hidden>Escolha pelo menos um avatar. Comentários exigem um comentarista.</p></section>
        <section class="card video-form-section"><div class="video-form-section__head"><span>4</span><div><h2>Direção editorial</h2><p>Registre o que deve orientar a adaptação audiovisual.</p></div></div>
          <div class="form-group"><label for="target_audience">Público prioritário</label><input class="form-control" id="target_audience" name="target_audience" maxlength="500" value="Leitores e seguidores do Diário do Povo"></div>
          <div class="form-group"><label for="editorial_instructions">Orientações do jornalista</label><textarea class="form-control" id="editorial_instructions" name="editorial_instructions" rows="5" maxlength="5000" placeholder="Enfoque, informações indispensáveis, cuidados e contexto"></textarea></div>
          <div class="form-group"><label for="closing_cta">Chamada final</label><input class="form-control" id="closing_cta" name="closing_cta" maxlength="500" value="Acompanhe a cobertura completa no Diário do Povo."></div>
        </section></main>
      <aside class="video-project-form__aside"><section class="card video-project-summary"><p class="page-kicker">Fluxo editorial</p><h2>Da matéria ao estúdio</h2><ol><li><span>1</span>Configure e crie o projeto</li><li><span>2</span>Gere o roteiro estruturado</li><li><span>3</span>Edite as falas</li><li><span>4</span>Cheque os fatos</li><li><span>5</span>Aprove para produção</li></ol><p>Nada será enviado ao HeyGen. A equipe copiará ou baixará o roteiro aprovado.</p></section><div class="video-project-savebar"><button class="btn" type="submit" ${hasAvatar ? '' : 'disabled'}>Criar projeto</button><a class="btn btn-outline" href="/admin/video-ia">Cancelar</a></div></aside>
    </form><script src="/static/admin-video-ai.js?v=20260822-1" defer></script>`
  return c.html(renderAdminLayout({ title: 'Novo roteiro · Vídeo IA', user: c.get('adminUser'), bodyHtml, activeTab: 'video-ia', csrfToken }))
}

function parseOptionalId(value: unknown): number | null {
  const parsed = Number(value || 0)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export async function handleVideoProjectCreate(c: AdminContext): Promise<Response> {
  try {
    const body = await c.req.parseBody()
    const format = String(body.format || '') as VideoProjectFormat
    const orientation = String(body.orientation || '') as VideoOrientation
    const tone = String(body.tone || '') as VideoTone
    if (!['bulletin', 'report', 'explainer', 'commentary'].includes(format)) throw new Error('Formato de vídeo inválido.')
    if (!['vertical', 'horizontal', 'square'].includes(orientation)) throw new Error('Orientação inválida.')
    if (!['factual', 'didactic', 'urgent', 'analytical', 'conversational'].includes(tone)) throw new Error('Tom editorial inválido.')
    const id = await createVideoProjectFromPost(c.env, {
      postId: Number(body.post_id || 0), internalTitle: String(body.internal_title || '').trim().slice(0, 180),
      format, durationSeconds: Number(body.duration_seconds || 90), orientation, tone,
      targetAudience: String(body.target_audience || ''), editorialInstructions: String(body.editorial_instructions || ''),
      closingCta: String(body.closing_cta || ''), anchorAvatarId: parseOptionalId(body.anchor_avatar_id),
      reporterAvatarId: parseOptionalId(body.reporter_avatar_id), commentatorAvatarId: parseOptionalId(body.commentator_avatar_id)
    }, c.get('adminUser').id)
    await logAudit(c.env, { entityType: 'video_ai_project', entityId: id, action: 'create', actorType: 'user', actorId: c.get('adminUser').id, requestId: c.get('requestId') })
    return c.redirect(`/admin/video-ia/${id}?message=${encodeURIComponent('Projeto criado. Revise a direção antes de gerar o roteiro.')}`, 303)
  } catch (error) {
    return c.redirect(`/admin/video-ia/novo?error=${encodeURIComponent(error instanceof Error ? error.message : 'Não foi possível criar o projeto.')}`, 303)
  }
}

function renderScriptEditor(project: VideoProject, version: VideoVersion, script: VideoScriptOutput, locked: boolean, csrfToken: string): string {
  return `<form method="post" action="/admin/video-ia/${project.id}/roteiro" class="video-script-editor" data-video-script-form>${renderCsrfInput(csrfToken)}<input type="hidden" name="version_id" value="${version.id}"><input type="hidden" name="segment_count" value="${script.segments.length}">
    <div class="video-script-editor__summary"><div><label for="script_title">Título do roteiro</label><input class="form-control" id="script_title" name="script_title" maxlength="220" value="${escapeHtml(script.title)}" ${locked ? 'readonly' : ''}></div><div><label for="script_summary">Resumo de produção</label><textarea class="form-control" id="script_summary" name="script_summary" rows="2" maxlength="1200" ${locked ? 'readonly' : ''}>${escapeHtml(script.summary)}</textarea></div></div>
    <div class="video-script-metrics"><span><strong data-video-word-count>${script.word_count}</strong> palavras</span><span><strong data-video-duration>${script.estimated_duration_seconds}</strong>s estimados</span><span><strong>${script.segments.length}</strong> blocos</span></div>
    <div class="video-segment-list">${script.segments.map((segment, index) => `<article class="video-segment" data-video-segment data-speaker-role="${segment.speaker_role}" data-speaker-name="${escapeHtml(avatarNameForRole(project, segment.speaker_role))}"><header><div><span class="video-segment__number">${String(index + 1).padStart(2, '0')}</span>${roleBadge(segment.speaker_role)}<strong>${escapeHtml(avatarNameForRole(project, segment.speaker_role))}</strong></div><span>${escapeHtml(segmentLabels[segment.segment_type] || segment.segment_type)} · ${segment.estimated_seconds}s</span></header>
      <div class="video-segment__fields"><div class="form-group"><label for="dialogue_${index}">Fala</label><textarea class="form-control video-dialogue" id="dialogue_${index}" name="dialogue_${index}" rows="5" maxlength="4000" data-video-dialogue ${locked ? 'readonly' : ''}>${escapeHtml(segment.dialogue)}</textarea></div><div class="video-segment__meta"><div class="form-group"><label for="speaker_role_${index}">Função</label><select class="form-control" id="speaker_role_${index}" name="speaker_role_${index}" ${locked ? 'disabled' : ''}>${selectedAvatarNames(project).map(item => `<option value="${item.role}" ${item.role === segment.speaker_role ? 'selected' : ''}>${escapeHtml(roleLabels[item.role])} · ${escapeHtml(item.name)}</option>`).join('')}</select></div><div class="form-group"><label for="seconds_${index}">Tempo</label><input class="form-control" id="seconds_${index}" name="seconds_${index}" type="number" min="1" max="180" value="${segment.estimated_seconds}" ${locked ? 'readonly' : ''}></div></div><div class="form-group"><label for="on_screen_${index}">Texto na tela</label><input class="form-control" id="on_screen_${index}" name="on_screen_${index}" maxlength="300" value="${escapeHtml(segment.on_screen_text)}" ${locked ? 'readonly' : ''}></div><div class="form-group"><label for="visual_${index}">Orientação visual</label><input class="form-control" id="visual_${index}" name="visual_${index}" maxlength="800" value="${escapeHtml(segment.visual_cue)}" ${locked ? 'readonly' : ''}></div></div>
    </article>`).join('')}</div>
    <div class="video-script-disclosure"><label for="script_disclosure">Transparência editorial</label><input class="form-control" id="script_disclosure" name="script_disclosure" maxlength="500" value="${escapeHtml(script.disclosure)}" ${locked ? 'readonly' : ''}></div>
    ${locked ? '' : '<button class="btn" type="submit">Salvar edição do roteiro</button>'}</form>`
}

function renderReview(project: VideoProject, version: VideoVersion, review: VideoReviewOutput | null, csrfToken: string): string {
  if (!review) return `<div class="video-review-empty"><span class="admin-icon">${renderAdminIcon('shield')}</span><h3>Checagem ainda não executada</h3><p>Depois de editar o roteiro, compare automaticamente cada afirmação com a matéria-fonte.</p><form method="post" action="/admin/video-ia/${project.id}/checar">${renderCsrfInput(csrfToken)}<input type="hidden" name="version_id" value="${version.id}"><button class="btn btn-outline" type="submit">Checar roteiro</button></form></div>`
  const pending = review.issues.filter(issue => issue.status !== 'confirmed' && issue.human_status !== 'resolved').length
  return `<div class="video-review-summary ${pending ? 'has-pending' : 'is-clear'}"><div><span class="admin-icon">${renderAdminIcon('shield')}</span><div><strong>${pending ? `${pending} alerta(s) pendente(s)` : 'Checagem pronta para aprovação'}</strong><p>${escapeHtml(review.overall_assessment)}</p></div></div><form method="post" action="/admin/video-ia/${project.id}/checar">${renderCsrfInput(csrfToken)}<input type="hidden" name="version_id" value="${version.id}"><button class="btn btn-outline btn-compact" type="submit">Executar novamente</button></form></div>
    ${review.issues.length ? `<div class="video-review-list">${review.issues.map((issue, index) => `<article class="video-review-issue is-${issue.severity} ${issue.human_status === 'resolved' ? 'is-resolved' : ''}"><header><span>${issue.severity === 'blocking' ? 'Bloqueador' : issue.severity === 'warning' ? 'Atenção' : 'Informativo'} · bloco ${issue.segment_sequence || 'geral'}</span><strong>${issue.status === 'confirmed' ? 'Confirmado' : issue.human_status === 'resolved' ? 'Resolvido pelo editor' : 'Revisão necessária'}</strong></header><h4>${escapeHtml(issue.claim)}</h4><p>${escapeHtml(issue.evidence || issue.recommendation)}</p>${issue.status !== 'confirmed' && issue.human_status !== 'resolved' ? `<form method="post" action="/admin/video-ia/${project.id}/questoes/${index}">${renderCsrfInput(csrfToken)}<input type="hidden" name="version_id" value="${version.id}"><input class="form-control" name="note" maxlength="1000" required placeholder="Decisão ou evidência do editor"><button class="btn btn-outline btn-compact" type="submit">Registrar como resolvido</button></form>` : issue.human_note ? `<small>Decisão editorial: ${escapeHtml(issue.human_note)}</small>` : ''}</article>`).join('')}</div>` : '<p class="video-review-clean">A checagem não identificou afirmações problemáticas.</p>'}`
}

export async function renderVideoProjectDetail(c: AdminContext, id: number): Promise<Response> {
  const project = await getVideoProject(c.env, id)
  if (!project) return c.notFound()
  const versions = await listVideoVersions(c.env, id)
  const selectedVersionId = Number(c.req.query('version') || 0)
  const version = selectedVersionId ? await getVideoVersion(c.env, id, selectedVersionId) : versions[0] || null
  const runs = await listVideoAiRuns(c.env, id)
  const config = await getEditorialAiRuntimeConfig(c.env)
  const csrfToken = c.get('csrfToken') || ''
  const user = c.get('adminUser')
  const script = version ? parseVideoScript(version.script_json) : null
  const review = version ? parseVideoReview(version.review_json) : null
  const locked = ['approved', 'ready', 'archived'].includes(project.status)
  const stale = Boolean(project.post_updated_at && project.source_updated_at && project.post_updated_at > project.source_updated_at)
  const pendingIssues = review ? review.issues.filter(issue => issue.status !== 'confirmed' && issue.human_status !== 'resolved').length : 0
  const bodyHtml = `<div class="page-intro video-ai-heading"><div><a class="newsletter-back" href="/admin/video-ia">← Estúdio de Vídeo</a><p class="page-kicker">Projeto #${project.id} · ${escapeHtml(formatLabels[project.format])}</p><h1 class="page-title">${escapeHtml(project.internal_title)}</h1><p class="page-description">Baseado em “${escapeHtml(project.post_title || 'Matéria indisponível')}” · ${project.duration_seconds}s · ${escapeHtml(orientationLabels[project.orientation])}</p></div><div class="video-ai-heading__actions">${statusBadge(project.status)}<a class="btn btn-outline" href="/admin/posts/${project.post_id}">Abrir matéria</a></div></div>
    ${notice(c.req.query('message'), c.req.query('error'))}
    ${stale ? '<div class="video-ai-notice is-warning"><strong>A matéria foi atualizada depois da criação deste projeto.</strong> Gere um novo projeto para incorporar as mudanças com rastreabilidade.</div>' : ''}
    <section class="video-project-overview"><article><span>Equipe virtual</span><div>${selectedAvatarNames(project).map(item => `${roleBadge(item.role)}<strong>${escapeHtml(item.name)}</strong>`).join('')}</div></article><article><span>Direção</span><strong>${escapeHtml(toneLabels[project.tone])}</strong><small>${escapeHtml(project.target_audience || 'Público geral')}</small></article><article><span>Versão ativa</span><strong>${version ? `v${version.version_number}` : 'Ainda não gerada'}</strong><small>${version ? `${version.word_count} palavras · ${version.estimated_seconds}s` : 'Configure e execute a IA'}</small></article></section>
    ${!version ? `<section class="card video-generate-card"><span class="admin-icon">${renderAdminIcon('video')}</span><div><p class="page-kicker">Primeira versão</p><h2>Gerar roteiro audiovisual</h2><p>A IA adaptará a matéria às funções de ${selectedAvatarNames(project).map(item => roleLabels[item.role].toLowerCase()).join(', ')}, preservando os fatos e a duração planejada.</p><small>${config.apiKeyConfigured ? `${escapeHtml(config.model)} · revisão humana obrigatória` : 'Configure OPENAI_API_KEY antes de continuar.'}</small></div><form method="post" action="/admin/video-ia/${project.id}/gerar">${renderCsrfInput(csrfToken)}<button class="btn" type="submit" ${config.enabled && config.apiKeyConfigured ? '' : 'disabled'}>Gerar roteiro</button></form></section>` : `<div class="video-workspace-tabs"><a class="active" href="#roteiro">Roteiro</a><a href="#checagem">Checagem</a><a href="#saida">Saída para produção</a></div>
      <section class="video-workspace-grid"><main><section class="card video-script-card" id="roteiro"><div class="video-ai-section-head"><div><p class="page-kicker">Versão ${version.version_number}</p><h2>Diálogos dos avatares</h2></div><div class="video-version-actions">${versions.length > 1 ? `<select class="form-control" data-video-version-select>${versions.map(item => `<option value="${item.id}" ${item.id === version.id ? 'selected' : ''}>Versão ${item.version_number}${item.is_human_edited ? ' · editada' : ''}</option>`).join('')}</select>` : ''}${!locked ? `<form method="post" action="/admin/video-ia/${project.id}/gerar">${renderCsrfInput(csrfToken)}<button class="btn btn-outline btn-compact" type="submit">Gerar nova versão</button></form>` : ''}</div></div>${renderScriptEditor(project, version, script!, locked, csrfToken)}</section>
        <section class="card video-review-card" id="checagem"><div class="video-ai-section-head"><div><p class="page-kicker">Integridade</p><h2>Checagem editorial</h2></div></div>${renderReview(project, version, review, csrfToken)}</section></main>
        <aside><section class="card video-production-card" id="saida"><p class="page-kicker">HeyGen · fluxo manual</p><h2>Saída para produção</h2><p>Copie o roteiro completo ou somente as falas de cada avatar.</p><div class="video-production-actions"><button class="btn" type="button" data-video-copy="all">Copiar roteiro completo</button>${selectedAvatarNames(project).map(item => `<button class="btn btn-outline" type="button" data-video-copy="${item.role}">Copiar ${escapeHtml(item.name)}</button>`).join('')}<a class="btn btn-outline" href="/admin/video-ia/${project.id}/download?version=${version.id}&format=txt">Baixar TXT</a><a class="btn btn-outline" href="/admin/video-ia/${project.id}/download?version=${version.id}&format=csv">Baixar CSV</a></div><p class="video-copy-status" data-video-copy-status role="status"></p><div class="video-production-state">${project.status === 'ready' ? '<strong>Pronto para produção</strong><p>A versão foi aprovada e marcada para uso pela equipe.</p>' : project.status === 'approved' ? `<strong>Roteiro aprovado</strong><form method="post" action="/admin/video-ia/${project.id}/pronto">${renderCsrfInput(csrfToken)}<button class="btn" type="submit">Marcar pronto para produção</button></form>` : `<strong>Aprovação pendente</strong><p>${!review ? 'Execute a checagem.' : pendingIssues ? `Resolva ${pendingIssues} alerta(s).` : 'Um editor deve autorizar a versão.'}</p>${canApprove(user.role) && review && !pendingIssues ? `<form method="post" action="/admin/video-ia/${project.id}/aprovar">${renderCsrfInput(csrfToken)}<button class="btn btn-secondary" type="submit">Aprovar roteiro</button></form>` : ''}`}</div></section>
          <section class="card video-history-card"><p class="page-kicker">Auditoria</p><h2>Operações de IA</h2>${runs.length ? `<ul>${runs.slice(0, 8).map(run => `<li><span>${run.action === 'generate' ? 'Geração' : 'Checagem'} · ${escapeHtml(run.status)}</span><strong>${escapeHtml(run.model)}</strong><small>${run.total_tokens} tokens · ${formatDate(run.created_at)}</small></li>`).join('')}</ul>` : '<p>Nenhuma operação registrada.</p>'}</section></aside></section>`}
    <script src="/static/admin-video-ai.js?v=20260822-1" defer></script>`
  return c.html(renderAdminLayout({ title: `Vídeo #${project.id}`, user, bodyHtml, activeTab: 'video-ia', csrfToken }))
}

export async function handleVideoGenerate(c: AdminContext, id: number): Promise<Response> {
  try {
    await generateVideoProjectScript(c.env, id, c.get('adminUser').id)
    await logAudit(c.env, { entityType: 'video_ai_project', entityId: id, action: 'generate_script', actorType: 'user', actorId: c.get('adminUser').id, requestId: c.get('requestId') })
    return c.redirect(`/admin/video-ia/${id}?message=${encodeURIComponent('Roteiro gerado. Revise cada fala antes da checagem.')}`, 303)
  } catch (error) {
    return c.redirect(`/admin/video-ia/${id}?error=${encodeURIComponent(error instanceof Error ? error.message : 'Falha na geração do roteiro.')}`, 303)
  }
}

export async function handleVideoScriptSave(c: AdminContext, id: number): Promise<Response> {
  try {
    const project = await getVideoProject(c.env, id)
    if (!project || ['approved', 'ready', 'archived'].includes(project.status)) throw new Error('Este roteiro não pode mais ser alterado.')
    const form = await c.req.formData()
    const versionId = Number(form.get('version_id') || 0)
    const count = Math.max(1, Math.min(60, Number(form.get('segment_count') || 0)))
    const version = await getVideoVersion(c.env, id, versionId)
    if (!version) throw new Error('Versão do roteiro não encontrada.')
    const current = parseVideoScript(version.script_json)
    const allowedRoles = selectedAvatarNames(project).map(item => item.role)
    const segments = current.segments.slice(0, count).map((segment, index) => {
      const role = String(form.get(`speaker_role_${index}`) || segment.speaker_role) as VideoAvatarRole
      if (!allowedRoles.includes(role)) throw new Error(`Função inválida no bloco ${index + 1}.`)
      const dialogue = String(form.get(`dialogue_${index}`) || '').trim()
      if (!dialogue) throw new Error(`A fala do bloco ${index + 1} está vazia.`)
      return {
        ...segment, sequence: index + 1, speaker_role: role, dialogue: dialogue.slice(0, 4000),
        on_screen_text: String(form.get(`on_screen_${index}`) || '').trim().slice(0, 300),
        visual_cue: String(form.get(`visual_${index}`) || '').trim().slice(0, 800),
        estimated_seconds: Math.max(1, Math.min(180, Number(form.get(`seconds_${index}`) || segment.estimated_seconds)))
      }
    })
    const script: VideoScriptOutput = {
      ...current, title: String(form.get('script_title') || current.title).trim().slice(0, 220),
      summary: String(form.get('script_summary') || current.summary).trim().slice(0, 1200),
      disclosure: String(form.get('script_disclosure') || current.disclosure).trim().slice(0, 500), segments
    }
    script.word_count = countVideoWords(script); script.estimated_duration_seconds = estimateVideoSeconds(script.word_count)
    await updateVideoVersionScript(c.env, { projectId: id, versionId, script, userId: c.get('adminUser').id })
    await logAudit(c.env, { entityType: 'video_ai_project', entityId: id, action: 'edit_script', actorType: 'user', actorId: c.get('adminUser').id, requestId: c.get('requestId') })
    return c.redirect(`/admin/video-ia/${id}?version=${versionId}&message=${encodeURIComponent('Roteiro salvo. Execute novamente a checagem.')}`, 303)
  } catch (error) {
    return c.redirect(`/admin/video-ia/${id}?error=${encodeURIComponent(error instanceof Error ? error.message : 'Não foi possível salvar o roteiro.')}`, 303)
  }
}

export async function handleVideoReview(c: AdminContext, id: number): Promise<Response> {
  try {
    const body = await c.req.parseBody()
    const versionId = Number(body.version_id || 0)
    const version = await getVideoVersion(c.env, id, versionId)
    if (!version) throw new Error('Versão do roteiro não encontrada.')
    await reviewVideoProjectScript(c.env, id, version, c.get('adminUser').id)
    await logAudit(c.env, { entityType: 'video_ai_project', entityId: id, action: 'fact_check', actorType: 'user', actorId: c.get('adminUser').id, requestId: c.get('requestId') })
    return c.redirect(`/admin/video-ia/${id}?version=${versionId}&message=${encodeURIComponent('Checagem concluída. Revise os alertas antes da aprovação.')}`, 303)
  } catch (error) {
    return c.redirect(`/admin/video-ia/${id}?error=${encodeURIComponent(error instanceof Error ? error.message : 'Falha na checagem.')}`, 303)
  }
}

export async function handleVideoIssueResolve(c: AdminContext, id: number, issueIndex: number): Promise<Response> {
  try {
    const body = await c.req.parseBody()
    const versionId = Number(body.version_id || 0)
    await resolveVideoReviewIssue(c.env, { projectId: id, versionId, issueIndex, note: String(body.note || ''), userId: c.get('adminUser').id })
    await logAudit(c.env, { entityType: 'video_ai_project', entityId: id, action: 'resolve_review_issue', actorType: 'user', actorId: c.get('adminUser').id, requestId: c.get('requestId') })
    return c.redirect(`/admin/video-ia/${id}?version=${versionId}&message=${encodeURIComponent('Decisão editorial registrada.')}`, 303)
  } catch (error) {
    return c.redirect(`/admin/video-ia/${id}?error=${encodeURIComponent(error instanceof Error ? error.message : 'Não foi possível resolver o alerta.')}`, 303)
  }
}

export async function handleVideoApprove(c: AdminContext, id: number): Promise<Response> {
  try {
    await approveVideoProject(c.env, id, c.get('adminUser').id)
    await logAudit(c.env, { entityType: 'video_ai_project', entityId: id, action: 'approve', actorType: 'user', actorId: c.get('adminUser').id, requestId: c.get('requestId') })
    return c.redirect(`/admin/video-ia/${id}?message=${encodeURIComponent('Roteiro aprovado pela edição.')}`, 303)
  } catch (error) {
    return c.redirect(`/admin/video-ia/${id}?error=${encodeURIComponent(error instanceof Error ? error.message : 'Não foi possível aprovar.')}`, 303)
  }
}

export async function handleVideoReady(c: AdminContext, id: number): Promise<Response> {
  const project = await getVideoProject(c.env, id)
  if (!project || project.status !== 'approved') return c.redirect(`/admin/video-ia/${id}?error=O+roteiro+precisa+estar+aprovado.`, 303)
  await setVideoProjectStatus(c.env, id, 'ready')
  await logAudit(c.env, { entityType: 'video_ai_project', entityId: id, action: 'ready_for_production', actorType: 'user', actorId: c.get('adminUser').id, requestId: c.get('requestId') })
  return c.redirect(`/admin/video-ia/${id}?message=${encodeURIComponent('Roteiro marcado como pronto para produção no HeyGen.')}`, 303)
}

function csvCell(value: string): string { return `"${value.replace(/"/g, '""')}"` }

export async function handleVideoDownload(c: AdminContext, id: number): Promise<Response> {
  const project = await getVideoProject(c.env, id)
  if (!project) return c.notFound()
  const versionId = Number(c.req.query('version') || 0)
  const version = versionId ? await getVideoVersion(c.env, id, versionId) : await getLatestVideoVersion(c.env, id)
  if (!version) return c.text('Roteiro não encontrado.', 404)
  const script = parseVideoScript(version.script_json)
  const format = c.req.query('format') === 'csv' ? 'csv' : 'txt'
  let content: string
  if (format === 'csv') {
    const rows = [['Cena', 'Função', 'Avatar', 'Tipo', 'Fala', 'Texto na tela', 'Orientação visual', 'Segundos']]
    for (const segment of script.segments) rows.push([
      String(segment.sequence), roleLabels[segment.speaker_role], avatarNameForRole(project, segment.speaker_role),
      segmentLabels[segment.segment_type] || segment.segment_type, segment.dialogue, segment.on_screen_text, segment.visual_cue, String(segment.estimated_seconds)
    ])
    content = '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n')
  } else {
    content = [
      project.internal_title, `Versão ${version.version_number} · ${script.estimated_duration_seconds}s`, '',
      ...script.segments.flatMap(segment => [`${roleLabels[segment.speaker_role].toUpperCase()} — ${avatarNameForRole(project, segment.speaker_role)}`, segment.dialogue, segment.on_screen_text ? `[TEXTO NA TELA: ${segment.on_screen_text}]` : '', segment.visual_cue ? `[VISUAL: ${segment.visual_cue}]` : '', '']),
      script.disclosure ? `TRANSPARÊNCIA: ${script.disclosure}` : ''
    ].filter(value => value !== '').join('\r\n')
  }
  return new Response(content, { headers: { 'Content-Type': format === 'csv' ? 'text/csv; charset=utf-8' : 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="roteiro-video-${id}-v${version.version_number}.${format}"`, 'Cache-Control': 'private, no-store' } })
}
