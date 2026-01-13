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
    <div style="margin-bottom: 2rem; display: flex; justify-content: space-between; align-items: center;">
      <h1 class="section-title" style="margin: 0;">Posts</h1>
      <a href="/admin/posts/new" class="btn"><span>+</span> Novo Post</a>
    </div>
    
    <!-- Filtros -->
    <form method="get" action="/admin/posts" class="card" style="margin-bottom: 2rem;">
      <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem;">
        <div class="field" style="margin-bottom: 0;">
          <label>Status</label>
          <select name="status" onchange="this.form.submit()">
            ${statusOptions.map(opt => `
              <option value="${opt.value}" ${filters.status === opt.value ? 'selected' : ''}>
                ${opt.label}
              </option>
            `).join('')}
          </select>
        </div>
        
        <div class="field" style="margin-bottom: 0;">
          <label>Categoria</label>
          <select name="category_id" onchange="this.form.submit()">
            <option value="">Todas</option>
            ${categories.map(cat => `
              <option value="${cat.id}" ${filters.category_id === cat.id ? 'selected' : ''}>
                ${escapeHtml(cat.name)}
              </option>
            `).join('')}
          </select>
        </div>
        
        <div class="field" style="margin-bottom: 0;">
          <label>Premium</label>
          <select name="is_premium" onchange="this.form.submit()">
            ${premiumOptions.map(opt => `
              <option value="${opt.value}" ${String(filters.is_premium) === opt.value ? 'selected' : ''}>
                ${opt.label}
              </option>
            `).join('')}
          </select>
        </div>
        
        <div class="field" style="margin-bottom: 0;">
          <label>Busca</label>
          <input 
            type="text" 
            name="search" 
            value="${escapeHtml(filters.search || '')}"
            placeholder="Título, conteúdo..."
          >
        </div>
      </div>
      
      <div style="margin-top: 1.5rem; display: flex; align-items: center; gap: 1rem;">
        <button type="submit" class="btn">Filtrar</button>
        <a href="/admin/posts" style="color: var(--text-muted); text-decoration: none; font-size: 0.875rem; font-weight: 500;">Limpar filtros</a>
      </div>
    </form>
    
    <!-- Lista de Posts -->
    <div class="card" style="padding: 0; overflow: hidden;">
      <table>
        <thead>
          <tr>
            <th>Título</th>
            <th>Categoria</th>
            <th>Autor</th>
            <th>Status</th>
            <th>Premium</th>
            <th>Data</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${posts.length === 0 ? `
            <tr>
              <td colspan="7" style="padding: 3rem; text-align: center; color: var(--text-muted);">
                Nenhum post encontrado
              </td>
            </tr>
          ` : posts.map(post => `
            <tr>
              <td>
                ${post.hat ? `
                  <div style="font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); font-weight: 700; margin-bottom: 0.25rem;">
                    ${escapeHtml(post.hat)}
                  </div>
                ` : ''}
                <a href="/admin/posts/${post.id}" style="color: var(--accent); text-decoration: none; font-weight: 600;">
                  ${escapeHtml(post.title)}
                </a>
              </td>
              <td style="font-size: 0.875rem; color: var(--text-muted);">
                ${escapeHtml(post.category_name || '-')}
              </td>
              <td style="font-size: 0.875rem; color: var(--text-muted);">
                ${escapeHtml(post.author_name || '-')}
              </td>
              <td>
                <span style="display: inline-flex; align-items: center; justify-content: center; padding: 0.25rem 0.5rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase;
                  ${post.status === 'published' ? 'background: rgba(16, 185, 129, 0.1); color: #10b981;' : ''}
                  ${post.status === 'draft' ? 'background: var(--bg-main); color: var(--text-muted);' : ''}
                  ${post.status === 'review' ? 'background: rgba(245, 158, 11, 0.1); color: #f59e0b;' : ''}
                  ${post.status === 'archived' ? 'background: rgba(239, 68, 68, 0.1); color: #ef4444;' : ''}
                ">
                  ${post.status}
                </span>
              </td>
              <td style="font-size: 0.875rem;">
                ${post.is_premium ? '🔒 <span style="color: var(--text-muted)">Premium</span>' : '🆓 <span style="color: var(--text-muted)">Free</span>'}
              </td>
              <td style="font-size: 0.875rem; color: var(--text-muted);">
                ${post.published_at ? new Date(post.published_at).toLocaleDateString('pt-BR') : '-'}
              </td>
              <td>
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                  <a href="/admin/posts/${post.id}" class="btn" style="padding: 0.4rem 0.8rem; font-size: 0.75rem; background: var(--bg-main); color: var(--text-main); border: 1px solid var(--border-color);">
                    Editar
                  </a>
                  <a href="/admin/posts/${post.id}/preview" target="_blank" title="Preview" style="color: var(--text-muted); font-size: 1.1rem;">👁️</a>
                  ${post.status !== 'published' ? `
                    <form method="post" action="/admin/posts/${post.id}/publish" style="display: inline;">
                      ${renderCsrfInput(csrfToken)}
                      <button type="submit" class="btn" style="padding: 0.4rem 0.8rem; font-size: 0.75rem; background: #10b981;">
                        Publicar
                      </button>
                    </form>
                  ` : ''}
                  <form method="post" action="/admin/posts/${post.id}/delete" style="display: inline;" onsubmit="return confirm('Tem certeza que deseja excluir este post permanentemente?')">
                    ${renderCsrfInput(csrfToken)}
                    <button type="submit" class="btn" style="padding: 0.4rem 0.8rem; font-size: 0.75rem; background: #ef4444;">
                      Excluir
                    </button>
                  </form>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      
      ${total > (filters.limit || 20) ? `
        <div style="padding: 1.25rem; border-top: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; background: var(--bg-card);">
          <div style="font-size: 0.875rem; color: var(--text-muted); font-weight: 500;">
            Mostrando ${(filters.offset || 0) + 1} - ${Math.min((filters.offset || 0) + (filters.limit || 20), total)} de ${total} posts
          </div>
          <div style="display: flex; gap: 0.5rem;">
            ${(filters.offset || 0) > 0 ? `
              <a href="/admin/posts?offset=${Math.max(0, (filters.offset || 0) - (filters.limit || 20))}&limit=${filters.limit || 20}" 
                 class="btn" style="background: var(--bg-main); color: var(--text-main); border: 1px solid var(--border-color);">
                ← Anterior
              </a>
            ` : ''}
            ${(filters.offset || 0) + (filters.limit || 20) < total ? `
              <a href="/admin/posts?offset=${(filters.offset || 0) + (filters.limit || 20)}&limit=${filters.limit || 20}" 
                 class="btn" style="background: var(--bg-main); color: var(--text-main); border: 1px solid var(--border-color);">
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
      <div class="field">
        <label>Chapéu (Antetítulo)</label>
        <input 
          type="text" 
          name="hat" 
          value="${escapeHtml(post?.hat || '')}"
          maxlength="60"
          placeholder="Ex: URGENTE, ESPORTES, ECONOMIA"
          style="text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em;"
        >
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;">
          Texto curto que aparece acima do título principal.
        </div>
      </div>
      
      <!-- Título -->
      <div class="field">
        <label>Título Principal *</label>
        <input 
          type="text" 
          name="title" 
          value="${escapeHtml(post?.title || '')}"
          required
          placeholder="Escreva um título chamativo..."
          style="font-size: 1.25rem; font-weight: 700;"
        >
      </div>
      
      <!-- Slug -->
      <div class="field">
        <label>Slug (URL amigável)</label>
        <input 
          type="text" 
          name="slug" 
          value="${escapeHtml(post?.slug || '')}"
          placeholder="exemplo-de-url-amigavel"
          style="font-family: monospace; font-size: 0.8125rem;"
        >
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;">
          Deixe em branco para gerar automaticamente a partir do título.
        </div>
      </div>
      
      <!-- Excerpt -->
      <div class="field">
        <label>Linha de Apoio (Resumo)</label>
        <textarea 
          name="excerpt" 
          rows="3"
          placeholder="Breve resumo que aparece na listagem e abaixo do título..."
        >${escapeHtml(post?.excerpt || '')}</textarea>
      </div>
      
      <!-- Content Editor (Markdown) -->
      <div class="field">
        <label>Conteúdo da Matéria *</label>
        ${renderMarkdownEditor({
    name: 'content',
    value: post?.content_markdown || post?.content || '',
    nonce: cspNonce,
    id: 'mdEditor'
  })}
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.75rem; display: flex; align-items: center; gap: 0.5rem;">
          <span>💡 <strong>Dica:</strong> Use Markdown para formatar. Clique em 🖼️ para gerenciar mídias.</span>
        </div>
      </div>
      
      <!-- Categoria + Autor -->
      <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 1.5rem;">
        <div class="field" style="margin-bottom: 0;">
          <label>Categoria *</label>
          <select name="category_id" required>
            <option value="">Selecione...</option>
            ${categories.map(cat => `
              <option value="${cat.id}" ${post?.category_id === cat.id ? 'selected' : ''}>
                ${escapeHtml(cat.name)}
              </option>
            `).join('')}
          </select>
        </div>
        
        <div class="field" style="margin-bottom: 0;">
          <label>Autor *</label>
          <select name="author_id" required>
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
      <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 1.5rem;">
        <div class="field" style="margin-bottom: 0;">
          <label>Layout do Post</label>
          <select name="template">
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
        
        <div class="field" style="margin-bottom: 0;">
          <label>ID da Imagem de Capa</label>
          <div style="display: flex; gap: 0.5rem;">
            <input 
              type="number" 
              name="cover_media_id" 
              id="coverMediaInput"
              value="${post?.cover_media_id || ''}"
              placeholder="Ex: 123"
              style="flex: 1;"
            >
            <button type="button" class="btn" id="openMediaPickerBtn" style="padding: 0 1rem; background: var(--bg-card); color: var(--text-main); border: 1px solid var(--border-color);">
              🔍 Buscar
            </button>
          </div>
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;">
            Selecione uma imagem da galeria ou digite o ID manualmente. Deixe vazio para remover.
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
      <div class="field">
        <label>Tags (Palavras-chave)</label>
        <div style="display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 0.75rem; background: var(--bg-main); padding: 1.25rem; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
          ${tags.length === 0 ? '<span style="color: var(--text-muted); font-size: 0.8125rem;">Nenhuma tag cadastrada.</span>' : tags.map(tag => `
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer; background: var(--bg-card); padding: 0.4rem 0.75rem; border-radius: 6px; border: 1px solid var(--border-color); font-size: 0.8125rem; font-weight: 500; transition: all 0.2s;">
              <input 
                type="checkbox" 
                name="tags" 
                value="${tag.id}"
                ${post?.tags?.includes(tag.name) ? 'checked' : ''}
                style="width: auto; margin: 0;"
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
        <div style="padding: 1.5rem; background: var(--bg-card); display: flex; flex-direction: column; gap: 1.25rem;">
          <div class="field" style="margin-bottom: 0;">
            <label>Título SEO (Meta Title)</label>
            <input 
              type="text" 
              name="seo_title" 
              value="${escapeHtml(post?.seo_title || '')}"
              maxlength="200"
              placeholder="Como aparecerá no Google..."
            >
          </div>
          
          <div class="field" style="margin-bottom: 0;">
            <label>Descrição SEO (Meta Description)</label>
            <textarea 
              name="seo_description" 
              rows="3"
              maxlength="500"
              placeholder="Breve descrição para motores de busca..."
            >${escapeHtml(post?.seo_description || '')}</textarea>
          </div>
          
          <div class="field" style="margin-bottom: 0;">
            <label>URL Canônica (opcional)</label>
            <input 
              type="url" 
              name="seo_canonical" 
              value="${escapeHtml(post?.seo_canonical || '')}"
              placeholder="https://exemplo.com/url-original"
            >
          </div>
          
          <div class="field" style="margin-bottom: 0;">
            <label style="display: flex; align-items: center; gap: 0.75rem; cursor: pointer;">
              <input 
                type="checkbox" 
                name="seo_noindex" 
                value="1"
                ${post?.seo_noindex ? 'checked' : ''}
                style="width: auto; margin: 0;"
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
        <div style="padding: 1.5rem; background: var(--bg-card); display: flex; flex-direction: column; gap: 1.25rem;">
          <div class="field" style="margin-bottom: 0;">
            <label style="display: flex; align-items: center; gap: 0.75rem; cursor: pointer;">
              <input 
                type="checkbox" 
                name="is_premium" 
                value="1"
                ${post?.is_premium ? 'checked' : ''}
                style="width: auto; margin: 0;"
              >
              <span>⭐ Conteúdo Premium (exclusivo para assinantes)</span>
            </label>
          </div>
          
          <div class="field" style="margin-bottom: 0;">
            <label>Nível do Paywall</label>
            <select name="paywall_tier">
              <option value="">Aberto (Gratuito)</option>
              <option value="metered" ${post?.paywall_tier === 'metered' ? 'selected' : ''}>Metered (Gratuito com limite de leitura)</option>
              <option value="hard" ${post?.paywall_tier === 'hard' ? 'selected' : ''}>Hard (Bloqueio Total para não-assinantes)</option>
            </select>
          </div>
          
          <div class="field" style="margin-bottom: 0;">
            <label style="display: flex; align-items: center; gap: 0.75rem; cursor: pointer;">
              <input 
                type="checkbox" 
                name="metering_exempt" 
                value="1"
                ${post?.metering_exempt ? 'checked' : ''}
                style="width: auto; margin: 0;"
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
