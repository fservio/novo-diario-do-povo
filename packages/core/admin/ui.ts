/**
 * Admin UI Helpers
 * Layout SSR e formulários
 */

export interface AdminUser {
  id: number
  email: string
  role: string
  is_active?: number
  name?: string
}

// Utility functions
export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Render CSRF hidden input
 */
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

export function renderAdminLayout(params: {
  title: string
  user: AdminUser
  bodyHtml: string
  activeTab?: string
  csrfToken?: string
}): string

// Overload for simple calls: renderAdminLayout(bodyHtml, user, csrfToken)
export function renderAdminLayout(bodyHtml: string, user: AdminUser, csrfToken?: string): string

export function renderAdminLayout(
  paramsOrBodyHtml: { title: string; user: AdminUser; bodyHtml: string; activeTab?: string; csrfToken?: string } | string,
  user?: AdminUser,
  csrfToken?: string
): string {
  // Handle overload
  let title: string
  let bodyHtml: string
  let actualUser: AdminUser
  let activeTab = ''
  let actualCsrfToken = ''

  if (typeof paramsOrBodyHtml === 'string') {
    // Simple call: renderAdminLayout(bodyHtml, user, csrfToken)
    bodyHtml = paramsOrBodyHtml
    actualUser = user!
    title = 'Admin'
    actualCsrfToken = csrfToken || ''
  } else {
    // Object call: renderAdminLayout({ title, user, bodyHtml, ... })
    title = paramsOrBodyHtml.title
    actualUser = paramsOrBodyHtml.user
    bodyHtml = paramsOrBodyHtml.bodyHtml
    activeTab = paramsOrBodyHtml.activeTab || ''
    actualCsrfToken = paramsOrBodyHtml.csrfToken || ''
  }

  const isActive = (tab: string) => activeTab === tab ? 'background: #f3f4f6;' : ''

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${escapeHtml(title)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: #f9fafb;
      color: #111827;
    }
    .container { display: flex; min-height: 100vh; }
    .sidebar { 
      width: 16rem; 
      background: white; 
      border-right: 1px solid #e5e7eb; 
      padding: 1rem;
    }
    .logo { font-size: 1.25rem; font-weight: 700; margin-bottom: 1.5rem; }
    .nav { display: flex; flex-direction: column; gap: 0.5rem; }
    .nav a { 
      padding: 0.5rem 0.75rem; 
      border-radius: 0.375rem; 
      text-decoration: none; 
      color: #374151;
      font-size: 0.875rem;
      transition: background 0.2s;
    }
    .nav a:hover { background: #f3f4f6; }
    .main { flex: 1; }
    .header { 
      background: white; 
      border-bottom: 1px solid #e5e7eb; 
      padding: 1rem; 
      display: flex; 
      justify-content: space-between; 
      align-items: center;
    }
    .header-title { font-size: 1.125rem; font-weight: 600; }
    .header-email { font-size: 0.75rem; color: #6b7280; margin-top: 0.25rem; }
    .btn { 
      padding: 0.5rem 1rem; 
      background: #111827; 
      color: white; 
      border: none; 
      border-radius: 0.375rem; 
      cursor: pointer;
      font-size: 0.875rem;
      transition: background 0.2s;
    }
    .btn:hover { background: #374151; }
    .content { padding: 1.5rem; }
    .grid { display: grid; gap: 1.5rem; }
    .grid-4 { grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
    .card { 
      background: white; 
      padding: 1.5rem; 
      border-radius: 0.5rem; 
      border: 1px solid #e5e7eb;
      box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    }
    .card-label { color: #6b7280; font-size: 0.875rem; font-weight: 500; }
    .card-value { font-size: 1.875rem; font-weight: 700; margin-top: 0.5rem; }
    .section-title { font-size: 1.25rem; font-weight: 600; margin: 2rem 0 1rem; }
    .link-card {
      background: white;
      padding: 1rem;
      border-radius: 0.5rem;
      border: 1px solid #e5e7eb;
      text-decoration: none;
      color: #111827;
      display: block;
      transition: all 0.2s;
    }
    .link-card:hover {
      background: #f9fafb;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    .link-title { font-weight: 500; }
    .link-desc { font-size: 0.875rem; color: #6b7280; margin-top: 0.25rem; }
    .text-green { color: #059669; }
    .text-red { color: #dc2626; }
  </style>
</head>
<body>
  <div class="container">
    <aside class="sidebar">
      <div class="logo">Jornal CMS</div>
      <nav class="nav">
        <a style="${isActive('dashboard')}" href="/admin">Dashboard</a>
        <a style="${isActive('posts')}" href="/admin/posts">Posts</a>
        <a style="${isActive('categories')}" href="/admin/categories">Categorias</a>
        <a style="${isActive('users')}" href="/admin/users">Usuários</a>
        <a style="${isActive('settings')}" href="/admin/settings">Settings</a>
        <a style="${isActive('asaas')}" href="/admin/asaas">Asaas</a>
        <a style="${isActive('ads')}" href="/admin/ads">Ads</a>
        <a style="${isActive('media')}" href="/admin/media">Media</a>
        <a href="/">Voltar ao site</a>
      </nav>
    </aside>

    <main class="main">
      <header class="header">
        <div>
          <div class="header-title">${escapeHtml(title)}</div>
          <div class="header-email">${escapeHtml(actualUser.email)}</div>
        </div>
        <form method="post" action="/admin/logout">
          ${actualCsrfToken ? `<input type="hidden" name="csrf" value="${escapeHtml(actualCsrfToken)}">` : ''}
          <button class="btn">Sair</button>
        </form>
      </header>

      <section class="content">
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
  <title>Login - Jornal CMS</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f3f4f6;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .login-box {
      background: white;
      padding: 2rem;
      border-radius: 0.5rem;
      box-shadow: 0 10px 25px rgba(0,0,0,0.1);
      width: 100%;
      max-width: 400px;
    }
    .title { 
      font-size: 1.5rem; 
      font-weight: 700; 
      text-align: center; 
      margin-bottom: 1.5rem;
    }
    .error {
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #991b1b;
      padding: 0.75rem;
      border-radius: 0.375rem;
      margin-bottom: 1rem;
      font-size: 0.875rem;
    }
    .form { display: flex; flex-direction: column; gap: 1rem; }
    .field { display: flex; flex-direction: column; gap: 0.25rem; }
    label { 
      font-size: 0.875rem; 
      font-weight: 500; 
      color: #374151;
    }
    input {
      padding: 0.75rem;
      border: 1px solid #d1d5db;
      border-radius: 0.375rem;
      font-size: 1rem;
    }
    input:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59,130,246,0.1);
    }
    .btn {
      padding: 0.75rem;
      background: #2563eb;
      color: white;
      border: none;
      border-radius: 0.375rem;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
    }
    .btn:hover { background: #1d4ed8; }
  </style>
</head>
<body>
  <div class="login-box">
    <h1 class="title">Jornal CMS</h1>
    
    ${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
    
    <form method="post" action="/admin/login" class="form">
      <div class="field">
        <label>Email</label>
        <input type="email" name="email" required autofocus>
      </div>
      
      <div class="field">
        <label>Senha</label>
        <input type="password" name="password" required>
      </div>
      
      <button type="submit" class="btn">Entrar</button>
    </form>
  </div>
</body>
</html>`
}
