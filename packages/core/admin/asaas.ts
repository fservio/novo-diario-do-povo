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
    <div class="bg-white rounded-lg shadow p-6">
      <h2 class="text-xl font-semibold mb-4">Configuração Asaas</h2>

      ${error ? `<div class="mb-4 p-3 bg-red-50 text-red-700 rounded">${escapeHtml(error)}</div>` : ''}

      <form method="post" action="/admin/asaas" class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-1">Ambiente</label>
          <select 
            name="environment" 
            required 
            class="w-full px-3 py-2 border rounded"
          >
            <option value="sandbox" ${environment === 'sandbox' ? 'selected' : ''}>Sandbox (Teste)</option>
            <option value="production" ${environment === 'production' ? 'selected' : ''}>Production (Produção)</option>
          </select>
        </div>

        <div>
          <label class="block text-sm font-medium mb-1">Base URL (opcional)</label>
          <input 
            type="text" 
            name="base_url" 
            value="${escapeHtml(baseUrl)}"
            placeholder="https://sandbox.asaas.com/api/v3"
            class="w-full px-3 py-2 border rounded"
          >
          <p class="text-xs text-gray-500 mt-1">Deixe vazio para usar padrão do ambiente selecionado</p>
        </div>

        <div>
          <label class="block text-sm font-medium mb-1">API Key</label>
          <input 
            type="password" 
            name="api_key" 
            placeholder="${apiKey ? maskSecretValue(apiKey) : '(não configurado)'}"
            class="w-full px-3 py-2 border rounded"
          >
          <p class="text-xs text-gray-500 mt-1">Deixe vazio para não alterar. Preencha para sobrescrever.</p>
        </div>

        <div>
          <label class="block text-sm font-medium mb-1">Webhook Token</label>
          <input 
            type="password" 
            name="webhook_token" 
            placeholder="${webhookToken ? maskSecretValue(webhookToken) : '(não configurado)'}"
            class="w-full px-3 py-2 border rounded"
          >
          <p class="text-xs text-gray-500 mt-1">Token para validar webhooks recebidos do Asaas</p>
        </div>

        <div class="flex gap-2">
          <button 
            type="submit" 
            class="px-4 py-2 bg-gray-900 text-white rounded hover:bg-gray-700"
          >
            Salvar Configuração
          </button>
          <a 
            href="/admin" 
            class="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
          >
            Voltar
          </a>
        </div>
      </form>

      <div class="mt-6 p-4 bg-blue-50 rounded">
        <h3 class="font-semibold text-sm mb-2">Informações</h3>
        <ul class="text-sm space-y-1 text-gray-700">
          <li>• Sandbox: Use para testes sem cobranças reais</li>
          <li>• Production: Ambiente de produção com cobranças reais</li>
          <li>• API Key: Obtida no painel do Asaas</li>
          <li>• Webhook Token: Gere um token seguro para validar webhooks</li>
          <li>• Endpoint webhook: <code class="bg-white px-2 py-1 rounded">${c.env.PUBLIC_BASE_URL}/api/webhooks/asaas</code></li>
        </ul>
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
