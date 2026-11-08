import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
const window = {} as any
runInNewContext(readFileSync(new URL('../../public/static/admin-instagram-http.js',import.meta.url),'utf8'),{window,Error})
const {readJson}=window.DiarioInstagramHttp
describe('Audio editor HTTP responses', () => {
  it('shows a useful message for an HTML 403 instead of parsing it as JSON', async () => {
    await expect(readJson(new Response('<h1>403 Forbidden</h1>',{status:403,headers:{'content-type':'text/html'}}))).rejects.toThrow('proteção da sessão (403)')
  })
  it('handles an expired login and preserves the instruction to retry in the same editor', async () => {
    await expect(readJson(new Response('{}',{status:401,headers:{'content-type':'application/json'}}))).rejects.toThrow('outra aba')
  })
  it('retains validation errors and accepts a successful queued job', async () => {
    await expect(readJson(Response.json({error:'Envie um WAV ou MP3 válido.'},{status:400}))).rejects.toThrow('WAV ou MP3')
    expect(await readJson(Response.json({success:true,job_id:'job'},{status:202}))).toEqual({success:true,job_id:'job'})
  })
  it('handles a non-JSON upstream error without exposing HTML', async () => {
    await expect(readJson(new Response('<html>upstream unavailable</html>',{status:502}))).rejects.toThrow('HTTP 502')
  })
})
