/**
 * Admin Asaas Configuration
 */

import type { Context } from 'hono'
import type { Env, AppContext } from '../types'
import { renderAdminLayout, escapeHtml, maskSecretValue, type AdminUser } from './ui'
import { getSetting, setSetting } from '../db'
import { z } from 'zod'

const asaasSchema = z.object({
  environment: z.enum(['sandbox', 'production']),
  base_url: z.string().optional(),
  api_key: z.string().optional(),
  webhook_token: z.string().optional()
})

export async function renderAsaasPage(c: Context<{ Bindings: Env; Variables: AppContext }>, error?: string): Promise<Response> {
  const user = c.get('adminUser') as AdminUser

  // Get current values
  const environment = await getSetting(c.env, 'asaas.environment', 'public') || 'sandbox'
  const baseUrl = await getSetting(c.env, 'asaas.base_url', 'public') || ''
  const apiKey = await getSetting(c.env, 'asaas.api_key', 'private')
  const webhookToken = await getSetting(c.env, 'asaas.webhook_token', 'private')

  const bodyHtml = `
    <div style="max-width: 800px;">
      <div style="margin-bottom: 2rem;">
        <h1 class="section-title" style="margin: 0;">Configuração Asaas</h1>
      </div>

      ${error ? `<div class="error" style="margin-bottom: 2rem; padding: 1.25rem; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: var(--radius-md); color: #ef4444; font-weight: 500;">⚠️ ${escapeHtml(error)}</div>` : ''}

      <div class="card">
        <form method="post" action="/admin/asaas">
          <div class="field">
            <label>Ambiente</label>
            <select name="environment" required>
              <option value="sandbox" ${environment === 'sandbox' ? 'selected' : ''}>Sandbox (Testes)</option>
              <option value="production" ${environment === 'production' ? 'selected' : ''}>Production (Produção)</option>
            </select>
          </div>

          <div class="field">
            <label>Base URL (opcional)</label>
            <input 
              type="text" 
              name="base_url" 
              value="${escapeHtml(baseUrl)}"
              placeholder="Ex: https://sandbox.asaas.com/api/v3"
            >
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;">Deixe vazio para usar o padrão do ambiente selecionado.</div>
          </div>

          <div class="field">
            <label>API Key</label>
            <input 
              type="password" 
              name="api_key" 
              placeholder="${apiKey ? maskSecretValue(apiKey) : '(não configurado)'}"
            >
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;">Deixe vazio para manter o valor atual. Obtida no painel do Asaas.</div>
          </div>

          <div class="field">
            <label>Webhook Token (Validação)</label>
            <input 
              type="password" 
              name="webhook_token" 
              placeholder="${webhookToken ? maskSecretValue(webhookToken) : '(não configurado)'}"
            >
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;">Token para validar as notificações recebidas do Asaas.</div>
          </div>

          <div style="display: flex; gap: 1rem; margin-top: 2rem; border-top: 1px solid var(--border-color); padding-top: 2rem;">
            <button type="submit" class="btn" style="min-width: 150px;">
               Salvar Alterações
            </button>
            <a href="/admin" class="btn" style="background: var(--bg-main); color: var(--text-main); border: 1px solid var(--border-color); text-decoration: none;">
              Voltar
            </a>
          </div>
        </form>

        <div style="margin-top: 2.5rem; padding: 1.5rem; background: var(--bg-main); border-radius: var(--radius-md); border-left: 4px solid var(--accent);">
          <h3 style="font-size: 1rem; font-weight: 700; margin-top: 0; margin-bottom: 0.75rem; color: var(--text-main);">ℹ️ Informações Úteis</h3>
          <ul style="font-size: 0.875rem; space-y: 0.75rem; color: var(--text-muted); padding-left: 1.25rem;">
            <li><strong>Sandbox:</strong> Recomendado para testar fluxos de pagamento sem gastar dinheiro real.</li>
            <li><strong>Endpoint de Webhook:</strong> Configure isto no seu painel Asaas: 
              <code style="background: var(--bg-card); padding: 0.2rem 0.4rem; border-radius: 4px; border: 1px solid var(--border-color); color: var(--accent); font-weight: 700; display: block; margin-top: 0.5rem;">
                ${c.env.PUBLIC_BASE_URL}/api/webhooks/asaas
              </code>
            </li>
          </ul>
        </div>
      </div>
    </div>
  `

  return c.html(renderAdminLayout({
    title: 'Configuração Asaas',
    user,
    bodyHtml,
    activeTab: 'asaas'
  }))
}

export async function handleAsaasSave(c: Context<{ Bindings: Env; Variables: AppContext }>): Promise<Response> {
  const user = c.get('adminUser') as AdminUser

  try {
    const formData = await c.req.parseBody()
    const data = asaasSchema.parse(formData)

    // Always save environment and base_url (public)
    await setSetting(c.env, 'asaas.environment', data.environment, 'public', user.id)

    if (data.base_url) {
      await setSetting(c.env, 'asaas.base_url', data.base_url, 'public', user.id)
    }

    // Only update secrets if provided
    if (data.api_key && data.api_key.trim() !== '') {
      await setSetting(c.env, 'asaas.api_key', data.api_key, 'private', user.id)
    }

    if (data.webhook_token && data.webhook_token.trim() !== '') {
      await setSetting(c.env, 'asaas.webhook_token', data.webhook_token, 'private', user.id)
    }

    return c.redirect('/admin/asaas', 302)
  } catch (error) {
    console.error('Asaas save error:', error)
    return c.redirect('/admin/asaas?error=' + encodeURIComponent('Erro ao salvar configuração'), 302)
  }
}
