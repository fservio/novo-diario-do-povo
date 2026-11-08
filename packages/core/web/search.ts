import type { Context } from 'hono'
import type { AppContext, Env } from '../types'
import { getActiveCategories } from '../db/categories-cache'
import { dailyDate } from '../meu-dia'
import { getPostUrl } from '../utils/post'
import { escapeAttr, escapeHtml, formatDate } from './layout'
import { renderEditorialLayout } from './layout-editorial'

const resultLimit = 20
const maximumPage = 10
const dayMilliseconds = 86_400_000
const monthLabel = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' })

type SearchResult = {
  title: string
  slug: string
  published_at: string
}

const searchSql = `
  SELECT title, slug, published_at
  FROM posts
  WHERE status = 'published' AND seo_noindex = 0
    AND published_at >= ? AND published_at < ?
    AND julianday(published_at) >= julianday(?)
    AND julianday(published_at) < julianday(?)
    AND title LIKE ? ESCAPE '!'
  ORDER BY julianday(published_at) DESC, id DESC
  LIMIT ? OFFSET ?
`

function searchPeriod(input: string | undefined, now: Date) {
  const today = dailyDate(now)
  const currentMonth = today.slice(0, 7)
  const currentYear = Number(today.slice(0, 4))
  const oldestMonth = `${currentYear - 1}-01`
  const month = input && /^\d{4}-(0[1-9]|1[0-2])$/.test(input)
    && input >= oldestMonth && input <= currentMonth ? input : null
  const midnight = new Date(`${today}T00:00:00-03:00`)
  const start = month
    ? new Date(`${month}-01T00:00:00-03:00`)
    : new Date(midnight.getTime() - 9 * dayMilliseconds)
  const end = new Date(now.getTime() + 1)
  if (month && month < currentMonth) {
    const first = new Date(`${month}-01T00:00:00Z`)
    first.setUTCMonth(first.getUTCMonth() + 1)
    end.setTime(first.getTime() + 3 * 3_600_000)
  }

  // Narrow the index scan before comparing exact instants in both stored date formats.
  const scanFrom = start.toISOString().slice(0, 10)
  const scanUntil = new Date(end.getTime() + dayMilliseconds).toISOString().slice(0, 10)
  return { month, currentMonth, currentYear, start, end, scanFrom, scanUntil }
}

export async function handlePublicSearch(c: Context<{ Bindings: Env; Variables: AppContext }>) {
  const query = (c.req.query('q') || '').slice(0, 100).trim().replace(/\s+/g, ' ')
  const period = searchPeriod(c.req.query('period'), new Date())
  const requestedPage = Number(c.req.query('page') || 1)
  const page = Number.isInteger(requestedPage) && requestedPage >= 1 && requestedPage <= maximumPage
    ? requestedPage
    : 1
  const searchable = query.length >= 2
  const results = searchable
    ? (await c.env.DB.prepare(searchSql).bind(
      period.scanFrom,
      period.scanUntil,
      period.start.toISOString(),
      period.end.toISOString(),
      '%' + query.replace(/[!%_]/g, '!$&') + '%',
      resultLimit + 1,
      (page - 1) * resultLimit
    ).all<SearchResult>()).results
    : []

  const categories = await getActiveCategories(c.env)
  const baseUrl = (c.env.PUBLIC_BASE_URL || 'https://diario.dopovo.com.br').replace(/\/$/, '')
  const pageLink = (target: number) => '/busca?' + new URLSearchParams({
    q: query, period: period.month || 'recent', page: String(target)
  })
  const monthOptions = (year: number, count: number) => Array.from({ length: count }, (_, index) => {
    const month = count - index
    const value = `${year}-${String(month).padStart(2, '0')}`
    const label = monthLabel.format(new Date(Date.UTC(year, month - 1, 1)))
    return `<option value="${value}"${period.month === value ? ' selected' : ''}>${label} de ${year}</option>`
  }).join('')
  const items = results.slice(0, resultLimit).map(post =>
    `<li><article><p>${escapeHtml(formatDate(post.published_at))}</p><a href="${escapeAttr(getPostUrl(post))}">${escapeHtml(post.title)}</a></article></li>`
  ).join('')
  const previous = searchable && page > 1 ? `<a href="${escapeAttr(pageLink(page - 1))}">← Anterior</a>` : ''
  const next = results.length > resultLimit && page < maximumPage
    ? `<a href="${escapeAttr(pageLink(page + 1))}">Próxima →</a>`
    : ''
  const message = searchable
    ? (items ? `Resultados para “${escapeHtml(query)}”` : `Nenhum resultado nesta página para “${escapeHtml(query)}”.`)
    : (query ? 'Digite pelo menos dois caracteres para buscar.' : '')

  c.header('X-Robots-Tag', 'noindex, follow')
  return c.html(renderEditorialLayout({
    title: 'Busca | Diário do Povo',
    description: 'Pesquise notícias do Diário do Povo por período.',
    siteName: 'Diário do Povo',
    baseUrl,
    canonicalUrl: baseUrl + '/busca',
    nonce: c.get('cspNonce') || '',
    navItems: categories.map(category => ({ label: category.name, href: '/categoria/' + encodeURIComponent(category.slug) })),
    extraHeadHtml: `<style>
      .dp-search{width:min(100% - 2rem,48rem);margin:clamp(1.25rem,5vw,3.5rem) auto 4rem}
      .dp-search header{padding-bottom:1rem;border-bottom:3px solid #123d5a}
      .dp-search h1{font-size:clamp(2.5rem,7vw,4rem);line-height:1.05;margin:.35rem 0}
      .dp-search__kicker{font-weight:700;text-transform:uppercase;letter-spacing:.09em}
      .dp-search form{display:grid;grid-template-columns:minmax(0,1fr) minmax(10rem,auto) auto;align-items:end;gap:.75rem;background:#f2f5f6;padding:clamp(.75rem,3vw,1.5rem);margin-top:1.25rem}
      .dp-search label{display:grid;gap:.35rem;font-weight:700;min-width:0}
      .dp-search input,.dp-search select,.dp-search button{min-width:0;min-height:44px;padding:.65rem .8rem;border:1px solid #536b79;border-radius:.25rem;font:inherit}
      .dp-search input,.dp-search select{width:100%;background:white;color:#123d5a}
      .dp-search button{background:#123d5a;color:white;cursor:pointer}
      .dp-search__results{margin-top:1.75rem;overflow-wrap:anywhere}
      .dp-search ul{list-style:none;padding:0}
      .dp-search li{padding:1rem 0;border-bottom:1px solid #d4dce0}
      .dp-search li p{color:#405b6d;margin:0 0 .25rem;font-size:.9rem}
      .dp-search li a{font-weight:700;text-decoration:underline;text-underline-offset:.2em}
      .dp-search nav{display:flex;gap:1.25rem;margin-top:1.25rem}
      @media(max-width:640px){.dp-search form{grid-template-columns:minmax(0,1fr)}}
    </style>`,
    bodyHtml: `<section class="dp-search">
      <header><p class="dp-search__kicker">Acervo do Diário do Povo</p>
        <h1>Buscar notícias</h1>
        <p>Busque nos títulos das notícias dos últimos 10 dias ou escolha um mês.</p>
      </header>
      <form action="/busca" method="get" role="search">
        <label>O que você procura?
          <input name="q" type="search" value="${escapeAttr(query)}" minlength="2" maxlength="100" required>
        </label>
        <label>Período
          <select name="period">
            <option value="recent"${period.month ? '' : ' selected'}>Últimos 10 dias</option>
            <optgroup label="Por mês · ${period.currentYear}">${monthOptions(period.currentYear, Number(period.currentMonth.slice(5)))}</optgroup>
            <optgroup label="Arquivo · ${period.currentYear - 1}">${monthOptions(period.currentYear - 1, 12)}</optgroup>
          </select>
        </label>
        <button type="submit">Buscar</button>
      </form>
      ${message ? `<section class="dp-search__results" aria-labelledby="dp-search-results">
        <h2 id="dp-search-results">${message}</h2>
        ${items ? `<ul>${items}</ul>` : ''}
        ${previous || next ? `<nav aria-label="Páginas de resultados">${previous}${next}</nav>` : ''}
      </section>` : ''}
    </section>`
  }))
}
