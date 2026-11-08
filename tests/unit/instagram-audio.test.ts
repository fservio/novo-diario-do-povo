import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { Hono } from 'hono'
import { describe, it, expect, vi } from 'vitest'
import { handleAudioClaim, handleAudioGenerate, handleAudioJob, handleAudioStatus, validateAudioHeader } from '../../packages/core/instagram/audio'

vi.mock('../../packages/core/instagram/repository', () => ({
  getInstagramPublication: vi.fn(async () => ({ id: 1, cover_media_url: 'media/photo.jpg' }))
}))
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')
function setup(role = 'editor') {
  const sql = new DatabaseSync(':memory:')
  sql.exec('CREATE TABLE instagram_publications(id INTEGER PRIMARY KEY); INSERT INTO instagram_publications VALUES(1);')
  sql.exec(readFileSync(new URL('../../migrations/0045_instagram_audio_stories.sql', import.meta.url), 'utf8'))
  const token = 'private-renderer-test-token'
  const sha = createRequire(import.meta.url)('node:crypto').createHash('sha256').update(token).digest('hex')
  sql.prepare('INSERT INTO story_renderer_config VALUES(1,?,?)').run(sha, new Date().toISOString())
  const prepare = (query: string, args: any[] = []): any => ({
    bind: (...values: any[]) => prepare(query, values),
    first: async () => sql.prepare(query).get(...args) || null,
    all: async () => ({ results: sql.prepare(query).all(...args) }),
    run: async () => ({ meta: { changes: Number(sql.prepare(query).run(...args).changes) } }),
    query, args
  })
  const objects = new Map<string, { bytes: Uint8Array; httpMetadata: any }>()
  const env = { DB: { prepare, batch: async (statements: any[]) => {
    sql.exec('BEGIN'); try { const results = []
      for (const s of statements) results.push(await s.run())
      sql.exec('COMMIT'); return results
    } catch (error) { sql.exec('ROLLBACK'); throw error }
  } }, R2: {
    put: async (key: string, data: any, options: any) => {
      const bytes = new Uint8Array(await new Response(data).arrayBuffer())
      objects.set(key, { bytes, httpMetadata: options.httpMetadata }); return { size: bytes.length }
    },
    get: async (key: string, options?: any) => {
      const obj = objects.get(key); if (!obj) return null
      const bytes = options?.range?.length ? obj.bytes.slice(0, options.range.length) : obj.bytes
      return { body: new Response(bytes).body, size: obj.bytes.length, httpMetadata: obj.httpMetadata,
        arrayBuffer: async () => bytes.buffer }
    },
    delete: async (keys: string | string[]) => { for (const key of Array.isArray(keys) ? keys : [keys]) objects.delete(key) }
  } } as any
  const pending: Promise<any>[] = []
  const app = new Hono<any>()
  app.use('/admin/*', async (c, next) => { c.set('adminUser', { id: 1, role }); await next() })
  app.post('/admin/:id/generate', handleAudioGenerate)
  app.get('/admin/:id/status', handleAudioStatus)
  app.post('/claim', handleAudioClaim)
  app.on(['GET','POST','PUT'], '/jobs/:job/:kind', handleAudioJob)
  const request = (path: string, init?: RequestInit) => app.fetch(new Request('https://diario.dopovo.com.br' + path, init), env, { waitUntil: (p: Promise<any>) => pending.push(p), passThroughOnException() {} })
  const claim = async () => { const r = await request('/claim',{ method: 'POST', headers: { Authorization: 'Bearer ' + token } }); return { response: r, job: r.status === 200 ? await r.json() as any : null } }
  return { sql, objects, request, claim, pending }
}
function form(version = 0, includeAudio = true) {
  const data = new FormData()
  for (const [k,v] of Object.entries({version: String(version),hat:'BRASIL',title:'Notícia para ouvir',subtitle:'Resumo',photo_credit:'Agência',audio_credit:'Redação',image_position_x:'50',image_position_y:'50',duration_seconds:'45'})) data.set(k,v)
  const png = new Uint8Array(24); png.set([137,80,78,71]); new DataView(png.buffer).setUint32(16,1080); new DataView(png.buffer).setUint32(20,1920)
  data.set('artwork', new Blob([png],{type:'image/png'}),'art.png')
  if (includeAudio) data.set('audio',new Blob(['RIFF1234WAVEtest'],{type:'audio/wav'}),'audio.wav')
  return data
}
function upload(job: any) {
  const bytes = new Uint8Array(64); bytes.set([102,116,121,112],4)
  return { method:'PUT', headers:{Authorization:'Bearer '+job.asset_token,'Content-Type':'video/mp4','Content-Length':'64','X-Video-Duration':'45'}, body:bytes } as RequestInit
}
describe('Audio Story queue and R2 lifecycle', () => {
  it('recognizes WAV/MP3 bytes and rejects renamed files', () => {
    expect(validateAudioHeader(new TextEncoder().encode('RIFF1234WAVEdata'))).toBe('wav')
    expect(validateAudioHeader(new TextEncoder().encode('ID3test'))).toBe('mp3')
    expect(validateAudioHeader(new TextEncoder().encode('not audio.mp3'))).toBeNull()
  })
  it('protects generation and claims', async () => {
    const t = setup('writer')
    expect((await t.request('/admin/1/generate',{method:'POST',body:form()})).status).toBe(403)
    expect((await t.request('/claim',{method:'POST'})).status).toBe(401)
    expect(t.objects.size).toBe(0); t.sql.close()
  })
  it('queues, leases and commits a streamed MP4 only after R2 persistence', async () => {
    const t = setup()
    expect((await t.request('/admin/1/generate',{method:'POST',body:form()})).status).toBe(202)
    const {job} = await t.claim()
    expect(job.asset_token).toBeTruthy()
    expect((await t.request(`/jobs/${job.id}/audio`)).status).toBe(401)
    expect((await t.request(`/jobs/${job.id}/video`,upload(job))).status).toBe(200)
    await Promise.all(t.pending)
    const status = await (await t.request('/admin/1/status')).json() as any
    expect(status.job).toMatchObject({status:'ready',duration_seconds:45,version:1})
    expect((await t.claim()).response.status).toBe(204)
    expect([...t.objects.keys()].every(key=>key.startsWith('private/story-audio/'))).toBe(true)
    t.sql.close()
  })
  it('rejects an obsolete render after a newer composition was queued', async () => {
    const t = setup()
    await t.request('/admin/1/generate',{method:'POST',body:form()})
    const old = (await t.claim()).job
    expect((await t.request('/admin/1/generate',{method:'POST',body:form(1,false)})).status).toBe(202)
    expect((await t.request(`/jobs/${old.id}/video`,upload(old))).status).toBe(401)
    const status = await (await t.request('/admin/1/status')).json() as any
    expect(status.job).toMatchObject({status:'queued',version:2})
    t.sql.close()
  })
  it('rejects a stale editor version and invalid output without making it available', async () => {
    const t = setup()
    await t.request('/admin/1/generate',{method:'POST',body:form()})
    expect((await t.request('/admin/1/generate',{method:'POST',body:form()})).status).toBe(409)
    const {job} = await t.claim(), init = upload(job)
    init.body = new Uint8Array(64)
    expect((await t.request(`/jobs/${job.id}/video`,init)).status).toBe(400)
    expect([...t.objects.keys()].some(key=>key.endsWith('.mp4'))).toBe(false)
    expect((await (await t.request('/admin/1/status')).json() as any).job.status).toBe('rendering')
    t.sql.close()
  })
  it('uses a different output key when a lease expires to isolate late uploads', async () => {
    const t = setup()
    await t.request('/admin/1/generate',{method:'POST',body:form()})
    const old = (await t.claim()).job
    const key = (t.sql.prepare('SELECT output_key FROM instagram_audio_jobs').get() as any).output_key
    t.sql.exec("UPDATE instagram_audio_jobs SET lease_expires_at='2000-01-01T00:00:00.000Z'")
    const next = (await t.claim()).job
    expect(next.id).toBe(old.id); expect(next.asset_token).not.toBe(old.asset_token)
    expect((t.sql.prepare('SELECT output_key FROM instagram_audio_jobs').get() as any).output_key).not.toBe(key)
    expect((await t.request(`/jobs/${old.id}/video`,upload(old))).status).toBe(401)
    t.sql.close()
  })
})
