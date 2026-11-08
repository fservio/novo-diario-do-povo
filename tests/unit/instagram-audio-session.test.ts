import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { signJWT } from '../../packages/core/auth'
import { csrfProtection } from '../../packages/core/middleware/security'
import { handleAudioSession } from '../../packages/core/instagram/audio'

async function setup(role = 'editor') {
  const secret = 'test-only-csrf-session-secret-with-sufficient-length'
  const token = await signJWT({ sub: '1', email: 'test@example.com', type: 'admin', sid: 'current-session' }, secret)
  const store = new Map<string,string>()
  const env = { JWT_SECRET: secret, KV: {
    get: async (key: string) => store.get(key) || null,
    put: async (key: string, value: string) => { store.set(key,value) }
  } } as any
  const app = new Hono<any>()
  app.use('*', async (c,next) => { c.set('adminUser',{id:1,role}); await next() })
  app.use('/api/admin/instagram/*', csrfProtection as any)
  app.get('/api/admin/instagram/:id/audio/session',handleAudioSession)
  app.post('/api/admin/instagram/:id/audio/generate', async c => {
    const form = await c.req.formData()
    return c.json({accepted:true,title:form.get('title'),hasAudio:form.get('audio') instanceof File},202)
  })
  const request = (path: string, init: RequestInit = {}) => app.request(path,init,env)
  return {request,token,store}
}
describe('Audio upload session renewal', () => {
  it('renews an expired form token and accepts the original audio with a session-bound header', async () => {
    const t=await setup(), cookie=`admin_session=${t.token}; admin_csrf=expired-form-token`
    const form=new FormData(); form.set('title','Edição mantida'); form.set('audio',new Blob(['RIFF1234WAVEtest']),'audio.wav')
    const expired=await t.request('/api/admin/instagram/1/audio/generate',{method:'POST',headers:{cookie,'X-CSRF-Token':'expired-form-token'},body:form})
    expect(expired.status).toBe(403)
    expect(expired.headers.get('content-type')).toContain('application/json')
    const renewed=await t.request('/api/admin/instagram/1/audio/session',{headers:{cookie}})
    expect(renewed.status).toBe(200)
    expect(renewed.headers.get('cache-control')).toContain('no-store')
    const {csrf}=await renewed.json() as any
    expect(JSON.parse(t.store.get(`csrf:${csrf}`)!)).toEqual({uid:1,sid:'current-session'})
    const result=await t.request('/api/admin/instagram/1/audio/generate',{method:'POST',headers:{cookie,'X-CSRF-Token':csrf},body:form})
    expect(result.status).toBe(202)
    expect(await result.json()).toEqual({accepted:true,title:'Edição mantida',hasAudio:true})
  })
  it('rejects renewal without the matching authenticated session', async () => {
    const t=await setup()
    expect((await t.request('/api/admin/instagram/1/audio/session')).status).toBe(401)
    t.store.set('csrf:other-session',JSON.stringify({uid:1,sid:'other-session'}))
    const response=await t.request('/api/admin/instagram/1/audio/generate',{method:'POST',headers:{cookie:`admin_session=${t.token}`,'X-CSRF-Token':'other-session'}})
    expect(response.status).toBe(403)
  })
  it('does not issue an upload token to writers', async () => {
    const t=await setup('writer')
    expect((await t.request('/api/admin/instagram/1/audio/session',{headers:{cookie:`admin_session=${t.token}`}})).status).toBe(403)
    expect(t.store.size).toBe(0)
  })
})
