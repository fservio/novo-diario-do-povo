/**
 * Admin Settings Module
 * CRUD de settings com masking para private
 */

import type { Context } from 'hono'
import type { Env, AppContext } from '../types'
import { renderAdminLayout, escapeHtml, maskSecretValue, renderAdminIcon, renderCsrfInput, type AdminUser } from './ui'
import { getSetting, setSetting } from '../db'
import { normalizeRole } from '../db/users'
import { getNewsletterRuntimeConfig } from '../newsletter'

export async function renderSettingsListPage(c: Context<{ Bindings: Env; Variables: AppContext }>): Promise<Response> {
  const user = c.get('adminUser') as AdminUser
  const csrfToken = c.get('csrfToken') || ''
  const newsletterConfig = await getNewsletterRuntimeConfig(c.env)
  const canManageSettings = normalizeRole(user.role) === 'director'

  // Get all settings
  const publicSettings = await c.env.DB.prepare(
    'SELECT key, scope, version, updated_at FROM settings WHERE scope = ? ORDER BY key'
  ).bind('public').all<any>()

  const privateSettings = await c.env.DB.prepare(
    "SELECT key, scope, version, updated_at FROM settings WHERE scope = ? AND key NOT LIKE 'newsletter.%' ORDER BY key"
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
    <div class="page-intro">
      <div>
        <p class="page-kicker">Administração</p>
        <h1 class="page-title">Configurações do sistema</h1>
        <p class="page-description">Integrações, identidade e parâmetros operacionais do Diário.</p>
      </div>
    </div>

    ${c.req.query('message') ? `<div class="newsletter-notice newsletter-notice--success" role="status">${escapeHtml(c.req.query('message'))}</div>` : ''}
    ${c.req.query('error') ? `<div class="newsletter-notice newsletter-notice--error" role="alert">${escapeHtml(c.req.query('error'))}</div>` : ''}

    <section class="card newsletter-settings-card">
      <div class="newsletter-settings-heading">
        <div class="newsletter-settings-icon"><span class="admin-icon">${renderAdminIcon('newsletter')}</span></div>
        <div>
          <p class="page-kicker">Distribuição editorial</p>
          <h2>Newsletter e e-mail</h2>
          <p>Configure o remetente e os limites de operação. A senha continua protegida como segredo do ambiente.</p>
        </div>
        <span class="newsletter-provider ${newsletterConfig.smtpReady ? 'is-ready' : ''}"><i></i>${newsletterConfig.smtpReady ? 'Pronto para envio' : 'Configuração incompleta'}</span>
      </div>

      <form class="newsletter-settings-form" method="post" action="/admin/settings/newsletter">
        ${renderCsrfInput(csrfToken)}
        <div class="newsletter-settings-grid">
          <div class="form-group">
            <label for="newsletter-smtp-host">Servidor SMTP</label>
            <input class="form-control" id="newsletter-smtp-host" name="smtp_host" required maxlength="180" value="${escapeHtml(newsletterConfig.host)}" placeholder="smtp.hostinger.com" autocomplete="off">
            <small>Host fornecido pelo serviço de e-mail.</small>
          </div>
          <div class="form-group">
            <label for="newsletter-smtp-port">Porta segura</label>
            <input class="form-control" id="newsletter-smtp-port" name="smtp_port" type="number" min="1" max="65535" required value="${newsletterConfig.port}">
            <small>A integração atual usa TLS direto na porta 465.</small>
          </div>
          <div class="form-group">
            <label for="newsletter-smtp-username">Usuário SMTP</label>
            <input class="form-control" id="newsletter-smtp-username" name="smtp_username" type="email" required maxlength="254" value="${escapeHtml(newsletterConfig.username)}" placeholder="newsletter@seudominio.com.br" autocomplete="off">
          </div>
          <div class="form-group">
            <label for="newsletter-from-email">E-mail do remetente</label>
            <input class="form-control" id="newsletter-from-email" name="from_email" type="email" required maxlength="254" value="${escapeHtml(newsletterConfig.fromEmail)}" placeholder="newsletter@seudominio.com.br" autocomplete="off">
          </div>
          <div class="form-group">
            <label for="newsletter-from-name">Nome do remetente</label>
            <input class="form-control" id="newsletter-from-name" name="from_name" required maxlength="100" value="${escapeHtml(newsletterConfig.fromName)}" placeholder="Diário do Povo">
          </div>
          <div class="form-group">
            <label for="newsletter-daily-limit">Limite operacional em 24 horas</label>
            <input class="form-control" id="newsletter-daily-limit" name="daily_limit" type="number" min="1" max="100" required value="${newsletterConfig.dailyLimit}">
            <small>Recomendado: 80, preservando 20 mensagens da cota real.</small>
          </div>
        </div>

        <div class="newsletter-secret-row">
          <div class="newsletter-secret-status ${newsletterConfig.passwordConfigured ? 'is-ready' : ''}">
            <span class="admin-icon">${renderAdminIcon('shield')}</span>
            <div><strong>Senha SMTP</strong><p>${newsletterConfig.passwordConfigured ? 'Segredo SMTP_PASSWORD configurado e não exibido pelo CMS.' : 'O segredo SMTP_PASSWORD ainda não foi configurado no ambiente.'}</p></div>
          </div>
          <p class="newsletter-secret-help">Por segurança, a senha não é armazenada no banco nem pode ser consultada por esta tela.</p>
          <button class="btn" type="submit" ${canManageSettings ? '' : 'disabled title="Apenas diretores podem alterar estas configurações"'}>Salvar configurações</button>
        </div>
      </form>
    </section>

    <div class="card" style="padding: 0; overflow: hidden; margin-bottom: 2rem; margin-top: 1.25rem;">
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
        ${!canManageSettings ? '<span style="font-size: 0.75rem; color: #ef4444; font-weight: 600;">⚠️ Apenas diretores podem editar</span>' : ''}
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
    title: 'Configurações',
    user,
    bodyHtml,
    activeTab: 'settings',
    csrfToken
  }))
}

export async function renderSettingEditPage(
  c: Context<{ Bindings: Env; Variables: AppContext }>,
  scope: 'public' | 'private',
  key: string,
  error?: string
): Promise<Response> {
  const user = c.get('adminUser') as AdminUser
  const csrfToken = c.get('csrfToken') || ''

  // Check permission
  if (scope === 'private' && normalizeRole(user.role) !== 'director') {
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
          ${renderCsrfInput(csrfToken)}
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

          ${scope === 'public' ? (key === 'public_theme' || key === 'site.public_theme' ? `
            <div class="form-group">
              <label>Tema do Site</label>
              <select name="value" class="form-control">
                <option value='"minimal"' ${value === 'minimal' ? 'selected' : ''}>Minimalista (Google Style)</option>
                <option value='"alltype"' ${value === 'alltype' ? 'selected' : ''}>AllType</option>
                <option value='"editorial"' ${value === 'editorial' || value === 'alltype_v2' ? 'selected' : ''}>Editorial 2026 (recomendado)</option>
              </select>
              <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem; font-weight: 500;">Selecione o tema visual do site público.</div>
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
    activeTab: 'settings',
    csrfToken
  }))
}

export async function handleSettingUpdate(
  c: Context<{ Bindings: Env; Variables: AppContext }>,
  scope: 'public' | 'private',
  key: string
): Promise<Response> {
  const user = c.get('adminUser') as AdminUser

  // Check permission
  if (scope === 'private' && normalizeRole(user.role) !== 'director') {
    return c.json({ success: false, error: 'Forbidden' }, 403)
  }

  try {
    const formData = (c.get('parsedBody') || await c.req.parseBody()) as Record<string, string>
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

export async function handleNewsletterSettingsUpdate(
  c: Context<{ Bindings: Env; Variables: AppContext }>
): Promise<Response> {
  const user = c.get('adminUser') as AdminUser
  if (normalizeRole(user.role) !== 'director') {
    return c.html('<h1>Acesso negado</h1><p>Apenas diretores podem alterar as configurações de newsletter.</p>', 403)
  }
  const formData = (c.get('parsedBody') || await c.req.parseBody()) as Record<string, string>
  const smtpHost = String(formData.smtp_host || '').trim().toLowerCase()
  const smtpPort = Number.parseInt(String(formData.smtp_port || ''), 10)
  const smtpUsername = String(formData.smtp_username || '').trim().toLowerCase()
  const fromEmail = String(formData.from_email || '').trim().toLowerCase()
  const fromName = String(formData.from_name || '').trim()
  const dailyLimit = Number.parseInt(String(formData.daily_limit || ''), 10)
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const hostPattern = /^(?=.{1,180}$)(?!-)[a-z0-9.-]+(?<!-)$/i

  let error = ''
  if (!hostPattern.test(smtpHost) || smtpHost.includes('..')) error = 'Informe um servidor SMTP válido, sem protocolo.'
  else if (smtpPort !== 465) error = 'A integração atual da Hostinger exige a porta segura 465.'
  else if (!emailPattern.test(smtpUsername)) error = 'Informe um usuário SMTP válido.'
  else if (!emailPattern.test(fromEmail)) error = 'Informe um e-mail de remetente válido.'
  else if (!fromName || fromName.length > 100) error = 'Informe o nome do remetente com até 100 caracteres.'
  else if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 100) error = 'O limite diário deve estar entre 1 e 100.'

  if (error) return c.redirect(`/admin/settings?error=${encodeURIComponent(error)}`, 303)

  try {
    const entries: Array<[string, string | number]> = [
      ['newsletter.smtp_host', smtpHost],
      ['newsletter.smtp_port', smtpPort],
      ['newsletter.smtp_username', smtpUsername],
      ['newsletter.from_email', fromEmail],
      ['newsletter.from_name', fromName],
      ['newsletter.daily_limit', dailyLimit]
    ]
    for (const [key, value] of entries) {
      await setSetting(c.env, key, value, 'private', user.id)
    }
    return c.redirect(`/admin/settings?message=${encodeURIComponent('Configurações de newsletter salvas.')}`, 303)
  } catch (error) {
    console.error('[Newsletter Settings] Save error:', error)
    return c.redirect(`/admin/settings?error=${encodeURIComponent('Não foi possível salvar as configurações de newsletter.')}`, 303)
  }
}
