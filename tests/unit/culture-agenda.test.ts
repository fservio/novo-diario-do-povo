import {createRequire} from 'node:module'
import {readFileSync} from 'node:fs'
import {Hono} from 'hono'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {cultureEventSchema} from '../../packages/core/culture'
import {handleCulturalEventsSave,handleCulturalEventPage,renderCultureAgenda} from '../../packages/core/web/culture'
import {cultureCityKey,cultureEventVisible,initializeCultureAgenda} from '../../public/static/culture-agenda.js'
const {DatabaseSync}=createRequire(import.meta.url)('node:sqlite')
const now=new Date('2026-11-05T15:00:00Z')
const event={slug:'exemplo-musica-teresina-2026-11-07',title:'Exemplo de apresentação musical',summary:'Um evento fictício usado apenas para verificar a agenda cultural.',category:'music',state:'PI',city:'Teresina',city_key:'pi-teresina',venue:'Espaço de teste',address:null,starts_on:'2026-11-07',ends_on:'2026-11-07',starts_at:'2026-11-07T22:00:00Z',ends_at:'2026-11-08T02:00:00Z',timezone:'America/Fortaleza',price_type:'free',price_text:null,source_url:'https://organizador.example/evento',verified_at:now.toISOString(),status:'scheduled',image_key:null,updated_at:now.toISOString()}
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals()})
function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../../migrations/0050_cultural_events.sql',import.meta.url),'utf8'));sql.exec(readFileSync(new URL('../../migrations/0052_daily_editorial_management.sql',import.meta.url),'utf8'))
 function prepare(query:string,args:any[]=[]):any{return {bind:(...values:any[])=>prepare(query,values),all:async()=>({results:sql.prepare(query).all(...args)}),first:async()=>sql.prepare(query).get(...args)||null,run:async()=>sql.prepare(query).run(...args)}}
 const cache=new Map<string,string>()
 const env:any={PUBLIC_BASE_URL:'https://diario.example',DB:{prepare,batch:async(statements:any[])=>Promise.all(statements.map(s=>s.run()))},CACHE:{get:async(key:string)=>cache.has(key)?JSON.parse(cache.get(key)!):null,put:async(key:string,value:string)=>{cache.set(key,value)}}}
 const app=new Hono();app.post('/events',handleCulturalEventsSave);app.get('/agenda/:slug',handleCulturalEventPage)
 return {sql,env,app,cache}
}
describe('Cultural agenda',()=>{
 it('applies a saved city, maps card data correctly and paginates without requesting location',()=>{
  vi.useFakeTimers();vi.setSystemTime(now)
  const element=(data:any={})=>({dataset:data,hidden:false,textContent:'',handlers:{} as any,attrs:{} as any,addEventListener(name:string,fn:any){this.handlers[name]=fn},setAttribute(name:string,value:any){this.attrs[name]=value}})
  const options=[{value:'',textContent:'Brasil'},{value:'pi-teresina',textContent:'Teresina / PI'},{value:'sp-sao-paulo',textContent:'São Paulo / SP'}]
  const city:any={...element(),value:'',options,append(option:any){options.push(option)},get selectedOptions(){return options.filter(option=>option.value===this.value)}}
  const category:any={...element(),value:'',options:[{value:'',textContent:'Todas'},{value:'music',textContent:'Música'}]}
  const form=element(),count=element(),empty=element(),more=element(),status=element(),location=element()
  const cards=Array.from({length:8},()=>element({cityKey:'pi-teresina',category:'music',startsOn:event.starts_on,endsOn:event.ends_on,endsAt:event.ends_at,timezone:event.timezone,status:'scheduled'}))
  cards.push(element({cityKey:'sp-sao-paulo',category:'music',startsOn:event.starts_on,endsOn:event.ends_on,endsAt:event.ends_at,timezone:event.timezone,status:'scheduled'}))
  const buttons=['today','weekend','upcoming'].map(value=>element({culturePeriod:value}))
  const controls:any={'[data-culture-city]':city,'[data-culture-category]':category,'[data-culture-form]':form,'[data-culture-count]':count,'[data-culture-empty]':empty,'[data-culture-more]':more,'[data-culture-status]':status,'[data-culture-location]':location}
  const root={querySelector:(selector:string)=>controls[selector],querySelectorAll:(selector:string)=>selector==='[data-culture-event]'?cards:buttons}
  vi.stubGlobal('document',{querySelector:()=>root,createElement:()=>({})})
  vi.stubGlobal('window',{location:{search:''},setInterval:vi.fn()})
  vi.stubGlobal('localStorage',{getItem:()=>JSON.stringify({key:'pi-teresina',label:'Teresina / PI'}),setItem:vi.fn()})
  expect(()=>initializeCultureAgenda()).not.toThrow()
  expect(city.value).toBe('pi-teresina');expect(count.textContent).toBe('6 de 8 eventos');expect(cards[8].hidden).toBe(true)
  more.handlers.click();expect(count.textContent).toBe('8 eventos')
  buttons[0].handlers.click({preventDefault:vi.fn()});expect(empty.hidden).toBe(false);expect(count.textContent).toBe('0 eventos')
 })
 it('normalizes city names and validates dates, timezones and prices',()=>{
  expect(cultureCityKey('São Luís','MA')).toBe('ma-sao-luis')
  expect(cultureEventSchema.safeParse(event).success).toBe(true)
  expect(cultureEventSchema.safeParse({...event,starts_on:'2026-02-30'}).success).toBe(false)
  expect(cultureEventSchema.safeParse({...event,timezone:'Mars/Teresina'}).success).toBe(false)
  expect(cultureEventSchema.safeParse({...event,starts_at:'2026-11-08T12:00:00Z'}).success).toBe(false)
  expect(cultureEventSchema.safeParse({...event,price_text:'R$ 50'}).success).toBe(false)
 })
 it('filters by city, category and the upcoming weekend',()=>{
  expect(cultureEventVisible(event,{city:'pi-teresina',category:'music',period:'weekend'},now.getTime())).toBe(true)
  expect(cultureEventVisible(event,{period:'today'},now.getTime())).toBe(false)
  expect(cultureEventVisible(event,{city:'sp-sao-paulo'},now.getTime())).toBe(false)
  expect(cultureEventVisible(event,{category:'cinema'},now.getTime())).toBe(false)
  expect(cultureEventVisible({...event,status:'cancelled'},{},now.getTime())).toBe(false)
  const distant={...event,starts_on:'2027-01-01',ends_on:'2027-01-01',starts_at:null,ends_at:null}
  expect(cultureEventVisible(distant,{},now.getTime())).toBe(false)
  expect(cultureEventVisible(distant,{period:'any'},now.getTime())).toBe(true)
 })
 it('expires at the real ending time and keeps date-only events through their local day',()=>{
  expect(cultureEventVisible(event,{},Date.parse('2026-11-08T02:00:00Z'))).toBe(false)
  const unknownTime={...event,starts_on:'2026-11-05',ends_on:'2026-11-05',starts_at:null,ends_at:null}
  expect(cultureEventVisible(unknownTime,{},Date.parse('2026-11-06T01:00:00Z'))).toBe(true)
  expect(cultureEventVisible(unknownTime,{},Date.parse('2026-11-06T03:01:00Z'))).toBe(false)
 })
 it('renders filterable cards, preserves unknown times and avoids ended events',()=>{
  const html=renderCultureAgenda([{...event,title:'Título <teste>',starts_at:null} as any,{...event,slug:'old',ends_on:'2020-01-01',title:'Evento encerrado'} as any],now,{city:'pi-teresina'})
  expect(html).toContain('Título &lt;teste&gt;');expect(html).toContain('Horário a confirmar');expect(html).toContain('Gratuito')
  expect(html).not.toContain('Evento encerrado');expect(html).toContain('value="pi-teresina" selected')
  expect(html).toContain('/agenda/'+event.slug);expect(html).toContain('data-culture-more')
 })
 it('upserts stable event URLs, applies cancellations and keeps the detail page',async()=>{
  vi.useFakeTimers();vi.setSystemTime(now)
  const {sql,app,env}=fixture()
  const save=(value:any)=>app.request('/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({events:[value]})},env)
  try{
   expect((await save(event)).status).toBe(200)
   expect((await save({...event,title:'Título atualizado'})).status).toBe(200)
   expect(sql.prepare('SELECT COUNT(*) AS count FROM cultural_events').get().count).toBe(1)
   const page=await app.request('/agenda/'+event.slug,{},env)
   expect(page.status).toBe(200);expect(await page.text()).toContain('Título atualizado')
   expect((await save({...event,status:'cancelled'})).status).toBe(200)
   expect(await (await app.request('/agenda/'+event.slug,{},env)).text()).toContain('Evento cancelado')
   expect((await save({...event,verified_at:'2020-01-01T00:00:00Z'})).status).toBe(400)
  }finally{sql.close()}
 })
})
