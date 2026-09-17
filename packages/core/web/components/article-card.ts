import { escapeHtml, escapeAttr, formatDate, generateSrcSet } from '../layout'

export interface ArticleCardParams {
  title: string
  hat?: string | null
  excerpt?: string | null
  published_at?: string | null
  author_name?: string | null
  featured_image_r2_key?: string | null
  url: string
  isLcp?: boolean
  noBorder?: boolean
  noImage?: boolean
}

export function renderAlltypeArticleCard(params: ArticleCardParams): string {
  const {
    title,
    hat,
    excerpt,
    published_at,
    author_name,
    featured_image_r2_key,
    url,
    isLcp = false,
    noBorder = false,
    noImage = false
  } = params

  const displayAuthor = author_name || 'Redação'
  const displayDate = published_at ? formatDate(published_at) : ''

  return `
    <article class="dp-card ${noBorder ? 'dp-card--no-border' : ''}">
      <a href="${escapeAttr(url)}" class="dp-card-link">
        ${(!noImage && featured_image_r2_key) ? `
          <div class="dp-card-media">
            <img
              src="/i/${escapeAttr(featured_image_r2_key)}?w=600"
              srcset="${generateSrcSet(featured_image_r2_key)}"
              sizes="(max-width: 600px) 100vw, 600px"
              alt="${escapeAttr(title)}"
              loading="${isLcp ? 'eager' : 'lazy'}"
              ${isLcp ? 'fetchpriority="high"' : ''}
            />
          </div>
        ` : ''}
        <div class="dp-card-content">
          ${hat ? `<span class="dp-hat">${escapeHtml(hat)}</span>` : ''}
          <h3 class="dp-card-title">${escapeHtml(title)}</h3>
          ${excerpt ? `<p class="dp-excerpt">${escapeHtml(excerpt)}</p>` : ''}
          <div class="dp-meta">
            <span>${escapeHtml(displayAuthor)}</span>
            ${displayDate ? `<span>•</span><span>${escapeHtml(displayDate)}</span>` : ''}
          </div>
        </div>
      </a>
    </article>
  `
}
