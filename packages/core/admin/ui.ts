/**
 * Admin UI helpers
 * Layout SSR e formulários
 */

export interface AdminUser {
  id: number
  email: string
  role: string
  is_active?: number
  name?: string
}

export function escapeHtml(unsafe: string | null | undefined): string {
  if (unsafe === undefined || unsafe === null) return ''
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function renderCsrfInput(csrfToken: string): string {
  return `<input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">`
}

export function maskSecretValue(value: string): string {
  if (!value || value.length < 8) return '***'
  return value.substring(0, 4) + '***' + value.substring(value.length - 4)
}

export function renderScript(code: string, nonce?: string): string {
  const nonceAttr = nonce ? ` nonce="${escapeHtml(nonce)}"` : ''
  return `<script${nonceAttr}>${code}</script>`
}

/** Ícones vetoriais do CMS, inline para evitar dependências no cliente. */
export function renderAdminIcon(name: string): string {
  const paths: Record<string, string> = {
    dashboard: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    posts: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>',
    cover: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h6M7 16h4M15 12h2M15 16h2"/>',
    live: '<circle cx="12" cy="12" r="2"/><path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14"/>',
    categories: '<path d="M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    tags: '<path d="M20 13 11 22l-9-9V3h10z"/><circle cx="7.5" cy="8.5" r="1.2"/>',
    authors: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z"/>',
    media: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
    newsletter: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/><path d="M7 17h4"/>',
    engagement: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
    instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>',
    ai: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/><circle cx="12" cy="12" r="4"/><path d="m10.4 12 1.1 1.1 2.3-2.5"/>',
    radar: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 4v8l5.7-5.7"/>',
    source: '<path d="M4 19a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"/><path d="M4 13a7 7 0 0 1 7 7M4 7a13 13 0 0 1 13 13"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    billing: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h2"/>',
    integrations: '<path d="M8 12h8M12 8v8M7 3h3v4H7a5 5 0 0 0 0 10h3v4H7A9 9 0 0 1 7 3ZM17 3h-3v4h3a5 5 0 0 1 0 10h-3v4h3a9 9 0 0 0 0-18Z"/>',
    ads: '<path d="m3 11 18-5v12L3 13zM7 14v5a2 2 0 0 0 2 2h2v-6"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
    external: '<path d="M14 3h7v7M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2"/>',
    logout: '<path d="M10 17l5-5-5-5M15 12H3M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>'
  }

  const path = paths[name] || paths.dashboard
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${path}</svg>`
}

export function renderAdminLayout(params: {
  title: string
  user: AdminUser
  bodyHtml: string
  activeTab?: string
  csrfToken?: string
}): string

export function renderAdminLayout(bodyHtml: string, user: AdminUser, csrfToken?: string): string

export function renderAdminLayout(
  paramsOrBodyHtml: { title: string; user: AdminUser; bodyHtml: string; activeTab?: string; csrfToken?: string } | string,
  user?: AdminUser,
  csrfToken?: string
): string {
  let title: string
  let bodyHtml: string
  let actualUser: AdminUser
  let activeTab = ''
  let actualCsrfToken = ''

  if (typeof paramsOrBodyHtml === 'string') {
    bodyHtml = paramsOrBodyHtml
    actualUser = user!
    title = 'Painel'
    actualCsrfToken = csrfToken || ''
  } else {
    title = paramsOrBodyHtml.title
    actualUser = paramsOrBodyHtml.user
    bodyHtml = paramsOrBodyHtml.bodyHtml
    activeTab = paramsOrBodyHtml.activeTab || ''
    actualCsrfToken = paramsOrBodyHtml.csrfToken || ''
  }

  const isActive = (tab: string) => activeTab === tab ? 'active' : ''
  const current = (tab: string) => activeTab === tab ? ' aria-current="page"' : ''
  const icon = (name: string) => `<span class="icon">${renderAdminIcon(name)}</span>`
  const displayName = actualUser.name || actualUser.email || 'Admin'
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2)
    .map(part => part.charAt(0).toUpperCase()).join('') || 'DP'
  const roleLabels: Record<string, string> = { admin: 'Administrador', director: 'Administrador', editor: 'Editor', writer: 'Redator', author: 'Autor' }
  const roleLabel = roleLabels[actualUser.role] || actualUser.role
  const canManageTeam = actualUser.role === 'admin' || actualUser.role === 'director'

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <meta name="theme-color" content="#0b2539">
  <title>${escapeHtml(title)} | Redação Diário do Povo</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/static/admin.css?v=20260821-engagement1">
</head>
<body>
  <a class="skip-link" href="#admin-content">Ir para o conteúdo</a>
  <div class="layout">
    <input class="admin-nav-toggle" type="checkbox" id="admin-nav-toggle" aria-hidden="true">

    <aside class="sidebar" aria-label="Navegação administrativa">
      <div class="sidebar-header">
        <a class="admin-brand" href="/admin" aria-label="Diário do Povo — Redação">
          <img src="/static/logo-dp.png" alt="Diário do Povo">
          <span class="admin-brand-copy">Redação</span>
        </a>
        <label class="sidebar-close" for="admin-nav-toggle" aria-label="Fechar menu">${renderAdminIcon('close')}</label>
      </div>

      <nav class="nav">
        <a class="${isActive('dashboard')}" href="/admin"${current('dashboard')}>${icon('dashboard')}Visão geral</a>

        <div class="nav-label">Publicação</div>
        <a class="${isActive('posts')}" href="/admin/posts"${current('posts')}>${icon('posts')}Matérias</a>
        <a class="${isActive('redacao-ia')}" href="/admin/redacao-ia"${current('redacao-ia')}>${icon('ai')}Redação IA</a>
        <a class="${isActive('daily-cover')}" href="/admin/daily-cover"${current('daily-cover')}>${icon('cover')}Capa do dia</a>
        <a class="${isActive('live')}" href="/admin/live"${current('live')}>${icon('live')}Central ao vivo</a>
        <a class="${isActive('categories')}" href="/admin/categories"${current('categories')}>${icon('categories')}Editorias</a>
        <a class="${isActive('tags')}" href="/admin/tags"${current('tags')}>${icon('tags')}Tags</a>
        ${canManageTeam ? `<a class="${isActive('authors')}" href="/admin/authors"${current('authors')}>${icon('authors')}Autores</a>` : ''}
        <a class="${isActive('media')}" href="/admin/media"${current('media')}>${icon('media')}Biblioteca de mídia</a>
        <a class="${isActive('newsletters')}" href="/admin/newsletters"${current('newsletters')}>${icon('newsletter')}Newsletters</a>
        <a class="${isActive('instagram')}" href="/admin/instagram"${current('instagram')}>${icon('instagram')}Instagram</a>
        <a class="${isActive('engagement')}" href="/admin/engagement"${current('engagement')}>${icon('engagement')}Campanhas</a>

        <div class="nav-label">Negócio</div>
        <a class="${isActive('subscribers')}" href="/admin/subscribers"${current('subscribers')}>${icon('users')}Assinantes</a>
        <a class="${isActive('asaas')}" href="/admin/asaas"${current('asaas')}>${icon('billing')}Cobranças</a>
        <a class="${isActive('ads')}" href="/admin/ads"${current('ads')}>${icon('ads')}Publicidade</a>

        <div class="nav-label">Administração</div>
        <a class="${isActive('integrations')}" href="/admin/integrations"${current('integrations')}>${icon('integrations')}Integrações</a>
        ${canManageTeam ? `<a class="${isActive('users')}" href="/admin/users"${current('users')}>${icon('shield')}Equipe e acessos</a>` : ''}
        <a class="${isActive('settings')}" href="/admin/settings"${current('settings')}>${icon('settings')}Configurações</a>
      </nav>

      <div class="sidebar-footer">
        <a href="/" target="_blank" rel="noopener" class="view-site">${icon('external')}<span>Ver site publicado</span></a>
      </div>
    </aside>

    <label class="admin-overlay" for="admin-nav-toggle" aria-label="Fechar menu"></label>

    <main class="main">
      <header class="header">
        <div class="header-leading">
          <label class="menu-trigger" for="admin-nav-toggle" aria-label="Abrir menu">${renderAdminIcon('menu')}</label>
          <div>
            <div class="header-eyebrow">Diário do Povo · CMS</div>
            <div class="header-title">${escapeHtml(title)}</div>
          </div>
        </div>

        <div class="user-menu">
          <div class="user-summary">
            <span class="user-avatar" aria-hidden="true">${escapeHtml(initials)}</span>
            <div class="user-info">
              <div class="user-name">${escapeHtml(displayName)}</div>
              <div class="user-role">${escapeHtml(roleLabel)}</div>
            </div>
          </div>
          <form method="post" action="/admin/logout">
            ${actualCsrfToken ? renderCsrfInput(actualCsrfToken) : ''}
            <button class="btn btn-danger logout-button" type="submit" aria-label="Sair do CMS">
              <span class="admin-icon">${renderAdminIcon('logout')}</span>
              <span class="logout-label">Sair</span>
            </button>
          </form>
        </div>
      </header>

      <section class="content" id="admin-content" tabindex="-1">
        ${bodyHtml}
      </section>
    </main>
  </div>
</body>
</html>`
}

export function renderLoginPage(error?: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <meta name="theme-color" content="#0b2539">
  <title>Acesso à redação | Diário do Povo</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/static/admin.css?v=20260821-engagement1">
</head>
<body class="login-page">
  <main class="login-shell">
    <section class="login-brand-panel" aria-label="Diário do Povo">
      <div class="login-brand-content">
        <img src="/static/logo-dp.png" alt="Diário do Povo">
        <div class="login-brand-rule"></div>
        <p class="login-brand-kicker">Ambiente editorial</p>
        <h1>Notícia bem apurada.<br>Publicação bem cuidada.</h1>
        <p>O espaço de trabalho da redação para produzir, organizar e publicar o jornal.</p>
      </div>
      <p class="login-brand-footer">Diário do Povo · CMS</p>
    </section>

    <section class="login-form-panel">
      <div class="login-form-wrap">
        <p class="login-eyebrow">Acesso restrito</p>
        <h2>Entrar na redação</h2>
        <p class="login-subtitle">Use suas credenciais de colaborador para continuar.</p>

        ${error ? `<div class="login-error" role="alert">${escapeHtml(error)}</div>` : ''}

        <form method="post" action="/admin/login">
          <div class="login-field">
            <label for="admin-email">E-mail</label>
            <input id="admin-email" type="email" name="email" placeholder="nome@diariodopovo.com.br" autocomplete="username" required autofocus>
          </div>

          <div class="login-field">
            <label for="admin-password">Senha</label>
            <input id="admin-password" type="password" name="password" placeholder="Digite sua senha" autocomplete="current-password" required>
          </div>

          <button type="submit" class="login-submit">
            <span>Acessar o CMS</span>
            <span class="admin-icon">${renderAdminIcon('arrow')}</span>
          </button>
        </form>

        <p class="login-help">Problemas de acesso? Procure um administrador do sistema.</p>
      </div>
    </section>
  </main>
</body>
</html>`
}
