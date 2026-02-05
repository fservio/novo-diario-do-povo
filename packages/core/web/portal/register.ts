
import type { Context } from 'hono'
import { getSetting } from '../../db'

export async function renderRegisterPage(c: Context) {
    const siteName = await getSetting(c.env, 'site_name', 'public') || 'Diário do Povo'
    const nonce = c.get('cspNonce')

    return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Cadastro | ${siteName}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
        <style>
            :root {
                --primary: #2b5375;
                --primary-light: #8cb9e1;
                --primary-dark: #1d3a52;
                --accent: #8cb9e1;
                --bg: #f8fafc;
                --text-main: #1e293b;
                --text-muted: #64748b;
                --white: #ffffff;
                --error: #ef4444;
                --radius: 1rem;
            }

            * {
                box-sizing: border-box;
                margin: 0;
                padding: 0;
            }

            body {
                font-family: 'Inter', sans-serif;
                background: 
                    radial-gradient(circle at 100% 0%, rgba(140, 185, 225, 0.15) 0%, transparent 35%),
                    radial-gradient(circle at 0% 100%, rgba(43, 83, 117, 0.1) 0%, transparent 35%),
                    var(--bg);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                color: var(--text-main);
                padding: 2rem 1.5rem;
                line-height: 1.5;
            }

            .register-card {
                background: var(--white);
                border: 1px solid #e2e8f0;
                border-radius: var(--radius);
                padding: 2.5rem;
                width: 100%;
                max-width: 480px;
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 10px 10px -5px rgba(0, 0, 0, 0.02);
                animation: fadeIn 0.5s ease-out;
            }

            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
            }

            .logo-container {
                text-align: center;
                margin-bottom: 2rem;
            }

            .logo-container img {
                max-width: 180px;
                height: auto;
            }

            .header-text {
                text-align: center;
                margin-bottom: 2rem;
            }

            .header-text h1 {
                font-size: 1.25rem;
                font-weight: 700;
                color: var(--primary);
                margin-bottom: 0.5rem;
                letter-spacing: -0.01em;
            }

            .header-text p {
                font-size: 0.875rem;
                color: var(--text-muted);
            }

            .error-message {
                background: #fef2f2;
                border-left: 4px solid var(--error);
                color: #991b1b;
                padding: 1rem;
                border-radius: 0.5rem;
                margin-bottom: 1.5rem;
                font-size: 0.875rem;
                font-weight: 500;
            }

            .form-grid {
                display: grid;
                grid-template-columns: 1fr;
                gap: 1rem;
            }

            @media (min-width: 640px) {
                .form-grid {
                    grid-template-columns: 1fr 1fr;
                }
                .col-span-full {
                    grid-column: span 2;
                }
            }

            .form-group label {
                display: block;
                font-size: 0.75rem;
                font-weight: 700;
                color: var(--text-main);
                margin-bottom: 0.4rem;
                text-transform: uppercase;
                letter-spacing: 0.05em;
            }

            .form-control {
                width: 100%;
                padding: 0.625rem 0.875rem;
                font-size: 0.9375rem;
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

            .btn-submit {
                width: 100%;
                background: var(--primary);
                color: white;
                padding: 0.875rem;
                border: none;
                border-radius: 0.5rem;
                font-size: 1rem;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
                margin-top: 1.5rem;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 0.5rem;
            }

            .btn-submit:hover {
                background: var(--primary-dark);
                transform: translateY(-1px);
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            }

            .btn-submit:active {
                transform: translateY(0);
            }

            .btn-submit:disabled {
                opacity: 0.7;
                cursor: not-allowed;
            }

            .footer-links {
                margin-top: 2rem;
                text-align: center;
                font-size: 0.875rem;
                color: var(--text-muted);
                border-top: 1px solid #f1f5f9;
                padding-top: 1.5rem;
            }

            .footer-links a {
                color: var(--primary);
                text-decoration: none;
                font-weight: 600;
                transition: color 0.2s;
            }

            .footer-links a:hover {
                color: var(--primary-dark);
                text-decoration: underline;
            }

            .back-link {
                display: inline-block;
                margin-top: 1rem;
                color: var(--text-muted) !important;
                font-weight: 400 !important;
            }

            .spinner {
                width: 1.25rem;
                height: 1.25rem;
                border: 2px solid rgba(255, 255, 255, 0.3);
                border-radius: 50%;
                border-top-color: white;
                animation: spin 0.8s linear infinite;
                display: none;
            }

            @keyframes spin {
                to { transform: rotate(360deg); }
            }

            .btn-submit.loading .spinner {
                display: block;
            }
            .btn-submit.loading .btn-text {
                opacity: 0.8;
            }
        </style>
    </head>
    <body>
        <div class="register-card">
            <div class="logo-container">
                <img src="/static/logo-dp.png" alt="${siteName}">
            </div>

            <div class="header-text">
                <h1>Criar sua Conta</h1>
                <p>Junte-se a milhares de leitores bem informados.</p>
            </div>

            <form id="registerForm">
                <div class="form-grid">
                    <div class="form-group col-span-full">
                        <label for="name">Nome Completo</label>
                        <input type="text" id="name" name="name" required placeholder="Ex: João Silva"
                            class="form-control">
                    </div>

                    <div class="form-group">
                        <label for="cpf">CPF</label>
                        <input type="text" id="cpf" name="cpf" required placeholder="000.000.000-00" maxlength="14"
                            class="form-control">
                    </div>

                    <div class="form-group">
                        <label for="phone">Telefone</label>
                        <input type="text" id="phone" name="phone" required placeholder="(00) 00000-0000" maxlength="15"
                            class="form-control">
                    </div>

                    <div class="form-group col-span-full">
                        <label for="email">E-mail</label>
                        <input type="email" id="email" name="email" required placeholder="seu@email.com"
                            class="form-control">
                    </div>

                    <div class="form-group col-span-full">
                        <label for="password">Senha (mín. 8 caracteres)</label>
                        <input type="password" id="password" name="password" required minlength="8" placeholder="••••••••"
                            class="form-control">
                    </div>
                </div>

                <button type="submit" id="submitBtn" class="btn-submit">
                    <span class="spinner"></span>
                    <span class="btn-text">Cadastrar e Continuar</span>
                </button>
            </form>

            <div class="footer-links">
                <p>Já tem uma conta? <a href="/portal/login" id="loginLink">Entre aqui</a></p>
                <a href="/" class="back-link">← Voltar para o Início</a>
            </div>
        </div>

        <script nonce="${nonce}">
            const urlParams = new URLSearchParams(window.location.search);
            const next = urlParams.get('next');
            if (next) {
                document.getElementById('loginLink').href = '/portal/login?next=' + encodeURIComponent(next);
            }

            document.getElementById('registerForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const btn = document.getElementById('submitBtn');
                const btnText = btn.querySelector('.btn-text');
                
                // Clear errors
                const existingError = document.querySelector('.error-message');
                if(existingError) existingError.remove();

                btn.disabled = true;
                btn.classList.add('loading');
                btnText.textContent = 'Processando...';

                const formData = {
                    name: document.getElementById('name').value,
                    cpf: document.getElementById('cpf').value,
                    phone: document.getElementById('phone').value,
                    email: document.getElementById('email').value,
                    password: document.getElementById('password').value
                };

                try {
                    const res = await fetch('/api/portal/auth/register', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(formData)
                    });

                    const data = await res.json();

                    if (data.success) {
                        window.location.href = next || '/portal';
                    } else {
                        btn.disabled = false;
                        btn.classList.remove('loading');
                        btnText.textContent = 'Cadastrar e Continuar';
                        
                        const div = document.createElement('div');
                        div.className = 'error-message';
                        div.textContent = data.error || 'Erro ao realizar cadastro.';
                        document.querySelector('form').before(div);
                    }
                } catch (err) {
                    console.error(err);
                    btn.disabled = false;
                    btn.classList.remove('loading');
                    btnText.textContent = 'Cadastrar e Continuar';
                    
                    const div = document.createElement('div');
                    div.className = 'error-message';
                    div.textContent = 'Ocorreu um erro de conexão. Tente novamente.';
                    document.querySelector('form').before(div);
                }
            });

            // Foolproof mask for CPF
            document.getElementById('cpf').addEventListener('input', function (e) {
                let v = e.target.value.replace(/\D/g, '');
                if (v.length > 11) v = v.substring(0, 11);
                
                v = v.replace(/(\d{3})(\d)/, '$1.$2');
                v = v.replace(/(\d{3})(\d)/, '$1.$2');
                v = v.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
                
                e.target.value = v;
            });

            // Foolproof mask for Phone
            document.getElementById('phone').addEventListener('input', function (e) {
                let v = e.target.value.replace(/\D/g, '');
                if (v.length > 11) v = v.substring(0, 11);
                
                v = v.replace(/^(\d{2})(\d)/g, '($1) $2');
                v = v.replace(/(\d)(\d{4})$/, '$1-$2');
                
                e.target.value = v;
            });
        </script>
    </body>
    </html>
    `
}
