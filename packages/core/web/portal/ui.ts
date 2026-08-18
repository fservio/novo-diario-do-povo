export function escapePortalHtml(value: string | null | undefined): string {
  if (value == null) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function renderPortalIcon(name: string): string {
  const paths: Record<string, string> = {
    home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10M9 20v-6h6v6"/>',
    account: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    newspaper: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h6M7 16h4M15 12h2M15 16h2"/>',
    card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h2"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    receipt: '<path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 7h6M9 11h6M9 15h4"/>',
    logout: '<path d="M10 17l5-5-5-5M15 12H3M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>',
    external: '<path d="M14 3h7v7M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2.1Z"/>',
    lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'
  }

  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name] || paths.home}</svg>`
}

const icon = (name: string) => `<span class="portal-icon">${renderPortalIcon(name)}</span>`

export function renderSubscriberAuthLayout(params: {
  title: string
  siteName: string
  bodyHtml: string
  nonce?: string
  script?: string
  mode: 'login' | 'register'
}): string {
  const { title, siteName, bodyHtml, nonce = '', script = '', mode } = params
  const register = mode === 'register'

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <meta name="theme-color" content="#0b2539">
  <title>${escapePortalHtml(title)} | ${escapePortalHtml(siteName)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/static/portal.css?v=20260818-portal1">
</head>
<body class="subscriber-auth-page">
  <main class="subscriber-auth-shell">
    <section class="subscriber-auth-brand" aria-label="${escapePortalHtml(siteName)}">
      <a class="subscriber-auth-logo" href="/" aria-label="Voltar para ${escapePortalHtml(siteName)}">
        <img src="/static/logo-dp.png" alt="${escapePortalHtml(siteName)}">
      </a>
      <div class="subscriber-auth-message">
        <p class="subscriber-kicker">Exclusivo para assinantes</p>
        <h1>${register ? 'Informação de qualidade, todos os dias.' : 'Seu jornal continua aqui.'}</h1>
        <p>${register ? 'Crie sua conta e tenha acesso à experiência completa do Diário do Povo.' : 'Acesse sua assinatura, acompanhe pagamentos e continue lendo sem limites.'}</p>
        <ul class="subscriber-benefits" aria-label="Benefícios da assinatura">
          <li>${icon('check')} Conteúdo exclusivo e acesso ilimitado</li>
          <li>${icon('check')} Gestão transparente da sua assinatura</li>
          <li>${icon('check')} Experiência sem interrupções</li>
        </ul>
      </div>
      <p class="subscriber-auth-foot">Diário do Povo · Área do assinante</p>
    </section>

    <section class="subscriber-auth-form-panel">
      <div class="subscriber-auth-form-wrap">
        ${bodyHtml}
      </div>
    </section>
  </main>
  ${script ? `<script nonce="${escapePortalHtml(nonce)}">${script}</script>` : ''}
</body>
</html>`
}

export function renderSubscriberShell(params: {
  title: string
  siteName: string
  activeTab: 'dashboard' | 'account'
  bodyHtml: string
  nonce?: string
  script?: string
}): string {
  const { title, siteName, activeTab, bodyHtml, nonce = '', script = '' } = params
  const active = (tab: string) => tab === activeTab ? 'active' : ''
  const current = (tab: string) => tab === activeTab ? ' aria-current="page"' : ''

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <meta name="theme-color" content="#0b2539">
  <title>${escapePortalHtml(title)} | ${escapePortalHtml(siteName)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/static/portal.css?v=20260818-portal1">
</head>
<body class="subscriber-portal-page">
  <a class="portal-skip-link" href="#portal-main">Ir para o conteúdo</a>
  <input class="portal-nav-toggle" type="checkbox" id="portal-nav-toggle" aria-hidden="true">

  <header class="subscriber-header">
    <div class="subscriber-header-inner">
      <div class="subscriber-header-leading">
        <label class="portal-menu-trigger" for="portal-nav-toggle" aria-label="Abrir menu">${renderPortalIcon('menu')}</label>
        <a class="subscriber-logo" href="/" aria-label="Página inicial de ${escapePortalHtml(siteName)}">
          <img src="/static/logo-dp.png" alt="${escapePortalHtml(siteName)}">
        </a>
        <span class="subscriber-area-label">Área do assinante</span>
      </div>
      <a class="subscriber-read-link" href="/">Ir para o jornal ${icon('external')}</a>
    </div>
  </header>

  <label class="portal-overlay" for="portal-nav-toggle" aria-label="Fechar menu"></label>

  <div class="subscriber-layout">
    <aside class="subscriber-sidebar" aria-label="Navegação da conta">
      <div class="subscriber-sidebar-head">
        <p>Minha conta</p>
        <label class="portal-menu-close" for="portal-nav-toggle" aria-label="Fechar menu">${renderPortalIcon('close')}</label>
      </div>
      <nav class="subscriber-nav">
        <a class="${active('dashboard')}" href="/portal"${current('dashboard')}>${icon('home')}<span><strong>Visão geral</strong><small>Assinatura e pagamentos</small></span></a>
        <a class="${active('account')}" href="/conta"${current('account')}>${icon('account')}<span><strong>Dados pessoais</strong><small>Cadastro e acesso</small></span></a>
        <a href="/">${icon('newspaper')}<span><strong>Voltar ao jornal</strong><small>Continue sua leitura</small></span></a>
      </nav>
      <div class="subscriber-sidebar-support">
        <span class="portal-icon">${renderPortalIcon('shield')}</span>
        <div><strong>Ambiente seguro</strong><p>Seus dados são protegidos.</p></div>
      </div>
    </aside>

    <main class="subscriber-main" id="portal-main" tabindex="-1">
      ${bodyHtml}
    </main>
  </div>

  ${script ? `<script nonce="${escapePortalHtml(nonce)}">${script}</script>` : ''}
</body>
</html>`
}
