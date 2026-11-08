import {describe,it,expect} from 'vitest'
import app from '../../functions/index'
import {signJWT} from '../../packages/core/auth'
import {guideFixture} from '../fixtures/evergreen'
describe('Proteção das rotas dos guias',()=>{
 it('exige chave da integração nas operações de produção',async()=>{const f=guideFixture();const response=await app.request('/api/n8n/guides/claim',{method:'POST',headers:{'content-type':'application/json'},body:'{}'},{...f.env,CACHE:{get:async()=> 'true'}} as any);expect(response.status).toBe(401);expect(response.headers.get('Cache-Control')).toContain('private, no-store')})
 it('exige sessão e CSRF antes de importar pautas ou alterar a fila',async()=>{
  const f=guideFixture();f.db.exec("ALTER TABLE users ADD COLUMN email TEXT DEFAULT 'preview@example.org';ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'editor';ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1")
  const env={...f.env,CACHE:{get:async()=> 'true'},KV:{get:async()=>null},JWT_SECRET:'segredo-ficticio-para-testes-locais'},jwt=await signJWT({sub:'1',type:'admin',sid:'sessao-testes'} as any,env.JWT_SECRET)
  for(const path of ['/admin/guias/import','/admin/guias/1/queue']){const response=await app.request(path,{method:'POST',headers:{cookie:'admin_session='+jwt+'; admin_csrf=ficticio','content-type':'application/x-www-form-urlencoded'},body:'version=0'},env);expect(response.status).toBe(403);expect(await response.text()).toContain('CSRF')}
  expect(f.db.prepare('SELECT COUNT(*) AS n FROM evergreen_guides').get().n).toBe(0)
 })
})
