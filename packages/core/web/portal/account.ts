
import type { Context } from 'hono'
import { getSetting } from '../../db'

export async function renderAccountPage(c: Context) {
    const siteName = await getSetting(c.env, 'site_name', 'public') || 'Jornal'

    const nonce = c.get('cspNonce')

    return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Minha Conta | ${siteName}</title>
        <link href="/static/styles.css" rel="stylesheet">
        <link href="/static/minimal.css" rel="stylesheet">
        <style>
            .card { background: white; border-radius: 0.5rem; border: 1px solid #e5e7eb; padding: 1.5rem; margin-bottom: 1.5rem; }
            .btn-primary { background-color: #2563eb; color: white; padding: 0.5rem 1rem; border-radius: 0.375rem; font-weight: 500; cursor: pointer; display: inline-block; border: none; }
            .btn-primary:hover { background-color: #1d4ed8; }
            .form-group { margin-bottom: 1rem; }
            .form-group label { display: block; font-size: 0.875rem; font-medium; color: #374151; margin-bottom: 0.25rem; }
            .form-group input { width: 100%; px: 3; py: 2; border: 1px solid #d1d5db; border-radius: 0.375rem; outline: none; }
            .form-group input:focus { ring: 2px solid #2563eb; border-color: transparent; }
        </style>
    </head>
    <body class="bg-gray-50 min-h-screen">
        <nav class="bg-white border-b border-gray-200">
            <div class="container mx-auto px-4 h-16 flex items-center justify-between">
                <a href="/" class="text-xl font-bold text-gray-900">${siteName}</a>
                <div class="flex items-center space-x-4">
                    <a href="/portal" class="text-sm text-gray-600 hover:text-gray-900">Dashboard</a>
                    <button id="logoutBtn" class="text-sm text-gray-500 hover:text-gray-900">Sair</button>
                </div>
            </div>
        </nav>

        <main class="container mx-auto px-4 py-8 max-w-2xl">
            <h1 class="text-2xl font-bold text-gray-900 mb-6">Meus Dados</h1>
            
            <div id="loading" class="text-center py-12">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
            </div>

            <div id="accountContent" class="hidden">
                <form id="accountForm" class="card">
                    <div class="form-group">
                        <label for="name">Nome Completo</label>
                        <input type="text" id="name" name="name">
                    </div>
                    <div class="form-group">
                        <label for="email">E-mail (não pode ser alterado)</label>
                        <input type="email" id="email" name="email" disabled class="bg-gray-100 cursor-not-allowed">
                    </div>
                    <div class="form-group">
                        <label for="phone">Telefone</label>
                        <input type="text" id="phone" name="phone">
                    </div>
                    
                    <div class="flex justify-end">
                        <button type="submit" id="saveBtn" class="btn-primary">Salvar Alterações</button>
                    </div>
                </form>

                <div class="card">
                    <h2 class="text-lg font-semibold text-gray-900 mb-4">Segurança</h2>
                    <p class="text-sm text-gray-600 mb-4">Deseja alterar sua senha ou gerenciar dispositivos conectados?</p>
                    <button disabled class="text-sm text-blue-600 hover:text-blue-800 opacity-50 cursor-not-allowed">Alterar senha (em breve)</button>
                </div>
            </div>
        </main>

        <script nonce="${nonce}">
            async function loadAccount() {
                try {
                    const res = await fetch('/api/portal/me');
                    if (res.status === 401) {
                        window.location.href = '/portal/login?next=' + encodeURIComponent(window.location.pathname);
                        return;
                    }
                    const data = await res.json();
                    if (data.success) {
                        const { subscriber } = data;
                        document.getElementById('name').value = subscriber.name || '';
                        document.getElementById('email').value = subscriber.email || '';
                        document.getElementById('phone').value = subscriber.phone || '';
                        
                        document.getElementById('loading').classList.add('hidden');
                        document.getElementById('accountContent').classList.remove('hidden');
                    }
                } catch (e) {
                    console.error(e);
                }
            }

            document.getElementById('accountForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const btn = document.getElementById('saveBtn');
                btn.disabled = true;
                btn.textContent = 'Salvando...';

                const formData = {
                    name: document.getElementById('name').value,
                    phone: document.getElementById('phone').value
                };

                try {
                    const res = await fetch('/api/portal/account', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(formData)
                    });
                    const data = await res.json();
                    if (data.success) {
                        alert('Alterações salvas com sucesso!');
                    } else {
                        alert('Erro ao salvar: ' + (data.error || 'Desconhecido'));
                    }
                } catch (err) {
                    alert('Erro de conexão');
                } finally {
                    btn.disabled = false;
                    btn.textContent = 'Salvar Alterações';
                }
            });

            document.getElementById('logoutBtn').addEventListener('click', async () => {
                await fetch('/api/portal/auth/logout', { method: 'POST' });
                window.location.href = '/portal/login';
            });

            loadAccount();
        </script>
    </body>
    </html>
    `
}
