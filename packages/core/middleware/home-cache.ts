import type { MiddlewareHandler } from 'hono'
import type { Env, AppContext } from '../types'

export const HOME_DATA_CACHE_KEY = 'home_data_v3'
export const HOME_CACHE_REVISION_SETTING = 'home.cache_revision'

// Read the revision directly from D1: KV invalidation can take time to propagate.
export async function getHomeDataCacheKey(env: Env): Promise<string> {
  const revision = await env.DB.prepare('SELECT value_json FROM settings WHERE key = ?')
    .bind(HOME_CACHE_REVISION_SETTING).first<{ value_json: string }>()
  return `${HOME_DATA_CACHE_KEY}:${revision?.value_json || 'initial'}`
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
