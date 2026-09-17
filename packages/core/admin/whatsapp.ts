import type { Context } from 'hono'
import type { AppContext, Env } from '../types'
import { normalizeRole } from '../db/users'
import { logAudit } from '../db'
import { escapeHtml, renderAdminIcon, renderAdminLayout, renderCsrfInput } from './ui'
import {
  approveWhatsAppCampaign, createWhatsAppCampaign, createWhatsAppDestination, getWhatsAppCampaign,
  getWhatsAppStats, listWhatsAppCampaigns, listWhatsAppContacts, listWhatsAppDestinations, setWhatsAppDestinationStatus
} from '../whatsapp/repository'
import { getWhatsAppRuntimeConfig, sendWhatsAppCampaign } from '../whatsapp/service'
import { WHATSAPP_TOPICS, type WhatsAppCampaignType, type WhatsAppDestinationType } from '../whatsapp/types'

type AdminContext = Context<{ Bindings: Env; Variables: AppContext }>
const topicLabels: Record<string, string> = { principais: 'Principais', urgentes: 'Urgentes', politica: 'Política', economia: 'Economia', brasil: 'Brasil', mundo: 'Mundo', piaui: 'Piauí', teresina: 'Teresina', esportes: 'Esportes', cultura: 'Cultura', tecnologia: 'Tecnologia' }
const typeLabels: Record<string, string> = { digest: 'Resumo', breaking: 'Plantão', editorial: 'Destaque editorial', subscriber: 'Assinantes', sponsored: 'Patrocinada' }

function notice(c: AdminContext): string {
  const message = c.req.query('message'); const error = c.req.query('error')
  return message ? `<div class="wa-admin-notice">${escapeHtml(message)}</div>` : error ? `<div class="wa-admin-notice is-error">${escapeHtml(error)}</div>` : ''
}

function statusPill(status: string): string {
  const label: Record<string, string> = { draft: 'Rascunho', approved: 'Aprovada', sending: 'Enviando', sent: 'Enviada', failed: 'Falhou', active: 'Ativo', paused: 'Pausado', full: 'Lotado', archived: 'Arquivado', unsubscribed: 'Descadastrado', blocked: 'Bloqueado' }
  return `<span class="wa-admin-status is-${escapeHtml(status)}"><i></i>${escapeHtml(label[status] || status)}</span>`
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  try { return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Fortaleza' }) } catch { return value }
}

function tabs(active: string): string {
  return `<nav class="wa-admin-tabs" aria-label="WhatsApp"><a class="${active === 'overview' ? 'active' : ''}" href="/admin/whatsapp">Visão geral</a><a class="${active === 'campaigns' ? 'active' : ''}" href="/admin/whatsapp/campanhas/nova">Nova campanha</a><a class="${active === 'audience' ? 'active' : ''}" href="/admin/whatsapp/audiencia">Audiência</a><a class="${active === 'destinations' ? 'active' : ''}" href="/admin/whatsapp/destinos">Grupos e canais</a><a href="/whatsapp" target="_blank">Ver landing page ↗</a></nav>`
}

export async function renderWhatsAppDashboard(c: AdminContext): Promise<Response> {
  const [stats, campaigns, config] = await Promise.all([getWhatsAppStats(c.env), listWhatsAppCampaigns(c.env, 30), getWhatsAppRuntimeConfig(c.env)])
  const csrfToken = c.get('csrfToken') || ''
  const body = `<div class="page-intro wa-admin-heading"><div><p class="page-kicker">Audiência e distribuição</p><h1 class="page-title">WhatsApp</h1><p class="page-description">Notícias do Piauí, do Brasil e do mundo em um canal consentido, segmentado e mensurável.</p></div><a class="btn" href="/admin/whatsapp/campanhas/nova">Nova campanha</a></div>${tabs('overview')}${notice(c)}
  <section class="wa-admin-readiness ${config.apiReady && config.enabled ? 'is-ready' : ''}"><span class="admin-icon">${renderAdminIcon('whatsapp')}</span><div><strong>${config.apiReady && config.enabled ? 'Cloud API pronta para envio' : 'Envio ainda protegido'}</strong><p>${config.apiReady ? (config.enabled ? `${escapeHtml(config.businessNumber)} · template ${escapeHtml(config.defaultTemplate)}` : 'Credenciais reconhecidas; habilite a integração para enviar.') : 'Configure número, Phone Number ID e os segredos oficiais antes do envio.'}</p></div><a href="/admin/integrations">Configurar integração</a></section>
  <section class="wa-admin-stats"><article><span>Contatos ativos</span><strong>${stats.active}</strong></article><article><span>Inscrições pendentes</span><strong>${stats.pending}</strong></article><article><span>Grupos e canais</span><strong>${stats.destinations}</strong></article><article><span>Campanhas abertas</span><strong>${stats.campaigns}</strong></article></section>
  <section class="card wa-admin-card"><div class="wa-admin-section-head"><div><p class="page-kicker">Operação editorial</p><h2>Campanhas recentes</h2></div></div>${campaigns.length ? `<div class="wa-campaign-list">${campaigns.map(item => `<a href="/admin/whatsapp/campanhas/${item.id}"><div><span>${escapeHtml(typeLabels[item.campaign_type])}</span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.message_title)} · ${formatDate(item.updated_at)}</small></div>${statusPill(item.status)}<b>${Number(item.read_deliveries || 0)} lidas</b><span class="admin-icon">${renderAdminIcon('arrow')}</span></a>`).join('')}</div>` : '<div class="wa-admin-empty"><h3>Nenhuma campanha criada</h3><p>Comece com um resumo editorial ou destaque de matéria.</p><a class="btn" href="/admin/whatsapp/campanhas/nova">Criar campanha</a></div>'}</section>
  <form hidden>${renderCsrfInput(csrfToken)}</form>`
  return c.html(renderAdminLayout({ title: 'WhatsApp', user: c.get('adminUser')!, bodyHtml: body, activeTab: 'whatsapp', csrfToken }))
}

export async function renderWhatsAppAudience(c: AdminContext): Promise<Response> {
  const contacts = await listWhatsAppContacts(c.env, 300); const csrfToken = c.get('csrfToken') || ''
  const body = `<div class="page-intro"><div><p class="page-kicker">Base consentida</p><h1 class="page-title">Audiência do WhatsApp</h1><p class="page-description">Cada contato conserva origem, preferências e prova de consentimento próprias.</p></div></div>${tabs('audience')}${notice(c)}<section class="card wa-admin-card"><div class="wa-admin-section-head"><div><h2>Contatos</h2><p>${contacts.length} registro(s) recentes</p></div></div>${contacts.length ? `<div class="table-container"><table><thead><tr><th>Contato</th><th>Preferências</th><th>Frequência</th><th>Consentimento</th><th>Estado</th></tr></thead><tbody>${contacts.map(item => `<tr><td><strong>${escapeHtml(item.profile_name || item.phone_e164)}</strong><small>${escapeHtml(item.phone_e164)}</small></td><td>${(() => { try { return (JSON.parse(item.preferences_json) as string[]).map(t => escapeHtml(topicLabels[t] || t)).join(', ') } catch { return 'Principais' } })()}</td><td>${item.frequency === 'twice_daily' ? 'Manhã e noite' : item.frequency === 'breaking' ? 'Plantões' : 'Diário'}</td><td><small>${escapeHtml(item.source)}<br>${formatDate(item.consent_at)}</small></td><td>${statusPill(item.status)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="wa-admin-empty"><h3>A base ainda está vazia</h3><p>Os contatos aparecerão quando enviarem a mensagem de inscrição pelo WhatsApp.</p></div>'}</section>`
  return c.html(renderAdminLayout({ title: 'Audiência · WhatsApp', user: c.get('adminUser')!, bodyHtml: body, activeTab: 'whatsapp', csrfToken }))
}

export async function renderWhatsAppDestinations(c: AdminContext): Promise<Response> {
  const destinations = await listWhatsAppDestinations(c.env); const csrfToken = c.get('csrfToken') || ''
  const canManage = normalizeRole(c.get('adminUser')!.role) === 'director'
  const body = `<div class="page-intro"><div><p class="page-kicker">Diretório editorial</p><h1 class="page-title">Grupos, comunidades e canais</h1><p class="page-description">A criação acontece no WhatsApp; o CMS controla links, disponibilidade, prioridade e mensuração.</p></div></div>${tabs('destinations')}${notice(c)}<div class="wa-destination-admin-grid"><section class="card wa-admin-card" ${canManage ? '' : 'hidden'}><div class="wa-admin-section-head"><div><h2>Novo destino</h2><p>Cadastre um convite oficial.</p></div></div><form method="post" action="/admin/whatsapp/destinos" class="wa-admin-form">${renderCsrfInput(csrfToken)}<div class="form-group"><label>Nome</label><input class="form-control" name="name" maxlength="140" required placeholder="Ex.: Canal Diário do Povo"></div><div class="wa-admin-form-grid"><div class="form-group"><label>Tipo</label><select class="form-control" name="type"><option value="channel">Canal</option><option value="community">Comunidade</option><option value="group">Grupo</option></select></div><div class="form-group"><label>Prioridade</label><input class="form-control" name="priority" type="number" min="1" max="999" value="100"></div></div><div class="form-group"><label>Abrangência</label><input class="form-control" name="scope" maxlength="140" placeholder="Geral, Política, Piauí, Brasil..."></div><div class="form-group"><label>Descrição</label><textarea class="form-control" name="description" rows="3" maxlength="500"></textarea></div><div class="form-group"><label>Link oficial de convite</label><input class="form-control" name="invite_url" type="url" required placeholder="https://whatsapp.com/channel/..."></div><button class="btn" type="submit">Cadastrar destino</button></form></section><section class="card wa-admin-card"><div class="wa-admin-section-head"><div><h2>Destinos cadastrados</h2><p>${destinations.length} registro(s)</p></div></div>${destinations.length ? `<div class="wa-destination-admin-list">${destinations.map(item => `<article><div><span>${escapeHtml(item.type)} · prioridade ${item.priority}</span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.scope || 'Geral')} · ${item.click_count} acessos</small></div>${statusPill(item.status)}${canManage ? `<form method="post" action="/admin/whatsapp/destinos/${item.id}/status">${renderCsrfInput(csrfToken)}<select class="form-control" name="status"><option value="active" ${item.status === 'active' ? 'selected' : ''}>Ativo</option><option value="paused" ${item.status === 'paused' ? 'selected' : ''}>Pausado</option><option value="full" ${item.status === 'full' ? 'selected' : ''}>Lotado</option><option value="archived" ${item.status === 'archived' ? 'selected' : ''}>Arquivado</option></select><button class="btn btn-outline btn-compact">Salvar</button></form>` : ''}</article>`).join('')}</div>` : '<div class="wa-admin-empty"><h3>Nenhum destino</h3><p>Cadastre o Canal do Diário ou os links de comunidades existentes.</p></div>'}</section></div>`
  return c.html(renderAdminLayout({ title: 'Grupos e canais · WhatsApp', user: c.get('adminUser')!, bodyHtml: body, activeTab: 'whatsapp', csrfToken }))
}

export async function handleWhatsAppDestinationCreate(c: AdminContext): Promise<Response> {
  const body = await c.req.parseBody(); const type = String(body.type || '') as WhatsAppDestinationType
  const name = String(body.name || '').trim(); const url = String(body.invite_url || '').trim()
  if (!name || !['group', 'community', 'channel'].includes(type)) return c.redirect('/admin/whatsapp/destinos?error=Preencha+os+dados+do+destino.', 303)
  try { const parsed = new URL(url); if (parsed.protocol !== 'https:' || !/(^|\.)whatsapp\.com$|(^|\.)chat\.whatsapp\.com$/.test(parsed.hostname)) throw new Error() } catch { return c.redirect('/admin/whatsapp/destinos?error=Use+um+link+oficial+do+WhatsApp.', 303) }
  const id = await createWhatsAppDestination(c.env, { name, type, scope: String(body.scope || '').trim(), description: String(body.description || '').trim(), inviteUrl: url, priority: Math.max(1, Math.min(999, Number(body.priority || 100))), userId: c.get('adminUser')!.id })
  await logAudit(c.env, { entityType: 'whatsapp_destination', entityId: id, action: 'create', actorType: 'user', actorId: c.get('adminUser')!.id, requestId: c.get('requestId') })
  return c.redirect('/admin/whatsapp/destinos?message=Destino+cadastrado.', 303)
}

export async function handleWhatsAppDestinationStatus(c: AdminContext, id: number): Promise<Response> {
  const body = await c.req.parseBody(); const status = String(body.status || '')
  if (!['active', 'paused', 'full', 'archived'].includes(status)) return c.redirect('/admin/whatsapp/destinos?error=Estado+inválido.', 303)
  await setWhatsAppDestinationStatus(c.env, id, status)
  return c.redirect('/admin/whatsapp/destinos?message=Estado+atualizado.', 303)
}

async function recentPosts(env: Env): Promise<any[]> {
  const result = await env.DB.prepare(`SELECT p.id, p.title, p.excerpt, p.slug, p.published_at, c.slug category_slug, c.name category_name FROM posts p LEFT JOIN categories c ON c.id = p.category_id WHERE p.status = 'published' ORDER BY COALESCE(p.published_at,p.created_at) DESC LIMIT 100`).all<any>()
  return result.results || []
}

export async function renderWhatsAppCampaignNew(c: AdminContext): Promise<Response> {
  const [posts, config] = await Promise.all([recentPosts(c.env), getWhatsAppRuntimeConfig(c.env)]); const csrfToken = c.get('csrfToken') || ''
  const baseUrl = String(c.env.PUBLIC_BASE_URL || '').replace(/\/$/, '')
  const body = `<div class="page-intro"><div><p class="page-kicker">Nova distribuição</p><h1 class="page-title">Criar campanha de WhatsApp</h1><p class="page-description">Selecione uma matéria, revise a chamada e defina quem deve recebê-la.</p></div></div>${tabs('campaigns')}${notice(c)}<form method="post" action="/admin/whatsapp/campanhas" class="wa-campaign-form" data-wa-campaign-form>${renderCsrfInput(csrfToken)}<main><section class="card wa-admin-card"><div class="wa-admin-section-head"><div><span>1</span><h2>Matéria e chamada</h2></div></div><div class="form-group"><label>Matéria publicada</label><select class="form-control" name="post_id" data-wa-post><option value="">Campanha sem matéria vinculada</option>${posts.map(post => `<option value="${post.id}" data-title="${escapeHtml(post.title)}" data-body="${escapeHtml(post.excerpt || '')}" data-url="${escapeHtml(`${baseUrl}/categoria/${post.category_slug || 'noticias'}/${post.slug}`)}">${escapeHtml(post.title)} · ${escapeHtml(post.category_name || '')}</option>`).join('')}</select></div><div class="form-group"><label>Nome interno</label><input class="form-control" name="title" maxlength="180" required placeholder="Ex.: Plantão · decisão do STF"></div><div class="form-group"><label>Título da mensagem</label><input class="form-control" name="message_title" maxlength="220" required data-wa-title></div><div class="form-group"><label>Resumo</label><textarea class="form-control" name="message_body" rows="5" maxlength="900" required data-wa-body></textarea></div><div class="form-group"><label>Link</label><input class="form-control" name="target_url" type="url" maxlength="1000" required data-wa-url></div></section><section class="card wa-admin-card"><div class="wa-admin-section-head"><div><span>2</span><h2>Segmentação</h2></div></div><div class="wa-admin-form-grid"><div class="form-group"><label>Tipo</label><select class="form-control" name="campaign_type">${Object.entries(typeLabels).map(([value,label]) => `<option value="${value}">${label}</option>`).join('')}</select></div><div class="form-group"><label>Template aprovado</label><input class="form-control" name="template_name" value="${escapeHtml(config.defaultTemplate)}" maxlength="180" required></div></div><div class="form-group"><label>Idioma do template</label><input class="form-control" name="template_language" value="pt_BR" maxlength="20" required></div><fieldset class="wa-segment-topics"><legend>Enviar para interesses</legend>${WHATSAPP_TOPICS.map(topic => `<label><input type="checkbox" name="topics" value="${topic}" ${topic === 'principais' ? 'checked' : ''}><span>${escapeHtml(topicLabels[topic])}</span></label>`).join('')}</fieldset></section></main><aside><section class="card wa-message-preview"><p class="page-kicker">Prévia</p><div><strong data-wa-preview-title>Título da notícia</strong><p data-wa-preview-body>O resumo editorial aparecerá aqui.</p><span data-wa-preview-url>diario.dopovo.com.br</span></div><small>O conteúdo final depende do template aprovado na Meta.</small></section><button class="btn" type="submit">Salvar rascunho</button><a class="btn btn-outline" href="/admin/whatsapp">Cancelar</a></aside></form><script src="/static/admin-whatsapp.js?v=20260822-1" defer></script>`
  return c.html(renderAdminLayout({ title: 'Nova campanha · WhatsApp', user: c.get('adminUser')!, bodyHtml: body, activeTab: 'whatsapp', csrfToken }))
}

export async function handleWhatsAppCampaignCreate(c: AdminContext): Promise<Response> {
  const form = await c.req.formData(); const type = String(form.get('campaign_type') || '') as WhatsAppCampaignType
  if (!Object.keys(typeLabels).includes(type)) return c.redirect('/admin/whatsapp/campanhas/nova?error=Tipo+inválido.', 303)
  const title = String(form.get('title') || '').trim(); const messageTitle = String(form.get('message_title') || '').trim(); const messageBody = String(form.get('message_body') || '').trim(); const targetUrl = String(form.get('target_url') || '').trim()
  if (!title || !messageTitle || !messageBody) return c.redirect('/admin/whatsapp/campanhas/nova?error=Preencha+a+chamada+completa.', 303)
  try { const url = new URL(targetUrl); if (!['https:', 'http:'].includes(url.protocol)) throw new Error() } catch { return c.redirect('/admin/whatsapp/campanhas/nova?error=Informe+um+link+válido.', 303) }
  const id = await createWhatsAppCampaign(c.env, { title: title.slice(0, 180), type, topics: form.getAll('topics').map(String).filter(t => WHATSAPP_TOPICS.includes(t as any)), messageTitle: messageTitle.slice(0, 220), messageBody: messageBody.slice(0, 900), targetUrl: targetUrl.slice(0, 1000), templateName: String(form.get('template_name') || '').trim(), language: String(form.get('template_language') || 'pt_BR').trim(), postId: Number(form.get('post_id') || 0) || null, userId: c.get('adminUser')!.id })
  await logAudit(c.env, { entityType: 'whatsapp_campaign', entityId: id, action: 'create', actorType: 'user', actorId: c.get('adminUser')!.id, requestId: c.get('requestId') })
  return c.redirect(`/admin/whatsapp/campanhas/${id}?message=${encodeURIComponent('Campanha salva como rascunho.')}`, 303)
}

export async function renderWhatsAppCampaignDetail(c: AdminContext, id: number): Promise<Response> {
  const [campaign, config] = await Promise.all([getWhatsAppCampaign(c.env, id), getWhatsAppRuntimeConfig(c.env)]); if (!campaign) return c.notFound()
  const csrfToken = c.get('csrfToken') || ''; const canApprove = ['editor','director'].includes(normalizeRole(c.get('adminUser')!.role)); const canSend = normalizeRole(c.get('adminUser')!.role) === 'director'
  const topics = (() => { try { return JSON.parse(campaign.segment_json).topics || [] } catch { return [] } })()
  const body = `<div class="page-intro wa-admin-heading"><div><a class="newsletter-back" href="/admin/whatsapp">← WhatsApp</a><p class="page-kicker">${escapeHtml(typeLabels[campaign.campaign_type])} · campanha #${campaign.id}</p><h1 class="page-title">${escapeHtml(campaign.title)}</h1><p class="page-description">Criada por ${escapeHtml(campaign.created_by_name || 'Redação')} · ${formatDate(campaign.created_at)}</p></div>${statusPill(campaign.status)}</div>${tabs('overview')}${notice(c)}<section class="wa-campaign-detail"><main><section class="card wa-admin-card"><div class="wa-admin-section-head"><div><h2>Mensagem</h2><p>Template ${escapeHtml(campaign.template_name || config.defaultTemplate)} · ${escapeHtml(campaign.template_language)}</p></div></div><article class="wa-detail-message"><strong>${escapeHtml(campaign.message_title)}</strong><p>${escapeHtml(campaign.message_body)}</p><a href="${escapeHtml(campaign.target_url)}" target="_blank" rel="noopener">${escapeHtml(campaign.target_url)}</a></article></section><section class="card wa-admin-card"><div class="wa-admin-section-head"><div><h2>Segmento</h2><p>${topics.map((t:string) => escapeHtml(topicLabels[t] || t)).join(', ') || 'Toda a base ativa'}</p></div></div><div class="wa-delivery-stats"><div><strong>${Number(campaign.total_deliveries || 0)}</strong><span>processadas</span></div><div><strong>${Number(campaign.sent_deliveries || 0)}</strong><span>enviadas</span></div><div><strong>${Number(campaign.read_deliveries || 0)}</strong><span>lidas</span></div><div><strong>${Number(campaign.failed_deliveries || 0)}</strong><span>falhas</span></div></div></section></main><aside><section class="card wa-admin-card"><p class="page-kicker">Governança</p>${campaign.status === 'draft' ? `<strong>Revisão editorial pendente</strong><p>Confira mensagem, link, público e template antes de aprovar.</p>${canApprove ? `<form method="post" action="/admin/whatsapp/campanhas/${id}/aprovar">${renderCsrfInput(csrfToken)}<button class="btn" type="submit">Aprovar campanha</button></form>` : ''}` : campaign.status === 'approved' ? `<strong>Pronta para envio</strong><p>${config.apiReady && config.enabled ? 'A integração está pronta. O envio respeitará preferências e limite de frequência.' : 'O envio permanece bloqueado até a Cloud API ser configurada e habilitada.'}</p>${canSend ? `<form method="post" action="/admin/whatsapp/campanhas/${id}/enviar">${renderCsrfInput(csrfToken)}<button class="btn" type="submit" ${config.apiReady && config.enabled ? '' : 'disabled'}>Enviar campanha</button></form>` : ''}` : `<strong>Operação concluída</strong><p>Consulte os indicadores de entrega e leitura.</p>`}</section></aside></section>`
  return c.html(renderAdminLayout({ title: `Campanha #${id} · WhatsApp`, user: c.get('adminUser')!, bodyHtml: body, activeTab: 'whatsapp', csrfToken }))
}

export async function handleWhatsAppCampaignApprove(c: AdminContext, id: number): Promise<Response> {
  await approveWhatsAppCampaign(c.env, id, c.get('adminUser')!.id)
  await logAudit(c.env, { entityType: 'whatsapp_campaign', entityId: id, action: 'approve', actorType: 'user', actorId: c.get('adminUser')!.id, requestId: c.get('requestId') })
  return c.redirect(`/admin/whatsapp/campanhas/${id}?message=Campanha+aprovada.`, 303)
}

export async function handleWhatsAppCampaignSend(c: AdminContext, id: number): Promise<Response> {
  try { const result = await sendWhatsAppCampaign(c.env, id); return c.redirect(`/admin/whatsapp/campanhas/${id}?message=${encodeURIComponent(`${result.sent} enviada(s); ${result.failed} falha(s).`)}`, 303) }
  catch (error) { return c.redirect(`/admin/whatsapp/campanhas/${id}?error=${encodeURIComponent(error instanceof Error ? error.message : 'Falha no envio.')}`, 303) }
}
