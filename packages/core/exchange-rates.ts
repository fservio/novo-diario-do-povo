import type {Env} from './types'

export const exchangeFeed='https://www.bcb.gov.br/api/feed/sitebcb/sitefeeds/cambio'
const cacheKey='economy:exchange:ptax:v1'
const currencies=['USD','EUR'] as const
type Currency=typeof currencies[number]
type Quote={buy:number;sell:number;updated:string;day:string}
type Rates=Record<Currency,Quote>
export type ExchangeSnapshot={rates:Rates;previous:Partial<Rates>}

export function parseExchangeFeed(xml:string):Rates{
 const entries=[...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/g)].map(([,body])=>body)
 function quote(code:'DOLAR'|'EURO'):Quote{
  const entry=entries.find(body=>body.includes('<id>sitefeeds_INDICADOR_CAMBIO_'+code+'_PTAX</id>'))||''
  const timestamp=entry.match(/<updated>([^<]+)<\/updated>/)?.[1]||''
  const date=new Date(timestamp)
  const content=entry.match(/<content\b[^>]*>([\s\S]*?)<\/content>/)?.[1]||''
  const html=content.replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"')
  function rate(label:string){
   const value=html.match(new RegExp(label+'</div>\\s*<div id=["\']?value["\']?>\\s*(\\d+,\\d{1,6})\\s*</div>'))?.[1]
   return Number(value?.replace(',','.'))
  }
  const buy=rate('Compra'),sell=rate('Venda')
  if(!Number.isFinite(date.getTime())||!(buy>0)||!(sell>=buy))throw Error('Boletim PTAX inválido para '+code)
  return {buy,sell,updated:date.toISOString(),day:timestamp.slice(0,10)}
 }
 return {USD:quote('DOLAR'),EUR:quote('EURO')}
}

export async function getExchangeSnapshot(env:Env):Promise<ExchangeSnapshot|null>{
 return env.CACHE?env.CACHE.get<ExchangeSnapshot>(cacheKey,'json'):null
}

export async function refreshExchangeSnapshot(env:Env){
 const response=await fetch(exchangeFeed,{signal:AbortSignal.timeout(8000)})
 if(!response.ok)throw Error('Banco Central respondeu '+response.status)
 const rates=parseExchangeFeed(await response.text())
 const saved=await getExchangeSnapshot(env)
 const snapshot:ExchangeSnapshot={rates:{...rates},previous:{...saved?.previous}}
 let changed=false
 for(const currency of currencies){
  const incoming=rates[currency],current=saved?.rates[currency]
  if(current&&incoming.updated<=current.updated){
   snapshot.rates[currency]=current
   continue
  }
  changed=true
  if(current&&incoming.day>current.day)snapshot.previous[currency]=current
 }
 if(changed)await env.CACHE.put(cacheKey,JSON.stringify(snapshot))
 return {changed,snapshot}
}

export function summarizeExchange(snapshot:ExchangeSnapshot){
 return currencies.map(currency=>{
  const quote=snapshot.rates[currency],previous=snapshot.previous[currency]
  return {currency,...quote,previousDay:previous?.day||null,
   changePct:previous?(quote.sell/previous.sell-1)*100:null}
 })
}
