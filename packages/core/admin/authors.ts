/** Gestão de autores, colunistas e perfis editoriais. */

import type { Context } from 'hono'
import type { Env, AppContext } from '../types'
import { z } from 'zod'
import { escapeHtml, renderAdminLayout, type AdminUser } from './ui'
import {
  listAuthorsForAdmin,
  getAdminAuthorById,
  createAuthor,
  updateAuthor,
  setAuthorActive,
  deleteAuthor,
  type AdminAuthor,
  type ListAuthorsAdminFilters,
} from '../db/authors'

const authorSchema = z.object({
  name: z.string().min(2, 'Informe o nome do autor.').max(255),
  slug: z.string().max(255).optional().default(''),
  email: z.string().email('Informe um e-mail válido.').optional().or(z.literal('')),
  bio: z.string().max(3000).optional().default(''),
  avatar_media_id: z.coerce.number().int().positive().optional().or(z.literal('')),
  social_twitter: z.string().max(255).optional().default(''),
  social_instagram: z.string().max(255).optional().default(''),
  social_linkedin: z.string().max(500).optional().default(''),
  author_type: z.enum(['staff', 'columnist', 'editorial', 'contributor']),
  column_name: z.string().max(255).optional().default(''),
  column_description: z.string().max(1000).optional().default(''),
})

const typeLabels: Record<string, string> = {
  staff: 'Equipe', columnist: 'Colunista', editorial: 'Editorial', contributor: 'Articulista',
}

function slugify(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'autor'
}

function notice(message?: string, error?: string): string {
  if (error) return `<div class="management-notice management-notice--error" role="alert">${escapeHtml(error)}</div>`
  if (message) return `<div class="management-notice" role="status">${escapeHtml(message)}</div>`
  return ''
}

function authorTypeBadge(type: string): string {
  return `<span class="management-badge management-badge--author-${escapeHtml(type)}">${escapeHtml(typeLabels[type] || type)}</span>`
}

function statusBadge(active: number): string {
  return `<span class="management-status ${active ? 'is-active' : 'is-inactive'}"><i></i>${active ? 'Ativo' : 'Arquivado'}</span>`
}

function renderAuthorsList(authors: AdminAuthor[], filters: ListAuthorsAdminFilters, csrfToken: string, message?: string, error?: string): string {
  const rows = authors.map(author => `
    <tr>
      <td data-label="Autor"><div class="management-person"><span class="management-avatar management-avatar--editorial">${escapeHtml(author.name).split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase()}</span><span><strong>${escapeHtml(author.name)}</strong><small>${escapeHtml(author.column_name || author.email || `/${author.slug}`)}</small></span></div></td>
      <td data-label="Perfil">${authorTypeBadge(author.author_type)}</td>
      <td data-label="Produção"><strong>${Number(author.post_count || 0)}</strong> <span class="management-muted">matéria(s)</span></td>
      <td data-label="Acesso">${author.user_id ? `<a class="management-author-link" href="/admin/users/${author.user_id}">${escapeHtml(author.linked_user_name || author.linked_user_email || 'Conta vinculada')}</a><small class="management-block">${author.linked_user_active ? 'Acesso ativo' : 'Acesso suspenso'}</small>` : '<span class="management-muted">Perfil editorial</span>'}</td>
      <td data-label="Status">${statusBadge(author.is_active)}</td>
      <td data-label="Ações"><div class="management-actions"><a href="/admin/authors/${author.id}" class="btn btn-outline btn-compact">Editar</a>${author.slug !== 'redacao' ? `<form method="POST" action="/admin/authors/${author.id}/${author.is_active ? 'disable' : 'enable'}"><input type="hidden" name="csrf_token" value="${csrfToken}"><button class="btn btn-compact ${author.is_active ? 'btn-muted' : 'btn-success'}" type="submit">${author.is_active ? 'Arquivar' : 'Reativar'}</button></form>` : ''}</div></td>
    </tr>
  `).join('')

  return `
    <section class="management-page">
      <header class="management-heading"><div><span class="management-kicker">Identidade editorial</span><h1>Autores e colunistas</h1><p>Organize assinaturas, colunas, perfis institucionais e seus vínculos com a equipe.</p></div><a href="/admin/authors/new" class="btn">Novo perfil de autor</a></header>
      ${notice(message, error)}
      <div class="management-stats"><article><span>Perfis exibidos</span><strong>${authors.length}</strong></article><article><span>Perfis ativos</span><strong>${authors.filter(a => a.is_active === 1).length}</strong></article><article><span>Colunistas</span><strong>${authors.filter(a => a.author_type === 'columnist').length}</strong></article></div>
      <form class="management-filters" method="GET" action="/admin/authors">
        <label class="management-search"><span>Buscar</span><input class="form-control" type="search" name="q" value="${escapeHtml(filters.q || '')}" placeholder="Nome, e-mail ou coluna"></label>
        <label><span>Perfil</span><select class="form-control" name="type"><option value="">Todos</option>${Object.entries(typeLabels).map(([value, label]) => `<option value="${value}" ${filters.author_type === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
        <label><span>Status</span><select class="form-control" name="status"><option value="">Todos</option><option value="active" ${filters.active === true ? 'selected' : ''}>Ativos</option><option value="inactive" ${filters.active === false ? 'selected' : ''}>Arquivados</option></select></label>
        <button class="btn btn-outline" type="submit">Filtrar</button><a class="management-clear" href="/admin/authors">Limpar</a>
      </form>
      <div class="management-table-wrap"><table class="management-table"><thead><tr><th>Autor</th><th>Perfil</th><th>Produção</th><th>Acesso</th><th>Status</th><th>Ações</th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="management-empty">Nenhum perfil encontrado.</td></tr>'}</tbody></table></div>
    </section>
  `
}

function renderAuthorForm(author: AdminAuthor | null, csrfToken: string, error?: string, message?: string): string {
  const isEdit = Boolean(author)
  const canDelete = Boolean(author && author.slug !== 'redacao' && !author.user_id && Number(author.post_count || 0) === 0)
  return `
    <section class="management-page management-page--narrow">
      <a class="management-back" href="/admin/authors">← Autores e colunistas</a>
      <header class="management-heading"><div><span class="management-kicker">${isEdit ? 'Perfil editorial' : 'Nova assinatura'}</span><h1>${isEdit ? escapeHtml(author!.name) : 'Novo perfil de autor'}</h1><p>Defina como a autoria será apresentada nas matérias e páginas de opinião.</p></div>${author ? statusBadge(author.is_active) : ''}</header>
      ${notice(message, error)}
      <form method="POST" action="${isEdit ? `/admin/authors/${author!.id}` : '/admin/authors'}">
        <div class="management-author-grid">
          <div class="card management-form"><div class="management-card-title"><span>Identidade pública</span></div>
            <div class="form-group"><label for="author-name">Nome de exibição</label><input id="author-name" class="form-control" name="name" value="${escapeHtml(author?.name || '')}" required maxlength="255"></div>
            <div class="management-inline-fields"><div class="form-group"><label for="author-email">E-mail interno</label><input id="author-email" class="form-control" type="email" name="email" value="${escapeHtml(author?.email || '')}"></div><div class="form-group"><label for="author-slug">Endereço público</label><input id="author-slug" class="form-control" name="slug" value="${escapeHtml(author?.slug || '')}" placeholder="gerado automaticamente"></div></div>
            <div class="form-group"><label for="author-bio">Biografia</label><textarea id="author-bio" class="form-control" name="bio" rows="6" maxlength="3000" placeholder="Experiência, área de cobertura e contexto profissional.">${escapeHtml(author?.bio || '')}</textarea></div>
            <div class="form-group"><label for="author-avatar">Foto na biblioteca (ID)</label><div class="management-media-field"><input id="author-avatar" class="form-control" type="number" min="1" name="avatar_media_id" value="${author?.avatar_media_id || ''}" placeholder="ID"><a class="btn btn-outline" href="/admin/media" target="_blank" rel="noopener">Abrir biblioteca</a></div></div>
          </div>
          <div class="management-side-stack">
            <div class="card management-form"><div class="management-card-title"><span>Função editorial</span></div><div class="form-group"><label for="author-type">Tipo de perfil</label><select id="author-type" class="form-control" name="author_type" onchange="document.getElementById('column-settings').hidden=this.value!=='columnist'">${Object.entries(typeLabels).map(([value, label]) => `<option value="${value}" ${author?.author_type === value || (!author && value === 'staff') ? 'selected' : ''}>${label}</option>`).join('')}</select></div><div id="column-settings" ${author?.author_type === 'columnist' ? '' : 'hidden'}><div class="form-group"><label>Nome da coluna</label><input class="form-control" name="column_name" value="${escapeHtml(author?.column_name || '')}"></div><div class="form-group"><label>Descrição da coluna</label><textarea class="form-control" name="column_description" rows="4">${escapeHtml(author?.column_description || '')}</textarea></div></div></div>
            <div class="card management-form"><div class="management-card-title"><span>Presença digital</span></div><div class="form-group"><label>Instagram</label><input class="form-control" name="social_instagram" value="${escapeHtml(author?.social_instagram || '')}" placeholder="usuario"></div><div class="form-group"><label>X / Twitter</label><input class="form-control" name="social_twitter" value="${escapeHtml(author?.social_twitter || '')}" placeholder="usuario"></div><div class="form-group"><label>LinkedIn</label><input class="form-control" name="social_linkedin" value="${escapeHtml(author?.social_linkedin || '')}" placeholder="https://linkedin.com/in/..."></div></div>
            ${author?.user_id ? `<article class="card management-access-card"><div class="management-card-title"><span>Acesso vinculado</span></div><p><strong>${escapeHtml(author.linked_user_name || author.name)}</strong><br>${escapeHtml(author.linked_user_email || '')}</p><a href="/admin/users/${author.user_id}">Gerenciar conta e permissões →</a></article>` : ''}
          </div>
        </div>
        <input type="hidden" name="csrf_token" value="${csrfToken}"><div class="management-form-actions"><button class="btn" type="submit">${isEdit ? 'Salvar perfil' : 'Criar perfil'}</button><a class="btn btn-outline" href="/admin/authors">Cancelar</a></div>
      </form>
      ${author ? `<div class="management-lifecycle"><article class="card management-access-action"><div><strong>${author.is_active ? 'Arquivar perfil' : 'Reativar perfil'}</strong><p>${author.is_active ? 'Remove o autor das seleções futuras, preservando matérias e páginas existentes.' : 'Disponibiliza novamente o autor para novas publicações.'}</p></div>${author.slug === 'redacao' ? '<span class="management-self">Perfil institucional protegido.</span>' : `<form method="POST" action="/admin/authors/${author.id}/${author.is_active ? 'disable' : 'enable'}"><input type="hidden" name="csrf_token" value="${csrfToken}"><button class="btn ${author.is_active ? 'btn-danger' : 'btn-success'}" type="submit">${author.is_active ? 'Arquivar perfil' : 'Reativar perfil'}</button></form>`}</article><article class="card management-danger"><span class="management-kicker">Zona de segurança</span><h2>Excluir perfil</h2><p>${author.slug === 'redacao' ? 'A autoria institucional Redação é permanente.' : author.user_id ? 'Este perfil pertence a uma conta da equipe. Gerencie o acesso vinculado.' : Number(author.post_count || 0) > 0 ? `Há ${author.post_count} matéria(s) assinada(s). Arquive o perfil para preservar a autoria.` : 'Disponível porque este perfil não possui matérias nem conta vinculada.'}</p>${canDelete ? `<form method="POST" action="/admin/authors/${author.id}/delete"><input type="hidden" name="csrf_token" value="${csrfToken}"><label>Confirme digitando o nome do autor<input class="form-control" name="confirmation" required autocomplete="off" placeholder="${escapeHtml(author.name)}"></label><button class="btn btn-danger" type="submit">Excluir perfil definitivamente</button></form>` : ''}</article></div>` : ''}
    </section>
  `
}

function page(c: Context<{ Bindings: Env; Variables: AppContext }>, title: string, bodyHtml: string, status = 200) {
  const user = c.get('adminUser') as AdminUser
  const csrfToken = c.get('csrfToken') as string
  return c.html(renderAdminLayout({ title, user, bodyHtml, activeTab: 'authors', csrfToken }), status as 200)
}

function parseId(c: Context): number | null {
  const id = Number(c.req.param('id'))
  return Number.isInteger(id) && id > 0 ? id : null
}

async function authorBody(c: Context<{ Bindings: Env; Variables: AppContext }>, id: number, error?: string, message?: string) {
  const author = await getAdminAuthorById(c.env, id)
  return author ? renderAuthorForm(author, c.get('csrfToken') as string, error, message) : null
}

export async function handleAuthorsList(c: Context<{ Bindings: Env; Variables: AppContext }>) {
  const status = c.req.query('status')
  const type = c.req.query('type')
  const filters: ListAuthorsAdminFilters = { q: c.req.query('q')?.trim() || undefined, active: status === 'active' ? true : status === 'inactive' ? false : undefined, author_type: ['staff', 'columnist', 'editorial', 'contributor'].includes(type || '') ? type as AdminAuthor['author_type'] : undefined }
  const authors = await listAuthorsForAdmin(c.env, filters)
  return page(c, 'Autores e colunistas', renderAuthorsList(authors, filters, c.get('csrfToken') as string, c.req.query('message'), c.req.query('error')))
}

export async function handleAuthorsNew(c: Context<{ Bindings: Env; Variables: AppContext }>) {
  return page(c, 'Novo autor', renderAuthorForm(null, c.get('csrfToken') as string))
}

function authorPayload(form: Record<string, string | File>) {
  const data = authorSchema.parse(form)
  return { name: data.name, slug: data.slug ? slugify(data.slug) : slugify(data.name), email: data.email || null, bio: data.bio || null, avatar_media_id: typeof data.avatar_media_id === 'number' ? data.avatar_media_id : null, social_twitter: data.social_twitter || null, social_instagram: data.social_instagram || null, social_linkedin: data.social_linkedin || null, author_type: data.author_type, is_columnist: data.author_type === 'columnist' ? 1 : 0, column_name: data.author_type === 'columnist' ? data.column_name || null : null, column_description: data.author_type === 'columnist' ? data.column_description || null : null }
}

export async function handleAuthorsCreate(c: Context<{ Bindings: Env; Variables: AppContext }>) {
  try {
    const form = await c.req.parseBody()
    const id = await createAuthor(c.env, { ...authorPayload(form), is_active: 1 })
    return c.redirect(`/admin/authors/${id}?message=${encodeURIComponent('Perfil de autor criado.')}`, 303)
  } catch (error) {
    return page(c, 'Novo autor', renderAuthorForm(null, c.get('csrfToken') as string, error instanceof Error ? error.message : 'Não foi possível criar o perfil.'), 400)
  }
}

export async function handleAuthorsEdit(c: Context<{ Bindings: Env; Variables: AppContext }>) {
  const id = parseId(c)
  if (!id) return c.notFound()
  const body = await authorBody(c, id, c.req.query('error'), c.req.query('message'))
  return body ? page(c, 'Editar autor', body) : c.notFound()
}

export async function handleAuthorsUpdate(c: Context<{ Bindings: Env; Variables: AppContext }>) {
  const id = parseId(c)
  if (!id) return c.notFound()
  try {
    await updateAuthor(c.env, id, authorPayload(await c.req.parseBody()))
    return c.redirect(`/admin/authors/${id}?message=${encodeURIComponent('Perfil editorial atualizado.')}`, 303)
  } catch (error) {
    const body = await authorBody(c, id, error instanceof Error ? error.message : 'Não foi possível atualizar o perfil.')
    return body ? page(c, 'Editar autor', body, 400) : c.notFound()
  }
}

async function changeActive(c: Context<{ Bindings: Env; Variables: AppContext }>, active: boolean) {
  const id = parseId(c)
  if (!id) return c.notFound()
  try {
    await setAuthorActive(c.env, id, active)
    return c.redirect(`/admin/authors/${id}?message=${encodeURIComponent(active ? 'Perfil reativado.' : 'Perfil arquivado; autoria e matérias foram preservadas.')}`, 303)
  } catch (error) {
    return c.redirect(`/admin/authors/${id}?error=${encodeURIComponent(error instanceof Error ? error.message : 'Não foi possível alterar o perfil.')}`, 303)
  }
}

export const handleAuthorsDisable = (c: Context<{ Bindings: Env; Variables: AppContext }>) => changeActive(c, false)
export const handleAuthorsEnable = (c: Context<{ Bindings: Env; Variables: AppContext }>) => changeActive(c, true)

export async function handleAuthorsDelete(c: Context<{ Bindings: Env; Variables: AppContext }>) {
  const id = parseId(c)
  if (!id) return c.notFound()
  const author = await getAdminAuthorById(c.env, id)
  if (!author) return c.notFound()
  try {
    const form = await c.req.parseBody()
    if (String(form.confirmation || '').trim().toLocaleLowerCase('pt-BR') !== author.name.trim().toLocaleLowerCase('pt-BR')) throw new Error('A confirmação não corresponde ao nome do autor.')
    await deleteAuthor(c.env, id)
    return c.redirect(`/admin/authors?message=${encodeURIComponent('Perfil de autor excluído.')}`, 303)
  } catch (error) {
    return c.redirect(`/admin/authors/${id}?error=${encodeURIComponent(error instanceof Error ? error.message : 'Não foi possível excluir o perfil.')}`, 303)
  }
}
