/**
 * Admin Posts Module
 * SSR UI + Handlers para CRUD de posts
 */

import type { Context } from 'hono'
import type { Env, AppContext } from '../types'
import { escapeHtml, renderAdminLayout, type AdminUser } from './ui'
import { renderMarkdownEditor } from './editor'
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
  type PostFilters
} from '../db/posts'

// ============================================================================
// Validation Schemas
// ============================================================================

const createPostSchema = z.object({
  hat: z.string()
    .max(60, 'Chapéu deve ter no máximo 60 caracteres')
    .transform(val => val.trim().toUpperCase())
    .optional(),
  title: z.string().min(1, 'Título é obrigatório').max(500),
  slug: z.string().optional(),
  excerpt: z.string().max(1000).optional(),
  content: z.string().min(1, 'Conteúdo é obrigatório'),
  category_id: z.coerce.number().int().positive(),
  author_id: z.coerce.number().int().positive(),
  cover_media_id: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
  template: z.enum(['article', 'liveblog', 'hub', 'story']).optional().or(z.literal('').transform((): string | undefined => undefined)),
  seo_title: z.string().max(200).optional(),
  seo_description: z.string().max(500).optional(),
  seo_canonical: z.string().url().optional().or(z.literal('')),
  seo_noindex: z.coerce.number().int().min(0).max(1).optional(),
  is_premium: z.coerce.number().int().min(0).max(1).optional(),
  paywall_tier: z.enum(['free', 'metered', 'hard']).optional().or(z.literal('').transform((): string | undefined => undefined)),
  metering_exempt: z.coerce.number().int().min(0).max(1).optional(),
  is_live: z.coerce.number().int().min(0).max(1).optional(),
  is_headline: z.coerce.number().int().min(0).max(1).optional(),
  tags: z.array(z.coerce.number().int().positive()).optional(),
})

const updatePostSchema = createPostSchema.partial()

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

  const buildQuery = (newFilters: any) => {
    const q = new URLSearchParams()
    const all = { ...filters, ...newFilters }
    Object.entries(all).forEach(([k, v]) => {
      if (v !== undefined && v !== '' && v !== null) q.set(k, String(v))
    })
    return q.toString()
  }

  const bodyHtml = `
    <div style="margin-bottom: 2rem; display: flex; justify-content: space-between; align-items: center;">
      <div>
         <h1 class="section-title" style="margin: 0;">Matérias</h1>
         <p style="color: var(--text-muted); font-size: 0.875rem;">Gerencie as publicações do jornal</p>
      </div>
      <a href="/admin/posts/new" class="btn"><span>+</span> Nova Matéria</a>
    </div>
    
    <!-- Filtros Superiores -->
    <div class="card" style="margin-bottom: 2rem; padding: 1.5rem;">
      <form method="get" action="/admin/posts" id="filterForm">
        <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem;">
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
            <label>Categoria</label>
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
        <div style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid var(--border); display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;">
            <span style="font-size: 0.875rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">📅 Calendário:</span>
            
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

            <button type="submit" class="btn" style="margin-left: auto;">Aplicar Filtros</button>
            <a href="/admin/posts" class="btn btn-outline">Limpar</a>
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
              <td colspan="6" style="padding: 4rem; text-align: center; color: var(--text-muted);">
                <div style="font-size: 2rem; margin-bottom: 1rem;">🔍</div>
                Nenhuma matéria encontrada com estes filtros.
              </td>
            </tr>
          ` : posts.map(post => `
            <tr>
              <td>
                <div style="display: flex; flex-direction: column;">
                    ${post.hat ? `<span style="font-size: 0.65rem; font-weight: 800; color: var(--primary); text-transform: uppercase; margin-bottom: 2px;">${escapeHtml(post.hat)}</span>` : ''}
                    <a href="/admin/posts/${post.id}" style="text-decoration: none; color: var(--text-main); font-weight: 600; font-size: 0.9375rem; line-height: 1.3;">
                      ${escapeHtml(post.title)}
                    </a>
                </div>
              </td>
              <td><span class="badge" style="background: #f1f5f9; color: #475569;">${escapeHtml(post.category_name || 'Geral')}</span></td>
              <td>
                ${post.status === 'published' ? '<span class="badge badge-success">Publicado</span>' :
      post.status === 'draft' ? '<span class="badge" style="background: #e2e8f0; color: #475569;">Rascunho</span>' :
        post.status === 'review' ? '<span class="badge badge-warning">Revisão</span>' :
          '<span class="badge badge-danger">Arquivado</span>'
    }
              </td>
              <td>${post.is_premium ? '💎 <span style="font-size: 0.75rem; font-weight: 600;">Premium</span>' : '✅ <span style="font-size: 0.75rem; font-weight: 600;">Livre</span>'}</td>
              <td style="white-space: nowrap; color: var(--text-muted); font-size: 0.8125rem;">
                ${new Date(post.created_at).toLocaleDateString('pt-BR')}
              </td>
              <td style="text-align: right;">
                <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                  <a href="/admin/posts/${post.id}" class="btn btn-outline" style="padding: 0.35rem 0.75rem; font-size: 0.75rem;">Editar</a>
                  <a href="/admin/posts/${post.id}/preview" target="_blank" class="btn btn-outline" style="padding: 0.35rem 0.5rem; font-size: 0.75rem;" title="Ver Preview">👁️</a>
                  <form method="post" action="/admin/posts/${post.id}/delete" style="display: inline;" onsubmit="return confirm('Tem certeza que deseja excluir esta matéria permanentemente?')">
                    ${renderCsrfInput(csrfToken)}
                    <button type="submit" class="btn" style="padding: 0.35rem 0.75rem; font-size: 0.75rem; background: #fee2e2; color: #dc2626; border: 1px solid #fecaca;">
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
    <div style="margin-top: 2rem; display: flex; justify-content: center; align-items: center; gap: 0.5rem;">
        ${currentPage > 1 ? `
            <a href="/admin/posts?${buildQuery({ page: 1 })}" class="btn btn-outline" style="padding: 0.5rem 0.75rem;">«</a>
            <a href="/admin/posts?${buildQuery({ page: currentPage - 1 })}" class="btn btn-outline" style="padding: 0.5rem 0.75rem;">‹ Anterior</a>
        ` : ''}

        <div style="display: flex; gap: 0.25rem; align-items: center; padding: 0 1rem;">
            <span style="font-weight: 700; color: var(--primary);">Página ${currentPage}</span>
            <span style="color: var(--text-muted);"> de ${totalPages}</span>
        </div>

        ${currentPage < totalPages ? `
            <a href="/admin/posts?${buildQuery({ page: currentPage + 1 })}" class="btn btn-outline" style="padding: 0.5rem 0.75rem;">Próxima ›</a>
            <a href="/admin/posts?${buildQuery({ page: totalPages })}" class="btn btn-outline" style="padding: 0.5rem 0.75rem;">»</a>
        ` : ''}
    </div>
    ` : ''}
    
    <div style="margin-top: 1rem; text-align: center; font-size: 0.75rem; color: var(--text-muted);">
        Total de ${total} matérias encontradas
    </div>
  `

  return renderAdminLayout({
    title: 'Posts',
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
  defaultAuthorId?: number
}): string {
  const { post, categories, authors, tags, user, csrfToken, cspNonce, error, defaultAuthorId } = params
  const isNew = !post

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
             ✅ Post Publicado
          </span>
        `}
        <a href="/admin/posts/${post.id}/preview" target="_blank" class="btn" style="background: var(--bg-card); color: var(--text-main); border: 1px solid var(--border-color);">
          Ver Preview 👁️
        </a>
      </div>
    </div>
  ` : ''

  const bodyHtml = `
    <div style="margin-bottom: 2rem;">
      <a href="/admin/posts" style="color: var(--text-muted); text-decoration: none; font-size: 0.875rem; font-weight: 600; display: flex; align-items: center; gap: 0.25rem;">
        ← Voltar para a lista
      </a>
      <h1 class="section-title" style="margin-top: 0.5rem;">${isNew ? 'Criar Novo Post' : 'Editar Publicação'}</h1>
    </div>
    
    ${error ? `
      <div class="error" style="margin-bottom: 1rem;">
        ${escapeHtml(error)}
      </div>
    ` : ''}
    
    ${publicationPanel}
    
    <form method="post" action="${isNew ? '/admin/posts' : `/admin/posts/${post.id}`}" class="card">
      ${renderCsrfInput(csrfToken)}
      
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
      
      <!-- Content Editor (Markdown) -->
      <div class="form-group">
        <label>Conteúdo da Matéria *</label>
        <div style="border: 1.5px solid #e2e8f0; border-radius: 0.625rem; overflow: hidden; box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);">
        ${renderMarkdownEditor({
    name: 'content',
    value: post?.content_markdown || post?.content || '',
    nonce: cspNonce,
    id: 'mdEditor'
  })}
        </div>
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.75rem; display: flex; align-items: center; gap: 0.5rem; font-weight: 500;">
          <span>💡 <strong>Dica:</strong> Use Markdown para formatar. Clique em 🖼️ para gerenciar mídias.</span>
        </div>
      </div>
      
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
          <script>
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
                       <img src="https://pub-77114170e599427092eb96ac6e46955a.r2.dev/\${m.r2_key}" style="width: 100%; height: 100%; object-fit: cover; pointer-events: none;">
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
      
      <!-- Actions -->
      <div style="display: flex; gap: 1rem; padding-top: 2rem; border-top: 1px solid var(--border-color); margin-top: 1rem;">
        <button type="submit" class="btn" style="min-width: 160px;">
          ${isNew ? 'Criar Rascunho' : 'Salvar Alterações'}
        </button>
        <a href="/admin/posts" class="btn" style="background: var(--bg-main); color: var(--text-main); border: 1px solid var(--border-color); text-decoration: none;">
          Cancelar
        </a>
        ${!isNew ? `
          <form method="post" action="/admin/posts/${post.id}/delete" style="display: inline; margin-left: auto;" onsubmit="return confirm('Tem certeza que deseja excluir este post permanentemente?')">
            ${renderCsrfInput(csrfToken)}
            <button type="submit" class="btn" style="background: #ef4444; border: none;">
              Excluir Post
            </button>
          </form>
        ` : ''}
      </div>
      
    </form>
  `

  return renderAdminLayout({
    title: isNew ? 'Novo Post' : `Editar: ${post.title}`,
    user,
    bodyHtml,
    activeTab: 'posts',
    csrfToken
  })
}

// Export handlers (continuação no próximo arquivo devido ao tamanho)
export { renderPostsListPage, renderPostFormPage, renderCsrfInput }
export { createPostSchema, updatePostSchema, scheduleSchema }
