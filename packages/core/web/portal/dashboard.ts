
import type { Context } from 'hono'
import { getSetting } from '../../db'

export async function renderDashboardPage(c: Context) {
    const siteName = await getSetting(c.env, 'site_name', 'public') || 'Diário do Povo'
    const nonce = c.get('cspNonce')

    return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Minha Assinatura | ${siteName}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
        <style>
            :root {
                --primary: #2b5375;
                --primary-light: #8cb9e1;
                --primary-dark: #1d3a52;
                --bg: #f8fafc;
                --text-main: #1e293b;
                --text-muted: #64748b;
                --white: #ffffff;
                --success: #10b981;
                --danger: #ef4444;
                --warning: #f59e0b;
                --radius: 1rem;
            }

            * { box-sizing: border-box; margin: 0; padding: 0; }

            body {
                font-family: 'Inter', sans-serif;
                background-color: var(--bg);
                color: var(--text-main);
                min-height: 100vh;
                line-height: 1.5;
            }

            /* Navigation */
            .portal-nav {
                background: var(--white);
                border-bottom: 1px solid #e2e8f0;
                height: 72px;
                position: sticky;
                top: 0;
                z-index: 100;
                box-shadow: 0 1px 2px rgba(0,0,0,0.03);
            }

            .nav-container {
                max-width: 1100px;
                margin: 0 auto;
                height: 100%;
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 0 1.5rem;
            }

            .nav-logo img {
                height: 32px;
                width: auto;
            }

            .nav-actions {
                display: flex;
                align-items: center;
                gap: 1.5rem;
            }

            .nav-link {
                text-decoration: none;
                color: var(--text-muted);
                font-size: 0.875rem;
                font-weight: 500;
                transition: color 0.2s;
            }

            .nav-link:hover, .nav-link.active {
                color: var(--primary);
            }

            .logout-btn {
                background: none;
                border: none;
                color: var(--text-muted);
                font-size: 0.875rem;
                cursor: pointer;
                padding: 0.5rem;
                transition: color 0.2s;
            }

            .logout-btn:hover {
                color: var(--danger);
            }

            /* Content */
            .main-content {
                max-width: 900px;
                margin: 2.5rem auto;
                padding: 0 1.5rem;
            }

            .page-header {
                display: flex;
                align-items: flex-end;
                justify-content: space-between;
                margin-bottom: 2rem;
            }

            .page-header h1 {
                font-size: 1.875rem;
                font-weight: 800;
                color: var(--primary);
                letter-spacing: -0.025em;
            }

            /* Cards */
            .card {
                background: var(--white);
                border: 1px solid #e2e8f0;
                border-radius: var(--radius);
                padding: 1.5rem;
                margin-bottom: 1.5rem;
                box-shadow: 0 1px 3px rgba(0,0,0,0.02);
            }

            .card-title {
                font-size: 1.125rem;
                font-weight: 700;
                margin-bottom: 1.25rem;
                color: var(--text-main);
                display: flex;
                align-items: center;
                justify-content: space-between;
            }

            /* Pills */
            .status-pill {
                padding: 0.375rem 0.75rem;
                border-radius: 2rem;
                font-size: 0.75rem;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.025em;
            }

            .status-active { background: #dcfce7; color: #166534; }
            .status-past_due { background: #fee2e2; color: #991b1b; }
            .status-canceled { background: #f1f5f9; color: #475569; }
            .status-none { background: #f1f5f9; color: #475569; }

            /* Grid Layout */
            .dashboard-grid {
                display: grid;
                grid-template-columns: 1fr;
                gap: 1.5rem;
            }

            @media (min-width: 768px) {
                .dashboard-grid {
                    grid-template-columns: 3fr 2fr;
                }
            }

            /* Table Styles */
            .table-container {
                overflow-x: auto;
            }

            table {
                width: 100%;
                border-collapse: collapse;
                font-size: 0.875rem;
            }

            th {
                text-align: left;
                padding: 0.75rem 0;
                color: var(--text-muted);
                font-weight: 600;
                border-bottom: 1px solid #f1f5f9;
            }

            td {
                padding: 1rem 0;
                border-bottom: 1px solid #f1f5f9;
            }

            /* Plan Buttons */
            .plan-selector {
                display: grid;
                grid-template-columns: 1fr;
                gap: 1rem;
                margin-top: 1rem;
            }

            .plan-btn {
                background: var(--white);
                border: 2px solid #e2e8f0;
                padding: 1.25rem;
                border-radius: 0.75rem;
                text-align: left;
                cursor: pointer;
                transition: all 0.2s;
            }

            .plan-btn:hover {
                border-color: var(--primary-light);
                background: #f8fbff;
            }

            .plan-btn.active {
                border-color: var(--primary);
                background: #f0f7ff;
            }

            /* Loading */
            .loading-state {
                text-align: center;
                padding: 4rem 1rem;
            }

            .spinner {
                width: 2rem;
                height: 2rem;
                border: 3px solid #e2e8f0;
                border-top-color: var(--primary);
                border-radius: 50%;
                animation: spin 0.8s linear infinite;
                margin: 0 auto 1rem;
            }

            @keyframes spin {
                to { transform: rotate(360deg); }
            }

            .btn-action {
                background: var(--primary);
                color: white;
                padding: 0.625rem 1.25rem;
                border-radius: 0.5rem;
                font-weight: 600;
                text-decoration: none;
                font-size: 0.875rem;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                border: none;
                cursor: pointer;
                transition: all 0.2s;
            }

            .btn-action:hover {
                background: var(--primary-dark);
                transform: translateY(-1px);
            }

            .hidden { display: none !important; }
        </style>
    </head>
    <body class="bg-gray-50 min-h-screen">
        <nav class="portal-nav">
            <div class="nav-container">
                <a href="/" class="nav-logo">
                    <img src="/static/logo-dp.png" alt="${siteName}">
                </a>
                <div class="nav-actions">
                    <a href="/portal" class="nav-link active">Minha Assinatura</a>
                    <a href="/portal/account" class="nav-link">Meus Dados</a>
                    <button id="logoutBtn" class="logout-btn">Sair</button>
                </div>
            </div>
        </nav>

        <main class="main-content">
            <div class="page-header">
                <div>
                    <h1>Olá, <span id="userNameHeader">...</span></h1>
                    <p class="text-sm text-gray-400">Gerencie seu acesso e histórico de pagamentos.</p>
                </div>
            </div>
            
            <div id="loading" class="loading-state">
                <div class="spinner"></div>
                <p class="text-gray-500">Buscando suas informações...</p>
            </div>

            <div id="dashboardContent" class="hidden">
                <div class="dashboard-grid">
                    <!-- Column 1 -->
                    <div class="space-y-4">
                        <!-- Status Card -->
                        <div class="card">
                            <div class="card-title">
                                Plano Atual
                                <span id="statusPill" class="status-pill status-none">...</span>
                            </div>
                            
                            <div class="mb-4">
                                <h3 id="planName" class="text-xl font-bold text-gray-900">...</h3>
                                <p id="validityInfo" class="text-sm text-muted">Válido até: <span id="validUntil" class="font-medium text-gray-900">-</span></p>
                            </div>

                            <div id="premiumAccess" class="hidden p-3 bg-emerald-50 text-emerald-700 rounded-lg text-sm border border-emerald-100 flex items-center gap-2">
                                <span>✨</span> Você tem acesso ilimitado a todo o conteúdo.
                            </div>
                            <div id="premiumAccessInactive" class="hidden p-3 bg-slate-100 text-slate-600 rounded-lg text-sm border border-slate-200">
                                🔒 Assine um plano para liberar acesso ilimitado.
                            </div>
                        </div>

                        <!-- History Card -->
                        <div class="card">
                            <div class="card-title">Histórico de Cobrança</div>
                            <div class="table-container">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Vencimento</th>
                                            <th>Valor</th>
                                            <th>Status</th>
                                            <th>Ação</th>
                                        </tr>
                                    </thead>
                                    <tbody id="invoiceHistoryTable">
                                        <!-- JS Content -->
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    <!-- Column 2 -->
                    <div class="space-y-4">
                        <!-- Pending Invoice Alert -->
                        <div id="invoiceCard" class="hidden card border-l-4 border-l-amber-500 bg-amber-50">
                            <h3 class="font-bold text-amber-900 mb-1">Atenção</h3>
                            <p class="text-sm text-amber-800 mb-4">
                                Fatura de <strong id="invoiceAmount"></strong> vence em <strong id="invoiceDate"></strong>.
                            </p>
                            <a id="payBtn" href="#" target="_blank" class="btn-action w-full" style="background: var(--warning)">
                                Pagar com PIX/Boleto/Cartão
                            </a>
                        </div>

                        <!-- Action Card -->
                        <div class="card">
                            <div class="card-title">Gerenciar</div>
                            
                            <div id="subscribeActions" class="hidden">
                                <p class="text-sm text-gray-500 mb-4">Aumente sua experiência com um plano:</p>
                                <div class="plan-selector">
                                    <button id="subMensalBtn" class="plan-btn">
                                        <div class="flex justify-between items-center mb-1">
                                            <strong class="text-primary">MENSAL</strong>
                                            <span class="text-sm text-gray-400">Individual</span>
                                        </div>
                                        <div class="text-xl font-bold">R$ 9,90 <span class="text-sm font-normal text-gray-500">/mês</span></div>
                                    </button>

                                    <button id="subAnualBtn" class="plan-btn">
                                        <div class="flex justify-between items-center mb-1">
                                            <strong class="text-primary">ANUAL</strong>
                                            <span class="text-xs font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded">ECONOMIZE 20%</span>
                                        </div>
                                        <div class="text-xl font-bold">R$ 94,90 <span class="text-sm font-normal text-gray-500">/ano</span></div>
                                    </button>
                                </div>
                            </div>

                            <div id="manageActions" class="hidden">
                                <p class="text-sm text-gray-500 mb-0">Para cancelamentos ou alterações, entre em contato com nosso suporte.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </main>

        <script nonce="${nonce}">
            async function loadDashboard() {
                try {
                    const res = await fetch('/api/portal/dashboard');
                    if (res.status === 401) {
                        window.location.href = '/portal/login';
                        return;
                    }
                    const data = await res.json();
                    render(data);
                } catch (e) {
                    console.error('Load error:', e);
                }
            }

            function render(data) {
                document.getElementById('loading').classList.add('hidden');
                document.getElementById('dashboardContent').classList.remove('hidden');

                const { subscriber, subscription, next_invoice, invoices } = data;

                document.getElementById('userNameHeader').textContent = (subscriber.name || '').split(' ')[0] || 'Assinante';

                // Status 
                const pill = document.getElementById('statusPill');
                const statusMap = {
                    'active': { label: 'Ativa', class: 'status-active' },
                    'past_due': { label: 'Em atraso', class: 'status-past_due' },
                    'canceled': { label: 'Cancelada', class: 'status-canceled' },
                    'none': { label: 'Sem assinatura', class: 'status-none' }
                };
                const sc = statusMap[subscription.status] || statusMap['none'];
                pill.textContent = sc.label;
                pill.className = 'status-pill ' + sc.class;

                document.getElementById('planName').textContent = 
                    subscription.plan_type === 'mensal' ? 'Plano Mensal' : 
                    subscription.plan_type === 'anual' ? 'Plano Anual' : 'Sem Plano Selecionado';

                if (subscription.is_premium) {
                    document.getElementById('premiumAccess').classList.remove('hidden');
                    document.getElementById('premiumAccessInactive').classList.add('hidden');
                } else {
                    document.getElementById('premiumAccess').classList.add('hidden');
                    document.getElementById('premiumAccessInactive').classList.remove('hidden');
                }

                if (subscription.current_period_end && subscription.status === 'active') {
                    const date = new Date(subscription.current_period_end);
                    document.getElementById('validUntil').textContent = date.toLocaleDateString('pt-BR');
                } else {
                    document.getElementById('validityInfo').classList.add('hidden');
                }

                // Next Invoice
                if (next_invoice && (next_invoice.status === 'pending' || next_invoice.status === 'overdue')) {
                    document.getElementById('invoiceCard').classList.remove('hidden');
                    document.getElementById('invoiceAmount').textContent = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(next_invoice.amount);
                    document.getElementById('invoiceDate').textContent = new Date(next_invoice.due_date).toLocaleDateString('pt-BR');
                    if (next_invoice.payment_url) document.getElementById('payBtn').href = next_invoice.payment_url;
                }

                // History
                const table = document.getElementById('invoiceHistoryTable');
                if (invoices && invoices.length > 0) {
                    table.innerHTML = invoices.map(inv => {
                        const date = new Date(inv.due_date).toLocaleDateString('pt-BR');
                        const amount = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(inv.amount);
                        const statusColor = inv.status === 'paid' ? 'text-emerald-600' : 'text-slate-500';
                        const statusText = inv.status === 'paid' ? 'Pago' : 'Pendente';
                        return '<tr>' +
                                '<td class="font-medium">' + date + '</td>' +
                                '<td>' + amount + '</td>' +
                                '<td class="' + statusColor + ' font-semibold">' + statusText + '</td>' +
                                '<td>' + (inv.payment_url ? '<a href="' + inv.payment_url + '" target="_blank" class="text-primary hover:underline font-bold">Pagar</a>' : '-') + '</td>' +
                               '</tr>';
                    }).join('');
                } else {
                    table.innerHTML = '<tr><td colspan="4" class="py-12 text-center text-gray-400">Nenhum histórico disponível.</td></tr>';
                }

                if (subscription.status === 'none' || subscription.status === 'canceled') {
                    document.getElementById('subscribeActions').classList.remove('hidden');
                } else {
                    document.getElementById('manageActions').classList.remove('hidden');
                }
            }

            async function startSubscription(plan, btn) {
                 btn.disabled = true;
                 btn.style.opacity = '0.7';
                 try {
                     const res = await fetch('/api/portal/assinatura/start', {
                         method: 'POST',
                         headers: { 'Content-Type': 'application/json' },
                         body: JSON.stringify({ plan })
                     });
                     const data = await res.json();
                     if (data.success || data.subscriptionId) {
                         window.location.reload();
                     } else {
                         alert('Erro: ' + (data.error || 'Falha ao iniciar'));
                         btn.disabled = false;
                         btn.style.opacity = '1';
                     }
                 } catch (e) {
                     alert('Erro de rede');
                     btn.disabled = false;
                     btn.style.opacity = '1';
                 }
            }

            document.getElementById('logoutBtn').addEventListener('click', async () => {
                await fetch('/api/portal/auth/logout', { method: 'POST' });
                window.location.href = '/portal/login';
            });

            document.getElementById('subMensalBtn').addEventListener('click', (e) => startSubscription('mensal', e.currentTarget));
            document.getElementById('subAnualBtn').addEventListener('click', (e) => startSubscription('anual', e.currentTarget));

            loadDashboard();
        </script>
    </body>
    </html>
    `
}
