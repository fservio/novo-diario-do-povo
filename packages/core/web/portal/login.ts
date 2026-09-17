import type { Context } from 'hono'
import { getSetting } from '../../db'
import { renderPortalIcon, renderSubscriberAuthLayout } from './ui'

export async function renderLoginPage(c: Context) {
  const siteName = await getSetting(c.env, 'site_name', 'public') || 'Diário do Povo'
  const error = c.req.query('error')
  const nonce = c.get('cspNonce') || ''

  const bodyHtml = `
    <a class="auth-back-link" href="/">← Voltar para o jornal</a>

    <header class="auth-heading">
      <p class="subscriber-kicker">Área do assinante</p>
      <h2>Bem-vindo de volta.</h2>
      <p>Entre para continuar lendo e administrar sua assinatura.</p>
    </header>

    ${error ? '<div class="portal-error" role="alert">Não foi possível entrar. Confira seu e-mail e sua senha.</div>' : ''}

    <form id="loginForm" class="auth-form">
      <div class="auth-field">
        <label for="email">E-mail</label>
        <input type="email" id="email" name="email" required autocomplete="username" inputmode="email" placeholder="seu@email.com">
      </div>

      <div class="auth-field">
        <label for="password">Senha</label>
        <input type="password" id="password" name="password" required autocomplete="current-password" placeholder="Digite sua senha">
      </div>

      <button type="submit" id="submitBtn" class="auth-submit">
        <span class="auth-spinner" aria-hidden="true"></span>
        <span class="btn-text">Entrar na minha conta</span>
        <span class="portal-icon">${renderPortalIcon('arrow')}</span>
      </button>
    </form>

    <p class="auth-footer">Ainda não é assinante? <a href="/portal/register" id="registerLink">Criar uma conta</a></p>
  `

  const script = `
    const params = new URLSearchParams(window.location.search);
    const requestedNext = params.get('next');
    const next = requestedNext && requestedNext.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : '';
    if (next) document.getElementById('registerLink').href = '/portal/register?next=' + encodeURIComponent(next);

    document.getElementById('loginForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = document.getElementById('submitBtn');
      const buttonText = button.querySelector('.btn-text');
      const currentError = document.querySelector('.portal-error');
      if (currentError) currentError.remove();

      button.disabled = true;
      button.classList.add('loading');
      buttonText.textContent = 'Autenticando...';

      try {
        const response = await fetch('/api/portal/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: document.getElementById('email').value,
            password: document.getElementById('password').value
          })
        });
        const data = await response.json();

        if (data.success) {
          window.location.href = next || '/portal';
          return;
        }

        const message = document.createElement('div');
        message.className = 'portal-error';
        message.setAttribute('role', 'alert');
        message.textContent = data.message || 'Não foi possível entrar. Confira seus dados e tente novamente.';
        document.getElementById('loginForm').before(message);
      } catch (error) {
        const message = document.createElement('div');
        message.className = 'portal-error';
        message.setAttribute('role', 'alert');
        message.textContent = 'Não foi possível conectar. Aguarde alguns instantes e tente novamente.';
        document.getElementById('loginForm').before(message);
      } finally {
        button.disabled = false;
        button.classList.remove('loading');
        buttonText.textContent = 'Entrar na minha conta';
      }
    });
  `

  return renderSubscriberAuthLayout({
    title: 'Entrar na área do assinante',
    siteName,
    bodyHtml,
    nonce,
    script,
    mode: 'login'
  })
}
