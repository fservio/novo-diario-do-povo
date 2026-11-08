import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { Hono } from 'hono'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleInstagramConnect, handleInstagramConnectCallback, handleInstagramDirectImage, handleInstagramDirectPublish, processInstagramDirectJobs, sealToken, openToken, validateFeedJpeg } from '../../packages/core/instagram/direct'
import { getInstagramRuntimeConfig } from '../../packages/core/instagram/service'

vi.mock('../../packages/core/instagram/repository', () => ({
  getInstagramPublication: (env: any, id: number) => env.DB.prepare('SELECT * FROM instagram_publications WHERE id=?').bind(id).first(),
  recordInstagramAttempt: vi.fn(),
  setInstagramPublicationState: async (env: any, id: number, value: any) => {
    await env.DB.prepare('UPDATE instagram_publications SET status=?,last_error=? WHERE id=?').bind(value.status, value.error || null, id).run()
  }
}))
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')
function jpeg(width = 1080, height = 1350) {
  return new Uint8Array([255,216,255,192,0,17,8,height >> 8,height & 255,width >> 8,width & 255,3,1,17,0,2,17,0,3,17,0,255,217])
}
async function fixture() {
  const sql = new DatabaseSync(':memory:')
  sql.exec(`CREATE TABLE instagram_publications(id INTEGER PRIMARY KEY,version INTEGER,status TEXT,approved_at TEXT,
    article_status TEXT,article_scheduled_at TEXT,caption TEXT,hashtags TEXT,alt_text TEXT,photo_credit TEXT,scheduled_at TEXT,last_error TEXT,updated_at TEXT);
    INSERT INTO instagram_publications VALUES(1,3,'approved','2030-01-01','published',NULL,'Legenda','#diario','Descrição','Agência',NULL,NULL,NULL);
    CREATE TABLE settings(key TEXT,value_json TEXT,scope TEXT);`)
  sql.exec(readFileSync(new URL('../../migrations/0046_instagram_direct.sql', import.meta.url), 'utf8'))
  sql.exec(readFileSync(new URL('../../migrations/0047_instagram_audience_links.sql', import.meta.url), 'utf8'))
  const prepare = (query: string, args: any[] = []): any => ({
    bind: (...values: any[]) => prepare(query, values),
    run: async () => ({ meta: { changes: Number(sql.prepare(query).run(...args).changes) } }),
    all: async () => ({ results: sql.prepare(query).all(...args) }),
    first: async () => sql.prepare(query).get(...args) || null
  })
  const env: any = { DB: { prepare, batch: async (statements: any[]) => {
    sql.exec('BEGIN')
    try { const results = []; for (const statement of statements) results.push(await statement.run()); sql.exec('COMMIT'); return results }
    catch (error) { sql.exec('ROLLBACK'); throw error }
  } }, R2: { put: vi.fn(), delete: vi.fn() }, JWT_SECRET: 'test-secret-for-instagram', PUBLIC_BASE_URL: 'https://diario.example' }
  sql.prepare('INSERT INTO instagram_connections(id,account_id,username,token_cipher,expires_at,updated_at) VALUES(1,?,?,?,?,?)').run('123','diario',await sealToken(env,'test-token'), '2099-01-01T00:00:00.000Z', '2030-01-01T00:00:00.000Z')
  const app = new Hono<any>()
  app.use('*', async (c, next) => { c.set('adminUser', { id: 1, role: 'director' }); c.set('cspNonce','test-nonce'); await next() })
  app.post('/connect', handleInstagramConnect)
  app.post('/:id', handleInstagramDirectPublish)
  app.get('/callback', handleInstagramConnectCallback)
  app.get('/image/:token', handleInstagramDirectImage)
  async function send(version = '3', schedule = '') {
    const form = new FormData()
    form.set('image', new Blob([jpeg()], { type: 'image/jpeg' }), 'feed.jpg')
    form.set('version', version); form.set('scheduled_at', schedule)
    return app.request('/1', { method: 'POST', body: form }, env)
  }
  return { sql, env, app, send }
}
afterEach(() => vi.unstubAllGlobals())
describe('Instagram direct publishing', () => {
  it('starts OAuth without a cross-origin form redirect and preserves the CSP nonce', async () => {
    const { sql, env, app } = await fixture()
    env.INSTAGRAM_APP_ID='123'; env.INSTAGRAM_APP_SECRET='app-secret'
    const response = await app.request('/connect',{method:'POST',headers:{cookie:'admin_session=session'}},env)
    const html = await response.text()
    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
    expect(html).toContain('nonce="test-nonce"')
    expect(html).toContain('window.location.replace(')
    expect(html).toContain('instagram_business_content_publish')
    expect(html).not.toContain('app-secret')
    expect(response.headers.get('set-cookie')).toContain('HttpOnly')
    sql.close()
  })
  it('requests audience and comments only when selected or previously granted',async()=>{
    const {sql,env,app}=await fixture()
    env.INSTAGRAM_APP_ID='123';env.INSTAGRAM_APP_SECRET='app-secret'
    const response=await app.request('/connect',{method:'POST',headers:{cookie:'admin_session=session','Content-Type':'application/x-www-form-urlencoded'},body:'capabilities=audience-link'},env)
    const audienceHtml=await response.text()
    expect(audienceHtml).toContain('instagram_business_manage_insights')
    expect(audienceHtml).not.toContain('instagram_business_manage_messages')
    expect(sql.prepare('SELECT requested_scopes FROM instagram_oauth_states').get().requested_scopes).toContain('instagram_business_manage_comments')
    sql.exec("UPDATE instagram_connections SET granted_scopes='instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights,instagram_business_manage_comments'")
    const renewal=await app.request('/connect',{method:'POST',headers:{cookie:'admin_session=session'}},env)
    expect(await renewal.text()).toContain('instagram_business_manage_comments')
    const replies=await app.request('/connect',{method:'POST',headers:{cookie:'admin_session=session','Content-Type':'application/x-www-form-urlencoded'},body:'capabilities=private-replies'},env)
    expect(await replies.text()).toContain('instagram_business_manage_messages')
    sql.exec("UPDATE instagram_connections SET granted_scopes=granted_scopes||',instagram_business_manage_messages'")
    const messageRenewal=await app.request('/connect',{method:'POST',headers:{cookie:'admin_session=session'}},env)
    expect(await messageRenewal.text()).toContain('instagram_business_manage_messages');sql.close()
  })
  it('returns an actual 404 for invalid image tokens even with a legacy notFound handler', async () => {
    const { sql, env, app } = await fixture()
    app.notFound(c=>c.text('Legacy missing page'))
    expect((await app.request('/image/invalid',{},env)).status).toBe(404)
    sql.close()
  })
  it('exposes connection status to the CMS without exposing the token', async () => {
    const { sql, env } = await fixture()
    env.INSTAGRAM_REDIRECT_URI = 'https://diario.example/admin/instagram/connect/callback'
    const config = await getInstagramRuntimeConfig(env)
    expect(config).toMatchObject({directConnected:true,directUsername:'diario',publishReady:true,directRedirectUri:env.INSTAGRAM_REDIRECT_URI})
    expect(JSON.stringify(config)).not.toContain('test-token')
    sql.close()
  })
  it('encrypts tokens and rejects a different environment secret', async () => {
    const env: any = { JWT_SECRET: 'first' }
    const cipher = await sealToken(env, 'private-token')
    expect(cipher).not.toContain('private-token')
    expect(await openToken(env, cipher)).toBe('private-token')
    await expect(openToken({ JWT_SECRET: 'second' } as any, cipher)).rejects.toThrow()
  })
  it('checks the actual JPEG dimensions and rejects PNG data', () => {
    expect(() => validateFeedJpeg(jpeg())).not.toThrow()
    expect(() => validateFeedJpeg(jpeg(1080,1920))).toThrow('1080')
    expect(() => validateFeedJpeg(new Uint8Array(20))).toThrow('JPEG')
  })
  it('queues the approved version once and does not send secrets to the browser', async () => {
    const { sql, env, send } = await fixture()
    const response = await send()
    expect(response.status).toBe(200)
    expect(await response.text()).not.toContain('test-token')
    expect((await send()).status).toBe(400)
    expect(sql.prepare('SELECT count(*) n FROM instagram_direct_jobs').get().n).toBe(1)
    expect(env.R2.put).toHaveBeenCalledTimes(1)
    sql.close()
  })
  it('rejects stale versions before storing their image', async () => {
    const { sql, env, send } = await fixture()
    expect((await send('2')).status).toBe(400)
    expect(env.R2.put).not.toHaveBeenCalled()
    sql.close()
  })
  it('does not publish a future scheduled task', async () => {
    const { sql, env, send } = await fixture()
    expect((await send('3', '2098-01-01T12:00')).status).toBe(200)
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    await processInstagramDirectJobs(env)
    expect(fetch).not.toHaveBeenCalled()
    sql.close()
  })
  it('publishes through graph.instagram.com only once, with the stored JPEG', async () => {
    const { sql, env, send } = await fixture()
    await send()
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ id:'444' }))
      .mockResolvedValueOnce(Response.json({ status_code:'FINISHED' }))
      .mockResolvedValueOnce(Response.json({ id:'555' }))
      .mockResolvedValueOnce(Response.json({ permalink:'https://www.instagram.com/p/test/' }))
    vi.stubGlobal('fetch', fetch)
    await processInstagramDirectJobs(env)
    await processInstagramDirectJobs(env)
    expect(fetch).toHaveBeenCalledTimes(4)
    expect(fetch.mock.calls[0][0]).toBe('https://graph.instagram.com/v22.0/123/media')
    expect(fetch.mock.calls[0][1].body.get('image_url')).toMatch(/^https:\/\/diario.example\/instagram\/media\//)
    expect(sql.prepare('SELECT status,media_id FROM instagram_direct_jobs').get()).toMatchObject({status:'published',media_id:'555'})
    sql.close()
  })
  it('does not repeat an ambiguous media_publish request or allow a new version to bypass it', async () => {
    const { sql, env, send } = await fixture()
    await send()
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ id:'444' }))
      .mockResolvedValueOnce(Response.json({ status_code:'FINISHED' })).mockRejectedValueOnce(new Error('network timeout'))
    vi.stubGlobal('fetch', fetch)
    await processInstagramDirectJobs(env)
    await processInstagramDirectJobs(env)
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(sql.prepare('SELECT status FROM instagram_direct_jobs').get().status).toBe('uncertain')
    sql.exec("UPDATE instagram_publications SET version=4,status='approved'")
    expect((await send('4')).status).toBe(400)
    sql.close()
  })
  it('refuses an OAuth callback without the matching browser state', async () => {
    const { sql, env, app } = await fixture()
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    const response = await app.request('/callback?state=forged&code=code', {}, env)
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toContain('error=')
    expect(fetch).not.toHaveBeenCalled()
    sql.close()
  })
  it('binds OAuth to the session and consumes the authorization state only once', async () => {
    const { sql, env, app } = await fixture()
    env.INSTAGRAM_REDIRECT_URI = 'https://custom.example/admin/instagram/connect/callback'
    const session = 'authenticated-session', state = 'valid-state'
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(session))), b => b.toString(16).padStart(2,'0')).join('')
    sql.prepare('INSERT INTO instagram_oauth_states(state,user_id,session_hash,expires_at) VALUES(?,?,?,?)').run(state,1,hash,'2099-01-01')
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ access_token:'short-token' }))
      .mockResolvedValueOnce(Response.json({ access_token:'long-token', expires_in:5184000 }))
      .mockResolvedValueOnce(Response.json({ user_id:'123',username:'diario',account_type:'BUSINESS' }))
    vi.stubGlobal('fetch', fetch)
    const headers = { cookie: `admin_session=${session}; instagram_oauth_state=${state}` }
    const success = await app.request(`/callback?state=${state}&code=secret-code`, { headers }, env)
    expect(success.headers.get('location')).toContain('success=instagram')
    const cipher = sql.prepare('SELECT token_cipher FROM instagram_connections').get().token_cipher
    expect(cipher).not.toContain('long-token')
    expect(await openToken(env, cipher)).toBe('long-token')
    const replay = await app.request(`/callback?state=${state}&code=secret-code`, { headers }, env)
    expect(replay.headers.get('location')).toContain('error=')
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(fetch.mock.calls[0][1].body.get('redirect_uri')).toBe(env.INSTAGRAM_REDIRECT_URI)
    sql.close()
  })
  it('allows a controlled retry only when failure happened before publishing', async () => {
    const { sql, env, send } = await fixture()
    await send()
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({error:{code:190}}, {status:400}))
    vi.stubGlobal('fetch', fetch)
    await processInstagramDirectJobs(env)
    expect(sql.prepare('SELECT status FROM instagram_direct_jobs').get().status).toBe('failed')
    expect((await send()).status).toBe(200)
    expect(sql.prepare('SELECT count(*) n FROM instagram_direct_jobs').get().n).toBe(1)
    expect(sql.prepare('SELECT status FROM instagram_direct_jobs').get().status).toBe('queued')
    sql.close()
  })
})
