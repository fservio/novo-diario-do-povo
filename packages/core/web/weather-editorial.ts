import type {Context} from 'hono'
import {z} from 'zod'
import type {Env} from '../types'
import {createPost,publishPost} from '../db/posts'
import {getPostUrl} from '../utils/post'
import {readWeather,weatherCities,weatherCondition,weatherDate,weatherSource,weatherEditionKey} from '../weather'
import {escapeHtml as esc} from './layout'

const requestSchema=z.object({uf:z.string().regex(/^[A-Z]{2}$/)})
const submissionSchema=requestSchema.extend({
 date:z.string(),
 texts:z.object({capital:z.string().trim().min(60).max(550).regex(/^[^<>0-9]+$/).optional(),
  interior:z.string().trim().min(60).max(550).regex(/^[^<>0-9]+$/).optional()})
})
const domain='https://diario.dopovo.com.br'

async function getJobs(env:Env,uf:string,date:string){
 const cities=weatherCities.filter(city=>city.uf===uf)
 const capital=cities.find(city=>city.capital)
 if(!capital)return []
 const definitions=[
  {kind:'capital' as const,slug:capital.slug,cities:[capital]},
  ...(uf==='DF'?[]:[{kind:'interior' as const,slug:'estado-'+uf.toLowerCase(),cities:cities.filter(city=>!city.capital)}])
 ]
 return Promise.all(definitions.map(async job=>{
  const originalLink=weatherEditionKey(job.slug,date)
  const existing=await env.DB.prepare('SELECT id,status FROM posts WHERE original_link=? ORDER BY id LIMIT 1')
   .bind(originalLink).first<{id:number;status:string}>()
  const forecasts=existing?.status==='published'?[]:await Promise.all(job.cities.map(async city=>{
   const bulletin=await readWeather(env,city).catch(()=>null)
   const forecast=bulletin?.days.find(day=>day.date===date)
   return forecast?{name:city.name,slug:city.slug,...forecast,description:weatherCondition(forecast.condition)}:null
  }))
  return {...job,originalLink,existing,forecasts:forecasts.filter(item=>item!==null),ready:forecasts.length>0&&forecasts.every(Boolean)}
 }))
}

export async function handleWeatherEditorial(c:Context){
 c.header('Cache-Control','private, no-store')
 const env=c.env as Env
 const op=c.req.param('operation')
 if(op!=='editorial-jobs'&&op!=='editorial-publish')return c.notFound()
 const body=await c.req.json().catch(()=>null)
 const request=requestSchema.safeParse(body)
 if(!request.success)return c.json({success:false,error:'UF inválida.'},400)
 const {uf}=request.data,date=weatherDate()
 const submission=op==='editorial-publish'?submissionSchema.safeParse(body):null
 if(submission&&(!submission.success||submission.data.date!==date))return c.json({success:false,error:'Boletim ou texto inválido.'},400)
 const jobs=await getJobs(env,uf,date)
 if(!jobs.length)return c.json({success:false,error:'UF fora do catálogo.'},400)
 if(!submission)return c.json({success:true,uf,date,
  jobs:jobs.filter(job=>job.ready&&(!job.existing||job.existing.status==='draft')).map(({kind,forecasts})=>({kind,forecasts})),
  missing:jobs.filter(job=>!job.ready&&job.existing?.status!=='published').map(job=>job.kind)})

 const [category,author]=await Promise.all([
  env.DB.prepare("SELECT id FROM categories WHERE slug=? AND is_active=1").bind(uf==='PI'?'piaui':'geral').first<{id:number}>(),
  env.DB.prepare("SELECT id FROM authors WHERE slug='redacao' AND is_active=1").first<{id:number}>()
 ])
 if(!category||!author)return c.json({success:false,error:'Editoria ou autoria indisponível.'},409)
 const results=[]
 for(const job of jobs){
  const context=submission.data.texts[job.kind]
  if(!context||!job.ready||(job.existing&&job.existing.status!=='draft'))continue
  const main=job.forecasts[0]
  const title=job.kind==='capital'
   ?`Previsão do tempo em ${main.name} indica máxima de ${main.max} °C`
   :`Previsão do tempo em ${uf}: veja como fica o dia em dez cidades`
  const label=date.split('-').reverse().join('/')
  const intro=job.kind==='capital'
   ?`O CPTEC/INPE prevê ${main.description.toLowerCase()} em ${main.name} (${uf}) neste dia ${label}, com mínima de ${main.min} °C e máxima de ${main.max} °C.`
   :`Confira a previsão do CPTEC/INPE para dez municípios de ${uf} neste dia ${label}, com mínimas, máximas e condições do tempo.`
  const forecastHtml=job.forecasts.map(item=>
   `<li><a href="/tempo/${esc(item.slug)}">${esc(item.name)}</a> · ${item.min} °C a ${item.max} °C · ${esc(item.description)}</li>`).join('')
  let id=job.existing?.id
  if(!id){
   try{
    id=await createPost(env.DB,{title,excerpt:intro,hat:'Previsão do tempo',
     slug:'previsao-do-tempo-'+job.slug+'-'+date,original_link:job.originalLink,category_id:category.id,author_id:author.id,
     content:`<p>${esc(intro)}</p><p>${esc(context)}</p><ul>${forecastHtml}</ul><p><a href="${weatherSource}">Fonte: CPTEC/INPE</a></p>`})
   }catch(error){
    const existing=await env.DB.prepare('SELECT id,status FROM posts WHERE original_link=?').bind(job.originalLink).first<{id:number;status:string}>()
    if(!existing)throw error
    if(existing.status!=='draft')continue
    id=existing.id
   }
  }
  await publishPost(env.DB,id)
  const post=await env.DB.prepare('SELECT slug,published_at FROM posts WHERE id=?').bind(id).first<{slug:string;published_at:string}>()
  if(post)results.push({id,kind:job.kind,url:getPostUrl(post,domain)})
 }
 if(results.length)c.header('X-Home-Changed','1')
 return c.json({success:true,published:results})
}
