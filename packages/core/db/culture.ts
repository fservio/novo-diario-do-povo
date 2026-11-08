import type { Env } from '../types'
import { CULTURE_CACHE_KEY, type CulturalEvent } from '../culture'

export async function refreshCulturalEvents(env:Env):Promise<CulturalEvent[]>{
  const since=new Date(Date.now()-86400000).toISOString().slice(0,10)
  const rows=await env.DB.prepare("SELECT * FROM cultural_events WHERE status='scheduled' AND ends_on>=? ORDER BY featured DESC,starts_on,starts_at,title LIMIT 200").bind(since).all<CulturalEvent>()
  if(env.CACHE){try{await env.CACHE.put(CULTURE_CACHE_KEY,JSON.stringify(rows.results),{expirationTtl:21600})}catch(error){console.error('[Agenda] Cache write failed',error)}}
  return rows.results
}
export async function getCulturalEvents(env:Env):Promise<CulturalEvent[]>{
  try{const cached=await env.CACHE?.get<CulturalEvent[]>(CULTURE_CACHE_KEY,'json');if(Array.isArray(cached))return cached}catch(error){console.error('[Agenda] Cache read failed',error)}
  try{return await refreshCulturalEvents(env)}catch(error){console.error('[Agenda] Collection unavailable',error);return []}
}
export async function getCulturalEvent(env:Env,slug:string):Promise<CulturalEvent|null>{
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||slug.length>160)return null
  const key='culture:event:v1:'+slug
  try{const cached=await env.CACHE?.get<CulturalEvent>(key,'json');if(cached?.slug===slug)return cached}catch{}
  const event=await env.DB.prepare('SELECT * FROM cultural_events WHERE slug=?').bind(slug).first<CulturalEvent>()
  if(event&&env.CACHE){try{await env.CACHE.put(key,JSON.stringify(event),{expirationTtl:3600})}catch{}}
  return event
}
