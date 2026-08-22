import { escapeHtml, escapeAttr } from '../layout'
import { renderAlltypeNav } from './nav'

export type HeaderParams = {
  siteName: string
  logoUrl: string
  editionDate?: string
  editionNumber?: string
  navItems: Array<{ label: string; href: string; active?: boolean }>
  nonce: string
}

export function renderAlltypeHeader(params: HeaderParams): string {
  // <img src="/static/logo-dp.png"
  const defaultDate = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Sao_Paulo'
  })

  const displayDate = params.editionDate || (defaultDate.charAt(0).toUpperCase() + defaultDate.slice(1))
  const displayEdition = params.editionNumber || 'Ano CXXVI • Nº 42.189'

  return `
    <header class="dp-header">
      <div class="dp-shell dp-header-shell">
        <button class="dp-mobile-menu-btn" type="button" aria-label="Abrir menu de editorias" aria-controls="dpCategoryNav">
          <span></span>
          <span></span>
          <span></span>
        </button>

        <div class="dp-header-top dp-hairline-bottom">
          <div class="dp-header-meta">
            <span>${escapeHtml(displayDate)}</span>
            <span>•</span>
            <span>${escapeHtml(displayEdition)}</span>
          </div>
          <div class="dp-header-links">
            <a href="/conta" class="dp-header-link">Minha Conta</a>
            <a href="/assinar" class="dp-header-link dp-header-link--subscribe">Assinar</a>
          </div>
        </div>

        <div class="dp-header-center">
          <a href="/" class="dp-brand-link" title="Home - ${escapeAttr(params.siteName)}">
            <img src="${escapeAttr(params.logoUrl)}" alt="${escapeAttr(params.siteName)}" fetchpriority="high">
            <span class="dp-brand-text">${escapeHtml(params.siteName)}</span>
          </a>
        </div>
      </div>
    </header>
    ${renderAlltypeNav(params.navItems)}
  `
}
