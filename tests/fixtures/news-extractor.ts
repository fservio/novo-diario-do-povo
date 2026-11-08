import {createRequire} from 'node:module'
import {readFileSync} from 'node:fs'
import {Hono} from 'hono'
import {handleExtractorAdmin,handleExtractorAdminSave} from '../../packages/core/admin/news-extractor'
import {handleN8nExtractor} from '../../packages/core/web/n8n-news-extractor'
const {DatabaseSync}=createRequire(import.meta.url)('node:sqlite')
export function extractorFixture(){
 const db=new DatabaseSync(':memory:');db.exec("PRAGMA foreign_keys=ON;CREATE TABLE users(id INTEGER PRIMARY KEY);INSERT INTO users VALUES(1)");db.exec(readFileSync('migrations/0055_news_extractor.sql','utf8'))
 const prepare=(q:string,args:any[]=[]):any=>({bind:(...v:any[])=>prepare(q,v),first:async()=>db.prepare(q).get(...args)||null,all:async()=>({results:db.prepare(q).all(...args)}),run:async()=>db.prepare(q).run(...args)})
 const cache=new Map<string,string>(),env:any={DB:{prepare},CACHE:{get:async(k:string)=>cache.has(k)?JSON.parse(cache.get(k)!):null,put:async(k:string,v:string)=>cache.set(k,v)},PUBLIC_BASE_URL:'https://diario.dopovo.com.br'}
 const app=new Hono();app.use('/admin/*',async(c,next)=>{c.set('adminUser',{id:1,name:'Editora',role:c.req.header('role')||'editor',email:'preview@example.org'});c.set('csrfToken','preview');await next()})
 app.get('/admin/news-extractor',handleExtractorAdmin);app.post('/admin/news-extractor/commands',handleExtractorAdminSave);app.post('/admin/news-extractor/retry',handleExtractorAdminSave);app.post('/api/n8n/news-extractor/:operation',handleN8nExtractor)
 return {db,cache,env,app}
}
