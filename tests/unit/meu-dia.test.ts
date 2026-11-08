import {readFileSync} from 'node:fs'
import { createRequire } from 'node:module'
import { Hono } from 'hono'
import { afterEach,describe,expect,it,vi } from 'vitest'
import { BRAZIL_STATES,dailyDate,dailyEditionSchema,editionKey } from '../../packages/core/meu-dia'
import { handleDailyEditionSave,renderDailyBody } from '../../packages/core/web/meu-dia'
import { resolveDailyRegion,dailyItemVisible } from '../../public/static/meu-dia.js'
const {DatabaseSync}=createRequire(import.meta.url)('node:sqlite')
afterEach(()=>vi.useRealTimers())
const item={post_id:1,section:'essential',scope:'BR',summary:'Uma informação útil para organizar a rotina do leitor.',source_url:'https://fonte.example/documento',expires_at:null}
describe('Meu dia',()=>{
  it('uses the Fortaleza editorial day even across UTC midnight',()=>{
    expect(dailyDate(new Date('2026-11-06T01:00:00Z'))).toBe('2026-11-05')
    expect(Object.keys(BRAZIL_STATES)).toHaveLength(27)
  })
  it('validates scope and requires a deadline for opportunities',()=>{
    expect(dailyEditionSchema.safeParse({date:'2026-11-05',items:[item]}).success).toBe(true)
    expect(dailyEditionSchema.safeParse({date:'2026-11-05',items:[{...item,scope:'XX'}]}).success).toBe(false)
    expect(dailyEditionSchema.safeParse({date:'2026-11-05',items:[{...item,section:'opportunities'}]}).success).toBe(false)
  })
  it('gives explicit edition links priority over a saved preference without using geolocation',()=>{
    expect(resolveDailyRegion('?estado=CE','PI',['CE','PI'])).toBe('CE')
    expect(resolveDailyRegion('','PI',['CE','PI'])).toBe('PI')
    expect(resolveDailyRegion('?estado=XX','PI',['CE','PI'])).toBe('BR')
    expect(resolveDailyRegion('',{},['CE','PI'])).toBe('BR')
  })
  it('always keeps national items and removes expired or unrelated regional items',()=>{
    const now=Date.parse('2026-11-05T15:00:00Z')
    expect(dailyItemVisible('BR','CE','',now)).toBe(true)
    expect(dailyItemVisible('PI','CE','',now)).toBe(false)
    expect(dailyItemVisible('CE','CE','2026-11-05T14:00:00Z',now)).toBe(false)
    expect(dailyItemVisible('CE','CE','broken',now)).toBe(false)
  })
  it('renders a national edition, regional fallback and expired-item exclusion without JavaScript',()=>{
    const now=new Date('2026-11-05T15:00:00Z')
    const html=renderDailyBody({date:'2026-11-05',updated_at:now.toISOString(),items:[{...item,section:'essential',title:'Título <teste>',url:'https://diario.example/noticia/'},{...item,post_id:2,section:'opportunities',expires_at:'2026-11-05T14:00:00Z',title:'Oportunidade vencida',url:'https://diario.example/vencida/'}] as any},'CE',now)
    expect(html).toContain('Título &lt;teste&gt;')
    expect(html).not.toContain('Oportunidade vencida')
    expect(html).toContain('Brasil + Ceará')
    expect(html).toContain('Ainda não há uma seleção confirmada')
    expect(html).toContain('Você chegou ao fim da edição')
  })
  it('publishes a validated snapshot using CMS titles and URLs and rejects stale or duplicate editions',async()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-05T15:00:00Z'))
    const sql=new DatabaseSync(':memory:')
    sql.exec("CREATE TABLE posts(id INTEGER,slug TEXT,title TEXT,published_at TEXT,created_at TEXT,status TEXT,seo_noindex INTEGER); INSERT INTO posts VALUES(1,'noticia','Título do CMS','2026-11-05T10:00:00Z','2026-11-05T10:00:00Z','published',0),(2,'rascunho','Rascunho','2026-11-05','2026-11-05','draft',0)")
    sql.exec(readFileSync(new URL('../../migrations/0050_cultural_events.sql',import.meta.url),'utf8'));sql.exec(readFileSync(new URL('../../migrations/0052_daily_editorial_management.sql',import.meta.url),'utf8'))
    const put=vi.fn(async()=>{})
    const prepare=(query:string)=>({bind:(...args:any[])=>({all:async()=>({results:sql.prepare(query).all(...args)}),run:async()=>sql.prepare(query).run(...args)})})
    const env:any={PUBLIC_BASE_URL:'https://diario.example',CACHE:{put},DB:{prepare}}
    const app=new Hono();app.post('/edition',handleDailyEditionSave)
    const request=(body:any)=>app.request('/edition',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)},env)
    try{
      expect((await request({date:'2026-11-05',items:[item]})).status).toBe(200)
      const saved=JSON.parse(put.mock.calls[0][1] as string)
      expect(saved.items[0].title).toBe('Título do CMS')
      expect(saved.items[0].url).toBe('https://diario.example/2026/11/05/noticia/')
      expect(put.mock.calls[0][0]).toBe(editionKey('2026-11-05'))
      expect((await request({date:'2026-11-04',items:[item]})).status).toBe(400)
      expect((await request({date:'2026-11-05',items:[item,item]})).status).toBe(400)
      expect((await request({date:'2026-11-05',items:[{...item,post_id:2}]})).status).toBe(400)
    }finally{sql.close()}
  })
})
