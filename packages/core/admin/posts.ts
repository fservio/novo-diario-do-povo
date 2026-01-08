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
  title: z.string().min(1, 'Título é obrigatório').max(500),
  slug: z.string().optional(),
  excerpt: z.string().max(1000).optional(),
  content: z.string().min(1, 'Conteúdo é obrigatório'),
  category_id: z.coerce.number().int().positive(),
  author_id: z.coerce.number().int().positive(),
  cover_media_id: z.coerce.number().int().positive().optional(),
  template: z.enum(['article', 'liveblog', 'hub', 'story']).optional().or(z.literal('').transform(() => undefined)),
  seo_title: z.string().max(200).optional(),
  seo_description: z.string().max(500).optional(),
  seo_canonical: z.string().url().optional().or(z.literal('')),
  seo_noindex: z.coerce.number().int().min(0).max(1).optional(),
  is_premium: z.coerce.number().int().min(0).max(1).optional(),
  paywall_tier: z.enum(['free', 'metered', 'hard']).optional().or(z.literal('').transform(() => undefined)),
  metering_exempt: z.coerce.number().int().min(0).max(1).optional(),
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
  filters: PostFilters
  categories: any[]
  authors: any[]
  user: AdminUser
  csrfToken: string
}): string {
  const { posts, total, filters, categories, authors, user, csrfToken } = params
  
  const statusOptions = [
    { value: '', label: 'Todos os status' },
    { value: 'draft', label: 'Rascunho' },
    { value: 'review', label: 'Em revisão' },
    { value: 'published', label: 'Publicado' },
    { value: 'archived', label: 'Arquivado' },
  ]
  
  const premiumOptions = [
    { value: '', label: 'Todos (free + premium)' },
    { value: '0', label: 'Apenas free' },
    { value: '1', label: 'Apenas premium' },
  ]
  
  const bodyHtml = `
    <div style="margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center;">
      <h1 class="section-title" style="margin: 0;">Posts</h1>
      <a href="/admin/posts/new" class="btn">+ Novo Post</a>
    </div>
    
    <!-- Filtros -->
    <form method="get" action="/admin/posts" class="card" style="margin-bottom: 1.5rem;">
      <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
        <div class="field">
          <label>Status</label>
          <select name="status" onchange="this.form.submit()" style="width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem;">
            ${statusOptions.map(opt => `
              <option value="${opt.value}" ${filters.status === opt.value ? 'selected' : ''}>
                ${opt.label}
              </option>
            `).join('')}
          </select>
        </div>
        
        <div class="field">
          <label>Categoria</label>
          <select name="category_id" onchange="this.form.submit()" style="width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem;">
            <option value="">Todas</option>
            ${categories.map(cat => `
              <option value="${cat.id}" ${filters.category_id === cat.id ? 'selected' : ''}>
                ${escapeHtml(cat.name)}
              </option>
            `).join('')}
          </select>
        </div>
        
        <div class="field">
          <label>Premium</label>
          <select name="is_premium" onchange="this.form.submit()" style="width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem;">
            ${premiumOptions.map(opt => `
              <option value="${opt.value}" ${String(filters.is_premium) === opt.value ? 'selected' : ''}>
                ${opt.label}
              </option>
            `).join('')}
          </select>
        </div>
        
        <div class="field">
          <label>Busca</label>
          <input 
            type="text" 
            name="search" 
            value="${escapeHtml(filters.search || '')}"
            placeholder="Título, conteúdo..."
            style="width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem;"
          >
        </div>
      </div>
      
      <div style="margin-top: 1rem;">
        <button type="submit" class="btn" style="margin-right: 0.5rem;">Filtrar</button>
        <a href="/admin/posts" style="color: #6b7280; text-decoration: none;">Limpar filtros</a>
      </div>
    </form>
    
    <!-- Lista de Posts -->
    <div style="background: white; border: 1px solid #e5e7eb; border-radius: 0.5rem; overflow: hidden;">
      <table style="width: 100%; border-collapse: collapse;">
        <thead style="background: #f9fafb; border-bottom: 1px solid #e5e7eb;">
          <tr>
            <th style="padding: 0.75rem; text-align: left; font-weight: 600; font-size: 0.875rem;">Título</th>
            <th style="padding: 0.75rem; text-align: left; font-weight: 600; font-size: 0.875rem;">Categoria</th>
            <th style="padding: 0.75rem; text-align: left; font-weight: 600; font-size: 0.875rem;">Autor</th>
            <th style="padding: 0.75rem; text-align: left; font-weight: 600; font-size: 0.875rem;">Status</th>
            <th style="padding: 0.75rem; text-align: left; font-weight: 600; font-size: 0.875rem;">Premium</th>
            <th style="padding: 0.75rem; text-align: left; font-weight: 600; font-size: 0.875rem;">Data</th>
            <th style="padding: 0.75rem; text-align: left; font-weight: 600; font-size: 0.875rem;">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${posts.length === 0 ? `
            <tr>
              <td colspan="7" style="padding: 2rem; text-align: center; color: #6b7280;">
                Nenhum post encontrado
              </td>
            </tr>
          ` : posts.map(post => `
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 0.75rem;">
                <a href="/admin/posts/${post.id}" style="color: #2563eb; text-decoration: none; font-weight: 500;">
                  ${escapeHtml(post.title)}
                </a>
              </td>
              <td style="padding: 0.75rem; font-size: 0.875rem;">
                ${escapeHtml(post.category_name || '-')}
              </td>
              <td style="padding: 0.75rem; font-size: 0.875rem;">
                ${escapeHtml(post.author_name || '-')}
              </td>
              <td style="padding: 0.75rem;">
                <span style="padding: 0.25rem 0.5rem; border-radius: 0.25rem; font-size: 0.75rem; font-weight: 500; 
                  ${post.status === 'published' ? 'background: #d1fae5; color: #065f46;' : ''}
                  ${post.status === 'draft' ? 'background: #f3f4f6; color: #374151;' : ''}
                  ${post.status === 'review' ? 'background: #fef3c7; color: #92400e;' : ''}
                  ${post.status === 'archived' ? 'background: #fee2e2; color: #991b1b;' : ''}
                ">
                  ${post.status}
                </span>
              </td>
              <td style="padding: 0.75rem; font-size: 0.875rem;">
                ${post.is_premium ? '🔒 Premium' : '🆓 Free'}
              </td>
              <td style="padding: 0.75rem; font-size: 0.875rem; color: #6b7280;">
                ${post.published_at ? new Date(post.published_at).toLocaleDateString('pt-BR') : '-'}
              </td>
              <td style="padding: 0.75rem;">
                <a href="/admin/posts/${post.id}" style="color: #2563eb; margin-right: 0.5rem; text-decoration: none; font-size: 0.875rem;">
                  Editar
                </a>
                <a href="/admin/posts/${post.id}/preview" target="_blank" style="color: #6b7280; text-decoration: none; font-size: 0.875rem;">
                  Preview
                </a>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      
      ${total > (filters.limit || 20) ? `
        <div style="padding: 1rem; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center;">
          <div style="font-size: 0.875rem; color: #6b7280;">
            Mostrando ${(filters.offset || 0) + 1} - ${Math.min((filters.offset || 0) + (filters.limit || 20), total)} de ${total} posts
          </div>
          <div>
            ${(filters.offset || 0) > 0 ? `
              <a href="/admin/posts?offset=${Math.max(0, (filters.offset || 0) - (filters.limit || 20))}&limit=${filters.limit || 20}" 
                 class="btn" style="margin-right: 0.5rem;">
                ← Anterior
              </a>
            ` : ''}
            ${(filters.offset || 0) + (filters.limit || 20) < total ? `
              <a href="/admin/posts?offset=${(filters.offset || 0) + (filters.limit || 20)}&limit=${filters.limit || 20}" 
                 class="btn">
                Próxima →
              </a>
            ` : ''}
          </div>
        </div>
      ` : ''}
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
  
  const bodyHtml = `
    <div style="margin-bottom: 1.5rem;">
      <a href="/admin/posts" style="color: #6b7280; text-decoration: none; font-size: 0.875rem;">
        ← Voltar para posts
      </a>
      <h1 class="section-title">${isNew ? 'Novo Post' : 'Editar Post'}</h1>
    </div>
    
    ${error ? `
      <div class="error" style="margin-bottom: 1rem;">
        ${escapeHtml(error)}
      </div>
    ` : ''}
    
    <form method="post" action="${isNew ? '/admin/posts' : `/admin/posts/${post.id}`}" class="card">
      ${renderCsrfInput(csrfToken)}
      
      <!-- Título -->
      <div class="field" style="margin-bottom: 1rem;">
        <label style="font-weight: 600;">Título *</label>
        <input 
          type="text" 
          name="title" 
          value="${escapeHtml(post?.title || '')}"
          required
          style="width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 0.375rem; font-size: 1.125rem;"
        >
      </div>
      
      <!-- Slug -->
      <div class="field" style="margin-bottom: 1rem;">
        <label style="font-weight: 600;">Slug (deixe vazio para gerar automaticamente)</label>
        <input 
          type="text" 
          name="slug" 
          value="${escapeHtml(post?.slug || '')}"
          style="width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem; font-family: monospace; font-size: 0.875rem;"
        >
      </div>
      
      <!-- Excerpt -->
      <div class="field" style="margin-bottom: 1rem;">
        <label style="font-weight: 600;">Resumo</label>
        <textarea 
          name="excerpt" 
          rows="3"
          style="width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem;"
        >${escapeHtml(post?.excerpt || '')}</textarea>
      </div>
      
      <!-- Content Editor (Markdown) -->
      <div class="field" style="margin-bottom: 1rem;">
        <label style="font-weight: 600;">Conteúdo *</label>
        ${renderMarkdownEditor({
          name: 'content',
          value: post?.content_markdown || post?.content || '',
          nonce: cspNonce,
          id: 'mdEditor'
        })}
        <div style="font-size: 0.75rem; color: #6b7280; margin-top: 0.25rem;">
          Use Markdown. Toolbar insere formatação automaticamente. Clique em 🖼️ para inserir imagens.
        </div>
      </div>
      
      <!-- Categoria + Autor -->
      <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
        <div class="field">
          <label style="font-weight: 600;">Categoria *</label>
          <select name="category_id" required style="width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem;">
            <option value="">Selecione...</option>
            ${categories.map(cat => `
              <option value="${cat.id}" ${post?.category_id === cat.id ? 'selected' : ''}>
                ${escapeHtml(cat.name)}
              </option>
            `).join('')}
          </select>
        </div>
        
        <div class="field">
          <label style="font-weight: 600;">Autor *</label>
          <select name="author_id" required style="width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem;">
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
            <p style="color: #ef4444; font-size: 0.875rem; margin-top: 0.25rem;">
              ⚠️ Nenhum autor ativo encontrado. Entre em contato com o administrador.
            </p>
          ` : ''}
        </div>
      </div>
      
      <!-- Template + Cover Media -->
      <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
        <div class="field">
          <label style="font-weight: 600;">Template</label>
          <select name="template" style="width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem;">
            <option value="article" ${post?.template === 'article' ? 'selected' : ''}>Article (padrão)</option>
            <option value="liveblog" ${post?.template === 'liveblog' ? 'selected' : ''}>Liveblog</option>
            <option value="hub" ${post?.template === 'hub' ? 'selected' : ''}>Hub Editorial</option>
            <option value="story" ${post?.template === 'story' ? 'selected' : ''}>Story</option>
          </select>
        </div>
        
        <div class="field">
          <label style="font-weight: 600;">Cover Media ID (opcional)</label>
          <input 
            type="number" 
            name="cover_media_id" 
            value="${post?.cover_media_id || ''}"
            style="width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem;"
          >
          <div style="font-size: 0.75rem; color: #6b7280; margin-top: 0.25rem;">
            Use /admin/media para upload e copie o ID
          </div>
        </div>
      </div>
      
      <!-- Tags -->
      <div class="field" style="margin-bottom: 1rem;">
        <label style="font-weight: 600;">Tags</label>
        <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
          ${tags.map(tag => `
            <label style="display: flex; align-items: center; padding: 0.25rem 0.5rem; background: #f3f4f6; border-radius: 0.25rem; font-size: 0.875rem;">
              <input 
                type="checkbox" 
                name="tags" 
                value="${tag.id}"
                ${post?.tags?.includes(tag.name) ? 'checked' : ''}
                style="margin-right: 0.25rem;"
              >
              ${escapeHtml(tag.name)}
            </label>
          `).join('')}
        </div>
      </div>
      
      <!-- SEO -->
      <details style="margin-bottom: 1rem;">
        <summary style="cursor: pointer; font-weight: 600; padding: 0.5rem; background: #f9fafb; border-radius: 0.375rem;">
          SEO & Metadados
        </summary>
        <div style="margin-top: 1rem; padding: 1rem; border: 1px solid #e5e7eb; border-radius: 0.375rem;">
          <div class="field" style="margin-bottom: 1rem;">
            <label>SEO Title</label>
            <input 
              type="text" 
              name="seo_title" 
              value="${escapeHtml(post?.seo_title || '')}"
              maxlength="200"
              style="width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem;"
            >
          </div>
          
          <div class="field" style="margin-bottom: 1rem;">
            <label>SEO Description</label>
            <textarea 
              name="seo_description" 
              rows="3"
              maxlength="500"
              style="width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem;"
            >${escapeHtml(post?.seo_description || '')}</textarea>
          </div>
          
          <div class="field" style="margin-bottom: 1rem;">
            <label>Canonical URL</label>
            <input 
              type="url" 
              name="seo_canonical" 
              value="${escapeHtml(post?.seo_canonical || '')}"
              style="width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem;"
            >
          </div>
          
          <div class="field">
            <label style="display: flex; align-items: center;">
              <input 
                type="checkbox" 
                name="seo_noindex" 
                value="1"
                ${post?.seo_noindex ? 'checked' : ''}
                style="margin-right: 0.5rem;"
              >
              Noindex (não indexar nos buscadores)
            </label>
          </div>
        </div>
      </details>
      
      <!-- Paywall -->
      <details style="margin-bottom: 1rem;">
        <summary style="cursor: pointer; font-weight: 600; padding: 0.5rem; background: #f9fafb; border-radius: 0.375rem;">
          Paywall & Premium
        </summary>
        <div style="margin-top: 1rem; padding: 1rem; border: 1px solid #e5e7eb; border-radius: 0.375rem;">
          <div class="field" style="margin-bottom: 1rem;">
            <label style="display: flex; align-items: center;">
              <input 
                type="checkbox" 
                name="is_premium" 
                value="1"
                ${post?.is_premium ? 'checked' : ''}
                style="margin-right: 0.5rem;"
              >
              🔒 Este post é premium (requer assinatura)
            </label>
          </div>
          
          <div class="field" style="margin-bottom: 1rem;">
            <label>Paywall Tier</label>
            <select name="paywall_tier" style="width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem;">
              <option value="">Nenhum (free)</option>
              <option value="metered" ${post?.paywall_tier === 'metered' ? 'selected' : ''}>Metered (limite de leitura)</option>
              <option value="hard" ${post?.paywall_tier === 'hard' ? 'selected' : ''}>Hard (bloqueio total)</option>
            </select>
          </div>
          
          <div class="field">
            <label style="display: flex; align-items: center;">
              <input 
                type="checkbox" 
                name="metering_exempt" 
                value="1"
                ${post?.metering_exempt ? 'checked' : ''}
                style="margin-right: 0.5rem;"
              >
              Isento de metering (sempre acessível)
            </label>
          </div>
        </div>
      </details>
      
      <!-- Actions -->
      <div style="display: flex; gap: 0.5rem; padding-top: 1rem; border-top: 1px solid #e5e7eb;">
        <button type="submit" class="btn">
          ${isNew ? 'Criar Rascunho' : 'Salvar Alterações'}
        </button>
        <a href="/admin/posts" class="btn" style="background: #6b7280; text-decoration: none;">
          Cancelar
        </a>
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
