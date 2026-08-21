import { describe, expect, it } from 'vitest'
import { renderAdminLayout, renderLoginPage } from '../../packages/core/admin/ui'

const adminUser = {
  id: 1,
  email: 'editor@diariodopovo.com.br',
  name: 'Editora Chefe',
  role: 'admin'
}

describe('Admin UI layout', () => {
  it('renderiza o shell editorial com navegação acessível e responsiva', () => {
    const html = renderAdminLayout({
      title: 'Matérias',
      user: adminUser,
      bodyHtml: '<h1>Conteúdo</h1>',
      activeTab: 'posts',
      csrfToken: 'csrf-test'
    })

    expect(html).toContain('/static/admin.css?v=20260821-team1')
    expect(html).toContain('aria-label="Navegação administrativa"')
    expect(html).toContain('id="admin-nav-toggle"')
    expect(html).toContain('href="/admin/redacao-ia"')
    expect(html).toContain('href="/admin/posts" aria-current="page"')
    expect(html).toContain('Editorias')
    expect(html).toContain('Biblioteca de mídia')
    expect(html).toContain('Equipe e acessos')
    expect(html).toContain('value="csrf-test"')
    expect(html).not.toMatch(/[📊📝📰🔴📂🏷️✒️🖼️👥💳🔌📢🛡️⚙️]/u)
  })

  it('escapa dados de usuário no cabeçalho', () => {
    const html = renderAdminLayout({
      title: '<Painel>',
      user: { ...adminUser, name: '<script>alert(1)</script>' },
      bodyHtml: '',
      activeTab: 'dashboard'
    })

    expect(html).toContain('&lt;Painel&gt;')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script>alert(1)</script>')
  })

  it('renderiza o login com rótulos, autocomplete e erro acessível', () => {
    const html = renderLoginPage('Credenciais inválidas')

    expect(html).toContain('Entrar na redação')
    expect(html).toContain('for="admin-email"')
    expect(html).toContain('autocomplete="username"')
    expect(html).toContain('autocomplete="current-password"')
    expect(html).toContain('role="alert"')
    expect(html).toContain('Credenciais inválidas')
  })
})
