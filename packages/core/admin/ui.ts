
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
export function escapeHtml(unsafe: string | null | undefined): string {
  if (unsafe === undefined || unsafe === null) return ''
  return String(unsafe)
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
    title = 'Painel'
    actualCsrfToken = csrfToken || ''
  } else {
    // Object call: renderAdminLayout({ title, user, bodyHtml, ... })
    title = paramsOrBodyHtml.title
    actualUser = paramsOrBodyHtml.user
    bodyHtml = paramsOrBodyHtml.bodyHtml
    activeTab = paramsOrBodyHtml.activeTab || ''
    actualCsrfToken = paramsOrBodyHtml.csrfToken || ''
  }

  const isActive = (tab: string) => activeTab === tab ? 'active' : ''

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${escapeHtml(title)} | Administração</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #2b5375;
      --primary-light: #8cb9e1;
      --primary-dark: #1d3a52;
      --bg: #f1f5f9;
      --bg-sidebar: #ffffff;
      --text-main: #1e293b;
      --text-muted: #64748b;
      --white: #ffffff;
      --border: #e2e8f0;
      --radius: 0.75rem;
      --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
      --shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body { 
      font-family: 'Inter', sans-serif;
      background: var(--bg);
      color: var(--text-main);
      line-height: 1.5;
      min-height: 100vh;
    }

    .layout { display: flex; min-height: 100vh; }

    /* Sidebar */
    .sidebar { 
      width: 280px; 
      background: var(--bg-sidebar); 
      border-right: 1px solid var(--border); 
      display: flex;
      flex-direction: column;
      position: sticky;
      top: 0;
      height: 100vh;
      overflow-y: auto;
      z-index: 50;
    }

    .sidebar-header {
      padding: 2rem 1.5rem;
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .sidebar-header img {
      height: 28px;
      width: auto;
    }

    .nav { 
      padding: 0 1rem;
      display: flex; 
      flex-direction: column; 
      gap: 0.25rem; 
      flex: 1;
    }

    .nav-label {
      padding: 1rem 0.5rem 0.5rem;
      font-size: 0.75rem;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .nav a { 
      padding: 0.75rem 1rem; 
      border-radius: 0.5rem; 
      text-decoration: none; 
      color: var(--text-main);
      font-size: 0.875rem;
      font-weight: 500;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .nav a:hover { 
      background: #f8fafc;
      color: var(--primary);
    }

    .nav a.active { 
      background: #eff6ff;
      color: var(--primary);
      font-weight: 600;
    }

    .nav a .icon {
      font-size: 1.125rem;
      opacity: 0.8;
    }

    /* Main Content */
    .main { flex: 1; min-width: 0; display: flex; flex-direction: column; }

    .header { 
      height: 72px;
      background: var(--white);
      border-bottom: 1px solid var(--border); 
      padding: 0 2rem; 
      display: flex; 
      justify-content: space-between; 
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 40;
    }

    .header-title { 
      font-size: 1.25rem; 
      font-weight: 700; 
      color: var(--primary);
      letter-spacing: -0.02em;
    }

    .user-menu {
      display: flex;
      align-items: center;
      gap: 1.5rem;
    }

    .user-info {
        text-align: right;
    }

    .user-name { font-weight: 600; font-size: 0.875rem; color: var(--text-main); }
    .user-role { font-size: 0.75rem; color: var(--text-muted); text-transform: capitalize; }

    .content {
      padding: 2rem;
      max-width: 1400px;
      margin: 0 auto;
      width: 100%;
    }

    /* Common Components */
    .btn { 
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0.625rem 1.25rem; 
      background: var(--primary); 
      color: var(--white); 
      border: none; 
      border-radius: 0.5rem; 
      cursor: pointer;
      font-size: 0.875rem;
      font-weight: 600;
      transition: all 0.2s;
      gap: 0.5rem;
      text-decoration: none;
    }
    .btn:hover { 
      background: var(--primary-dark); 
      transform: translateY(-1px);
    }

    .btn-outline {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text-main);
    }
    .btn-outline:hover {
      background: #f8fafc;
      border-color: var(--text-muted);
    }

    .card { 
      background: var(--white); 
      padding: 1.5rem; 
      border-radius: var(--radius); 
      border: 1px solid var(--border);
      box-shadow: var(--shadow-sm);
    }

    .table-container {
      background: var(--white);
      border-radius: var(--radius);
      border: 1px solid var(--border);
      overflow: hidden;
      margin-top: 1.5rem;
    }

    table { width: 100%; border-collapse: collapse; }
    th { 
      background: #f8fafc; 
      padding: 1rem 1.5rem; 
      text-align: left; 
      font-size: 0.75rem; 
      font-weight: 700; 
      text-transform: uppercase; 
      letter-spacing: 0.05em; 
      color: var(--text-muted);
      border-bottom: 1px solid var(--border);
    }
    td { 
      padding: 1rem 1.5rem; 
      border-bottom: 1px solid var(--border); 
      font-size: 0.875rem;
      color: var(--text-main);
    }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #fbfcfe; }

    /* Forms */
    .form-group { margin-bottom: 2rem; }
    .form-group label { 
        display: block; 
        font-size: 0.8125rem; 
        font-weight: 700; 
        margin-bottom: 0.625rem; 
        color: var(--text-main);
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
    .form-control { 
      width: 100%; 
      padding: 0.875rem 1.125rem; 
      background: var(--white); 
      border: 1.5px solid #e2e8f0; 
      border-radius: 0.625rem; 
      color: var(--text-main);
      font-family: 'Inter', sans-serif;
      font-size: 0.9375rem;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
    }
    .form-control:focus { 
      outline: none; 
      border-color: var(--primary); 
      box-shadow: 0 0 0 4px rgba(43, 83, 117, 0.15); 
      background: #fafbfc;
    }
    .form-control::placeholder {
        color: #94a3b8;
    }

    textarea.form-control {
        min-height: 120px;
        line-height: 1.6;
        resize: vertical;
    }

    .badge {
        padding: 0.25rem 0.625rem;
        border-radius: 1rem;
        font-size: 0.75rem;
        font-weight: 700;
        text-transform: uppercase;
    }
    .badge-success { background: #dcfce7; color: #166534; }
    .badge-warning { background: #fef9c3; color: #854d0e; }
    .badge-danger { background: #fee2e2; color: #991b1b; }

    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
  </style>
</head>
<body>
  <div class="layout">
    <aside class="sidebar">
      <div class="sidebar-header">
        <img src="/static/logo-dp.png" alt="Logo">
        <span style="font-weight: 800; font-size: 1.125rem; color: var(--primary); letter-spacing: -0.05em;">ADMIN</span>
      </div>
      <nav class="nav">
        <a class="${isActive('dashboard')}" href="/admin">
          <span class="icon">📊</span> Painel Geral
        </a>
        
        <div class="nav-label">Conteúdo</div>
        <a class="${isActive('posts')}" href="/admin/posts">
          <span class="icon">📝</span> Matérias
        </a>
        <a class="${isActive('daily-cover')}" href="/admin/daily-cover">
          <span class="icon">📰</span> Capa do Dia
        </a>
        <a class="${isActive('live')}" href="/admin/live">
          <span class="icon">🔴</span> Central Live
        </a>
        <a class="${isActive('categories')}" href="/admin/categories">
          <span class="icon">📂</span> Categorias
        </a>
        <a class="${isActive('authors')}" href="/admin/authors">
          <span class="icon">✒️</span> Autores
        </a>
        <a class="${isActive('media')}" href="/admin/media">
          <span class="icon">🖼️</span> Galeria
        </a>

        <div class="nav-label">Assinantes</div>
        <a class="${isActive('subscribers')}" href="/admin/subscribers">
          <span class="icon">👥</span> Todos Assinantes
        </a>
        <a class="${isActive('asaas')}" href="/admin/asaas">
          <span class="icon">💳</span> Cobranças
        </a>

        <div class="nav-label">Configurações</div>
        <a class="${isActive('integrations')}" href="/admin/integrations">
          <span class="icon">🔌</span> Integrações
        </a>
        <a class="${isActive('ads')}" href="/admin/ads">
          <span class="icon">📢</span> Publicidade
        </a>
        <a class="${isActive('users')}" href="/admin/users">
          <span class="icon">🛡️</span> Time Staff
        </a>
        <a class="${isActive('settings')}" href="/admin/settings">
          <span class="icon">⚙️</span> Site Settings
        </a>
        
        <div style="margin-top: 2rem; padding: 0 1rem;">
             <a href="/" target="_blank" class="btn btn-outline" style="width: 100%;">
               Ver Site 🌐
             </a>
        </div>
      </nav>
    </aside>

    <main class="main">
      <header class="header">
        <div class="header-title">${escapeHtml(title)}</div>
        <div class="user-menu">
          <div class="user-info">
             <div class="user-name">${escapeHtml(actualUser.name || 'Admin')}</div>
             <div class="user-role">${escapeHtml(actualUser.role)}</div>
          </div>
          <form method="post" action="/admin/logout">
            ${actualCsrfToken ? `<input type="hidden" name="csrf" value="${escapeHtml(actualCsrfToken)}">` : ''}
            <button class="btn btn-outline" style="color: var(--danger); border-color: #fee2e2;">
              Sair
            </button>
          </form>
        </div>
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
  <title>Login Administrativo</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #2b5375;
      --primary-dark: #1d3a52;
      --bg: #f8fafc;
      --white: #ffffff;
      --border: #e2e8f0;
      --radius: 1rem;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body { 
      font-family: 'Inter', sans-serif;
      background: var(--bg);
      color: #1e293b;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 1.5rem;
    }

    .login-card {
      background: var(--white);
      padding: 3.5rem;
      border-radius: var(--radius);
      box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1);
      width: 100%;
      max-width: 460px;
      border: 1px solid var(--border);
    }

    .logo-container {
      margin-bottom: 2.5rem;
      text-align: center;
    }

    .logo-container img {
      height: 40px;
      width: auto;
    }

    .title { 
      font-size: 1.75rem; 
      font-weight: 800; 
      text-align: center; 
      margin-bottom: 0.5rem;
      color: var(--primary);
      letter-spacing: -0.05em;
    }

    .subtitle {
      font-size: 0.875rem;
      color: #64748b;
      text-align: center;
      margin-bottom: 2.5rem;
    }

    .error {
      background: #fee2e2;
      border: 1px solid #fecaca;
      color: #b91c1c;
      padding: 0.875rem;
      border-radius: 0.5rem;
      margin-bottom: 1.5rem;
      font-size: 0.875rem;
      text-align: center;
      font-weight: 600;
    }

    .form-group { margin-bottom: 1.25rem; }
    
    label { 
      display: block;
      font-size: 0.75rem; 
      font-weight: 700; 
      color: #475569;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.5rem;
    }

    input {
      width: 100%;
      padding: 0.875rem 1rem;
      background: #fcfdfe;
      border: 1px solid #cbd5e1;
      border-radius: 0.5rem;
      font-size: 1rem;
      color: #1e293b;
      transition: all 0.2s;
    }

    input:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 4px rgba(43, 83, 117, 0.1);
    }

    .btn {
      width: 100%;
      margin-top: 1rem;
      padding: 1rem;
      background: var(--primary);
      color: white;
      border: none;
      border-radius: 0.5rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
      font-size: 1rem;
    }

    .btn:hover { 
      background: var(--primary-dark);
      transform: translateY(-1px);
    }
  </style>
</head>
<body>
  <div class="login-card">
    <div class="logo-container">
        <img src="/static/logo-dp.png" alt="Logo">
    </div>

    <h1 class="title">Administração</h1>
    <p class="subtitle">Acesse o CMS do Diário do Povo</p>
    
    ${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
    
    <form method="post" action="/admin/login">
      <div class="form-group">
        <label>E-mail de Acesso</label>
        <input type="email" name="email" placeholder="seu@email.com" required autofocus>
      </div>
      
      <div class="form-group">
        <label>Senha</label>
        <input type="password" name="password" placeholder="••••••••" required>
      </div>
      
      <button type="submit" class="btn">Acessar Painel</button>
    </form>
  </div>
</body>
</html>`
}

