
import type { Context } from 'hono'
import { getSetting } from '../../db'

export async function renderAccountPage(c: Context) {
    const siteName = await getSetting(c.env, 'site_name', 'public') || 'Diário do Povo'
    const nonce = c.get('cspNonce')

    return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Meus Dados | ${siteName}</title>
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
                --danger: #ef4444;
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
                max-width: 700px;
                margin: 2.5rem auto;
                padding: 0 1.5rem;
            }

            .page-header {
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
                padding: 2rem;
                margin-bottom: 1.5rem;
                box-shadow: 0 1px 3px rgba(0,0,0,0.02);
            }

            .card-title {
                font-size: 1.125rem;
                font-weight: 700;
                margin-bottom: 1.5rem;
                color: var(--text-main);
            }

            /* Form Styles */
            .form-group {
                margin-bottom: 1.25rem;
            }

            .form-group label {
                display: block;
                font-size: 0.75rem;
                font-weight: 700;
                color: var(--text-main);
                margin-bottom: 0.5rem;
                text-transform: uppercase;
                letter-spacing: 0.05em;
            }

            .form-control {
                width: 100%;
                padding: 0.75rem 1rem;
                font-size: 1rem;
                border: 1px solid #cbd5e1;
                border-radius: 0.5rem;
                background: #fcfdfe;
                transition: all 0.2s;
                color: var(--text-main);
            }

            .form-control:focus {
                outline: none;
                border-color: var(--primary);
                box-shadow: 0 0 0 4px rgba(43, 83, 117, 0.1);
                background: white;
            }

            .form-control:disabled {
                background: #f1f5f9;
                color: #94a3b8;
                cursor: not-allowed;
            }

            .btn-save {
                background: var(--primary);
                color: white;
                padding: 0.75rem 1.5rem;
                border-radius: 0.5rem;
                font-weight: 600;
                border: none;
                cursor: pointer;
                transition: all 0.2s;
                font-size: 0.9375rem;
            }

            .btn-save:hover {
                background: var(--primary-dark);
                transform: translateY(-1px);
            }

            .btn-save:disabled {
                opacity: 0.7;
                cursor: not-allowed;
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

            .hidden { display: none !important; }

            .alert-success {
                background: #ecfdf5;
                color: #065f46;
                padding: 1rem;
                border-radius: 0.5rem;
                margin-top: 1rem;
                font-size: 0.875rem;
                font-weight: 500;
                border: 1px solid #d1fae5;
                display: none;
            }
        </style>
    </head>
    <body>
        <nav class="portal-nav">
            <div class="nav-container">
                <a href="/" class="nav-logo">
                    <img src="/static/logo-dp.png" alt="${siteName}">
                </a>
                <div class="nav-actions">
                    <a href="/portal" class="nav-link">Minha Assinatura</a>
                    <a href="/portal/account" class="nav-link active">Meus Dados</a>
                    <button id="logoutBtn" class="logout-btn">Sair</button>
                </div>
            </div>
        </nav>

        <main class="main-content">
            <div class="page-header">
                <h1>Perfil de Usuário</h1>
                <p class="text-sm text-gray-400">Suas informações de cadastro e segurança.</p>
            </div>
            
            <div id="loading" class="loading-state">
                <div class="spinner"></div>
                <p class="text-gray-500">Buscando seus dados...</p>
            </div>

            <div id="accountContent" class="hidden">
                <div class="card">
                    <div class="card-title">Informações Pessoais</div>
                    <form id="accountForm">
                        <div class="form-group">
                            <label for="name">Nome Completo</label>
                            <input type="text" id="name" name="name" class="form-control" placeholder="Seu nome">
                        </div>
                        <div class="form-group">
                            <label for="email">E-mail (exclusivo para acesso)</label>
                            <input type="email" id="email" name="email" disabled class="form-control">
                        </div>
                        <div class="form-group">
                            <label for="phone">Telefone (WhatsApp)</label>
                            <input type="text" id="phone" name="phone" class="form-control" placeholder="(00) 00000-0000">
                        </div>
                        <div class="form-group">
                            <label for="cpf">CPF</label>
                            <input type="text" id="cpf" name="cpf" maxlength="14" class="form-control" placeholder="000.000.000-00">
                        </div>
                        
                        <div class="flex justify-end pt-4">
                            <button type="submit" id="saveBtn" class="btn-save">Salvar Alterações</button>
                        </div>

                        <div id="successAlert" class="alert-success">
                            ✓ Alterações salvas com sucesso!
                        </div>
                    </form>
                </div>

                <div class="card">
                    <div class="card-title">Segurança e Acesso</div>
                    <p class="text-sm text-gray-500 mb-4">Mantenha sua conta segura alterando sua senha periodicamente.</p>
                    <button disabled class="btn-save" style="background: transparent; color: var(--primary); border: 1px solid var(--primary); opacity: 0.5;">Alterar Senha (Em Breve)</button>
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
                        document.getElementById('cpf').value = subscriber.cpf || '';
                        
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
                const sAlert = document.getElementById('successAlert');
                btn.disabled = true;
                btn.textContent = 'Salvando...';
                sAlert.style.display = 'none';

                const formData = {
                    name: document.getElementById('name').value,
                    phone: document.getElementById('phone').value,
                    cpf: document.getElementById('cpf').value
                };

                try {
                    const res = await fetch('/api/portal/account', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(formData)
                    });
                    const data = await res.json();
                    if (data.success) {
                        sAlert.style.display = 'block';
                        setTimeout(() => { sAlert.style.display = 'none'; }, 4000);
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

            // Masks
            document.getElementById('cpf').addEventListener('input', function (e) {
                let v = e.target.value.replace(/\D/g, '');
                if (v.length > 11) v = v.substring(0, 11);
                v = v.replace(/(\d{3})(\d)/, '$1.$2');
                v = v.replace(/(\d{3})(\d)/, '$1.$2');
                v = v.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
                e.target.value = v;
            });

            document.getElementById('phone').addEventListener('input', function (e) {
                let v = e.target.value.replace(/\D/g, '');
                if (v.length > 11) v = v.substring(0, 11);
                v = v.replace(/^(\d{2})(\d)/g, '($1) $2');
                v = v.replace(/(\d)(\d{4})$/, '$1-$2');
                e.target.value = v;
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
