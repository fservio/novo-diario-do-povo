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

  const isActive = (tab: string) => activeTab === tab ? 'active' : ''

  return `<!doctype html>
<html lang="pt-BR" data-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${escapeHtml(title)} | Jornal Admin</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      /* Colors - Neutral & Semantic */
      --bg-main: #f8fafc;
      --bg-card: #ffffff;
      --bg-sidebar: #ffffff;
      --text-main: #0f172a;
      --text-muted: #64748b;
      --border-color: #e2e8f0;
      
      --primary: #0f172a;
      --primary-hover: #1e293b;
      
      --accent: #2563eb;
      --accent-soft: rgba(37, 99, 235, 0.08);
      
      --success: #10b981;
      --danger: #ef4444;
      --warning: #f59e0b;

      /* Spacing Scale (8px modular) */
      --space-1: 0.25rem; /* 4px */
      --space-2: 0.5rem;  /* 8px */
      --space-3: 0.75rem; /* 12px */
      --space-4: 1rem;    /* 16px */
      --space-5: 1.5rem;  /* 24px */
      --space-6: 2rem;    /* 32px */
      --space-8: 3rem;    /* 48px */
      --space-10: 4rem;   /* 64px */
      --space-12: 6rem;   /* 96px */

      /* Layout Measurements */
      --sidebar-width: 320px;
      --header-height: 88px;
      --content-max-width: 1600px;
      --content-padding: var(--space-10);
      
      /* Design Tokens */
      --radius-sm: 8px;
      --radius-md: 12px;
      --radius-lg: 24px;
      
      --shadow-sm: 0 1px 3px 0 rgb(0 0 0 / 0.05);
      --shadow-md: 0 10px 15px -3px rgb(0 0 0 / 0.05), 0 4px 6px -4px rgb(0 0 0 / 0.05);
      --shadow-lg: 0 20px 25px -5px rgb(0 0 0 / 0.08), 0 8px 10px -6px rgb(0 0 0 / 0.08);
      
      --font-main: 'Inter', system-ui, sans-serif;
    }

    [data-theme="dark"] {
      --bg-main: #020617;
      --bg-card: #0f172a;
      --bg-sidebar: #0f172a;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --border-color: #1e293b;
      
      --primary: #3b82f6;
      --primary-hover: #60a5fa;
      
      --accent: #3b82f6;
      --accent-soft: rgba(59, 130, 246, 0.15);
      
      --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.3);
      --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.5), 0 2px 4px -2px rgb(0 0 0 / 0.5);
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body { 
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg-main);
      color: var(--text-main);
      line-height: 1.5;
      transition: background 0.3s, color 0.3s;
    }

    .container { display: flex; min-height: 100vh; }

    .sidebar { 
      width: var(--sidebar-width); 
      background: var(--bg-sidebar); 
      border-right: 1px solid var(--border-color); 
      padding: var(--space-8) var(--space-5);
      display: flex;
      flex-direction: column;
      position: sticky;
      top: 0;
      height: 100vh;
      overflow-y: auto;
      z-index: 20;
    }

    .logo { 
      font-size: 1.5rem; 
      font-weight: 900; 
      margin-bottom: var(--space-10);
      color: var(--text-main);
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0 var(--space-4);
      letter-spacing: -0.04em;
    }
    
    .nav { display: flex; flex-direction: column; gap: var(--space-2); }
    .nav a { 
      padding: 1rem var(--space-5); 
      border-radius: var(--radius-md); 
      text-decoration: none; 
      color: var(--text-muted);
      font-size: 1rem;
      font-weight: 600;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      display: flex;
      align-items: center;
      gap: 1rem;
      white-space: nowrap;
    }

    .nav a:hover { 
      background: var(--accent-soft); 
      color: var(--accent);
    }

    .nav a.active { 
      background: var(--accent-soft); 
      color: var(--accent);
      font-weight: 600;
    }

    .main { flex: 1; display: flex; flex-direction: column; min-width: 0; }

    .header { 
      height: var(--header-height);
      background: rgba(var(--bg-card), 0.85);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border-bottom: 1px solid var(--border-color); 
      padding: 0 var(--content-padding); 
      display: flex; 
      justify-content: space-between; 
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 10;
    }

    .header-title { 
      font-size: 1.5rem; 
      font-weight: 800; 
      color: var(--text-main);
      letter-spacing: -0.03em;
    }

    .btn { 
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0.875rem 1.75rem; 
      background: var(--primary); 
      color: #fff; 
      border: none; 
      border-radius: 100px; 
      cursor: pointer;
      font-size: 1rem;
      font-weight: 700;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      gap: 0.75rem;
      white-space: nowrap;
    }
    .btn:hover { 
      background: var(--primary-hover); 
      transform: translateY(-1px);
      box-shadow: var(--shadow-md);
    }
    .btn:active { transform: translateY(0); }

    .btn-secondary {
      background: var(--bg-main);
      color: var(--text-main);
      border: 1px solid var(--border-color);
    }
    .btn-secondary:hover {
      background: var(--bg-card);
      border-color: var(--text-muted);
    }

    .card { 
      background: var(--bg-card); 
      padding: 1.5rem; 
      border-radius: var(--radius-lg); 
      border: 1px solid var(--border-color);
      box-shadow: var(--shadow-sm);
      transition: box-shadow 0.3s ease;
    }
    .card:hover {
      box-shadow: var(--shadow-md);
    }

    .card-label { color: var(--text-muted); font-size: 0.875rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.025em; }
    .card-value { font-size: 2.25rem; font-weight: 800; margin-top: 0.5rem; color: var(--text-main); }

    .section-title { font-size: 1.5rem; font-weight: 800; margin-bottom: 1.5rem; color: var(--text-main); }

    /* Tables */
    table { width: 100%; border-collapse: separate; border-spacing: 0; }
    th { 
      background: var(--bg-main); 
      padding: var(--space-4) var(--space-6); 
      text-align: left; 
      font-size: 0.75rem; 
      font-weight: 700; 
      text-transform: uppercase; 
      letter-spacing: 0.08em; 
      color: var(--text-muted);
      border-bottom: 1px solid var(--border-color);
    }
    td { 
      padding: var(--space-5) var(--space-6); 
      border-bottom: 1px solid var(--border-color); 
      font-size: 0.9375rem;
      color: var(--text-main);
      vertical-align: middle;
    }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: var(--accent-soft); }

    /* Forms */
    .field { margin-bottom: 1.5rem; }
    label { display: block; font-size: 0.875rem; font-weight: 600; margin-bottom: 0.5rem; color: var(--text-main); }
    input, select, textarea { 
      width: 100%; 
      padding: 0.75rem; 
      background: var(--bg-main); 
      border: 1px solid var(--border-color); 
      border-radius: var(--radius-md); 
      color: var(--text-main);
      font-family: inherit;
      font-size: 0.9375rem;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    input:focus, select:focus, textarea:focus { 
      outline: none; 
      border-color: var(--accent); 
      box-shadow: 0 0 0 3px var(--accent-soft); 
    }

    .text-green { color: #10b981; }
    .text-red { color: #ef4444; }

    /* Custom scrollbar for dark mode */
    ::-webkit-scrollbar { width: 8px; }
    ::-webkit-scrollbar-track { background: var(--bg-main); }
    ::-webkit-scrollbar-thumb { background: var(--border-color); border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
  </style>
</head>
<body>
  <div class="container">
    <aside class="sidebar">
      <div class="logo">
        <span style="font-size: 1.75rem;">🗞️</span> Jornal CMS
      </div>
      <nav class="nav">
        <a class="${isActive('dashboard')}" href="/admin">
          <span>📊</span> Dashboard
        </a>
        <a class="${isActive('posts')}" href="/admin/posts">
          <span>📝</span> Posts
        </a>
        <a class="${isActive('daily-cover')}" href="/admin/daily-cover">
          <span>📰</span> Capa do Dia
        </a>
        <a class="${isActive('integrations')}" href="/admin/integrations">
          <span>🔌</span> Integrações
        </a>
        <a class="${isActive('live')}" href="/admin/live">
          <span>🔴</span> Central Live
        </a>
        <a class="${isActive('categories')}" href="/admin/categories">
          <span>📂</span> Categorias
        </a>
        <a class="${isActive('authors')}" href="/admin/authors">
          <span>✒️</span> Autores
        </a>
        <a class="${isActive('users')}" href="/admin/users">
          <span>👥</span> Usuários
        </a>
        <a class="${isActive('settings')}" href="/admin/settings">
          <span>⚙️</span> Configurações
        </a>
        <div style="margin: 1rem 0; border-top: 1px solid var(--border-color);"></div>
        <a class="${isActive('asaas')}" href="/admin/asaas">
          <span>💳</span> Assinaturas
        </a>
        <a class="${isActive('ads')}" href="/admin/ads">
          <span>📢</span> Publicidade
        </a>
        <a class="${isActive('media')}" href="/admin/media">
          <span>🖼️</span> Galeria
        </a>
        <div style="margin: 1rem 0; border-top: 1px solid var(--border-color);"></div>
        <a href="/" target="_blank">
          <span>🌐</span> Ver Site
        </a>
      </nav>
      
      <div style="margin-top: auto; padding-top: 1rem;">
         <button id="theme-toggle" class="btn" style="width: 100%; background: var(--bg-main); color: var(--text-main); border: 1px solid var(--border-color);">
           🌙 Alternar Tema
         </button>
      </div>
    </aside>

    <main class="main">
      <header class="header">
        <div class="header-title">${escapeHtml(title)}</div>
        <div class="header-user">
          <div class="header-email">
            <div style="font-weight: 600; color: var(--text-main);">${escapeHtml(actualUser.name || 'Usuário')}</div>
            <div>${escapeHtml(actualUser.email)}</div>
          </div>
          <form method="post" action="/admin/logout">
            ${actualCsrfToken ? `<input type="hidden" name="csrf" value="${escapeHtml(actualCsrfToken)}">` : ''}
            <button class="btn" style="background: transparent; color: var(--text-red); border: 1px solid var(--text-red);">
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

  <script>
    const themeToggle = document.getElementById('theme-toggle');
    const html = document.documentElement;
    
    // Load preference
    const savedTheme = localStorage.getItem('admin-theme') || 'dark';
    html.setAttribute('data-theme', savedTheme);
    updateToggleBtn(savedTheme);

    themeToggle.addEventListener('click', () => {
      const currentTheme = html.getAttribute('data-theme');
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      html.setAttribute('data-theme', newTheme);
      localStorage.setItem('admin-theme', newTheme);
      updateToggleBtn(newTheme);
    });

    function updateToggleBtn(theme) {
      themeToggle.innerHTML = theme === 'dark' ? '☀️ Modo Claro' : '🌙 Modo Escuro';
    }
  </script>
</body>
</html>`
}


export function renderLoginPage(error?: string): string {
  return `<!doctype html>
<html lang="pt-BR" data-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>Login | Jornal CMS</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-main: #f8fafc;
      --bg-card: #ffffff;
      --text-main: #0f172a;
      --text-muted: #64748b;
      --border-color: #e2e8f0;
      --accent: #2563eb;
      --accent-soft: rgba(37, 99, 235, 0.08);
      --radius-md: 10px;
    }

    [data-theme="dark"] {
      --bg-main: #020617;
      --bg-card: #0f172a;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --border-color: #1e293b;
      --accent: #3b82f6;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body { 
      font-family: 'Inter', -apple-system, sans-serif;
      background: var(--bg-main);
      color: var(--text-main);
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 1.5rem;
    }

    .login-box {
      background: var(--bg-card);
      padding: 3rem;
      border-radius: 20px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.15);
      width: 100%;
      max-width: 440px;
      border: 1px solid var(--border-color);
    }

    .title { 
      font-size: 2rem; 
      font-weight: 800; 
      text-align: center; 
      margin-bottom: 0.75rem;
      color: var(--text-main);
      letter-spacing: -0.04em;
    }
    .subtitle {
      font-size: 0.9375rem;
      color: var(--text-muted);
      text-align: center;
      margin-bottom: 2.5rem;
      line-height: 1.5;
    }

    .error {
      background: rgba(239, 68, 68, 0.08);
      border: 1px solid rgba(239, 68, 68, 0.2);
      color: #ef4444;
      padding: 1rem;
      border-radius: var(--radius-md);
      margin-bottom: 2rem;
      font-size: 0.875rem;
      text-align: center;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
    }

    .form { display: flex; flex-direction: column; gap: 1.5rem; }
    .field { display: flex; flex-direction: column; gap: 0.625rem; }
    
    label { 
      font-size: 0.75rem; 
      font-weight: 700; 
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    input {
      padding: 0.875rem 1rem;
      background: var(--bg-main);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      font-size: 1rem;
      color: var(--text-main);
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      font-family: inherit;
    }

    input:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 4px var(--accent-soft);
      background: var(--bg-card);
    }

    .btn {
      margin-top: 1rem;
      padding: 1rem;
      background: var(--accent);
      color: white;
      border: none;
      border-radius: var(--radius-md);
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      font-size: 1rem;
      letter-spacing: -0.01em;
    }

    .btn:hover { 
      filter: brightness(1.1);
      transform: translateY(-2px);
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
    }
    .btn:active { transform: translateY(0); }
  </style>
</head>
<body>
  <div class="login-box">
    <h1 class="title">🗞️ Jornal CMS</h1>
    <p class="subtitle">Bem-vindo de volta! Faça login para continuar.</p>
    
    ${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
    
    <form method="post" action="/admin/login" class="form">
      <div class="field">
        <label>Email</label>
        <input type="email" name="email" placeholder="seu@email.com" required autofocus>
      </div>
      
      <div class="field">
        <label>Senha</label>
        <input type="password" name="password" placeholder="••••••••" required>
      </div>
      
      <button type="submit" class="btn">Entrar no Dashboard</button>
    </form>
  </div>
</body>
</html>`
}

