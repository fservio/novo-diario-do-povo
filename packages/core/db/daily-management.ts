import type {Env} from '../types'
import {dailyDate,dailyEditionSchema,editionKey,type DailyEdition} from '../meu-dia'
import {getPostUrl} from '../utils/post'

export const editorialEditionKey=(date:string)=>'meu-dia:editorial:v1:'+date
export async function buildDailyEdition(env:Env,raw:unknown):Promise<DailyEdition>{
 const parsed=dailyEditionSchema.parse(raw),now=new Date()
 if(parsed.date!==dailyDate(now))throw Error('A edição precisa ser do dia atual em Brasília.')
 const ids=parsed.items.map(item=>item.post_id)
 if(new Set(ids).size!==ids.length)throw Error('Uma matéria aparece mais de uma vez.')
 if(parsed.items.some(item=>item.expires_at&&Date.parse(item.expires_at)<=now.getTime()))throw Error('Há itens com validade vencida.')
 const rows=await env.DB.prepare(`SELECT id,slug,title,published_at,created_at FROM posts WHERE id IN (${ids.map(()=>'?').join(',')}) AND status='published' AND seo_noindex=0 AND published_at<=?`).bind(...ids,now.toISOString()).all<any>()
 if(rows.results.length!==ids.length)throw Error('Todas as matérias precisam estar publicadas e visíveis.')
 const posts=new Map(rows.results.map(p=>[p.id,p])),base=(env.PUBLIC_BASE_URL||'https://diario.dopovo.com.br').replace(/\/$/,'')
 return {date:parsed.date,updated_at:now.toISOString(),items:parsed.items.map(item=>({...item,title:posts.get(item.post_id).title,url:getPostUrl(posts.get(item.post_id),base)}))}
}
export async function getManagedEdition(env:Env,date:string):Promise<DailyEdition|null>{
 try{const value=await env.CACHE?.get<DailyEdition>(editorialEditionKey(date),'json');if(value?.date===date)return value;const automatic=await env.CACHE?.get<DailyEdition>(editionKey(date),'json');if(automatic?.date===date)return automatic}catch{}
 const row=await env.DB.prepare('SELECT editorial_json,automatic_json FROM daily_editorial_editions WHERE date=?').bind(date).first<any>()
 return row?.editorial_json?JSON.parse(row.editorial_json):row?.automatic_json?JSON.parse(row.automatic_json):null
}
export async function recordManagementAudit(env:Env,resource:string,key:string,action:string,actor:number,snapshot:unknown){
 await env.DB.prepare('INSERT INTO daily_management_audit(resource,resource_key,action,actor_id,created_at,snapshot_json) VALUES(?,?,?,?,?,?)').bind(resource,key,action,actor,new Date().toISOString(),JSON.stringify(snapshot)).run()
}
