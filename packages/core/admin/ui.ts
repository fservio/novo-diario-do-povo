/**
 * Admin UI Helpers
 * Layout SSR e formulários
 */

export interface AdminUser {
  id: number
  email: string
  role: string
}

export function renderAdminLayout(params: {
  title: string
  user: AdminUser
  bodyHtml: string
  activeTab?: string
  csrfToken?: string
}): string {
  const { title, user, bodyHtml, activeTab = '', csrfToken = '' } = params

  const isActive = (tab: string) => activeTab === tab ? 'bg-gray-100' : ''

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${escapeHtml(title)}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; }
  </style>
</head>
<body class="bg-gray-50 text-gray-900">
  <div class="min-h-screen flex">
    <aside class="w-64 bg-white border-r border-gray-200 p-4">
      <div class="text-xl font-bold mb-6 text-gray-900">Jornal CMS</div>
      <nav class="flex flex-col gap-2 text-sm">
        <a class="px-3 py-2 rounded hover:bg-gray-100 ${isActive('dashboard')}" href="/admin">Dashboard</a>
        <a class="px-3 py-2 rounded hover:bg-gray-100 ${isActive('settings')}" href="/admin/settings">Settings</a>
        <a class="px-3 py-2 rounded hover:bg-gray-100 ${isActive('asaas')}" href="/admin/asaas">Asaas</a>
        <a class="px-3 py-2 rounded hover:bg-gray-100 ${isActive('ads')}" href="/admin/ads">Ads</a>
        <a class="px-3 py-2 rounded hover:bg-gray-100 ${isActive('media')}" href="/admin/media">Media</a>
        <a class="px-3 py-2 rounded hover:bg-gray-100" href="/">Voltar ao site</a>
      </nav>
    </aside>

    <main class="flex-1">
      <header class="bg-white border-b border-gray-200 p-4 flex items-center justify-between">
        <div>
          <div class="text-lg font-semibold text-gray-900">${escapeHtml(title)}</div>
          <div class="text-xs text-gray-500">${escapeHtml(user.email)}</div>
        </div>
        <form method="post" action="/admin/logout">
          ${csrfToken ? `<input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">` : ''}
          <button class="px-4 py-2 rounded bg-gray-900 text-white text-sm hover:bg-gray-700 transition">Sair</button>
        </form>
      </header>

      <section class="p-6">
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
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; }
  </style>
</head>
<body class="bg-gray-100 flex items-center justify-center min-h-screen">
  <div class="bg-white p-8 rounded-lg shadow-lg w-full max-w-md">
    <h1 class="text-2xl font-bold mb-6 text-center text-gray-900">Jornal CMS</h1>
    
    ${error ? `<div class="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">${escapeHtml(error)}</div>` : ''}
    
    <form method="post" action="/admin/login" class="space-y-4">
      <div>
        <label class="block text-sm font-medium mb-1 text-gray-700">Email</label>
        <input 
          type="email" 
          name="email" 
          required 
          class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
      </div>
      
      <div>
        <label class="block text-sm font-medium mb-1 text-gray-700">Senha</label>
        <input 
          type="password" 
          name="password" 
          required 
          class="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
      </div>
      
      <button 
        type="submit" 
        class="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition font-medium"
      >
        Entrar
      </button>
    </form>
  </div>
</body>
</html>`
}
        >
      </div>
      
      <button 
        type="submit" 
        class="w-full bg-gray-900 text-white py-2 rounded hover:bg-gray-700 font-medium"
      >
        Entrar
      </button>
    </form>
  </div>
</body>
</html>`
}

export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }
  return text.replace(/[&<>"']/g, m => map[m] || m)
}

export function maskSecretValue(value: any): string {
  if (typeof value !== 'string' || value.length === 0) {
    return '(configurado)'
  }

  if (value.length <= 4) {
    return '****'
  }

  const visible = value.slice(-4)
  return `****${visible}`
}

/**
 * Render CSRF hidden input for SSR forms
 */
export function renderCsrfInput(csrfToken?: string): string {
  if (!csrfToken) return ''
  return `<input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">`
}

/**
 * Render inline script with CSP nonce
 */
export function renderScript(params: { nonce?: string; js: string }): string {
  const { nonce, js } = params
  if (nonce) {
    return `<script nonce="${escapeHtml(nonce)}">${js}</script>`
  }
  return `<script>${js}</script>`
}
