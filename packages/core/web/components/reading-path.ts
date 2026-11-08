import type { RelatedPost } from '../../db/article'
import { getPostUrl } from '../../utils/post'
import { escapeHtml, escapeAttr } from '../layout'
import readingPathCss from '../../../../public/static/article-reading-path.css?raw'

export function renderReadingPath(post: RelatedPost, baseUrl: string): string {
  const origin=post.reading_path==='origin'
  const label=origin ? 'A notícia original' : /^como\b/i.test(post.title) ? 'Como funciona' : /^o que muda\b/i.test(post.title) ? 'O que muda para você' : /próximos passos/i.test(post.title) ? 'Próximos passos' : 'Para entender melhor'
  const description=origin ? 'Esta foi a notícia que deu origem à explicação que você acabou de ler.' : post.excerpt?.trim()
  const summary=description && description.toLocaleLowerCase('pt-BR')!==post.title.trim().toLocaleLowerCase('pt-BR') ? description : ''
  return `<style>${readingPathCss}</style>
    <aside class="reading-path${origin?' reading-path--origin':''}" aria-label="${origin?'Notícia que deu origem a esta explicação':'Continue a leitura'}">
      <a class="reading-path__link" href="${escapeAttr(getPostUrl(post,baseUrl))}" data-reading-path="${origin?'origin':'next'}">
        <span class="reading-path__eyebrow"><span class="reading-path__mark" aria-hidden="true">${origin?'↶':'↗'}</span>${label}</span>
        <strong class="reading-path__title">${escapeHtml(post.title)}</strong>
        ${summary?`<span class="reading-path__description">${escapeHtml(summary)}</span>`:''}
        <span class="reading-path__footer">${origin?'Voltar à notícia':'Continuar a leitura'}<span aria-hidden="true">${origin?'←':'→'}</span></span>
      </a>
    </aside>`
}

// Remove only the exact backlink previously appended by this automation.
// Preserve other editorial links and keep the old link if the card is unavailable.
export function removeLegacyReadingLink(html: string, targetUrl: string): string {
  return html.replace(/<p>\s*Leia a notícia que motivou esta explicação:\s*<a\b[^>]*href="([^"]+)"[^>]*>[\s\S]*?<\/a>\s*<\/p>/gi,(paragraph,href)=>href===escapeAttr(targetUrl)?'':paragraph)
}
