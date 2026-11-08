import { parseStringPromise } from 'xml2js'
import type { Env } from '../types'
import { getSetting } from '../db'

const ORIGIN='https://conversor-rss.fabioservio.workers.dev'
const PATH='/feeds/google-trends-pautas-4e80ef75.xml'
const CACHE_KEY='seo:trends:rss:v1'
const MAX_BYTES=2*1024*1024
const headers={'Cache-Control':'private, no-store','Content-Type':'application/rss+xml; charset=utf-8','X-Content-Type-Options':'nosniff'}
type Dependencies={fetcher?:typeof fetch;settingReader?:typeof getSetting;timeoutMs?:number}

function unavailable(code:string,status:number){
 // These codes are assembled only from fixed strings and numeric HTTP statuses, never upstream error text.
 if(status===502)console.warn('[seo-trends]',code)
 return Response.json({success:false,error:code},{status,headers:{'Cache-Control':'private, no-store','X-SEO-Trends-Diagnostic':code}})
}
function fetchFailureCode(error:unknown):string{
 // Inspect known failure phrases only; private URLs/tokens must never enter diagnostics.
 const message=error instanceof Error?error.message:String(error)
 if(/\b1042\b/.test(message))return 'SEO_TRENDS_FETCH_CF_1042'
 if(/illegal invocation|incorrect\s+this\s+reference|called on an object that does not implement|incompatible receiver/i.test(message))return 'SEO_TRENDS_FETCH_RECEIVER'
 if(/redirect(?:ed)?\s+(?:is\s+)?(?:not allowed|disallowed)|unexpected redirect|redirect mode|too many redirects|(?:invalid|unsupported) redirect value/i.test(message))return 'SEO_TRENDS_FETCH_REDIRECT'
 if(/cross[- ]zone|different (?:worker )?account|service binding|worker[^.\n]{0,80}same zone/i.test(message))return 'SEO_TRENDS_FETCH_CROSS_ZONE'
 if(/\b(?:TLS|SSL)\b[^.\n]{0,60}(?:error|failed|failure|handshake)|certificate[^.\n]{0,40}(?:error|invalid|expired|verify)|handshake (?:error|failed|failure)/i.test(message))return 'SEO_TRENDS_FETCH_TLS'
 return 'SEO_TRENDS_FETCH_FAILED'
}
async function boundedBody(response:Response):Promise<string>{
 const length=Number(response.headers.get('content-length'))
 if(Number.isFinite(length)&&length>MAX_BYTES)throw new Error('RSS_SIZE_LIMIT')
 const reader=response.body?.getReader()
 if(!reader)return ''
 const chunks:Uint8Array[]=[];let bytes=0
 try{
  while(true){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.byteLength;if(bytes>MAX_BYTES){await reader.cancel();throw new Error('RSS_SIZE_LIMIT')}chunks.push(chunk.value)}
 }finally{reader.releaseLock()}
 const all=new Uint8Array(bytes);let offset=0
 for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.byteLength}
 return new TextDecoder('utf-8',{fatal:true,ignoreBOM:false}).decode(all)
}
function scrubPrivateUrl(body:string,url:URL):string{
 // Feed self-links may reflect the private input URL. Never forward them or their access token.
 let safe=body.split(url.href).join('https://diario.dopovo.com.br/api/n8n/seo/trends')
  .split(url.href.replace(/&/g,'&amp;')).join('https://diario.dopovo.com.br/api/n8n/seo/trends')
 for(const [name,value] of url.searchParams){if(/token|key|secret|password/i.test(name)&&value){safe=safe.split(value).join('[redacted]').split(encodeURIComponent(value)).join('[redacted]')}}
 return safe
}
export async function seoTrendsResponse(env:Env,dependencies:Dependencies={}):Promise<Response>{
 let configured:unknown
 try{configured=await (dependencies.settingReader||getSetting)(env,'seo_trends_rss_url','private')}catch{return unavailable('SEO_TRENDS_NOT_CONFIGURED',503)}
 if(typeof configured!=='string'||!configured.trim())return unavailable('SEO_TRENDS_NOT_CONFIGURED',503)
 let url:URL
 try{url=new URL(configured.trim())}catch{return unavailable('SEO_TRENDS_SOURCE_INVALID',503)}
 if(url.origin!==ORIGIN||url.pathname!==PATH||url.username||url.password||url.hash)return unavailable('SEO_TRENDS_SOURCE_INVALID',503)
 try{
  const cached=await env.CACHE.get(CACHE_KEY)
  if(cached)return new Response(scrubPrivateUrl(cached,url),{headers})
 }catch{/* A KV outage must not prevent a bounded read of the allowlisted feed. */}
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),dependencies.timeoutMs??15000)
 let stage:'fetch'|'read'|'xml'='fetch'
 try{
  // Workers supports follow/manual only. Inspect 3xx locally rather than following outside the allowlist.
  const options:RequestInit={method:'GET',redirect:'manual',signal:controller.signal,headers:{Accept:'application/rss+xml, application/xml, text/xml'}}
  // Workers' Web APIs can reject detached calls. Keep the global receiver for the real fetch.
  const response=await (dependencies.fetcher?dependencies.fetcher(url.href,options):globalThis.fetch(url.href,options))
  if(!response.ok){
   let workerFetchBlocked=false
   // Read only a bounded response, extracting a known Cloudflare code. Never expose or log the body.
   try{workerFetchBlocked=/\b(?:error\s*(?:code)?[:\s]*|code[:\s]*)1042\b/i.test(await boundedBody(response))}catch{/* HTTP status is still diagnostic when its error body cannot be read. */}
   return unavailable(`SEO_TRENDS_UPSTREAM_HTTP_${response.status}${workerFetchBlocked?'_CF_1042':''}`,502)
  }
  stage='read'
  const body=await boundedBody(response)
  if(/<!DOCTYPE|<!ENTITY/i.test(body))return unavailable('SEO_TRENDS_XML_UNSAFE',502)
  stage='xml'
  const parsed=await parseStringPromise(body,{explicitArray:false,strict:true})
  if(!parsed?.rss?.channel&&!parsed?.feed&&!parsed?.['rdf:RDF'])return unavailable('SEO_TRENDS_XML_INVALID',502)
  const safe=scrubPrivateUrl(body,url)
  try{await env.CACHE.put(CACHE_KEY,safe,{expirationTtl:1800})}catch{/* Return the validated feed even when the cache write fails. */}
  return new Response(safe,{headers})
 }catch(error){
  // Upstream messages may contain the private URL; only classify, never forward their text.
  const code=controller.signal.aborted?'SEO_TRENDS_TIMEOUT'
   :stage==='fetch'?fetchFailureCode(error)
   :stage==='xml'?'SEO_TRENDS_XML_INVALID'
   :error instanceof Error&&error.message==='RSS_SIZE_LIMIT'?'SEO_TRENDS_SIZE_LIMIT':'SEO_TRENDS_READ_FAILED'
  return unavailable(code,502)
 }finally{clearTimeout(timer)}
}
