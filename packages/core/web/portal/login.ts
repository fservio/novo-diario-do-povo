
import type { Context } from 'hono'
import { getSetting } from '../../db'

export async function renderLoginPage(c: Context) {
    const siteName = await getSetting(c.env, 'site_name', 'public') || 'Jornal'
    const error = c.req.query('error')
    const nonce = c.get('cspNonce')

    return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Login | ${siteName}</title>
        <link href="/static/styles.css" rel="stylesheet">
        <link href="/static/minimal.css" rel="stylesheet">
        <style>
            .login-container {
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                background-color: #f9fafb;
            }
            .login-card {
                background: white;
                padding: 2rem;
                border-radius: 0.5rem;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                width: 100%;
                max-width: 400px;
            }
        </style>
    </head>
    <body>
        <div class="login-container">
            <div class="login-card">
                <div class="text-center mb-8">
                    <h1 class="text-2xl font-bold text-gray-900 mb-2">Entrar no Portal</h1>
                    <p class="text-sm text-gray-600">Gerencie sua assinatura e pagamentos</p>
                </div>

                ${error ? `
                    <div class="bg-red-50 text-red-700 p-3 rounded mb-4 text-sm font-medium">
                        Credenciais inválidas. Tente novamente.
                    </div>
                ` : ''}

                <form id="loginForm" class="space-y-4">
                    <div>
                        <label for="email" class="block text-sm font-medium text-gray-700 mb-1">Email</label>
                        <input type="email" id="email" name="email" required 
                            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                    </div>

                    <div>
                        <label for="password" class="block text-sm font-medium text-gray-700 mb-1">Senha</label>
                        <input type="password" id="password" name="password" required 
                            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                    </div>

                    <button type="submit" id="submitBtn"
                        class="w-full bg-blue-600 text-white py-2 px-4 rounded-md font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50">
                        Entrar
                    </button>
                </form>

                <div class="mt-6 text-center text-sm">
                    <a href="/" class="text-gray-500 hover:text-gray-900">← Voltar ao site</a>
                </div>
            </div>
        </div>

        <script nonce="${nonce}">
            document.getElementById('loginForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const btn = document.getElementById('submitBtn');
                const errorDiv = document.querySelector('.bg-red-50');
                if(errorDiv) errorDiv.remove();

                btn.disabled = true;
                btn.textContent = 'Entrando...';

                const email = document.getElementById('email').value;
                const password = document.getElementById('password').value;

                try {
                    const res = await fetch('/api/portal/auth/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email, password })
                    });

                    const data = await res.json();

                    if (data.success) {
                        // Check if there is a 'next' param in URL
                        const urlParams = new URLSearchParams(window.location.search);
                        const next = urlParams.get('next');
                        window.location.href = next || '/portal';
                    } else {
                        btn.disabled = false;
                        btn.textContent = 'Entrar';
                        // Show generic error
                        const div = document.createElement('div');
                        div.className = 'bg-red-50 text-red-700 p-3 rounded mb-4 text-sm font-medium';
                        div.textContent = 'Credenciais inválidas. Tente novamente.';
                        document.querySelector('form').before(div);
                    }
                } catch (err) {
                    console.error(err);
                    btn.disabled = false;
                    btn.textContent = 'Entrar';
                }
            });
        </script>
    </body>
    </html>
    `
}
