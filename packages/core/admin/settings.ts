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
    <tr>
      <td><code style="background: var(--bg-main); padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8125rem; border: 1px solid var(--border-color);">${escapeHtml(setting.key)}</code></td>
      <td>
        <span style="display: inline-flex; align-items: center; justify-content: center; padding: 0.25rem 0.5rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; ${setting.scope === 'public' ? 'background: rgba(59, 130, 246, 0.1); color: #3b82f6;' : 'background: rgba(239, 68, 68, 0.1); color: #ef4444;'}">
          ${setting.scope}
        </span>
      </td>
      <td style="color: var(--text-muted); font-size: 0.875rem;">v${setting.version}</td>
      <td style="color: var(--text-muted); font-size: 0.8125rem;">${new Date(setting.updated_at).toLocaleString('pt-BR')}</td>
      <td style="text-align: right;">
        <a href="/admin/settings/${setting.scope}/${setting.key}" class="btn" style="padding: 0.4rem 0.8rem; font-size: 0.75rem; background: var(--bg-main); color: var(--text-main); border: 1px solid var(--border-color);">
          Editar
        </a>
      </td>
    </tr>
  `

  const bodyHtml = `
    <div style="margin-bottom: 2rem;">
      <h1 class="section-title">Configurações do Sistema</h1>
    </div>

    <div class="card" style="padding: 0; overflow: hidden; margin-bottom: 2rem;">
      <div style="padding: 1.5rem; border-bottom: 1px solid var(--border-color);">
        <h2 style="font-size: 1.125rem; font-weight: 700; margin: 0; color: var(--text-main);">🌐 Configurações Públicas</h2>
      </div>
      <table style="margin: 0;">
        <thead>
          <tr>
            <th>Chave (Key)</th>
            <th>Escopo</th>
            <th>Versão</th>
            <th>Última Atualização</th>
            <th style="text-align: right;">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${(publicSettings.results || []).map(renderSettingRow).join('')}
        </tbody>
      </table>
    </div>

    <div class="card" style="padding: 0; overflow: hidden;">
      <div style="padding: 1.5rem; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
        <h2 style="font-size: 1.125rem; font-weight: 700; margin: 0; color: var(--text-main);">🗝️ Configurações Privadas</h2>
        ${user.role !== 'admin' ? '<span style="font-size: 0.75rem; color: #ef4444; font-weight: 600;">⚠️ Apenas administradores podem editar</span>' : ''}
      </div>
      <table style="margin: 0;">
        <thead>
          <tr>
            <th>Chave (Key)</th>
            <th>Escopo</th>
            <th>Versão</th>
            <th>Última Atualização</th>
            <th style="text-align: right;">Ações</th>
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
    <div style="max-width: 800px;">
      <div style="margin-bottom: 2rem;">
        <a href="/admin/settings" style="color: var(--text-muted); text-decoration: none; font-size: 0.875rem; font-weight: 600; display: flex; align-items: center; gap: 0.25rem;">
          ← Voltar para a lista
        </a>
        <h1 class="section-title" style="margin-top: 0.5rem;">Editar Configuração</h1>
      </div>

      ${error ? `<div class="error" style="margin-bottom: 2rem; padding: 1.25rem; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: var(--radius-md); color: #ef4444; font-weight: 500;">⚠️ ${escapeHtml(error)}</div>` : ''}

      <div class="card">
        <form method="post" action="/admin/settings/${scope}/${key}">
          <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 1.5rem;">
            <div class="form-group">
              <label>Chave (Key)</label>
              <input type="text" class="form-control" value="${escapeHtml(key)}" disabled style="background: #f1f5f9; font-family: 'JetBrains Mono', monospace; font-size: 0.8125rem;">
            </div>
            <div class="form-group">
              <label>Escopo</label>
              <input type="text" class="form-control" value="${scope}" disabled style="background: #f1f5f9; text-transform: uppercase; font-weight: 700; color: ${scope === 'public' ? '#3b82f6' : '#ef4444'};">
            </div>
          </div>

          ${scope === 'public' ? (key === 'public_theme' ? `
            <div class="form-group">
              <label>Tema do Site</label>
              <select class="form-control" disabled>
                <option value='"minimal"' selected>Minimalista (Google Style)</option>
              </select>
              <input type="hidden" name="value" value='"minimal"'>
              <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem; font-weight: 500;">O tema nativo do site é fixado como Minimalista (Google Style).</div>
            </div>
          ` : `
            <div class="form-group">
              <label>Valor (Formato JSON)</label>
              <textarea 
                name="value" 
                class="form-control"
                rows="10" 
                required 
                style="font-family: 'JetBrains Mono', monospace; font-size: 0.8125rem; background: #fafbfc;"
              >${escapeHtml(displayValue)}</textarea>
              <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem; font-weight: 500;">⚠️ Certifique-se de usar um JSON válido.</div>
            </div>
          `) : `
            <div class="form-group">
              <label>Valor Privado</label>
              <input 
                type="password" 
                name="value" 
                class="form-control"
                placeholder="${value ? maskSecretValue(value) : '(vazio)'}"
                style="letter-spacing: 0.2em;"
              >
              <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem; font-weight: 500;">Deixe vazio para manter o valor atual. Preencha para sobrescrever.</div>
            </div>
          `}

          <div style="display: flex; gap: 1rem; margin-top: 2rem; border-top: 1px solid var(--border-color); padding-top: 2rem;">
            <button type="submit" class="btn" style="min-width: 150px;">
              Salvar Alterações
            </button>
            <a href="/admin/settings" class="btn" style="background: var(--bg-main); color: var(--text-main); border: 1px solid var(--border-color); text-decoration: none;">
              Cancelar
            </a>
          </div>
        </form>
      </div>
    </div>
  `

  return c.html(renderAdminLayout({
    title: `Editar: ${key} `,
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
        return c.redirect(`/ admin / settings / ${scope}/${key}?error=Valor+vazio`, 302)
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
