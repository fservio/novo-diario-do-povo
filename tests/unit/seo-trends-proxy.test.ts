import { describe,it,expect,vi } from 'vitest'
import { seoTrendsResponse } from '../../packages/core/seo-automation/trends'

const PRIVATE='https://conversor-rss.fabioservio.workers.dev/feeds/google-trends-pautas-4e80ef75.xml?token=secret-test-token&level=medio'
const RSS='<?xml version="1.0"?><rss version="2.0"><channel><title>Tendências Brasil</title><item><title>Concurso de Teresina</title><link>https://example.com/noticia</link></item></channel></rss>'
function fixture(setting:unknown=PRIVATE){
 const store=new Map<string,string>()
 const env:any={CACHE:{get:vi.fn(async(key:string)=>store.get(key)??null),put:vi.fn(async(key:string,value:string)=>{store.set(key,value)})}}
 const settingReader=vi.fn(async()=>setting) as any
 return {env,settingReader,store}
}
describe('Private Trends RSS proxy',()=>{
 it('requires private configuration and does not call the upstream when absent',async()=>{
  const {env,settingReader}=fixture(null),fetcher=vi.fn()
  const result=await seoTrendsResponse(env,{settingReader,fetcher:fetcher as any})
  expect(result.status).toBe(503);expect(fetcher).not.toHaveBeenCalled()
  expect(settingReader).toHaveBeenCalledWith(env,'seo_trends_rss_url','private')
  expect(result.headers.get('Cache-Control')).toBe('private, no-store')
 })
 it.each(['http://conversor-rss.fabioservio.workers.dev/feeds/google-trends-pautas-4e80ef75.xml','https://example.com/feeds/google-trends-pautas-4e80ef75.xml','https://conversor-rss.fabioservio.workers.dev/other','https://username:password@conversor-rss.fabioservio.workers.dev/feeds/google-trends-pautas-4e80ef75.xml','not a URL'])('rejects non-allowlisted source %s',async url=>{
  const {env,settingReader}=fixture(url),fetcher=vi.fn()
  const result=await seoTrendsResponse(env,{settingReader,fetcher:fetcher as any})
  expect(result.status).toBe(503);expect(fetcher).not.toHaveBeenCalled()
 })
 it('caches only validated XML for 30 minutes and strips private self-link credentials',async()=>{
  const {env,settingReader}=fixture()
  const body=RSS.replace('</channel>','<link>'+PRIVATE.replace(/&/g,'&amp;')+'</link></channel>')
  const fetcher=vi.fn(async()=>new Response(body))
  const first=await seoTrendsResponse(env,{settingReader,fetcher:fetcher as any})
  const text=await first.text()
  expect(first.status).toBe(200);expect(first.headers.get('Content-Type')).toContain('xml')
  expect(text).not.toContain('secret-test-token');expect(text).not.toContain(PRIVATE)
  expect(text).toContain('https://diario.dopovo.com.br/api/n8n/seo/trends')
  expect(fetcher.mock.calls[0][0]).toBe(PRIVATE)
  expect((fetcher.mock.calls[0] as any)[1]).toMatchObject({redirect:'manual',method:'GET'})
  expect(env.CACHE.put.mock.calls[0][2]).toEqual({expirationTtl:1800})
  const second=await seoTrendsResponse(env,{settingReader,fetcher:fetcher as any})
  expect(await second.text()).toBe(text);expect(fetcher).toHaveBeenCalledTimes(1)
  expect(env.CACHE.put.mock.calls[0][1]).not.toContain('secret-test-token')
 })
 it.each([new Response('Unavailable',{status:503}),new Response('<html>Error</html>'),new Response('<rss><channel>broken'),new Response('<!DOCTYPE rss [<!ENTITY x "bad">]><rss><channel/></rss>'),new Response('x'.repeat(2*1024*1024+1))])('rejects bad upstream HTTP/XML/size without exposing its URL',async response=>{
  const {env,settingReader}=fixture()
  const result=await seoTrendsResponse(env,{settingReader,fetcher:(async()=>response) as any})
  expect(result.status).toBe(502);expect(await result.text()).not.toContain('secret-test-token');expect(env.CACHE.put).not.toHaveBeenCalled()
 })
 it('aborts a stalled request and emits only a generic error',async()=>{
  const {env,settingReader}=fixture()
  const fetcher=vi.fn((url:string,options:RequestInit)=>new Promise<Response>((_,reject)=>options.signal!.addEventListener('abort',()=>reject(new Error('Timeout '+url)))))
  const result=await seoTrendsResponse(env,{settingReader,fetcher:fetcher as any,timeoutMs:5})
  expect(result.status).toBe(502);expect(await result.json()).toEqual({success:false,error:'SEO_TRENDS_TIMEOUT'})
 })
 it('rejects redirects without fetching the target or caching its response',async()=>{
  const {env,settingReader}=fixture()
  const fetcher=vi.fn(async()=>new Response(null,{status:302,headers:{Location:'https://example.com/private-token'}}))
  const result=await seoTrendsResponse(env,{settingReader,fetcher:fetcher as any})
  expect(result.status).toBe(502);expect(result.headers.get('X-SEO-Trends-Diagnostic')).toBe('SEO_TRENDS_UPSTREAM_HTTP_302')
  expect((fetcher.mock.calls[0] as any)[1].redirect).toBe('manual');expect(fetcher).toHaveBeenCalledTimes(1)
  expect(await result.text()).not.toContain('private-token');expect(env.CACHE.put).not.toHaveBeenCalled()
 })
 it('still returns the feed when KV is temporarily unavailable',async()=>{
  const {env,settingReader}=fixture();env.CACHE.get=async()=>{throw new Error('cache')};env.CACHE.put=async()=>{throw new Error('cache')}
  const result=await seoTrendsResponse(env,{settingReader,fetcher:(async()=>new Response(RSS)) as any})
  expect(result.status).toBe(200);expect(await result.text()).toBe(RSS)
 })
 it('preserves the global fetch receiver without an injected fetcher',async()=>{
  const {env,settingReader}=fixture()
  const fetcher=vi.fn(function(this:unknown){
   if(this!==globalThis)throw new TypeError('Illegal invocation '+PRIVATE)
   return Promise.resolve(new Response(RSS))
  })
  vi.stubGlobal('fetch',fetcher)
  try{
   const result=await seoTrendsResponse(env,{settingReader})
   expect(result.status).toBe(200);expect(await result.text()).toBe(RSS)
   expect(fetcher).toHaveBeenCalledTimes(1)
  }finally{vi.unstubAllGlobals()}
 })
 it('identifies Cloudflare 1042 in an upstream failure without logging its body or URL',async()=>{
  const {env,settingReader}=fixture(),warn=vi.spyOn(console,'warn').mockImplementation(()=>{})
  try{
   const result=await seoTrendsResponse(env,{settingReader,fetcher:(async()=>new Response('<html>Error code: 1042 '+PRIVATE+'</html>',{status:404})) as any})
   expect(result.status).toBe(502)
   expect(result.headers.get('X-SEO-Trends-Diagnostic')).toBe('SEO_TRENDS_UPSTREAM_HTTP_404_CF_1042')
   expect(await result.json()).toEqual({success:false,error:'SEO_TRENDS_UPSTREAM_HTTP_404_CF_1042'})
   expect(JSON.stringify(warn.mock.calls)).not.toContain('secret-test-token');expect(JSON.stringify(warn.mock.calls)).not.toContain('conversor-rss')
  }finally{warn.mockRestore()}
 })
 it.each([
  ['fetch',()=>{throw new Error('Network failure '+PRIVATE)},'SEO_TRENDS_FETCH_FAILED'],
  ['worker fetch',()=>{throw new Error('1042 blocked '+PRIVATE)},'SEO_TRENDS_FETCH_CF_1042'],
  ['global receiver',()=>{throw new TypeError('Illegal invocation '+PRIVATE)},'SEO_TRENDS_FETCH_RECEIVER'],
  ['incorrect this',()=>{throw new TypeError('Incorrect this reference '+PRIVATE)},'SEO_TRENDS_FETCH_RECEIVER'],
  ['redirect',()=>{throw new Error('Unexpected redirect '+PRIVATE)},'SEO_TRENDS_FETCH_REDIRECT'],
  ['unsupported redirect',()=>{throw new TypeError('Invalid redirect value, must be one of follow or manual '+PRIVATE)},'SEO_TRENDS_FETCH_REDIRECT'],
  ['binding',()=>{throw new Error('Use a service binding for the target '+PRIVATE)},'SEO_TRENDS_FETCH_CROSS_ZONE'],
  ['TLS',()=>{throw new Error('TLS handshake failed '+PRIVATE)},'SEO_TRENDS_FETCH_TLS'],
  ['http',()=>new Response('Token '+PRIVATE,{status:403}),'SEO_TRENDS_UPSTREAM_HTTP_403'],
  ['xml',()=>new Response('<html>'+PRIVATE+'</html>'),'SEO_TRENDS_XML_INVALID'],
  ['body size',()=>new Response('x',{headers:{'Content-Length':String(2*1024*1024+1)}}),'SEO_TRENDS_SIZE_LIMIT']
 ])('distinguishes %s errors using fixed diagnostic codes',async(_stage,fetcher,code)=>{
  const {env,settingReader}=fixture(),warn=vi.spyOn(console,'warn').mockImplementation(()=>{})
  try{
   const result=await seoTrendsResponse(env,{settingReader,fetcher:fetcher as any})
   expect(result.status).toBe(502);expect(result.headers.get('X-SEO-Trends-Diagnostic')).toBe(code)
   expect(await result.json()).toEqual({success:false,error:code})
   expect(JSON.stringify(warn.mock.calls)).not.toContain('secret-test-token');expect(env.CACHE.put).not.toHaveBeenCalled()
  }finally{warn.mockRestore()}
 })
})
