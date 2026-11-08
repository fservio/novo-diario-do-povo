import {z} from 'zod'
import type {Env} from './types'
import {randomHex,sha256Hex} from './utils'

export const extractorSourceId=z.string().regex(/^[a-z0-9-]{1,64}$/)
export function normalizeExtractorUrl(value:string){
 if(value.length>3000||/[\s\\\x00-\x1f]/.test(value))throw Error('Informe uma URL HTTPS válida.')
 let url:URL;try{url=new URL(value)}catch{throw Error('Informe uma URL HTTPS válida.')}
 const host=url.hostname.toLowerCase()
 if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443')||!host.includes('.')||host.includes(':')||/^\d+(\.\d+){3}$/.test(host)||/\.(local|localhost|internal)\.?$/.test(host))throw Error('Use o endereço HTTPS público da fonte, sem usuário ou senha.')
 url.hash=''
 for(const key of [...url.searchParams.keys()])if(/^utm_/i.test(key)||/^(fbclid|gclid)$/i.test(key))url.searchParams.delete(key)
 url.searchParams.sort()
 return url.toString()
}
const urlSchema=z.string().transform(normalizeExtractorUrl)
export const extractorCommandSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('rss'),url:urlSchema,name:z.string().trim().min(2).max(160),mode:z.enum(['articles','trends']).default('articles')}),
 z.object({kind:z.literal('article'),url:urlSchema}),
 z.object({kind:z.literal('sync'),source_id:extractorSourceId}),
 z.object({kind:z.literal('inspect'),source_id:extractorSourceId}),
 z.object({kind:z.literal('remove'),source_id:extractorSourceId.refine(id=>id!=='articles','A caixa de artigos individuais não é uma fonte RSS removível.'),confirm_remove:z.literal('yes')})
])
const feedSchema=z.object({id:extractorSourceId,name:z.string().max(160),mode:z.enum(['articles','trends','individual']),last_sync:z.number().nonnegative().nullable(),error:z.string().max(300).nullable(),ready:z.number().int().nonnegative(),pending:z.number().int().nonnegative(),review:z.number().int().nonnegative(),rss_path:z.string().regex(/^\/feeds\/[a-z0-9-]+\.xml$/)})
const itemSchema=z.object({title:z.string().max(1000),link:z.string().url().max(3000),status:z.enum(['ready','pending','review','expired']),reason:z.string().max(1500).nullable(),last_attempt:z.number().nonnegative()})
export const extractorReportSchema=z.object({checked_at:z.string().datetime(),feeds:z.array(feedSchema).max(100)})
export const extractorDetailsSchema=z.object({success:z.literal(true),items:z.array(itemSchema).max(100)})
export const extractorAckSchema=z.object({id:z.string().regex(/^[a-f0-9]{32}$/),lease_token:z.string().regex(/^[a-f0-9]{48}$/),success:z.boolean(),result:z.unknown().optional()})
export const EXTRACTOR_STATUS_KEY='news-extractor:status:v1'
export type ExtractorSnapshot=z.infer<typeof extractorReportSchema>
export type ExtractorCommand={id:string;kind:'rss'|'article'|'sync'|'inspect'|'remove';label:string;payload_json:string;state:string;attempts:number;lease_token?:string;last_error:string|null;result_json:string|null;created_at:string;updated_at:string}

export async function queueExtractorCommand(env:Env,input:unknown,actor:number){
 const body=extractorCommandSchema.parse(input),now=new Date().toISOString(),id=randomHex(16)
 const value=(body as {url?:string;source_id?:string}).url||(body as {source_id?:string}).source_id
 const fingerprint=await sha256Hex(JSON.stringify({kind:body.kind,value,mode:body.kind==='rss'?body.mode:null}))
 const label=body.kind==='rss'?body.name:body.kind==='article'?new URL(body.url).hostname:body.source_id
 await env.DB.prepare(`INSERT OR IGNORE INTO news_extractor_commands(id,kind,fingerprint,label,payload_json,available_at,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)`).bind(id,body.kind,fingerprint,label,JSON.stringify(body),now,actor,now,now).run()
 const row=await env.DB.prepare("SELECT id FROM news_extractor_commands WHERE fingerprint=? AND state IN ('queued','processing') ORDER BY created_at DESC LIMIT 1").bind(fingerprint).first<{id:string}>()
 if(!row)throw Error('Não foi possível registrar a solicitação.')
 return {id:row.id,reused:row.id!==id}
}
export async function retryExtractorCommand(env:Env,id:string){
 const now=new Date().toISOString()
 const row=await env.DB.prepare(`UPDATE news_extractor_commands SET state='queued',attempts=0,available_at=?,lease_token=NULL,lease_until=NULL,last_error=NULL,updated_at=? WHERE id=? AND state='failed' AND NOT EXISTS(SELECT 1 FROM news_extractor_commands active WHERE active.fingerprint=news_extractor_commands.fingerprint AND active.state IN ('queued','processing')) RETURNING id`).bind(now,now,id).first()
 if(!row)throw Error('A solicitação mudou ou já existe outra tentativa em andamento.')
}
export async function claimExtractorCommands(env:Env,limit=3){
 const now=new Date(),date=now.toISOString(),token=randomHex(24),until=new Date(now.getTime()+10*60000).toISOString()
 await env.DB.prepare("UPDATE news_extractor_commands SET state='failed',lease_token=NULL,lease_until=NULL,last_error='O conector não confirmou a conclusão após quatro tentativas.',updated_at=? WHERE state='processing' AND lease_until<=? AND attempts>=4").bind(date,date).run()
 const rows=(await env.DB.prepare(`UPDATE news_extractor_commands SET state='processing',attempts=attempts+1,lease_token=?,lease_until=?,updated_at=? WHERE id IN (SELECT id FROM news_extractor_commands WHERE attempts<4 AND ((state='queued' AND available_at<=?) OR (state='processing' AND lease_until<=?)) ORDER BY created_at LIMIT ?) RETURNING id,kind,payload_json,lease_token,attempts`).bind(token,until,date,date,date,Math.max(1,Math.min(3,limit))).all<any>()).results
 return rows.map(row=>({id:row.id,kind:row.kind,payload:extractorCommandSchema.parse(JSON.parse(row.payload_json)),lease_token:row.lease_token,attempts:row.attempts}))
}
export async function acknowledgeExtractorCommand(env:Env,input:unknown){
 const body=extractorAckSchema.parse(input),now=new Date().toISOString()
 const row=await env.DB.prepare("SELECT kind,payload_json,state,attempts,result_json FROM news_extractor_commands WHERE id=? AND lease_token=? AND (state='completed' OR lease_until>?)").bind(body.id,body.lease_token,now).first<any>()
 if(!row)throw Error('Reserva inválida ou substituída.')
 if(row.state==='completed')return {reused:true}
 if(row.state!=='processing')throw Error('Esta reserva já foi encerrada.')
 let result:unknown=null
 if(body.success){
  if(row.kind==='inspect'){
   result=extractorDetailsSchema.parse(body.result)
  }else if(row.kind==='rss'||row.kind==='article'){
   result=z.object({success:z.literal(true),feed_id:extractorSourceId,rss_path:z.string().regex(/^\/feeds\/[a-z0-9-]+\.xml$/)}).parse(body.result)
  }else if(row.kind==='remove')result=z.object({success:z.literal(true),status:z.literal('removed'),feed_id:extractorSourceId}).parse(body.result)
  else result=z.object({success:z.literal(true),status:z.literal('queued')}).parse(body.result)
 }
 const success=body.success,state=success?'completed':row.attempts>=4?'failed':'queued'
 if(success&&row.kind==='inspect'){
  const payload=JSON.parse(row.payload_json)
  await env.CACHE.put('news-extractor:details:v1:'+payload.source_id,JSON.stringify({checked_at:now,...result as object}),{expirationTtl:7*86400})
 }
 const compactResult=success&&row.kind==='inspect'?{success:true,item_count:(result as z.infer<typeof extractorDetailsSchema>).items.length}:result
 const changed=await env.DB.prepare(`UPDATE news_extractor_commands SET state=?,result_json=?,last_error=?,available_at=?,lease_until=NULL,updated_at=? WHERE id=? AND lease_token=? AND state='processing' AND lease_until>? RETURNING id`).bind(state,success?JSON.stringify(compactResult):null,success?null:'O extrator não confirmou a operação. A conexão será tentada novamente.',new Date(Date.now()+row.attempts*60000).toISOString(),now,body.id,body.lease_token,new Date().toISOString()).first()
 if(!changed)throw Error('A reserva expirou. O resultado não foi aplicado.')
 return {reused:false,state}
}
export async function saveExtractorReport(env:Env,input:unknown){
 const report=extractorReportSchema.parse(input),age=Date.now()-Date.parse(report.checked_at)
 if(age< -60000||age>10*60000)throw Error('Relatório fora da janela de sincronização.')
 const previous=await env.CACHE.get<ExtractorSnapshot>(EXTRACTOR_STATUS_KEY,'json')
 if(previous&&Date.parse(previous.checked_at)>Date.parse(report.checked_at))return {reused:true}
 await env.CACHE.put(EXTRACTOR_STATUS_KEY,JSON.stringify(report),{expirationTtl:7*86400})
 return {reused:false}
}
