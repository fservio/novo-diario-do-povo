import { escapeHtml, escapeAttr } from '../layout'

export function renderAlltypeFooter(siteName: string, logoUrl: string): string {
  return `
    <footer class="dp-footer">
      <div class="dp-shell">
        <div class="dp-footer-top">
          <div class="dp-footer-brand">
            <img src="${escapeAttr(logoUrl)}" alt="${escapeAttr(siteName)}">
            <p class="dp-footer-description">
              ${escapeHtml(siteName)}. O seu portal de notícias diário com informação de qualidade, ética e compromisso social.
            </p>
          </div>
          <div class="dp-footer-navs">
            <div class="dp-footer-nav-col">
              <h4>Portal</h4>
              <ul>
                <li><a href="/assinar">Assine o Jornal</a></li>
                <li><a href="/conta">Minha Conta</a></li>
              </ul>
            </div>
            <div class="dp-footer-nav-col">
              <h4>Fale Conosco</h4>
              <ul>
                <li><a href="/contato">Redação</a></li>
                <li><a href="/anuncie">Anuncie</a></li>
              </ul>
            </div>
          </div>
        </div>

        <div class="dp-footer-bottom">
          <p>&copy; ${new Date().getFullYear()} ${escapeHtml(siteName)}. Todos os direitos reservados.</p>
          <p>Desenvolvido com foco em performance e privacidade.</p>
        </div>
      </div>
    </footer>
  `
}
