/** Gestão administrativa de equipe e acessos. */

import type { Context } from 'hono'
import type { Env, AppContext } from '../types'
import { z } from 'zod'
import { escapeHtml, renderAdminLayout, type AdminUser } from './ui'
import {
  listStaffUsers,
  getStaffUserById,
  createStaffUser,
  updateStaffUser,
  setStaffPassword,
  setStaffActive,
  deleteStaffUser,
  getStaffUserReferenceSummary,
  normalizeRole,
  type StaffUser,
  type StaffUserReferenceSummary,
  type ListStaffUsersFilters,
  type CreateStaffUserPayload,
} from '../db/users'
import { ensureAuthorForAdminUser } from '../db/authors'

const createUserSchema = z.object({
  email: z.string().email('Informe um e-mail válido.').min(3).max(255),
  password: z.string().min(8, 'A senha deve ter ao menos 8 caracteres.').max(128),
  name: z.string().min(2, 'Informe o nome completo.').max(255),
  role: z.enum(['director', 'editor', 'writer']),
  must_change_password: z.boolean().optional(),
})

const updateUserSchema = z.object({
  email: z.string().email('Informe um e-mail válido.').min(3).max(255),
  name: z.string().min(2, 'Informe o nome completo.').max(255),
  role: z.enum(['director', 'editor', 'writer']),
})

const resetPasswordSchema = z.object({
  password: z.string().min(8, 'A senha deve ter ao menos 8 caracteres.').max(128),
})

const roleLabels: Record<string, string> = {
  director: 'Diretor', admin: 'Diretor', editor: 'Editor', writer: 'Redator',
}

const roleDescriptions: Record<string, string> = {
  director: 'Administra equipe, configurações e toda a operação editorial.',
  editor: 'Edita, revisa e publica conteúdos da redação.',
  writer: 'Produz e edita matérias, sem administrar acessos.',
}

function notice(message?: string, error?: string): string {
  if (error) return `<div class="management-notice management-notice--error" role="alert">${escapeHtml(error)}</div>`
  if (message) return `<div class="management-notice" role="status">${escapeHtml(message)}</div>`
  return ''
}

function roleBadge(role: string): string {
  const normalized = normalizeRole(role)
  return `<span class="management-badge management-badge--${normalized}">${roleLabels[normalized]}</span>`
}

function statusBadge(active: number): string {
  return `<span class="management-status ${active ? 'is-active' : 'is-inactive'}"><i></i>${active ? 'Ativo' : 'Inativo'}</span>`
}

function renderUsersList(
  users: StaffUser[],
  filters: ListStaffUsersFilters,
  csrfToken: string,
  currentUser: AdminUser,
  message?: string,
  error?: string,
): string {
  const all = users.length
  const active = users.filter(user => user.is_active === 1).length
  const directors = users.filter(user => normalizeRole(user.role) === 'director' && user.is_active === 1).length
  const rows = users.map(user => `
    <tr>
      <td data-label="Colaborador"><div class="management-person"><span class="management-avatar">${escapeHtml(user.name).split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase()}</span><span><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.email)}</small></span></div></td>
      <td data-label="Função">${roleBadge(user.role)}</td>
      <td data-label="Autoria">${user.author_id ? `<a class="management-author-link" href="/admin/authors/${user.author_id}">${escapeHtml(user.author_name || 'Perfil editorial')}</a>` : `<form method="POST" action="/admin/users/${user.id}/ensure-author"><input type="hidden" name="csrf_token" value="${csrfToken}"><button class="management-link-button" type="submit">Criar perfil</button></form>`}</td>
      <td data-label="Status">${statusBadge(user.is_active)}</td>
      <td data-label="Último acesso" class="management-muted">${user.last_login_at ? new Date(user.last_login_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Nunca acessou'}</td>
      <td data-label="Ações"><div class="management-actions"><a href="/admin/users/${user.id}" class="btn btn-outline btn-compact">Editar</a>${user.id !== currentUser.id ? `<form method="POST" action="/admin/users/${user.id}/${user.is_active ? 'disable' : 'enable'}"><input type="hidden" name="csrf_token" value="${csrfToken}"><button class="btn btn-compact ${user.is_active ? 'btn-muted' : 'btn-success'}" type="submit">${user.is_active ? 'Desativar' : 'Reativar'}</button></form>` : '<span class="management-self">Sua conta</span>'}</div></td>
    </tr>
  `).join('')

  return `
    <section class="management-page">
      <header class="management-heading"><div><span class="management-kicker">Governança</span><h1>Equipe e acessos</h1><p>Controle quem entra no CMS, as responsabilidades e o vínculo com a autoria editorial.</p></div><a href="/admin/users/new" class="btn">Adicionar colaborador</a></header>
      ${notice(message, error)}
      <div class="management-stats"><article><span>Contas exibidas</span><strong>${all}</strong></article><article><span>Acessos ativos</span><strong>${active}</strong></article><article><span>Diretores ativos</span><strong>${directors}</strong></article></div>
      <form class="management-filters" method="GET" action="/admin/users">
        <label class="management-search"><span>Buscar</span><input class="form-control" type="search" name="q" value="${escapeHtml(filters.q || '')}" placeholder="Nome ou e-mail"></label>
        <label><span>Função</span><select class="form-control" name="role"><option value="">Todas</option><option value="director" ${filters.role === 'director' ? 'selected' : ''}>Diretores</option><option value="editor" ${filters.role === 'editor' ? 'selected' : ''}>Editores</option><option value="writer" ${filters.role === 'writer' ? 'selected' : ''}>Redatores</option></select></label>
        <label><span>Status</span><select class="form-control" name="status"><option value="">Todos</option><option value="active" ${filters.active === true ? 'selected' : ''}>Ativos</option><option value="inactive" ${filters.active === false ? 'selected' : ''}>Inativos</option></select></label>
        <button class="btn btn-outline" type="submit">Filtrar</button><a class="management-clear" href="/admin/users">Limpar</a>
      </form>
      <div class="management-table-wrap"><table class="management-table"><thead><tr><th>Colaborador</th><th>Função</th><th>Autoria</th><th>Status</th><th>Último acesso</th><th>Ações</th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="management-empty">Nenhum colaborador encontrado.</td></tr>'}</tbody></table></div>
    </section>
  `
}

function renderUserForm(
  user: StaffUser | null,
  currentUser: AdminUser,
  csrfToken: string,
  references?: StaffUserReferenceSummary,
  error?: string,
  message?: string,
): string {
  const isEdit = Boolean(user)
  const isSelf = user?.id === currentUser.id
  const normalizedRole = normalizeRole(user?.role || 'writer')
  const refText = references?.resources.map(item => `${item.count} ${item.label}`).join(', ')
  return `
    <section class="management-page management-page--narrow">
      <a class="management-back" href="/admin/users">← Equipe e acessos</a>
      <header class="management-heading"><div><span class="management-kicker">${isEdit ? 'Conta da equipe' : 'Novo acesso'}</span><h1>${isEdit ? escapeHtml(user!.name) : 'Adicionar colaborador'}</h1><p>${isEdit ? 'Atualize a identidade, a função e as credenciais deste acesso.' : 'O colaborador receberá um perfil editorial vinculado automaticamente.'}</p></div>${user ? statusBadge(user.is_active) : ''}</header>
      ${notice(message, error)}
      <div class="management-form-grid">
        <form class="card management-form" method="POST" action="${isEdit ? `/admin/users/${user!.id}` : '/admin/users'}">
          <input type="hidden" name="csrf_token" value="${csrfToken}"><div class="management-card-title"><span>Identidade e função</span><small>Campos obrigatórios</small></div>
          <div class="form-group"><label for="staff-name">Nome completo</label><input id="staff-name" class="form-control" name="name" value="${escapeHtml(user?.name || '')}" required minlength="2" maxlength="255"></div>
          <div class="form-group"><label for="staff-email">E-mail de acesso</label><input id="staff-email" class="form-control" type="email" name="email" value="${escapeHtml(user?.email || '')}" required maxlength="255"></div>
          <div class="form-group"><label for="staff-role">Nível de acesso</label><select id="staff-role" class="form-control" name="role" required><option value="writer" ${normalizedRole === 'writer' ? 'selected' : ''}>Redator</option><option value="editor" ${normalizedRole === 'editor' ? 'selected' : ''}>Editor</option><option value="director" ${normalizedRole === 'director' ? 'selected' : ''}>Diretor</option></select><div class="management-role-guide">${Object.entries(roleDescriptions).map(([role, description]) => `<p><strong>${roleLabels[role]}:</strong> ${description}</p>`).join('')}</div></div>
          ${!isEdit ? `<div class="form-group"><label for="staff-password">Senha provisória</label><input id="staff-password" class="form-control" type="password" name="password" required minlength="8" maxlength="128" autocomplete="new-password"><small>Use ao menos 8 caracteres.</small></div><label class="management-check"><input type="checkbox" name="must_change_password" value="1" checked><span>Exigir troca de senha no primeiro acesso</span></label>` : ''}
          <div class="management-form-actions"><button class="btn" type="submit">${isEdit ? 'Salvar alterações' : 'Criar acesso'}</button><a class="btn btn-outline" href="/admin/users">Cancelar</a></div>
        </form>
        <aside class="management-side-stack">
          <article class="card management-access-card"><div class="management-card-title"><span>Resumo do acesso</span></div>${roleBadge(user?.role || 'writer')}<p>${roleDescriptions[normalizedRole]}</p>${user?.author_id ? `<a href="/admin/authors/${user.author_id}">Abrir perfil de autoria →</a>` : isEdit ? `<p>Esta conta antiga ainda não possui autoria vinculada.</p><form method="POST" action="/admin/users/${user!.id}/ensure-author"><input type="hidden" name="csrf_token" value="${csrfToken}"><button class="btn btn-outline" type="submit">Criar perfil editorial</button></form>` : '<small>O perfil de autoria será criado com a conta.</small>'}</article>
          ${isEdit ? `<details class="card management-security"><summary>Redefinir senha</summary><form method="POST" action="/admin/users/${user!.id}/reset-password"><input type="hidden" name="csrf_token" value="${csrfToken}"><label>Nova senha<input class="form-control" type="password" name="password" minlength="8" maxlength="128" required autocomplete="new-password"></label><button class="btn btn-outline" type="submit">Definir senha provisória</button></form></details><article class="card management-access-action"><div><strong>${user!.is_active ? 'Suspender acesso' : 'Restaurar acesso'}</strong><p>${user!.is_active ? 'Mantém autoria e histórico, mas bloqueia novos logins.' : 'Permite que o colaborador volte a entrar no CMS.'}</p></div>${isSelf ? '<span class="management-self">Você não pode suspender a própria conta.</span>' : `<form method="POST" action="/admin/users/${user!.id}/${user!.is_active ? 'disable' : 'enable'}"><input type="hidden" name="csrf_token" value="${csrfToken}"><button class="btn ${user!.is_active ? 'btn-danger' : 'btn-success'}" type="submit" onclick="return confirm('${user!.is_active ? 'Suspender este acesso?' : 'Reativar este acesso?'}')">${user!.is_active ? 'Desativar acesso' : 'Reativar acesso'}</button></form>`}</article><article class="card management-danger"><span class="management-kicker">Zona de segurança</span><h2>Exclusão permanente</h2><p>${references?.total ? `Esta conta possui histórico (${escapeHtml(refText)}). Por segurança, use a desativação.` : 'Disponível somente para uma conta sem histórico editorial. O perfil de autor será mantido sem vínculo.'}</p>${isSelf ? '<span class="management-self">Sua própria conta não pode ser excluída.</span>' : references?.total ? '' : `<form method="POST" action="/admin/users/${user!.id}/delete"><input type="hidden" name="csrf_token" value="${csrfToken}"><label>Confirme digitando o e-mail<input class="form-control" name="confirmation" autocomplete="off" required placeholder="${escapeHtml(user!.email)}"></label><button class="btn btn-danger" type="submit">Excluir conta definitivamente</button></form>`}</article>` : ''}
        </aside>
      </div>
    </section>
  `
}

function page(c: Context<{ Bindings: Env; Variables: AppContext }>, title: string, bodyHtml: string, status = 200) {
  const user = c.get('adminUser') as AdminUser
  const csrfToken = c.get('csrfToken') as string
  return c.html(renderAdminLayout({ title, user, bodyHtml, activeTab: 'users', csrfToken }), status as 200)
}

function parseId(c: Context): number | null {
  const id = Number(c.req.param('id'))
  return Number.isInteger(id) && id > 0 ? id : null
}

async function editBody(c: Context<{ Bindings: Env; Variables: AppContext }>, id: number, error?: string, message?: string) {
  const adminUser = c.get('adminUser') as AdminUser
  const user = await getStaffUserById(c.env, id)
  if (!user) return null
  const references = await getStaffUserReferenceSummary(c.env, id)
  return renderUserForm(user, adminUser, c.get('csrfToken') as string, references, error, message)
}

export async function handleUsersList(c: Context<{ Bindings: Env; Variables: AppContext }>) {
  const currentUser = c.get('adminUser') as AdminUser
  const status = c.req.query('status')
  const filters: ListStaffUsersFilters = { role: ['director', 'editor', 'writer'].includes(c.req.query('role') || '') ? c.req.query('role') as ListStaffUsersFilters['role'] : undefined, q: c.req.query('q')?.trim() || undefined, active: status === 'active' ? true : status === 'inactive' ? false : undefined }
  const users = await listStaffUsers(c.env, filters)
  return page(c, 'Equipe e acessos', renderUsersList(users, filters, c.get('csrfToken') as string, currentUser, c.req.query('message'), c.req.query('error')))
}

export async function handleUsersNew(c: Context<{ Bindings: Env; Variables: AppContext }>) {
  return page(c, 'Novo colaborador', renderUserForm(null, c.get('adminUser') as AdminUser, c.get('csrfToken') as string))
}

export async function handleUsersCreate(c: Context<{ Bindings: Env; Variables: AppContext }>) {
  const adminUser = c.get('adminUser') as AdminUser
  try {
    const form = await c.req.parseBody()
    const payload = createUserSchema.parse({ email: form.email, password: form.password, name: form.name, role: form.role, must_change_password: form.must_change_password === '1' }) as CreateStaffUserPayload
    const id = await createStaffUser(c.env, payload, adminUser.id)
    return c.redirect(`/admin/users/${id}?message=${encodeURIComponent('Colaborador criado e perfil de autoria vinculado.')}`, 303)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível criar o colaborador.'
    return page(c, 'Novo colaborador', renderUserForm(null, adminUser, c.get('csrfToken') as string, undefined, message), 400)
  }
}

export async function handleUsersEdit(c: Context<{ Bindings: Env; Variables: AppContext }>) {
  const id = parseId(c)
  if (!id) return c.notFound()
  const body = await editBody(c, id, c.req.query('error'), c.req.query('message'))
  return body ? page(c, 'Editar acesso', body) : c.notFound()
}

export async function handleUsersUpdate(c: Context<{ Bindings: Env; Variables: AppContext }>) {
  const id = parseId(c)
  if (!id) return c.notFound()
  try {
    const form = await c.req.parseBody()
    const payload = updateUserSchema.parse({ email: form.email, name: form.name, role: form.role })
    await updateStaffUser(c.env, id, payload, (c.get('adminUser') as AdminUser).id)
    return c.redirect(`/admin/users/${id}?message=${encodeURIComponent('Dados e permissões atualizados.')}`, 303)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível atualizar o acesso.'
    const body = await editBody(c, id, message)
    return body ? page(c, 'Editar acesso', body, 400) : c.notFound()
  }
}

export async function handleUsersResetPassword(c: Context<{ Bindings: Env; Variables: AppContext }>) {
  const id = parseId(c)
  if (!id) return c.notFound()
  try {
    const form = await c.req.parseBody()
    const { password } = resetPasswordSchema.parse({ password: form.password })
    await setStaffPassword(c.env, id, password, (c.get('adminUser') as AdminUser).id)
    return c.redirect(`/admin/users/${id}?message=${encodeURIComponent('Senha provisória definida. A troca será exigida no próximo acesso.')}`, 303)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível redefinir a senha.'
    const body = await editBody(c, id, message)
    return body ? page(c, 'Editar acesso', body, 400) : c.notFound()
  }
}

async function changeActive(c: Context<{ Bindings: Env; Variables: AppContext }>, active: boolean) {
  const id = parseId(c)
  if (!id) return c.notFound()
  try {
    await setStaffActive(c.env, id, active, (c.get('adminUser') as AdminUser).id)
    return c.redirect(`/admin/users/${id}?message=${encodeURIComponent(active ? 'Acesso reativado.' : 'Acesso desativado. O histórico foi preservado.')}`, 303)
  } catch (error) {
    return c.redirect(`/admin/users/${id}?error=${encodeURIComponent(error instanceof Error ? error.message : 'Não foi possível alterar o acesso.')}`, 303)
  }
}

export const handleUsersDisable = (c: Context<{ Bindings: Env; Variables: AppContext }>) => changeActive(c, false)
export const handleUsersEnable = (c: Context<{ Bindings: Env; Variables: AppContext }>) => changeActive(c, true)

export async function handleUsersEnsureAuthor(c: Context<{ Bindings: Env; Variables: AppContext }>) {
  const id = parseId(c)
  if (!id) return c.notFound()
  const target = await getStaffUserById(c.env, id)
  if (!target) return c.notFound()
  try {
    const author = await ensureAuthorForAdminUser(c.env, target)
    if (!author) throw new Error('Não foi possível criar o perfil editorial.')
    return c.redirect(`/admin/users/${id}?message=${encodeURIComponent('Perfil de autoria criado e vinculado à conta.')}`, 303)
  } catch (error) {
    return c.redirect(`/admin/users/${id}?error=${encodeURIComponent(error instanceof Error ? error.message : 'Não foi possível vincular a autoria.')}`, 303)
  }
}

export async function handleUsersDelete(c: Context<{ Bindings: Env; Variables: AppContext }>) {
  const id = parseId(c)
  if (!id) return c.notFound()
  const target = await getStaffUserById(c.env, id)
  if (!target) return c.notFound()
  try {
    const form = await c.req.parseBody()
    if (String(form.confirmation || '').trim().toLowerCase() !== target.email.toLowerCase()) throw new Error('A confirmação não corresponde ao e-mail da conta.')
    await deleteStaffUser(c.env, id, (c.get('adminUser') as AdminUser).id)
    return c.redirect(`/admin/users?message=${encodeURIComponent('Conta excluída. O perfil de autoria foi preservado.')}`, 303)
  } catch (error) {
    return c.redirect(`/admin/users/${id}?error=${encodeURIComponent(error instanceof Error ? error.message : 'Não foi possível excluir a conta.')}`, 303)
  }
}
