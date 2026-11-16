import { z } from 'zod'
import { renderAdminLayout } from '../admin/ui'
import { normalizeRole } from '../db/users'
import { escapeHtml, generateSrcSet } from './layout'
import { sanitizeHtml } from '../render/sanitize'
import { doPovoArticlePath, doPovoPublished } from './do-povo-cover'
import { controlsKey, controlsSchema, loadDoPovoCover, portalEditor, portalPreview, sharedControlsKey, type CoverItem, type PortalArticle, type PortalContext } from './do-povo-cover'

const articleFields = z.object({
  id: z.string().regex(/^(?:[1-9][0-9]{0,14})?$/),
  slug: z.string().max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(400),
  body: z.string().trim().min(1).max(20000),
  action: z.enum(['draft', 'publish', 'unpublish'])
})

async function save(c: PortalContext, sharedCatalog: boolean) {
  const db = c.env.DB
  const form = await c.req.parseBody()
  if (form.action === 'cover') {
    const duration = z.enum(['30', '60', '120']).safeParse(form.duration)
    const controls = controlsSchema.safeParse({
      nominee: form.nominee,
      pin: form.pin,
      until: form.pin && duration.success ? new Date(Date.now() + Number(duration.data) * 60_000).toISOString() : null
    })
    if (!controls.success || !duration.success) return c.text('Seleção de capa inválida.', 422)
    const { candidates } = await loadDoPovoCover(db, undefined, sharedCatalog)
    const { nominee, pin } = controls.data
    if ([nominee, pin].some(ref => ref && !candidates.has(ref))) {
      return c.text('A seleção inclui uma matéria indisponível.', 422)
    }
    await db.prepare(`INSERT INTO settings(key,value_json,scope,updated_at)
      VALUES (?,?,'private',CURRENT_TIMESTAMP) ON CONFLICT(key)
      DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at`)
      .bind(sharedCatalog ? sharedControlsKey : controlsKey, JSON.stringify(controls.data)).run()
    return c.redirect(portalPreview, 303)
  }

  if (sharedCatalog) return c.text('Use o editor de matérias do CMS.', 422)
  const result = articleFields.safeParse(form)
  if (!result.success) return c.text('Confira os campos da matéria.', 422)
  const { id, slug, title, summary, body, action } = result.data
  if (!id && action === 'unpublish') return c.text('Matéria não encontrada.', 404)
  const publishedAt = action === 'publish' ? new Date().toISOString() : null
  const collision = await db.prepare('SELECT id FROM do_povo_articles WHERE slug = ? AND id != ?')
    .bind(slug, Number(id)).first()
  if (collision) return c.text('Já existe uma matéria com esse endereço.', 409)
  const saved = id
    ? await db.prepare(`UPDATE do_povo_articles
        SET title=?, summary=?, body=?, published_at=CASE WHEN ?='unpublish' THEN NULL ELSE COALESCE(published_at, ?) END,
        updated_at=CURRENT_TIMESTAMP WHERE id=? RETURNING id`)
      .bind(title, summary, body, action, publishedAt, Number(id)).first<{ id: number }>()
    : await db.prepare(`INSERT INTO do_povo_articles (slug,title,summary,body,published_at)
        VALUES (?,?,?,?,?) ON CONFLICT(slug) DO NOTHING RETURNING id`)
      .bind(slug, title, summary, body, publishedAt).first<{ id: number }>()
  if (!saved) return c.text(id ? 'Matéria não encontrada.' : 'Endereço em uso.', id ? 404 : 409)
  return c.redirect(`${portalEditor}?materia=${saved.id}`, 303)
}

export function handleDoPovoPreview(c: PortalContext) {
  return renderDoPovoPreview(c, false)
}

export function handleSharedDoPovoPreview(c: PortalContext) {
  return renderDoPovoPreview(c, true)
}

async function renderDoPovoPreview(c: PortalContext, sharedCatalog: boolean) {
  const user = c.get('adminUser')
  if (!user || !['director', 'editor'].includes(normalizeRole(user.role))) {
    return c.text('Acesso restrito à edição.', 403)
  }
  c.header('Cache-Control', 'private, no-store')
  c.header('X-Robots-Tag', 'noindex, nofollow')
  const db = c.env.DB
  if (c.req.method === 'POST') return save(c, sharedCatalog)
  if (c.req.path === portalEditor) {
    const requested = c.req.query('materia')
    const [articles, article, state] = await Promise.all([
      sharedCatalog ? null : db.prepare('SELECT id, title, published_at FROM do_povo_articles ORDER BY id DESC LIMIT 50').all<PortalArticle>(),
      !sharedCatalog && requested ? db.prepare('SELECT * FROM do_povo_articles WHERE id=?').bind(Number(requested)).first<PortalArticle>() : null,
      loadDoPovoCover(db, undefined, sharedCatalog)
    ])
    if (!sharedCatalog && requested && !article) return c.notFound()
    const csrf = `<input type="hidden" name="csrf" value="${escapeHtml(c.get('csrfToken'))}">`
    const options = (emptyLabel: string, current?: string) => `<option value="">${emptyLabel}</option>` +
      [...state.candidates.values()].map(item => `<option value="${item.id}" ${item.id === current ? 'selected' : ''}>${escapeHtml(item.source + ' — ' + item.title)}</option>`).join('')
    const pinUntil = state.pinned && state.controls?.until
      ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Fortaleza' }).format(new Date(state.controls.until))
      : null
    return c.html(renderAdminLayout({
      title: 'Redação do Do Povo', user,
      bodyHtml: `<link rel="stylesheet" href="/static/do-povo-curadoria.css">
        <div class="dp-curadoria">
        <header class="dp-curadoria__header">
          <h1>Redação do Do Povo</h1>
          <nav aria-label="Atalhos da redação">
            <a href="${portalPreview}">Ver prévia da capa</a>
            <a href="${sharedCatalog ? '/admin/posts/new' : portalEditor}">Nova matéria</a>
          </nav>
        </header>
        ${articles ? `<section class="stat-card"><h2>Matérias</h2>
        <ul>${articles.results.map(item => `<li><a href="${portalEditor}?materia=${item.id}">${escapeHtml(item.title)}</a> · ${item.published_at ? 'Publicada em homologação' : 'Rascunho'}</li>`).join('')}</ul>
        <form method="post" action="${portalEditor}">
          ${csrf}<input type="hidden" name="id" value="${article?.id || ''}">
          <p><label>Endereço da matéria<br><input name="slug" value="${escapeHtml(article?.slug)}" maxlength="120" pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="titulo-da-materia" ${article ? 'readonly' : ''} required></label></p>
          <p><label>Título<br><input name="title" maxlength="160" required value="${escapeHtml(article?.title)}"></label></p>
          <p><label>Resumo<br><textarea name="summary" rows="3" maxlength="400" required>${escapeHtml(article?.summary)}</textarea></label></p>
          <p><label>Texto da matéria<br><textarea name="body" rows="12" maxlength="20000" required>${escapeHtml(article?.body)}</textarea></label></p>
          ${article?.published_at
            ? '<button name="action" value="publish">Atualizar matéria</button> <button name="action" value="unpublish">Retirar da homologação</button>'
            : '<button name="action" value="draft">Salvar rascunho</button> <button name="action" value="publish">Publicar em homologação</button>'}
        </form></section>` : ''}
        <form method="post" action="${portalEditor}" class="dp-curadoria__form" aria-labelledby="dp-cover-title">
          ${csrf}<input type="hidden" name="action" value="cover">
          <header class="dp-curadoria__intro">
            <h2 id="dp-cover-title">Curadoria da capa</h2>
            <p>Defina a manchete que abre a capa ou indique uma matéria para a próxima seleção da IA.</p>
          </header>
          ${state.pinned ? `<div class="dp-curadoria__status">
            <span>Manchete fixada até <time datetime="${escapeHtml(state.controls?.until)}">${pinUntil}</time></span>
            <strong>${escapeHtml(state.pinned.title)}</strong>
          </div>` : ''}
          <div class="dp-curadoria__pin">
            <div class="dp-curadoria__field">
              <label for="dp-cover-pin">Fixar manchete</label>
              <select id="dp-cover-pin" name="pin" aria-describedby="dp-pin-hint">${options('Sem manchete fixada', state.pinned?.id)}</select>
              <small id="dp-pin-hint">A matéria fica no topo durante o período escolhido.</small>
            </div>
            <div class="dp-curadoria__field">
              <label for="dp-cover-duration">Duração</label>
              <select id="dp-cover-duration" name="duration">
                <option value="30">30 minutos</option><option value="60">1 hora</option><option value="120">2 horas</option>
              </select>
            </div>
          </div>
          <div class="dp-curadoria__field dp-curadoria__nominee">
            <label for="dp-cover-nominee">Indicar à IA</label>
            <select id="dp-cover-nominee" name="nominee" aria-describedby="dp-nominee-hint">${options('Sem indicação', state.controls?.nominee)}</select>
            <small id="dp-nominee-hint">A IA considera a indicação ao montar a próxima capa.</small>
          </div>
          <footer class="dp-curadoria__actions"><button type="submit">Salvar curadoria</button></footer>
        </form>
        ${state.edition ? `<aside class="dp-curadoria__decision"><h2>Última decisão da IA</h2><p>${escapeHtml(state.edition.reason)}</p></aside>` : ''}
        </div>`
    }))
  }

  const slug = c.req.param('slug')
  if (slug && sharedCatalog) {
    const post = await db.prepare(`SELECT title, excerpt, content FROM posts WHERE ${doPovoPublished} AND slug = ?`)
      .bind(new Date().toISOString(), slug).first<{ title: string; excerpt: string | null; content: string }>()
    if (!post) return c.text('Matéria não encontrada.', 404)
    return c.html(layout(articleBody(post.title, post.excerpt, sanitizeHtml(post.content)), post.title, { home: portalPreview }))
  }
  if (slug) {
    const article = await db.prepare('SELECT * FROM do_povo_articles WHERE slug=? AND published_at <= ?')
      .bind(slug, new Date().toISOString()).first<PortalArticle>()
    if (!article) return c.notFound()
    return c.html(layout(`<main class="article"><article>
      <h1>${escapeHtml(article.title)}</h1><p class="summary">${escapeHtml(article.summary)}</p>
      <div class="body">${escapeHtml(article.body)}</div></article></main>`, article.title))
  }

  const cover = await loadDoPovoCover(db, undefined, sharedCatalog)
  return c.html(await renderCover(cover, sharedCatalog ? { home: portalPreview, preview: true } : undefined, sharedCatalog ? db : undefined))
}

const portalOrigin = 'https://dopovo.com.br'
const diaryOrigin = 'https://diario.dopovo.com.br'
const readerRoutes = new Map([
  ['/portal/login', '/portal/login'],
  ['/portal/register', '/portal/register'],
  ['/portal', '/conta'],
  ['/portal/account', '/conta'],
  ['/conta', '/conta'],
  ['/assinar', '/assinar'],
  ['/assinatura', '/assinar']
])

export function renderDoPovoDraft(post: { title: string; excerpt?: string | null; content: string }) {
  return layout(articleBody(post.title, post.excerpt, sanitizeHtml(post.content)), post.title, { home: '/' })
}

export async function handleDoPovoPublic(c: PortalContext) {
  const notFound = () => c.html(layout('<main class="article"><h1>Página não encontrada</h1></main>', 'Página não encontrada', { home: '/' }), 404)
  const path = c.req.path
  if (/^\/(?:admin\/)?login\/?$/.test(path)) {
    const editorLogin = diaryOrigin + '/admin/login'
    if (c.req.method === 'GET' || c.req.method === 'HEAD') return c.redirect(editorLogin, 302)
    if (c.req.method === 'POST') return c.redirect(editorLogin, 303)
  }
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') return notFound()
  c.header('Cache-Control', 'no-store')
  const readerPath = readerRoutes.get(path.replace(/\/$/, ''))
  if (readerPath) return c.redirect(diaryOrigin + readerPath, 302)
  const now = new Date().toISOString()
  const db = c.env.DB
  if (path === '/') {
    return c.html(await renderCover(await loadDoPovoCover(db, now, true), { home: '/', canonical: portalOrigin + '/' }, db))
  }
  if (path === '/robots.txt') {
    return c.text(`User-agent: *\nDisallow: /admin/\nSitemap: ${portalOrigin}/sitemap.xml\nSitemap: ${portalOrigin}/sitemap-news.xml\n`)
  }
  if (path === '/ads.txt') {
    const { getSetting } = await import('../db')
    const value = await getSetting(c.env, 'do_povo.ads_txt', 'public')
    const text = typeof value === 'string' ? value.replace(/^\uFEFF/, '').trim() : ''
    return text ? c.text(text + '\n') : notFound()
  }
  if (path === '/sitemap-index.xml') {
    return c.body(`<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${portalOrigin}/sitemap.xml</loc></sitemap><sitemap><loc>${portalOrigin}/sitemap-news.xml</loc></sitemap></sitemapindex>`, 200, { 'Content-Type': 'application/xml; charset=utf-8' })
  }
  if (path === '/sitemap.xml' || path === '/sitemap-news.xml') {
    const news = path === '/sitemap-news.xml'
    const rows = await db.prepare(`SELECT slug, title, published_at, updated_at FROM posts
      WHERE ${doPovoPublished} AND seo_noindex = 0
      ${news ? "AND template = 'article' AND opinion_type = 'news' AND julianday(published_at) >= julianday(?) - 2" : ''}
      ORDER BY published_at DESC LIMIT ${news ? 1000 : 50000}`)
      .bind(...(news ? [now, now] : [now])).all<{ slug: string; title: string; published_at: string; updated_at: string }>()
    const urls = rows.results.map(post => {
      const url = escapeHtml(portalOrigin + doPovoArticlePath(post.slug))
      const date = new Date(news ? post.published_at : post.updated_at)
      const dateXml = Number.isNaN(date.getTime()) ? '' : news
        ? `<news:publication_date>${date.toISOString()}</news:publication_date>`
        : `<lastmod>${date.toISOString()}</lastmod>`
      return `<url><loc>${url}</loc>${news
        ? `<news:news><news:publication><news:name>Do Povo</news:name><news:language>pt</news:language></news:publication>${dateXml}<news:title>${escapeHtml(post.title)}</news:title></news:news>`
        : dateXml}</url>`
    })
    return c.body(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${news ? ' xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"' : ''}>${urls.join('')}</urlset>`, 200, { 'Content-Type': 'application/xml; charset=utf-8' })
  }
  const match = /^\/noticia\/([a-z0-9-]+)\/?$/.exec(path)
  if (!match) return notFound()
  const post = await db.prepare(`SELECT slug, title, excerpt, content, seo_noindex FROM posts
    WHERE ${doPovoPublished} AND slug = ?`)
    .bind(now, match[1]).first<{ slug: string; title: string; excerpt: string | null; content: string; seo_noindex: number }>()
  if (!post) return notFound()
  const canonicalPath = doPovoArticlePath(post.slug)
  if (path !== canonicalPath) return c.redirect(canonicalPath, 301)
  if (post.seo_noindex) c.header('X-Robots-Tag', 'noindex')
  return c.html(layout(articleBody(post.title, post.excerpt, sanitizeHtml(post.content)), post.title, {
    home: '/', canonical: portalOrigin + canonicalPath, description: post.excerpt || undefined
  }))
}

function articleBody(title: string, summary: string | null | undefined, html: string) {
  return `<main class="article"><article><h1>${escapeHtml(title)}</h1>
    <p class="summary">${escapeHtml(summary)}</p><div class="body">${html}</div></article></main>`
}

type LayoutOptions = { home: string; canonical?: string; description?: string; preview?: boolean }

async function renderCover(state: Awaited<ReturnType<typeof loadDoPovoCover>>, options?: LayoutOptions, db?: D1Database) {
  const hrefFor = (item: CoverItem) => {
    const href = options?.preview && item.id.startsWith('portal:')
      ? portalPreview + '/materia/' + item.href.split('/')[2]
      : item.href
    return escapeHtml(href)
  }
  const link = (item: CoverItem) => `<a href="${hrefFor(item)}">${escapeHtml(item.title)}</a>`
  const source = (item: CoverItem) => item.source === 'Diário do Povo'
    ? '<span class="source">Diário do Povo</span>' : ''
  const [lead, ...ranked] = state.top.length ? state.top : [...state.own, ...state.latest]
  if (!lead) return layout('<main id="conteudo" class="cover"><p>Ainda não há matérias publicadas.</p></main>', undefined, options)

  const candidates = [...new Map([...ranked, ...state.own, ...state.latest].map(item => [item.id, item])).values()]
    .filter(item => item.id !== lead.id)
  const secondary = state.top.length > 1 ? ranked : candidates.slice(0, candidates.length > 1 ? 1 : 0)
  const displayed = new Set([lead.id, ...secondary.map(item => item.id)])
  const latest = [...state.own, ...state.latest]
    .filter(item => !displayed.has(item.id))
    .sort((first, second) => Date.parse(second.publishedAt) - Date.parse(first.publishedAt))
    .slice(0, 9)
  const photo = db ? await db.prepare('SELECT m.r2_key FROM posts p JOIN media m ON m.id = p.cover_media_id WHERE p.id = ?')
    .bind(Number(lead.id.split(':')[1])).first<{ r2_key: string }>() : null
  const image = photo?.r2_key
    ? `<a class="hero-image" href="${hrefFor(lead)}" aria-label="${escapeHtml(lead.title)}">
      <img src="/i/${escapeHtml(photo.r2_key)}?w=800" srcset="${generateSrcSet(photo.r2_key)}"
        sizes="(max-width: 720px) calc(100vw - 32px), (max-width: 1170px) 64vw, 752px"
        width="1200" height="675" fetchpriority="high" alt="">
    </a>` : ''
  return layout(`<main id="conteudo" class="cover cover-grid">
    <div class="cover-main">
      <article class="hero">
        <div class="hero-copy">${source(lead)}<h1>${link(lead)}</h1>
          ${lead.summary ? `<p class="summary">${escapeHtml(lead.summary)}</p>` : ''}
        </div>
        ${image}
      </article>
      ${secondary.length ? `<section class="highlights" aria-labelledby="destaques"><h2 id="destaques">Destaques</h2>
        <div class="highlights-list">${secondary.map(item => `<article>${source(item)}<h3>${link(item)}</h3>
          ${item.summary ? `<p>${escapeHtml(item.summary)}</p>` : ''}
        </article>`).join('')}</div></section>` : ''}
    </div>
    ${latest.length ? `<aside class="cover-section" aria-labelledby="ultimas"><h2 id="ultimas">Últimas notícias</h2>
      <ul>${latest.map(item => `<li>${source(item)}${link(item)}</li>`).join('')}</ul></aside>` : ''}
  </main>`, undefined, options)
}

function layout(body: string, title?: string, options?: LayoutOptions) {
  return `<!doctype html>
<html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title ? escapeHtml(title) + ' | ' : ''}Do Povo</title>
${options?.canonical ? `<link rel="canonical" href="${escapeHtml(options.canonical)}"><meta property="og:site_name" content="Do Povo">` : ''}
${options?.description ? `<meta name="description" content="${escapeHtml(options.description)}">` : ''}
<link rel="stylesheet" href="/static/do-povo-preview.css">
</head><body>
<header class="masthead"><div class="masthead-inner">
  <a class="wordmark" href="${options?.home || portalPreview}" aria-label="Do Povo, início">DO <span>POVO</span></a>
  ${options?.canonical ? '<a class="account" href="/conta">Minha conta</a>'
    : options ? '' : `<a href="${portalEditor}">Redação</a>`}
</div>${options?.canonical ? '<nav class="masthead-nav" aria-label="Navegação editorial"><a href="/">Capa</a><a href="https://diario.dopovo.com.br/">Diário do Povo</a></nav>' : ''}</header>
${body}</body></html>`
}
