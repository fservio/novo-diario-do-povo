import type { Context } from 'hono'
import { getSetting } from '../../db'
import { renderPortalIcon, renderSubscriberAuthLayout } from './ui'

export async function renderRegisterPage(c: Context) {
  const siteName = await getSetting(c.env, 'site_name', 'public') || 'Diário do Povo'
  const nonce = c.get('cspNonce') || ''

  const bodyHtml = `
    <a class="auth-back-link" href="/">← Voltar para o jornal</a>

    <header class="auth-heading">
      <p class="subscriber-kicker">Comece sua assinatura</p>
      <h2>Crie sua conta.</h2>
      <p>Leva menos de dois minutos. Seus dados ficam protegidos.</p>
    </header>

    <form id="registerForm" class="auth-form">
      <div class="auth-form-grid">
        <div class="auth-field auth-span-full">
          <label for="name">Nome completo</label>
          <input type="text" id="name" name="name" required autocomplete="name" placeholder="Como você gostaria de ser chamado">
        </div>

        <div class="auth-field">
          <label for="cpf">CPF</label>
          <input type="text" id="cpf" name="cpf" required inputmode="numeric" autocomplete="off" placeholder="000.000.000-00" maxlength="14">
        </div>

        <div class="auth-field">
          <label for="phone">Telefone</label>
          <input type="tel" id="phone" name="phone" required inputmode="tel" autocomplete="tel" placeholder="(00) 00000-0000" maxlength="15">
        </div>

        <div class="auth-field auth-span-full">
          <label for="email">E-mail</label>
          <input type="email" id="email" name="email" required autocomplete="username" inputmode="email" placeholder="seu@email.com">
        </div>

        <div class="auth-field auth-span-full">
          <label for="password">Senha <span class="auth-field-note">· mínimo de 8 caracteres</span></label>
          <input type="password" id="password" name="password" required minlength="8" autocomplete="new-password" placeholder="Crie uma senha segura">
        </div>
      </div>

      <button type="submit" id="submitBtn" class="auth-submit">
        <span class="auth-spinner" aria-hidden="true"></span>
        <span class="btn-text">Criar minha conta</span>
        <span class="portal-icon">${renderPortalIcon('arrow')}</span>
      </button>
    </form>

    <p class="auth-footer">Já possui uma conta? <a href="/portal/login" id="loginLink">Entrar</a></p>
  `

  const script = `
    const params = new URLSearchParams(window.location.search);
    const requestedNext = params.get('next');
    const next = requestedNext && requestedNext.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : '';
    if (next) document.getElementById('loginLink').href = '/portal/login?next=' + encodeURIComponent(next);

    const cpfInput = document.getElementById('cpf');
    const phoneInput = document.getElementById('phone');

    cpfInput.addEventListener('input', (event) => {
      let value = event.target.value.replace(/\\D/g, '').slice(0, 11);
      value = value.replace(/(\\d{3})(\\d)/, '$1.$2');
      value = value.replace(/(\\d{3})(\\d)/, '$1.$2');
      value = value.replace(/(\\d{3})(\\d{1,2})$/, '$1-$2');
      event.target.value = value;
    });

    phoneInput.addEventListener('input', (event) => {
      let value = event.target.value.replace(/\\D/g, '').slice(0, 11);
      value = value.replace(/^(\\d{2})(\\d)/, '($1) $2');
      value = value.replace(/(\\d)(\\d{4})$/, '$1-$2');
      event.target.value = value;
    });

    document.getElementById('registerForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = document.getElementById('submitBtn');
      const buttonText = button.querySelector('.btn-text');
      const currentError = document.querySelector('.portal-error');
      if (currentError) currentError.remove();

      button.disabled = true;
      button.classList.add('loading');
      buttonText.textContent = 'Criando sua conta...';

      try {
        const response = await fetch('/api/portal/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: document.getElementById('name').value,
            cpf: cpfInput.value,
            phone: phoneInput.value,
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
        message.textContent = data.error || 'Não foi possível concluir o cadastro.';
        document.getElementById('registerForm').before(message);
      } catch (error) {
        const message = document.createElement('div');
        message.className = 'portal-error';
        message.setAttribute('role', 'alert');
        message.textContent = 'Não foi possível conectar. Aguarde alguns instantes e tente novamente.';
        document.getElementById('registerForm').before(message);
      } finally {
        button.disabled = false;
        button.classList.remove('loading');
        buttonText.textContent = 'Criar minha conta';
      }
    });
  `

  return renderSubscriberAuthLayout({
    title: 'Criar conta de assinante',
    siteName,
    bodyHtml,
    nonce,
    script,
    mode: 'register'
  })
}
