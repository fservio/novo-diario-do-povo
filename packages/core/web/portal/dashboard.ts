
import type { Context } from 'hono'
import { getSetting } from '../../db'

export async function renderDashboardPage(c: Context) {
    const siteName = await getSetting(c.env, 'site_name', 'public') || 'Jornal'

    const nonce = c.get('cspNonce')

    return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Minha Assinatura | ${siteName}</title>
        <link href="/static/styles.css" rel="stylesheet">
        <link href="/static/minimal.css" rel="stylesheet">
        <style>
            .status-pill { padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.875rem; font-weight: 500; }
            .status-active { background-color: #def7ec; color: #03543f; }
            .status-past_due { background-color: #fde8e8; color: #9b1c1c; }
            .status-canceled { background-color: #f3f4f6; color: #374151; }
            .status-none { background-color: #f3f4f6; color: #374151; }
            .card { background: white; border-radius: 0.5rem; border: 1px solid #e5e7eb; padding: 1.5rem; margin-bottom: 1.5rem; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05); transition: box-shadow 0.2s; }
            .card:hover { box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); }
            .btn-primary { background-color: #2563eb; color: white; padding: 0.5rem 1rem; border-radius: 0.375rem; font-weight: 500; cursor: pointer; display: inline-block; text-align: center; }
            .btn-primary:hover { background-color: #1d4ed8; }
            .btn-secondary { background-color: white; border: 1px solid #d1d5db; color: #374151; padding: 0.5rem 1rem; border-radius: 0.375rem; font-weight: 500; cursor: pointer; }
            .btn-secondary:hover { background-color: #f9fafb; }
            .btn-danger { background-color: #dc2626; color: white; padding: 0.5rem 1rem; border-radius: 0.375rem; font-weight: 500; cursor: pointer; }
        </style>
    </head>
    <body class="bg-gray-50 min-h-screen">
        <nav class="bg-white border-b border-gray-200">
            <div class="container mx-auto px-4 h-16 flex items-center justify-between">
                <a href="/" class="text-xl font-bold text-gray-900">${siteName}</a>
                <div class="flex items-center space-x-4">
                    <a href="/conta" class="text-sm text-gray-600 hover:text-gray-900">Meus Dados</a>
                    <span id="userName" class="text-sm text-gray-600 hidden md:inline font-medium"></span>
                    <button id="logoutBtn" class="text-sm text-gray-500 hover:text-gray-900">Sair</button>
                </div>
            </div>
        </nav>

        <main class="container mx-auto px-4 py-8 max-w-4xl">
            <h1 class="text-2xl font-bold text-gray-900 mb-6">Minha Assinatura</h1>
            
            <div id="loading" class="text-center py-12">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
                <p class="mt-4 text-gray-500">Carregando informações...</p>
            </div>

            <div id="dashboardContent" class="hidden">
                <!-- Status Card -->
                <div class="card">
                    <div class="flex items-start justify-between mb-4">
                        <div>
                            <h2 class="text-lg font-semibold text-gray-900">Plano Atual</h2>
                            <p id="planName" class="text-gray-600">Carregando...</p>
                        </div>
                        <span id="statusPill" class="status-pill status-none">...</span>
                    </div>
                    
                    <div id="premiumAccess" class="hidden mt-2 p-3 bg-green-50 text-green-800 rounded text-sm mb-4">
                        ✅ Acesso Premium Ativo
                    </div>
                     <div id="premiumAccessInactive" class="hidden mt-2 p-3 bg-gray-100 text-gray-600 rounded text-sm mb-4">
                        🔒 Sem acesso premium
                    </div>

                    <div id="validitySection" class="text-sm text-gray-500">
                        Válido até: <span id="validUntil" class="font-medium text-gray-900">-</span>
                    </div>
                </div>

                <!-- Invoice Card (Only if pending) -->
                <div id="invoiceCard" class="hidden card border-l-4 border-l-yellow-500">
                    <h3 class="font-semibold text-yellow-800 mb-2">Fatura Pendente</h3>
                    <p class="text-sm text-gray-600 mb-4">
                        Você tem uma fatura de <strong id="invoiceAmount"></strong> com vencimento em <strong id="invoiceDate"></strong>.
                    </p>
                    <a id="payBtn" href="#" target="_blank" class="btn-primary w-full md:w-auto">
                        Pagar Agora
                    </a>
                </div>

                <!-- Actions -->
                <div id="actionsSection" class="card">
                    <h3 class="font-semibold text-gray-900 mb-4">Gerenciar Assinatura</h3>
                    
                    <!-- State: NONE or CANCELED -->
                    <div id="subscribeActions" class="hidden space-y-4">
                        <p class="text-gray-600 text-sm">Escolha um plano para ter acesso ilimitado:</p>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <button id="subMensalBtn" class="border rounded-lg p-4 hover:border-blue-500 text-left hover:bg-blue-50 transition">
                                <strong class="block text-lg">Mensal</strong>
                                <span class="text-2xl font-bold">R$ 9,90</span>/mês
                            </button>
                            <button id="subAnualBtn" class="border rounded-lg p-4 hover:border-blue-500 text-left hover:bg-blue-50 transition">
                                <strong class="block text-lg">Anual</strong>
                                <span class="text-2xl font-bold">R$ 94,90</span>/ano
                            </button>
                        </div>
                    </div>

                    <!-- State: ACTIVE -->
                    <div id="manageActions" class="hidden">
                        <p class="text-sm text-gray-500 mb-4">Para cancelar ou alterar sua assinatura, entre em contato com o suporte ou gerencie pelo painel do processador de pagamentos.</p>
                        <!-- Stub for future -->
                        <button disabled class="btn-secondary opacity-50 cursor-not-allowed">
                            Alterar Plano (Em breve)
                        </button>
                    </div>
                </div>
            </div>
        </main>

        <script nonce="${nonce}">
            async function loadDashboard() {
                try {
                    const res = await fetch('/api/portal/dashboard');
                    if (res.status === 401) {
                        const urlParams = new URLSearchParams(window.location.search);
                        const intent = urlParams.get('intent');
                        const plan = urlParams.get('plan');
                        
                        let nextUrl = '/portal';
                        if (intent && plan) {
                             nextUrl = \`/portal?intent=\${intent}&plan=\${plan}\`;
                        }
                        
                        window.location.href = \`/portal/login?next=\${encodeURIComponent(nextUrl)}\`;
                        return;
                    }
                    
                    if (!res.ok) {
                        const errorData = await res.json().catch(() => ({}));
                        throw new Error(errorData.error || 'Erro ao carregar dados do portal');
                    }

                    const data = await res.json();
                    render(data);

                    const urlParams = new URLSearchParams(window.location.search);
                    const intent = urlParams.get('intent');
                    const plan = urlParams.get('plan');
                    
                    if (intent === 'subscribe' && plan) {
                        setTimeout(() => {
                            if (confirm(\`Deseja iniciar a assinatura do plano \${plan === 'mensal' ? 'Mensal' : 'Anual'}?\`)) {
                                startSubscription(plan);
                            }
                        }, 500);
                    }

                } catch (e) {
                    console.error('Dashboard Load Error:', e);
                    document.getElementById('loading').innerHTML = \`
                        <div class="text-red-600 bg-red-50 p-4 rounded-lg border border-red-200">
                            <p class="font-bold">Erro ao carregar informações</p>
                            <p class="text-sm">\${e.message}</p>
                            <button id="retryBtn" class="mt-4 text-blue-600 underline text-sm">Tentar novamente</button>
                        </div>
                    \`;
                    document.getElementById('retryBtn')?.addEventListener('click', () => window.location.reload());
                }
            }

            function render(data) {
                document.getElementById('loading').classList.add('hidden');
                document.getElementById('dashboardContent').classList.remove('hidden');

                const { subscriber, subscription, next_invoice } = data;

                // User Info
                document.getElementById('userName').textContent = subscriber.name || subscriber.email;

                // Status Pill
                const pill = document.getElementById('statusPill');
                const statusMap = {
                    'active': { label: 'Ativa', class: 'status-active' },
                    'past_due': { label: 'Em atraso', class: 'status-past_due' },
                    'canceled': { label: 'Cancelada', class: 'status-canceled' },
                    'none': { label: 'Sem assinatura', class: 'status-none' }
                };
                const statusConfig = statusMap[subscription.status] || statusMap['none'];
                pill.textContent = statusConfig.label;
                
                pill.className = \`status-pill \${statusConfig.class}\`;

                // Plan Name
                document.getElementById('planName').textContent = 
                    subscription.plan_type === 'mensal' ? 'Assinatura Mensal' : 
                    subscription.plan_type === 'anual' ? 'Assinatura Anual' : 'Nenhum plano ativo';

                // Premium Access
                if (subscription.is_premium) {
                    document.getElementById('premiumAccess').classList.remove('hidden');
                } else {
                    document.getElementById('premiumAccessInactive').classList.remove('hidden');
                }

                // Validity
                if (subscription.current_period_end) {
                    const date = new Date(subscription.current_period_end);
                    document.getElementById('validUntil').textContent = date.toLocaleDateString('pt-BR');
                } else {
                    document.getElementById('validitySection').classList.add('hidden');
                }

                // Invoice Logic
                if (next_invoice && (next_invoice.status === 'pending' || next_invoice.status === 'overdue')) {
                    const card = document.getElementById('invoiceCard');
                    card.classList.remove('hidden');
                    
                    const amount = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(next_invoice.amount);
                    document.getElementById('invoiceAmount').textContent = amount;
                    
                    const date = new Date(next_invoice.due_date);
                    document.getElementById('invoiceDate').textContent = date.toLocaleDateString('pt-BR');

                    if (next_invoice.payment_url) {
                        const btn = document.getElementById('payBtn');
                        btn.href = next_invoice.payment_url;
                    }
                }

                // Actions Logic
                const isNoneOrCanceled = subscription.status === 'none' || subscription.status === 'canceled';
                if (isNoneOrCanceled) {
                    document.getElementById('subscribeActions').classList.remove('hidden');
                } else {
                    document.getElementById('manageActions').classList.remove('hidden');
                }
            }

            async function startSubscription(plan, btn) {
                 const originalText = btn ? btn.innerHTML : 'Processando...';
                 if (btn) {
                    btn.disabled = true;
                    btn.innerHTML = 'Processando...';
                 }

                 try {
                     const res = await fetch('/api/portal/assinatura/start', {
                         method: 'POST',
                         headers: { 'Content-Type': 'application/json' },
                         body: JSON.stringify({ plan })
                     });
                     const data = await res.json();
                     
                     if (data.success && data.paymentUrl) {
                         alert('Assinatura iniciada! Aguardando geração da fatura.');
                         window.location.reload();
                     } else if (data.subscriptionId) {
                         setTimeout(() => window.location.reload(), 2000);
                     } else {
                         alert('Erro ao iniciar: ' + (data.error || 'Desconhecido'));
                         if (btn) {
                            btn.disabled = false;
                            btn.innerHTML = originalText;
                         }
                     }
                 } catch (e) {
                     alert('Erro de conexão');
                     if (btn) {
                        btn.disabled = false;
                        btn.innerHTML = originalText;
                     }
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
