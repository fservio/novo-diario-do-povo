import { z } from 'zod'
import { BRAZIL_STATES } from './meu-dia'
export const CULTURE_CATEGORIES={music:'Música',theater:'Teatro e dança',exhibition:'Exposições',cinema:'Cinema',gastronomy:'Gastronomia',family:'Com crianças',other:'Outras experiências'}
export const CULTURE_CACHE_KEY='culture:upcoming:v1'
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{const parsed=new Date(value+'T12:00:00Z');return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value},'Data inválida')
const https=z.string().url().refine(value=>{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password},'Use uma fonte HTTPS sem credenciais')
export const cultureEventSchema=z.object({
  slug:z.string().min(3).max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title:z.string().trim().min(5).max(180),summary:z.string().trim().min(20).max(600),
  category:z.enum(['music','theater','exhibition','cinema','gastronomy','family','other']),
  state:z.string().refine(value=>Object.hasOwn(BRAZIL_STATES,value),'UF inválida'),city:z.string().trim().min(2).max(100).refine(value=>/\p{L}/u.test(value),'Cidade inválida'),
  venue:z.string().trim().min(2).max(180),address:z.string().trim().max(240).nullable().default(null),
  starts_on:day,ends_on:day,
  starts_at:z.string().datetime({offset:true}).nullable().default(null),ends_at:z.string().datetime({offset:true}).nullable().default(null),
  timezone:z.string().refine(value=>{try{new Intl.DateTimeFormat('pt-BR',{timeZone:value});return true}catch{return false}},'Fuso inválido'),
  price_type:z.enum(['free','paid','unknown']),price_text:z.string().trim().max(100).nullable().default(null),
  source_url:https,verified_at:z.string().datetime({offset:true}),image_media_id:z.number().int().positive().nullable().default(null),
  status:z.enum(['scheduled','cancelled']).default('scheduled')
}).superRefine((event,ctx)=>{
  if(event.ends_on<event.starts_on)ctx.addIssue({code:'custom',message:'O término antecede o início'})
  const localDay=(value:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:event.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value))
  try{
    if(event.starts_at&&localDay(event.starts_at)!==event.starts_on)ctx.addIssue({code:'custom',message:'Data e horário de início incompatíveis'})
    if(event.ends_at&&localDay(event.ends_at)!==event.ends_on)ctx.addIssue({code:'custom',message:'Data e horário de término incompatíveis'})
  }catch{ctx.addIssue({code:'custom',message:'Data ou fuso inválido'})}
  if(event.starts_at&&event.ends_at&&Date.parse(event.ends_at)<=Date.parse(event.starts_at))ctx.addIssue({code:'custom',message:'Horário de término inválido'})
  if(event.price_type==='free'&&event.price_text)ctx.addIssue({code:'custom',message:'Evento gratuito não deve conter valor pago'})
})
export type CulturalEvent=Omit<z.infer<typeof cultureEventSchema>,'image_media_id'> & {city_key:string;image_key:string|null;updated_at:string}
