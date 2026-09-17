import { describe, expect, it } from 'vitest'
import {
  escapePortalHtml,
  renderSubscriberAuthLayout,
  renderSubscriberShell
} from '../../packages/core/web/portal/ui'

describe('Subscriber portal UI', () => {
  it('renderiza a experiência de acesso com identidade e benefícios', () => {
    const html = renderSubscriberAuthLayout({
      title: 'Entrar',
      siteName: 'Diário do Povo',
      bodyHtml: '<form id="loginForm"></form>',
      nonce: 'nonce-test',
      script: 'window.portalReady = true;',
      mode: 'login'
    })

    expect(html).toContain('/static/portal.css?v=20260818-portal1')
    expect(html).toContain('Seu jornal continua aqui.')
    expect(html).toContain('Conteúdo exclusivo e acesso ilimitado')
    expect(html).toContain('nonce="nonce-test"')
    expect(html).toContain('<form id="loginForm"></form>')
  })

  it('renderiza o shell interno com navegação acessível', () => {
    const html = renderSubscriberShell({
      title: 'Minha assinatura',
      siteName: 'Diário do Povo',
      activeTab: 'dashboard',
      bodyHtml: '<h1>Olá</h1>'
    })

    expect(html).toContain('aria-label="Navegação da conta"')
    expect(html).toContain('id="portal-nav-toggle"')
    expect(html).toContain('href="/portal" aria-current="page"')
    expect(html).toContain('href="/conta"')
    expect(html).toContain('Assinatura e pagamentos')
    expect(html).toContain('Ambiente seguro')
  })

  it('marca a página de dados pessoais como ativa', () => {
    const html = renderSubscriberShell({
      title: 'Minha conta',
      siteName: 'Diário do Povo',
      activeTab: 'account',
      bodyHtml: ''
    })

    expect(html).toContain('class="active" href="/conta" aria-current="page"')
  })

  it('escapa títulos e nomes do site', () => {
    expect(escapePortalHtml('<script>')).toBe('&lt;script&gt;')
    const html = renderSubscriberAuthLayout({
      title: '<Entrar>',
      siteName: '<Jornal>',
      bodyHtml: '',
      mode: 'register'
    })

    expect(html).toContain('&lt;Entrar&gt;')
    expect(html).toContain('&lt;Jornal&gt;')
    expect(html).not.toContain('<Jornal>')
  })
})
