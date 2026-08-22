import type { Context } from 'hono'
import { getSetting } from '../../db'
import { renderPortalIcon, renderSubscriberShell } from './ui'

export async function renderAccountPage(c: Context) {
  const siteName = await getSetting(c.env, 'site_name', 'public') || 'Diário do Povo'
  const nonce = c.get('cspNonce') || ''
  const icon = (name: string) => `<span class="portal-icon">${renderPortalIcon(name)}</span>`

  const bodyHtml = `
    <header class="portal-page-intro">
      <div>
        <p class="portal-kicker">Dados pessoais</p>
        <h1 class="portal-title">Minha conta</h1>
        <p class="portal-description">Mantenha seus dados atualizados para receber comunicações e acessar sua assinatura com segurança.</p>
      </div>
      <a href="/portal" class="portal-button portal-button-secondary">${icon('home')} Ver assinatura</a>
    </header>

    <div id="portalMessage" class="portal-error hidden" role="alert" aria-live="polite"></div>

    <div id="loading" class="portal-loading" aria-live="polite">
      <div><div class="portal-loading-spinner"></div><p>Carregando seus dados...</p></div>
    </div>

    <div id="accountContent" class="hidden">
      <div class="portal-account-grid">
        <section class="portal-card" aria-labelledby="personal-data-title">
          <div class="portal-card-header">
            <div><h2 id="personal-data-title" class="portal-card-title">Informações pessoais</h2><p class="portal-card-description">Dados usados na identificação da sua conta.</p></div>
            <span class="portal-icon" style="color:var(--portal-muted)">${renderPortalIcon('user')}</span>
          </div>

          <form id="accountForm">
            <div class="portal-form-grid">
              <div class="portal-field portal-field-full">
                <label for="name">Nome completo</label>
                <input type="text" id="name" name="name" autocomplete="name" placeholder="Seu nome completo" required>
              </div>

              <div class="portal-field portal-field-full">
                <label for="email">E-mail de acesso</label>
                <input type="email" id="email" name="email" autocomplete="username" disabled>
                <p class="portal-field-help">Por segurança, o e-mail de acesso não pode ser alterado nesta página.</p>
              </div>

              <div class="portal-field">
                <label for="phone">Telefone</label>
                <input type="tel" id="phone" name="phone" inputmode="tel" autocomplete="tel" maxlength="15" placeholder="(00) 00000-0000">
              </div>

              <div class="portal-field">
                <label for="cpf">CPF</label>
                <input type="text" id="cpf" name="cpf" inputmode="numeric" maxlength="14" placeholder="000.000.000-00">
              </div>
            </div>

            <div class="portal-form-actions">
              <button type="submit" id="saveBtn" class="portal-button">Salvar alterações</button>
            </div>

            <div id="successAlert" class="portal-success" role="status">${icon('check')} Dados atualizados com sucesso.</div>
          </form>
        </section>

        <aside class="portal-stack" aria-label="Segurança da conta">
          <section class="portal-card security-card">
            <div class="security-seal">${icon('shield')}</div>
            <h3>Conta protegida</h3>
            <p>Sua senha e seus dados pessoais são tratados em ambiente seguro.</p>
            <button type="button" id="logoutBtn" class="portal-button portal-button-danger">${icon('logout')} Sair da conta</button>
          </section>

          <section class="portal-card">
            <div class="portal-card-header"><div><h2 class="portal-card-title">Precisa de ajuda?</h2><p class="portal-card-description">Nossa equipe pode orientar você.</p></div></div>
            <a href="/contato" class="portal-button portal-button-secondary">Falar com atendimento ${icon('arrow')}</a>
          </section>
        </aside>
      </div>
    </div>
  `

  const script = `
    const messageBox = document.getElementById('portalMessage');

    function showError(message) {
      messageBox.textContent = message;
      messageBox.classList.remove('hidden');
    }

    async function loadAccount() {
      try {
        const response = await fetch('/api/portal/me');
        if (response.status === 401) {
          window.location.href = '/portal/login?next=' + encodeURIComponent(window.location.pathname);
          return;
        }
        if (!response.ok) throw new Error('account');
        const data = await response.json();
        if (!data.success) throw new Error('account');

        const subscriber = data.subscriber || {};
        document.getElementById('name').value = subscriber.name || '';
        document.getElementById('email').value = subscriber.email || '';
        document.getElementById('phone').value = subscriber.phone || '';
        document.getElementById('cpf').value = subscriber.cpf || '';
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('accountContent').classList.remove('hidden');
      } catch (error) {
        document.getElementById('loading').classList.add('hidden');
        showError('Não foi possível carregar seus dados. Atualize a página para tentar novamente.');
      }
    }

    document.getElementById('accountForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = document.getElementById('saveBtn');
      const success = document.getElementById('successAlert');
      button.disabled = true;
      button.textContent = 'Salvando...';
      success.style.display = 'none';
      messageBox.classList.add('hidden');

      try {
        const response = await fetch('/api/portal/account', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: document.getElementById('name').value,
            phone: document.getElementById('phone').value,
            cpf: document.getElementById('cpf').value
          })
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'update');
        success.style.display = 'flex';
        window.setTimeout(() => { success.style.display = 'none'; }, 4000);
      } catch (error) {
        showError('Não foi possível salvar as alterações. Confira os dados e tente novamente.');
      } finally {
        button.disabled = false;
        button.textContent = 'Salvar alterações';
      }
    });

    document.getElementById('cpf').addEventListener('input', (event) => {
      let value = event.target.value.replace(/\\D/g, '').slice(0, 11);
      value = value.replace(/(\\d{3})(\\d)/, '$1.$2');
      value = value.replace(/(\\d{3})(\\d)/, '$1.$2');
      value = value.replace(/(\\d{3})(\\d{1,2})$/, '$1-$2');
      event.target.value = value;
    });

    document.getElementById('phone').addEventListener('input', (event) => {
      let value = event.target.value.replace(/\\D/g, '').slice(0, 11);
      value = value.replace(/^(\\d{2})(\\d)/, '($1) $2');
      value = value.replace(/(\\d)(\\d{4})$/, '$1-$2');
      event.target.value = value;
    });

    document.getElementById('logoutBtn').addEventListener('click', async () => {
      await fetch('/api/portal/auth/logout', { method: 'POST' });
      window.location.href = '/portal/login';
    });

    loadAccount();
  `

  return renderSubscriberShell({
    title: 'Minha conta',
    siteName,
    activeTab: 'account',
    bodyHtml,
    nonce,
    script
  })
}
