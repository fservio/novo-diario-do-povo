/**
 * Admin Categories Management (SSR)
 * CRUD interface for categories
 */

import type { Context } from 'hono'
import type { Env, AppContext } from '../types'
import { z } from 'zod'
import { escapeHtml, renderAdminLayout, type AdminUser } from './ui'
import {
  listCategories,
  findCategoryById,
  createCategory,
  updateCategory,
  toggleCategory,
  slugify,
  type Category,
} from '../db/categories'

// ============================================================================
// Zod Schemas
// ============================================================================

const createCategorySchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(200),
  slug: z.string().max(200).optional(),
  description: z.string().max(1000).optional(),
  parent_id: z.string().optional(),
  seo_title: z.string().max(200).optional(),
  seo_description: z.string().max(500).optional(),
  display_order: z.string().optional(),
  is_active: z.string().optional(),
})

const updateCategorySchema = createCategorySchema.partial()

// ============================================================================
// SSR Rendering Functions
// ============================================================================

function renderCategoriesListPage(params: {
  categories: Category[]
  user: AdminUser
  csrfToken: string
}): string {
  const { categories, user, csrfToken } = params

  const bodyHtml = `
    <div style="margin-bottom: 2rem; display: flex; justify-content: space-between; align-items: center;">
      <h1 class="section-title" style="margin: 0;">Categorias</h1>
      <a href="/admin/categories/new" class="btn"><span>+</span> Nova Categoria</a>
    </div>

    <div class="card" style="padding: 0; overflow: hidden;">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Nome</th>
            <th>Slug</th>
            <th style="text-align: center;">Ordem</th>
            <th style="text-align: center;">Status</th>
            <th style="text-align: center;">Posts</th>
            <th style="text-align: right;">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${categories.length === 0 ? `
            <tr>
              <td colspan="7" style="text-align: center; padding: 3rem; color: var(--text-muted);">
                Nenhuma categoria cadastrada
              </td>
            </tr>
          ` : categories.map(cat => `
            <tr>
              <td style="font-family: monospace; font-size: 0.8125rem; color: var(--text-muted);">${cat.id}</td>
              <td>
                <div style="font-weight: 700; color: var(--text-main);">${escapeHtml(cat.name)}</div>
                ${cat.description ? `<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">${escapeHtml(cat.description.substring(0, 60))}${cat.description.length > 60 ? '...' : ''}</div>` : ''}
              </td>
              <td>
                <code style="background: var(--bg-main); padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8125rem; border: 1px solid var(--border-color);">
                  ${escapeHtml(cat.slug)}
                </code>
                <a href="/categoria/${escapeHtml(cat.slug)}" target="_blank" style="margin-left: 0.5rem; font-size: 1rem; text-decoration: none;" title="Ver no site">🔗</a>
              </td>
              <td style="text-align: center;">
                <span style="font-weight: 700;">${cat.display_order}</span>
              </td>
              <td style="text-align: center;">
                <span style="display: inline-flex; align-items: center; justify-content: center; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; ${cat.is_active === 1 ? 'background: rgba(16, 185, 129, 0.1); color: #10b981;' : 'background: rgba(239, 68, 68, 0.1); color: #ef4444;'}">
                  ${cat.is_active === 1 ? 'Ativa' : 'Inativa'}
                </span>
              </td>
              <td style="text-align: center; color: var(--text-muted);">
                <span id="posts-count-${cat.id}" style="font-weight: 600;">-</span>
              </td>
              <td style="text-align: right;">
                <div style="display: flex; gap: 0.5rem; justify-content: flex-end; align-items: center;">
                  <a href="/admin/categories/${cat.id}" class="btn" style="padding: 0.4rem 0.8rem; font-size: 0.75rem; background: var(--bg-main); color: var(--text-main); border: 1px solid var(--border-color);">
                    Editar
                  </a>
                  <form method="POST" action="/admin/categories/${cat.id}/toggle" style="display: inline;">
                    <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
                    <button type="submit" class="btn" style="padding: 0.4rem 0.8rem; font-size: 0.75rem; background: ${cat.is_active === 1 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)'}; color: ${cat.is_active === 1 ? '#ef4444' : '#10b981'}; border: 1px solid ${cat.is_active === 1 ? '#ef4444' : '#10b981'};">
                      ${cat.is_active === 1 ? 'Desativar' : 'Ativar'}
                    </button>
                  </form>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `

  return renderAdminLayout({
    title: 'Categorias',
    user,
    bodyHtml,
    activeTab: 'categories',
    csrfToken
  })
}

function renderCategoryForm(params: {
  category?: Category
  error?: string
  user: AdminUser
  csrfToken: string
  allCategories: Category[]
}): string {
  const { category, error, user, csrfToken, allCategories } = params
  const isNew = !category
  const formAction = isNew ? '/admin/categories' : `/admin/categories/${category!.id}`

  const bodyHtml = `
    <div style="margin-bottom: 2rem;">
      <a href="/admin/categories" style="color: var(--text-muted); text-decoration: none; font-size: 0.875rem; font-weight: 600; display: flex; align-items: center; gap: 0.25rem;">
        ← Voltar para a lista
      </a>
      <h1 class="section-title" style="margin-top: 0.5rem;">
        ${isNew ? 'Criar Nova Categoria' : `Editar Categoria: ${escapeHtml(category.name)}`}
      </h1>
    </div>

    ${error ? `
      <div class="error" style="margin-bottom: 2rem; padding: 1.25rem; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: var(--radius-md); color: #ef4444; font-weight: 500;">
        ⚠️ ${escapeHtml(error)}
      </div>
    ` : ''}

    <div class="card">
      <form method="POST" action="${formAction}" id="categoryForm">
        <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">

        <div class="form-group">
          <label>Nome da Categoria *</label>
          <input 
            type="text" 
            name="name" 
            class="form-control"
            value="${escapeHtml(category?.name || '')}"
            required
            placeholder="Ex: Tecnologia, Economia, Esportes"
            style="font-weight: 700; font-size: 1.125rem;"
          >
        </div>

        <div class="form-group">
          <label>Slug (URL amigável)</label>
          <input 
            type="text" 
            name="slug" 
            class="form-control"
            value="${escapeHtml(category?.slug || '')}"
            placeholder="tecnologia"
            style="font-family: 'JetBrains Mono', monospace; font-size: 0.8125rem; background: #f8fafc;"
          >
          <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem; font-weight: 500;">
            Deixe em branco para gerar automaticamente a partir do nome.
          </div>
        </div>

        <div class="form-group">
          <label>Descrição</label>
          <textarea 
            name="description" 
            class="form-control"
            rows="3"
            placeholder="Breve descrição dos assuntos desta categoria..."
          >${escapeHtml(category?.description || '')}</textarea>
        </div>

        <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 1.5rem;">
          <div class="form-group">
            <label>Ordem de Exibição</label>
            <input 
              type="number" 
              name="display_order" 
              class="form-control"
              value="${category?.display_order ?? 0}"
              min="0"
              style="font-weight: 700; width: 120px;"
            >
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem; font-weight: 500;">
              Menor valor aparece primeiro nos menus.
            </div>
          </div>

          <div class="form-group">
            <label>Status</label>
            <label style="display: flex; align-items: center; gap: 1rem; padding: 1rem; background: #fafbfc; border-radius: 0.75rem; border: 1.5px solid #e2e8f0; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='#e2e8f0'">
              <input 
                type="checkbox" 
                name="is_active" 
                value="1"
                ${!category || category.is_active === 1 ? 'checked' : ''}
                style="width: 1.25rem; height: 1.25rem; margin: 0; accent-color: var(--primary);"
              >
              <span style="font-weight: 700; color: var(--primary);">Esta categoria está visível</span>
            </label>
          </div>
        </div>

        <div style="border-top: 1px solid var(--border-color); padding-top: 2rem; margin-top: 2rem;">
          <h3 style="font-size: 1rem; font-weight: 700; margin-bottom: 1.25rem; color: var(--text-main); text-transform: uppercase; letter-spacing: 0.05em;">
            🔍 SEO & Metadados
          </h3>

          <div class="form-group">
            <label>Título SEO</label>
            <input 
              type="text" 
              name="seo_title" 
              class="form-control"
              value="${escapeHtml(category?.seo_title || '')}"
              maxlength="200"
              placeholder="Título para motores de busca"
            >
          </div>

          <div class="form-group">
            <label>Descrição SEO</label>
            <textarea 
              name="seo_description" 
              class="form-control"
              rows="2"
              maxlength="500"
              placeholder="Meta descrição para motores de busca"
            >${escapeHtml(category?.seo_description || '')}</textarea>
          </div>
        </div>

        <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 2rem; border-top: 1px solid var(--border-color); padding-top: 2rem;">
          <a href="/admin/categories" class="btn" style="background: var(--bg-main); color: var(--text-main); border: 1px solid var(--border-color);">
            Cancelar
          </a>
          <button type="submit" class="btn" style="min-width: 150px;">
            ${isNew ? 'Criar Categoria' : 'Salvar Alterações'}
          </button>
        </div>
      </form>
    </div>

  `

  return renderAdminLayout({
    title: isNew ? 'Nova Categoria' : `Editar: ${category.name}`,
    user,
    bodyHtml,
    activeTab: 'categories',
    csrfToken
  })
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * GET /admin/categories - List all categories
 */
export async function handleCategoriesList(c: Context<{ Bindings: Env; Variables: AppContext }>) {
  const user = c.get('adminUser')
  const csrfToken = c.get('csrfToken')

  const categories = await listCategories(c.env, { includeInactive: true })

  return c.html(renderCategoriesListPage({
    categories,
    user: user!,
    csrfToken: csrfToken || ''
  }))
}

/**
 * GET /admin/categories/new - Create category form
 */
export async function handleCategoriesNew(c: Context<{ Bindings: Env; Variables: AppContext }>) {
  const user = c.get('adminUser')
  const csrfToken = c.get('csrfToken')

  const allCategories = await listCategories(c.env, { includeInactive: true })

  return c.html(renderCategoryForm({
    user: user!,
    csrfToken: csrfToken || '',
    allCategories
  }))
}

/**
 * POST /admin/categories - Create category
 */
export async function handleCategoriesCreate(c: Context<{ Bindings: Env; Variables: AppContext }>) {
  const user = c.get('adminUser')
  const csrfToken = c.get('csrfToken')
  const allCategories = await listCategories(c.env, { includeInactive: true })

  try {
    const formData = await c.req.parseBody()

    const validated = createCategorySchema.parse({
      name: formData.name,
      slug: formData.slug || undefined,
      description: formData.description || undefined,
      parent_id: formData.parent_id || undefined,
      seo_title: formData.seo_title || undefined,
      seo_description: formData.seo_description || undefined,
      display_order: formData.display_order || undefined,
      is_active: formData.is_active || undefined,
    })

    const payload = {
      name: validated.name,
      slug: validated.slug,
      description: validated.description,
      parent_id: validated.parent_id ? parseInt(validated.parent_id) : undefined,
      seo_title: validated.seo_title,
      seo_description: validated.seo_description,
      display_order: validated.display_order ? parseInt(validated.display_order) : 0,
      is_active: validated.is_active === '1',
    }

    const result = await createCategory(c.env, payload, user!.id)

    return c.redirect(`/admin/categories/${result.id}`, 302)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro ao criar categoria'

    return c.html(renderCategoryForm({
      error: errorMessage,
      user: user!,
      csrfToken: csrfToken || '',
      allCategories
    }), 400)
  }
}

/**
 * GET /admin/categories/:id - Edit category form
 */
export async function handleCategoriesEdit(c: Context<{ Bindings: Env; Variables: AppContext }>) {
  const user = c.get('adminUser')
  const csrfToken = c.get('csrfToken')
  const id = Number(c.req.param('id'))

  // Validate id is a valid number
  if (!Number.isFinite(id) || id <= 0) {
    return c.html('<h1>Invalid category id</h1>', 400)
  }

  const category = await findCategoryById(c.env, id)
  if (!category) {
    return c.text('Category not found', 404)
  }

  const allCategories = await listCategories(c.env, { includeInactive: true })

  return c.html(renderCategoryForm({
    category,
    user: user!,
    csrfToken: csrfToken || '',
    allCategories
  }))
}

/**
 * POST /admin/categories/:id - Update category
 */
export async function handleCategoriesUpdate(c: Context<{ Bindings: Env; Variables: AppContext }>) {
  const user = c.get('adminUser')
  const csrfToken = c.get('csrfToken')
  const id = Number(c.req.param('id'))

  // Validate id is a valid number
  if (!Number.isFinite(id) || id <= 0) {
    return c.html('<h1>Invalid category id</h1>', 400)
  }

  const category = await findCategoryById(c.env, id)
  if (!category) {
    return c.text('Category not found', 404)
  }

  const allCategories = await listCategories(c.env, { includeInactive: true })

  try {
    const formData = await c.req.parseBody()

    const validated = updateCategorySchema.parse({
      name: formData.name || undefined,
      slug: formData.slug || undefined,
      description: formData.description || undefined,
      parent_id: formData.parent_id || undefined,
      seo_title: formData.seo_title || undefined,
      seo_description: formData.seo_description || undefined,
      display_order: formData.display_order || undefined,
      is_active: formData.is_active || undefined,
    })

    const payload: any = {}

    if (validated.name) payload.name = validated.name
    if (validated.slug !== undefined) payload.slug = validated.slug
    if (validated.description !== undefined) payload.description = validated.description
    if (validated.parent_id !== undefined) {
      payload.parent_id = validated.parent_id ? parseInt(validated.parent_id) : null
    }
    if (validated.seo_title !== undefined) payload.seo_title = validated.seo_title
    if (validated.seo_description !== undefined) payload.seo_description = validated.seo_description
    if (validated.display_order !== undefined) {
      payload.display_order = parseInt(validated.display_order)
    }
    payload.is_active = validated.is_active === '1'

    await updateCategory(c.env, id, payload, user!.id)

    return c.redirect('/admin/categories', 302)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro ao atualizar categoria'

    return c.html(renderCategoryForm({
      category,
      error: errorMessage,
      user: user!,
      csrfToken: csrfToken || '',
      allCategories
    }), 400)
  }
}

/**
 * POST /admin/categories/:id/toggle - Toggle category status
 */
export async function handleCategoriesToggle(c: Context<{ Bindings: Env; Variables: AppContext }>) {
  const id = Number(c.req.param('id'))

  // Validate id is a valid number
  if (!Number.isFinite(id) || id <= 0) {
    return c.text('Invalid category id', 400)
  }

  try {
    await toggleCategory(c.env, id)
    return c.redirect('/admin/categories', 302)
  } catch (error) {
    return c.text('Error toggling category', 500)
  }
}
