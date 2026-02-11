/**
 * Admin Tags Management (SSR)
 */

import type { Context } from 'hono'
import type { Env, AppContext, Tag } from '../types'
import { z } from 'zod'
import { escapeHtml, renderAdminLayout, type AdminUser, renderCsrfInput } from './ui'
import {
    listTags,
    findTagById,
    createTag,
    updateTag,
    deleteTag
} from '../db/tags'

// ============================================================================
// Zod Schemas
// ============================================================================

const createTagSchema = z.object({
    name: z.string().min(1, 'Nome é obrigatório').max(100),
    slug: z.string().max(100).optional(),
    description: z.string().max(500).optional(),
    seo_noindex: z.string().optional(),
})

const updateTagSchema = createTagSchema.partial()

// ============================================================================
// SSR Rendering Functions
// ============================================================================

function renderTagsListPage(params: {
    tags: Tag[]
    user: AdminUser
    csrfToken: string
    error?: string
}): string {
    const { tags, user, csrfToken, error } = params

    const bodyHtml = `
    <div style="margin-bottom: 2rem; display: flex; justify-content: space-between; align-items: center;">
      <h1 class="section-title" style="margin: 0;">Tags</h1>
      <a href="/admin/tags/new" class="btn"><span>+</span> Nova Tag</a>
    </div>

    ${error ? `<div class="error" style="margin-bottom: 2rem; padding: 1rem; background: #fee2e2; color: #991b1b; border-radius: 0.5rem; border: 1px solid #fecaca;">${escapeHtml(error)}</div>` : ''}

    <div class="card" style="padding: 0; overflow: hidden;">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Nome</th>
            <th>Slug</th>
            <th style="text-align: center;">Indexar</th>
            <th style="text-align: right;">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${tags.length === 0 ? `
            <tr>
              <td colspan="5" style="text-align: center; padding: 3rem; color: var(--text-muted);">
                Nenhuma tag cadastrada
              </td>
            </tr>
          ` : tags.map(tag => `
            <tr>
              <td style="font-family: monospace; font-size: 0.8125rem; color: var(--text-muted);">${tag.id}</td>
              <td style="font-weight: 700; color: var(--text-main);">${escapeHtml(tag.name)}</td>
              <td>
                <code style="background: var(--bg-main); padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8125rem; border: 1px solid var(--border-color);">
                  ${escapeHtml(tag.slug)}
                </code>
                <a href="/tag/${escapeHtml(tag.slug)}" target="_blank" style="margin-left: 0.5rem; text-decoration: none;" title="Ver no site">🔗</a>
              </td>
              <td style="text-align: center;">
                <span class="badge ${tag.seo_noindex === 1 ? 'badge-warning' : 'badge-success'}">
                  ${tag.seo_noindex === 1 ? 'No Index' : 'Indexar'}
                </span>
              </td>
              <td style="text-align: right;">
                <div style="display: flex; gap: 0.5rem; justify-content: flex-end; align-items: center;">
                  <a href="/admin/tags/${tag.id}" class="btn btn-outline" style="padding: 0.4rem 0.8rem; font-size: 0.75rem;">
                    Editar
                  </a>
                  <form method="POST" action="/admin/tags/${tag.id}/delete" style="display: inline;" onsubmit="return confirm('Tem certeza que deseja excluir esta tag?')">
                    ${renderCsrfInput(csrfToken)}
                    <button type="submit" class="btn btn-outline" style="padding: 0.4rem 0.8rem; font-size: 0.75rem; color: #ef4444; border-color: #fee2e2;">
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
  `

    return renderAdminLayout({
        title: 'Tags',
        user,
        bodyHtml,
        activeTab: 'tags',
        csrfToken
    })
}

function renderTagForm(params: {
    tag?: Tag
    error?: string
    user: AdminUser
    csrfToken: string
}): string {
    const { tag, error, user, csrfToken } = params
    const isNew = !tag
    const formAction = isNew ? '/admin/tags' : `/admin/tags/${tag!.id}`

    const bodyHtml = `
    <div style="margin-bottom: 2rem;">
      <a href="/admin/tags" style="color: var(--text-muted); text-decoration: none; font-size: 0.875rem; font-weight: 600; display: flex; align-items: center; gap: 0.25rem;">
        ← Voltar para a lista
      </a>
      <h1 class="section-title" style="margin-top: 0.5rem;">
        ${isNew ? 'Criar Nova Tag' : `Editar Tag: ${escapeHtml(tag.name)}`}
      </h1>
    </div>

    ${error ? `<div class="error" style="margin-bottom: 2rem; padding: 1.25rem; background: #fee2e2; color: #991b1b; border-radius: 0.5rem;">⚠️ ${escapeHtml(error)}</div>` : ''}

    <div class="card">
      <form method="POST" action="${formAction}">
        ${renderCsrfInput(csrfToken)}

        <div class="form-group">
          <label>Nome da Tag *</label>
          <input type="text" name="name" class="form-control" value="${escapeHtml(tag?.name || '')}" required style="font-weight: 700;">
        </div>

        <div class="form-group">
          <label>Slug (URL amigável)</label>
          <input type="text" name="slug" class="form-control" value="${escapeHtml(tag?.slug || '')}" placeholder="nome-da-tag">
        </div>

        <div class="form-group">
          <label>Descrição</label>
          <textarea name="description" class="form-control" rows="3">${escapeHtml(tag?.description || '')}</textarea>
        </div>

        <div class="form-group">
          <label style="display: flex; align-items: center; gap: 0.75rem; cursor: pointer;">
            <input type="checkbox" name="seo_noindex" value="1" ${tag?.seo_noindex === 1 ? 'checked' : ''} style="width: 1.25rem; height: 1.25rem;">
            <span>Não indexar em motores de busca (noindex)</span>
          </label>
        </div>

        <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 2rem; border-top: 1px solid var(--border); padding-top: 2rem;">
          <a href="/admin/tags" class="btn btn-outline">Cancelar</a>
          <button type="submit" class="btn">${isNew ? 'Criar Tag' : 'Salvar Alterações'}</button>
        </div>
      </form>
    </div>
  `

    return renderAdminLayout({
        title: isNew ? 'Nova Tag' : `Editar Tag: ${tag.name}`,
        user,
        bodyHtml,
        activeTab: 'tags',
        csrfToken
    })
}

// ============================================================================
// Route Handlers
// ============================================================================

export async function handleTagsList(c: Context<{ Bindings: Env; Variables: AppContext }>) {
    const user = c.get('adminUser')
    const csrfToken = c.get('csrfToken')
    const error = c.req.query('error')

    const tags = await listTags(c.env)

    return c.html(renderTagsListPage({
        tags,
        user: user!,
        csrfToken: csrfToken || '',
        error
    }))
}

export async function handleTagsNew(c: Context<{ Bindings: Env; Variables: AppContext }>) {
    const user = c.get('adminUser')
    const csrfToken = c.get('csrfToken')

    return c.html(renderTagForm({
        user: user!,
        csrfToken: csrfToken || ''
    }))
}

export async function handleTagsCreate(c: Context<{ Bindings: Env; Variables: AppContext }>) {
    const user = c.get('adminUser')
    const csrfToken = c.get('csrfToken')

    try {
        const formData = await c.req.parseBody()
        const validated = createTagSchema.parse({
            name: formData.name,
            slug: formData.slug || undefined,
            description: formData.description || undefined,
            seo_noindex: formData.seo_noindex || undefined,
        })

        const payload = {
            name: validated.name,
            slug: validated.slug,
            description: validated.description,
            seo_noindex: validated.seo_noindex === '1',
        }

        const { id } = await createTag(c.env, payload)
        return c.redirect('/admin/tags', 302)
    } catch (error: any) {
        return c.html(renderTagForm({
            error: error.message,
            user: user!,
            csrfToken: csrfToken || ''
        }), 400)
    }
}

export async function handleTagsEdit(c: Context<{ Bindings: Env; Variables: AppContext }>) {
    const user = c.get('adminUser')
    const csrfToken = c.get('csrfToken')
    const id = parseInt(c.req.param('id'))

    const tag = await findTagById(c.env, id)
    if (!tag) return c.text('Tag not found', 404)

    return c.html(renderTagForm({
        tag,
        user: user!,
        csrfToken: csrfToken || ''
    }))
}

export async function handleTagsUpdate(c: Context<{ Bindings: Env; Variables: AppContext }>) {
    const user = c.get('adminUser')
    const csrfToken = c.get('csrfToken')
    const id = parseInt(c.req.param('id'))

    const tag = await findTagById(c.env, id)
    if (!tag) return c.text('Tag not found', 404)

    try {
        const formData = await c.req.parseBody()
        const validated = updateTagSchema.parse({
            name: formData.name || undefined,
            slug: formData.slug || undefined,
            description: formData.description || undefined,
            seo_noindex: formData.seo_noindex || undefined,
        })

        const payload = {
            name: validated.name,
            slug: validated.slug,
            description: validated.description,
            seo_noindex: validated.seo_noindex === '1',
        }

        await updateTag(c.env, id, payload)
        return c.redirect('/admin/tags', 302)
    } catch (error: any) {
        return c.html(renderTagForm({
            tag,
            error: error.message,
            user: user!,
            csrfToken: csrfToken || ''
        }), 400)
    }
}

export async function handleTagsDelete(c: Context<{ Bindings: Env; Variables: AppContext }>) {
    const id = parseInt(c.req.param('id'))

    try {
        await deleteTag(c.env, id)
        return c.redirect('/admin/tags', 302)
    } catch (error: any) {
        return c.redirect(`/admin/tags?error=${encodeURIComponent(error.message)}`, 302)
    }
}
