import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'
import {expect,it} from 'vitest'

const script=readFileSync('public/static/cookie-consent.js','utf8')
function start(saved?:{analytics:boolean;advertising:boolean;expires:number}){
 const scripts: Array<{src:string}>=[]
 const window:Record<string,any>={dispatchEvent:()=>{},location:{reload:()=>{}}}
 const handlers=new Map<string,()=>void>()
 const buttons=new Map<string,any>()
 const element=(selector:string)=>{
  if(!buttons.has(selector))buttons.set(selector,{hidden:false,checked:false,focus:()=>{},
   addEventListener:(_:string,callback:()=>void)=>handlers.set(selector,callback)})
  return buttons.get(selector)
 }
 const banner={hidden:true,querySelector:element}
 const document={
  head:{append:(node:{src:string})=>scripts.push(node)},createElement:()=>({}),
  documentElement:{toggleAttribute:()=>{}},
  querySelector:(selector:string)=>selector==='#diario-cookie-banner'?banner:element(selector),
  addEventListener:(_:string,callback:()=>void)=>callback()
 }
 runInNewContext(script,{window,document,localStorage:{getItem:()=>JSON.stringify(saved||null),setItem:()=>{}},Event})
 return {window,scripts,banner,handlers,element}
}

it('define consentimento permitido por padrão e negado nas regiões com exigência prévia',()=>{
  const {window}=start()
  const defaults=(window.dataLayer as any[]).map(a=>Array.from(a)).filter(a=>a[0]==='consent'&&a[1]==='default').map(a=>a[2])
  const global=defaults.find(d=>!d.region)
  const restricted=defaults.find(d=>d.region)
  expect(global).toMatchObject({analytics_storage:'granted',ad_storage:'granted',ad_user_data:'granted',ad_personalization:'granted'})
  expect(restricted).toMatchObject({analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'})
  expect(restricted.region).toEqual(expect.arrayContaining(['DE','FR','GB','PT','CH']))
  expect(restricted.region).not.toContain('BR')
})

it('mede por padrão, mostra o banner e para de medir após recusa',()=>{
  const {window,scripts,banner,handlers}=start()
  window.diarioConsent.analytics('G-TEST')
  expect(scripts).toHaveLength(1)
  expect(window.diarioConsent.allows('analytics')).toBe(true)
  expect(window.diarioConsent.allows('advertising')).toBe(false)
  expect(banner.hidden).toBe(false)
  handlers.get('[data-cookie-reject]')!()
  expect(window.diarioConsent.allows('analytics')).toBe(false)
  expect(window.diarioConsent.allows('advertising')).toBe(false)
  expect(window['ga-disable-G-TEST']).toBe(true)
  expect(banner.hidden).toBe(true)
 })

it('não carrega a tag quando a recusa já estava salva',()=>{
  const {window,scripts}=start({analytics:false,advertising:false,expires:Date.now()+1e9})
  window.diarioConsent.analytics('G-TEST')
  expect(scripts).toHaveLength(0)
  expect(window['ga-disable-G-TEST']).toBe(true)
 })

it('libera apenas a categoria escolhida e carrega a tag uma vez',()=>{
  const {window,scripts,handlers,element}=start()
  window.diarioConsent.analytics('G-TEST')
  handlers.get('[data-cookie-customize]')!()
  element('[name="cookie-analytics"]').checked=true
  handlers.get('[data-cookie-save]')!()
  window.diarioConsent.analytics('G-TEST')
  expect(window.diarioConsent.allows('analytics')).toBe(true)
  expect(window.diarioConsent.allows('advertising')).toBe(false)
  expect(scripts).toHaveLength(1)
 })
