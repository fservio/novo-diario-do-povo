import type { Context } from 'hono'
import { z } from 'zod'
import type { AppContext, Env } from '../types'
import { getPostUrl } from '../utils/post'

export type PortalContext = Context<{ Bindings: Env; Variables: AppContext }>
export type PortalArticle = { id: number; slug: string; title: string; summary: string; body: string; published_at: string | null }
type DiaryArticle = { id: number; slug: string; title: string; summary: string | null; published_at: string }
export type CoverItem = { id: string; title: string; summary: string; source: 'Do Povo' | 'Diário do Povo'; href: string; publishedAt: string }
export const portalEditor = '/admin/do-povo'
export const portalPreview = portalEditor + '/previa'

const editionKey = 'network.do_povo.edition'
export const controlsKey = 'network.do_povo.controls'
export const sharedControlsKey = controlsKey + '.shared'
const id = z.string().regex(/^(?:portal|diario):[1-9][0-9]{0,14}$/)
export const controlsSchema = z.object({ nominee: id.or(z.literal('')), pin: id.or(z.literal('')), until: z.string().datetime().nullable() })
const decisionSchema = z.object({
  revision: z.string().uuid().nullable(),
  through: z.string().datetime(),
  lineup: z.array(id).min(1).max(4).refine(ids => new Set(ids).size === ids.length),
  reason: z.string().trim().min(8).max(500)
})
const editionSchema = decisionSchema.extend({ revision: z.string().uuid() })
const diaryEligible = "status = 'published' AND seo_noindex = 0 AND julianday(published_at) <= julianday(?)"

async function readSetting<T>(db: D1Database, key: string, schema: z.ZodType<T>): Promise<T | null> {
  const row = await db.prepare('SELECT value_json FROM settings WHERE key = ?').bind(key).first<{ value_json: string }>()
  if (!row) return null
  const data: unknown = JSON.parse(row.value_json)
  return schema.parse(data)
}

export function readCoverControls(db: D1Database) {
  return readSetting(db, controlsKey, controlsSchema)
}

function portalItem(article: PortalArticle, sharedCatalog: boolean): CoverItem {
  return {
    id: `portal:${article.id}`, title: article.title, summary: article.summary, source: 'Do Povo',
    href: sharedCatalog ? doPovoArticlePath(article.slug) : `${portalPreview}/materia/${encodeURIComponent(article.slug)}`, publishedAt: article.published_at!
  }
}

function diaryItem(article: DiaryArticle): CoverItem {
  return {
    id: `diario:${article.id}`, title: article.title, summary: article.summary || '', source: 'Diário do Povo',
    href: getPostUrl(article, 'https://diario.dopovo.com.br'), publishedAt: article.published_at
  }
}

export function doPovoArticlePath(slug: string) {
  return `/noticia/${encodeURIComponent(slug)}/`
}

export const doPovoPublished = "publication_id = 'do-povo' AND status = 'published' AND is_premium = 0 AND julianday(published_at) <= julianday(?)"

export async function loadDoPovoCover(db: D1Database, now = new Date().toISOString(), sharedCatalog = false) {
  const [edition, controls] = await Promise.all([
    readSetting(db, sharedCatalog ? editionKey + '.shared' : editionKey, editionSchema),
    sharedCatalog ? readSetting(db, sharedControlsKey, controlsSchema) : readCoverControls(db)
  ])
  const references = [controls?.nominee, controls?.pin, ...(edition?.lineup || [])].filter(Boolean) as string[]
  const ids = (source: string) => JSON.stringify(references.filter(ref => ref.startsWith(source + ':')).map(ref => Number(ref.split(':')[1])))
  const ownQuery = sharedCatalog
    ? `SELECT id, slug, title, excerpt AS summary, published_at FROM posts WHERE ${doPovoPublished} AND seo_noindex = 0`
    : 'SELECT id, slug, title, summary, published_at FROM do_povo_articles WHERE published_at <= ?'
  const diaryQuery = `SELECT id, slug, title, excerpt AS summary, published_at FROM posts
    WHERE ${diaryEligible}${sharedCatalog ? " AND publication_id = 'diario'" : ''}`
  const [own, latest, ownReferences, diaryReferences] = await Promise.all([
    db.prepare(`${ownQuery} ORDER BY published_at DESC, id DESC LIMIT 12`)
      .bind(now).all<PortalArticle>(),
    db.prepare(`${diaryQuery} ORDER BY published_at DESC, id DESC LIMIT 24`)
      .bind(now).all<DiaryArticle>(),
    db.prepare(`${ownQuery} AND id IN (SELECT value FROM json_each(?))`)
      .bind(now, ids('portal')).all<PortalArticle>(),
    db.prepare(`${diaryQuery} AND id IN (SELECT value FROM json_each(?))`)
      .bind(now, ids('diario')).all<DiaryArticle>()
  ])
  const ownItems = own.results.map(article => portalItem(article, sharedCatalog))
  const latestItems = latest.results.map(diaryItem)
  const candidates = new Map([
    ...ownItems, ...latestItems, ...ownReferences.results.map(article => portalItem(article, sharedCatalog)), ...diaryReferences.results.map(diaryItem)
  ].map(item => [item.id, item]))
  const pinned = controls?.until && controls.until > now ? candidates.get(controls.pin) : undefined
  const selected = edition?.lineup.map(ref => candidates.get(ref)).filter((item): item is CoverItem => Boolean(item)) || []
  const top = [...new Map([...(pinned ? [pinned] : []), ...selected].map(item => [item.id, item])).values()]
  return { edition, controls, candidates, pinned, top: top.slice(0, 4), own: ownItems, latest: latestItems }
}

export function handleDoPovoWorkflow(c: PortalContext) {
  return applyDoPovoWorkflow(c, false)
}

export function handleSharedDoPovoWorkflow(c: PortalContext) {
  return applyDoPovoWorkflow(c, true)
}

async function applyDoPovoWorkflow(c: PortalContext, sharedCatalog: boolean) {
  c.header('Cache-Control', 'private, no-store')
  const operation = c.req.param('operation')
  const now = new Date().toISOString()
  const db = c.env.DB
  const state = await loadDoPovoCover(db, now, sharedCatalog)
  const revision = state.edition?.revision ?? null
  if (operation === 'candidates') {
    return c.json({
      through: now, revision, current: state.top.map(item => item.id),
      pinned: state.pinned?.id ?? null, nominated: state.controls?.nominee || null,
      candidates: [...state.candidates.values()]
    })
  }
  if (operation !== 'apply') return c.notFound()
  const parsed = decisionSchema.safeParse(await c.req.json().catch((): null => null))
  if (!parsed.success) return c.json({ error: 'Composição inválida.' }, 400)
  const input = parsed.data
  if (input.revision !== revision || input.through > now ||
    Date.parse(now) - Date.parse(input.through) > 15 * 60_000 ||
    (state.edition && input.through <= state.edition.through) ||
    input.lineup.some(ref => !state.candidates.has(ref))) {
    return c.json({ error: 'Atualize as candidatas e monte a capa novamente.' }, 409)
  }
  const edition = { ...input, revision: crypto.randomUUID() }
  const key = sharedCatalog ? editionKey + '.shared' : editionKey
  const saved = await db.prepare(`INSERT INTO settings(key,value_json,scope,updated_at)
    SELECT ?,?,'private',? WHERE ? IS NULL OR EXISTS(SELECT 1 FROM settings WHERE key=?)
    ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at
    WHERE json_extract(settings.value_json,'$.revision')=? RETURNING key`)
    .bind(key, JSON.stringify(edition), now, revision, key, revision).first()
  if (!saved) return c.json({ error: 'Outra execução atualizou a capa.' }, 409)
  return c.json({ revision: edition.revision, lineup: edition.lineup })
}
