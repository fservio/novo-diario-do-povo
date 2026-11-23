import type { Context } from 'hono'
import type { AppContext, Env } from '../types'
import { getPostUrl } from '../utils/post'
import prototype from '../../../prototipos/mundo-em-edicao/index.html?raw'
import style from '../../../prototipos/mundo-em-edicao/style.css?raw'
import browserScript from '../../../public/static/mundo-em-edicao.js?raw'

type WorldContext = Context<{ Bindings: Env; Variables: AppContext }>
type PublicPost = { id: number; title: string; slug: string; published_at: string; category: string }
type PublicUpdate = { post_id: number; title: string | null; published_at: string }

async function publicUpdates(db: D1Database, ids: number[], at: string) {
  if (!ids.length) return []
  const slots = ids.map((_, index) => '?' + (index + 1)).join(',')
  const cutoff = '?' + (ids.length + 1)
  const metadata = await db.prepare(`
    SELECT name FROM sqlite_master WHERE name = ?1
  `).bind('editorial_post_updates').first<{ name: string }>()
  const editorial = metadata ? `
    UNION ALL
    SELECT r.post_id, 'Atualização editorial aplicada' AS title, r.applied_at AS published_at
    FROM editorial_post_updates r JOIN posts p ON p.id = r.post_id
    WHERE r.post_id IN (${slots}) AND julianday(r.applied_at) BETWEEN julianday(p.published_at) AND julianday(${cutoff})
  ` : ''
  const result = await db.prepare(`
    SELECT * FROM (
      SELECT u.post_id, u.title, u.published_at
      FROM live_blog_updates u JOIN posts p ON p.id = u.post_id
      WHERE u.post_id IN (${slots}) AND p.template = 'liveblog'
        AND julianday(u.published_at) BETWEEN julianday(p.published_at) AND julianday(${cutoff})
      ${editorial}
    )
    ORDER BY julianday(published_at) DESC LIMIT 12
  `).bind(...ids, at).all<PublicUpdate>()
  return result.results.map(update => ({
    postId: update.post_id, at: timestamp(update.published_at), title: update.title || 'Atualização da cobertura'
  }))
}

const publicFilter = `p.status = 'published' AND p.publication_id = 'diario'
  AND p.seo_noindex = 0 AND p.published_at IS NOT NULL
  AND p.published_at <= substr(?1, 1, 19) || 'Z' AND julianday(p.published_at) <= julianday(?1)`
const columns = 'p.id, p.title, p.slug, p.published_at, c.name AS category'

function timestamp(value: string) {
  const iso = value.replace(' ', 'T')
  return Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso) ? iso : iso + 'Z')
}

function article(post: PublicPost) {
  return {
    id: post.id, title: post.title, category: post.category,
    at: timestamp(post.published_at), url: getPostUrl(post)
  }
}

export function renderWorld(c: WorldContext) {
  const html = prototype
    .replace('<body>', '<body data-world="cms">')
    .replace('href="style.css"', 'href="/mundo-em-edicao/estilo.css"')
    .replace('src="app.js"', 'src="/mundo-em-edicao/interface.js"')
    .replace('href="https://diario.dopovo.com.br/">DIÁRIO DO POVO', 'href="/"><img width="110" src="/static/logo-dp.png" alt="Diário do Povo">')
    .replace('Demonstração · dados fictícios', 'Registros públicos do Diário')
    .replace('Selecione um acontecimento para abrir seu percurso.', 'Acompanhe as publicações recentes e as atualizações de coberturas ao vivo.')
    .replace('O percurso dos acontecimentos', 'O que o Diário publica')
    .replace('https://diario.dopovo.com.br/ultimas', '/ultimas')
    .replace(/\s*<dialog[\s\S]*?<\/dialog>/, '')
  return c.html(html)
}

export function worldStyle(c: WorldContext) {
  return c.text(style, 200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'public, max-age=300' })
}

export function worldScript(c: WorldContext) {
  return c.text(browserScript, 200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=300' })
}

export async function worldSnapshot(c: WorldContext) {
  const now = Date.now()
  const requested = c.req.query('at')
  const time = requested === undefined ? now : Number(requested)
  if (!Number.isSafeInteger(time) || time < 0 || time > now) return c.json({ error: 'Horário inválido.' }, 400)
  const at = new Date(time).toISOString()
  const posts = await c.env.DB.prepare(`
    WITH indexed_recent AS (
      SELECT p.published_at
      FROM posts p JOIN categories c ON c.id = p.category_id
      WHERE ${publicFilter}
      ORDER BY p.published_at DESC LIMIT 9
    )
    SELECT ${columns} FROM posts p JOIN categories c ON c.id = p.category_id
    WHERE ${publicFilter}
      AND p.published_at >= (SELECT substr(MIN(published_at), 1, 10) FROM indexed_recent)
    ORDER BY julianday(p.published_at) DESC, p.id DESC LIMIT 9
  `).bind(at).all<PublicPost>()
  const updates = await publicUpdates(c.env.DB, posts.results.map(post => post.id), at)
  return c.json({ at: time, posts: posts.results.map(article), updates }, 200, { 'Cache-Control': 'no-store' })
}

export async function worldArticle(c: WorldContext) {
  const now = Date.now()
  const id = Number(c.req.param('id'))
  const time = Number(c.req.query('at') ?? now)
  if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(time) || time < 0 || time > now) {
    return c.json({ error: 'Consulta inválida.' }, 400)
  }
  const at = new Date(time).toISOString()
  const post = await c.env.DB.prepare(`
    SELECT ${columns}, p.original_link FROM posts p JOIN categories c ON c.id = p.category_id
    WHERE p.id = ?2 AND ${publicFilter}
  `).bind(at, id).first<PublicPost & { original_link: string | null }>()
  if (!post) return c.json({ error: 'Matéria indisponível.' }, 404)
  const related = c.env.DB.prepare(`
    WITH links AS (
      SELECT related_post_id AS id FROM post_related_articles WHERE post_id = ?2 AND julianday(created_at) <= julianday(?1)
      UNION
      SELECT post_id AS id FROM post_related_articles WHERE related_post_id = ?2 AND julianday(created_at) <= julianday(?1)
    )
    SELECT ${columns}, p.original_link
    FROM links JOIN posts p ON p.id = links.id JOIN categories c ON c.id = p.category_id
    WHERE ${publicFilter}
    ORDER BY julianday(p.published_at) DESC, p.id DESC LIMIT 5
  `).bind(at, id).all<PublicPost & { original_link: string | null }>()
  const [edges, history] = await Promise.all([related, publicUpdates(c.env.DB, [id], at)])
  return c.json({
    post: article(post),
    related: edges.results.map(relatedPost => ({
      ...article(relatedPost),
      relationship: relatedPost.original_link?.endsWith('/ia/relacionada/v1/' + id) ? 'Matéria complementar'
        : post.original_link?.endsWith('/ia/relacionada/v1/' + relatedPost.id) ? 'Notícia de origem'
          : 'Vínculo registrado pelo Diário'
    })),
    updates: history
  }, 200, { 'Cache-Control': 'no-store' })
}
