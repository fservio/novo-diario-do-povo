
import type { Context } from 'hono'
import type { Env, AppContext, AdminUser } from '../types'
import { renderAdminLayout, renderCsrfInput, escapeHtml } from './ui'
import { getSetting, setSetting } from '../db'
import { randomHex } from '../utils'
import { normalizeRole } from '../db/users'
import { getInstagramRuntimeConfig } from '../instagram'
import { getEditorialAiRuntimeConfig } from '../editorial-ai'

/**
 * GET /admin/integrations
 */
export async function renderIntegrationsPage(c: Context<{ Bindings: Env; Variables: AppContext }>) {
  const user = c.get('adminUser') as AdminUser
  const csrfToken = c.get('csrfToken') as string
  const success = c.req.query('success')
  const error = c.req.query('error')

  // Get current N8N config
  const dbKey = await getSetting(c.env, 'n8n_api_key', 'private')
  // Fallback to env var if DB not set, for display purposes we might hint it's from Env
  const envKey = c.env.N8N_API_KEY

  const activeKey = dbKey || envKey
  const isEnv = !dbKey && !!envKey
  const baseUrl = c.env.PUBLIC_BASE_URL
  const instagramConfig = await getInstagramRuntimeConfig(c.env)
  const editorialAiConfig = await getEditorialAiRuntimeConfig(c.env)

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
    ${error ? `<div class="newsletter-notice newsletter-notice--error" role="alert">${escapeHtml(error)}</div>` : ''}

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

        <div style="margin-bottom: 1.5rem;">
          <label style="display: block; font-size: 0.8125rem; font-weight: 600; margin-bottom: 0.5rem; color: var(--text-muted);">ENDPOINT RADAR RSS</label>
          <div style="background: var(--bg-main); padding: 0.75rem; border-radius: var(--radius-sm); font-family: monospace; font-size: 0.875rem; border: 1px solid var(--border-color); color: var(--text-main); word-break: break-all;">
            ${baseUrl}/api/n8n/editorial/rss/sync
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

      <div class="card integration-instagram-card">
        <div class="integration-instagram-head">
          <div class="integration-instagram-icon">IG</div>
          <div><p class="page-kicker">Distribuição social</p><h3>Instagram via n8n</h3><span class="newsletter-provider ${instagramConfig.publishReady ? 'is-ready' : ''}"><i></i>${instagramConfig.publishReady ? 'Publicação configurada' : 'Configuração incompleta'}</span></div>
        </div>
        <p class="integration-instagram-copy">O CMS mantém a revisão editorial. O n8n gera a legenda, rasteriza a arte e publica pela API oficial da Meta.</p>
        <form method="post" action="/admin/integrations/instagram" class="integration-instagram-form">
          ${renderCsrfInput(csrfToken)}
          <div class="form-group"><label for="instagram-account-label">Conta de destino</label><input class="form-control" id="instagram-account-label" name="account_label" maxlength="100" value="${escapeHtml(instagramConfig.accountLabel)}" placeholder="@diariodopovo"></div>
          <div class="form-group"><label for="instagram-caption-webhook">Webhook de legenda</label><input class="form-control" id="instagram-caption-webhook" name="caption_webhook_url" type="url" value="${escapeHtml(instagramConfig.captionWebhookUrl)}" placeholder="https://n8n.exemplo.com/webhook/instagram-caption"><small>Deve responder com caption, hashtags e alt_text.</small></div>
          <div class="form-group"><label for="instagram-publish-webhook">Webhook de publicação</label><input class="form-control" id="instagram-publish-webhook" name="publish_webhook_url" type="url" value="${escapeHtml(instagramConfig.publishWebhookUrl)}" placeholder="https://n8n.exemplo.com/webhook/instagram-publish"><small>Recebe a arte aprovada e devolve o resultado da Meta.</small></div>
          <div class="integration-instagram-security"><span>Segurança</span><p>As chamadas usam a chave do n8n e o segredo de webhook já protegidos no ambiente.</p></div>
          <button class="btn" type="submit">Salvar integração do Instagram</button>
        </form>
      </div>

      <div class="card integration-ai-card">
        <div class="integration-ai-head">
          <div class="integration-ai-icon">AI</div>
          <div>
            <p class="page-kicker">Inteligência editorial</p>
            <h3>OpenAI · Redação IA</h3>
            <span class="newsletter-provider ${editorialAiConfig.apiKeyConfigured && editorialAiConfig.enabled ? 'is-ready' : ''}"><i></i>${editorialAiConfig.apiKeyConfigured ? (editorialAiConfig.enabled ? 'Copiloto disponível' : 'Copiloto pausado') : 'Chave ainda não configurada'}</span>
          </div>
        </div>
        <p class="integration-ai-copy">Triagem de pautas, primeira versão e checagem estruturada. A IA não publica matérias e materiais confidenciais ficam fora das chamadas.</p>
        <div class="integration-ai-secret">
          <span>OPENAI_API_KEY</span>
          <strong>${editorialAiConfig.apiKeyConfigured ? 'Configurada no ambiente' : 'Ausente no ambiente'}</strong>
          <small>A chave é um segredo do Cloudflare: não é gravada no banco nem exibida pelo CMS.</small>
        </div>
        <form method="post" action="/admin/integrations/openai" class="integration-ai-form">
          ${renderCsrfInput(csrfToken)}
          <label class="integration-ai-toggle"><input type="checkbox" name="enabled" value="1" ${editorialAiConfig.enabled ? 'checked' : ''}><span><strong>Habilitar copiloto</strong><small>Os fluxos de RSS e dossiês continuam disponíveis quando pausado.</small></span></label>
          <div class="form-group"><label for="editorial-ai-model">Modelo</label><input class="form-control" id="editorial-ai-model" name="model" maxlength="80" value="${escapeHtml(editorialAiConfig.model)}" autocomplete="off"><small>Use um identificador disponível na sua conta da API.</small></div>
          <div class="integration-ai-grid">
            <div class="form-group"><label for="editorial-ai-effort">Raciocínio</label><select class="form-control" id="editorial-ai-effort" name="reasoning_effort">${['none', 'low', 'medium', 'high'].map(value => `<option value="${value}" ${editorialAiConfig.reasoningEffort === value ? 'selected' : ''}>${value === 'none' ? 'Sem raciocínio' : value === 'low' ? 'Baixo' : value === 'medium' ? 'Médio' : 'Alto'}</option>`).join('')}</select></div>
            <div class="form-group"><label for="editorial-ai-runs">Limite diário</label><input class="form-control" id="editorial-ai-runs" name="max_daily_runs" type="number" min="1" max="500" value="${editorialAiConfig.maxDailyRuns}"></div>
          </div>
          <div class="form-group"><label for="editorial-ai-source-limit">Máximo de caracteres por operação</label><input class="form-control" id="editorial-ai-source-limit" name="max_source_characters" type="number" min="10000" max="180000" step="1000" value="${editorialAiConfig.maxSourceCharacters}"></div>
          <button class="btn" type="submit">Salvar Redação IA</button>
        </form>
        <a class="integration-ai-link" href="/admin/redacao-ia">Abrir espaço de trabalho →</a>
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

export async function handleInstagramIntegrationSave(c: Context<{ Bindings: Env; Variables: AppContext }>) {
  const user = c.get('adminUser') as AdminUser
  if (normalizeRole(user.role) !== 'director') return c.html('<h1>Acesso negado</h1>', 403)
  const body = (c.get('parsedBody') || await c.req.parseBody()) as Record<string, string>
  const accountLabel = String(body.account_label || '').trim()
  const captionUrl = String(body.caption_webhook_url || '').trim()
  const publishUrl = String(body.publish_webhook_url || '').trim()
  const validUrl = (value: string) => {
    if (!value) return true
    try {
      const url = new URL(value)
      return url.protocol === 'https:' || url.hostname === 'localhost' || url.hostname === '127.0.0.1'
    } catch { return false }
  }
  if (!accountLabel || accountLabel.length > 100) return c.redirect('/admin/integrations?error=Informe+uma+conta+de+destino+válida.', 303)
  if (!validUrl(captionUrl) || !validUrl(publishUrl)) return c.redirect('/admin/integrations?error=Use+webhooks+HTTPS+válidos.', 303)
  try {
    for (const [key, value] of [
      ['instagram.account_label', accountLabel],
      ['instagram.caption_webhook_url', captionUrl],
      ['instagram.publish_webhook_url', publishUrl]
    ]) await setSetting(c.env, key, value, 'private', user.id)
    return c.redirect('/admin/integrations?success=instagram', 303)
  } catch (error) {
    console.error('[Instagram Integration] Save error:', error)
    return c.redirect('/admin/integrations?error=Não+foi+possível+salvar+a+integração.', 303)
  }
}

export async function handleEditorialAiIntegrationSave(c: Context<{ Bindings: Env; Variables: AppContext }>) {
  const user = c.get('adminUser') as AdminUser
  if (normalizeRole(user.role) !== 'director') return c.html('<h1>Acesso negado</h1>', 403)
  const body = (c.get('parsedBody') || await c.req.parseBody()) as Record<string, string>
  const model = String(body.model || '').trim()
  const reasoningEffort = String(body.reasoning_effort || 'low')
  const maxDailyRuns = Number.parseInt(String(body.max_daily_runs || ''), 10)
  const maxSourceCharacters = Number.parseInt(String(body.max_source_characters || ''), 10)
  if (!/^[a-z0-9][a-z0-9._-]{1,80}$/i.test(model)) {
    return c.redirect('/admin/integrations?error=Informe+um+identificador+de+modelo+válido.', 303)
  }
  if (!['none', 'low', 'medium', 'high'].includes(reasoningEffort)) {
    return c.redirect('/admin/integrations?error=Selecione+um+nível+de+raciocínio+válido.', 303)
  }
  if (!Number.isInteger(maxDailyRuns) || maxDailyRuns < 1 || maxDailyRuns > 500) {
    return c.redirect('/admin/integrations?error=O+limite+diário+deve+ficar+entre+1+e+500.', 303)
  }
  if (!Number.isInteger(maxSourceCharacters) || maxSourceCharacters < 10000 || maxSourceCharacters > 180000) {
    return c.redirect('/admin/integrations?error=O+limite+de+fontes+deve+ficar+entre+10.000+e+180.000+caracteres.', 303)
  }
  try {
    for (const [key, value] of [
      ['editorial_ai.enabled', body.enabled === '1'],
      ['editorial_ai.model', model],
      ['editorial_ai.reasoning_effort', reasoningEffort],
      ['editorial_ai.max_daily_runs', maxDailyRuns],
      ['editorial_ai.max_source_characters', maxSourceCharacters]
    ] as Array<[string, string | number | boolean]>) await setSetting(c.env, key, value, 'private', user.id)
    return c.redirect('/admin/integrations?success=openai', 303)
  } catch (error) {
    console.error('[Editorial AI Integration] Save error:', error)
    return c.redirect('/admin/integrations?error=Não+foi+possível+salvar+a+configuração+da+Redação+IA.', 303)
  }
}
