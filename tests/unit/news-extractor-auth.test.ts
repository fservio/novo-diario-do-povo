import {describe,it,expect} from 'vitest'
import app from '../../functions/index'
import {signJWT} from '../../packages/core/auth'
import {guideFixture} from '../fixtures/evergreen'
describe('CMS collector route security',()=>{
 it('requires the integration key to claim commands or send status',async()=>{const f=guideFixture();for(const op of ['claim','ack','report']){const r=await app.request('/api/n8n/news-extractor/'+op,{method:'POST',headers:{'content-type':'application/json'},body:'{}'},{...f.env,CACHE:{get:async()=> 'true'}} as any);expect(r.status).toBe(401)}})
 it('requires CSRF for all admin collection actions',async()=>{const f=guideFixture();f.db.exec("ALTER TABLE users ADD COLUMN email TEXT DEFAULT 'preview@example.org';ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'editor';ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1");const env={...f.env,CACHE:{get:async()=> 'true'},KV:{get:async()=>null},JWT_SECRET:'segredo-ficticio-para-testes-locais'},jwt=await signJWT({sub:'1',type:'admin',sid:'sessao-testes'} as any,env.JWT_SECRET);for(const path of ['/admin/news-extractor/commands','/admin/news-extractor/retry']){const r=await app.request(path,{method:'POST',headers:{cookie:'admin_session='+jwt+'; admin_csrf=ficticio','content-type':'application/x-www-form-urlencoded'},body:'kind=article&url=https%3A%2F%2Fexample.org%2Fa'},env);expect(r.status).toBe(403);expect(await r.text()).toContain('CSRF')}})
})
