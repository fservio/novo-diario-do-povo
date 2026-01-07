/**
 * Admin Settings Module
 * CRUD de settings com masking para private
 */

import type { Context } from 'hono'
import type { Env, AppContext } from '../types'
import { renderAdminLayout, escapeHtml, maskSecretValue, type AdminUser } from './ui'
import { getSetting, setSetting } from '../db'

export async function renderSettingsListPage(c: Context<{ Bindings: Env; Variables: AppContext }>): Promise<Response> {
  const user = c.get('adminUser') as AdminUser

  // Get all settings
  const publicSettings = await c.env.DB.prepare(
    'SELECT key, scope, version, updated_at FROM settings WHERE scope = ? ORDER BY key'
  ).bind('public').all<any>()

  const privateSettings = await c.env.DB.prepare(
    'SELECT key, scope, version, updated_at FROM settings WHERE scope = ? ORDER BY key'
  ).bind('private').all<any>()

  const renderSettingRow = (setting: any) => `
    <tr class="border-b">
      <td class="py-2 px-4"><code class="text-sm">${escapeHtml(setting.key)}</code></td>
      <td class="py-2 px-4">
        <span class="px-2 py-1 text-xs rounded ${setting.scope === 'public' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}">
          ${setting.scope}
        </span>
      </td>
      <td class="py-2 px-4 text-sm text-gray-600">v${setting.version}</td>
      <td class="py-2 px-4 text-sm text-gray-600">${new Date(setting.updated_at).toLocaleString('pt-BR')}</td>
      <td class="py-2 px-4">
        <a href="/admin/settings/${setting.scope}/${setting.key}" class="text-blue-600 hover:underline text-sm">
          Editar
        </a>
      </td>
    </tr>
  `

  const bodyHtml = `
    <div class="bg-white rounded-lg shadow p-6 mb-6">
      <h2 class="text-xl font-semibold mb-4">Settings Públicos</h2>
      <table class="w-full">
        <thead>
          <tr class="border-b-2">
            <th class="py-2 px-4 text-left">Key</th>
            <th class="py-2 px-4 text-left">Scope</th>
            <th class="py-2 px-4 text-left">Versão</th>
            <th class="py-2 px-4 text-left">Atualizado</th>
            <th class="py-2 px-4 text-left">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${(publicSettings.results || []).map(renderSettingRow).join('')}
        </tbody>
      </table>
    </div>

    <div class="bg-white rounded-lg shadow p-6">
      <h2 class="text-xl font-semibold mb-4">Settings Privados</h2>
      ${user.role !== 'admin' ? '<p class="text-red-600">Você não tem permissão para editar settings privados.</p>' : ''}
      <table class="w-full">
        <thead>
          <tr class="border-b-2">
            <th class="py-2 px-4 text-left">Key</th>
            <th class="py-2 px-4 text-left">Scope</th>
            <th class="py-2 px-4 text-left">Versão</th>
            <th class="py-2 px-4 text-left">Atualizado</th>
            <th class="py-2 px-4 text-left">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${(privateSettings.results || []).map(renderSettingRow).join('')}
        </tbody>
      </table>
    </div>
  `

  return c.html(renderAdminLayout({
    title: 'Settings',
    user,
    bodyHtml,
    activeTab: 'settings'
  }))
}

export async function renderSettingEditPage(
  c: Context<{ Bindings: Env; Variables: AppContext }>,
  scope: 'public' | 'private',
  key: string,
  error?: string
): Promise<Response> {
  const user = c.get('adminUser') as AdminUser

  // Check permission
  if (scope === 'private' && user.role !== 'admin') {
    return c.html(renderAdminLayout({
      title: 'Acesso Negado',
      user,
      bodyHtml: '<p class="text-red-600">Você não tem permissão para editar settings privados.</p>',
      activeTab: 'settings'
    }), 403)
  }

  const value = await getSetting(c.env, key, scope)

  let displayValue = ''
  if (scope === 'public') {
    displayValue = JSON.stringify(value, null, 2)
  } else {
    // Private: show masked
    displayValue = ''
  }

  const bodyHtml = `
    <div class="bg-white rounded-lg shadow p-6">
      <h2 class="text-xl font-semibold mb-4">Editar Setting</h2>

      ${error ? `<div class="mb-4 p-3 bg-red-50 text-red-700 rounded">${escapeHtml(error)}</div>` : ''}

      <form method="post" action="/admin/settings/${scope}/${key}" class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-1">Key</label>
          <input 
            type="text" 
            value="${escapeHtml(key)}" 
            disabled 
            class="w-full px-3 py-2 border rounded bg-gray-100"
          >
        </div>

        <div>
          <label class="block text-sm font-medium mb-1">Scope</label>
          <input 
            type="text" 
            value="${scope}" 
            disabled 
            class="w-full px-3 py-2 border rounded bg-gray-100"
          >
        </div>

        ${scope === 'public' ? `
          <div>
            <label class="block text-sm font-medium mb-1">Valor (JSON)</label>
            <textarea 
              name="value" 
              rows="10" 
              required 
              class="w-full px-3 py-2 border rounded font-mono text-sm"
            >${escapeHtml(displayValue)}</textarea>
          </div>
        ` : `
          <div>
            <label class="block text-sm font-medium mb-1">Valor</label>
            <input 
              type="password" 
              name="value" 
              placeholder="${value ? maskSecretValue(value) : '(vazio)'}"
              class="w-full px-3 py-2 border rounded"
            >
            <p class="text-xs text-gray-500 mt-1">Deixe vazio para não alterar. Preencha para sobrescrever.</p>
          </div>
        `}

        <div class="flex gap-2">
          <button 
            type="submit" 
            class="px-4 py-2 bg-gray-900 text-white rounded hover:bg-gray-700"
          >
            Salvar
          </button>
          <a 
            href="/admin/settings" 
            class="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
          >
            Cancelar
          </a>
        </div>
      </form>
    </div>
  `

  return c.html(renderAdminLayout({
    title: `Editar: ${key}`,
    user,
    bodyHtml,
    activeTab: 'settings'
  }))
}

export async function handleSettingUpdate(
  c: Context<{ Bindings: Env; Variables: AppContext }>,
  scope: 'public' | 'private',
  key: string
): Promise<Response> {
  const user = c.get('adminUser') as AdminUser

  // Check permission
  if (scope === 'private' && user.role !== 'admin') {
    return c.json({ success: false, error: 'Forbidden' }, 403)
  }

  try {
    const formData = await c.req.parseBody()
    const valueRaw = formData.value as string

    if (!valueRaw || valueRaw.trim() === '') {
      // Empty for private = don't change
      if (scope === 'private') {
        return c.redirect(`/admin/settings/${scope}/${key}?error=Valor+vazio`, 302)
      }
    }

    let parsedValue: any

    if (scope === 'public') {
      // Parse JSON
      try {
        parsedValue = JSON.parse(valueRaw)
      } catch {
        return c.redirect(`/admin/settings/${scope}/${key}?error=JSON+inválido`, 302)
      }
    } else {
      // Private: store as string
      parsedValue = valueRaw
    }

    await setSetting(c.env, key, parsedValue, scope, user.id)

    return c.redirect('/admin/settings', 302)
  } catch (error) {
    console.error('Setting update error:', error)
    return c.redirect(`/admin/settings/${scope}/${key}?error=Erro+ao+salvar`, 302)
  }
}
