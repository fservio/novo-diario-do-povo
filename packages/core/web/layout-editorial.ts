import { escapeAttr, escapeHtml } from './layout'
import { renderSocialMetaTags, type SocialMeta } from './social'

export type EditorialNavItem = {
  label: string
  href: string
  active?: boolean
}

function renderEditorialHeader(params: {
  siteName: string
  navItems: EditorialNavItem[]
  nonce: string
}): string {
  const editionDate = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Fortaleza'
  })

  return `
    <a class="ed-skip-link" href="#conteudo">Ir para o conteúdo</a>
    <header class="ed-header">
      <div class="ed-utility">
        <div class="ed-container ed-utility__inner">
          <p>${escapeHtml(editionDate)}</p>
          <p class="ed-utility__mission">Jornalismo local, independente e responsável</p>
          <div class="ed-utility__links">
            <a href="/opiniao">Opinião</a>
            <a href="/conta">Minha conta</a>
          </div>
        </div>
      </div>

      <div class="ed-container ed-masthead">
        <button class="ed-menu-button" type="button" aria-expanded="false" aria-controls="edMenuDrawer" aria-label="Abrir menu principal">
          <span class="ed-menu-button__icon" aria-hidden="true"><i></i><i></i><i></i></span>
          <span class="ed-menu-button__label">Menu</span>
        </button>
        <a class="ed-brand" href="/" aria-label="Página inicial — ${escapeAttr(params.siteName)}">
          <img src="/static/logo-dp.png" alt="${escapeAttr(params.siteName)}" width="500" height="181" fetchpriority="high">
        </a>
        <div class="ed-masthead__actions">
          <a class="ed-account-link" href="/conta">Entrar</a>
          <a class="ed-subscribe" href="/assinar">Assine</a>
        </div>
      </div>

      <nav class="ed-nav" id="edNav" aria-label="Editorias">
        <div class="ed-container ed-nav__inner">
          <a class="ed-nav__latest" href="/ultimas">Últimas notícias</a>
          <ul class="ed-nav__list">
            ${params.navItems.map(item => `
              <li><a href="${escapeAttr(item.href)}" ${item.active ? 'aria-current="page"' : ''}>${escapeHtml(item.label)}</a></li>
            `).join('')}
          </ul>
        </div>
      </nav>

      <aside class="ed-support" aria-label="Assinatura">
        <div class="ed-container ed-support__inner">
          <p><strong>Jornalismo que pertence à comunidade.</strong> Informação de confiança, todos os dias.</p>
          <a href="/assinar">Conheça a assinatura <span aria-hidden="true">→</span></a>
        </div>
      </aside>

      <div class="ed-menu-overlay" data-menu-overlay aria-hidden="true"></div>
      <aside class="ed-menu-drawer" id="edMenuDrawer" aria-label="Menu principal" aria-hidden="true" inert>
        <div class="ed-menu-drawer__header">
          <a class="ed-menu-drawer__brand" href="/" aria-label="Página inicial — ${escapeAttr(params.siteName)}">
            <img src="/static/logo-dp.png" alt="${escapeAttr(params.siteName)}" width="500" height="181">
          </a>
          <button class="ed-menu-close" type="button" aria-label="Fechar menu">
            <span aria-hidden="true"></span>
          </button>
        </div>
        <div class="ed-menu-drawer__body">
          <p class="ed-menu-drawer__eyebrow">Navegação</p>
          <nav aria-label="Navegação principal">
            <a class="ed-menu-drawer__latest" href="/ultimas"><span aria-hidden="true"></span>Últimas notícias</a>
            <ul class="ed-menu-drawer__list">
              ${params.navItems.map(item => `
                <li><a href="${escapeAttr(item.href)}" ${item.active ? 'aria-current="page"' : ''}>${escapeHtml(item.label)}<span aria-hidden="true">→</span></a></li>
              `).join('')}
            </ul>
          </nav>
          <div class="ed-menu-drawer__services">
            <p class="ed-menu-drawer__eyebrow">O jornal</p>
            <div>
              <a href="/opiniao">Opinião</a>
              <a href="/conta">Minha conta</a>
            </div>
            <a class="ed-menu-drawer__subscribe" href="/assinar">Assine o Diário</a>
          </div>
        </div>
        <div class="ed-menu-drawer__footer">
          <p>Jornalismo local, independente e responsável.</p>
        </div>
      </aside>
    </header>

    <script nonce="${escapeAttr(params.nonce)}">
      (() => {
        const button = document.querySelector('.ed-menu-button');
        const drawer = document.getElementById('edMenuDrawer');
        const overlay = document.querySelector('[data-menu-overlay]');
        const closeButton = drawer?.querySelector('.ed-menu-close');
        if (!button || !drawer || !overlay || !closeButton) return;

        const setOpen = (open) => {
          button.setAttribute('aria-expanded', String(open));
          drawer.setAttribute('aria-hidden', String(!open));
          overlay.setAttribute('aria-hidden', String(!open));
          drawer.classList.toggle('is-open', open);
          overlay.classList.toggle('is-open', open);
          document.body.classList.toggle('ed-menu-open', open);
          if (open) {
            drawer.removeAttribute('inert');
            closeButton.focus();
          } else {
            drawer.setAttribute('inert', '');
            button.focus();
          }
        };

        button.addEventListener('click', () => setOpen(true));
        closeButton.addEventListener('click', () => setOpen(false));
        overlay.addEventListener('click', () => setOpen(false));
        document.addEventListener('keydown', (event) => {
          const open = button.getAttribute('aria-expanded') === 'true';
          if (event.key === 'Escape' && open) {
            setOpen(false);
            return;
          }
          if (event.key !== 'Tab' || !open) return;
          const focusable = Array.from(drawer.querySelectorAll('a[href], button:not([disabled])'));
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        });
      })();
    </script>
  `
}

function renderEditorialFooter(siteName: string): string {
  return `
    <footer class="ed-footer">
      <div class="ed-container">
        <div class="ed-footer__main">
          <div class="ed-footer__brand">
            <img src="/static/logo-dp.png" alt="${escapeAttr(siteName)}" width="500" height="181">
            <p>Informação de interesse público, com independência editorial e compromisso com a comunidade.</p>
          </div>
          <div class="ed-footer__column">
            <h2>O jornal</h2>
            <a href="/ultimas">Últimas notícias</a>
            <a href="/opiniao">Opinião</a>
            <a href="/assinar">Assine</a>
          </div>
          <div class="ed-footer__column">
            <h2>Atendimento</h2>
            <a href="/conta">Minha conta</a>
            <a href="/contato">Fale com a redação</a>
            <a href="/anuncie">Anuncie</a>
          </div>
        </div>
        <div class="ed-footer__legal">
          <p>© ${new Date().getFullYear()} ${escapeHtml(siteName)}. Todos os direitos reservados.</p>
          <p>Conteúdo protegido pela legislação brasileira.</p>
        </div>
      </div>
    </footer>
  `
}

export function renderEditorialLayout(params: {
  title: string
  description?: string
  bodyHtml: string
  baseUrl: string
  siteName: string
  navItems: EditorialNavItem[]
  nonce: string
  canonicalUrl?: string
  ogImage?: string
  openGraph?: SocialMeta
  extraHeadHtml?: string
  extraScriptsHtml?: string
  googleAnalyticsId?: string
  lcpPreloadUrl?: string
  lcpSrcSet?: string
}): string {
  const canonical = params.canonicalUrl || `${params.baseUrl}/`
  const description = params.description || `Notícias, análises e serviço público no ${params.siteName}`
  const ogImage = params.ogImage || `${params.baseUrl}/static/logo-dp.png`
  const openGraph = params.openGraph || {
    title: params.title,
    description,
    url: canonical,
    siteName: params.siteName,
    type: 'website' as const,
    image: {
      url: ogImage,
      secureUrl: ogImage,
      alt: params.siteName
    }
  }

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(params.title)}</title>
  <meta name="description" content="${escapeAttr(description)}">
  <link rel="canonical" href="${escapeAttr(canonical)}">
  ${renderSocialMetaTags(openGraph)}
  <meta name="theme-color" content="#123d5a">
  ${params.lcpPreloadUrl ? `<link rel="preload" as="image" href="${escapeAttr(params.lcpPreloadUrl)}"${params.lcpSrcSet ? ` imagesrcset="${escapeAttr(params.lcpSrcSet)}" imagesizes="(max-width: 760px) 100vw, 760px"` : ''} fetchpriority="high">` : ''}
  <link rel="stylesheet" href="/static/editorial.css?v=20260821-social1">
  ${params.extraHeadHtml || ''}
  ${params.googleAnalyticsId ? `
    <script async src="https://www.googletagmanager.com/gtag/js?id=${escapeAttr(params.googleAnalyticsId)}"></script>
    <script nonce="${escapeAttr(params.nonce)}">
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '${escapeAttr(params.googleAnalyticsId)}');
    </script>
  ` : ''}
</head>
<body class="ed-site">
  ${renderEditorialHeader({ siteName: params.siteName, navItems: params.navItems, nonce: params.nonce })}
  <main id="conteudo" class="ed-container ed-main">
    ${params.bodyHtml}
  </main>
  ${renderEditorialFooter(params.siteName)}
  ${params.extraScriptsHtml || ''}
</body>
</html>`
}
