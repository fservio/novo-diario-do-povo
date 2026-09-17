import type { Context } from 'hono'
import type { Env } from '../types'
import {
  createNewsletterCampaign,
  getNewsletterCampaign,
  getNewsletterDailyLimit,
  getNewsletterStats,
  getSmtpConfig,
  listNewsletterCampaigns,
  listNewsletterPosts,
  refreshNewsletterCampaignSnapshot,
  sendNewsletterCampaign,
  sendNewsletterTest,
  addNewsletterTestRecipient,
  updateNewsletterCampaign
} from '../newsletter'
import type { NewsletterCampaign, NewsletterCampaignWithItems, NewsletterPost } from '../newsletter'
import { escapeHtml, renderAdminIcon, renderAdminLayout, renderCsrfInput } from './ui'

function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Fortaleza'
  })
}

function statusBadge(status: string): string {
  const labels: Record<string, string> = {
    draft: 'Rascunho', scheduled: 'Agendada', sending: 'Em envio', sent: 'Concluída'
  }
  const classes: Record<string, string> = {
    draft: 'badge-neutral', scheduled: 'badge-warning', sending: 'badge-warning', sent: 'badge-success'
  }
  return `<span class="badge ${classes[status] || 'badge-neutral'}">${labels[status] || escapeHtml(status)}</span>`
}

function renderNotice(message?: string, error?: string): string {
  if (error) return `<div class="newsletter-notice newsletter-notice--error" role="alert">${escapeHtml(error)}</div>`
  if (message) return `<div class="newsletter-notice newsletter-notice--success" role="status">${escapeHtml(message)}</div>`
  return ''
}

export async function handleNewslettersList(c: Context) {
  const env = c.env as Env
  const user = c.get('adminUser')
  const csrfToken = c.get('csrfToken') || ''
  const campaigns = await listNewsletterCampaigns(env)
  const stats = await getNewsletterStats(env)
  const limit = await getNewsletterDailyLimit(env)
  const smtpReady = Boolean(await getSmtpConfig(env))
  const message = c.req.query('message')
  const error = c.req.query('error')
  const remaining = Math.max(0, limit - stats.sentLast24h)

  const bodyHtml = `
    <div class="page-intro">
      <div>
        <p class="page-kicker">Distribuição editorial</p>
        <h1 class="page-title">Newsletters</h1>
        <p class="page-description">Curadoria, composição e envio das principais notícias do Diário.</p>
      </div>
      <a class="btn" href="/admin/newsletters/new"><span class="admin-icon">${renderAdminIcon('newsletter')}</span> Nova edição</a>
    </div>

    ${renderNotice(message, error)}

    <div class="newsletter-stats">
      <article class="newsletter-stat"><span>Leitores confirmados</span><strong>${stats.confirmed}</strong><small>Somente consentimentos ativos</small></article>
      <article class="newsletter-stat"><span>Disponíveis agora</span><strong>${remaining}</strong><small>Limite operacional de ${limit}/24h</small></article>
      <article class="newsletter-stat"><span>Em preparação</span><strong>${stats.drafts}</strong><small>Rascunhos e envios parciais</small></article>
      <article class="newsletter-stat"><span>Edições concluídas</span><strong>${stats.sent}</strong><small>Histórico preservado</small></article>
    </div>

    <div class="newsletter-dashboard-grid">
      <section class="card newsletter-campaign-list">
        <div class="newsletter-section-head">
          <div><p class="page-kicker">Edições</p><h2>Campanhas recentes</h2></div>
          <span class="newsletter-provider ${smtpReady ? 'is-ready' : ''}"><i></i>${smtpReady ? 'SMTP configurado' : 'SMTP pendente'}</span>
        </div>
        ${campaigns.length ? `
          <div class="newsletter-table-wrap"><table><thead><tr><th>Assunto</th><th>Status</th><th>Entregas</th><th>Criada em</th><th></th></tr></thead><tbody>
            ${campaigns.map((campaign: NewsletterCampaign) => `<tr>
              <td><a class="newsletter-subject-link" href="/admin/newsletters/${campaign.id}">${escapeHtml(campaign.subject)}</a><small>${escapeHtml(campaign.preheader || 'Sem preheader')}</small></td>
              <td>${statusBadge(campaign.status)}</td>
              <td><strong>${campaign.sent_count}</strong>${campaign.recipient_count ? ` / ${campaign.recipient_count}` : ''}${campaign.failed_count ? `<small class="newsletter-failed">${campaign.failed_count} falha(s)</small>` : ''}</td>
              <td>${formatDate(campaign.created_at)}</td>
              <td><a class="btn btn-outline btn-compact" href="/admin/newsletters/${campaign.id}">Abrir</a></td>
            </tr>`).join('')}
          </tbody></table></div>
        ` : `<div class="newsletter-empty"><span class="admin-icon">${renderAdminIcon('newsletter')}</span><h3>Sua primeira edição começa aqui</h3><p>Selecione matérias publicadas e o CMS monta a newsletter automaticamente.</p><a class="btn" href="/admin/newsletters/new">Criar edição</a></div>`}
      </section>

      <aside class="card newsletter-audience-card">
        <p class="page-kicker">Lista de teste</p>
        <h2>Adicionar destinatário</h2>
        <p>Use inicialmente endereços da equipe. Confirme que a pessoa autorizou o recebimento.</p>
        <form method="post" action="/admin/newsletters/audience">
          ${renderCsrfInput(csrfToken)}
          <div class="form-group"><label for="audience-name">Nome</label><input class="form-control" id="audience-name" name="name" maxlength="100" placeholder="Nome do leitor"></div>
          <div class="form-group"><label for="audience-email">E-mail</label><input class="form-control" id="audience-email" name="email" type="email" required placeholder="leitor@exemplo.com"></div>
          <label class="newsletter-consent"><input type="checkbox" name="consent" value="yes" required><span>Confirmo que este destinatário consentiu em receber a newsletter.</span></label>
          <button class="btn btn-secondary" type="submit">Adicionar à lista</button>
        </form>
        <div class="newsletter-setup-note">
          <strong>${smtpReady ? 'Integração pronta para teste' : 'Envio ainda protegido'}</strong>
          <p>${smtpReady ? 'As credenciais estão disponíveis como segredos do ambiente.' : 'Nenhuma mensagem sairá até SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD e SMTP_FROM_EMAIL serem configurados.'}</p>
        </div>
      </aside>
    </div>`

  return c.html(renderAdminLayout({ title: 'Newsletters', user, bodyHtml, activeTab: 'newsletters', csrfToken }))
}

function renderCampaignEditor(params: {
  posts: NewsletterPost[]
  campaign?: NewsletterCampaignWithItems | null
  csrfToken: string
  user: any
  error?: string
}): string {
  const selectedIds = params.campaign?.items.map(item => item.id) || []
  const selectedPositions = new Map(selectedIds.map((id, position) => [id, position]))
  const orderedPosts = [...params.posts].sort((a, b) => {
    const aPosition = selectedPositions.get(a.id)
    const bPosition = selectedPositions.get(b.id)
    if (aPosition !== undefined && bPosition !== undefined) return aPosition - bPosition
    if (aPosition !== undefined) return -1
    if (bPosition !== undefined) return 1
    return 0
  })
  const editing = Boolean(params.campaign)
  const action = editing ? `/admin/newsletters/${params.campaign!.id}/edit` : '/admin/newsletters'

  const bodyHtml = `
    <div class="page-intro newsletter-editor-intro">
      <div>
        <a class="newsletter-back" href="${editing ? `/admin/newsletters/${params.campaign!.id}` : '/admin/newsletters'}">← Voltar</a>
        <p class="page-kicker">Curadoria da redação</p>
        <h1 class="page-title">${editing ? 'Editar edição' : 'Nova edição'}</h1>
        <p class="page-description">A primeira matéria selecionada será a manchete da newsletter.</p>
      </div>
      <div class="newsletter-selection-count"><strong data-selection-count>${selectedIds.length}</strong><span>matérias selecionadas</span></div>
    </div>
    ${renderNotice(undefined, params.error)}
    <form class="newsletter-editor" method="post" action="${action}" data-newsletter-editor>
      ${renderCsrfInput(params.csrfToken)}
      <input type="hidden" name="post_ids" value="${selectedIds.join(',')}" data-post-ids>
      <section class="card newsletter-editor-settings">
        <div class="newsletter-section-head"><div><p class="page-kicker">Identidade da edição</p><h2>Assunto e abertura</h2></div></div>
        <div class="newsletter-field-grid">
          <div class="form-group newsletter-field-full"><label for="subject">Assunto do e-mail</label><input class="form-control" id="subject" name="subject" required maxlength="150" value="${escapeHtml(params.campaign?.subject || '')}" placeholder="As notícias que movimentam esta manhã"><small>Direto, informativo e preferencialmente até 60 caracteres.</small></div>
          <div class="form-group newsletter-field-full"><label for="preheader">Preheader</label><input class="form-control" id="preheader" name="preheader" maxlength="180" value="${escapeHtml(params.campaign?.preheader || '')}" placeholder="Um resumo curto que aparece ao lado do assunto"><small>Complementa o assunto na caixa de entrada.</small></div>
          <div class="form-group newsletter-field-full"><label for="intro_text">Abertura da redação</label><textarea class="form-control" id="intro_text" name="intro_text" maxlength="700" placeholder="Contextualize a seleção de hoje em poucas linhas.">${escapeHtml(params.campaign?.intro_text || '')}</textarea></div>
        </div>
      </section>

      <section class="card newsletter-story-picker">
        <div class="newsletter-section-head newsletter-picker-head">
          <div><p class="page-kicker">Matérias publicadas</p><h2>Monte a hierarquia</h2></div>
          <input class="form-control newsletter-story-search" type="search" placeholder="Filtrar por título ou editoria" data-story-search>
        </div>
        <div class="newsletter-selected-strip" data-selected-strip aria-live="polite"></div>
        <div class="newsletter-story-grid" data-story-grid>
          ${orderedPosts.map(post => {
            const selected = selectedIds.includes(post.id)
            const image = post.cover_media_url ? `/i/${escapeHtml(post.cover_media_url)}?w=320` : ''
            return `<button class="newsletter-story ${selected ? 'is-selected' : ''}" type="button" data-post-id="${post.id}" data-search="${escapeHtml(`${post.title} ${post.category_name || ''}`.toLowerCase())}" data-title="${escapeHtml(post.title)}" aria-pressed="${selected}">
              <span class="newsletter-story-image">${image ? `<img src="${image}" alt="" loading="lazy">` : `<span class="admin-icon">${renderAdminIcon('posts')}</span>`}<i aria-hidden="true">✓</i></span>
              <span class="newsletter-story-copy"><small>${escapeHtml(post.hat || post.category_name || 'Notícia')}</small><strong>${escapeHtml(post.title)}</strong><time>${formatDate(post.published_at || post.created_at)}</time></span>
            </button>`
          }).join('')}
        </div>
      </section>

      <div class="newsletter-editor-actions">
        <a class="btn btn-outline" href="${editing ? `/admin/newsletters/${params.campaign!.id}` : '/admin/newsletters'}">Cancelar</a>
        <button class="btn" type="submit">${editing ? 'Salvar alterações' : 'Gerar edição'} <span class="admin-icon">${renderAdminIcon('arrow')}</span></button>
      </div>
    </form>
    <script src="/static/admin-newsletters.js?v=20260819-1" defer></script>`

  return renderAdminLayout({
    title: editing ? 'Editar newsletter' : 'Nova newsletter',
    user: params.user,
    bodyHtml,
    activeTab: 'newsletters',
    csrfToken: params.csrfToken
  })
}

export async function handleNewsletterNew(c: Context) {
  const posts = await listNewsletterPosts(c.env as Env)
  return c.html(renderCampaignEditor({
    posts,
    csrfToken: c.get('csrfToken') || '',
    user: c.get('adminUser'),
    error: c.req.query('error')
  }))
}

function parseCampaignForm(c: Context): { subject: string; preheader: string; introText: string; postIds: number[] } {
  const body = (c.get('parsedBody') || {}) as Record<string, string>
  const subject = String(body.subject || '').trim()
  const preheader = String(body.preheader || '').trim()
  const introText = String(body.intro_text || '').trim()
  const postIds = String(body.post_ids || '').split(',')
    .map(value => Number.parseInt(value, 10))
    .filter((value, index, values) => Number.isInteger(value) && value > 0 && values.indexOf(value) === index)
  if (!subject || subject.length > 150) throw new Error('Informe um assunto com até 150 caracteres.')
  if (!postIds.length) throw new Error('Selecione pelo menos uma matéria.')
  if (postIds.length > 12) throw new Error('Use no máximo 12 matérias por edição.')
  return { subject, preheader, introText, postIds }
}

export async function handleNewsletterCreate(c: Context) {
  try {
    const input = parseCampaignForm(c)
    const id = await createNewsletterCampaign(c.env as Env, {
      ...input,
      createdByUserId: c.get('adminUser').id
    })
    await refreshNewsletterCampaignSnapshot(c.env as Env, id)
    return c.redirect(`/admin/newsletters/${id}?message=${encodeURIComponent('Edição criada. Revise a prévia antes de enviar o teste.')}`, 303)
  } catch (error) {
    return c.redirect(`/admin/newsletters/new?error=${encodeURIComponent(error instanceof Error ? error.message : 'Não foi possível criar a edição.')}`, 303)
  }
}

export async function handleNewsletterEdit(c: Context) {
  const id = Number.parseInt(c.req.param('id'), 10)
  const [posts, campaign] = await Promise.all([
    listNewsletterPosts(c.env as Env),
    getNewsletterCampaign(c.env as Env, id)
  ])
  if (!campaign) return c.notFound()
  return c.html(renderCampaignEditor({
    posts,
    campaign,
    csrfToken: c.get('csrfToken') || '',
    user: c.get('adminUser'),
    error: c.req.query('error')
  }))
}

export async function handleNewsletterUpdate(c: Context) {
  const id = Number.parseInt(c.req.param('id'), 10)
  try {
    const input = parseCampaignForm(c)
    await updateNewsletterCampaign(c.env as Env, id, input)
    await refreshNewsletterCampaignSnapshot(c.env as Env, id)
    return c.redirect(`/admin/newsletters/${id}?message=${encodeURIComponent('Alterações salvas e prévia atualizada.')}`, 303)
  } catch (error) {
    return c.redirect(`/admin/newsletters/${id}/edit?error=${encodeURIComponent(error instanceof Error ? error.message : 'Não foi possível salvar.')}`, 303)
  }
}

export async function handleNewsletterDetail(c: Context) {
  const env = c.env as Env
  const id = Number.parseInt(c.req.param('id'), 10)
  const campaign = await getNewsletterCampaign(env, id)
  if (!campaign) return c.notFound()
  const stats = await getNewsletterStats(env)
  const limit = await getNewsletterDailyLimit(env)
  const smtpReady = Boolean(await getSmtpConfig(env))
  const csrfToken = c.get('csrfToken') || ''
  const canEdit = campaign.status === 'draft' || campaign.status === 'scheduled'

  const bodyHtml = `
    <div class="page-intro newsletter-detail-intro">
      <div>
        <a class="newsletter-back" href="/admin/newsletters">← Todas as edições</a>
        <p class="page-kicker">Edição #${campaign.id}</p>
        <h1 class="page-title">${escapeHtml(campaign.subject)}</h1>
        <p class="page-description">${escapeHtml(campaign.preheader || 'Sem preheader definido.')}</p>
      </div>
      <div class="newsletter-detail-actions">
        ${canEdit ? `<a class="btn btn-outline" href="/admin/newsletters/${campaign.id}/edit">Editar curadoria</a>` : ''}
        <a class="btn btn-secondary" href="/admin/newsletters/${campaign.id}/preview" target="_blank" rel="noopener">Abrir prévia <span class="admin-icon">${renderAdminIcon('external')}</span></a>
      </div>
    </div>
    ${renderNotice(c.req.query('message'), c.req.query('error'))}

    <div class="newsletter-detail-grid">
      <main>
        <section class="card newsletter-edition-summary">
          <div class="newsletter-section-head"><div><p class="page-kicker">Hierarquia</p><h2>Conteúdo da edição</h2></div>${statusBadge(campaign.status)}</div>
          <div class="newsletter-edition-lead">
            <span>Manchete</span><strong>${escapeHtml(campaign.items[0]?.title || 'Nenhuma matéria selecionada')}</strong>
          </div>
          <ol class="newsletter-edition-items">
            ${campaign.items.slice(1).map(item => `<li><span>${escapeHtml(item.hat || item.category_name || 'Notícia')}</span><strong>${escapeHtml(item.title)}</strong></li>`).join('')}
          </ol>
        </section>

        <section class="card newsletter-preview-card">
          <div><p class="page-kicker">Prévia responsiva</p><h2>E-mail pronto para os leitores</h2><p>O modelo usa HTML próprio para Gmail, Outlook e dispositivos móveis, com alternativa em texto puro.</p></div>
          <div class="newsletter-preview-visual"><span class="newsletter-preview-logo">DIÁRIO <i>DO POVO</i></span><span></span><span></span><strong>${escapeHtml(campaign.items[0]?.title || campaign.subject)}</strong><span></span></div>
          <a class="btn btn-outline" href="/admin/newsletters/${campaign.id}/preview" target="_blank" rel="noopener">Visualizar e-mail completo</a>
        </section>
      </main>

      <aside class="newsletter-send-panel">
        <section class="card">
          <p class="page-kicker">Controle de entrega</p><h2>Revisar e enviar</h2>
          <dl class="newsletter-delivery-metrics">
            <div><dt>Destinatários</dt><dd>${stats.confirmed}</dd></div>
            <div><dt>Enviados nesta edição</dt><dd>${campaign.sent_count}</dd></div>
            <div><dt>Disponíveis em 24h</dt><dd>${Math.max(0, limit - stats.sentLast24h)}</dd></div>
            <div><dt>Falhas registradas</dt><dd>${campaign.failed_count}</dd></div>
          </dl>
          <div class="newsletter-readiness ${smtpReady ? 'is-ready' : ''}"><i></i><div><strong>${smtpReady ? 'SMTP pronto' : 'SMTP não configurado'}</strong><p>${smtpReady ? 'O envio usará TLS na porta 465 e mensagens individuais.' : 'A edição e a prévia funcionam, mas nenhum e-mail será enviado.'}</p></div></div>

          <form class="newsletter-test-form" method="post" action="/admin/newsletters/${campaign.id}/test">
            ${renderCsrfInput(csrfToken)}
            <label for="test-email">Primeiro, envie um teste</label>
            <div><input class="form-control" id="test-email" type="email" name="email" required placeholder="seu@email.com"><button class="btn btn-secondary" type="submit" ${smtpReady ? '' : 'disabled'}>Enviar teste</button></div>
          </form>

          ${campaign.status !== 'sent' ? `<form class="newsletter-final-send" method="post" action="/admin/newsletters/${campaign.id}/send" onsubmit="return confirm('Confirma o envio individual para todos os leitores disponíveis?')">
            ${renderCsrfInput(csrfToken)}
            <button class="btn" type="submit" ${smtpReady && stats.confirmed > 0 ? '' : 'disabled'}>${campaign.status === 'sending' ? 'Continuar envio' : 'Iniciar envio'} <span class="admin-icon">${renderAdminIcon('arrow')}</span></button>
            <p>O sistema respeita o teto operacional de ${limit} mensagens na janela móvel de 24 horas.</p>
          </form>` : `<div class="newsletter-complete"><strong>Envio concluído</strong><p>Esta edição está preservada no histórico e não pode mais ser alterada.</p></div>`}
        </section>
      </aside>
    </div>`

  return c.html(renderAdminLayout({ title: 'Detalhes da newsletter', user: c.get('adminUser'), bodyHtml, activeTab: 'newsletters', csrfToken }))
}

export async function handleNewsletterPreview(c: Context) {
  const id = Number.parseInt(c.req.param('id'), 10)
  const campaign = await getNewsletterCampaign(c.env as Env, id)
  if (!campaign) return c.notFound()
  const html = campaign.content_html || await refreshNewsletterCampaignSnapshot(c.env as Env, id)
  return c.html(html, 200, {
    'Content-Security-Policy': "default-src 'none'; img-src 'self' https: data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
    'Cache-Control': 'no-store'
  })
}

export async function handleNewsletterTest(c: Context) {
  const id = Number.parseInt(c.req.param('id'), 10)
  const body = (c.get('parsedBody') || {}) as Record<string, string>
  const email = String(body.email || '').trim().toLowerCase()
  if (!/^\S+@\S+\.\S+$/.test(email)) return c.redirect(`/admin/newsletters/${id}?error=${encodeURIComponent('Informe um e-mail válido para o teste.')}`, 303)
  try {
    await sendNewsletterTest(c.env as Env, id, email)
    return c.redirect(`/admin/newsletters/${id}?message=${encodeURIComponent(`Teste enviado para ${email}.`)}`, 303)
  } catch (error) {
    return c.redirect(`/admin/newsletters/${id}?error=${encodeURIComponent(error instanceof Error ? error.message : 'Falha no teste.')}`, 303)
  }
}

export async function handleNewsletterSend(c: Context) {
  const id = Number.parseInt(c.req.param('id'), 10)
  try {
    const result = await sendNewsletterCampaign(c.env as Env, id)
    const parts = [`${result.sent} mensagem(ns) enviada(s)`]
    if (result.failed) parts.push(`${result.failed} falha(s)`)
    if (result.remaining) parts.push(`${result.remaining} pendente(s)${result.limited ? ' por limite diário' : ''}`)
    return c.redirect(`/admin/newsletters/${id}?message=${encodeURIComponent(parts.join(' · '))}`, 303)
  } catch (error) {
    return c.redirect(`/admin/newsletters/${id}?error=${encodeURIComponent(error instanceof Error ? error.message : 'Falha no envio.')}`, 303)
  }
}

export async function handleNewsletterAudienceAdd(c: Context) {
  const body = (c.get('parsedBody') || {}) as Record<string, string>
  const email = String(body.email || '').trim().toLowerCase()
  const name = String(body.name || '').trim()
  if (body.consent !== 'yes') return c.redirect(`/admin/newsletters?error=${encodeURIComponent('É necessário confirmar o consentimento do destinatário.')}`, 303)
  if (!/^\S+@\S+\.\S+$/.test(email)) return c.redirect(`/admin/newsletters?error=${encodeURIComponent('Informe um e-mail válido.')}`, 303)
  try {
    await addNewsletterTestRecipient(c.env as Env, email, name)
    return c.redirect(`/admin/newsletters?message=${encodeURIComponent(`${email} foi adicionado à lista confirmada.`)}`, 303)
  } catch (error) {
    return c.redirect(`/admin/newsletters?error=${encodeURIComponent(error instanceof Error ? error.message : 'Não foi possível adicionar o destinatário.')}`, 303)
  }
}
