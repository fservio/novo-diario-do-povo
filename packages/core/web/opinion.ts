import type { Context } from 'hono'
import type { AppContext, Env } from '../types'
import { listOpinionColumnists, listPublishedOpinionPosts, type OpinionColumnist, type OpinionPost, type OpinionType } from '../db/opinion'
import { getPostUrl } from '../utils/post'
import { escapeAttr, escapeHtml, formatDate, generateSrcSet } from './layout'
import { renderEditorialLayout } from './layout-editorial'
import { renderEditorialArticleCard } from './components/editorial-card'

type OpinionPageOptions = {
  baseUrl: string
  siteName: string
  navItems: Array<{ label: string; href: string; active?: boolean }>
  googleAnalyticsId?: string
}

const opinionLabels: Record<OpinionType, string> = {
  editorial: 'Editorial do Jornal',
  article: 'Artigo',
  column: 'Coluna'
}

function renderOpinionLead(post: OpinionPost, baseUrl: string): string {
  const image = post.featured_image_r2_key
  const label = post.opinion_type === 'column' && post.column_name
    ? post.column_name
    : opinionLabels[post.opinion_type]

  return `
    <article class="ed-opinion-lead${image ? '' : ' ed-opinion-lead--no-media'}">
      <a href="${escapeAttr(getPostUrl(post))}">
        ${image ? `
          <figure class="ed-opinion-lead__media">
            <img
              src="/i/${escapeAttr(image)}?w=1200"
              srcset="${generateSrcSet(image)}"
              sizes="(max-width: 760px) 100vw, 760px"
              alt="${escapeAttr(post.title)}"
              width="1200"
              height="675"
              loading="eager"
              fetchpriority="high"
            >
          </figure>
        ` : ''}
        <div class="ed-opinion-lead__body">
          <p class="ed-kicker">${escapeHtml(label)}</p>
          <h2>${escapeHtml(post.title)}</h2>
          ${post.excerpt ? `<p class="ed-opinion-lead__deck">${escapeHtml(post.excerpt)}</p>` : ''}
          <p class="ed-opinion-byline">
            ${post.opinion_type === 'editorial'
              ? `<strong>${escapeHtml('Diário do Povo')}</strong>`
              : post.author_name ? `Por <strong>${escapeHtml(post.author_name)}</strong>` : ''}
            <time>${escapeHtml(formatDate(post.published_at))}</time>
          </p>
        </div>
      </a>
    </article>
  `
}

function renderOpinionCard(post: OpinionPost, baseUrl: string, compact = false): string {
  return renderEditorialArticleCard({
    title: post.title,
    url: getPostUrl(post),
    hat: post.opinion_type === 'column' && post.column_name ? post.column_name : opinionLabels[post.opinion_type],
    excerpt: post.excerpt,
    published_at: post.published_at,
    author_name: post.opinion_type === 'editorial' ? 'Diário do Povo' : post.author_name,
    featured_image_r2_key: post.featured_image_r2_key,
    size: compact ? 'compact' : 'standard'
  })
}

function renderEditorialStatement(post: OpinionPost, baseUrl: string): string {
  return `
    <article class="ed-editorial-statement">
      <a href="${escapeAttr(getPostUrl(post))}">
        <span class="ed-editorial-statement__mark" aria-hidden="true">DP</span>
        <div>
          <p class="ed-kicker">Editorial do Jornal</p>
          <h3>${escapeHtml(post.title)}</h3>
          ${post.excerpt ? `<p>${escapeHtml(post.excerpt)}</p>` : ''}
          <span class="ed-editorial-statement__meta">Posição institucional · ${escapeHtml(formatDate(post.published_at))}</span>
        </div>
      </a>
    </article>
  `
}

function renderColumnist(author: OpinionColumnist): string {
  const initials = author.name.substring(0, 2).toUpperCase()
  return `
    <article class="ed-opinion-person">
      <a class="ed-opinion-person__identity" href="/coluna/${escapeAttr(author.slug)}">
        <div class="ed-opinion-person__portrait">
          ${author.avatar_r2_key
            ? `<img src="/i/${escapeAttr(author.avatar_r2_key)}?w=280&h=340&fit=cover" alt="${escapeAttr(author.name)}" width="280" height="340" loading="lazy">`
            : `<span>${escapeHtml(initials)}</span>`}
        </div>
        <div>
          <p>${escapeHtml(author.column_name || 'Coluna')}</p>
          <h3>${escapeHtml(author.name)}</h3>
          ${author.column_description ? `<span>${escapeHtml(author.column_description)}</span>` : ''}
        </div>
      </a>
      ${author.latest_post_slug && author.latest_post_title ? `
        <a class="ed-opinion-person__latest" href="${escapeAttr(getPostUrl({ slug: author.latest_post_slug, published_at: author.latest_post_published_at }))}">
          <small>Mais recente</small>
          <strong>${escapeHtml(author.latest_post_title)}</strong>
        </a>
      ` : '<p class="ed-opinion-person__awaiting">Novas publicações em breve.</p>'}
    </article>
  `
}

function renderSectionHeader(kicker: string, title: string, href?: string): string {
  return `
    <div class="ed-opinion-section__header">
      <div><p class="ed-kicker">${escapeHtml(kicker)}</p><h2>${escapeHtml(title)}</h2></div>
      ${href ? `<a href="${escapeAttr(href)}">Ver todas →</a>` : ''}
    </div>
  `
}

export async function renderOpinionPage(
  c: Context<{ Bindings: Env; Variables: AppContext }>,
  options: OpinionPageOptions
): Promise<string> {
  const { baseUrl, siteName, navItems, googleAnalyticsId } = options
  const [posts, columnists] = await Promise.all([
    listPublishedOpinionPosts(c.env),
    listOpinionColumnists(c.env)
  ])

  const lead = posts[0] || null
  const secondary = posts.slice(1, 3)
  const editorials = posts.filter(post => post.opinion_type === 'editorial').slice(0, 3)
  const articles = posts.filter(post => post.opinion_type === 'article').slice(0, 4)
  const columns = posts.filter(post => post.opinion_type === 'column').slice(0, 4)
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `Opinião — ${siteName}`,
    url: `${baseUrl}/opiniao`,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: posts.slice(0, 20).map((post, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: getPostUrl(post, baseUrl),
        name: post.title
      }))
    }
  }).replace(/</g, '\\u003c')

  const bodyHtml = `
    <header class="ed-opinion-masthead">
      <div>
        <p class="ed-kicker">Ideias, análise e debate público</p>
        <h1>Opinião</h1>
      </div>
      <nav aria-label="Seções de Opinião">
        <a href="#editoriais">Editorial</a>
        <a href="#colunas">Colunas</a>
        <a href="#artigos">Artigos</a>
        <a href="#colunistas">Colunistas</a>
      </nav>
    </header>

    ${lead ? `
      <section class="ed-opinion-opening" aria-label="Destaques de Opinião">
        ${renderOpinionLead(lead, baseUrl)}
        ${secondary.length ? `<div class="ed-opinion-opening__secondary">${secondary.map(post => renderOpinionCard(post, baseUrl, true)).join('')}</div>` : ''}
      </section>
    ` : `
      <section class="ed-opinion-empty">
        <p class="ed-kicker">Nova editoria</p>
        <h2>Opinião com identidade e responsabilidade.</h2>
        <p>Os editoriais, artigos e colunas publicados pelo Diário do Povo aparecerão aqui, organizados por relevância e data.</p>
      </section>
    `}

    ${editorials.length ? `
      <section class="ed-opinion-section ed-opinion-section--editorials" id="editoriais">
        ${renderSectionHeader('A posição do Diário', 'Editorial do Jornal')}
        <div class="ed-editorials-grid">${editorials.map(post => renderEditorialStatement(post, baseUrl)).join('')}</div>
      </section>
    ` : ''}

    ${columns.length ? `
      <section class="ed-opinion-section" id="colunas">
        ${renderSectionHeader('Autores recorrentes', 'Colunas')}
        <div class="ed-opinion-story-grid">${columns.map(post => renderOpinionCard(post, baseUrl)).join('')}</div>
      </section>
    ` : ''}

    ${articles.length ? `
      <section class="ed-opinion-section" id="artigos">
        ${renderSectionHeader('Contribuições e perspectivas', 'Artigos')}
        <div class="ed-opinion-story-grid">${articles.map(post => renderOpinionCard(post, baseUrl)).join('')}</div>
      </section>
    ` : ''}

    ${columnists.length ? `
      <section class="ed-opinion-section" id="colunistas">
        ${renderSectionHeader('As vozes do jornal', 'Nossos colunistas')}
        <div class="ed-opinion-people-grid">${columnists.map(renderColumnist).join('')}</div>
      </section>
    ` : ''}

    ${posts.length > 3 ? `
      <section class="ed-opinion-section ed-opinion-latest">
        ${renderSectionHeader('Arquivo editorial', 'Últimas opiniões')}
        <div class="ed-listing">${posts.slice(3, 13).map(post => renderOpinionCard(post, baseUrl)).join('')}</div>
      </section>
    ` : ''}
  `

  return renderEditorialLayout({
    title: `Opinião — ${siteName}`,
    description: `Editoriais, artigos e colunas do ${siteName}. Ideias e análises claramente identificadas e assinadas.`,
    canonicalUrl: `${baseUrl}/opiniao`,
    nonce: c.get('cspNonce') || '',
    siteName,
    navItems,
    bodyHtml,
    baseUrl,
    googleAnalyticsId,
    ogImage: lead?.featured_image_r2_key ? `${baseUrl}/i/${lead.featured_image_r2_key}?w=1200` : undefined,
    lcpPreloadUrl: lead?.featured_image_r2_key ? `/i/${lead.featured_image_r2_key}?w=1200` : undefined,
    lcpSrcSet: lead?.featured_image_r2_key ? generateSrcSet(lead.featured_image_r2_key) : undefined,
    extraHeadHtml: `<script type="application/ld+json" nonce="${escapeAttr(c.get('cspNonce') || '')}">${jsonLd}</script>`
  })
}
