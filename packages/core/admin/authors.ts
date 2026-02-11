/**
 * Admin Authors Management
 * CRUD for authors and columnists
 */

import type { Context } from 'hono'
import type { Env, AppContext } from '../types'
import { z } from 'zod'
import { escapeHtml, renderAdminLayout, type AdminUser } from './ui'
import {
  listActiveAuthors,
  findAuthorById,
  createAuthor,
  updateAuthor,
  type Author,
  type CreateAuthorInput,
  type UpdateAuthorInput
} from '../db/authors'

// ============================================================================
// Zod Schemas
// ============================================================================

const createAuthorSchema = z.object({
  name: z.string().min(2).max(255),
  slug: z.string().min(2).max(255).optional(), // Optional, auto-generated if empty
  email: z.string().email().optional().or(z.literal('')),
  bio: z.string().optional(),
  avatar_media_id: z.string().transform(val => val ? parseInt(val) : undefined).optional(),
  social_twitter: z.string().optional(),
  social_instagram: z.string().optional(),
  social_linkedin: z.string().optional(),
  author_type: z.enum(['staff', 'columnist', 'editorial', 'contributor']).default('staff'),
  is_columnist: z.string().transform(val => val === '1').optional(),
  column_name: z.string().optional(),
  column_description: z.string().optional(),
})

const updateAuthorSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  slug: z.string().min(2).max(255).optional(),
  email: z.string().email().optional().or(z.literal('')),
  bio: z.string().optional(),
  avatar_media_id: z.string().transform(val => val ? parseInt(val) : undefined).optional(),
  social_twitter: z.string().optional(),
  social_instagram: z.string().optional(),
  social_linkedin: z.string().optional(),
  author_type: z.enum(['staff', 'columnist', 'editorial', 'contributor']).optional(),
  is_columnist: z.string().transform(val => val === '1').optional(),
  column_name: z.string().optional(),
  column_description: z.string().optional(),
})

// ============================================================================
// Render Functions
// ============================================================================

function renderAuthorsList(authors: Author[], csrfToken: string): string {
  const rows = authors.map(author => {
    const isColumnistBadge = author.is_columnist
      ? '<span style="display: inline-flex; align-items: center; justify-content: center; padding: 0.25rem 0.5rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; background: var(--accent-soft); color: var(--accent);">Colunista</span>'
      : ''

    return `
      <tr>
        <td>
          <div style="font-weight: 700;">${escapeHtml(author.name)}</div>
          ${author.email ? `<div style="font-size: 0.8125rem; color: var(--text-muted);">${escapeHtml(author.email)}</div>` : ''}
        </td>
        <td>
          ${isColumnistBadge}
          ${author.column_name ? `<div style="font-size: 0.8125rem; font-weight: 600; margin-top: 0.25rem;">${escapeHtml(author.column_name)}</div>` : ''}
        </td>
        <td style="color: var(--text-muted); font-size: 0.875rem;">
          ${author.social_instagram ? 'IG ' : ''}
          ${author.social_twitter ? 'TW ' : ''}
          ${author.social_linkedin ? 'LI' : ''}
        </td>
        <td>
          <a href="/admin/authors/${author.id}" class="btn" style="padding: 0.4rem 0.8rem; font-size: 0.75rem; background: var(--bg-main); color: var(--text-main); border: 1px solid var(--border-color);">
            Editar
          </a>
        </td>
      </tr>
    `
  }).join('')

  return `
    <div style="margin-bottom: 2rem; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <h1 class="section-title" style="margin: 0;">Autores e Colunistas</h1>
        <p style="color: var(--text-muted); margin-top: 0.5rem;">Gerencie a equipe editorial e as colunas de opinião.</p>
      </div>
      <a href="/admin/authors/new" class="btn">
        <span>+</span> Novo Autor
      </a>
    </div>

    <div class="card" style="padding: 0; overflow: hidden;">
      <table>
        <thead>
          <tr>
            <th style="width: 50px;">ID</th>
            <th>Nome / Email</th>
            <th>Tipo / Coluna</th>
            <th>Redes</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${authors.map(author => `
            <tr>
              <td><code style="background: var(--bg-main); padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8125rem; font-weight: 700; color: var(--text-muted);">#${author.id}</code></td>
              <td>
                <div style="font-weight: 700;">${escapeHtml(author.name)}</div>
                ${author.email ? `<div style="font-size: 0.8125rem; color: var(--text-muted);">${escapeHtml(author.email)}</div>` : ''}
              </td>
              <td>
                ${author.author_type === 'columnist'
      ? '<span style="display: inline-flex; align-items: center; justify-content: center; padding: 0.25rem 0.5rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; background: var(--accent-soft); color: var(--accent);">Colunista</span>'
      : author.author_type === 'editorial'
        ? '<span style="display: inline-flex; align-items: center; justify-content: center; padding: 0.25rem 0.5rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; background: #e0f2fe; color: #0369a1;">Editorial</span>'
        : author.author_type === 'contributor'
          ? '<span style="display: inline-flex; align-items: center; justify-content: center; padding: 0.25rem 0.5rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; background: #fef3c7; color: #92400e;">Artigo Opinião</span>'
          : '<span style="display: inline-flex; align-items: center; justify-content: center; padding: 0.25rem 0.5rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; background: var(--bg-main); color: var(--text-muted);">Autor</span>'}
                ${author.column_name ? `<div style="font-size: 0.8125rem; font-weight: 600; margin-top: 0.25rem;">${escapeHtml(author.column_name)}</div>` : ''}
              </td>
              <td style="color: var(--text-muted); font-size: 0.875rem;">
                ${author.social_instagram ? 'IG ' : ''}
                ${author.social_twitter ? 'TW ' : ''}
                ${author.social_linkedin ? 'LI' : ''}
              </td>
              <td>
                <a href="/admin/authors/${author.id}" class="btn" style="padding: 0.4rem 0.8rem; font-size: 0.75rem; background: var(--bg-main); color: var(--text-main); border: 1px solid var(--border-color);">
                  Editar
                </a>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `
}

function renderAuthorForm(author: Author | null, csrfToken: string, error?: string): string {
  const isEdit = !!author
  const title = isEdit ? 'Editar Autor' : 'Novo Autor'
  const isColumnist = author?.is_columnist === 1

  const errorHTML = error ? `
    <div class="error" style="margin-bottom: 2rem; padding: 1.25rem; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: var(--radius-md); color: #ef4444; font-weight: 500;">
      ⚠️ ${escapeHtml(error)}
    </div>
  ` : ''

  const formAction = isEdit ? `/admin/authors/${author!.id}` : '/admin/authors'

  return `
    <div style="max-width: 800px;">
      <div style="margin-bottom: 2rem;">
        <a href="/admin/authors" style="color: var(--text-muted); text-decoration: none; font-size: 0.875rem; font-weight: 600; display: flex; align-items: center; gap: 0.25rem;">
          ← Voltar para a lista
        </a>
        <h1 class="section-title" style="margin-top: 0.5rem;">${title}</h1>
      </div>

      ${errorHTML}

      <form method="POST" action="${formAction}">
        <input type="hidden" name="csrf_token" value="${csrfToken}" />
        
        <div class="grid grid-2" style="gap: 2rem; align-items: start;">
          <!-- Basic Info -->
          <div class="card">
            <h2 style="font-size: 1.125rem; font-weight: 700; margin-bottom: 1.5rem; border-bottom: 1px solid var(--border-color); padding-bottom: 1rem;">
              👤 Informações Básicas
            </h2>

            <div class="form-group">
              <label>Nome Completo *</label>
              <input type="text" name="name" class="form-control" value="${escapeHtml(author?.name || '')}" required placeholder="Nome do autor" />
            </div>

            <div class="form-group">
              <label>Email (Opcional)</label>
              <input type="email" name="email" class="form-control" value="${escapeHtml(author?.email || '')}" placeholder="contato@exemplo.com" />
              <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem; font-weight: 500;">Visível apenas internamente, a menos que especificado.</div>
            </div>

            <div class="form-group">
              <label>Slug (URL) </label>
              <input type="text" name="slug" class="form-control" value="${escapeHtml(author?.slug || '')}" placeholder="nome-sobrenome (automático se vazio)" style="font-family: 'JetBrains Mono', monospace; font-size: 0.8125rem; background: #f8fafc;" />
            </div>

            <div class="form-group">
              <label>Biografia Curta</label>
              <textarea name="bio" class="form-control" rows="4" placeholder="Breve descrição do autor...">${escapeHtml(author?.bio || '')}</textarea>
            </div>
            
            <div class="form-group">
              <label>Foto do Autor (ID)</label>
              <div style="display: flex; gap: 0.75rem;">
                <input type="number" name="avatar_media_id" id="avatar_media_id" class="form-control" value="${author?.avatar_media_id || ''}" placeholder="ID" style="width: 100px;" />
                <a href="/admin/media" target="_blank" class="btn btn-outline" style="padding: 0 1.25rem; display: flex; align-items: center;">Galeria ↗</a>
              </div>
            </div>
          </div>

          <!-- Social & Columnist -->
          <div style="display: flex; flex-direction: column; gap: 2rem;">
            
            <!-- Column Type & Settings -->
            <div class="card" style="border-left: 4px solid var(--accent);">
              <h2 style="font-size: 1.125rem; font-weight: 700; margin-bottom: 1.5rem; margin-top: 0; color: var(--accent);">
                📰 Tipo e Layout
              </h2>
              
              <div class="form-group">
                <label>Padrão Editorial</label>
                <select name="author_type" id="author_type_select" class="form-control" onchange="toggleAuthorFields()" style="font-weight: 700;">
                  <option value="staff" ${author?.author_type === 'staff' ? 'selected' : ''}>✒️ Redação / Staff</option>
                  <option value="columnist" ${author?.author_type === 'columnist' ? 'selected' : ''}>👤 Colunista (Opinião)</option>
                  <option value="editorial" ${author?.author_type === 'editorial' ? 'selected' : ''}>🏛️ Editorial (Voz do Jornal)</option>
                  <option value="contributor" ${author?.author_type === 'contributor' ? 'selected' : ''}>🤝 Artigo de Opinião (Colaborador)</option>
                </select>
                <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;">Isso define o layout automático do post.</div>
              </div>

              <!-- Hidden Checkbox for backward compatibility -->
              <input type="hidden" name="is_columnist" id="is_columnist_hidden" value="${author?.author_type === 'columnist' ? '1' : '0'}" />

              <div id="column_fields" style="display: ${author?.author_type === 'columnist' ? 'block' : 'none'}; padding-top: 1rem; border-top: 1px dotted var(--border-color); margin-top: 1rem;">
                <div class="form-group">
                  <label>Nome da Coluna</label>
                  <input type="text" name="column_name" class="form-control" value="${escapeHtml(author?.column_name || '')}" placeholder="Ex: Ponto de Vista, Tech News..." />
                </div>
                
                 <div class="form-group">
                  <label>Descrição da Coluna</label>
                  <textarea name="column_description" class="form-control" rows="3" placeholder="Sobre o que é esta coluna...">${escapeHtml(author?.column_description || '')}</textarea>
                </div>
              </div>

              <div id="contributor_disclaimer" style="display: ${author?.author_type === 'contributor' ? 'block' : 'none'}; padding: 1rem; background: #fffbeb; border: 1px solid #fef3c7; border-radius: 0.5rem; margin-top: 1rem;">
                <div style="font-size: 0.8125rem; color: #92400e; font-weight: 600;">
                  💡 <strong>Artigo de Opinião:</strong> Será exibido um disclaimer ao final do post indicando que a autoria é externa.
                </div>
              </div>

              <script>
                function toggleAuthorFields() {
                  const select = document.getElementById('author_type_select');
                  const columnistFields = document.getElementById('column_fields');
                  const contributorFields = document.getElementById('contributor_disclaimer');
                  const legacyHidden = document.getElementById('is_columnist_hidden');
                  
                  columnistFields.style.display = select.value === 'columnist' ? 'block' : 'none';
                  contributorFields.style.display = select.value === 'contributor' ? 'block' : 'none';
                  legacyHidden.value = select.value === 'columnist' ? '1' : '0';
                }
              </script>
            </div>

            <!-- Social Media -->
            <div class="card">
              <h2 style="font-size: 1.125rem; font-weight: 700; margin-bottom: 1.5rem; margin-top: 0; border-bottom: 1px solid var(--border-color); padding-bottom: 1rem;">
                🌐 Redes Sociais
              </h2>
              
              <div class="form-group">
                <label>Instagram</label>
                <div style="position: relative;">
                  <span style="position: absolute; left: 1rem; top: 50%; transform: translateY(-50%); color: #94a3b8; font-weight: 700;">@</span>
                  <input type="text" name="social_instagram" class="form-control" value="${escapeHtml(author?.social_instagram || '')}" style="padding-left: 2.25rem;" placeholder="usuario" />
                </div>
              </div>

              <div class="form-group">
                <label>Twitter / X</label>
                <div style="position: relative;">
                  <span style="position: absolute; left: 1rem; top: 50%; transform: translateY(-50%); color: #94a3b8; font-weight: 700;">@</span>
                  <input type="text" name="social_twitter" class="form-control" value="${escapeHtml(author?.social_twitter || '')}" style="padding-left: 2.25rem;" placeholder="usuario" />
                </div>
              </div>

              <div class="form-group">
                <label>LinkedIn URL</label>
                <input type="text" name="social_linkedin" class="form-control" value="${escapeHtml(author?.social_linkedin || '')}" placeholder="https://linkedin.com/in/..." />
              </div>
            </div>
            
          </div>
        </div>

        <div style="display: flex; gap: 1rem; margin-top: 2rem; border-top: 1px solid var(--border-color); padding-top: 2rem;">
          <button type="submit" class="btn" style="min-width: 150px;">
             ${isEdit ? 'Salvar Alterações' : 'Criar Autor'}
          </button>
          <a href="/admin/authors" class="btn" style="background: var(--bg-main); color: var(--text-main); border: 1px solid var(--border-color); text-decoration: none;">
            Cancelar
          </a>
        </div>

      </form>
    </div>
  `
}

// ============================================================================
// Handlers
// ============================================================================

/**
 * GET /admin/authors - List authors
 */
export async function handleAuthorsList(c: Context<{ Bindings: Env; Variables: AppContext }>) {
  const user = c.get('adminUser') as AdminUser
  const csrfToken = c.get('csrfToken') as string

  const authors = await listActiveAuthors(c.env)
  const content = renderAuthorsList(authors, csrfToken)

  return c.html(renderAdminLayout({
    title: 'Autores',
    user,
    bodyHtml: content,
    activeTab: 'authors', // We need to handle this in ui.ts
    csrfToken
  }))
}

/**
 * GET /admin/authors/new - Create form
 */
export async function handleAuthorsNew(c: Context<{ Bindings: Env; Variables: AppContext }>) {
  const user = c.get('adminUser') as AdminUser
  const csrfToken = c.get('csrfToken') as string

  const content = renderAuthorForm(null, csrfToken)

  return c.html(renderAdminLayout({
    title: 'Novo Autor',
    user,
    bodyHtml: content,
    activeTab: 'authors',
    csrfToken
  }))
}

/**
 * POST /admin/authors - Create action
 */
export async function handleAuthorsCreate(c: Context<{ Bindings: Env; Variables: AppContext }>) {
  const user = c.get('adminUser') as AdminUser
  const csrfToken = c.get('csrfToken') as string

  try {
    const formData = await c.req.parseBody()
    const data = createAuthorSchema.parse(formData)

    // Auto-generate slug if missing
    const slug = data.slug || data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

    await createAuthor(c.env, {
      name: data.name,
      slug,
      email: data.email || null,
      bio: data.bio || null,
      avatar_media_id: data.avatar_media_id || null,
      social_twitter: data.social_twitter || null,
      social_instagram: data.social_instagram || null,
      social_linkedin: data.social_linkedin || null,
      is_active: 1,
      is_columnist: data.author_type === 'columnist' ? 1 : 0,
      author_type: data.author_type,
      column_name: data.column_name || null,
      column_description: data.column_description || null,
    })

    return c.redirect('/admin/authors', 303)
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Erro ao criar autor'
    const content = renderAuthorForm(null, csrfToken, errorMsg)
    return c.html(renderAdminLayout({ bodyHtml: content, user, title: 'Erro', csrfToken }), 400)
  }
}

/**
 * GET /admin/authors/:id - Edit form
 */
export async function handleAuthorsEdit(c: Context<{ Bindings: Env; Variables: AppContext }>) {
  const user = c.get('adminUser') as AdminUser
  const csrfToken = c.get('csrfToken') as string
  const id = parseInt(c.req.param('id'))

  if (isNaN(id)) return c.notFound()

  const author = await findAuthorById(c.env, id)
  if (!author) return c.notFound()

  const content = renderAuthorForm(author, csrfToken)

  return c.html(renderAdminLayout({
    title: `Editar ${author.name}`,
    user,
    bodyHtml: content,
    activeTab: 'authors',
    csrfToken
  }))
}

/**
 * POST /admin/authors/:id - Update action
 */
export async function handleAuthorsUpdate(c: Context<{ Bindings: Env; Variables: AppContext }>) {
  const user = c.get('adminUser') as AdminUser
  const csrfToken = c.get('csrfToken') as string
  const id = parseInt(c.req.param('id'))

  if (isNaN(id)) return c.notFound()

  try {
    const formData = await c.req.parseBody()
    const data = updateAuthorSchema.parse(formData)

    await updateAuthor(c.env, id, {
      ...data,
      // Convert boolean check to 1/0 for update based on author_type
      is_columnist: data.author_type === 'columnist' ? 1 : 0
    })

    return c.redirect('/admin/authors', 303)
  } catch (error) {
    const author = await findAuthorById(c.env, id)
    const errorMsg = error instanceof Error ? error.message : 'Erro ao atualizar autor'
    const content = renderAuthorForm(author, csrfToken, errorMsg)
    return c.html(renderAdminLayout({ bodyHtml: content, user, title: 'Erro', csrfToken }), 400)
  }
}
