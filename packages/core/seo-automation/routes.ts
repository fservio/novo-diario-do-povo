import { Hono } from 'hono'
import { z } from 'zod'
import type { Env,AppContext } from '../types'
import { SeoAutomationError,seoMetadataSchema } from './schema'
import { claimSeoJobs,configureSeo,correctSeoJob,dryRunSeo,dueSeoFollowups,finishSeoJob,listSeoHistory,prepareSeoPilot,recordSeoFollowup,seoStats,seoPilotStatuses } from './repository'
import type { JobResult,PilotMetric,SeoOperatorCorrection } from './repository'
import { seoTrendsResponse } from './trends'

const metric=z.object({url:z.string().url().startsWith('https://diario.dopovo.com.br/'),clicks:z.number().nonnegative(),impressions:z.number().nonnegative(),ctr:z.number().min(0).max(1),position:z.number().nonnegative()}).strict()
const resultSchema=z.object({
 lease_token:z.string().min(1).max(200),operation_key:z.string().min(1).max(200),
 status:z.enum(['apply','no_change','needs_review','error']),metadata:seoMetadataSchema.optional(),
 reason:z.string().trim().min(1).max(2000),evidence:z.record(z.unknown()).optional(),
 workflow_id:z.string().max(200).optional(),run_id:z.string().max(200).optional(),model:z.string().max(200).optional(),transient:z.boolean().optional()
}).strict().refine(v=>v.status!=='apply'||!!v.metadata,{message:'Aplicação exige os quatro campos SEO.',path:['metadata']})
export function createSeoAutomationRouter(){
 const router=new Hono<{Bindings:Env;Variables:AppContext}>()
 router.onError((error,c)=>{
  if(error instanceof SeoAutomationError)return c.json({success:false,error:error.code},error.status as any)
  if(error instanceof z.ZodError)return c.json({success:false,error:'SEO_VALIDATION_ERROR',details:error.flatten()},422)
  if(error instanceof SyntaxError)return c.json({success:false,error:'INVALID_JSON'},422)
  console.error('[seo-automation]',error instanceof Error?error.message:'Unexpected error')
  return c.json({success:false,error:'SEO_INTERNAL_ERROR'},500)
 })
 router.post('/claim',async c=>{
  const input=z.object({limit:z.number().int().min(1).max(20).default(20),workflow_id:z.string().max(200).optional(),run_id:z.string().max(200).optional()}).strict().parse(await c.req.json())
  return c.json({success:true,data:await claimSeoJobs(c.env.DB,input.limit)})
 })
 router.get('/dry-run',async c=>{
  const limit=z.coerce.number().int().min(1).max(20).parse(c.req.query('limit')||10)
  return c.json({success:true,data:await dryRunSeo(c.env.DB,limit)})
 })
 router.post('/jobs/:id/result',async c=>{
  const id=z.coerce.number().int().positive().parse(c.req.param('id')),input=resultSchema.parse(await c.req.json())
  return c.json({success:true,...await finishSeoJob(c.env.DB,id,input as JobResult)})
 })
 router.post('/jobs/:id/correct',async c=>{
  const id=z.coerce.number().int().positive().parse(c.req.param('id'))
  const input=z.object({operator_correction:z.literal(true),expected_seo_version:z.number().int().nonnegative(),operation_key:z.string().min(1).max(160),metadata:seoMetadataSchema,reason:z.string().trim().min(1).max(2000),evidence:z.record(z.unknown()).optional()}).strict().parse(await c.req.json())
  return c.json({success:true,...await correctSeoJob(c.env.DB,id,input as SeoOperatorCorrection)})
 })
 router.get('/stats',async c=>c.json({success:true,data:await seoStats(c.env.DB)}))
 router.get('/trends',async c=>seoTrendsResponse(c.env))
 router.get('/posts/:id/history',async c=>c.json({success:true,data:await listSeoHistory(c.env.DB,z.coerce.number().int().positive().parse(c.req.param('id')))}))
 router.post('/config',async c=>{
  const input=z.object({enabled:z.boolean(),daily_limit:z.number().int().min(1).max(300).default(300)}).strict().parse(await c.req.json())
  return c.json({success:true,data:await configureSeo(c.env.DB,input.enabled,new Date(),input.daily_limit)})
 })
 router.post('/pilot',async c=>{
  const input=z.object({seed:z.string().min(8).max(200),start_date:z.string().date(),end_date:z.string().date(),pages:z.array(metric).max(25000)}).strict().refine(v=>v.end_date>=v.start_date&&Date.parse(v.end_date)-Date.parse(v.start_date)===27*86400_000,{message:'A referência deve abranger 28 dias completos.'}).parse(await c.req.json())
  return c.json({success:true,data:await prepareSeoPilot(c.env.DB,input as {seed:string;start_date:string;end_date:string;pages:PilotMetric[]})})
 })
 router.get('/pilot/due',async c=>c.json({success:true,data:await dueSeoFollowups(c.env.DB)}))
 router.get('/pilot/status',async c=>c.json({success:true,data:await seoPilotStatuses(c.env.DB)}))
 router.post('/pilot/:id/followup',async c=>{
  const id=z.coerce.number().int().positive().parse(c.req.param('id'))
  const input=z.object({window_days:z.union([z.literal(14),z.literal(28)]),start_date:z.string().date(),end_date:z.string().date(),pages:z.array(metric).max(60)}).strict().parse(await c.req.json())
  return c.json({success:true,data:await recordSeoFollowup(c.env.DB,id,input.window_days,input.pages as PilotMetric[],new Date(),input as {start_date:string;end_date:string})})
 })
 return router
}
