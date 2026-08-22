import type { Context } from 'hono'
import { getSetting } from '../../db'
import { renderPortalIcon, renderSubscriberShell } from './ui'

export async function renderDashboardPage(c: Context) {
  const siteName = await getSetting(c.env, 'site_name', 'public') || 'Diário do Povo'
  const nonce = c.get('cspNonce') || ''
  const icon = (name: string) => `<span class="portal-icon">${renderPortalIcon(name)}</span>`

  const bodyHtml = `
    <header class="portal-page-intro">
      <div>
        <p class="portal-kicker">Sua assinatura</p>
        <h1 class="portal-title">Olá, <span id="userNameHeader">assinante</span>.</h1>
        <p class="portal-description">Acompanhe seu acesso, as próximas cobranças e o histórico da sua assinatura.</p>
      </div>
      <button id="logoutBtn" type="button" class="portal-button portal-button-danger">${icon('logout')} Sair da conta</button>
    </header>

    <div id="portalMessage" class="portal-error hidden" role="alert" aria-live="polite"></div>

    <div id="loading" class="portal-loading" aria-live="polite">
      <div><div class="portal-loading-spinner"></div><p>Carregando sua assinatura...</p></div>
    </div>

    <div id="dashboardContent" class="hidden">
      <div class="portal-dashboard-grid">
        <div class="portal-stack">
          <section class="portal-card subscription-hero" aria-labelledby="plan-title">
            <div class="portal-card-header">
              <h2 id="plan-title" class="portal-card-title">Plano atual</h2>
              <span id="statusPill" class="status-pill status-none">Carregando</span>
            </div>
            <h3 id="planName" class="subscription-plan">Assinatura</h3>
            <p id="validityInfo" class="subscription-validity">Acesso válido até <strong id="validUntil">—</strong></p>
            <p id="premiumAccess" class="subscription-access hidden">${icon('check')} Acesso ilimitado a todo o conteúdo do jornal.</p>
            <p id="premiumAccessInactive" class="subscription-access hidden">${icon('lock')} Escolha um plano para liberar o conteúdo exclusivo.</p>
          </section>

          <section class="portal-card" aria-labelledby="history-title">
            <div class="portal-card-header">
              <div><h2 id="history-title" class="portal-card-title">Histórico de cobranças</h2><p class="portal-card-description">Faturas e pagamentos recentes.</p></div>
              <span class="portal-icon" style="color:var(--portal-muted)">${renderPortalIcon('receipt')}</span>
            </div>
            <div class="portal-table-wrap">
              <table class="portal-table">
                <thead><tr><th>Vencimento</th><th>Valor</th><th>Status</th><th>Ação</th></tr></thead>
                <tbody id="invoiceHistoryTable"></tbody>
              </table>
            </div>
          </section>
        </div>

        <aside class="portal-stack" aria-label="Ações da assinatura">
          <section id="invoiceCard" class="portal-notice hidden" aria-labelledby="invoice-alert-title">
            <div class="portal-notice-header">${icon('clock')}<h3 id="invoice-alert-title">Pagamento pendente</h3></div>
            <p>Uma fatura de <strong id="invoiceAmount"></strong> vence em <strong id="invoiceDate"></strong>.</p>
            <a id="payBtn" href="#" target="_blank" rel="noopener" class="portal-button">Regularizar pagamento ${icon('external')}</a>
          </section>

          <section class="portal-card" aria-labelledby="manage-title">
            <div class="portal-card-header"><div><h2 id="manage-title" class="portal-card-title">Gerenciar assinatura</h2><p class="portal-card-description">Escolha a melhor modalidade para você.</p></div></div>

            <div id="subscribeActions" class="hidden">
              <p class="manage-copy">Assine para ter acesso completo ao Diário do Povo.</p>
              <div class="plan-selector">
                <button id="subMensalBtn" type="button" class="plan-option">
                  <span class="plan-option-top"><strong class="plan-option-name">Plano mensal</strong><span class="plan-option-note">Flexível</span></span>
                  <span class="plan-option-price">R$ 9,90 <small>/ mês</small></span>
                </button>
                <button id="subAnualBtn" type="button" class="plan-option">
                  <span class="plan-option-top"><strong class="plan-option-name">Plano anual</strong><span class="plan-option-saving">Economize 20%</span></span>
                  <span class="plan-option-price">R$ 94,90 <small>/ ano</small></span>
                </button>
              </div>
            </div>

            <div id="manageActions" class="hidden">
              <p class="manage-copy">Sua assinatura está vinculada a esta conta. Para alterações ou cancelamento, fale com nosso atendimento.</p>
              <a href="/contato" class="portal-button portal-button-secondary">Falar com atendimento ${icon('arrow')}</a>
            </div>
          </section>
        </aside>
      </div>
    </div>
  `

  const script = `
    const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

    function safePaymentUrl(value) {
      if (!value) return '';
      try {
        const url = new URL(value, window.location.origin);
        return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
      } catch { return ''; }
    }

    function showPortalError(message) {
      const box = document.getElementById('portalMessage');
      box.textContent = message;
      box.classList.remove('hidden');
    }

    function renderInvoices(invoices) {
      const table = document.getElementById('invoiceHistoryTable');
      table.replaceChildren();

      if (!Array.isArray(invoices) || invoices.length === 0) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 4;
        cell.className = 'portal-empty-cell';
        cell.textContent = 'Nenhuma cobrança registrada até o momento.';
        row.appendChild(cell);
        table.appendChild(row);
        return;
      }

      invoices.forEach((invoice) => {
        const row = document.createElement('tr');
        const dateCell = document.createElement('td');
        const amountCell = document.createElement('td');
        const statusCell = document.createElement('td');
        const actionCell = document.createElement('td');

        dateCell.textContent = invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('pt-BR') : '—';
        amountCell.textContent = currencyFormatter.format(Number(invoice.amount) || 0);
        const paid = invoice.status === 'paid';
        statusCell.textContent = paid ? 'Pago' : invoice.status === 'overdue' ? 'Em atraso' : 'Pendente';
        statusCell.className = 'invoice-status ' + (paid ? 'paid' : 'pending');

        const paymentUrl = safePaymentUrl(invoice.payment_url);
        if (paymentUrl && !paid) {
          const link = document.createElement('a');
          link.href = paymentUrl;
          link.target = '_blank';
          link.rel = 'noopener';
          link.className = 'invoice-action';
          link.textContent = 'Pagar';
          actionCell.appendChild(link);
        } else {
          actionCell.textContent = '—';
        }

        row.append(dateCell, amountCell, statusCell, actionCell);
        table.appendChild(row);
      });
    }

    function renderDashboard(data) {
      document.getElementById('loading').classList.add('hidden');
      document.getElementById('dashboardContent').classList.remove('hidden');
      const subscriber = data.subscriber || {};
      const subscription = data.subscription || { status: 'none' };
      const nextInvoice = data.next_invoice;

      document.getElementById('userNameHeader').textContent = (subscriber.name || '').trim().split(/\\s+/)[0] || 'assinante';

      const statusMap = {
        active: { label: 'Ativa', className: 'status-active' },
        past_due: { label: 'Em atraso', className: 'status-past_due' },
        canceled: { label: 'Cancelada', className: 'status-canceled' },
        none: { label: 'Sem assinatura', className: 'status-none' }
      };
      const status = statusMap[subscription.status] || statusMap.none;
      const pill = document.getElementById('statusPill');
      pill.textContent = status.label;
      pill.className = 'status-pill ' + status.className;

      document.getElementById('planName').textContent = subscription.plan_type === 'mensal'
        ? 'Plano mensal'
        : subscription.plan_type === 'anual' ? 'Plano anual' : 'Nenhum plano ativo';

      document.getElementById(subscription.is_premium ? 'premiumAccess' : 'premiumAccessInactive').classList.remove('hidden');

      if (subscription.current_period_end && subscription.status === 'active') {
        document.getElementById('validUntil').textContent = new Date(subscription.current_period_end).toLocaleDateString('pt-BR');
      } else {
        document.getElementById('validityInfo').classList.add('hidden');
      }

      if (nextInvoice && (nextInvoice.status === 'pending' || nextInvoice.status === 'overdue')) {
        document.getElementById('invoiceCard').classList.remove('hidden');
        document.getElementById('invoiceAmount').textContent = currencyFormatter.format(Number(nextInvoice.amount) || 0);
        document.getElementById('invoiceDate').textContent = nextInvoice.due_date ? new Date(nextInvoice.due_date).toLocaleDateString('pt-BR') : 'breve';
        const paymentUrl = safePaymentUrl(nextInvoice.payment_url);
        const payButton = document.getElementById('payBtn');
        if (paymentUrl) payButton.href = paymentUrl;
        else payButton.classList.add('hidden');
      }

      renderInvoices(data.invoices);
      document.getElementById(subscription.status === 'none' || subscription.status === 'canceled' ? 'subscribeActions' : 'manageActions').classList.remove('hidden');
    }

    async function loadDashboard() {
      try {
        const response = await fetch('/api/portal/dashboard');
        if (response.status === 401) {
          window.location.href = '/portal/login';
          return;
        }
        if (!response.ok) throw new Error('dashboard');
        renderDashboard(await response.json());
      } catch (error) {
        document.getElementById('loading').classList.add('hidden');
        showPortalError('Não foi possível carregar sua assinatura. Atualize a página para tentar novamente.');
      }
    }

    async function startSubscription(plan, button) {
      button.disabled = true;
      try {
        const response = await fetch('/api/portal/assinatura/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan })
        });
        const data = await response.json();
        if (data.success || data.subscriptionId) {
          window.location.reload();
          return;
        }
        showPortalError(data.error || 'Não foi possível iniciar a assinatura.');
      } catch (error) {
        showPortalError('Não foi possível conectar. Tente novamente em alguns instantes.');
      } finally {
        button.disabled = false;
      }
    }

    document.getElementById('logoutBtn').addEventListener('click', async () => {
      await fetch('/api/portal/auth/logout', { method: 'POST' });
      window.location.href = '/portal/login';
    });
    document.getElementById('subMensalBtn').addEventListener('click', (event) => startSubscription('mensal', event.currentTarget));
    document.getElementById('subAnualBtn').addEventListener('click', (event) => startSubscription('anual', event.currentTarget));
    loadDashboard();
  `

  return renderSubscriberShell({
    title: 'Minha assinatura',
    siteName,
    activeTab: 'dashboard',
    bodyHtml,
    nonce,
    script
  })
}
