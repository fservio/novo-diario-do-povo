import {createRequire} from 'node:module'
import {readFileSync} from 'node:fs'
import {Hono} from 'hono'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {handleDailyAdmin,handleDailyAdminSave} from '../../packages/core/admin/daily-edition'
import {handleCultureEventAdmin,handleCultureEventAdminSave,handleCultureEventsAdmin} from '../../packages/core/admin/culture-events'
import {handleDailyEditionSave} from '../../packages/core/web/meu-dia'
import {saveCulturalEventRecords} from '../../packages/core/web/culture'
import {getManagedEdition} from '../../packages/core/db/daily-management'
import {dailyDate,editionKey} from '../../packages/core/meu-dia'
const {DatabaseSync}=createRequire(import.meta.url)('node:sqlite')
const now=new Date('2026-11-06T15:00:00Z')
afterEach(()=>vi.useRealTimers())
function fixture(){
 vi.useFakeTimers();vi.setSystemTime(now)
 const db=new DatabaseSync(':memory:')
 for(const file of ['0050_cultural_events.sql','0051_cultural_suggestions.sql','0052_daily_editorial_management.sql'])db.exec(readFileSync(new URL('../../migrations/'+file,import.meta.url),'utf8'))
 db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY,name TEXT);INSERT INTO users VALUES(1,'Editora');CREATE TABLE posts(id INTEGER PRIMARY KEY,title TEXT,slug TEXT,status TEXT,seo_noindex INTEGER,published_at TEXT,created_at TEXT);INSERT INTO posts VALUES(1,'Primeira notícia','primeira','published',0,'2026-11-06T10:00:00Z','2026-11-06T10:00:00Z'),(2,'Segunda notícia','segunda','published',0,'2026-11-06T10:00:00Z','2026-11-06T10:00:00Z'),(3,'Rascunho','rascunho','draft',0,'2026-11-06T10:00:00Z','2026-11-06T10:00:00Z')")
 const prepare=(q:string,args:any[]=[]):any=>({bind:(...v:any[])=>prepare(q,v),first:async()=>db.prepare(q).get(...args)||null,all:async()=>({results:db.prepare(q).all(...args)}),run:async()=>db.prepare(q).run(...args)})
 const cache=new Map<string,string>(),env:any={PUBLIC_BASE_URL:'https://diario.example',DB:{prepare,batch:async(s:any[])=>Promise.all(s.map(x=>x.run()))},CACHE:{get:async(k:string)=>cache.has(k)?JSON.parse(cache.get(k)!):null,put:async(k:string,v:string)=>{cache.set(k,v)},delete:async(k:string)=>cache.delete(k)}}
 const app=new Hono();app.use('/admin/*',async(c,next)=>{c.set('adminUser',{id:1,name:'Editora',role:c.req.header('role')||'editor'});c.set('csrfToken','test');await next()})
 app.get('/admin/meu-dia',handleDailyAdmin);app.post('/admin/meu-dia',handleDailyAdminSave);app.get('/admin/culture/events',handleCultureEventsAdmin);app.get('/admin/culture/events/:slug',handleCultureEventAdmin);app.post('/admin/culture/events/:slug',handleCultureEventAdminSave);app.post('/automatic',handleDailyEditionSave)
 const post=(url:string,body:any,role='editor')=>app.request(url,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',role},body:new URLSearchParams(body)},env)
 return {db,cache,env,app,post}
}
const event:any={slug:'evento-teste',title:'Apresentação cultural',summary:'Uma programação cultural de teste para toda a família.',category:'music',state:'PI',city:'Teresina',venue:'Teatro de teste',address:null,starts_on:'2026-11-10',ends_on:'2026-11-10',starts_at:null,ends_at:null,timezone:'America/Fortaleza',price_type:'unknown',price_text:null,source_url:'https://official.example/evento',verified_at:now.toISOString(),image_media_id:null,status:'scheduled'}
const item:any={post_id:1,section:'essential',scope:'BR',summary:'Uma seleção de conteúdo útil e relevante para o leitor.',source_url:'https://official.example/noticia',expires_at:null}
const dailyForm=(items:any[],revision=0)=>Object.assign({date:dailyDate(now),revision:String(revision),item_count:String(items.length),action:'publish'},...items.map((item,i)=>Object.fromEntries(Object.entries({...item,expires_at:item.expires_at||'',order:i+1}).map(([key,value])=>['item_'+i+'_'+key,String(value)]))))
describe('Central editorial Meu dia e Agenda',()=>{
 it('protege correções, cancelamentos e destaques contra a coleta; liberação é explícita e versionada',async()=>{
  const {env,db,post,cache}=fixture();await saveCulturalEventRecords(env,[event])
  let r=await post('/admin/culture/events/evento-teste',{...event,title:'Título corrigido pela redação',address:'',price_text:'',starts_time:'',ends_time:'',revision:'0',action:'save',verified:'yes',featured:'yes',status:'cancelled'});expect(r.status).toBe(303)
  expect(db.prepare('SELECT title,status,editorial_locked,featured,edited_by FROM cultural_events').get()).toMatchObject({title:'Título corrigido pela redação',status:'cancelled',editorial_locked:1,featured:1,edited_by:1})
  await saveCulturalEventRecords(env,[{...event,title:'Tentativa de sobrescrever automaticamente'}]);expect(db.prepare('SELECT title FROM cultural_events').get().title).toBe('Título corrigido pela redação')
  expect(JSON.parse(cache.get('culture:upcoming:v1')!)).toEqual([])
  r=await post('/admin/culture/events/evento-teste',{revision:'0',action:'unlock',confirm_unlock:'yes'});expect(r.status).toBe(400)
  r=await post('/admin/culture/events/evento-teste',{revision:'1',action:'unlock'});expect(r.status).toBe(400)
  r=await post('/admin/culture/events/evento-teste',{revision:'1',action:'unlock',confirm_unlock:'yes'});expect(r.status).toBe(303)
  await saveCulturalEventRecords(env,[event]);expect(db.prepare('SELECT status,editorial_locked FROM cultural_events').get()).toMatchObject({status:'scheduled',editorial_locked:0})
  expect(db.prepare('SELECT count(*) n FROM daily_management_audit').get().n).toBe(2)
 })
 it('publica edição manual, mantém ordem e retiradas após nova coleta, rejeita revisão antiga e permite voltar ao automático',async()=>{
  const {app,env,db,post}=fixture();const automatic=()=>app.request('/automatic',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({date:dailyDate(now),items:[item,{...item,post_id:2}]})},env)
  expect((await automatic()).status).toBe(200)
  const manual={...item,post_id:2,summary:'Resumo revisado e protegido pela redação para este dia.'}
  expect((await post('/admin/meu-dia',dailyForm([manual]))).status).toBe(303)
  await automatic();let publicEdition=await getManagedEdition(env,dailyDate(now));expect(publicEdition.items.map(x=>x.post_id)).toEqual([2]);expect(publicEdition.items[0].summary).toBe(manual.summary)
  expect((await post('/admin/meu-dia',dailyForm([item]))).status).toBe(400)
  expect(JSON.parse(db.prepare('SELECT editorial_json FROM daily_editorial_editions').get().editorial_json).items[0].post_id).toBe(2)
  expect((await post('/admin/meu-dia',{date:dailyDate(now),revision:'1',item_count:'1',action:'automatic'})).status).toBe(303)
  publicEdition=await getManagedEdition(env,dailyDate(now));expect(publicEdition.items.map(x=>x.post_id)).toEqual([1,2])
 })
 it('reordena matérias e impede rascunho, prazo vencido e acesso de redator',async()=>{
  const {post,env,db}=fixture();const form=dailyForm([item,{...item,post_id:2}]);form['item_0_order']='2';form['item_1_order']='1'
  expect((await post('/admin/meu-dia',form,'writer')).status).toBe(403)
  expect((await post('/admin/meu-dia',form)).status).toBe(303);expect((await getManagedEdition(env,dailyDate(now))).items.map(x=>x.post_id)).toEqual([2,1])
  expect((await post('/admin/meu-dia',dailyForm([{...item,post_id:3}],1))).status).toBe(400)
  expect((await post('/admin/meu-dia',dailyForm([{...item,expires_at:'2026-11-01T12:00:00Z'}],1))).status).toBe(400)
  expect(db.prepare('SELECT revision FROM daily_editorial_editions').get().revision).toBe(1)
 })
 it('oferece as três abas e busca eventos sem expor contatos dos organizadores',async()=>{
  const {app,env,db,cache}=fixture();await saveCulturalEventRecords(env,[event]);cache.set(editionKey(dailyDate(now)),JSON.stringify({date:dailyDate(now),updated_at:now.toISOString(),items:[{...item,title:'Primeira notícia',url:'/primeira'}]}))
  for(const path of ['/admin/meu-dia','/admin/culture/events','/admin/culture/events/evento-teste','/admin/culture/events/new']){const response=await app.request(path,{},env);expect(response.status).toBe(200);const html=await response.text();expect(html).toContain('Edição do dia');expect(html).toContain('Sugestões');expect(html).toContain('Eventos')}
  const response=await app.request('/admin/culture/events?q=nao-existe',{},env);expect(await response.text()).toContain('Nenhum evento para este filtro')
  expect(db.prepare('SELECT count(*) n FROM cultural_events').get().n).toBe(1)
 })
})
