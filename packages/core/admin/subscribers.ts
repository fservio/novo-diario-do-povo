
import type { Context } from 'hono'
import type { Env, AppContext } from '../types'
import { escapeHtml, renderAdminLayout, type AdminUser } from './ui'
import { listSubscribers, updateSubscriberStatus } from '../db/subscribers'

// ============================================================================
// Render Functions
// ============================================================================

function renderSubscribersList(subscribers: any[], csrfToken: string): string {
    const rows = subscribers.map(sub => {
        const statusBadge = sub.status === 'active'
            ? '<span style="display: inline-flex; align-items: center; justify-content: center; padding: 0.25rem 0.5rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; background: rgba(16, 185, 129, 0.1); color: #10b981;">Ativo</span>'
            : '<span style="display: inline-flex; align-items: center; justify-content: center; padding: 0.25rem 0.5rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; background: rgba(239, 68, 68, 0.1); color: #ef4444;">Bloqueado</span>'

        const subStatusBadge = sub.subscription_status === 'active'
            ? '<span style="color: #10b981; font-weight: 600;">Premium (Ativo)</span>'
            : sub.subscription_status === 'past_due'
                ? '<span style="color: #f59e0b; font-weight: 600;">Em atraso</span>'
                : '<span style="color: var(--text-muted);">Gratuito</span>'

        return `
      <tr>
        <td>
          <div style="font-weight: 700;">${escapeHtml(sub.name || 'Sem nome')}</div>
          <div style="font-size: 0.8125rem; color: var(--text-muted);">${escapeHtml(sub.email)}</div>
        </td>
        <td>${subStatusBadge}</td>
        <td>${statusBadge}</td>
        <td style="color: var(--text-muted); font-size: 0.875rem;">
          ${sub.created_at ? new Date(sub.created_at).toLocaleDateString('pt-BR') : '-'}
        </td>
        <td>
          <div style="display: flex; gap: 0.5rem;">
            ${sub.status === 'active' ? `
              <form method="POST" action="/admin/subscribers/${sub.id}/block">
                <input type="hidden" name="csrf_token" value="${csrfToken}" />
                <button type="submit" class="btn" style="padding: 0.4rem 0.8rem; font-size: 0.75rem; background: #ef4444; border: none; color: white;" onclick="return confirm('Bloquear este assinante?')">
                  Bloquear
                </button>
              </form>
            ` : `
              <form method="POST" action="/admin/subscribers/${sub.id}/unblock">
                <input type="hidden" name="csrf_token" value="${csrfToken}" />
                <button type="submit" class="btn" style="padding: 0.4rem 0.8rem; font-size: 0.75rem; background: #10b981; border: none; color: white;">
                  Ativar
                </button>
              </form>
            `}
          </div>
        </td>
      </tr>
    `
    }).join('')

    return `
    <div style="margin-bottom: 2rem; display: flex; justify-content: space-between; align-items: center;">
      <h1 class="section-title" style="margin: 0;">Assinantes</h1>
    </div>

    <div class="card" style="padding: 0; overflow: hidden;">
      <table>
        <thead>
          <tr>
            <th>Nome / Email</th>
            <th>Assinatura</th>
            <th>Status Conta</th>
            <th>Data Cadastro</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length > 0 ? rows : '<tr><td colspan="5" style="text-align: center; padding: 2rem; color: var(--text-muted);">Nenhum assinante encontrado</td></tr>'}
        </tbody>
      </table>
    </div>
  `
}

// ============================================================================
// Handlers
// ============================================================================

export async function handleSubscribersList(c: Context<{ Bindings: Env; Variables: AppContext }>) {
    const user = c.get('adminUser') as AdminUser
    const csrfToken = c.get('csrfToken') as string

    const filters = {
        status: c.req.query('status'),
        q: c.req.query('q'),
    }

    const subscribers = await listSubscribers(c.env, filters)

    const content = renderSubscribersList(subscribers, csrfToken)
    return c.html(renderAdminLayout(content, user, csrfToken))
}

export async function handleBlockSubscriber(c: Context<{ Bindings: Env; Variables: AppContext }>) {
    const id = parseInt(c.req.param('id'))
    await updateSubscriberStatus(c.env, id, 'blocked')
    return c.redirect('/admin/subscribers', 302)
}

export async function handleUnblockSubscriber(c: Context<{ Bindings: Env; Variables: AppContext }>) {
    const id = parseInt(c.req.param('id'))
    await updateSubscriberStatus(c.env, id, 'active')
    return c.redirect('/admin/subscribers', 302)
}
