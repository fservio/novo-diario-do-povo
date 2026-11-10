import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { getHomeDataCacheKey, HOME_DATA_CACHE_KEY, HOME_CACHE_REVISION_SETTING, invalidateHomeAfterEditorialWrite } from '../../packages/core/middleware/home-cache'

function setup(status = 200) {
  let revision: string | undefined
  const run = vi.fn().mockImplementation(async () => ({}))
  const bind = vi.fn().mockImplementation((key, value) => ({
    run: async () => { await run(); revision = value },
    first: async () => revision ? { editorial: revision } : null
  }))
  const app = new Hono<any>()
  app.use('*', invalidateHomeAfterEditorialWrite)
  app.all('*', c => c.text('saved', status as any))
  const env = { DB: { prepare: vi.fn().mockReturnValue({ bind }) } }
  return { app, env, run, bind }
}

describe('home cache after editorial changes', () => {
  it.each(['/admin/posts/42', '/admin/posts/42/publish', '/admin/posts/42/delete', '/api/n8n/posts', '/api/admin/posts/42/autosave', '/admin/live/42/toggle-status', '/admin/settings/public/home.fixed_sections', '/admin/redacao-ia/pautas/7/aprovar'])('expires home after saving %s', async path => {
    const { app, env, run, bind } = setup()
    await app.request('https://example.com' + path, { method: 'POST' }, env)
    expect(run).toHaveBeenCalledOnce()
    expect(bind).toHaveBeenCalledWith(HOME_CACHE_REVISION_SETTING, expect.any(String))
  })

  it('invalidates after successful redirect responses', async () => {
    const { app, env, run } = setup(303)
    await app.request('https://example.com/admin/posts/42', { method: 'POST' }, env)
    expect(run).toHaveBeenCalledOnce()
  })

  it.each([['GET', '/admin/posts/42', 200], ['POST', '/admin/posts/42', 400], ['POST', '/admin/posts/42', 500], ['POST', '/admin/login', 200]])('preserves cache for %s %s with status %s', async (method, path, status) => {
    const { app, env, run } = setup(status)
    await app.request('https://example.com' + path, { method }, env)
    expect(run).not.toHaveBeenCalled()
  })

  it('preserves the completed save when cache deletion fails', async () => {
    const { app, env, run } = setup()
    run.mockRejectedValueOnce(new Error('cache unavailable'))
    const response = await app.request('https://example.com/admin/posts/42', { method: 'POST' }, env)
    expect(response.status).toBe(200)
  })

  it('uses a different data cache key after every save even if KV retains old data', async () => {
    const { app, env } = setup()
    const before = await getHomeDataCacheKey(env as any)
    expect(before).toBe(`${HOME_DATA_CACHE_KEY}:initial`)
    await app.request('/admin/posts/42', { method: 'POST' }, env)
    const after = await getHomeDataCacheKey(env as any)
    expect(after).not.toBe(before)
    await app.request('/admin/posts/42', { method: 'POST' }, env)
    expect(await getHomeDataCacheKey(env as any)).not.toBe(after)
  })

  it('does not invalidate when a redirect reports a failed save', async () => {
    const { env, run } = setup()
    const app = new Hono<any>()
    app.use('*', invalidateHomeAfterEditorialWrite)
    app.post('/admin/posts/42', c => c.redirect('/admin/posts/42?error=content_conflict', 303))
    await app.request('/admin/posts/42', { method: 'POST' }, env)
    expect(run).not.toHaveBeenCalled()
  })
})
