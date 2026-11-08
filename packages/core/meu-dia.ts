import { z } from 'zod'
export const BRAZIL_STATES: Record<string,string> = {AC:'Acre',AL:'Alagoas',AP:'Amapá',AM:'Amazonas',BA:'Bahia',CE:'Ceará',DF:'Distrito Federal',ES:'Espírito Santo',GO:'Goiás',MA:'Maranhão',MT:'Mato Grosso',MS:'Mato Grosso do Sul',MG:'Minas Gerais',PA:'Pará',PB:'Paraíba',PR:'Paraná',PE:'Pernambuco',PI:'Piauí',RJ:'Rio de Janeiro',RN:'Rio Grande do Norte',RS:'Rio Grande do Sul',RO:'Rondônia',RR:'Roraima',SC:'Santa Catarina',SP:'São Paulo',SE:'Sergipe',TO:'Tocantins'}
export const DAILY_SECTIONS = {essential:'O essencial de hoje',changes:'O que muda para você',opportunities:'Prazos e oportunidades',follow:'Vale acompanhar'}
export const dailyDate = (date=new Date()) => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).format(date)
export const editionKey = (date: string) => 'meu-dia:edition:v1:'+date
export const dailyItemSchema=z.object({
  post_id:z.number().int().positive(),
  section:z.enum(['essential','changes','opportunities','follow']),
  scope:z.string().refine(value=>value==='BR'||Object.hasOwn(BRAZIL_STATES,value),'Abrangência inválida'),
  summary:z.string().trim().min(20).max(320),
  source_url:z.string().url().refine(value=>new URL(value).protocol==='https:','A fonte deve usar HTTPS'),
  expires_at:z.string().datetime({offset:true}).nullable().default(null)
}).refine(item=>item.section!=='opportunities'||item.expires_at!==null,'Oportunidades precisam de validade explícita')
export const dailyEditionSchema=z.object({date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),items:z.array(dailyItemSchema).min(1).max(40)}).refine(edition=>edition.items.some(item=>item.scope==='BR'&&item.section==='essential'),'A edição precisa ter conteúdo nacional essencial')
export type DailyItem=z.infer<typeof dailyItemSchema> & {title:string;url:string}
export interface DailyEdition {date:string;updated_at:string;items:DailyItem[]}
