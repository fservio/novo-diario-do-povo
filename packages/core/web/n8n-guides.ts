import type {Context} from 'hono'
import type {Env} from '../types'
import {z} from 'zod'
import {GuideConflict} from '../evergreen'
import {claimGuideJobs,storeGuideRevision,linkExistingGuides,blockGuideJob} from '../db/evergreen'
const reservation=z.object({guide_id:z.number().int().positive(),version:z.number().int().nonnegative(),lease_token:z.string().regex(/^[a-f0-9]{48}$/)})
export async function handleN8nGuides(c:Context){
 c.header('Cache-Control','private, no-store')
 const env=c.env as Env
 try{
  const input=await c.req.json(),operation=c.req.param('operation')
  if(operation==='claim'){
   const {limit}=z.object({limit:z.number().int().min(1).max(5).default(1)}).parse(input)
   return c.json({success:true,jobs:await claimGuideJobs(env,limit)})
  }
  if(operation==='draft'){
   const body=reservation.extend({document:z.unknown(),research:z.unknown()}).parse(input)
   return c.json({success:true,...await storeGuideRevision(env,body.guide_id,body.version,body.document,body.research,{origin:'ai',lease_token:body.lease_token}),publication_status:'draft',review_required:true})
  }
  if(operation==='blocked'){
   const body=reservation.extend({reason:z.string().trim().min(5).max(600)}).parse(input)
   await blockGuideJob(env,body.guide_id,body.version,body.lease_token,body.reason)
   return c.json({success:true,blocked:true})
  }
  if(operation==='link-existing'){
   const body=z.object({post_id:z.number().int().positive()}).parse(input)
   const guides=await linkExistingGuides(env,body.post_id)
   return c.json({success:true,linked_count:guides.length,guides:guides.map(g=>({id:g.id,title:g.title,url:'/guias/'+g.slug}))})
  }
  return c.notFound()
 }catch(error){
  if(error instanceof Error&&/D1.*(?:overload|busy)|too many resources/i.test(error.message)){c.header('Retry-After','15');return c.json({success:false,error:'Banco temporariamente ocupado. Tente novamente.'},503)}
  const message=error instanceof z.ZodError?error.issues.map(issue=>issue.message).join(' · '):error instanceof Error?error.message:'Não foi possível processar o guia.'
  return c.json({success:false,error:message.slice(0,700)},error instanceof GuideConflict?409:400)
 }
}
