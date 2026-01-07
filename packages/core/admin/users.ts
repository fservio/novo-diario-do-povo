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
    <div class="mb-4 flex gap-2">
      <a href="/admin/users" 
         class="px-3 py-1 rounded ${!filters.role ? 'bg-gray-800 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}">
        Todos
      </a>
      <a href="/admin/users?role=director" 
         class="px-3 py-1 rounded ${filters.role === 'director' ? 'bg-purple-600 text-white' : 'bg-purple-100 text-purple-800 hover:bg-purple-200'}">
        Diretores
      </a>
      <a href="/admin/users?role=editor" 
         class="px-3 py-1 rounded ${filters.role === 'editor' ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-800 hover:bg-blue-200'}">
        Editores
      </a>
      <a href="/admin/users?role=writer" 
         class="px-3 py-1 rounded ${filters.role === 'writer' ? 'bg-green-600 text-white' : 'bg-green-100 text-green-800 hover:bg-green-200'}">
        Redatores
      </a>
    </div>
  `

  const usersRows = users.map(user => {
    const roleDisplay = normalizeRole(user.role)
    const roleClass = roleColors[user.role] || 'bg-gray-100 text-gray-800'
    const statusBadge = user.is_active 
      ? '<span class="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">Ativo</span>'
      : '<span class="px-2 py-1 bg-red-100 text-red-800 rounded text-xs">Inativo</span>'

    return `
      <tr class="hover:bg-gray-50">
        <td class="px-4 py-3 border-b">
          <div class="font-medium">${escapeHtml(user.name)}</div>
          <div class="text-sm text-gray-600">${escapeHtml(user.email)}</div>
        </td>
        <td class="px-4 py-3 border-b">
          <span class="px-2 py-1 rounded text-xs font-medium ${roleClass}">
            ${roleDisplay}
          </span>
        </td>
        <td class="px-4 py-3 border-b">${statusBadge}</td>
        <td class="px-4 py-3 border-b text-sm text-gray-600">
          ${user.last_login_at ? new Date(user.last_login_at).toLocaleDateString('pt-BR') : 'Nunca'}
        </td>
        <td class="px-4 py-3 border-b">
          <a href="/admin/users/${user.id}" 
             class="text-blue-600 hover:text-blue-800 text-sm">
            Editar
          </a>
        </td>
      </tr>
    `
  }).join('')

  return `
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-2xl font-bold">Usuários</h1>
      <a href="/admin/users/new" 
         class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
        + Novo Usuário
      </a>
    </div>

    ${rolesHTML}

    <div class="bg-white rounded-lg shadow overflow-hidden">
      <table class="w-full" id="usersTable">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">Nome / Email</th>
            <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">Papel</th>
            <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">Status</th>
            <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">Último Login</th>
            <th class="px-4 py-3 text-left text-sm font-medium text-gray-700">Ações</th>
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
    <div class="mb-4 p-4 bg-red-100 text-red-800 rounded">
      ${escapeHtml(error)}
    </div>
  ` : ''

  return `
    <div class="max-w-2xl">
      <h1 class="text-2xl font-bold mb-6">${title}</h1>

      ${errorHTML}

      <form method="POST" class="bg-white rounded-lg shadow p-6">
        <input type="hidden" name="csrf_token" value="${csrfToken}" />

        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Email *
          </label>
          <input 
            type="email" 
            name="email" 
            value="${escapeHtml(user?.email || '')}"
            required
            class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Nome *
          </label>
          <input 
            type="text" 
            name="name" 
            value="${escapeHtml(user?.name || '')}"
            required
            class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Papel *
          </label>
          <select 
            name="role" 
            required
            class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="writer" ${user?.role === 'writer' ? 'selected' : ''}>Redator</option>
            <option value="editor" ${user?.role === 'editor' ? 'selected' : ''}>Editor</option>
            <option value="director" ${user?.role === 'director' || user?.role === 'admin' ? 'selected' : ''}>Diretor</option>
          </select>
          <p class="mt-1 text-sm text-gray-600">
            Redator: criar e editar próprios posts | Editor: publicar e editar todos | Diretor: acesso total
          </p>
        </div>

        ${!isEdit ? `
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 mb-2">
              Senha *
            </label>
            <input 
              type="password" 
              name="password" 
              required
              minlength="8"
              class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p class="mt-1 text-sm text-gray-600">Mínimo 8 caracteres</p>
          </div>

          <div class="mb-4">
            <label class="flex items-center">
              <input type="checkbox" name="must_change_password" value="1" class="mr-2" />
              <span class="text-sm text-gray-700">Forçar troca de senha no primeiro login</span>
            </label>
          </div>
        ` : ''}

        <div class="flex gap-3">
          <button 
            type="submit" 
            class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            ${isEdit ? 'Salvar' : 'Criar'}
          </button>
          <a 
            href="/admin/users" 
            class="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
          >
            Cancelar
          </a>
        </div>
      </form>

      ${isEdit ? `
        <div class="mt-8 bg-white rounded-lg shadow p-6">
          <h2 class="text-lg font-bold mb-4">Ações</h2>

          <div class="space-y-3">
            <!-- Reset Password -->
            <details class="border rounded p-3">
              <summary class="cursor-pointer font-medium text-orange-600">
                Resetar Senha
              </summary>
              <form method="POST" action="/admin/users/${user.id}/reset-password" class="mt-3">
                <input type="hidden" name="csrf_token" value="${csrfToken}" />
                <div class="mb-3">
                  <input 
                    type="password" 
                    name="password" 
                    placeholder="Nova senha (mín. 8 caracteres)"
                    required
                    minlength="8"
                    class="w-full px-3 py-2 border border-gray-300 rounded"
                  />
                </div>
                <button 
                  type="submit" 
                  class="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700"
                >
                  Resetar Senha
                </button>
              </form>
            </details>

            <!-- Enable/Disable -->
            ${user.is_active ? `
              <form method="POST" action="/admin/users/${user.id}/disable">
                <input type="hidden" name="csrf_token" value="${csrfToken}" />
                <button 
                  type="submit" 
                  class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                  onclick="return confirm('Tem certeza que deseja desativar este usuário?')"
                >
                  Desativar Usuário
                </button>
              </form>
            ` : `
              <form method="POST" action="/admin/users/${user.id}/enable">
                <input type="hidden" name="csrf_token" value="${csrfToken}" />
                <button 
                  type="submit" 
                  class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  Reativar Usuário
                </button>
              </form>
            `}
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

  try {
    await setStaffActive(c.env, userId, true, adminUser.id)
    return c.redirect(`/admin/users/${userId}`, 302)
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Erro ao reativar usuário'
    return c.html(`<h1>Error</h1><p>${escapeHtml(errorMsg)}</p>`, 400)
  }
}
