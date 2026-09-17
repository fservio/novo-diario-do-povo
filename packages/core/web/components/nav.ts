import { escapeHtml, escapeAttr } from '../layout'

export function renderAlltypeNav(navItems: Array<{ label: string; href: string; active?: boolean }>): string {
  return `
    <nav id="dpCategoryNav" class="dp-nav" aria-label="Editorias">
      <div class="dp-shell">
        <ul class="dp-nav-list">
          ${navItems.map(item => `
            <li class="dp-nav-item">
              <a href="${escapeAttr(item.href)}" class="dp-nav-link ${item.active ? 'active' : ''}">${escapeHtml(item.label)}</a>
            </li>
          `).join('')}
        </ul>
      </div>
    </nav>
  `
}
