import type { MiddlewareHandler } from 'hono'
import type { Env, AppContext } from '../types'

export const HOME_DATA_CACHE_KEY = 'home_data_v4'
export const HOME_CACHE_REVISION_SETTING = 'home.cache_revision'

// Read the revision directly from D1: KV invalidation can take time to propagate.
export async function getHomeDataCacheKey(env: Env): Promise<string> {
  const revision = await env.DB.prepare(`SELECT
    (SELECT value_json FROM settings WHERE key=?) AS editorial,
    (SELECT json_extract(value_json,'$.lineup') FROM settings WHERE key='home.ai_edition') AS lineup,
    (SELECT json_extract(value_json,'$.sections') FROM settings WHERE key='home.ai_edition') AS sections,
    (SELECT json_extract(value_json,'$.id') FROM settings WHERE key='home.hero_pin' AND json_extract(value_json,'$.until')>?) AS pin`)
    .bind(HOME_CACHE_REVISION_SETTING,new Date().toISOString()).first<{editorial:string|null;lineup:string|null;sections:string|null;pin:number|null}>()
  const editorialKey = `${HOME_DATA_CACHE_KEY}:${revision?.editorial || 'initial'}`
  const editionKey=revision?.lineup ? `${editorialKey}:${revision.lineup}:${revision.sections||'{}'}` : editorialKey
  return revision?.pin?`${editionKey}:pin:${revision.pin}`:editionKey
}

// Keep the long read cache, but expire it after editorial writes have completed.
export const invalidateHomeAfterEditorialWrite: MiddlewareHandler<{
  Bindings: Env; Variables: AppContext
}> = async (c, next) => {
  await next()
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.req.method)) return
  if (c.res.status < 200 || c.res.status >= 400) return

  const path = c.req.path
  const changesHome = /^\/(admin\/(posts|categories|tags|settings)|api\/n8n\/posts)(\/|$)/.test(path)
    || /^\/api\/admin\/(posts|categories|tags|live-updates)(\/|$)/.test(path)
    || /^\/admin\/live\/\d+\/toggle-status$/.test(path)
    || path === '/api/admin/settings'
    || (path === '/api/n8n/tempo-editorial/editorial-publish' && c.res.headers.get('X-Home-Changed')==='1')
    || /^\/admin\/redacao-ia\/pautas\/\d+\/(aplicar|aprovar)$/.test(path)
  if (!changesHome) return
  const location = c.res.headers.get('Location')
  if (location && new URL(location, c.req.url).searchParams.has('error')) return

  try {
    await c.env.DB.prepare(`
      INSERT INTO settings (key, value_json, scope, updated_at)
      VALUES (?, ?, 'private', datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
    `).bind(HOME_CACHE_REVISION_SETTING, JSON.stringify(crypto.randomUUID())).run()
  } catch (error) {
    // A cache outage must not turn a completed editorial save into a failed save.
    console.error('[Home cache] Invalidation failed after editorial write:', error)
  }
}
