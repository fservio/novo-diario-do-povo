/**
 * Admin Users Management (SSR)
 * CRUD for staff users (director, editor, writer)
 */

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
  normalizeRole,
  roleRank,
  type ListStaffUsersFilters,
  type CreateStaffUserPayload,
} from '../db/users'

// ============================================================================
// Zod Schemas
// ============================================================================

const createUserSchema = z.object({
  email: z.string().email().min(3).max(255),
  password: z.string().min(8).max(128),
  name: z.string().min(2).max(255),
  role: z.enum(['director', 'editor', 'writer']),
  must_change_password: z.boolean().optional(),
})

const updateUserSchema = z.object({
  email: z.string().email().min(3).max(255).optional(),
  name: z.string().min(2).max(255).optional(),
  role: z.enum(['director', 'editor', 'writer']).optional(),
})

const resetPasswordSchema = z.object({
  password: z.string().min(8).max(128),
})

// ============================================================================
// Render Functions
// ============================================================================

function renderUsersList(users: any[], filters: ListStaffUsersFilters, csrfToken: string): string {
  const roleColors: Record<string, string> = {
    director: 'bg-purple-100 text-purple-800',
    admin: 'bg-purple-100 text-purple-800',
    editor: 'bg-blue-100 text-blue-800',
    writer: 'bg-green-100 text-green-800',
  }

  const rolesHTML = `
    <div style="margin-bottom: 2rem; display: flex; flex-wrap: wrap; gap: 0.75rem;">
      <a href="/admin/users" 
         class="btn" style="${!filters.role ? 'background: var(--accent);' : 'background: var(--bg-card); color: var(--text-main); border: 1px solid var(--border-color);'}">
        Todos
      </a>
      <a href="/admin/users?role=director" 
         class="btn" style="${filters.role === 'director' ? 'background: var(--accent);' : 'background: var(--bg-card); color: var(--text-main); border: 1px solid var(--border-color);'}">
        Diretores
      </a>
      <a href="/admin/users?role=editor" 
         class="btn" style="${filters.role === 'editor' ? 'background: var(--accent);' : 'background: var(--bg-card); color: var(--text-main); border: 1px solid var(--border-color);'}">
        Editores
      </a>
      <a href="/admin/users?role=writer" 
         class="btn" style="${filters.role === 'writer' ? 'background: var(--accent);' : 'background: var(--bg-card); color: var(--text-main); border: 1px solid var(--border-color);'}">
        Redatores
      </a>
    </div>
  `

  const usersRows = users.map(user => {
    const roleDisplay = normalizeRole(user.role)
    const statusBadge = user.is_active
      ? '<span style="display: inline-flex; align-items: center; justify-content: center; padding: 0.25rem 0.5rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; background: rgba(16, 185, 129, 0.1); color: #10b981;">Ativo</span>'
      : '<span style="display: inline-flex; align-items: center; justify-content: center; padding: 0.25rem 0.5rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; background: rgba(239, 68, 68, 0.1); color: #ef4444;">Inativo</span>'

    return `
      <tr>
        <td>
          <div style="font-weight: 700;">${escapeHtml(user.name)}</div>
          <div style="font-size: 0.8125rem; color: var(--text-muted);">${escapeHtml(user.email)}</div>
        </td>
        <td>
          <span style="font-size: 0.8125rem; font-weight: 600; text-transform: uppercase; color: var(--text-muted);">
            ${roleDisplay}
          </span>
        </td>
        <td>${statusBadge}</td>
        <td style="color: var(--text-muted); font-size: 0.875rem;">
          ${user.last_login_at ? new Date(user.last_login_at).toLocaleDateString('pt-BR') : 'Nunca'}
        </td>
        <td>
          <a href="/admin/users/${user.id}" class="btn" style="padding: 0.4rem 0.8rem; font-size: 0.75rem; background: var(--bg-main); color: var(--text-main); border: 1px solid var(--border-color);">
            Editar
          </a>
        </td>
      </tr>
    `
  }).join('')

  return `
    <div style="margin-bottom: 2rem; display: flex; justify-content: space-between; align-items: center;">
      <h1 class="section-title" style="margin: 0;">Usuários</h1>
      <a href="/admin/users/new" class="btn">
        <span>+</span> Novo Usuário
      </a>
    </div>

    ${rolesHTML}

    <div class="card" style="padding: 0; overflow: hidden;">
      <table>
        <thead>
          <tr>
            <th>Nome / Email</th>
            <th>Papel</th>
            <th>Status</th>
            <th>Último Login</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${usersRows}
        </tbody>
      </table>
    </div>
  `
}

function renderUserForm(user: any | null, csrfToken: string, error?: string): string {
  const isEdit = !!user
  const title = isEdit ? 'Editar Usuário' : 'Novo Usuário'

  const errorHTML = error ? `
    <div class="error" style="margin-bottom: 2rem; padding: 1.25rem; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: var(--radius-md); color: #ef4444; font-weight: 500;">
      ⚠️ ${escapeHtml(error)}
    </div>
  ` : ''

  const formAction = isEdit ? `/admin/users/${user!.id}` : '/admin/users'

  return `
    <div style="max-width: 800px;">
      <div style="margin-bottom: 2rem;">
        <a href="/admin/users" style="color: var(--text-muted); text-decoration: none; font-size: 0.875rem; font-weight: 600; display: flex; align-items: center; gap: 0.25rem;">
          ← Voltar para a lista
        </a>
        <h1 class="section-title" style="margin-top: 0.5rem;">${title}</h1>
      </div>

      ${errorHTML}

      <div class="card">
        <form method="POST" action="${formAction}">
          <input type="hidden" name="csrf_token" value="${csrfToken}" />

          <div class="field">
            <label>Email *</label>
            <input 
              type="email" 
              name="email" 
              value="${escapeHtml(user?.email || '')}"
              required
              placeholder="exemplo@jornal.com"
            />
          </div>

          <div class="field">
            <label>Nome Completo *</label>
            <input 
              type="text" 
              name="name" 
              value="${escapeHtml(user?.name || '')}"
              required
              placeholder="Nome do colaborador"
            />
          </div>

          <div class="field">
            <label>Papel (Cargo) *</label>
            <select name="role" required>
              <option value="writer" ${user?.role === 'writer' ? 'selected' : ''}>Redator</option>
              <option value="editor" ${user?.role === 'editor' ? 'selected' : ''}>Editor</option>
              <option value="director" ${user?.role === 'director' || user?.role === 'admin' ? 'selected' : ''}>Diretor</option>
            </select>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;">
              <strong>Redator:</strong> cria e edita posts | <strong>Editor:</strong> publica tudo | <strong>Diretor:</strong> acesso total
            </div>
          </div>

          ${!isEdit ? `
            <div class="field">
              <label>Senha Provisória *</label>
              <input 
                type="password" 
                name="password" 
                required
                minlength="8"
                placeholder="Mínimo 8 caracteres"
              />
            </div>

            <div class="field">
              <label style="display: flex; align-items: center; gap: 0.75rem; cursor: pointer; padding: 0.75rem; background: var(--bg-main); border-radius: var(--radius-md); border: 1px solid var(--border-color);">
                <input type="checkbox" name="must_change_password" value="1" style="width: auto; margin: 0;" />
                <span style="font-weight: 600;">Forçar troca de senha no primeiro login</span>
              </label>
            </div>
          ` : ''}

          <div style="display: flex; gap: 1rem; margin-top: 2rem; border-top: 1px solid var(--border-color); padding-top: 2rem;">
            <button type="submit" class="btn" style="min-width: 150px;">
               ${isEdit ? 'Salvar Alterações' : 'Criar Usuário'}
            </button>
            <a href="/admin/users" class="btn" style="background: var(--bg-main); color: var(--text-main); border: 1px solid var(--border-color); text-decoration: none;">
              Cancelar
            </a>
          </div>
        </form>
      </div>

      ${isEdit ? `
        <div class="card" style="margin-top: 2rem;">
          <h2 style="font-size: 1.125rem; font-weight: 700; mb-6; color: var(--text-main);">🔒 Segurança & Ações</h2>

          <div style="display: flex; flex-direction: column; gap: 1.5rem; margin-top: 1.5rem;">
            <!-- Reset Password -->
            <details style="border: 1px solid var(--border-color); border-radius: var(--radius-md); overflow: hidden;">
              <summary style="cursor: pointer; font-weight: 700; padding: 1rem; background: var(--bg-main); color: #f59e0b;">
                🔄 Alterar / Resetar Senha
              </summary>
              <form method="POST" action="/admin/users/${user.id}/reset-password" style="padding: 1.5rem; background: var(--bg-card);">
                <input type="hidden" name="csrf_token" value="${csrfToken}" />
                <div class="field">
                  <input 
                    type="password" 
                    name="password" 
                    placeholder="Nova senha (mín. 8 caracteres)"
                    required
                    minlength="8"
                  />
                </div>
                <button type="submit" class="btn" style="background: #f59e0b; width: 100%;">
                  Resetar Senha do Usuário
                </button>
              </form>
            </details>

            <!-- Enable/Disable -->
            <div style="padding: 1.5rem; background: var(--bg-main); border-radius: var(--radius-md); border: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-weight: 700; color: var(--text-main);">${user.is_active ? 'Desativar Acesso' : 'Reativar Acesso'}</div>
                <div style="font-size: 0.8125rem; color: var(--text-muted);">${user.is_active ? 'O usuário não conseguirá mais fazer login.' : 'O usuário voltará a ter acesso ao painel.'}</div>
              </div>
              ${user.is_active ? `
                <form method="POST" action="/admin/users/${user.id}/disable">
                  <input type="hidden" name="csrf_token" value="${csrfToken}" />
                  <button 
                    type="submit" 
                    class="btn" style="background: #ef4444;"
                    onclick="return confirm('Tem certeza que deseja desativar este usuário?')"
                  >
                    Desativar
                  </button>
                </form>
              ` : `
                <form method="POST" action="/admin/users/${user.id}/enable">
                  <input type="hidden" name="csrf_token" value="${csrfToken}" />
                  <button 
                    type="submit" 
                    class="btn" style="background: #10b981;"
                  >
                    Reativar
                  </button>
                </form>
              `}
            </div>
          </div>
        </div>
      ` : ''}
    </div>
  `
}

// ============================================================================
// Handlers
// ============================================================================

/**
 * GET /admin/users - List users
 */
export async function handleUsersList(c: Context<{ Bindings: Env; Variables: AppContext }>) {
  const user = c.get('adminUser') as AdminUser
  const csrfToken = c.get('csrfToken') as string

  const filters: ListStaffUsersFilters = {
    role: c.req.query('role') as any,
    q: c.req.query('q'),
  }

  const users = await listStaffUsers(c.env, filters)

  const content = renderUsersList(users, filters, csrfToken)
  return c.html(renderAdminLayout(content, user, csrfToken))
}

/**
 * GET /admin/users/new - New user form
 */
export async function handleUsersNew(c: Context<{ Bindings: Env; Variables: AppContext }>) {
  const user = c.get('adminUser') as AdminUser
  const csrfToken = c.get('csrfToken') as string

  const content = renderUserForm(null, csrfToken)
  return c.html(renderAdminLayout(content, user, csrfToken))
}

/**
 * POST /admin/users - Create user
 */
export async function handleUsersCreate(c: Context<{ Bindings: Env; Variables: AppContext }>) {
  const user = c.get('adminUser') as AdminUser
  const csrfToken = c.get('csrfToken') as string

  try {
    const formData = await c.req.parseBody()

    const payload = createUserSchema.parse({
      email: formData.email,
      password: formData.password,
      name: formData.name,
      role: formData.role,
      must_change_password: formData.must_change_password === '1',
    }) as CreateStaffUserPayload

    await createStaffUser(c.env, payload, user.id)

    return c.redirect('/admin/users', 302)
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Erro ao criar usuário'
    const content = renderUserForm(null, csrfToken, errorMsg)
    return c.html(renderAdminLayout(content, user, csrfToken), 400)
  }
}

/**
 * GET /admin/users/:id - Edit user form
 */
export async function handleUsersEdit(c: Context<{ Bindings: Env; Variables: AppContext }>) {
  const adminUser = c.get('adminUser') as AdminUser
  const csrfToken = c.get('csrfToken') as string
  const userId = parseInt(c.req.param('id'))

  // Validate id is a valid number
  if (!Number.isFinite(userId) || userId <= 0) {
    return c.html('<h1>Invalid user id</h1>', 400)
  }

  const user = await getStaffUserById(c.env, userId)

  if (!user) {
    return c.html('<h1>User not found</h1>', 404)
  }

  const content = renderUserForm(user, csrfToken)
  return c.html(renderAdminLayout(content, adminUser, csrfToken))
}

/**
 * POST /admin/users/:id - Update user
 */
export async function handleUsersUpdate(c: Context<{ Bindings: Env; Variables: AppContext }>) {
  const adminUser = c.get('adminUser') as AdminUser
  const csrfToken = c.get('csrfToken') as string
  const userId = parseInt(c.req.param('id'))

  // Validate id is a valid number
  if (!Number.isFinite(userId) || userId <= 0) {
    return c.html('<h1>Invalid user id</h1>', 400)
  }

  try {
    const formData = await c.req.parseBody()

    const payload = updateUserSchema.parse({
      email: formData.email || undefined,
      name: formData.name || undefined,
      role: formData.role || undefined,
    })

    await updateStaffUser(c.env, userId, payload, adminUser.id)

    return c.redirect(`/admin/users/${userId}`, 302)
  } catch (error) {
    const user = await getStaffUserById(c.env, userId)
    const errorMsg = error instanceof Error ? error.message : 'Erro ao atualizar usuário'
    const content = renderUserForm(user, csrfToken, errorMsg)
    return c.html(renderAdminLayout(content, adminUser, csrfToken), 400)
  }
}

/**
 * POST /admin/users/:id/reset-password - Reset user password
 */
export async function handleUsersResetPassword(c: Context<{ Bindings: Env; Variables: AppContext }>) {
  const adminUser = c.get('adminUser') as AdminUser
  const userId = parseInt(c.req.param('id'))

  // Validate id is a valid number
  if (!Number.isFinite(userId) || userId <= 0) {
    return c.json({ error: 'Invalid user id' }, 400)
  }

  try {
    const formData = await c.req.parseBody()

    const payload = resetPasswordSchema.parse({
      password: formData.password,
    })

    await setStaffPassword(c.env, userId, payload.password, adminUser.id)

    return c.redirect(`/admin/users/${userId}`, 302)
  } catch (error) {
    const csrfToken = c.get('csrfToken') as string
    const user = await getStaffUserById(c.env, userId)
    const errorMsg = error instanceof Error ? error.message : 'Erro ao resetar senha'
    const content = renderUserForm(user, csrfToken, errorMsg)
    return c.html(renderAdminLayout(content, adminUser, csrfToken), 400)
  }
}

/**
 * POST /admin/users/:id/disable - Disable user
 */
export async function handleUsersDisable(c: Context<{ Bindings: Env; Variables: AppContext }>) {
  const adminUser = c.get('adminUser') as AdminUser
  const userId = parseInt(c.req.param('id'))

  // Validate id is a valid number
  if (!Number.isFinite(userId) || userId <= 0) {
    return c.json({ error: 'Invalid user id' }, 400)
  }

  try {
    await setStaffActive(c.env, userId, false, adminUser.id)
    return c.redirect(`/admin/users/${userId}`, 302)
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Erro ao desativar usuário'
    return c.html(`<h1>Error</h1><p>${escapeHtml(errorMsg)}</p>`, 400)
  }
}

/**
 * POST /admin/users/:id/enable - Enable user
 */
export async function handleUsersEnable(c: Context<{ Bindings: Env; Variables: AppContext }>) {
  const adminUser = c.get('adminUser') as AdminUser
  const userId = parseInt(c.req.param('id'))

  // Validate id is a valid number
  if (!Number.isFinite(userId) || userId <= 0) {
    return c.json({ error: 'Invalid user id' }, 400)
  }

  try {
    await setStaffActive(c.env, userId, true, adminUser.id)
    return c.redirect(`/admin/users/${userId}`, 302)
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Erro ao reativar usuário'
    return c.html(`<h1>Error</h1><p>${escapeHtml(errorMsg)}</p>`, 400)
  }
}
