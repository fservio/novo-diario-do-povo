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
    <div style="margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center;">
      <h1 class="section-title" style="margin: 0;">Categorias</h1>
      <a href="/admin/categories/new" class="btn">+ Nova Categoria</a>
    </div>

    <div class="card">
      <table class="w-full" id="categoriesTable">
        <thead>
          <tr>
            <th style="text-align: left; padding: 0.75rem;">ID</th>
            <th style="text-align: left; padding: 0.75rem;">Nome</th>
            <th style="text-align: left; padding: 0.75rem;">Slug</th>
            <th style="text-align: center; padding: 0.75rem;">Ordem</th>
            <th style="text-align: center; padding: 0.75rem;">Status</th>
            <th style="text-align: center; padding: 0.75rem;">Posts</th>
            <th style="text-align: right; padding: 0.75rem;">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${categories.length === 0 ? `
            <tr>
              <td colspan="7" style="text-align: center; padding: 2rem; color: #6b7280;">
                Nenhuma categoria cadastrada
              </td>
            </tr>
          ` : categories.map(cat => `
            <tr style="border-top: 1px solid #e5e7eb;">
              <td style="padding: 0.75rem;">${cat.id}</td>
              <td style="padding: 0.75rem;">
                <strong>${escapeHtml(cat.name)}</strong>
                ${cat.description ? `<br><small style="color: #6b7280;">${escapeHtml(cat.description.substring(0, 60))}${cat.description.length > 60 ? '...' : ''}</small>` : ''}
              </td>
              <td style="padding: 0.75rem;">
                <code style="background: #f3f4f6; padding: 0.25rem 0.5rem; border-radius: 0.25rem; font-size: 0.875rem;">
                  ${escapeHtml(cat.slug)}
                </code>
                <br>
                <a href="/categoria/${escapeHtml(cat.slug)}" target="_blank" style="font-size: 0.75rem; color: #3b82f6;">
                  Ver página →
                </a>
              </td>
              <td style="text-align: center; padding: 0.75rem;">
                <span style="background: #f3f4f6; padding: 0.25rem 0.5rem; border-radius: 0.25rem; font-weight: 500;">
                  ${cat.display_order}
                </span>
              </td>
              <td style="text-align: center; padding: 0.75rem;">
                <span style="display: inline-block; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; ${cat.is_active === 1 ? 'background: #d1fae5; color: #065f46;' : 'background: #fee2e2; color: #991b1b;'}">
                  ${cat.is_active === 1 ? 'Ativa' : 'Inativa'}
                </span>
              </td>
              <td style="text-align: center; padding: 0.75rem; color: #6b7280;">
                <span id="posts-count-${cat.id}">-</span>
              </td>
              <td style="text-align: right; padding: 0.75rem;">
                <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                  <a href="/admin/categories/${cat.id}" class="btn btn-sm">
                    Editar
                  </a>
                  <form method="POST" action="/admin/categories/${cat.id}/toggle" style="display: inline;">
                    <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
                    <button type="submit" class="btn btn-sm" style="background: ${cat.is_active === 1 ? '#ef4444' : '#10b981'}; color: white;">
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

    <style>
      .btn { display: inline-block; padding: 0.5rem 1rem; background: #3b82f6; color: white; text-decoration: none; border-radius: 0.375rem; border: none; cursor: pointer; font-size: 0.875rem; font-weight: 500; }
      .btn:hover { background: #2563eb; }
      .btn-sm { padding: 0.375rem 0.75rem; font-size: 0.8125rem; }
      .card { background: white; border-radius: 0.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden; }
      table { width: 100%; border-collapse: collapse; }
      th { background: #f9fafb; font-weight: 600; font-size: 0.875rem; color: #374151; }
    </style>
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
    <div style="margin-bottom: 1.5rem;">
      <a href="/admin/categories" style="color: #3b82f6; text-decoration: none;">← Voltar para Categorias</a>
      <h1 class="section-title" style="margin-top: 0.5rem;">
        ${isNew ? 'Nova Categoria' : `Editar: ${escapeHtml(category.name)}`}
      </h1>
    </div>

    ${error ? `
      <div class="alert alert-error" style="margin-bottom: 1.5rem; padding: 1rem; background: #fee2e2; border: 1px solid #fecaca; border-radius: 0.375rem; color: #991b1b;">
        ${escapeHtml(error)}
      </div>
    ` : ''}

    <div class="card" style="background: white; padding: 2rem; border-radius: 0.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <form method="POST" action="${formAction}" id="categoryForm">
        <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">

        <div style="margin-bottom: 1.5rem;">
          <label style="display: block; font-weight: 500; margin-bottom: 0.5rem; color: #374151;">
            Nome da Categoria *
          </label>
          <input 
            type="text" 
            name="name" 
            value="${escapeHtml(category?.name || '')}"
            required
            style="width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem; font-size: 1rem;"
            placeholder="Ex: Tecnologia"
          >
        </div>

        <div style="margin-bottom: 1.5rem;">
          <label style="display: block; font-weight: 500; margin-bottom: 0.5rem; color: #374151;">
            Slug (URL)
          </label>
          <input 
            type="text" 
            name="slug" 
            value="${escapeHtml(category?.slug || '')}"
            style="width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem; font-size: 1rem; font-family: monospace;"
            placeholder="Deixe vazio para gerar automaticamente"
          >
          <small style="color: #6b7280; font-size: 0.875rem;">
            Deixe vazio para gerar automaticamente a partir do nome
          </small>
        </div>

        <div style="margin-bottom: 1.5rem;">
          <label style="display: block; font-weight: 500; margin-bottom: 0.5rem; color: #374151;">
            Descrição
          </label>
          <textarea 
            name="description" 
            rows="3"
            style="width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem; font-size: 1rem; font-family: inherit;"
            placeholder="Descrição breve da categoria"
          >${escapeHtml(category?.description || '')}</textarea>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 1.5rem;">
          <div>
            <label style="display: block; font-weight: 500; margin-bottom: 0.5rem; color: #374151;">
              Ordem de Exibição
            </label>
            <input 
              type="number" 
              name="display_order" 
              value="${category?.display_order ?? 0}"
              min="0"
              style="width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem; font-size: 1rem;"
            >
            <small style="color: #6b7280; font-size: 0.875rem;">
              Menor valor aparece primeiro
            </small>
          </div>

          <div>
            <label style="display: block; font-weight: 500; margin-bottom: 0.5rem; color: #374151;">
              Status
            </label>
            <label style="display: flex; align-items: center; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 0.375rem; cursor: pointer;">
              <input 
                type="checkbox" 
                name="is_active" 
                value="1"
                ${!category || category.is_active === 1 ? 'checked' : ''}
                style="width: 1.25rem; height: 1.25rem; margin-right: 0.75rem; cursor: pointer;"
              >
              <span style="font-weight: 500; color: #374151;">Categoria Ativa</span>
            </label>
          </div>
        </div>

        <div style="border-top: 1px solid #e5e7eb; padding-top: 1.5rem; margin-top: 1.5rem;">
          <h3 style="font-size: 1rem; font-weight: 600; margin-bottom: 1rem; color: #374151;">
            SEO (Opcional)
          </h3>

          <div style="margin-bottom: 1.5rem;">
            <label style="display: block; font-weight: 500; margin-bottom: 0.5rem; color: #374151;">
              Título SEO
            </label>
            <input 
              type="text" 
              name="seo_title" 
              value="${escapeHtml(category?.seo_title || '')}"
              maxlength="200"
              style="width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem; font-size: 1rem;"
              placeholder="Título para mecanismos de busca"
            >
          </div>

          <div style="margin-bottom: 1.5rem;">
            <label style="display: block; font-weight: 500; margin-bottom: 0.5rem; color: #374151;">
              Descrição SEO
            </label>
            <textarea 
              name="seo_description" 
              rows="2"
              maxlength="500"
              style="width: 100%; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.375rem; font-size: 1rem; font-family: inherit;"
              placeholder="Meta descrição para mecanismos de busca"
            >${escapeHtml(category?.seo_description || '')}</textarea>
          </div>
        </div>

        <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 2rem;">
          <a href="/admin/categories" class="btn" style="background: #6b7280;">
            Cancelar
          </a>
          <button type="submit" class="btn">
            ${isNew ? 'Criar Categoria' : 'Salvar Alterações'}
          </button>
        </div>
      </form>
    </div>

    <style>
      .btn { display: inline-block; padding: 0.5rem 1.5rem; background: #3b82f6; color: white; text-decoration: none; border-radius: 0.375rem; border: none; cursor: pointer; font-size: 0.875rem; font-weight: 500; }
      .btn:hover { background: #2563eb; }
      .card { background: white; border-radius: 0.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    </style>
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
