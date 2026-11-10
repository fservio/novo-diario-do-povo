import type {Context} from 'hono'
import {z} from 'zod'
import type {Env} from '../types'
import {createPost} from '../db/posts'
import {getPostUrl} from '../utils/post'
import {escapeHtml} from './layout'
import {aiColumns,aiColumnDisclosure} from '../ai-columns'
import {exchangeFeed,getExchangeSnapshot,summarizeExchange} from '../exchange-rates'

const slots={manha:'06:00',tarde:'13:00',noite:'20:00'} as const
const comparableTitle=(title:string)=>title.normalize('NFD').replace(/\p{M}/gu,'')
 .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()
const slotSchema=z.enum(['manha','tarde','noite'])
const inputSchema=z.object({slot:slotSchema,catchup:z.literal(true).optional()})
const editionSchema=inputSchema.extend({
 cutoff:z.string().datetime(),
 title:z.string().trim().min(12).max(140),
 excerpt:z.string().trim().min(25).max(300),
 lead:z.string().trim().min(100).max(1500),
 notes:z.array(z.object({
  title:z.string().trim().min(3).max(85),
  body:z.string().trim().min(50).max(800),
  sources:z.array(z.number().int().positive()).min(1).max(3)
 })).min(4).max(12)
})

function editionWindow(slot:z.infer<typeof slotSchema>,now:Date){
 const day=new Date(now.getTime()-3*3600_000).toISOString().slice(0,10)
 const midnight=Date.parse(day+'T00:00:00-03:00')
 const at=new Date(day+'T'+slots[slot]+':00-03:00')
 return {day,at,
  from:new Date(slot==='manha'?midnight-86400_000:midnight).toISOString(),
  until:new Date(slot==='manha'?midnight:Math.min(at.getTime(),now.getTime())).toISOString()}
}

export async function handleN8nPlanaltoCentral(c:Context,slug:keyof typeof aiColumns='planalto-central'){
 c.header('Cache-Control','private, no-store')
 const column=aiColumns[slug]
 const signature=aiColumnDisclosure(slug)
 const {DB}=c.env as Env
 const op=c.req.param('operation')
 if(op!=='candidates'&&op!=='publish')return c.notFound()
 const body=await c.req.json().catch(()=>null)
 const request=inputSchema.safeParse(body)
 if(!request.success)return c.json({success:false,error:'Edição inválida.'},400)
 const {slot,catchup}=request.data
 const now=new Date()
 const localHour=new Date(now.getTime()-3*3600_000).getUTCHours()
 if(catchup&&(slot!=='noite'||localHour>=6))
  return c.json({success:false,error:'A recuperação é exclusiva da edição noturna anterior, antes das 6h.'},409)
 const editionDate=catchup?new Date(now.getTime()-86400_000):now
 const {day,at,from,until:regularCutoff}=editionWindow(slot,editionDate)
 const until=catchup?at.toISOString():regularCutoff
 const publishAt=catchup?now:at
 if(!catchup&&(now.getTime()<at.getTime()-15*60_000||now.getTime()>at.getTime()+60*60_000))
  return c.json({success:false,error:'A edição está fora da janela de produção.'},409)

 const edition=op==='publish'?editionSchema.safeParse(body):null
 if(edition&&!edition.success)return c.json({success:false,error:'Texto ou referências da edição inválidos.'},400)
 const cutoff=edition?.data?.cutoff||until
 if(cutoff>until||cutoff<=from)return c.json({success:false,error:'Janela de fontes inválida.'},400)
 const editionKey=day+'-'+slot
 const originalLink='https://diario.dopovo.com.br/coluna/'+slug+'?edicao='+editionKey
 const previousFrom=new Date(Date.parse(day+'T00:00:00-03:00')-86400_000).toISOString()
 const [posts,earlier]=await Promise.all([DB.prepare(`SELECT p.id,p.title,p.slug,p.excerpt,p.published_at,
  substr(p.content,1,2200) AS sample
  FROM posts p JOIN categories c ON c.id=p.category_id
  WHERE c.slug=? AND p.status='published' AND p.seo_noindex=0
    AND p.opinion_type='news' AND p.published_at>=? AND p.published_at<?
  ORDER BY p.published_at DESC,p.id DESC LIMIT 120`).bind(column.category,from,cutoff).all<{
   id:number;title:string;slug:string;excerpt:string|null;published_at:string;sample:string|null
  }>(),DB.prepare(`SELECT p.title,p.excerpt,p.content
    FROM posts p JOIN authors a ON a.id=p.author_id
    WHERE a.slug=? AND p.status='published' AND p.opinion_type='column'
      AND p.published_at>=? AND p.published_at<? AND COALESCE(p.original_link,'')<>?
    ORDER BY p.published_at DESC,p.id DESC LIMIT 2`).bind(slug,previousFrom,now.toISOString(),originalLink)
    .all<{title:string;excerpt:string|null;content:string|null}>()])
 const usedSlugs=new Set(earlier.results.flatMap(post=>[...(post.content||'').matchAll(
  /href=["']\/(?:\d{4}\/\d{2}\/\d{2}|noticia)\/([^/"']+)\/?["']/gi
 )].map(match=>match[1])))
 const freshSourceIds=posts.results.filter(post=>!usedSlugs.has(post.slug)).map(post=>post.id)
 const requiredFresh=earlier.results.length?Math.min(3,freshSourceIds.length):0
 if(!edition){
  const snapshot=slug==='painel-economico'&&slot==='noite'?await getExchangeSnapshot(c.env as Env).catch(()=>null):null
  const exchange=snapshot?{source:exchangeFeed,series:'PTAX de venda em reais',
   rates:summarizeExchange(snapshot).filter(rate=>rate.day<=day)}:undefined
  return c.json({success:true,slot,catchup,day,cutoff,scheduled_at:publishAt.toISOString(),
   earlier:earlier.results.map(({title,excerpt,content})=>({title,excerpt,
    notes:content?.slice(0,5500).replace(/<\/(?:h2|p)>/gi,'\n').replace(/<[^>]*>/g,' ').split('\n')
     .map(line=>line.trim()).filter(line=>line&&!line.startsWith('Na cobertura do Diário')).join('\n')})),column:slug,exchange,
   requiredFresh,posts:posts.results.map(post=>({...post,usedPreviously:usedSlugs.has(post.slug),
    sample:post.sample?.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim()}))})
 }

 const {data}=edition
 if(earlier.results.some(post=>comparableTitle(post.title)===comparableTitle(data.title)))
  return c.json({success:false,error:'A manchete repete uma edição anterior da coluna.'},409)
 const sources=new Map(posts.results.map(post=>[post.id,post]))
 const referenced=new Set(data.notes.flatMap(note=>note.sources))
 const noteTitles=new Set(data.notes.map(note=>note.title.toLocaleLowerCase('pt-BR')))
 if((slot==='manha'&&data.notes.length<8)||noteTitles.size!==data.notes.length||
    referenced.size<4||[...referenced].some(id=>!sources.has(id)))
  return c.json({success:false,error:'A edição precisa de notas distintas e fontes válidas da cobertura.'},400)
 const fresh=new Set(freshSourceIds)
 const freshNotes=data.notes.filter(note=>note.sources.some(id=>fresh.has(id))).length
 if(freshNotes<requiredFresh||[...referenced].filter(id=>fresh.has(id)).length<requiredFresh)
  return c.json({success:false,error:'A edição precisa aproveitar matérias ainda não citadas em notas distintas.'},409)

 const author=await DB.prepare("SELECT id FROM authors WHERE slug=? AND is_active=1 AND author_type='columnist'")
  .bind(slug).first<{id:number}>()
 const category=await DB.prepare("SELECT id FROM categories WHERE slug=? AND is_active=1").bind(column.category).first<{id:number}>()
 if(!author||!category)return c.json({success:false,error:'Perfil da coluna ou editoria indisponível.'},409)
 const lookup=()=>DB.prepare('SELECT id,status FROM posts WHERE original_link=?').bind(originalLink).first<{id:number;status:string}>()
 let existing=await lookup()
 if(!existing){
  const notes=data.notes.map(note=>{
   const links=[...new Set(note.sources)].map(id=>{
    const post=sources.get(id)!
    return `<a href="${escapeHtml(getPostUrl(post))}">${escapeHtml(post.title)}</a>`
   }).join(' · ')
   return `<h2>${escapeHtml(note.title)}</h2><p>${escapeHtml(note.body)}</p><p>Na cobertura do Diário · ${links}</p>`
  }).join('')
  try{
   const id=await createPost(DB,{title:data.title,slug:slug+'-'+editionKey,excerpt:data.excerpt,
    hat:column.name,content:`<p><em>${signature}</em></p><p>${escapeHtml(data.lead)}</p>${notes}`,
    author_id:author.id,category_id:category.id,opinion_type:'column',original_link:originalLink})
   existing={id,status:'draft'}
  }catch(error){
   existing=await lookup()
   if(!existing)throw error
  }
 }
 if(existing.status==='published')return c.json({success:true,id:existing.id,status:'published',reused:true})
 if(existing.status!=='draft')return c.json({success:false,error:'A edição está sob controle editorial.'},409)
 await DB.prepare("UPDATE posts SET scheduled_at=?,updated_at=? WHERE id=? AND status='draft' AND scheduled_at IS NULL")
  .bind(publishAt.toISOString(),new Date().toISOString(),existing.id).run()
 const saved=await lookup()
 return c.json({success:true,id:existing.id,status:saved?.status==='published'?'published':'scheduled',scheduled_at:publishAt.toISOString()})
}
