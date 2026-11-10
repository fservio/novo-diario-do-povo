import {Hono} from 'hono'
import {expect,it} from 'vitest'
import {guideFixture} from '../fixtures/evergreen'
import {handleN8nHome} from '../../packages/core/web/n8n-home'
import {getHomeDataCacheKey} from '../../packages/core/middleware/home-cache'
import {saveHomeHero} from '../../packages/core/admin/home-hero'

it('entrega o lote à IA e aplica uma edição somente uma vez',async()=>{
 const {db,env}=guideFixture()
 db.exec(`DROP TABLE settings; CREATE TABLE settings(key TEXT PRIMARY KEY,scope TEXT,value_json TEXT,updated_at TEXT);
 ALTER TABLE posts ADD COLUMN category_id INTEGER DEFAULT 1;
 ALTER TABLE posts ADD COLUMN author_id INTEGER DEFAULT 1;
 ALTER TABLE posts ADD COLUMN updated_at TEXT;
 ALTER TABLE posts ADD COLUMN is_headline INTEGER DEFAULT 0;
 ALTER TABLE posts ADD COLUMN cover_media_id INTEGER;`)
 const publishedAt=new Date(Date.now()-60_000).toISOString()
 db.prepare('UPDATE posts SET published_at=?,updated_at=?').run(publishedAt,publishedAt)
 db.prepare("INSERT INTO settings(key,scope,value_json) VALUES('home.fixed_sections','public',?)")
  .run(JSON.stringify([{slug:'geral',title:'Geral',enabled:true},{slug:'economia',title:'Economia',enabled:true}]))
 const app=new Hono().post('/home/:operation',handleN8nHome)
 const post=(operation:string,body={})=>app.request('/home/'+operation,{
  method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)
 },env)
 const batch=await (await post('candidates')).json()
 expect(batch.candidates.map((post:{id:number})=>post.id)).toEqual([1])
 expect(batch.sectionSlugs).toEqual(['geral','economia'])
 const before=await getHomeDataCacheKey(env)
 const edition={revision:batch.revision,through:batch.through,lineup:[1],shortlist:[1],sections:{geral:[1]},reason:'Notícia útil para o leitor agora.'}
 expect((await post('apply',{...edition,lineup:[999]})).status).toBe(409)
 expect((await post('apply',{...edition,sections:{economia:[1]}})).status).toBe(409)
 const applied=await post('apply',edition)
 expect(applied.status).toBe(200)
 expect(await applied.json()).toMatchObject({changed:true,lineup:[1]})
 expect(await getHomeDataCacheKey(env)).not.toBe(before)
 expect((await post('apply',edition)).status).toBe(409)
 const next=await (await post('candidates')).json()
 expect(next.candidates).toEqual([])
 expect(next.current).toEqual([1])
 expect(next.sections).toEqual({geral:[1]})

 db.prepare('UPDATE posts SET is_headline=1 WHERE id=1').run()
 expect((await (await post('candidates')).json()).manual).toBeNull()
 const admin=new Hono().post('/hero',async(c,next)=>{
  c.set('adminUser',{role:'editor'})
  await next()
 },saveHomeHero)
 const pin=await admin.request('/hero',{method:'POST',body:new URLSearchParams({action:'pin',post_id:'1',minutes:'30'})},env)
 expect(pin.status).toBe(303)
 expect(pin.headers.get('location')).toBe('/admin#home-hero')
 expect((await (await post('candidates')).json()).manual.id).toBe(1)
 expect(await getHomeDataCacheKey(env)).toContain(':pin:1')
 db.prepare("UPDATE settings SET value_json=json_set(value_json,'$.until',?) WHERE key='home.hero_pin'")
  .run(new Date(Date.now()-1_000).toISOString())
 expect((await (await post('candidates')).json()).manual).toBeNull()
 expect(await getHomeDataCacheKey(env)).not.toContain(':pin:1')
})
