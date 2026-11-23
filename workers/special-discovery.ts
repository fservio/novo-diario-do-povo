import type { D1Database } from '@cloudflare/workers-types'

const publicPost = "publication_id='diario' AND status='published' AND seo_noindex=0"
const revision = 'max(coalesce(unixepoch(updated_at),0),unixepoch(published_at))'
const projection = 'id,title,original_link,published_at,substr(coalesce(nullif(excerpt,\'\'),content),1,1800) AS excerpt'
type Evidence = {id:number; title:string; original_link:string|null; published_at:string; excerpt:string}

export function isFederalTransfer(text: string) {
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
  return /\b(federa(?:l|is)|uniao|ministerio)\b/.test(normalized)
    && /\b(repasses?|transferencias?|convenios?|emendas?)\b/.test(normalized)
}

export async function discoverSpecialStories(db: D1Database) {
  const cursor = await db.prepare("SELECT seen_at,post_id FROM special_discovery_cursor WHERE pilot='repasses'").first<{seen_at:number;post_id:number}>()
  if (!cursor) throw new Error('Cursor da Redação Especial indisponível.')
  // Leave the current second open so concurrent edits cannot fall behind the cursor.
  const batch = await db.prepare(`SELECT ${projection},${revision} AS revision_at FROM posts
    WHERE ${publicPost} AND (${revision},id)>(?,?) AND ${revision}<unixepoch()
    ORDER BY ${revision},id LIMIT 25`).bind(cursor.seen_at,cursor.post_id).all<Evidence & {revision_at:number}>()
  const writes = []
  for (const item of batch.results) {
    const {revision_at,...source} = item
    if (!isFederalTransfer(source.title+' '+source.excerpt)) {
      writes.push(db.prepare(`UPDATE special_story_queue SET revision_at=?,state='retirada',recorded_at=unixepoch()
        WHERE post_id=? AND revision_at<? AND state!='retirada'`).bind(revision_at,item.id,revision_at))
      continue
    }
    const related = await db.prepare(`SELECT ${projection} FROM posts WHERE ${publicPost}
      AND julianday(published_at)<=julianday(?) AND id IN (
        SELECT related_post_id FROM post_related_articles WHERE post_id=?
        UNION SELECT post_id FROM post_related_articles WHERE related_post_id=?
      ) ORDER BY published_at DESC,id DESC LIMIT 5`).bind(source.published_at,item.id,item.id).all<Evidence>()
    const question = 'Qual é a etapa documentada do repasse e quais localidades são beneficiadas?'
    const evidence = JSON.stringify([source,...related.results])
    writes.push(db.prepare(`INSERT INTO special_story_queue(post_id,revision_at,question,evidence_json,state)
      VALUES(?,?,?,?,'aguarda_apuracao') ON CONFLICT(post_id) DO UPDATE SET
      revision_at=excluded.revision_at,question=excluded.question,evidence_json=excluded.evidence_json,
      state=excluded.state,recorded_at=unixepoch()
      WHERE excluded.revision_at>special_story_queue.revision_at
      AND (excluded.evidence_json!=special_story_queue.evidence_json OR special_story_queue.state='retirada')`)
      .bind(item.id,revision_at,question,evidence))
  }
  const last = batch.results.at(-1)
  if (last) {
    writes.push(db.prepare(`UPDATE special_discovery_cursor SET seen_at=?,post_id=?
      WHERE pilot='repasses' AND (seen_at,post_id)<(?,?)`).bind(last.revision_at,last.id,last.revision_at,last.id))
    await db.batch(writes)
  }
}

export default {
  async scheduled(_event: ScheduledController, env: { DB: D1Database }, ctx: ExecutionContext) {
    ctx.waitUntil(discoverSpecialStories(env.DB))
  }
}
