import { escapeAttr, escapeHtml, formatDate, generateSrcSet } from '../layout'

export type EditorialCardParams = {
  title: string
  url: string
  hat?: string | null
  excerpt?: string | null
  published_at?: string | null
  author_name?: string | null
  featured_image_r2_key?: string | null
  size?: 'lead' | 'standard' | 'compact'
  isLcp?: boolean
}

export function renderEditorialArticleCard(params: EditorialCardParams): string {
  const size = params.size || 'standard'
  const image = params.featured_image_r2_key

  return `
    <article class="ed-story ed-story--${size}${image ? '' : ' ed-story--no-media'}">
      <a class="ed-story__link" href="${escapeAttr(params.url)}">
        ${image ? `
          <figure class="ed-story__media">
            <img
              src="/i/${escapeAttr(image)}?w=${size === 'lead' ? '1200' : '700'}"
              srcset="${generateSrcSet(image)}"
              sizes="${size === 'lead' ? '(max-width: 760px) 100vw, 760px' : '(max-width: 760px) 42vw, 360px'}"
              alt="${escapeAttr(params.title)}"
              width="1200"
              height="675"
              loading="${params.isLcp ? 'eager' : 'lazy'}"
              ${params.isLcp ? 'fetchpriority="high"' : ''}
            >
          </figure>
        ` : ''}
        <div class="ed-story__body">
          ${params.hat ? `<p class="ed-kicker">${escapeHtml(params.hat)}</p>` : ''}
          <h2 class="ed-story__title">${escapeHtml(params.title)}</h2>
          ${params.excerpt && size !== 'compact' ? `<p class="ed-story__excerpt">${escapeHtml(params.excerpt)}</p>` : ''}
          ${size !== 'compact' ? `
            <p class="ed-story__meta">
              ${params.author_name ? `<span>Por ${escapeHtml(params.author_name)}</span>` : ''}
              ${params.published_at ? `<time>${escapeHtml(formatDate(params.published_at))}</time>` : ''}
            </p>
          ` : ''}
        </div>
      </a>
    </article>
  `
}
