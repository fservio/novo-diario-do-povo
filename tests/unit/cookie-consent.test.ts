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

it('mantém a medição e os anúncios bloqueados por padrão e após recusa',()=>{
 const {window,scripts,banner,handlers}=start()
 window.diarioConsent.analytics('G-TEST')
 expect(scripts).toHaveLength(0)
 expect(banner.hidden).toBe(false)
 handlers.get('[data-cookie-reject]')!()
 expect(window.diarioConsent.allows('advertising')).toBe(false)
 expect(scripts).toHaveLength(0)
 expect(banner.hidden).toBe(true)
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
