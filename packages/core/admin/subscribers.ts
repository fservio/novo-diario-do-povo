
import type { Context } from 'hono'
import { renderAdminLayout, escapeHtml } from './ui'
import { listSubscribers, getSubscriberById, updateSubscriberStatus, getSubscriptionStatus } from '../db/subscribers'
import type { Env } from '../types'

export async function handleSubscribersList(c: Context) {
    const env = c.env as Env
    const user = c.get('adminUser')
    const q = c.req.query('q') || ''

    const subscribers = await listSubscribers(env, { q })

    const bodyHtml = `
        <div class="header-actions" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
            <h1 class="section-title" style="margin-bottom: 0;">👥 Assinantes</h1>
            <div class="search-box">
                <form method="get" action="/admin/subscribers" style="display: flex; gap: 0.75rem; align-items: center;">
                    <div class="form-group" style="margin: 0;">
                        <input type="text" name="q" class="form-control" value="${escapeHtml(q)}" placeholder="Nome ou email..." style="width: 320px;">
                    </div>
                    <button type="submit" class="btn" style="height: 48px; min-width: 100px; font-weight: 700;">Buscar</button>
                    ${q ? `<a href="/admin/subscribers" class="btn btn-outline" style="height: 48px; display: flex; align-items: center; border-color: transparent;">Limpar</a>` : ''}
                </form>
            </div>
        </div>

        <div class="card" style="padding: 0; overflow: hidden;">
            <table>
                <thead>
                    <tr>
                        <th>Nome / Email</th>
                        <th>CPF / Telefone</th>
                        <th>Status Conta</th>
                        <th>Assinatura</th>
                        <th>Cadastrado em</th>
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${subscribers.map(s => `
                        <tr>
                            <td>
                                <div style="font-weight: 600;">${escapeHtml(s.name || 'Sem nome')}</div>
                                <div style="font-size: 0.8125rem; color: var(--text-muted);">${escapeHtml(s.email)}</div>
                            </td>
                            <td>
                                <div style="font-size: 0.8125rem;">${escapeHtml(s.cpf || '-')}</div>
                                <div style="font-size: 0.8125rem; color: var(--text-muted);">${escapeHtml(s.phone || '-')}</div>
                            </td>
                            <td>
                                <span class="badge ${s.status === 'active' ? 'badge-success' : 'badge-danger'}">
                                    ${s.status === 'active' ? 'Ativo' : 'Bloqueado'}
                                </span>
                            </td>
                            <td>
                                ${s.subscription_status ? `
                                    <div style="font-weight: 500;">${escapeHtml(s.plan_type === 'anual' ? 'Anual' : 'Mensal')}</div>
                                    <span class="badge ${s.subscription_status === 'active' ? 'badge-success' : 'badge-warning'}">
                                        ${escapeHtml(s.subscription_status)}
                                    </span>
                                ` : '<span style="color: var(--text-muted);">Nenhuma</span>'}
                            </td>
                            <td style="font-size: 0.8125rem;">
                                ${new Date(s.created_at).toLocaleDateString('pt-BR')}
                            </td>
                            <td>
                                <a href="/admin/subscribers/${s.id}" class="btn btn-secondary" style="padding: 0.5rem 1rem; font-size: 0.8125rem;">Ver Detalhes</a>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <style>
            .badge {
                display: inline-block;
                padding: 0.25rem 0.625rem;
                border-radius: 9999px;
                font-size: 0.75rem;
                font-weight: 700;
                text-transform: uppercase;
            }
            .badge-success { background: rgba(16, 185, 129, 0.1); color: #10b981; }
            .badge-danger { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
            .badge-warning { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }
        </style>
    `

    return c.html(renderAdminLayout({
        title: 'Assinantes',
        user,
        bodyHtml,
        activeTab: 'subscribers'
    }))
}

export async function handleSubscriberDetail(c: Context) {
    const env = c.env as Env
    const user = c.get('adminUser')
    const id = parseInt(c.req.param('id'))

    const subscriber = await getSubscriberById(env, id)
    if (!subscriber) return c.notFound()

    // Get detailed sub status
    const status = await getSubscriptionStatus(env, id)

    // Get invoices
    const invoices = (await env.DB.prepare('SELECT * FROM invoices WHERE subscriber_id = ? ORDER BY created_at DESC').bind(id).all()).results

    const bodyHtml = `
        <div class="mb-6">
             <a href="/admin/subscribers" style="color: var(--accent); text-decoration: none; font-weight: 600;">← Voltar para lista</a>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;">
            <div>
                <h2 class="section-title">Dados do Perfil</h2>
                <div class="card" style="padding: 2rem;">
                    <div class="form-group">
                        <label>Nome Completo</label>
                        <div style="font-size: 1.125rem; font-weight: 700; color: var(--text-main);">${escapeHtml(subscriber.name || '-')}</div>
                    </div>
                    <div class="form-group" style="border-top: 1px solid #f1f5f9; padding-top: 1.5rem;">
                        <label>Email de Cadastro</label>
                        <div style="font-family: 'JetBrains Mono', monospace; font-size: 0.9375rem;">${escapeHtml(subscriber.email)}</div>
                    </div>
                    <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 1.5rem; border-top: 1px solid #f1f5f9; padding-top: 1.5rem; margin-top: 1.5rem;">
                        <div class="form-group" style="margin-bottom: 0;">
                            <label>CPF</label>
                            <div style="font-weight: 600;">${escapeHtml(subscriber.cpf || '-')}</div>
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <label>Telefone</label>
                            <div style="font-weight: 600;">${escapeHtml(subscriber.phone || '-')}</div>
                        </div>
                    </div>
                    <div class="form-group" style="border-top: 1px solid #f1f5f9; padding-top: 1.5rem; margin-top: 1.5rem;">
                        <label>Status da Conta</label>
                        <form method="post" action="/admin/subscribers/${id}/status" style="display: flex; gap: 0.75rem; align-items: center;">
                            <select name="status" class="form-control" style="width: 160px; font-weight: 700;">
                                <option value="active" ${subscriber.status === 'active' ? 'selected' : ''}>Ativo</option>
                                <option value="blocked" ${subscriber.status === 'blocked' ? 'selected' : ''}>Bloqueado</option>
                            </select>
                            <button type="submit" class="btn btn-outline" style="height: 48px; padding: 0 1.25rem; font-weight: 700;">Atualizar</button>
                        </form>
                    </div>
                </div>
            </div>

            <div>
                <h2 class="section-title">Assinatura</h2>
                <div class="card" style="padding: 2rem;">
                    <div class="form-group">
                        <label>Status Atual</label>
                         <span class="badge ${status.isPremium ? 'badge-success' : 'badge-danger'}" style="padding: 0.5rem 1rem; font-size: 0.8125rem;">
                            ${status.isPremium ? 'PREMIUM ATIVO' : 'SEM ACESSO'}
                        </span>
                        <div style="margin-top: 1rem; font-size: 0.8125rem; color: var(--text-muted); line-height: 1.6; font-weight: 500;">
                            <strong>Status no Gateway:</strong> ${escapeHtml(status.status)}<br>
                            ${status.periodEnd ? `<strong>Válido até:</strong> ${new Date(status.periodEnd).toLocaleDateString('pt-BR')}` : ''}
                        </div>
                    </div>

                    <div class="form-group" style="border-top: 1px solid #f1f5f9; padding-top: 1.5rem; margin-top: 1.5rem;">
                        <label>Assinatura de Cortesia</label>
                        <p style="font-size: 0.8125rem; color: var(--text-muted); margin-bottom: 1.25rem; font-weight: 500; line-height: 1.5;">
                            Dê acesso imediato manualmente para testes ou promoções.
                        </p>
                        <form method="post" action="/admin/subscribers/${id}/grant-complimentary" style="display: flex; flex-direction: column; gap: 1.25rem;">
                            <div style="display: flex; gap: 0.75rem;">
                                <div style="flex: 2;">
                                    <label style="font-size: 0.75rem; color: #94a3b8; font-weight: 800; margin-bottom: 0.375rem; display: block;">PLANO</label>
                                    <select name="plan_type" class="form-control">
                                        <option value="mensal">Mensal</option>
                                        <option value="anual">Anual</option>
                                    </select>
                                </div>
                                <div style="flex: 1;">
                                    <label style="font-size: 0.75rem; color: #94a3b8; font-weight: 800; margin-bottom: 0.375rem; display: block;">DIAS</label>
                                    <input type="number" name="days" class="form-control" value="30" min="1" style="font-weight: 700;">
                                </div>
                            </div>
                            <button type="submit" class="btn btn-primary" style="height: 48px; font-weight: 700;" onclick="return confirm('Confirmar cortesia?')">Conceder Acesso Agora</button>
                        </form>
                    </div>
                </div>
            </div>
        </div>

        <div style="margin-top: 2rem;">
            <h2 class="section-title">Histórico de Cobranças (Invoices)</h2>
            <div class="card" style="padding: 0; overflow: hidden;">
                <table>
                    <thead>
                        <tr>
                            <th>ID Asaas</th>
                            <th>Valor</th>
                            <th>Vencimento</th>
                            <th>Status</th>
                            <th>Pago em</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${invoices.map((inv: any) => `
                            <tr>
                                <td style="font-size: 0.8125rem;">${escapeHtml(inv.asaas_payment_id || 'N/A')}</td>
                                <td>R$ ${inv.amount?.toFixed(2)}</td>
                                <td>${new Date(inv.due_date).toLocaleDateString('pt-BR')}</td>
                                <td>
                                    <span class="badge ${inv.status === 'paid' ? 'badge-success' : 'badge-warning'}">
                                        ${escapeHtml(inv.status)}
                                    </span>
                                </td>
                                <td>${inv.paid_at ? new Date(inv.paid_at).toLocaleDateString('pt-BR') : '-'}</td>
                            </tr>
                        `).join('')}
                        ${invoices.length === 0 ? '<tr><td colspan="5" style="text-align: center; py: 2rem; color: var(--text-muted);">Nenhuma fatura encontrada.</td></tr>' : ''}
                    </tbody>
                </table>
            </div>
        </div>

        <style>
            .badge {
                display: inline-block;
                padding: 0.25rem 0.625rem;
                border-radius: 9999px;
                font-size: 0.75rem;
                font-weight: 700;
                text-transform: uppercase;
            }
            .badge-success { background: rgba(16, 185, 129, 0.1); color: #10b981; }
            .badge-danger { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
            .badge-warning { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }
        </style>
    `

    return c.html(renderAdminLayout({
        title: `Detalhes: ${subscriber.email}`,
        user,
        bodyHtml,
        activeTab: 'subscribers'
    }))
}

export async function handleUpdateStatus(c: Context) {
    const env = c.env as Env
    const id = parseInt(c.req.param('id'))
    const body = await c.req.parseBody()
    const status = body.status as 'active' | 'blocked'

    await updateSubscriberStatus(env, id, status)
    return c.redirect(`/admin/subscribers/${id}?success=status_updated`)
}

export async function handleGrantComplimentary(c: Context) {
    const env = c.env as Env
    const id = parseInt(c.req.param('id'))
    const body = await c.req.parseBody()
    const planType = body.plan_type as string
    const days = parseInt(body.days as string)

    const { grantComplimentarySubscription } = await import('../db/subscribers')
    await grantComplimentarySubscription(env, id, planType, days)

    return c.redirect(`/admin/subscribers/${id}?success=complimentary_granted`)
}
