import type { Context } from 'hono'
import type { Env } from '../types'
import { normalizeRole, roleRank } from '../db/users'
import { randomHex } from '../utils'
import {
  approveInstagramPublication,
  createInstagramPublication,
  dispatchInstagramPublication,
  getInstagramPublication,
  getInstagramStoryVariant,
  getInstagramRuntimeConfig,
  getInstagramStats,
  listInstagramAttempts,
  listInstagramPublications,
  listInstagramSourcePosts,
  requestInstagramCaption,
  updateInstagramEditorial,
  updateInstagramStoryVariant
} from '../instagram'
import type { InstagramPublication, InstagramPublicationAttempt, InstagramSourcePost, InstagramStoryVariant } from '../instagram'
import { getPostUrl } from '../utils/post'
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
    draft: 'Rascunho', caption_ready: 'Em revisão', approved: 'Aprovado', scheduled: 'Agendado',
    publishing: 'Publicando', published: 'Publicado', failed: 'Falha'
  }
  const classes: Record<string, string> = {
    draft: 'badge-neutral', caption_ready: 'badge-warning', approved: 'badge-success',
    scheduled: 'badge-warning', publishing: 'badge-warning', published: 'badge-success', failed: 'badge-danger'
  }
  return `<span class="badge ${classes[status] || 'badge-neutral'}">${labels[status] || escapeHtml(status)}</span>`
}

function notice(message?: string, error?: string): string {
  if (error) return `<div class="newsletter-notice newsletter-notice--error" role="alert">${escapeHtml(error)}</div>`
  if (message) return `<div class="newsletter-notice newsletter-notice--success" role="status">${escapeHtml(message)}</div>`
  return ''
}

function canEditSocial(role: string): boolean {
  return roleRank(normalizeRole(role)) >= roleRank('editor')
}

function safeExternalUrl(value: string | null | undefined): string {
  if (!value) return ''
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : ''
  } catch { return '' }
}

function downloadImageUrl(key: string | null): string {
  if (!key) return ''
  if (/^https?:\/\//i.test(key)) return key
  return `/i/${key.replace(/^\//, '')}?w=2400&q=94`
}

function previewCard(publication: InstagramPublication, baseUrl: string): string {
  const image = publication.cover_media_url
    ? `${baseUrl.replace(/\/$/, '')}/i/${publication.cover_media_url}?w=1200&q=88`
    : ''
  return `<div class="instagram-art-preview" data-instagram-preview>
    ${image ? `<img src="${escapeHtml(image)}" alt="" loading="eager" style="object-position:${publication.image_position_x}% ${publication.image_position_y}%;transform:scale(1.12);transform-origin:${publication.image_position_x}% ${publication.image_position_y}%" data-preview-image>` : '<div class="instagram-art-fallback"></div>'}
    <div class="instagram-art-wash"></div>
    <div class="instagram-art-brand"><img src="/static/logo-dp.png" alt="Diário do Povo"></div>
    <div class="instagram-art-copy">
      <i></i>
      <p data-preview-hat>${escapeHtml(publication.hat || publication.category_name || 'Notícia')}</p>
      <h2 data-preview-title>${escapeHtml(publication.title)}</h2>
      <div data-preview-subtitle>${escapeHtml(publication.subtitle || '')}</div>
      <footer><strong>JORNALDIARIODOPOVO.COM.BR</strong><span data-preview-credit data-preview-prefix="Foto: " data-preview-empty="Crédito obrigatório">${publication.photo_credit ? `Foto: ${escapeHtml(publication.photo_credit)}` : 'Crédito obrigatório'}</span></footer>
    </div>
  </div>`
}

function storyShareUrl(publication: InstagramPublication, baseUrl: string): string {
  const url = new URL(getPostUrl({
    slug: publication.slug,
    published_at: publication.article_published_at,
    created_at: publication.article_created_at
  }, baseUrl))
  url.searchParams.set('utm_source', 'instagram')
  url.searchParams.set('utm_medium', 'story')
  url.searchParams.set('utm_campaign', 'article_share')
  return url.toString()
}

function storyPreviewCard(publication: InstagramPublication, story: InstagramStoryVariant, baseUrl: string): string {
  const image = publication.cover_media_url
    ? `${baseUrl.replace(/\/$/, '')}/i/${publication.cover_media_url}?w=1200&q=88`
    : ''
  return `<div class="instagram-art-preview instagram-story-preview" data-instagram-story-preview>
    ${image ? `<img src="${escapeHtml(image)}" alt="" loading="eager" style="object-position:${story.image_position_x}% ${story.image_position_y}%;transform:scale(1.12);transform-origin:${story.image_position_x}% ${story.image_position_y}%" data-story-preview-image>` : '<div class="instagram-art-fallback"></div>'}
    <div class="instagram-art-wash"></div>
    <div class="instagram-story-brand"><img src="/static/logo-dp.png" alt="Diário do Povo"></div>
    <div class="instagram-story-copy">
      <i></i>
      <p data-story-preview-hat>${escapeHtml(story.hat || publication.category_name || 'Notícia')}</p>
      <h2 data-story-preview-title>${escapeHtml(story.title)}</h2>
      <div data-story-preview-subtitle>${escapeHtml(story.subtitle || '')}</div>
      <strong data-story-preview-cta>${escapeHtml(story.cta_text || 'Leia a matéria completa')}</strong>
      <footer><b>JORNALDIARIODOPOVO.COM.BR</b><span data-story-preview-credit data-preview-prefix="Foto: " data-preview-empty="Crédito obrigatório">${story.photo_credit ? `Foto: ${escapeHtml(story.photo_credit)}` : 'Crédito obrigatório'}</span></footer>
    </div>
    <div class="instagram-story-safe-zone instagram-story-safe-zone--top"><span>Zona protegida</span></div>
    <div class="instagram-story-safe-zone instagram-story-safe-zone--bottom"><span>Área reservada ao link</span></div>
  </div>`
}

export async function handleInstagramList(c: Context) {
  const env = c.env as Env
  const [publications, stats, config] = await Promise.all([
    listInstagramPublications(env),
    getInstagramStats(env),
    getInstagramRuntimeConfig(env)
  ])
  const user = c.get('adminUser')
  const csrfToken = c.get('csrfToken') || ''
  const inReview = (stats.caption_ready || 0) + (stats.approved || 0)
  const queued = (stats.scheduled || 0) + (stats.publishing || 0)

  const bodyHtml = `
    <div class="page-intro">
      <div><p class="page-kicker">Distribuição social</p><h1 class="page-title">Instagram</h1><p class="page-description">Criação, revisão e publicação das chamadas editoriais do Diário.</p></div>
      <a class="btn" href="/admin/instagram/new"><span class="admin-icon">${renderAdminIcon('instagram')}</span> Criar publicação</a>
    </div>
    ${notice(c.req.query('message'), c.req.query('error'))}

    <div class="instagram-stats">
      <article><span>Em preparação</span><strong>${stats.draft || 0}</strong><small>Artes ainda em construção</small></article>
      <article><span>Revisão editorial</span><strong>${inReview}</strong><small>Legenda ou aprovação pendente</small></article>
      <article><span>Fila de publicação</span><strong>${queued}</strong><small>Agendados e em processamento</small></article>
      <article><span>Publicados</span><strong>${stats.published || 0}</strong><small>Histórico confirmado pela Meta</small></article>
    </div>

    <section class="card instagram-queue">
      <div class="newsletter-section-head">
        <div><p class="page-kicker">Mesa social</p><h2>Publicações recentes</h2></div>
        <span class="newsletter-provider ${config.publishReady ? 'is-ready' : ''}"><i></i>${config.publishReady ? `${escapeHtml(config.accountLabel)} conectado ao n8n` : 'Publicação protegida'}</span>
      </div>
      ${publications.length ? `<div class="newsletter-table-wrap"><table><thead><tr><th>Chamada</th><th>Status</th><th>Destino</th><th>Atualização</th><th></th></tr></thead><tbody>
        ${publications.map(item => `<tr>
          <td><a class="newsletter-subject-link" href="/admin/instagram/${item.id}">${escapeHtml(item.title)}</a><small>${escapeHtml(item.hat || item.category_name || 'Notícia')} · ${escapeHtml(item.article_title)}</small></td>
          <td>${statusBadge(item.status)}</td>
          <td>${safeExternalUrl(item.permalink) ? `<a class="instagram-permalink" href="${escapeHtml(safeExternalUrl(item.permalink))}" target="_blank" rel="noopener">Abrir no Instagram</a>` : escapeHtml(config.accountLabel)}</td>
          <td>${formatDate(item.updated_at)}</td>
          <td><a class="btn btn-outline btn-compact" href="/admin/instagram/${item.id}">Abrir</a></td>
        </tr>`).join('')}
      </tbody></table></div>` : `<div class="newsletter-empty"><span class="admin-icon">${renderAdminIcon('instagram')}</span><h3>A mesa social está pronta</h3><p>Escolha uma matéria publicada e transforme-a em uma chamada visual do Diário.</p><a class="btn" href="/admin/instagram/new">Selecionar matéria</a></div>`}
    </section>
    ${!config.captionReady || !config.publishReady ? `<div class="instagram-protected-note"><span class="admin-icon">${renderAdminIcon('shield')}</span><div><strong>Ambiente protegido</strong><p>A criação e a revisão funcionam normalmente. Configure os webhooks do n8n em <a href="/admin/integrations">Integrações</a> para liberar IA e publicação.</p></div></div>` : ''}`

  return c.html(renderAdminLayout({ title: 'Instagram', user, bodyHtml, activeTab: 'instagram', csrfToken }))
}

export async function handleInstagramNew(c: Context) {
  const posts = await listInstagramSourcePosts(c.env as Env)
  const csrfToken = c.get('csrfToken') || ''
  const bodyHtml = `
    <div class="page-intro instagram-new-intro">
      <div><a class="newsletter-back" href="/admin/instagram">← Voltar à mesa social</a><p class="page-kicker">Nova publicação</p><h1 class="page-title">Escolha a matéria</h1><p class="page-description">Somente matérias publicadas e com imagem de capa podem gerar uma arte.</p></div>
      <input class="form-control instagram-source-search" type="search" placeholder="Buscar por título ou editoria" data-instagram-search>
    </div>
    ${notice(undefined, c.req.query('error'))}
    <div class="instagram-source-grid" data-instagram-source-grid>
      ${posts.map((post: InstagramSourcePost) => {
        const image = post.cover_media_url ? `/i/${escapeHtml(post.cover_media_url)}?w=520&h=650&q=85` : ''
        return `<article class="instagram-source-card ${image ? '' : 'is-disabled'}" data-search="${escapeHtml(`${post.title} ${post.hat || ''} ${post.category_name || ''}`.toLowerCase())}">
          <div class="instagram-source-image">${image ? `<img src="${image}" alt="" loading="lazy">` : `<span class="admin-icon">${renderAdminIcon('media')}</span>`}<span>4:5</span></div>
          <div class="instagram-source-copy"><p>${escapeHtml(post.hat || post.category_name || 'Notícia')}</p><h2>${escapeHtml(post.title)}</h2><small>${formatDate(post.published_at || post.created_at)}${post.author_name ? ` · ${escapeHtml(post.author_name)}` : ''}</small>
            <form method="post" action="/admin/instagram">${renderCsrfInput(csrfToken)}<input type="hidden" name="post_id" value="${post.id}"><button class="btn btn-outline" type="submit" ${image ? '' : 'disabled'}>${image ? 'Usar esta matéria' : 'Imagem necessária'}</button></form>
          </div>
        </article>`
      }).join('')}
    </div>
    <script src="/static/admin-instagram.js?v=20260821-focal1" defer></script>`
  return c.html(renderAdminLayout({ title: 'Nova publicação no Instagram', user: c.get('adminUser'), bodyHtml, activeTab: 'instagram', csrfToken }))
}

export async function handleInstagramCreate(c: Context) {
  if (!canEditSocial(c.get('adminUser').role)) return c.html('<h1>Acesso negado</h1>', 403)
  const body = (c.get('parsedBody') || {}) as Record<string, string>
  const postId = Number.parseInt(String(body.post_id || ''), 10)
  if (!Number.isInteger(postId) || postId < 1) return c.redirect(`/admin/instagram/new?error=${encodeURIComponent('Selecione uma matéria válida.')}`, 303)
  try {
    const id = await createInstagramPublication(c.env as Env, {
      postId,
      userId: c.get('adminUser').id,
      renderToken: randomHex(24),
      storyRenderToken: randomHex(24)
    })
    return c.redirect(`/admin/instagram/${id}?message=${encodeURIComponent('Arte criada. Ajuste a chamada e prepare a legenda.')}`, 303)
  } catch (error) {
    return c.redirect(`/admin/instagram/new?error=${encodeURIComponent(error instanceof Error ? error.message : 'Não foi possível criar a publicação.')}`, 303)
  }
}

function renderAttempt(attempt: InstagramPublicationAttempt): string {
  const labels: Record<string, string> = { caption: 'Legenda por IA', caption_callback: 'Retorno da legenda', publish: 'Publicação', schedule: 'Agendamento', callback: 'Retorno do n8n' }
  return `<li><i class="${attempt.status === 'failed' ? 'is-error' : ''}"></i><div><strong>${escapeHtml(labels[attempt.action] || attempt.action)}</strong><p>${attempt.error_message ? escapeHtml(attempt.error_message) : escapeHtml(attempt.status)}</p></div><time>${formatDate(attempt.attempted_at)}</time></li>`
}

export async function handleInstagramDetail(c: Context) {
  const env = c.env as Env
  const id = Number.parseInt(c.req.param('id'), 10)
  const [publication, story, attempts, config] = await Promise.all([
    getInstagramPublication(env, id),
    getInstagramStoryVariant(env, id),
    listInstagramAttempts(env, id),
    getInstagramRuntimeConfig(env)
  ])
  if (!publication || !story) return c.notFound()
  const csrfToken = c.get('csrfToken') || ''
  const user = c.get('adminUser')
  const isDirector = normalizeRole(user.role) === 'director'
  const locked = ['scheduled', 'publishing', 'published'].includes(publication.status)
  const canApprove = !locked && Boolean(publication.caption?.trim()) && Boolean(publication.photo_credit?.trim())
  const canDispatch = isDirector && Boolean(publication.approved_at) && ['approved', 'failed'].includes(publication.status) && config.publishReady
  const trackedStoryUrl = storyShareUrl(publication, env.PUBLIC_BASE_URL)

  const bodyHtml = `
    <div class="page-intro instagram-detail-intro">
      <div><a class="newsletter-back" href="/admin/instagram">← Voltar à mesa social</a><p class="page-kicker">Publicação #${publication.id}</p><h1 class="page-title">Preparação editorial</h1><p class="page-description">Produza o feed e o Story da mesma matéria com composições independentes.</p></div>
      <div class="instagram-detail-actions">
        ${statusBadge(publication.status)}
        <span class="instagram-format-actions" data-instagram-format-actions="feed"><button class="btn" type="button" data-instagram-download data-download-image="${escapeHtml(downloadImageUrl(publication.cover_media_url))}">Baixar feed (JPG) <span class="admin-icon">${renderAdminIcon('download')}</span></button><a class="btn btn-outline" href="/artes/editoriais/${publication.render_token}" target="_blank" rel="noopener">Arte 4:5 <span class="admin-icon">${renderAdminIcon('external')}</span></a><span class="instagram-download-status" data-instagram-download-status aria-live="polite"></span></span>
        <span class="instagram-format-actions" data-instagram-format-actions="story" hidden><button class="btn" type="button" data-instagram-story-download data-download-image="${escapeHtml(downloadImageUrl(publication.cover_media_url))}">Baixar Story (JPG) <span class="admin-icon">${renderAdminIcon('download')}</span></button><a class="btn btn-outline" href="/artes/stories/${story.render_token}" target="_blank" rel="noopener">Arte 9:16 <span class="admin-icon">${renderAdminIcon('external')}</span></a><button class="btn btn-outline" type="button" data-story-copy-link data-story-url="${escapeHtml(trackedStoryUrl)}">Copiar link</button><span class="instagram-download-status" data-instagram-story-download-status aria-live="polite"></span></span>
      </div>
    </div>
    ${notice(c.req.query('message'), c.req.query('error'))}

    <div class="instagram-format-tabs" role="tablist" aria-label="Formato da publicação">
      <button type="button" role="tab" aria-selected="true" data-instagram-format-tab="feed"><strong>Feed</strong><span>1080 × 1350 · 4:5</span></button>
      <button type="button" role="tab" aria-selected="false" data-instagram-format-tab="story"><strong>Story</strong><span>1080 × 1920 · 9:16</span></button>
    </div>

    <div class="instagram-workspace">
      <main>
        <form class="card instagram-editor-card" method="post" action="/admin/instagram/${publication.id}/edit" data-instagram-editor data-instagram-format-panel="feed">
          ${renderCsrfInput(csrfToken)}
          <div class="newsletter-section-head"><div><p class="page-kicker">Composição</p><h2>Texto da arte</h2></div><span class="instagram-format-chip">1080 × 1350 · 4:5</span></div>
          <div class="instagram-editor-fields">
            <div class="form-group"><label for="instagram-hat">Chapéu</label><input class="form-control" id="instagram-hat" name="hat" maxlength="40" value="${escapeHtml(publication.hat || '')}" data-preview-input="hat" ${locked ? 'disabled' : ''}><small><span data-count-for="instagram-hat">${(publication.hat || '').length}</span>/40 · Use uma identificação curta.</small></div>
            <div class="form-group"><label for="instagram-title">Título</label><textarea class="form-control" id="instagram-title" name="title" maxlength="120" rows="3" required data-preview-input="title" ${locked ? 'disabled' : ''}>${escapeHtml(publication.title)}</textarea><small><span data-count-for="instagram-title">${publication.title.length}</span>/120 · Ideal: até quatro linhas na arte.</small></div>
            <div class="form-group"><label for="instagram-subtitle">Bigode <span>opcional</span></label><textarea class="form-control" id="instagram-subtitle" name="subtitle" maxlength="180" rows="3" data-preview-input="subtitle" ${locked ? 'disabled' : ''}>${escapeHtml(publication.subtitle || '')}</textarea><small><span data-count-for="instagram-subtitle">${(publication.subtitle || '').length}</span>/180 · Complemente sem repetir o título.</small></div>
            <div class="form-group"><label for="instagram-photo-credit">Crédito da foto</label><input class="form-control" id="instagram-photo-credit" name="photo_credit" maxlength="160" value="${escapeHtml(publication.photo_credit || '')}" placeholder="Ex.: Nome do fotógrafo / Agência" required data-preview-input="credit" ${locked ? 'disabled' : ''}><small><span data-count-for="instagram-photo-credit">${(publication.photo_credit || '').length}</span>/160 · Obrigatório e específico para esta publicação.</small></div>
            <div class="form-group instagram-focal-controls"><label>Ponto focal da fotografia</label><div><label for="instagram-position-x">Horizontal <output data-position-output="x">${publication.image_position_x}%</output></label><input id="instagram-position-x" name="image_position_x" type="range" min="0" max="100" value="${publication.image_position_x}" data-position-axis="x" ${locked ? 'disabled' : ''}></div><div><label for="instagram-position-y">Vertical <output data-position-output="y">${publication.image_position_y}%</output></label><input id="instagram-position-y" name="image_position_y" type="range" min="0" max="100" value="${publication.image_position_y}" data-position-axis="y" ${locked ? 'disabled' : ''}></div><small data-instagram-crop-hint>Reposicione o recorte para preservar o assunto principal.</small></div>
          </div>

          <div class="instagram-caption-heading"><div><p class="page-kicker">Texto da publicação</p><h2>Legenda e acessibilidade</h2></div>${config.captionReady && !locked ? `<button class="btn btn-secondary" type="submit" formaction="/admin/instagram/${publication.id}/caption" formmethod="post">Gerar legenda com IA</button>` : ''}</div>
          <div class="instagram-editor-fields">
            <div class="form-group"><label for="instagram-caption">Legenda</label><textarea class="form-control instagram-caption-input" id="instagram-caption" name="caption" maxlength="2200" rows="10" ${locked ? 'disabled' : ''}>${escapeHtml(publication.caption || '')}</textarea><small><span data-count-for="instagram-caption">${(publication.caption || '').length}</span>/2.200 · A IA sugere; a decisão final é da redação.</small></div>
            <div class="form-group"><label for="instagram-hashtags">Hashtags</label><input class="form-control" id="instagram-hashtags" name="hashtags" maxlength="300" value="${escapeHtml(publication.hashtags || '')}" placeholder="#jornalismo #notícias" ${locked ? 'disabled' : ''}><small>Até oito hashtags contextuais.</small></div>
            <div class="form-group"><label for="instagram-alt-text">Texto alternativo</label><textarea class="form-control" id="instagram-alt-text" name="alt_text" maxlength="1000" rows="3" ${locked ? 'disabled' : ''}>${escapeHtml(publication.alt_text || publication.cover_alt || '')}</textarea><small>Descreva a imagem para leitores que usam tecnologias assistivas.</small></div>
          </div>
          ${!locked ? `<div class="instagram-editor-save"><span>Qualquer alteração após a aprovação exige uma nova revisão.</span><button class="btn" type="submit">Salvar alterações</button></div>` : ''}
        </form>

        <form class="card instagram-editor-card instagram-story-editor" method="post" action="/admin/instagram/${publication.id}/story/edit" data-instagram-story-editor data-instagram-format-panel="story" hidden>
          ${renderCsrfInput(csrfToken)}
          <div class="newsletter-section-head"><div><p class="page-kicker">Composição</p><h2>Texto do Story</h2></div><div class="instagram-story-head-actions"><button class="btn btn-outline btn-compact" type="button" data-story-safe-toggle aria-pressed="true">Ocultar zonas seguras</button><span class="instagram-format-chip">1080 × 1920 · 9:16</span></div></div>
          <div class="instagram-editor-fields">
            <div class="form-group"><label for="instagram-story-hat">Chapéu</label><input class="form-control" id="instagram-story-hat" name="hat" maxlength="40" value="${escapeHtml(story.hat || '')}" data-story-preview-input="hat"><small><span data-count-for="instagram-story-hat">${(story.hat || '').length}</span>/40 · Identificação curta da editoria.</small></div>
            <div class="form-group"><label for="instagram-story-title">Título</label><textarea class="form-control" id="instagram-story-title" name="title" maxlength="120" rows="3" required data-story-preview-input="title">${escapeHtml(story.title)}</textarea><small><span data-count-for="instagram-story-title">${story.title.length}</span>/120 · Ideal: até quatro linhas.</small></div>
            <div class="form-group"><label for="instagram-story-subtitle">Bigode <span>opcional</span></label><textarea class="form-control" id="instagram-story-subtitle" name="subtitle" maxlength="160" rows="3" data-story-preview-input="subtitle">${escapeHtml(story.subtitle || '')}</textarea><small><span data-count-for="instagram-story-subtitle">${(story.subtitle || '').length}</span>/160 · Use apenas o contexto indispensável.</small></div>
            <div class="form-group"><label for="instagram-story-photo-credit">Crédito da foto</label><input class="form-control" id="instagram-story-photo-credit" name="photo_credit" maxlength="160" value="${escapeHtml(story.photo_credit || publication.photo_credit || '')}" placeholder="Ex.: Nome do fotógrafo / Agência" required data-story-preview-input="credit"><small><span data-count-for="instagram-story-photo-credit">${(story.photo_credit || publication.photo_credit || '').length}</span>/160 · Obrigatório no arquivo final.</small></div>
            <div class="form-group"><label for="instagram-story-cta">Chamada para leitura</label><input class="form-control" id="instagram-story-cta" name="cta_text" maxlength="60" value="${escapeHtml(story.cta_text || 'Leia a matéria completa')}" data-story-preview-input="cta"><small><span data-count-for="instagram-story-cta">${(story.cta_text || 'Leia a matéria completa').length}</span>/60 · O adesivo de link será inserido no Instagram.</small></div>
            <div class="form-group instagram-focal-controls"><label>Ponto focal da fotografia</label><div><label for="instagram-story-position-x">Horizontal <output data-story-position-output="x">${story.image_position_x}%</output></label><input id="instagram-story-position-x" name="image_position_x" type="range" min="0" max="100" value="${story.image_position_x}" data-story-position-axis="x"></div><div><label for="instagram-story-position-y">Vertical <output data-story-position-output="y">${story.image_position_y}%</output></label><input id="instagram-story-position-y" name="image_position_y" type="range" min="0" max="100" value="${story.image_position_y}" data-story-position-axis="y"></div><small data-instagram-story-crop-hint>Reposicione o recorte vertical para preservar o assunto principal.</small></div>
          </div>
          <div class="instagram-editor-save"><span>O Story é salvo separadamente e não altera a arte do feed.</span><button class="btn" type="submit">Salvar Story</button></div>
        </form>

        <section class="card instagram-source-summary"><div><p class="page-kicker">Matéria de origem</p><h2>${escapeHtml(publication.article_title)}</h2><p>${escapeHtml(publication.article_excerpt || 'Sem linha de apoio cadastrada.')}</p></div><a class="btn btn-outline" href="/admin/posts/${publication.post_id}" target="_blank" rel="noopener">Abrir matéria</a></section>

        ${attempts.length ? `<section class="card instagram-history"><div class="newsletter-section-head"><div><p class="page-kicker">Auditoria</p><h2>Histórico da automação</h2></div></div><ol>${attempts.map(renderAttempt).join('')}</ol></section>` : ''}
      </main>

      <aside class="instagram-review-column">
        <section class="card instagram-preview-card" data-instagram-format-panel="feed"><div class="instagram-preview-head"><div><p class="page-kicker">Prévia</p><h2>Feed vertical</h2></div><span>4:5</span></div>${previewCard(publication, env.PUBLIC_BASE_URL)}</section>

        <section class="card instagram-preview-card instagram-story-preview-card" data-instagram-format-panel="story" hidden><div class="instagram-preview-head"><div><p class="page-kicker">Prévia exata</p><h2>Story</h2></div><span>9:16</span></div>${storyPreviewCard(publication, story, env.PUBLIC_BASE_URL)}<p class="instagram-story-safe-note">As faixas pontilhadas não aparecem no JPG. Elas protegem a marca, os textos e a área do adesivo de link.</p></section>

        <section class="card instagram-approval-card" data-instagram-format-panel="feed">
          <p class="page-kicker">Controle editorial</p><h2>${publication.approved_at ? 'Peça aprovada' : 'Aprovação obrigatória'}</h2>
          <p>${publication.approved_at ? `Aprovada por ${escapeHtml(publication.approved_by_name || 'diretor')} em ${formatDate(publication.approved_at)}.` : 'Confirme que imagem, chamada, legenda e fatos correspondem à matéria original.'}</p>
          ${!publication.approved_at && !locked ? `<form method="post" action="/admin/instagram/${publication.id}/approve">${renderCsrfInput(csrfToken)}<button class="btn btn-secondary" type="submit" ${canApprove ? '' : 'disabled'}><span class="admin-icon">${renderAdminIcon('shield')}</span> Aprovar conteúdo</button></form>` : ''}
          ${!canApprove && !publication.approved_at ? `<small>${!publication.photo_credit?.trim() ? 'Informe e salve o crédito da foto. ' : ''}${!publication.caption?.trim() ? 'Salve uma legenda para liberar a aprovação.' : ''}</small>` : ''}
        </section>

        <section class="card instagram-publish-card" data-instagram-format-panel="feed">
          <div class="instagram-publish-status ${config.publishReady ? 'is-ready' : ''}"><i></i><div><strong>${config.publishReady ? `${escapeHtml(config.accountLabel)} pronto no n8n` : 'Publicação ainda protegida'}</strong><p>${config.publishReady ? 'A peça aprovada será rasterizada e enviada pela API oficial.' : 'Configure o webhook de publicação em Integrações.'}</p></div></div>
          ${safeExternalUrl(publication.permalink) ? `<a class="btn" href="${escapeHtml(safeExternalUrl(publication.permalink))}" target="_blank" rel="noopener">Ver publicação <span class="admin-icon">${renderAdminIcon('external')}</span></a>` : !locked || publication.status === 'failed' ? `<form method="post" action="/admin/instagram/${publication.id}/publish" onsubmit="return confirm('Confirma o encaminhamento desta versão aprovada ao n8n?')">${renderCsrfInput(csrfToken)}<div class="form-group"><label for="scheduled-at">Agendar <span>opcional</span></label><input class="form-control" id="scheduled-at" type="datetime-local" name="scheduled_at"></div><button class="btn" type="submit" ${canDispatch ? '' : 'disabled'}>Publicar ou agendar <span class="admin-icon">${renderAdminIcon('arrow')}</span></button></form>` : ''}
          ${!isDirector ? '<small>A publicação final é restrita a diretores.</small>' : ''}
          ${publication.last_error ? `<div class="instagram-last-error"><strong>Última falha</strong><p>${escapeHtml(publication.last_error)}</p></div>` : ''}
        </section>

        <section class="card instagram-story-manual-card" data-instagram-format-panel="story" hidden>
          <p class="page-kicker">Distribuição manual</p><h2>Pronto para o aplicativo</h2><p>Baixe o JPG, publique-o como Story e cole o link rastreável no adesivo de link do Instagram.</p><button class="btn btn-outline" type="button" data-story-copy-link data-story-url="${escapeHtml(trackedStoryUrl)}">Copiar link da matéria</button><small data-story-copy-status aria-live="polite"></small>
        </section>
      </aside>
    </div>
    <script src="/static/admin-instagram.js?v=20260821-focal2" defer></script>`

  return c.html(renderAdminLayout({ title: 'Instagram · Revisão', user, bodyHtml, activeTab: 'instagram', csrfToken }))
}

function editorialBody(c: Context): Record<string, string> {
  return (c.get('parsedBody') || {}) as Record<string, string>
}

function parseEditorial(c: Context) {
  const body = editorialBody(c)
  const input = {
    hat: String(body.hat || '').trim(),
    title: String(body.title || '').trim(),
    subtitle: String(body.subtitle || '').trim(),
    photoCredit: String(body.photo_credit || '').trim(),
    caption: String(body.caption || '').trim(),
    hashtags: String(body.hashtags || '').trim(),
    altText: String(body.alt_text || '').trim(),
    imagePositionX: Number.parseInt(String(body.image_position_x || '50'), 10),
    imagePositionY: Number.parseInt(String(body.image_position_y || '50'), 10)
  }
  if (!input.title || input.title.length > 120) throw new Error('Informe um título de até 120 caracteres.')
  if (input.hat.length > 40) throw new Error('O chapéu deve ter até 40 caracteres.')
  if (input.subtitle.length > 180) throw new Error('O bigode deve ter até 180 caracteres.')
  if (!input.photoCredit) throw new Error('Informe o crédito da foto.')
  if (input.photoCredit.length > 160) throw new Error('O crédito da foto deve ter até 160 caracteres.')
  if (input.caption.length > 2200) throw new Error('A legenda deve ter até 2.200 caracteres.')
  if (input.hashtags.split(/\s+/).filter(Boolean).length > 8) throw new Error('Use no máximo oito hashtags.')
  if (input.altText.length > 1000) throw new Error('O texto alternativo deve ter até 1.000 caracteres.')
  if (!Number.isFinite(input.imagePositionX) || !Number.isFinite(input.imagePositionY)) throw new Error('Informe um ponto focal válido para a fotografia.')
  return input
}

export async function handleInstagramUpdate(c: Context) {
  if (!canEditSocial(c.get('adminUser').role)) return c.html('<h1>Acesso negado</h1>', 403)
  const id = Number.parseInt(c.req.param('id'), 10)
  try {
    await updateInstagramEditorial(c.env as Env, id, parseEditorial(c))
    return c.redirect(`/admin/instagram/${id}?message=${encodeURIComponent('Alterações salvas. A prévia foi atualizada.')}`, 303)
  } catch (error) {
    return c.redirect(`/admin/instagram/${id}?error=${encodeURIComponent(error instanceof Error ? error.message : 'Não foi possível salvar.')}`, 303)
  }
}

function parseStoryEditorial(c: Context) {
  const body = editorialBody(c)
  const input = {
    hat: String(body.hat || '').trim(),
    title: String(body.title || '').trim(),
    subtitle: String(body.subtitle || '').trim(),
    photoCredit: String(body.photo_credit || '').trim(),
    ctaText: String(body.cta_text || '').trim(),
    imagePositionX: Number.parseInt(String(body.image_position_x || '50'), 10),
    imagePositionY: Number.parseInt(String(body.image_position_y || '50'), 10)
  }
  if (!input.title || input.title.length > 120) throw new Error('Informe um título de Story com até 120 caracteres.')
  if (input.hat.length > 40) throw new Error('O chapéu deve ter até 40 caracteres.')
  if (input.subtitle.length > 160) throw new Error('O bigode do Story deve ter até 160 caracteres.')
  if (!input.photoCredit) throw new Error('Informe o crédito da foto do Story.')
  if (input.photoCredit.length > 160) throw new Error('O crédito da foto deve ter até 160 caracteres.')
  if (input.ctaText.length > 60) throw new Error('A chamada para leitura deve ter até 60 caracteres.')
  if (!Number.isFinite(input.imagePositionX) || !Number.isFinite(input.imagePositionY)) throw new Error('Informe um ponto focal válido para o Story.')
  return input
}

export async function handleInstagramStoryUpdate(c: Context) {
  if (!canEditSocial(c.get('adminUser').role)) return c.html('<h1>Acesso negado</h1>', 403)
  const id = Number.parseInt(c.req.param('id'), 10)
  try {
    await updateInstagramStoryVariant(c.env as Env, id, parseStoryEditorial(c))
    return c.redirect(`/admin/instagram/${id}?format=story&message=${encodeURIComponent('Story salvo. A prévia 9:16 foi atualizada.')}`, 303)
  } catch (error) {
    return c.redirect(`/admin/instagram/${id}?format=story&error=${encodeURIComponent(error instanceof Error ? error.message : 'Não foi possível salvar o Story.')}`, 303)
  }
}

export async function handleInstagramCaption(c: Context) {
  if (!canEditSocial(c.get('adminUser').role)) return c.html('<h1>Acesso negado</h1>', 403)
  const id = Number.parseInt(c.req.param('id'), 10)
  try {
    await updateInstagramEditorial(c.env as Env, id, parseEditorial(c))
    await requestInstagramCaption(c.env as Env, id)
    return c.redirect(`/admin/instagram/${id}?message=${encodeURIComponent('Legenda recebida do n8n. Revise cada informação antes de aprovar.')}`, 303)
  } catch (error) {
    return c.redirect(`/admin/instagram/${id}?error=${encodeURIComponent(error instanceof Error ? error.message : 'Não foi possível gerar a legenda.')}`, 303)
  }
}

export async function handleInstagramApprove(c: Context) {
  if (!canEditSocial(c.get('adminUser').role)) return c.html('<h1>Acesso negado</h1>', 403)
  const id = Number.parseInt(c.req.param('id'), 10)
  try {
    await approveInstagramPublication(c.env as Env, id, c.get('adminUser').id)
    return c.redirect(`/admin/instagram/${id}?message=${encodeURIComponent('Conteúdo aprovado e bloqueado para distribuição.')}`, 303)
  } catch (error) {
    return c.redirect(`/admin/instagram/${id}?error=${encodeURIComponent(error instanceof Error ? error.message : 'Não foi possível aprovar.')}`, 303)
  }
}

function parseFortalezaSchedule(value: string): string | undefined {
  const raw = value.trim()
  if (!raw) return undefined
  const parsed = new Date(`${raw}:00-03:00`)
  if (Number.isNaN(parsed.getTime())) throw new Error('Informe uma data válida para o agendamento.')
  if (parsed.getTime() < Date.now() + 120000) throw new Error('O agendamento deve estar pelo menos dois minutos no futuro.')
  return parsed.toISOString()
}

export async function handleInstagramPublish(c: Context) {
  const id = Number.parseInt(c.req.param('id'), 10)
  const body = editorialBody(c)
  try {
    if (normalizeRole(c.get('adminUser').role) !== 'director') throw new Error('A publicação final é restrita a diretores.')
    const scheduledAt = parseFortalezaSchedule(String(body.scheduled_at || ''))
    await dispatchInstagramPublication(c.env as Env, id, scheduledAt)
    return c.redirect(`/admin/instagram/${id}?message=${encodeURIComponent(scheduledAt ? 'Publicação agendada no n8n.' : 'Publicação encaminhada ao n8n.')}`, 303)
  } catch (error) {
    return c.redirect(`/admin/instagram/${id}?error=${encodeURIComponent(error instanceof Error ? error.message : 'Não foi possível encaminhar a publicação.')}`, 303)
  }
}
