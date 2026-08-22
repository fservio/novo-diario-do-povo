import type { Context } from 'hono'
import type { Env } from '../types'
import type { NewsletterPost } from '../newsletter'
import { getPostUrl } from '../utils/post'
import {
  createEngagementCampaign,
  duplicateEngagementCampaign,
  getEngagementCampaign,
  getEngagementStats,
  listEngagementCampaigns,
  parseEngagementCampaignInput,
  parsePathRules,
  setEngagementCampaignStatus,
  updateEngagementCampaign
} from '../engagement'
import type { EngagementCampaign, EngagementCampaignInput } from '../engagement'
import { escapeHtml, renderAdminIcon, renderAdminLayout, renderCsrfInput } from './ui'

const typeLabels: Record<string, string> = {
  newsletter: 'Newsletter', editorial: 'Destaque editorial', instagram: 'Instagram', advertising: 'Publicidade'
}
const statusLabels: Record<string, string> = {
  draft: 'Rascunho', scheduled: 'Agendada', active: 'Ativa', paused: 'Pausada', archived: 'Arquivada'
}
const formatLabels: Record<string, string> = { banner: 'Faixa inferior', slide_in: 'Card lateral', modal: 'Modal central' }

function dateTimeLocal(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).reduce<Record<string, string>>((acc, part) => { acc[part.type] = part.value; return acc }, {})
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

async function validateCampaignRelations(env: Env, input: EngagementCampaignInput): Promise<void> {
  if (input.campaignType === 'editorial') {
    const post = await env.DB.prepare("SELECT id FROM posts WHERE id = ? AND status = 'published' LIMIT 1").bind(input.postId).first<{ id: number }>()
    if (!post) throw new Error('Selecione uma matéria publicada válida.')
  }
  if (input.imageMediaId) {
    const media = await env.DB.prepare("SELECT id FROM media WHERE id = ? AND deleted_at IS NULL AND mime_type LIKE 'image/%' LIMIT 1").bind(input.imageMediaId).first<{ id: number }>()
    if (!media) throw new Error('A imagem selecionada não está mais disponível na biblioteca.')
  }
}

function statusBadge(status: string): string {
  const css = status === 'active' ? 'is-active' : status === 'scheduled' ? 'is-scheduled' : status === 'paused' ? 'is-paused' : status === 'archived' ? 'is-archived' : 'is-draft'
  return `<span class="engagement-status ${css}"><i></i>${escapeHtml(statusLabels[status] || status)}</span>`
}

function notice(message?: string, error?: string): string {
  if (error) return `<div class="engagement-notice is-error" role="alert">${escapeHtml(error)}</div>`
  if (message) return `<div class="engagement-notice" role="status">${escapeHtml(message)}</div>`
  return ''
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Sem limite'
  return new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

async function searchPublishedPosts(env: Env, query = '', limit = 15): Promise<NewsletterPost[]> {
  const normalizedQuery = query.trim().slice(0, 120)
  const safeLimit = Math.max(1, Math.min(30, Math.trunc(limit) || 15))
  const likeQuery = `%${normalizedQuery}%`
  const result = await env.DB.prepare(`
    SELECT
      p.id, p.slug, p.title, p.hat, p.excerpt, p.published_at, p.created_at, p.cover_media_id,
      c.name AS category_name,
      m.r2_key AS cover_media_url,
      0 AS position
    FROM posts p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN media m ON m.id = p.cover_media_id
    WHERE p.status = 'published'
      AND (? = '' OR p.title LIKE ? OR COALESCE(p.hat, '') LIKE ? OR COALESCE(c.name, '') LIKE ?)
    ORDER BY COALESCE(p.published_at, p.created_at) DESC, p.id DESC
    LIMIT ?
  `).bind(normalizedQuery, likeQuery, likeQuery, likeQuery, safeLimit).all<NewsletterPost>()
  return result.results || []
}

async function getPublishedPost(env: Env, id: number): Promise<NewsletterPost | null> {
  return env.DB.prepare(`
    SELECT
      p.id, p.slug, p.title, p.hat, p.excerpt, p.published_at, p.created_at, p.cover_media_id,
      c.name AS category_name,
      m.r2_key AS cover_media_url,
      0 AS position
    FROM posts p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN media m ON m.id = p.cover_media_id
    WHERE p.id = ? AND p.status = 'published'
    LIMIT 1
  `).bind(id).first<NewsletterPost>()
}

function postOptionMarkup(post: NewsletterPost, selected = false): string {
  const imageUrl = post.cover_media_url ? `/i/${escapeHtml(post.cover_media_url)}?w=900` : ''
  return `<button class="engagement-post-option${selected ? ' is-selected' : ''}" type="button" role="option" data-post-option data-post-id="${post.id}" aria-selected="${selected ? 'true' : 'false'}"
    data-title="${escapeHtml(post.title)}" data-body="${escapeHtml(post.excerpt || '')}"
    data-eyebrow="${escapeHtml(post.hat || post.category_name || 'Destaque')}" data-url="${escapeHtml(getPostUrl(post))}"
    data-image-url="${imageUrl}" data-image-id="${post.cover_media_id || ''}"><span>${escapeHtml(post.hat || post.category_name || 'Matéria')}</span><strong>${escapeHtml(post.title)}</strong><small>${escapeHtml(formatDate(post.published_at || post.created_at))}</small></button>`
}

function previewMarkup(campaign: Partial<EngagementCampaign> & { campaign_type: string; display_format: string; title: string }): string {
  const image = campaign.image_r2_key ? `/i/${escapeHtml(campaign.image_r2_key)}?w=700` : ''
  const positionX = Math.max(0, Math.min(100, Number(campaign.image_position_x ?? 50)))
  const positionY = Math.max(0, Math.min(100, Number(campaign.image_position_y ?? 50)))
  return `<div class="engagement-admin-preview is-${escapeHtml(campaign.display_format)}" data-engagement-preview>
    <div class="engagement-admin-preview__viewport">
      <div class="engagement-admin-preview__page"><span></span><span></span><span></span><span></span></div>
      <article class="engagement-admin-preview__campaign is-${escapeHtml(campaign.campaign_type)}">
        <button type="button" aria-label="Fechar prévia">×</button>
        ${image ? `<img src="${image}" alt="" data-preview-image style="object-position:${positionX}% ${positionY}%">` : '<div class="engagement-admin-preview__image" data-preview-image></div>'}
        <div><div class="engagement-admin-preview__brand"><img src="/static/logo-dp.png" alt=""><span data-preview-sponsored ${campaign.campaign_type === 'advertising' ? '' : 'hidden'}>Publicidade</span></div><small data-preview-eyebrow>${escapeHtml(campaign.eyebrow || (campaign.campaign_type === 'advertising' ? 'Publicidade' : 'Diário do Povo'))}</small>
          <strong data-preview-title>${escapeHtml(campaign.title)}</strong>
          <p data-preview-body>${escapeHtml(campaign.body || '')}</p>
          <div data-preview-action>${campaign.campaign_type === 'newsletter' ? '<span class="engagement-admin-preview__email">seu@email.com</span><span class="engagement-admin-preview__cta">Quero receber</span><span class="engagement-admin-preview__consent">□ Aceito a Política de Privacidade</span>' : `<span class="engagement-admin-preview__cta">${escapeHtml(campaign.cta_label || 'Saiba mais')}</span>`}</div>
          <p class="engagement-admin-preview__advertiser" data-preview-advertiser ${campaign.campaign_type === 'advertising' && campaign.advertiser_name ? '' : 'hidden'}>${campaign.advertiser_name ? `Conteúdo de ${escapeHtml(campaign.advertiser_name)}` : ''}</p>
        </div>
      </article>
    </div>
  </div>`
}

export async function handleEngagementList(c: Context) {
  const env = c.env as Env
  const [campaigns, stats] = await Promise.all([listEngagementCampaigns(env), getEngagementStats(env)])
  const csrfToken = c.get('csrfToken') || ''
  const bodyHtml = `
    <div class="page-intro engagement-heading"><div><p class="page-kicker">Audiência e distribuição</p><h1 class="page-title">Campanhas de engajamento</h1><p class="page-description">Chamadas editoriais e comerciais com frequência responsável para preservar a experiência do leitor.</p></div>
      <a class="btn" href="/admin/engagement/new"><span class="admin-icon">${renderAdminIcon('engagement')}</span> Nova campanha</a></div>
    ${notice(c.req.query('message'), c.req.query('error'))}
    <section class="engagement-stats" aria-label="Resumo das campanhas">
      <article><span>Ativas</span><strong>${stats.active}</strong><small>${stats.scheduled} agendada(s)</small></article>
      <article><span>Impressões</span><strong>${stats.impressions}</strong><small>exibições contabilizadas</small></article>
      <article><span>Cliques</span><strong>${stats.clicks}</strong><small>${stats.impressions ? ((stats.clicks / stats.impressions) * 100).toFixed(1) : '0,0'}% de CTR</small></article>
      <article><span>Conversões</span><strong>${stats.conversions}</strong><small>inscrições e objetivos</small></article>
    </section>
    <section class="card engagement-list-card">
      <div class="engagement-section-head"><div><p class="page-kicker">Portfólio</p><h2>Campanhas</h2></div><p>${stats.drafts} rascunho(s)</p></div>
      ${campaigns.length ? `<div class="engagement-table-wrap"><table><thead><tr><th>Campanha</th><th>Formato</th><th>Status</th><th>Resultados</th><th>Período</th><th></th></tr></thead><tbody>
        ${campaigns.map(campaign => {
          const impressions = Number(campaign.impressions || 0); const clicks = Number(campaign.clicks || 0); const conversions = Number(campaign.conversions || 0)
          return `<tr><td><a class="engagement-campaign-name" href="/admin/engagement/${campaign.id}">${escapeHtml(campaign.internal_name)}</a><small>${escapeHtml(typeLabels[campaign.campaign_type])} · prioridade ${campaign.priority}</small></td>
            <td>${escapeHtml(formatLabels[campaign.display_format])}</td><td>${statusBadge(campaign.status)}</td>
            <td><strong>${impressions}</strong> imp. <small>${clicks} clique(s) · ${conversions} conversão(ões)</small></td>
            <td><span>${formatDate(campaign.starts_at)}</span><small>até ${formatDate(campaign.ends_at)}</small></td>
            <td><a class="btn btn-outline btn-compact" href="/admin/engagement/${campaign.id}">Abrir</a></td></tr>`
        }).join('')}
      </tbody></table></div>` : `<div class="engagement-empty"><span class="admin-icon">${renderAdminIcon('engagement')}</span><h3>Crie sua primeira campanha</h3><p>Comece pela captação de leitores para a newsletter ou por uma chamada editorial.</p><a class="btn" href="/admin/engagement/new">Criar campanha</a></div>`}
    </section>`
  return c.html(renderAdminLayout({ title: 'Campanhas de engajamento', user: c.get('adminUser'), bodyHtml, activeTab: 'engagement', csrfToken }))
}

async function renderCampaignForm(c: Context, campaign?: EngagementCampaign, error?: string): Promise<Response> {
  const env = c.env as Env
  let posts = await searchPublishedPosts(env)
  const csrfToken = c.get('csrfToken') || ''
  const current = campaign || {
    campaign_type: 'newsletter', display_format: 'slide_in', internal_name: '', eyebrow: 'Newsletter do Diário',
    title: 'Informação de confiança, direto no seu e-mail.', body: 'Receba uma seleção das notícias mais importantes do dia.',
    cta_label: 'Quero receber', cta_url: '', image_media_id: null, post_id: null, advertiser_name: '',
    image_position_x: 50, image_position_y: 50, image_r2_key: null, image_filename: null, image_credits: null,
    page_scope: 'all', include_paths_json: '[]', exclude_paths_json: '["/assinar*","/conta*","/portal*"]', devices: 'all',
    trigger_type: 'scroll', trigger_value: 40, min_pageviews: 2, cooldown_hours: 168, click_cooldown_hours: 336,
    max_per_session: 1, max_impressions_30d: 2, priority: 50, starts_at: null, ends_at: null,
  } as Partial<EngagementCampaign> & EngagementCampaign
  const editing = Boolean(campaign)
  const includePaths = parsePathRules(current.include_paths_json).join('\n')
  const excludePaths = parsePathRules(current.exclude_paths_json).join('\n')
  const selectedImageUrl = current.image_r2_key ? `/i/${escapeHtml(current.image_r2_key)}?w=900` : ''
  const selectedImageName = current.image_filename || (current.post_id && current.image_r2_key ? 'Capa da matéria selecionada' : '')
  const selectedImageMeta = current.image_credits ? `Crédito: ${current.image_credits}` : (selectedImageUrl ? 'Imagem vinculada à campanha' : '')
  const selectedImageSource = current.image_media_id ? 'custom' : (current.post_id && current.image_r2_key ? 'post' : 'none')
  let selectedPost = posts.find(post => post.id === current.post_id)
  if (current.post_id && !selectedPost) {
    selectedPost = await getPublishedPost(env, current.post_id) || undefined
    if (selectedPost) posts = [selectedPost, ...posts]
  }
  const postCards = posts.map(post => postOptionMarkup(post, current.post_id === post.id)).join('')
  const bodyHtml = `<div class="page-intro engagement-heading"><div><a class="newsletter-back" href="${editing ? `/admin/engagement/${current.id}` : '/admin/engagement'}">← Voltar</a><p class="page-kicker">${editing ? `Campanha #${current.id}` : 'Nova campanha'}</p><h1 class="page-title">${editing ? 'Editar campanha' : 'Planejar uma chamada'}</h1><p class="page-description">Conteúdo, segmentação e limites de frequência em uma única configuração.</p></div></div>
    ${notice(undefined, error || c.req.query('error'))}
    <form class="engagement-form" method="post" action="${editing ? `/admin/engagement/${current.id}/edit` : '/admin/engagement'}" data-engagement-form data-editing="${editing ? 'true' : 'false'}">
      ${renderCsrfInput(csrfToken)}
      <main class="engagement-form__main">
        <section class="card engagement-form-section"><div class="engagement-form-section__head"><span>1</span><div><h2>Objetivo e formato</h2><p>Escolha uma composição adequada à mensagem.</p></div></div>
          <div class="engagement-type-grid">
            ${(['newsletter', 'editorial', 'instagram', 'advertising'] as const).map(type => `<label><input type="radio" name="campaign_type" value="${type}" ${current.campaign_type === type ? 'checked' : ''}><span><b>${typeLabels[type]}</b><small>${type === 'newsletter' ? 'Captar leitores' : type === 'editorial' ? 'Promover matéria' : type === 'instagram' ? 'Ampliar a comunidade' : 'Campanha patrocinada'}</small></span></label>`).join('')}
          </div>
          <div class="engagement-grid"><div class="form-group"><label for="internal_name">Nome interno</label><input class="form-control" id="internal_name" name="internal_name" maxlength="120" required value="${escapeHtml(current.internal_name)}" placeholder="Ex.: Newsletter · Agosto"></div>
            <div class="form-group"><label for="display_format">Formato</label><select class="form-control" id="display_format" name="display_format"><option value="slide_in" ${current.display_format === 'slide_in' ? 'selected' : ''}>Card lateral — recomendado</option><option value="banner" ${current.display_format === 'banner' ? 'selected' : ''}>Faixa inferior</option><option value="modal" ${current.display_format === 'modal' ? 'selected' : ''}>Modal central — uso excepcional</option></select></div></div>
        </section>
        <section class="card engagement-form-section"><div class="engagement-form-section__head"><span>2</span><div><h2>Ação da campanha</h2><p>Cada objetivo pede informações e comportamento próprios.</p></div></div>
          <div class="engagement-mode-panel" data-mode-panel="newsletter"><div class="engagement-mode-panel__icon">@</div><div><strong>Captação de newsletter</strong><p>O leitor verá um campo de e-mail e o consentimento de privacidade. A inscrição entra imediatamente na base, sem dupla confirmação.</p></div></div>
          <div class="engagement-mode-panel" data-mode-panel="editorial"><div class="engagement-mode-panel__icon">↗</div><div><strong>Matéria em destaque</strong><p>Selecione uma matéria publicada. Título, resumo, link e foto de capa podem ser aplicados automaticamente.</p>
            <div class="form-group engagement-post-picker" data-post-picker><label for="post_search">Matéria publicada</label><div class="engagement-post-combobox"><input class="form-control" id="post_search" type="search" autocomplete="off" placeholder="Busque por título, chapéu ou editoria" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="post_results" data-post-search><span class="engagement-post-combobox__icon" aria-hidden="true">⌄</span><div class="engagement-post-dropdown" data-post-dropdown hidden><div class="engagement-post-results" id="post_results" role="listbox" data-post-results>${postCards}</div><small class="field-help" data-post-result>${posts.length ? `${posts.length} matéria(s) recente(s). Digite para pesquisar todo o acervo.` : 'Nenhuma matéria publicada disponível.'}</small></div></div><input type="hidden" id="post_id" name="post_id" value="${current.post_id || ''}" data-post-id data-required="true"><div class="engagement-post-selection" data-post-selection ${selectedPost ? '' : 'hidden'}><span><small>Matéria selecionada</small><strong data-post-selection-title>${escapeHtml(selectedPost?.title || '')}</strong></span><button type="button" class="btn btn-ghost btn-compact" data-post-clear>Trocar</button></div><p class="engagement-post-error" data-post-error role="alert" hidden>Escolha uma matéria publicada antes de salvar.</p></div></div></div>
          <div class="engagement-mode-panel" data-mode-panel="instagram"><div class="engagement-mode-panel__icon">◎</div><div><strong>Perfil ou publicação no Instagram</strong><p>Informe um endereço completo do Instagram para conduzir o leitor à conta, reel ou publicação.</p></div></div>
          <div class="engagement-mode-panel" data-mode-panel="advertising"><div class="engagement-mode-panel__icon">AD</div><div><strong>Campanha publicitária</strong><p>O criativo será identificado como publicidade e o link receberá tratamento de conteúdo patrocinado.</p>
            <div class="form-group"><label for="advertiser_name">Anunciante</label><input class="form-control" id="advertiser_name" name="advertiser_name" maxlength="120" value="${escapeHtml(current.advertiser_name || '')}" data-required="true" placeholder="Nome da marca ou anunciante"></div></div></div>
          <div class="form-group engagement-destination" data-mode-panel="instagram advertising"><label for="cta_url" data-destination-label>Link do Instagram</label><input class="form-control" id="cta_url" name="cta_url" type="url" maxlength="500" value="${escapeHtml(current.cta_url || '')}" data-required="true" placeholder="https://www.instagram.com/diariodopovo/"><small class="field-help" data-destination-help>Use o endereço completo do perfil, reel ou publicação.</small></div>
        </section>
        <section class="card engagement-form-section"><div class="engagement-form-section__head"><span>3</span><div><h2>Texto e imagem</h2><p>Prepare a chamada e acompanhe o resultado na prévia.</p></div></div>
          <div class="engagement-grid"><div class="form-group"><label for="eyebrow">Chapéu</label><input class="form-control" id="eyebrow" name="eyebrow" maxlength="60" value="${escapeHtml(current.eyebrow || '')}" data-preview-input="eyebrow"></div>
            <div class="form-group"><label for="cta_label">Texto do botão</label><input class="form-control" id="cta_label" name="cta_label" maxlength="50" value="${escapeHtml(current.cta_label || '')}" data-preview-input="cta" data-required="true"></div></div>
          <div class="form-group"><label for="title">Título</label><input class="form-control" id="title" name="title" maxlength="150" required value="${escapeHtml(current.title)}" data-preview-input="title"></div>
          <div class="form-group"><label for="body">Texto de apoio</label><textarea class="form-control" id="body" name="body" rows="3" maxlength="400" data-preview-input="body">${escapeHtml(current.body || '')}</textarea></div>
          <div class="engagement-image-editor" data-image-editor data-image-source="${selectedImageSource}" data-initial-image-url="${selectedImageUrl}">
            <input type="hidden" name="image_media_id" value="${current.image_media_id || ''}" data-image-media-id>
            <div class="engagement-image-editor__stage">
              <div class="engagement-image-editor__visual" data-image-visual>${selectedImageUrl ? `<img src="${selectedImageUrl}" alt="" data-selected-image style="object-position:${current.image_position_x}% ${current.image_position_y}%">` : '<div data-image-placeholder><span>Imagem opcional</span><small>Envie uma nova imagem ou escolha na biblioteca</small></div>'}</div>
              <div class="engagement-image-editor__details"><strong data-image-name>${escapeHtml(selectedImageName || 'Nenhuma imagem selecionada')}</strong><small data-image-meta>${escapeHtml(selectedImageMeta)}</small><div class="engagement-image-editor__actions"><button class="btn btn-outline btn-compact" type="button" data-image-action="upload">Enviar imagem</button><button class="btn btn-outline btn-compact" type="button" data-image-action="library">Abrir biblioteca</button><button class="btn btn-outline btn-compact" type="button" data-image-action="post" ${current.post_id ? '' : 'hidden'}>Usar capa da matéria</button><button class="btn btn-ghost btn-compact" type="button" data-image-action="remove" ${selectedImageUrl ? '' : 'hidden'}>Remover</button></div></div>
            </div>
            <div class="engagement-upload-panel" data-upload-panel hidden><div class="engagement-grid"><div class="form-group"><label for="campaign_image_file">Arquivo de imagem</label><input class="form-control" id="campaign_image_file" type="file" accept="image/jpeg,image/png,image/webp,image/avif" data-upload-file><small class="field-help">JPEG, PNG, WebP ou AVIF, até 10 MB.</small></div><div class="form-group"><label for="campaign_image_alt">Texto alternativo</label><input class="form-control" id="campaign_image_alt" maxlength="300" data-upload-alt placeholder="Descreva objetivamente a imagem"><small class="field-help">Obrigatório para acessibilidade.</small></div></div><div class="engagement-grid"><div class="form-group"><label for="campaign_image_credits">Crédito da imagem</label><input class="form-control" id="campaign_image_credits" maxlength="200" data-upload-credits placeholder="Ex.: Foto: João Silva"></div><div class="engagement-upload-panel__submit"><button class="btn" type="button" data-upload-submit>Enviar e usar imagem</button><button class="btn btn-ghost" type="button" data-upload-cancel>Cancelar</button></div></div><p class="engagement-upload-status" data-upload-status role="status"></p></div>
            <div class="engagement-focal" data-focal-controls ${selectedImageUrl ? '' : 'hidden'}><div><strong>Ponto focal</strong><small>Controle o enquadramento da imagem nos diferentes formatos.</small></div><label>Horizontal <input type="range" name="image_position_x" min="0" max="100" value="${current.image_position_x}" data-focal="x"><output data-focal-output="x">${current.image_position_x}%</output></label><label>Vertical <input type="range" name="image_position_y" min="0" max="100" value="${current.image_position_y}" data-focal="y"><output data-focal-output="y">${current.image_position_y}%</output></label></div>
          </div>
        </section>
        <section class="card engagement-form-section"><div class="engagement-form-section__head"><span>4</span><div><h2>Segmentação</h2><p>Defina onde e para quem a campanha pode aparecer.</p></div></div>
          <div class="engagement-grid"><div class="form-group"><label for="page_scope">Páginas</label><select class="form-control" id="page_scope" name="page_scope"><option value="all" ${current.page_scope === 'all' ? 'selected' : ''}>Todo o site público</option><option value="home" ${current.page_scope === 'home' ? 'selected' : ''}>Somente página inicial</option><option value="articles" ${current.page_scope === 'articles' ? 'selected' : ''}>Somente matérias</option><option value="listings" ${current.page_scope === 'listings' ? 'selected' : ''}>Editorias, tags e listagens</option><option value="specific" ${current.page_scope === 'specific' ? 'selected' : ''}>Caminhos específicos</option></select></div>
            <div class="form-group"><label for="devices">Dispositivos</label><select class="form-control" id="devices" name="devices"><option value="all" ${current.devices === 'all' ? 'selected' : ''}>Computador e celular</option><option value="desktop" ${current.devices === 'desktop' ? 'selected' : ''}>Somente computador</option><option value="mobile" ${current.devices === 'mobile' ? 'selected' : ''}>Somente celular</option></select></div></div>
          <div class="engagement-grid"><div class="form-group"><label for="include_paths">Incluir caminhos</label><textarea class="form-control form-control--mono" id="include_paths" name="include_paths" rows="4" placeholder="/categoria/politica*">${escapeHtml(includePaths)}</textarea><small class="field-help">Um por linha. Use * ao final para incluir subpáginas.</small></div>
            <div class="form-group"><label for="exclude_paths">Excluir caminhos</label><textarea class="form-control form-control--mono" id="exclude_paths" name="exclude_paths" rows="4">${escapeHtml(excludePaths)}</textarea></div></div>
        </section>
        <section class="card engagement-form-section"><div class="engagement-form-section__head"><span>5</span><div><h2>Gatilho e proteção contra fadiga</h2><p>Os valores iniciais já seguem uma abordagem conservadora.</p></div></div>
          <div class="engagement-grid engagement-grid--3"><div class="form-group"><label for="trigger_type">Quando exibir</label><select class="form-control" id="trigger_type" name="trigger_type"><option value="delay" ${current.trigger_type === 'delay' ? 'selected' : ''}>Após alguns segundos</option><option value="scroll" ${current.trigger_type === 'scroll' ? 'selected' : ''}>Após rolagem</option><option value="pageviews" ${current.trigger_type === 'pageviews' ? 'selected' : ''}>Após páginas visitadas</option><option value="exit_intent" ${current.trigger_type === 'exit_intent' ? 'selected' : ''}>Intenção de saída — desktop</option></select></div>
            <div class="form-group"><label for="trigger_value">Valor do gatilho</label><input class="form-control" id="trigger_value" name="trigger_value" type="number" min="0" max="1000" value="${current.trigger_value}"><small class="field-help">Segundos, % de rolagem ou páginas.</small></div>
            <div class="form-group"><label for="min_pageviews">Mínimo de páginas</label><input class="form-control" id="min_pageviews" name="min_pageviews" type="number" min="1" max="50" value="${current.min_pageviews}"></div></div>
          <div class="engagement-grid engagement-grid--3"><div class="form-group"><label for="cooldown_hours">Após fechar</label><input class="form-control" id="cooldown_hours" name="cooldown_hours" type="number" min="1" max="8760" value="${current.cooldown_hours}"><small class="field-help">Horas sem repetir.</small></div>
            <div class="form-group"><label for="click_cooldown_hours">Após clicar</label><input class="form-control" id="click_cooldown_hours" name="click_cooldown_hours" type="number" min="1" max="8760" value="${current.click_cooldown_hours}"><small class="field-help">Horas sem repetir.</small></div>
            <div class="form-group"><label for="max_impressions_30d">Exibições em 30 dias</label><input class="form-control" id="max_impressions_30d" name="max_impressions_30d" type="number" min="1" max="30" value="${current.max_impressions_30d}"></div></div>
          <input type="hidden" name="max_per_session" value="1">
        </section>
        <section class="card engagement-form-section"><div class="engagement-form-section__head"><span>6</span><div><h2>Período e prioridade</h2><p>Campanhas sem período permanecem disponíveis até serem pausadas.</p></div></div>
          <div class="engagement-grid engagement-grid--3"><div class="form-group"><label for="starts_at">Início</label><input class="form-control" id="starts_at" name="starts_at" type="datetime-local" value="${dateTimeLocal(current.starts_at)}"></div><div class="form-group"><label for="ends_at">Encerramento</label><input class="form-control" id="ends_at" name="ends_at" type="datetime-local" value="${dateTimeLocal(current.ends_at)}"></div><div class="form-group"><label for="priority">Prioridade</label><input class="form-control" id="priority" name="priority" type="number" min="1" max="100" value="${current.priority}"><small class="field-help">Maior prioridade vence. Uma campanha por sessão.</small></div></div>
        </section>
      </main>
      <aside class="engagement-form__aside"><div class="card engagement-preview-panel"><div class="engagement-section-head"><div><p class="page-kicker">Prévia</p><h2>Experiência do leitor</h2></div><span>Responsiva</span></div>${previewMarkup(current)}<p class="engagement-preview-note"><strong>Exibição responsável.</strong> A campanha nunca aparece imediatamente e respeita os limites globais do site.</p></div>
        <div class="engagement-savebar"><button class="btn" type="submit">${editing ? 'Salvar alterações' : 'Criar rascunho'}</button><a class="btn btn-outline" href="${editing ? `/admin/engagement/${current.id}` : '/admin/engagement'}">Cancelar</a></div></aside>
      <div class="engagement-media-modal" data-media-modal hidden><div class="engagement-media-modal__backdrop" data-media-close></div><section class="engagement-media-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="engagement-media-title"><header><div><p class="page-kicker">Biblioteca de mídia</p><h2 id="engagement-media-title">Escolher imagem</h2></div><button type="button" data-media-close aria-label="Fechar">×</button></header><div class="engagement-media-modal__search"><input class="form-control" type="search" placeholder="Buscar por nome, descrição ou crédito" data-media-search><span data-media-status>Carregando imagens…</span></div><div class="engagement-media-grid" data-media-grid></div></section></div>
    </form><script src="/static/admin-engagement.js?v=20260822-2" defer></script>`
  return c.html(renderAdminLayout({ title: editing ? 'Editar campanha' : 'Nova campanha', user: c.get('adminUser'), bodyHtml, activeTab: 'engagement', csrfToken }))
}

export async function handleEngagementNew(c: Context) { return renderCampaignForm(c) }

export async function handleEngagementPostSearch(c: Context) {
  const env = c.env as Env
  const query = c.req.query('q') || ''
  const requestedLimit = Number(c.req.query('limit') || 15)
  try {
    const posts = await searchPublishedPosts(env, query, requestedLimit)
    return c.json({
      success: true,
      results: posts.map(post => ({
        ...post,
        url: getPostUrl(post),
        image_url: post.cover_media_url ? `/i/${post.cover_media_url}?w=900` : ''
      }))
    })
  } catch (error) {
    console.error('[Engagement] Published post search failed:', error)
    return c.json({ success: false, error: 'Não foi possível pesquisar as matérias.' }, 500)
  }
}

export async function handleEngagementCreate(c: Context) {
  try {
    const input = parseEngagementCampaignInput((c.get('parsedBody') || {}) as Record<string, unknown>)
    const env = c.env as Env
    await validateCampaignRelations(env, input)
    const id = await createEngagementCampaign(env, input, c.get('adminUser').id)
    return c.redirect(`/admin/engagement/${id}?message=${encodeURIComponent('Rascunho criado. Revise a prévia antes de ativar.')}`, 303)
  } catch (error) {
    return c.redirect(`/admin/engagement/new?error=${encodeURIComponent(error instanceof Error ? error.message : 'Não foi possível criar a campanha.')}`, 303)
  }
}

export async function handleEngagementEdit(c: Context) {
  const campaign = await getEngagementCampaign(c.env as Env, Number(c.req.param('id')))
  if (!campaign) return c.notFound()
  return renderCampaignForm(c, campaign)
}

export async function handleEngagementUpdate(c: Context) {
  const id = Number(c.req.param('id'))
  try {
    const input = parseEngagementCampaignInput((c.get('parsedBody') || {}) as Record<string, unknown>)
    const env = c.env as Env
    await validateCampaignRelations(env, input)
    await updateEngagementCampaign(env, id, input)
    return c.redirect(`/admin/engagement/${id}?message=${encodeURIComponent('Alterações salvas.')}`, 303)
  } catch (error) {
    return c.redirect(`/admin/engagement/${id}/edit?error=${encodeURIComponent(error instanceof Error ? error.message : 'Não foi possível salvar.')}`, 303)
  }
}

export async function handleEngagementDetail(c: Context) {
  const campaign = await getEngagementCampaign(c.env as Env, Number(c.req.param('id')))
  if (!campaign) return c.notFound()
  const csrfToken = c.get('csrfToken') || ''
  const user = c.get('adminUser')
  const canPublish = user.role === 'admin' || user.role === 'director'
  const paths = parsePathRules(campaign.include_paths_json)
  const bodyHtml = `<div class="page-intro engagement-heading"><div><a class="newsletter-back" href="/admin/engagement">← Todas as campanhas</a><p class="page-kicker">${escapeHtml(typeLabels[campaign.campaign_type])}</p><h1 class="page-title">${escapeHtml(campaign.internal_name)}</h1><p class="page-description">${escapeHtml(campaign.title)}</p></div><div class="engagement-heading__actions">${statusBadge(campaign.status)}${campaign.status !== 'archived' ? `<a class="btn btn-outline" href="/admin/engagement/${campaign.id}/edit">Editar</a>` : ''}</div></div>
    ${notice(c.req.query('message'), c.req.query('error'))}
    <div class="engagement-detail-grid"><main>
      <section class="card engagement-detail-card"><div class="engagement-section-head"><div><p class="page-kicker">Composição</p><h2>Prévia da campanha</h2></div><span>${escapeHtml(formatLabels[campaign.display_format])}</span></div>${previewMarkup(campaign)}</section>
      <section class="card engagement-detail-card"><div class="engagement-section-head"><div><p class="page-kicker">Entrega</p><h2>Regras de exibição</h2></div></div><dl class="engagement-rules"><div><dt>Páginas</dt><dd>${escapeHtml(campaign.page_scope === 'all' ? 'Todo o site público' : campaign.page_scope)}</dd></div><div><dt>Dispositivos</dt><dd>${escapeHtml(campaign.devices)}</dd></div><div><dt>Gatilho</dt><dd>${escapeHtml(campaign.trigger_type)} · ${campaign.trigger_value}</dd></div><div><dt>Frequência</dt><dd>${campaign.max_impressions_30d} vezes em 30 dias</dd></div><div><dt>Após fechar</dt><dd>${campaign.cooldown_hours} horas</dd></div><div><dt>Caminhos</dt><dd>${paths.length ? escapeHtml(paths.join(', ')) : 'Sem restrição adicional'}</dd></div></dl></section>
    </main><aside><section class="card engagement-control-card"><p class="page-kicker">Publicação</p><h2>Controle da campanha</h2><p>Somente uma campanha é exibida por sessão. A maior prioridade elegível vence.</p><dl><div><dt>Início</dt><dd>${formatDate(campaign.starts_at)}</dd></div><div><dt>Fim</dt><dd>${formatDate(campaign.ends_at)}</dd></div><div><dt>Prioridade</dt><dd>${campaign.priority}/100</dd></div></dl>
      ${campaign.status !== 'archived' ? `<div class="engagement-control-actions">${canPublish ? (campaign.status === 'active' || campaign.status === 'scheduled' ? `<form method="post" action="/admin/engagement/${campaign.id}/status">${renderCsrfInput(csrfToken)}<input type="hidden" name="action" value="pause"><button class="btn btn-outline" type="submit">Pausar</button></form>` : `<form method="post" action="/admin/engagement/${campaign.id}/status">${renderCsrfInput(csrfToken)}<input type="hidden" name="action" value="publish"><button class="btn" type="submit">${campaign.starts_at && campaign.starts_at > new Date().toISOString() ? 'Agendar' : 'Ativar campanha'}</button></form>`) : '<p class="engagement-role-note">Um diretor deve ativar ou pausar esta campanha.</p>'}
        <form method="post" action="/admin/engagement/${campaign.id}/duplicate">${renderCsrfInput(csrfToken)}<button class="btn btn-outline" type="submit">Duplicar como rascunho</button></form>
        ${canPublish ? `<form method="post" action="/admin/engagement/${campaign.id}/status" onsubmit="return confirm('Arquivar esta campanha? O histórico de resultados será preservado.')">${renderCsrfInput(csrfToken)}<input type="hidden" name="action" value="archive"><button class="btn btn-danger" type="submit">Arquivar</button></form>` : ''}</div>` : '<p class="engagement-archived-note">Campanha arquivada. O histórico permanece disponível.</p>'}
    </section></aside></div>`
  return c.html(renderAdminLayout({ title: campaign.internal_name, user: c.get('adminUser'), bodyHtml, activeTab: 'engagement', csrfToken }))
}

export async function handleEngagementDuplicate(c: Context) {
  try {
    const id = await duplicateEngagementCampaign(c.env as Env, Number(c.req.param('id')), c.get('adminUser').id)
    return c.redirect(`/admin/engagement/${id}?message=${encodeURIComponent('Cópia criada como rascunho.')}`, 303)
  } catch (error) {
    return c.redirect(`/admin/engagement?error=${encodeURIComponent(error instanceof Error ? error.message : 'Não foi possível duplicar.')}`, 303)
  }
}

export async function handleEngagementStatus(c: Context) {
  const id = Number(c.req.param('id'))
  const body = (c.get('parsedBody') || {}) as Record<string, unknown>
  const action = String(body.action || '')
  if (!['publish', 'pause', 'archive'].includes(action)) return c.redirect(`/admin/engagement/${id}?error=${encodeURIComponent('Ação inválida.')}`, 303)
  try {
    await setEngagementCampaignStatus(c.env as Env, id, action as 'publish' | 'pause' | 'archive')
    const message = action === 'publish' ? 'Campanha ativada ou agendada.' : action === 'pause' ? 'Campanha pausada.' : 'Campanha arquivada.'
    return c.redirect(`/admin/engagement/${id}?message=${encodeURIComponent(message)}`, 303)
  } catch (error) {
    return c.redirect(`/admin/engagement/${id}?error=${encodeURIComponent(error instanceof Error ? error.message : 'Não foi possível atualizar o status.')}`, 303)
  }
}
