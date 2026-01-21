
import type { Context } from 'hono'
import type { Env, AppContext, AdminUser } from '../types'
import { renderAdminLayout, renderCsrfInput, escapeHtml } from './ui'
import { getSetting, setSetting } from '../db'
import { randomHex } from '../utils'

/**
 * GET /admin/integrations
 */
export async function renderIntegrationsPage(c: Context<{ Bindings: Env; Variables: AppContext }>) {
  const user = c.get('adminUser') as AdminUser
  const csrfToken = c.get('csrfToken') as string
  const success = c.req.query('success')

  // Get current N8N config
  const dbKey = await getSetting(c.env, 'n8n_api_key', 'private')
  // Fallback to env var if DB not set, for display purposes we might hint it's from Env
  const envKey = c.env.N8N_API_KEY

  const activeKey = dbKey || envKey
  const isEnv = !dbKey && !!envKey
  const baseUrl = c.env.PUBLIC_BASE_URL

  const bodyHtml = `
    <div style="margin-bottom: 2rem;">
      <h1 class="section-title">Integrações</h1>
      <p style="color: var(--text-muted);">Gerencie conexões com serviços externos.</p>
    </div>

    ${success ? `
      <div style="background: var(--success-light); color: var(--success); padding: 1rem; border-radius: var(--radius-md); margin-bottom: 2rem; border: 1px solid var(--success);">
        ${success === 'generated' ? 'Nova chave API gerada com sucesso.' : 'Operação realizada com sucesso.'}
      </div>
    ` : ''}

    <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap: 2rem;">
      <!-- n8n Card -->
      <div class="card">
        <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1.5rem;">
          <div style="display: flex; align-items: center; gap: 1rem;">
             <div style="width: 48px; height: 48px; background: #ff6d5a; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: bold; color: white; font-size: 1.5rem;">
               n8n
             </div>
             <div>
               <h3 style="margin: 0; font-size: 1.25rem;">Automação de Posts</h3>
               <span style="font-size: 0.875rem; color: var(--text-muted);">${activeKey ? '● Ativo' : '○ Inativo'}</span>
             </div>
          </div>
        </div>

        <div style="margin-bottom: 1.5rem;">
          <label style="display: block; font-size: 0.8125rem; font-weight: 600; margin-bottom: 0.5rem; color: var(--text-muted);">ENDPOINT POSTS</label>
          <div style="background: var(--bg-main); padding: 0.75rem; border-radius: var(--radius-sm); font-family: monospace; font-size: 0.875rem; border: 1px solid var(--border-color); color: var(--text-main); word-break: break-all;">
            ${baseUrl}/api/n8n/posts
          </div>
        </div>

        <div style="margin-bottom: 1.5rem;">
          <label style="display: block; font-size: 0.8125rem; font-weight: 600; margin-bottom: 0.5rem; color: var(--text-muted);">ENDPOINT MEDIA</label>
          <div style="background: var(--bg-main); padding: 0.75rem; border-radius: var(--radius-sm); font-family: monospace; font-size: 0.875rem; border: 1px solid var(--border-color); color: var(--text-main); word-break: break-all;">
            ${baseUrl}/api/n8n/media
          </div>
        </div>

        <div style="margin-bottom: 2rem;">
          <label style="display: block; font-size: 0.8125rem; font-weight: 600; margin-bottom: 0.5rem; color: var(--text-muted);">API KEY</label>
          <div style="display: flex; gap: 0.5rem;">
             <input type="text" readonly value="${escapeHtml(activeKey || '')}" 
               style="flex: 1; background: var(--bg-main); border: 1px solid var(--border-color); padding: 0.75rem; border-radius: var(--radius-sm); font-family: monospace; color: var(--text-main);"
               onclick="this.select()"
             >
             <button class="btn" onclick="navigator.clipboard.writeText('${escapeHtml(activeKey || '')}'); this.innerText='Copiado!'; setTimeout(() => this.innerText='Copiar', 2000)" style="background: var(--bg-main); color: var(--text-main); border: 1px solid var(--border-color);">
               Copiar
             </button>
          </div>
          ${isEnv ? `<p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.5rem;">* Esta chave está definida via Variáveis de Ambiente.</p>` : ''}
        </div>

        <div style="border-top: 1px solid var(--border-color); padding-top: 1.5rem;">
           <form method="POST" action="/admin/integrations/n8n/generate" onsubmit="return confirm('Gerar uma nova chave invalidará a anterior (se houver). Continuar?');">
             ${renderCsrfInput(csrfToken)}
             <button type="submit" class="btn" style="width: 100%;">
               🔄 Gerar Nova Chave Aleatória
             </button>
           </form>
           <p style="font-size: 0.8125rem; color: var(--text-muted); margin-top: 1rem; line-height: 1.5;">
             Use esta chave no Header <code>X-API-Key</code> das suas requisições HTTP no n8n.
           </p>
        </div>
      </div>

      <!-- Instructions -->
      <div class="card">
        <h3>Como Configurar</h3>
        <p style="color: var(--text-muted); line-height: 1.6;">O sistema aceita posts automáticos via API. O fluxo recomendado é:</p>
        <ol style="padding-left: 1.25rem; line-height: 1.6; color: var(--text-main);">
          <li style="margin-bottom: 0.5rem;">Faça upload da imagem de capa em <code>/api/n8n/media</code></li>
          <li style="margin-bottom: 0.5rem;">Receba o ID da mídia retornada.</li>
          <li style="margin-bottom: 0.5rem;">Envie o post para <code>/api/n8n/posts</code> incluindo o <code>cover_media_id</code>.</li>
        </ol>
        
        <h4 style="margin-top: 2rem;">Exemplo cURL</h4>
        <pre style="background: #1e1e1e; color: #d4d4d4; padding: 1rem; border-radius: 8px; overflow-x: auto; font-size: 0.8125rem; line-height: 1.5;"><code>curl -X POST ${baseUrl}/api/n8n/posts \\
  -H "X-API-Key: ${escapeHtml(activeKey || 'SUA_CHAVE')}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Post via API",
    "content": "&lt;p&gt;Conteúdo HTML&lt;/p&gt;",
    "status": "draft"
  }'</code></pre>
      </div>
    </div>
  `

  return renderAdminLayout({
    title: 'Integrações',
    user,
    activeTab: 'integrations',
    bodyHtml,
    csrfToken
  })
}

/**
 * POST /admin/integrations/n8n/generate
 */
export async function handleGenerateKey(c: Context<{ Bindings: Env; Variables: AppContext }>) {
  const user = c.get('adminUser') as AdminUser

  // Generate strict random key
  const newKey = randomHex(32)

  // Save to settings
  await setSetting(c.env, 'n8n_api_key', newKey, 'private', user.id)

  return c.redirect('/admin/integrations?success=generated', 302)
}
