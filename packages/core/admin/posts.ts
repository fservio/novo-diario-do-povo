/**
 * Admin Posts Module
 * SSR UI + Handlers para CRUD de posts
 */

import type { Context } from 'hono'
import type { Env, AppContext } from '../types'
import { escapeHtml, renderAdminIcon, renderAdminLayout, type AdminUser } from './ui'
import { renderVisualEditor } from './visual-editor'
import { renderSocialSharingPanel } from './social-sharing'
import { renderMarkdownToHtml } from '../render/sanitize'
import { z } from 'zod'
import {
  listPosts,
  getPostById,
  createPost,
  updatePost,
  publishPost,
  schedulePost,
  archivePost,
  type Post,
  type PostRevision,
  type PostFilters
} from '../db/posts'

// ============================================================================
// Validation Schemas
// ============================================================================

const postSchemaShape = {
  hat: z.string()
    .max(60, 'Chapéu deve ter no máximo 60 caracteres')
    .transform(val => val.trim().toUpperCase())
    .optional(),
  title: z.string().min(1, 'Título é obrigatório').max(500),
  slug: z.string().optional(),
  excerpt: z.string().max(1000).optional(),
  content: z.string().max(1_000_000).optional().default(''),
  content_json: z.string().max(500_000).optional(),
  content_version: z.coerce.number().int().positive().optional(),
  category_id: z.coerce.number().int().positive(),
  author_id: z.coerce.number().int().positive(),
  cover_media_id: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
  template: z.enum(['article', 'liveblog', 'hub', 'story']).optional().or(z.literal('').transform((): string | undefined => undefined)),
  opinion_type: z.enum(['news', 'editorial', 'article', 'column']).default('news'),
  opinion_featured: z.coerce.number().int().min(0).max(1).optional(),
  seo_title: z.string().max(200).optional(),
  seo_description: z.string().max(500).optional(),
  seo_canonical: z.string().url().optional().or(z.literal('')),
  seo_noindex: z.coerce.number().int().min(0).max(1).optional(),
  social_title: z.string().max(90).optional(),
  social_description: z.string().max(220).optional(),
  social_share_text: z.string().max(700).optional(),
  social_image_media_id: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
  social_image_position_x: z.coerce.number().int().min(0).max(100).optional(),
  social_image_position_y: z.coerce.number().int().min(0).max(100).optional(),
  is_premium: z.coerce.number().int().min(0).max(1).optional(),
  paywall_tier: z.enum(['free', 'metered', 'hard']).optional().or(z.literal('').transform((): string | undefined => undefined)),
  metering_exempt: z.coerce.number().int().min(0).max(1).optional(),
  is_live: z.coerce.number().int().min(0).max(1).optional(),
  is_headline: z.coerce.number().int().min(0).max(1).optional(),
  tags: z.array(z.coerce.number().int().positive()).optional(),
}

const createPostSchema = z.object(postSchemaShape).refine(
  data => Boolean(data.content_json?.trim() || data.content?.trim()),
  { message: 'Conteúdo é obrigatório', path: ['content'] }
)

const updatePostSchema = z.object(postSchemaShape).partial()

const scheduleSchema = z.object({
  scheduled_at: z.string().refine((val) => {
    const date = new Date(val)
    return date > new Date()
  }, 'Data deve ser no futuro')
})

// ============================================================================
// UI Helpers
// ============================================================================

function renderPostsListPage(params: {
  posts: Post[]
  total: number
  filters: PostFilters & { page?: number }
  categories: any[]
  authors: any[]
  user: AdminUser
  csrfToken: string
}): string {
  const { posts, total, filters, categories, authors, user, csrfToken } = params

  const statusOptions = [
    { value: '', label: 'Status: Todos' },
    { value: 'draft', label: 'Rascunho' },
    { value: 'review', label: 'Revisão' },
    { value: 'published', label: 'Publicado' },
    { value: 'archived', label: 'Arquivado' },
  ]

  const years = []
  const currentYear = new Date().getFullYear()
  for (let y = currentYear; y >= 2020; y--) years.push(y)

  const months = [
    { value: '01', label: 'Janeiro' },
    { value: '02', label: 'Fevereiro' },
    { value: '03', label: 'Março' },
    { value: '04', label: 'Abril' },
    { value: '05', label: 'Maio' },
    { value: '06', label: 'Junho' },
    { value: '07', label: 'Julho' },
    { value: '08', label: 'Agosto' },
    { value: '09', label: 'Setembro' },
    { value: '10', label: 'Outubro' },
    { value: '11', label: 'Novembro' },
    { value: '12', label: 'Dezembro' },
  ]

  const limit = filters.limit || 20
  const currentPage = filters.page || 1
  const totalPages = Math.ceil(total / limit)
  const adminIcon = (name: string) => `<span class="admin-icon">${renderAdminIcon(name)}</span>`
  const opinionLabel = (type?: string) => ({
    editorial: 'Editorial',
    article: 'Artigo',
    column: 'Coluna'
  }[type || ''] || '')

  const buildQuery = (newFilters: any) => {
    const q = new URLSearchParams()
    const all = { ...filters, ...newFilters }
    Object.entries(all).forEach(([k, v]) => {
      if (v !== undefined && v !== '' && v !== null) q.set(k, String(v))
    })
    return q.toString()
  }

  const bodyHtml = `
    <div class="page-intro">
      <div>
         <p class="page-kicker">Conteúdo editorial</p>
         <h1 class="page-title">Matérias</h1>
         <p class="page-description">Pesquise, revise e acompanhe todas as publicações do jornal.</p>
      </div>
      <a href="/admin/posts/new" class="btn">${adminIcon('posts')} Nova matéria</a>
    </div>
    
    <!-- Filtros Superiores -->
    <div class="card filter-card">
      <form method="get" action="/admin/posts" id="filterForm">
        <div class="filter-grid">
          <div class="form-group" style="margin: 0;">
            <label>Busca livre</label>
            <input type="text" name="search" class="form-control" value="${escapeHtml(filters.search || '')}" placeholder="Título ou conteúdo...">
          </div>

          <div class="form-group" style="margin: 0;">
            <label>Status</label>
            <select name="status" class="form-control" onchange="this.form.submit()">
              ${statusOptions.map(opt => `<option value="${opt.value}" ${filters.status === opt.value ? 'selected' : ''}>${opt.label}</option>`).join('')}
            </select>
          </div>
          
          <div class="form-group" style="margin: 0;">
            <label>Editoria</label>
            <select name="category_id" class="form-control" onchange="this.form.submit()">
              <option value="">Todas</option>
              ${categories.map(cat => `<option value="${cat.id}" ${filters.category_id === cat.id ? 'selected' : ''}>${escapeHtml(cat.name)}</option>`).join('')}
            </select>
          </div>

          <div class="form-group" style="margin: 0;">
            <label>Premium</label>
            <select name="is_premium" class="form-control" onchange="this.form.submit()">
              <option value="">Todos</option>
              <option value="0" ${String(filters.is_premium) === '0' ? 'selected' : ''}>Grátis</option>
              <option value="1" ${String(filters.is_premium) === '1' ? 'selected' : ''}>Premium</option>
            </select>
          </div>
        </div>

        <!-- Filtro de Calendário -->
        <div class="filter-calendar">
            <span class="filter-calendar-label">${adminIcon('cover')} Período</span>
            
            <select name="year" class="form-control" style="width: auto;" onchange="this.form.submit()">
              <option value="">Ano</option>
              ${years.map(y => `<option value="${y}" ${filters.year === y ? 'selected' : ''}>${y}</option>`).join('')}
            </select>

            <select name="month" class="form-control" style="width: auto;" onchange="this.form.submit()">
              <option value="">Mês</option>
              ${months.map(m => `<option value="${m.value}" ${filters.month === parseInt(m.value) ? 'selected' : ''}>${m.label}</option>`).join('')}
            </select>

            <select name="day" class="form-control" style="width: auto;" onchange="this.form.submit()">
              <option value="">Dia</option>
              ${Array.from({ length: 31 }, (_, i) => i + 1).map(d => {
    const ds = String(d).padStart(2, '0');
    return `<option value="${ds}" ${filters.day === d ? 'selected' : ''}>${ds}</option>`;
  }).join('')}
            </select>

            <div class="filter-actions">
              <button type="submit" class="btn">Aplicar filtros</button>
              <a href="/admin/posts" class="btn btn-outline">Limpar</a>
            </div>
        </div>
      </form>
    </div>
    
    <!-- Tabela -->
    <div class="table-container shadow-sm">
      <table>
        <thead>
          <tr>
            <th style="width: 45%;">Título</th>
            <th>Categoria</th>
            <th>Status</th>
            <th>Acesso</th>
            <th>Data</th>
            <th style="text-align: right;">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${posts.length === 0 ? `
            <tr>
              <td colspan="6" class="empty-state">
                <div class="empty-state-icon">${adminIcon('posts')}</div>
                Nenhuma matéria encontrada com estes filtros.
              </td>
            </tr>
          ` : posts.map(post => `
            <tr>
              <td>
                <div class="content-title-cell">
                    ${post.hat ? `<span class="content-kicker">${escapeHtml(post.hat)}</span>` : ''}
                    ${opinionLabel(post.opinion_type) ? `<span class="content-format">${escapeHtml(opinionLabel(post.opinion_type))}</span>` : ''}
                    <a href="/admin/posts/${post.id}" class="content-title-link">
                      ${escapeHtml(post.title)}
                    </a>
                </div>
              </td>
              <td><span class="badge badge-neutral">${escapeHtml(post.category_name || 'Geral')}</span></td>
              <td>
                ${post.status === 'published' ? '<span class="badge badge-success">Publicado</span>' :
      post.status === 'draft' ? '<span class="badge badge-neutral">Rascunho</span>' :
        post.status === 'review' ? '<span class="badge badge-warning">Revisão</span>' :
          '<span class="badge badge-danger">Arquivado</span>'
    }
              </td>
              <td><span class="access-label"><span class="access-mark ${post.is_premium ? 'is-premium' : ''}">${adminIcon(post.is_premium ? 'shield' : 'external')}</span>${post.is_premium ? 'Premium' : 'Livre'}</span></td>
              <td style="white-space: nowrap; color: var(--text-muted); font-size: 0.8125rem;">
                ${new Date(post.created_at).toLocaleDateString('pt-BR')}
              </td>
              <td style="text-align: right;">
                <div class="row-actions">
                  <a href="/admin/posts/${post.id}" class="btn btn-outline btn-compact">Editar</a>
                  <a href="/admin/posts/${post.id}/preview" target="_blank" rel="noopener" class="btn btn-outline btn-compact" title="Visualizar matéria">${adminIcon('external')}<span style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);">Visualizar</span></a>
                  <form method="post" action="/admin/posts/${post.id}/delete" onsubmit="return confirm('Tem certeza que deseja excluir esta matéria permanentemente?')">
                    ${renderCsrfInput(csrfToken)}
                    <button type="submit" class="btn btn-danger btn-compact">
                      Excluir
                    </button>
                  </form>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <!-- Paginação -->
    ${totalPages > 1 ? `
    <nav class="pagination" aria-label="Paginação de matérias">
        ${currentPage > 1 ? `
            <a href="/admin/posts?${buildQuery({ page: 1 })}" class="btn btn-outline" style="padding: 0.5rem 0.75rem;">«</a>
            <a href="/admin/posts?${buildQuery({ page: currentPage - 1 })}" class="btn btn-outline" style="padding: 0.5rem 0.75rem;">‹ Anterior</a>
        ` : ''}

        <div class="pagination-status">
            <strong>Página ${currentPage}</strong> de ${totalPages}
        </div>

        ${currentPage < totalPages ? `
            <a href="/admin/posts?${buildQuery({ page: currentPage + 1 })}" class="btn btn-outline" style="padding: 0.5rem 0.75rem;">Próxima ›</a>
            <a href="/admin/posts?${buildQuery({ page: totalPages })}" class="btn btn-outline" style="padding: 0.5rem 0.75rem;">»</a>
        ` : ''}
    </nav>
    ` : ''}
    
    <div class="results-count">
        ${total} ${total === 1 ? 'matéria encontrada' : 'matérias encontradas'}
    </div>
  `

  return renderAdminLayout({
    title: 'Matérias',
    user,
    bodyHtml,
    activeTab: 'posts',
    csrfToken
  })
}

function renderCsrfInput(csrfToken: string): string {
  return `<input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">`
}

function renderPostFormPage(params: {
  post?: Post
  categories: any[]
  authors: any[]
  tags: any[]
  user: AdminUser
  csrfToken: string
  cspNonce: string
  error?: string
  message?: string
  defaultAuthorId?: number
  revisions?: PostRevision[]
}): string {
  const { post, categories, authors, tags, user, csrfToken, cspNonce, error, message, defaultAuthorId } = params
  const revisions = params.revisions || []
  const isNew = !post
  const adminIcon = (name: string) => `<span class="admin-icon">${renderAdminIcon(name)}</span>`
  const legacyEditorHtml = post?.content_json
    ? post.content
    : post?.content_markdown
      ? renderMarkdownToHtml(post.content_markdown)
      : post?.content || '<p></p>'
  const errorMessage = error === 'content_conflict'
    ? 'Esta matéria foi alterada em outra aba ou por outro usuário. Recarregue a página antes de continuar.'
    : error === 'revision_restore_failed'
      ? 'Não foi possível restaurar a versão selecionada.'
      : error
  const successMessage = message === 'revision_restored' ? 'Versão restaurada com sucesso.' : message

  const statusBadge = (status?: string) => {
    const palette: Record<string, string> = {
      draft: 'background: var(--bg-main); color: var(--text-muted);',
      review: 'background: rgba(245, 158, 11, 0.1); color: #f59e0b;',
      published: 'background: rgba(16, 185, 129, 0.1); color: #10b981;',
      archived: 'background: rgba(239, 68, 68, 0.1); color: #ef4444;'
    }
    const style = palette[status || 'draft'] || palette.draft
    return `<span style="display: inline-flex; align-items: center; justify-content: center; padding: 0.35rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; ${style}">${status || 'draft'}</span>`
  }

  const formatDateTime = (value?: string | null) => {
    if (!value) return '—'
    try {
      return new Date(value).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      })
    } catch {
      return value
    }
  }

  const publicationPanel = !isNew && post ? `
    <div class="card" style="margin-bottom: 2rem; display: flex; flex-direction: column; gap: 1rem;">
      <div style="display: flex; flex-wrap: wrap; gap: 1rem; align-items: center;">
        <strong style="color: var(--text-muted); font-size: 0.875rem; text-transform: uppercase;">Status:</strong>
        ${statusBadge(post.status)}
        <span style="font-size: 0.875rem; color: var(--text-muted);">Criado em ${formatDateTime(post.created_at)}</span>
      </div>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; font-size: 0.8125rem; color: var(--text-muted); padding: 1rem; background: var(--bg-main); border-radius: var(--radius-md);">
        <div><strong>Publicado:</strong><br>${formatDateTime(post.published_at)}</div>
        <div><strong>Agendado:</strong><br>${formatDateTime(post.scheduled_at)}</div>
        <div><strong>Atualizado:</strong><br>${formatDateTime(post.updated_at)}</div>
      </div>
      <div style="display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; padding-top: 0.5rem;">
        ${post.status !== 'published' ? `
          <form method="post" action="/admin/posts/${post.id}/publish" style="display: inline-flex;">
            ${renderCsrfInput(csrfToken)}
            <button type="submit" class="btn" style="background: #10b981;">
              Publicar agora
            </button>
          </form>
        ` : `
          <span style="color: #10b981; font-weight: 700; display: flex; align-items: center; gap: 0.25rem;">
             ${adminIcon('posts')} Matéria publicada
          </span>
        `}
        <a href="/admin/posts/${post.id}/preview" target="_blank" rel="noopener" class="btn btn-outline">
          ${adminIcon('external')} Visualizar
        </a>
        <form method="post" action="/admin/redacao-ia/pautas/post/${post.id}" style="display: inline-flex;">
          ${renderCsrfInput(csrfToken)}
          <button type="submit" class="btn btn-outline">
            ${adminIcon('ai')} Abrir na Redação IA
          </button>
        </form>
      </div>
    </div>
  ` : ''

  const bodyHtml = `
    <div style="margin-bottom: 2rem;">
      <a href="/admin/posts" style="color: var(--text-muted); text-decoration: none; font-size: 0.875rem; font-weight: 600; display: flex; align-items: center; gap: 0.25rem;">
        ← Voltar para a lista
      </a>
      <h1 class="section-title" style="margin-top: 0.5rem;">${isNew ? 'Criar nova matéria' : 'Editar matéria'}</h1>
    </div>
    
    ${errorMessage ? `
      <div class="error" style="margin-bottom: 1rem;">
        ${escapeHtml(errorMessage)}
      </div>
    ` : ''}
    ${successMessage ? `<div class="admin-flash admin-flash--success">${escapeHtml(successMessage)}</div>` : ''}
    
    ${publicationPanel}
    
    <form id="postEditorForm" method="post" action="${isNew ? '/admin/posts' : `/admin/posts/${post.id}`}" class="post-editor-form">
      ${renderCsrfInput(csrfToken)}
      <div class="post-editor-commandbar">
        <div>
          <span class="post-editor-commandbar__label">${isNew ? 'Novo rascunho' : `Matéria #${post.id}`}</span>
          <span class="post-editor-commandbar__state" id="postEditorCommandState">${isNew ? 'Não salva' : `Atualizada ${formatDateTime(post.updated_at)}`}</span>
        </div>
        <div class="post-editor-commandbar__actions">
          ${!isNew ? `<a href="/admin/posts/${post.id}/preview" target="_blank" rel="noopener" class="btn btn-outline">${adminIcon('external')} Prévia</a>` : ''}
          <button type="submit" class="btn">${isNew ? 'Criar rascunho' : 'Salvar matéria'}</button>
        </div>
      </div>

      <div class="post-editor-grid">
        <div class="post-editor-main">
      
      <!-- Chapéu -->
      <div class="form-group">
        <label>Chapéu (Antetítulo)</label>
        <input 
          type="text" 
          name="hat" 
          class="form-control"
          value="${escapeHtml(post?.hat || '')}"
          maxlength="60"
          placeholder="Ex: URGENTE, ESPORTES, ECONOMIA"
          style="text-transform: uppercase; font-weight: 800; letter-spacing: 0.1em; color: var(--primary);"
        >
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem; font-weight: 500;">
          Texto curto que aparece acima do título principal.
        </div>
      </div>
      
      <!-- Título -->
      <div class="form-group">
        <label>Título Principal *</label>
        <input 
          type="text" 
          name="title" 
          class="form-control"
          value="${escapeHtml(post?.title || '')}"
          required
          placeholder="Escreva um título chamativo..."
          style="font-size: 1.5rem; font-weight: 800; letter-spacing: -0.02em;"
        >
      </div>
      
      <!-- Slug -->
      <div class="form-group">
        <label>Slug (URL amigável)</label>
        <input 
          type="text" 
          name="slug" 
          class="form-control"
          value="${escapeHtml(post?.slug || '')}"
          placeholder="exemplo-de-url-amigavel"
          style="font-family: 'JetBrains Mono', monospace; font-size: 0.8125rem; background: #f8fafc;"
        >
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem; font-weight: 500;">
          Deixe em branco para gerar automaticamente a partir do título.
        </div>
      </div>
      
      <!-- Excerpt -->
      <div class="form-group">
        <label>Linha de Apoio (Resumo)</label>
        <textarea 
          name="excerpt" 
          class="form-control"
          rows="3"
          placeholder="Breve resumo que aparece na listagem e abaixo do título..."
        >${escapeHtml(post?.excerpt || '')}</textarea>
      </div>
      
      <!-- Editor visual estruturado -->
      <div class="form-group post-editor-content-field">
        ${renderVisualEditor({
          contentJson: post?.content_json,
          legacyHtml: legacyEditorHtml,
          postId: post?.id,
          contentVersion: post?.content_version || 1,
          csrfToken
        })}
      </div>

        </div>
        <aside class="post-editor-sidebar" aria-label="Configurações da matéria">
          <div class="post-editor-sidebar__heading"><span>Configurações</span><small>Publicação e distribuição</small></div>
          ${!isNew ? `
            <details class="post-editor-revisions">
              <summary><span>Histórico de versões</span><small>${revisions.length ? `${revisions.length} versões recentes` : 'Ainda sem versões manuais'}</small></summary>
              <div class="post-editor-revisions__list">
                ${revisions.length ? revisions.map(revision => `
                  <article>
                    <div><strong>Versão ${revision.content_version}</strong><small>${escapeHtml(formatDateTime(revision.created_at))} · ${escapeHtml(revision.changed_by_name || 'Equipe editorial')}</small></div>
                    <button
                      type="submit"
                      formaction="/admin/posts/${post.id}/revisions/${revision.id}/restore"
                      formmethod="post"
                      formnovalidate
                      data-confirm-revision
                    >Restaurar</button>
                  </article>
                `).join('') : '<p>A primeira versão será registrada ao salvar alterações.</p>'}
              </div>
            </details>
          ` : ''}

      <section class="post-opinion-panel" aria-labelledby="opinionFormatTitle">
        <div class="post-opinion-panel__intro">
          <span class="post-opinion-panel__kicker">Identidade editorial</span>
          <strong id="opinionFormatTitle">Formato da publicação</strong>
          <p>Define a apresentação da matéria e sua presença na página de Opinião.</p>
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label for="opinionType">Formato editorial</label>
          <select name="opinion_type" id="opinionType" class="form-control">
            <option value="news" ${(post?.opinion_type || 'news') === 'news' ? 'selected' : ''}>Notícia ou reportagem</option>
            <option value="editorial" ${post?.opinion_type === 'editorial' ? 'selected' : ''}>Editorial do Jornal</option>
            <option value="article" ${post?.opinion_type === 'article' ? 'selected' : ''}>Artigo de opinião</option>
            <option value="column" ${post?.opinion_type === 'column' ? 'selected' : ''}>Coluna</option>
          </select>
          <p class="post-opinion-panel__hint" id="opinionFormatHint"></p>
        </div>
        <label class="post-opinion-panel__featured" id="opinionFeaturedControl">
          <input type="checkbox" name="opinion_featured" value="1" ${post?.opinion_featured ? 'checked' : ''}>
          <span><strong>Destacar em Opinião</strong><small>Coloca esta publicação na abertura editorial da página.</small></span>
        </label>
      </section>
      <script nonce="${cspNonce}">
        (() => {
          const select = document.getElementById('opinionType');
          const hint = document.getElementById('opinionFormatHint');
          const featured = document.getElementById('opinionFeaturedControl');
          const descriptions = {
            news: 'Conteúdo informativo. Não será exibido como opinião.',
            editorial: 'Posicionamento institucional do Diário do Povo, sem autoria pessoal em destaque.',
            article: 'Contribuição pontual assinada por articulista ou especialista.',
            column: 'Publicação recorrente ligada à página de um colunista.'
          };
          const refresh = () => {
            const isOpinion = select.value !== 'news';
            hint.textContent = descriptions[select.value] || '';
            featured.hidden = !isOpinion;
            if (!isOpinion) featured.querySelector('input').checked = false;
          };
          select.addEventListener('change', refresh);
          refresh();
        })();
      </script>
      
      <!-- Categoria + Autor -->
      <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 2rem;">
        <div class="form-group" style="margin-bottom: 0;">
          <label>Categoria *</label>
          <select name="category_id" class="form-control" required>
            <option value="">Selecione...</option>
            ${categories.map(cat => `
              <option value="${cat.id}" ${post?.category_id === cat.id ? 'selected' : ''}>
                ${escapeHtml(cat.name)}
              </option>
            `).join('')}
          </select>
        </div>
        
        <div class="form-group" style="margin-bottom: 0;">
          <label>Autor *</label>
          <select name="author_id" class="form-control" required>
            ${authors.length === 0 ? `
              <option value="">Nenhum autor disponível</option>
            ` : `
              <option value="">Selecione...</option>
              ${authors.map(author => {
    const isSelected = post
      ? post.author_id === author.id
      : defaultAuthorId === author.id
    return `
                  <option value="${author.id}" ${isSelected ? 'selected' : ''}>
                    ${escapeHtml(author.name)}
                  </option>
                `
  }).join('')}
            `}
          </select>
          ${authors.length === 0 ? `
            <p style="color: #ef4444; font-size: 0.8125rem; margin-top: 0.5rem; font-weight: 600;">
              ⚠️ Nenhum autor ativo encontrado.
            </p>
          ` : ''}
        </div>
      </div>
      
      <!-- Template + Cover Media -->
      <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 2rem;">
        <div class="form-group" style="margin-bottom: 0;">
          <label>Layout do Post</label>
          <select name="template" class="form-control">
            <option value="article" ${post?.template === 'article' ? 'selected' : ''}>Artigo Padrão</option>
            <option value="liveblog" ${post?.template === 'liveblog' ? 'selected' : ''}>Liveblog (Tempo Real)</option>
            <option value="hub" ${post?.template === 'hub' ? 'selected' : ''}>Hub Editorial</option>
            <option value="story" ${post?.template === 'story' ? 'selected' : ''}>Story</option>
          </select>
          <div id="liveToggle" style="margin-top: 1rem; display: ${post?.template === 'liveblog' ? 'block' : 'none'};">
            <label style="display: flex; align-items: center; gap: 0.75rem; cursor: pointer; color: var(--danger); font-weight: 700;">
              <input 
                type="checkbox" 
                name="is_live" 
                value="1"
                ${post?.is_live ? 'checked' : ''}
                style="width: auto; margin: 0;"
              >
              <span>🔴 AO VIVO (Publicar pulso e habilitar tempo real)</span>
            </label>
          </div>
          <script nonce="${cspNonce}">
            document.querySelector('select[name="template"]').addEventListener('change', function(e) {
              const liveToggle = document.getElementById('liveToggle');
              if (e.target.value === 'liveblog') {
                liveToggle.style.display = 'block';
              } else {
                liveToggle.style.display = 'none';
              }
            });
          </script>
        </div>

        <div class="form-group" style="margin-bottom: 0;">
          <label>Destaque</label>
          <label style="display: flex; align-items: center; gap: 0.75rem; cursor: pointer; margin-top: 0.5rem; background: #f8fafc; padding: 1rem; border: 1.5px solid #e2e8f0; border-radius: 0.625rem; transition: all 0.2s;" onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='#e2e8f0'">
            <input 
              type="checkbox" 
              name="is_headline" 
              value="1"
              ${post?.is_headline ? 'checked' : ''}
              style="width: 1.25rem; height: 1.25rem; accent-color: var(--primary);"
            >
            <span style="font-weight: 700; color: var(--primary); font-size: 0.875rem;">⭐ Fixar como Manchete (Hero)</span>
          </label>
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem; font-weight: 500;">
            Se marcado, este post ocupará o espaço principal da Home.
          </div>
        </div>
        
        <div class="form-group" style="margin-bottom: 0;">
          <label>Imagem de Capa (ID)</label>
          <div style="display: flex; gap: 0.75rem;">
            <input 
              type="number" 
              name="cover_media_id" 
              id="coverMediaInput"
              class="form-control"
              value="${post?.cover_media_id || ''}"
              placeholder="Ex: 123"
              style="flex: 1;"
            >
            <button type="button" class="btn btn-outline" id="openMediaPickerBtn" style="padding: 0 1.25rem;">
              🔍 Galeria
            </button>
          </div>
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem; font-weight: 500;">
            Selecione uma imagem ou digite o ID manualmente.
          </div>
        </div>
      </div>
      
      <!-- Media Picker Modal -->
      <dialog id="mediaPicker" style="padding: 0; border: none; border-radius: 12px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04); width: 100%; max-width: 800px; backdrop-filter: blur(10px); background: rgba(255, 255, 255, 0.95);">
        <div style="padding: 1.5rem; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0; font-size: 1.25rem;">Selecionar Mídia</h3>
          <button type="button" id="closeMediaPickerBtn" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--text-muted);">&times;</button>
        </div>
        <div style="padding: 1.5rem;">
          <div style="display: flex; gap: 1rem; margin-bottom: 1.5rem;">
            <input type="text" id="mediaSearch" placeholder="Buscar por nome..." style="flex: 1; padding: 0.75rem;">
            <button type="button" class="btn" id="doSearchMediaBtn" style="padding: 0 2rem;">Buscar</button>
          </div>
          <div id="mediaResults" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 1rem; max-height: 400px; overflow-y: auto; padding: 0.5rem;">
            <!-- Results here -->
            <p style="color: var(--text-muted); text-align: center; grid-column: 1/-1; padding: 2rem;">Digite e busque para encontrar imagens...</p>
          </div>
        </div>
      </dialog>
      <script nonce="${cspNonce}">
        document.addEventListener('DOMContentLoaded', () => {
          const picker = document.getElementById('mediaPicker');
          const openBtn = document.getElementById('openMediaPickerBtn');
          const closeBtn = document.getElementById('closeMediaPickerBtn');
          const searchBtn = document.getElementById('doSearchMediaBtn');
          const results = document.getElementById('mediaResults');
          const input = document.getElementById('coverMediaInput');
          const searchInput = document.getElementById('mediaSearch');

          if (openBtn) openBtn.addEventListener('click', () => picker.showModal());
          if (closeBtn) closeBtn.addEventListener('click', () => picker.close());
          
          async function doSearch() {
            const query = searchInput.value;
            results.innerHTML = '<p style="text-align: center; grid-column: 1/-1;">Carregando...</p>';
            
            try {
              const res = await fetch(\`/api/admin/media/search?q=\${encodeURIComponent(query)}&limit=20\`);
              const json = await res.json();
              
              if (json.success && json.results.length > 0) {
                results.innerHTML = json.results.map(m => \`
                  <div 
                    data-media-id="\${m.id}"
                    style="cursor: pointer; border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden; transition: all 0.2s;"
                    onmouseover="this.style.transform='scale(1.02)'; this.style.borderColor='var(--accent)'"
                    onmouseout="this.style.transform='scale(1)'; this.style.borderColor='var(--border-color)'"
                  >
                    <div style="aspect-ratio: 16/9; background: #eee; overflow: hidden;">
                       <img src="/i/\${m.r2_key}?w=320&h=180&fit=cover" style="width: 100%; height: 100%; object-fit: cover; pointer-events: none;">
                    </div>
                    <div style="padding: 0.5rem; font-size: 0.75rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none;">
                      \${m.filename}
                    </div>
                  </div>
                \`).join('');
              } else {
                results.innerHTML = '<p style="text-align: center; grid-column: 1/-1;">Nenhuma imagem encontrada.</p>';
              }
            } catch (e) {
              console.error(e);
              results.innerHTML = '<p style="color: red; text-align: center; grid-column: 1/-1;">Erro ao buscar.</p>';
            }
          }

          if (searchBtn) searchBtn.addEventListener('click', doSearch);
          
          if (searchInput) {
            searchInput.addEventListener('keydown', (e) => {
              if (e.key === 'Enter') {
                e.preventDefault(); 
                doSearch();
              }
            });
          }

          // Delegation
          if (results) {
            results.addEventListener('click', (e) => {
              const card = e.target.closest('[data-media-id]');
              if (card) {
                input.value = card.dataset.mediaId;
                picker.close();
              }
            });
          }
        });
      </script>
      
      <!-- Tags -->
      <div class="form-group">
        <label>Tags (Palavras-chave)</label>
        <div style="display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 0.75rem; background: #f8fafc; padding: 1.5rem; border-radius: 0.75rem; border: 1.5px solid #e2e8f0; box-shadow: inset 0 2px 4px 0 rgba(0,0,0,0.02);">
          ${tags.length === 0 ? '<span style="color: var(--text-muted); font-size: 0.8125rem;">Nenhuma tag cadastrada.</span>' : tags.map(tag => `
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; background: var(--white); padding: 0.5rem 1rem; border-radius: 0.5rem; border: 1.5px solid #e2e8f0; font-size: 0.8125rem; font-weight: 600; transition: all 0.2s;" onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='#e2e8f0'">
              <input 
                type="checkbox" 
                name="tags" 
                value="${tag.id}"
                ${post?.tags?.includes(tag.name) ? 'checked' : ''}
                style="width: 1rem; height: 1rem; accent-color: var(--primary);"
              >
              ${escapeHtml(tag.name)}
            </label>
          `).join('')}
        </div>
      </div>
      
      ${renderSocialSharingPanel({ post, csrfToken, cspNonce })}

      <!-- SEO -->
      <details style="margin-bottom: 1.5rem; border: 1px solid var(--border-color); border-radius: var(--radius-md); overflow: hidden;">
        <summary style="cursor: pointer; font-weight: 700; padding: 1rem; background: var(--bg-main); font-size: 0.875rem; display: flex; align-items: center; gap: 0.5rem;">
          🔍 SEO & Metadados
        </summary>
        <div style="padding: 2rem; background: var(--white); display: flex; flex-direction: column; gap: 1.5rem;">
          <div class="form-group" style="margin-bottom: 0;">
            <label>Título SEO (Meta Title)</label>
            <input 
              type="text" 
              name="seo_title" 
              class="form-control"
              value="${escapeHtml(post?.seo_title || '')}"
              maxlength="200"
              placeholder="Como aparecerá no Google..."
            >
          </div>
          
          <div class="form-group" style="margin-bottom: 0;">
            <label>Descrição SEO (Meta Description)</label>
            <textarea 
              name="seo_description" 
              class="form-control"
              rows="3"
              maxlength="500"
              placeholder="Breve descrição para motores de busca..."
            >${escapeHtml(post?.seo_description || '')}</textarea>
          </div>
          
          <div class="form-group" style="margin-bottom: 0;">
            <label>URL Canônica (opcional)</label>
            <input 
              type="url" 
              name="seo_canonical" 
              class="form-control"
              value="${escapeHtml(post?.seo_canonical || '')}"
              placeholder="https://exemplo.com/url-original"
            >
          </div>
          
          <div class="form-group" style="margin-bottom: 0;">
            <label style="display: flex; align-items: center; gap: 0.75rem; cursor: pointer; font-weight: 600; color: var(--text-main);">
              <input 
                type="checkbox" 
                name="seo_noindex" 
                value="1"
                ${post?.seo_noindex ? 'checked' : ''}
                style="width: 1.125rem; height: 1.125rem; accent-color: var(--primary);"
              >
              <span>🚫 Noindex (não indexar nos buscadores)</span>
            </label>
          </div>
        </div>
      </details>
      
      <!-- Paywall -->
      <details style="margin-bottom: 2rem; border: 1px solid var(--border-color); border-radius: var(--radius-md); overflow: hidden;">
        <summary style="cursor: pointer; font-weight: 700; padding: 1rem; background: var(--bg-main); font-size: 0.875rem; display: flex; align-items: center; gap: 0.5rem;">
          🔒 Paywall & Monetização
        </summary>
        <div style="padding: 2rem; background: var(--white); display: flex; flex-direction: column; gap: 1.5rem;">
          <div class="form-group" style="margin-bottom: 0;">
            <label style="display: flex; align-items: center; gap: 0.75rem; cursor: pointer; font-weight: 700; color: var(--primary);">
              <input 
                type="checkbox" 
                name="is_premium" 
                value="1"
                ${post?.is_premium ? 'checked' : ''}
                style="width: 1.25rem; height: 1.25rem; accent-color: var(--primary);"
              >
              <span>⭐ Conteúdo Premium (exclusivo para assinantes)</span>
            </label>
          </div>
          
          <div class="form-group" style="margin-bottom: 0;">
            <label>Nível do Paywall</label>
            <select name="paywall_tier" class="form-control">
              <option value="">Aberto (Gratuito)</option>
              <option value="metered" ${post?.paywall_tier === 'metered' ? 'selected' : ''}>Metered (Gratuito com limite de leitura)</option>
              <option value="hard" ${post?.paywall_tier === 'hard' ? 'selected' : ''}>Hard (Bloqueio Total para não-assinantes)</option>
            </select>
          </div>
          
          <div class="form-group" style="margin-bottom: 0;">
            <label style="display: flex; align-items: center; gap: 0.75rem; cursor: pointer; font-weight: 600; color: var(--text-main);">
              <input 
                type="checkbox" 
                name="metering_exempt" 
                value="1"
                ${post?.metering_exempt ? 'checked' : ''}
                style="width: 1.125rem; height: 1.125rem; accent-color: var(--primary);"
              >
              <span>🔓 Isento de limite (Sempre acessível, mesmo no limite do plano)</span>
            </label>
          </div>
        </div>
      </details>
      
        </aside>
      </div>

      <!-- Actions -->
      <div class="post-editor-actions">
        <button type="submit" class="btn" style="min-width: 160px;">
          ${isNew ? 'Criar Rascunho' : 'Salvar Alterações'}
        </button>
        <a href="/admin/posts" class="btn" style="background: var(--bg-main); color: var(--text-main); border: 1px solid var(--border-color); text-decoration: none;">
          Cancelar
        </a>
        ${!isNew ? `
          <button
            type="submit"
            form="deletePostForm"
            class="btn"
            style="background: #ef4444; border: none; margin-left: auto;"
            onclick="return confirm('Tem certeza que deseja excluir este post permanentemente?')"
          >
            Excluir matéria
          </button>
        ` : ''}
      </div>
      
    </form>
    ${!isNew ? `
      <form id="deletePostForm" method="post" action="/admin/posts/${post.id}/delete" style="display: none;">
        ${renderCsrfInput(csrfToken)}
      </form>
    ` : ''}
  `

  return renderAdminLayout({
    title: isNew ? 'Nova matéria' : `Editar: ${post.title}`,
    user,
    bodyHtml,
    activeTab: 'posts',
    csrfToken
  })
}

// Export handlers (continuação no próximo arquivo devido ao tamanho)
export { renderPostsListPage, renderPostFormPage, renderCsrfInput }
export { createPostSchema, updatePostSchema, scheduleSchema }
