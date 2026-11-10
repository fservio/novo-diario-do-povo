import type { D1Database } from '@cloudflare/workers-types'
import { getPostUrl } from '../utils/post'
import { SeoAutomationError, readSeoMetadata, seoMetadataSchema, seoPlainText, type SeoMetadata } from './schema'

const BASE='https://diario.dopovo.com.br'
const sourceColumns=['title','excerpt','content','content_markdown','content_json','content_version','status','slug','published_at','category_id','opinion_type','is_live','seo_noindex','seo_canonical','seo_title','seo_description','seo_primary_keyword','seo_secondary_keywords','seo_version'] as const
const iso=(now=new Date())=>now.toISOString()
export const fortalezaDay=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).format(now)
export function seoSnapshot(post:any):Record<string,any>{return Object.fromEntries(sourceColumns.map(k=>[k,post[k]??null]))}
function same(a:any,b:any){return JSON.stringify(a)===JSON.stringify(b)}
function whereSnapshot(snapshot:any){return {sql:sourceColumns.map(k=>`${k} IS ?`).join(' AND '),values:sourceColumns.map(k=>snapshot[k]??null)}}
export function seoEligible(post:any,now=new Date()):boolean {
 if(!post||post.status!=='published'||post.seo_noindex||post.is_live||post.opinion_type&&post.opinion_type!=='news'||post.slug?.startsWith('previsao-do-tempo-')||!post.published_at||Date.parse(post.published_at)>now.getTime())return false
 const canonical=post.seo_canonical?.trim()
 return !canonical||canonical===getPostUrl(post,BASE)
}
export async function getSeoPost(db:D1Database,id:number){return db.prepare('SELECT * FROM posts WHERE id=?').bind(id).first<any>()}

export interface SaveSeoOptions {
 expectedSnapshot?:Record<string,any>;expectedSeoVersion?:number;operationKey?:string;
 reason?:string;evidence?:Record<string,unknown>;actor?:string;restoredFrom?:number;now?:Date
 lease?:{jobId:number;token:string;clock?:Date}
}
export async function saveSeoMetadata(db:D1Database,id:number,metadata:SeoMetadata,options:SaveSeoOptions={}) {
 const next=seoMetadataSchema.parse(metadata),post=await getSeoPost(db,id)
 if(!post)throw new SeoAutomationError(404,'POST_NOT_FOUND')
 const operationKey=options.operationKey||crypto.randomUUID()
 const replay=await db.prepare('SELECT id,post_id FROM post_seo_revisions WHERE operation_key=?').bind(operationKey).first<any>()
 if(replay){if(replay.post_id!==id)throw new SeoAutomationError(409,'OPERATION_KEY_CONFLICT');return {status:'applied' as const,revision_id:replay.id}}
 const expected=options.expectedSnapshot||seoSnapshot(post)
 if(options.expectedSeoVersion!==undefined&&Number(post.seo_version||0)!==options.expectedSeoVersion)throw new SeoAutomationError(409,'SEO_VERSION_CONFLICT')
 if(!same(seoSnapshot(post),expected))throw new SeoAutomationError(409,'SEO_SOURCE_CONFLICT')
 const before=readSeoMetadata(post)
 if(same(before,next))return {status:'no_change' as const}
 const guard=whereSnapshot(expected),now=iso(options.now),evidence=JSON.stringify(options.evidence||{})
 const lease=options.lease
 // The lease must still belong to this worker at COMMIT, not only at the earlier HTTP read.
 // Production uses the database clock; tests can supply a fixed clock through the service API.
 const leaseSql=lease?` AND EXISTS(SELECT 1 FROM post_seo_jobs WHERE id=? AND post_id=posts.id AND lease_token=? AND state='leased' AND lease_until>${lease.clock?'?':"strftime('%Y-%m-%dT%H:%M:%fZ','now')"})`:''
 const leaseValues=lease?[lease.jobId,lease.token,...(lease.clock?[iso(lease.clock)]:[])]:[]
 if(evidence.length>100_000)throw new SeoAutomationError(422,'EVIDENCE_TOO_LARGE')
 // D1 batch is atomic: the conditional revision and matching update cannot be split by another writer.
 const result=await db.batch([
  db.prepare(`INSERT INTO post_seo_revisions(post_id,operation_key,before_json,after_json,source_snapshot,evidence_json,reason,actor,restored_from,created_at)
    SELECT id,?,?,?,?,?,?,?,?,? FROM posts WHERE id=? AND ${guard.sql}${leaseSql}`)
   .bind(operationKey,JSON.stringify(before),JSON.stringify(next),JSON.stringify(expected),evidence,options.reason||'Atualização dos metadados SEO',options.actor||'editor',options.restoredFrom??null,now,id,...guard.values,...leaseValues),
  db.prepare(`UPDATE posts SET seo_title=?,seo_description=?,seo_primary_keyword=?,seo_secondary_keywords=?,seo_version=COALESCE(seo_version,0)+1,seo_updated_at=?
    WHERE id=? AND ${guard.sql}${leaseSql} AND EXISTS(SELECT 1 FROM post_seo_revisions WHERE operation_key=? AND post_id=?)`)
   .bind(next.seo_title||null,next.seo_description||null,next.seo_primary_keyword||null,JSON.stringify(next.seo_secondary_keywords),now,id,...guard.values,...leaseValues,operationKey,id)
 ])
 if(!result[1].meta.changes){
  const raced=await db.prepare('SELECT id,post_id FROM post_seo_revisions WHERE operation_key=?').bind(operationKey).first<any>()
  if(raced?.post_id===id)return {status:'applied' as const,revision_id:raced.id as number}
  if(lease){const job=await db.prepare('SELECT lease_token,lease_until,state FROM post_seo_jobs WHERE id=?').bind(lease.jobId).first<any>();if(job?.lease_token!==lease.token||job?.state!=='leased'||job?.lease_until<=iso(lease.clock))throw new SeoAutomationError(409,'SEO_LEASE_EXPIRED')}
  throw new SeoAutomationError(409,'SEO_SOURCE_CONFLICT')
 }
 const revision=await db.prepare('SELECT id FROM post_seo_revisions WHERE operation_key=?').bind(operationKey).first<any>()
 return {status:'applied' as const,revision_id:revision.id as number}
}

export async function listSeoHistory(db:D1Database,id:number,limit=30){
 const rows=await db.prepare('SELECT * FROM post_seo_revisions WHERE post_id=? ORDER BY id DESC LIMIT ?').bind(id,Math.min(100,limit)).all<any>()
 return (rows.results||[]).map(row=>({...row,before:JSON.parse(row.before_json),after:JSON.parse(row.after_json),evidence:JSON.parse(row.evidence_json)}))
}
export async function restoreSeoRevision(db:D1Database,id:number,revisionId:number,expectedSeoVersion:number,actor='editor'){
 const row=await db.prepare('SELECT before_json FROM post_seo_revisions WHERE id=? AND post_id=?').bind(revisionId,id).first<any>()
 if(!row)throw new SeoAutomationError(404,'SEO_REVISION_NOT_FOUND')
 return saveSeoMetadata(db,id,JSON.parse(row.before_json),{expectedSeoVersion,reason:`Restauração da revisão ${revisionId}`,actor,restoredFrom:revisionId})
}

export async function seoConfig(db:D1Database){return db.prepare('SELECT * FROM seo_automation_config WHERE id=1').first<any>()}
export async function configureSeo(db:D1Database,enabled:boolean,now=new Date(),dailyLimit=300){
 await db.prepare('UPDATE seo_automation_config SET enabled=?, activated_at=COALESCE(activated_at,CASE WHEN ?=1 THEN ? ELSE NULL END),daily_limit=?,updated_at=? WHERE id=1').bind(enabled?1:0,enabled?1:0,iso(now),Math.min(300,Math.max(1,dailyLimit)),iso(now)).run()
 return seoConfig(db)
}
const eligibilitySql=`p.status='published' AND COALESCE(p.seo_noindex,0)=0 AND COALESCE(p.is_live,0)=0
 AND COALESCE(p.opinion_type,'news')='news' AND p.slug NOT LIKE 'previsao-do-tempo-%' AND p.published_at IS NOT NULL AND datetime(p.published_at)<=datetime(?)
 AND (NULLIF(TRIM(p.seo_canonical),'') IS NULL OR TRIM(p.seo_canonical)='${BASE}/'||strftime('%Y/%m/%d',p.published_at)||'/'||p.slug||'/')`
async function sourceKey(post:any){
 const text=JSON.stringify([post.title,post.excerpt,post.content,post.content_markdown,post.content_json])
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))
 return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('')
}
function jobPayload(post:any,job:any=null){return {job_id:job?.id??null,post_id:post.id,lease_token:job?.lease_token??null,url:getPostUrl(post,BASE),title:post.title,excerpt:post.excerpt,content:post.content,content_text:seoPlainText(post.content||''),metadata:readSeoMetadata(post),seo_version:post.seo_version||0,published_at:post.published_at,snapshot:seoSnapshot(post),kind:job?.kind||'dry_run'}}
export async function dryRunSeo(db:D1Database,limit=10,now=new Date()){
 const rows=await db.prepare(`SELECT p.* FROM posts p WHERE ${eligibilitySql} ORDER BY p.published_at DESC,p.id DESC LIMIT 100`).bind(iso(now)).all<any>()
 return (rows.results||[]).filter(p=>seoEligible(p,now)).slice(0,Math.min(20,limit)).map(p=>jobPayload(p))
}
async function enqueueNew(db:D1Database,activatedAt:string,now:Date){
 const cooldown=iso(new Date(now.getTime()-7*86400_000))
 // Filter previously processed snapshots in SQL before limiting; older completed rows cannot starve the queue.
 const rows=await db.prepare(`SELECT p.* FROM posts p WHERE ${eligibilitySql} AND datetime(p.published_at)>=datetime(?)
 AND NOT EXISTS(SELECT 1 FROM post_seo_revisions r WHERE r.post_id=p.id AND r.actor='n8n' AND r.created_at>?)
 AND NOT EXISTS(SELECT 1 FROM post_seo_jobs j WHERE j.post_id=p.id AND j.state IN ('applied','no_change') AND j.updated_at>?)
 AND NOT EXISTS(SELECT 1 FROM seo_pilot_members m JOIN seo_pilots sp ON sp.id=m.pilot_id WHERE m.post_id=p.id AND m.arm='control' AND datetime(sp.created_at,'+28 days')>datetime(?))
 AND NOT EXISTS(SELECT 1 FROM post_seo_jobs j WHERE j.post_id=p.id AND
   (j.state IN ('pending','leased') OR (j.state IN ('needs_review','exhausted','applied','no_change')
    AND json_extract(j.snapshot_json,'$.title') IS p.title AND json_extract(j.snapshot_json,'$.excerpt') IS p.excerpt
    AND json_extract(j.snapshot_json,'$.content') IS p.content
    AND json_extract(j.snapshot_json,'$.content_markdown') IS p.content_markdown
    AND json_extract(j.snapshot_json,'$.content_json') IS p.content_json)))
 ORDER BY p.published_at,p.id LIMIT 200`).bind(iso(now),activatedAt,cooldown,cooldown,iso(now)).all<any>()
 for(const p of rows.results||[]){
  if(!seoEligible(p,now))continue
  const key=await sourceKey(p),existing=await db.prepare('SELECT id,state,updated_at FROM post_seo_jobs WHERE post_id=? AND source_key=?').bind(p.id,key).first<any>()
  if(existing){
   if(existing.state==='conflict')
    await db.prepare("UPDATE post_seo_jobs SET state=CASE WHEN attempts>=3 THEN 'exhausted' ELSE 'pending' END,next_attempt_at=NULL,receipt_json=NULL,updated_at=? WHERE id=? AND state='conflict'").bind(iso(now),existing.id).run()
  }else await db.prepare("INSERT OR IGNORE INTO post_seo_jobs(post_id,kind,state,created_at,updated_at,source_key) VALUES(?,'new','pending',?,?,?)").bind(p.id,iso(now),iso(now),key).run()
 }
}
export async function claimSeoJobs(db:D1Database,limit=20,now=new Date()){
 const config=await seoConfig(db)
 if(!config?.enabled||!config.activated_at)return []
 await enqueueNew(db,config.activated_at,now)
 await db.prepare("UPDATE post_seo_jobs SET state=CASE WHEN attempts>=3 THEN 'exhausted' ELSE 'pending' END,lease_token=NULL,lease_until=NULL,updated_at=? WHERE state='leased' AND lease_until<=?").bind(iso(now),iso(now)).run()
 const rows=await db.prepare(`SELECT j.*,p.id AS candidate_id FROM post_seo_jobs j JOIN posts p ON p.id=j.post_id
 WHERE j.state='pending' AND j.attempts<3 AND (j.next_attempt_at IS NULL OR j.next_attempt_at<=?)
 AND ${eligibilitySql} AND NOT EXISTS(SELECT 1 FROM post_seo_revisions r WHERE r.post_id=p.id AND r.actor='n8n' AND r.created_at>?)
 AND NOT EXISTS(SELECT 1 FROM seo_pilot_members m JOIN seo_pilots sp ON sp.id=m.pilot_id WHERE m.post_id=p.id AND m.arm='control' AND datetime(sp.created_at,'+28 days')>datetime(?))
 ORDER BY CASE j.kind WHEN 'new' THEN 0 ELSE 1 END,j.id LIMIT ?`).bind(iso(now),iso(now),iso(new Date(now.getTime()-7*86400_000)),iso(now),Math.min(20,limit)*3).all<any>()
 const output=[],day=fortalezaDay(now)
 await db.prepare('INSERT OR IGNORE INTO seo_daily_usage(day,generations) VALUES(?,0)').bind(day).run()
 for(const row of rows.results||[]){
  if(output.length>=Math.min(20,limit))break
  const post=await getSeoPost(db,row.post_id)
  if(!seoEligible(post,now))continue
  const token=crypto.randomUUID(),until=iso(new Date(now.getTime()+15*60_000))
  const batch=await db.batch([
   db.prepare(`UPDATE post_seo_jobs SET state='leased',attempts=attempts+1,lease_token=?,lease_until=?,snapshot_json=?,updated_at=?
    WHERE id=? AND state='pending' AND attempts<3 AND EXISTS(SELECT 1 FROM seo_daily_usage WHERE day=? AND generations<?)
    AND EXISTS(SELECT 1 FROM seo_automation_config WHERE id=1 AND enabled=1)`)
    .bind(token,until,JSON.stringify(seoSnapshot(post)),iso(now),row.id,day,config.daily_limit),
   db.prepare(`UPDATE seo_daily_usage SET generations=generations+1 WHERE day=? AND EXISTS(SELECT 1 FROM post_seo_jobs WHERE id=? AND lease_token=?)`).bind(day,row.id,token)
  ])
  if(batch[0].meta.changes)output.push(jobPayload(post,{...row,lease_token:token}))
 }
 return output
}

export interface JobResult {
 lease_token:string;operation_key:string;status:'apply'|'no_change'|'needs_review'|'error';metadata?:SeoMetadata;
 reason:string;evidence?:Record<string,unknown>;workflow_id?:string;run_id?:string;model?:string;transient?:boolean
}
export async function finishSeoJob(db:D1Database,id:number,input:JobResult,clock?:Date){
 const now=clock||new Date()
 const replay=await db.prepare('SELECT * FROM seo_job_receipts WHERE operation_key=?').bind(input.operation_key).first<any>()
 if(replay){if(replay.job_id!==id||replay.lease_token!==input.lease_token)throw new SeoAutomationError(409,'OPERATION_KEY_CONFLICT');return JSON.parse(replay.receipt_json)}
 const job=await db.prepare('SELECT * FROM post_seo_jobs WHERE id=?').bind(id).first<any>()
 if(!job)throw new SeoAutomationError(404,'SEO_JOB_NOT_FOUND')
 // A metadata application may have succeeded before its receipt was written; recover that exact operation.
 const applied=await db.prepare('SELECT id,post_id FROM post_seo_revisions WHERE operation_key=?').bind(input.operation_key).first<any>()
 if(job.lease_token!==input.lease_token||(!applied&&(job.state!=='leased'||job.lease_until<=iso(now))))throw new SeoAutomationError(409,'SEO_LEASE_EXPIRED')
 let receipt:any
 if(applied){if(applied.post_id!==job.post_id)throw new SeoAutomationError(409,'OPERATION_KEY_CONFLICT');receipt={status:'applied',revision_id:applied.id}}
 else if(input.status==='apply'||input.status==='no_change'){
  const post=await getSeoPost(db,job.post_id)
  if(!post)throw new SeoAutomationError(404,'POST_NOT_FOUND')
  if(!seoEligible(post,now))throw new SeoAutomationError(409,'SEO_POST_INELIGIBLE')
  try{
   const metadata=input.metadata||readSeoMetadata(post)
   if(input.status==='no_change'&&!same(readSeoMetadata(post),metadata))throw new SeoAutomationError(422,'SEO_NO_CHANGE_MISMATCH')
   if(input.status==='apply'&&(!metadata.seo_title||!metadata.seo_description||!metadata.seo_primary_keyword))throw new SeoAutomationError(422,'SEO_METADATA_INCOMPLETE')
   receipt=await saveSeoMetadata(db,job.post_id,metadata,{expectedSnapshot:JSON.parse(job.snapshot_json),operationKey:input.operation_key,reason:input.reason,evidence:{...input.evidence,workflow_id:input.workflow_id,run_id:input.run_id,model:input.model},actor:'n8n',now,lease:{jobId:id,token:input.lease_token,clock}})
  }catch(error){
   if(error instanceof SeoAutomationError&&error.status===409&&error.code!=='SEO_LEASE_EXPIRED')await db.prepare("UPDATE post_seo_jobs SET state='conflict',last_error=?,updated_at=? WHERE id=? AND lease_token=?").bind(error.code,iso(now),id,input.lease_token).run()
   throw error
  }
 }else if(input.status==='needs_review')receipt={status:'needs_review'}
 else receipt={status:input.transient&&job.attempts<3?'retry':input.transient?'exhausted':'needs_review'}
 const state=receipt.status==='retry'?'pending':receipt.status,nextAttempt=receipt.status==='retry'?iso(new Date(now.getTime()+job.attempts*60_000)):null
 await db.batch([
  db.prepare(`INSERT INTO seo_job_receipts(operation_key,job_id,lease_token,receipt_json,created_at) VALUES(?,?,?,?,?)`).bind(input.operation_key,id,input.lease_token,JSON.stringify(receipt),iso(now)),
  db.prepare('UPDATE post_seo_jobs SET state=?,receipt_json=?,last_error=?,next_attempt_at=?,updated_at=? WHERE id=? AND lease_token=?').bind(state,JSON.stringify(receipt),input.status==='error'||input.status==='needs_review'?input.reason:null,nextAttempt,iso(now),id,input.lease_token)
 ])
 return receipt
}

export interface SeoOperatorCorrection {
 operator_correction:true;expected_seo_version:number;operation_key:string;metadata:SeoMetadata;
 reason:string;evidence?:Record<string,unknown>
}
/** An explicit, audited human correction. It takes a fresh exclusive lease and uses the normal CAS application service. */
export async function correctSeoJob(db:D1Database,id:number,input:SeoOperatorCorrection,clock?:Date){
 const now=clock||new Date(),metadata=seoMetadataSchema.parse(input.metadata),token='operator:'+input.operation_key
 if(input.operator_correction!==true)throw new SeoAutomationError(422,'SEO_OPERATOR_CORRECTION_REQUIRED')
 if(!metadata.seo_title||!metadata.seo_description||!metadata.seo_primary_keyword)throw new SeoAutomationError(422,'SEO_METADATA_INCOMPLETE')
 const replay=await db.prepare('SELECT * FROM seo_job_receipts WHERE operation_key=?').bind(input.operation_key).first<any>()
 if(replay){if(replay.job_id!==id||replay.lease_token!==token)throw new SeoAutomationError(409,'OPERATION_KEY_CONFLICT');return JSON.parse(replay.receipt_json)}
 const config=await seoConfig(db)
 if(!config||config.enabled)throw new SeoAutomationError(409,'SEO_CORRECTION_REQUIRES_PAUSE')
 const job=await db.prepare('SELECT * FROM post_seo_jobs WHERE id=?').bind(id).first<any>()
 if(!job)throw new SeoAutomationError(404,'SEO_JOB_NOT_FOUND')
 const evidence={...input.evidence,operator_correction:true,corrected_job_id:id,previous_job_state:job.state,previous_receipt:job.receipt_json?JSON.parse(job.receipt_json):null}
 const result:JobResult={lease_token:token,operation_key:input.operation_key,status:'apply',metadata,reason:input.reason,evidence,workflow_id:'operator-correction'}
 // Resume the same correction after a timeout, including an application whose receipt was not yet persisted.
 const sameReservation=job.state==='leased'&&job.lease_token===token
 if(sameReservation){
  const applied=await db.prepare('SELECT id FROM post_seo_revisions WHERE operation_key=? AND post_id=?').bind(input.operation_key,job.post_id).first<any>()
  if(applied||job.lease_until>iso(now))return finishSeoJob(db,id,result,clock)
 }
 if(!sameReservation&&!['needs_review','exhausted','applied','no_change'].includes(job.state))throw new SeoAutomationError(409,'SEO_CORRECTION_JOB_STATE')
 const post=await getSeoPost(db,job.post_id)
 if(!post)throw new SeoAutomationError(404,'POST_NOT_FOUND')
 if(!seoEligible(post,now))throw new SeoAutomationError(409,'SEO_POST_INELIGIBLE')
 if(Number(post.seo_version||0)!==input.expected_seo_version)throw new SeoAutomationError(409,'SEO_VERSION_CONFLICT')
 const original=job.snapshot_json?JSON.parse(job.snapshot_json):null
 // Pilot keys identify the experiment, while new-publication keys hash the body. The claimed snapshot is authoritative for both.
 const protectedFields=sourceColumns.filter(k=>!['seo_title','seo_description','seo_primary_keyword','seo_secondary_keywords','seo_version'].includes(k))
 if(!original||protectedFields.some(k=>(post[k]??null)!==(original[k]??null)))throw new SeoAutomationError(409,'SEO_CORRECTION_SOURCE_CONFLICT')
 if(same(readSeoMetadata(post),metadata))throw new SeoAutomationError(422,'SEO_CORRECTION_UNCHANGED')
 const snapshot=seoSnapshot(post),guard=whereSnapshot(snapshot)
 // Neither a concurrent editor nor another correction can change source/job ownership between read and reservation.
 const reserved=await db.prepare(`UPDATE post_seo_jobs SET state='leased',lease_token=?,lease_until=?,snapshot_json=?,updated_at=?,next_attempt_at=NULL
  WHERE id=? AND state=? AND lease_token IS ? AND updated_at IS ? AND receipt_json IS ?
  AND EXISTS(SELECT 1 FROM seo_automation_config WHERE id=1 AND enabled=0)
  AND EXISTS(SELECT 1 FROM posts WHERE id=? AND ${guard.sql})`)
  .bind(token,iso(new Date(now.getTime()+15*60_000)),JSON.stringify(snapshot),iso(now),id,job.state,job.lease_token,job.updated_at,job.receipt_json,post.id,...guard.values).run()
 if(!reserved.meta.changes)throw new SeoAutomationError(409,'SEO_CORRECTION_CONFLICT')
 return finishSeoJob(db,id,result,clock)
}

export async function seoStats(db:D1Database,now=new Date()){
 const states=await db.prepare('SELECT state,COUNT(*) AS count FROM post_seo_jobs GROUP BY state').all<any>()
 const usage=await db.prepare('SELECT generations FROM seo_daily_usage WHERE day=?').bind(fortalezaDay(now)).first<any>()
 return {config:await seoConfig(db),day:fortalezaDay(now),generations:usage?.generations||0,states:states.results||[],pilots:await seoPilotStatuses(db)}
}

export interface PilotMetric {url:string;clicks:number;impressions:number;ctr:number;position:number}
function seededValue(seed:string,key:string){let h=2166136261;for(const c of seed+':'+key){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
export async function prepareSeoPilot(db:D1Database,input:{seed:string;start_date:string;end_date:string;pages:PilotMetric[]},now=new Date()){
 if(input.end_date>calendarAdd(dateInPt(now),-3))throw new SeoAutomationError(422,'SEO_BASELINE_NOT_FINAL')
 const replay=await db.prepare('SELECT id,prepared FROM seo_pilots WHERE seed=?').bind(input.seed).first<any>()
 if(replay?.prepared)return {pilot_id:replay.id,reused:true}
 const eligible=input.pages.filter(p=>p.impressions>=100&&p.position>=4&&p.position<=20&&p.ctr<.03)
 const config=await seoConfig(db)
 const posts=await db.prepare(`SELECT p.* FROM posts p WHERE ${eligibilitySql} AND datetime(p.published_at)>=datetime(?)
 AND datetime(p.published_at)<datetime(?) AND NOT EXISTS(SELECT 1 FROM post_seo_revisions r WHERE r.post_id=p.id AND r.actor='n8n')
 AND NOT EXISTS(SELECT 1 FROM seo_pilot_members m JOIN seo_pilots sp ON sp.id=m.pilot_id WHERE m.post_id=p.id AND datetime(sp.created_at,'+28 days')>datetime(?))`)
 .bind(iso(now),iso(new Date(now.getTime()-90*86400_000)),config?.activated_at||iso(now),iso(now)).all<any>()
 const byUrl=new Map((posts.results||[]).filter(p=>seoEligible(p,now)).map(p=>[getPostUrl(p,BASE),p])),seen=new Set<number>()
 const candidates=eligible.flatMap(metric=>{const post=byUrl.get(metric.url);if(!post||seen.has(post.id))return [];seen.add(post.id);return [{post,metric}]})
 // Match within editoria, prioritizing similar position, age and traffic; preserve every baseline and seed.
 candidates.sort((a,b)=>b.metric.impressions-a.metric.impressions||a.post.id-b.post.id)
 const members:any[]=[]
 while(candidates.length>1&&members.length<60){
  const first=candidates.shift()!,age=(p:any)=>Math.max(0,(now.getTime()-Date.parse(p.published_at))/86400_000)
  let best=-1,distance=Infinity
  for(let i=0;i<candidates.length;i++){
   const other=candidates[i];if(other.post.category_id!==first.post.category_id)continue
   const score=Math.abs(first.metric.position-other.metric.position)/16+Math.abs(age(first.post)-age(other.post))/90+Math.abs(Math.log1p(first.metric.impressions)-Math.log1p(other.metric.impressions))
   if(score<distance){best=i;distance=score}
  }
  if(best<0)continue
  const second=candidates.splice(best,1)[0],flip=seededValue(input.seed,String(first.post.id)+':'+second.post.id)%2
  members.push({candidate:first,arm:flip?'control':'treatment',pair:members.length/2+1},{candidate:second,arm:flip?'treatment':'control',pair:members.length/2+1})
 }
 const pilot=replay||await db.prepare('INSERT INTO seo_pilots(seed,start_date,end_date,created_at) VALUES(?,?,?,?) RETURNING id').bind(input.seed,input.start_date,input.end_date,iso(now)).first<any>()
 const statements=[]
 for(const member of members){
  const {post,metric}=member.candidate
  statements.push(db.prepare('INSERT INTO seo_pilot_members(pilot_id,post_id,pair_number,arm,baseline_json) VALUES(?,?,?,?,?)').bind(pilot.id,post.id,member.pair,member.arm,JSON.stringify({...metric,category_id:post.category_id,published_at:post.published_at})))
  if(member.arm==='treatment')statements.push(db.prepare("INSERT OR IGNORE INTO post_seo_jobs(post_id,kind,pilot_id,state,created_at,updated_at,source_key) VALUES(?,'pilot',?,'pending',?,?,?)").bind(post.id,pilot.id,iso(now),iso(now),'pilot:'+pilot.id))
 }
 statements.push(db.prepare('UPDATE seo_pilots SET prepared=1 WHERE id=?').bind(pilot.id))
 await db.batch(statements)
 return {pilot_id:pilot.id,members:members.map(m=>({post_id:m.candidate.post.id,arm:m.arm,pair_number:m.pair})),count:members.length,reused:false}
}
const dateInPt=(now:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(now)
const calendarAdd=(date:string,days:number)=>new Date(Date.parse(date+'T12:00:00Z')+days*86400_000).toISOString().slice(0,10)
function followupWindow(startedAt:string,days:14|28){const start=calendarAdd(dateInPt(new Date(startedAt)),1);return {start_date:start,end_date:calendarAdd(start,days-1)}}
async function pilotTreatmentStatus(db:D1Database,pilotId:number){
 const rows=await db.prepare(`SELECT m.post_id,j.state,r.created_at AS applied_at FROM seo_pilot_members m
 LEFT JOIN post_seo_jobs j ON j.post_id=m.post_id AND j.pilot_id=m.pilot_id AND j.kind='pilot'
 LEFT JOIN post_seo_revisions r ON r.id=CAST(json_extract(j.receipt_json,'$.revision_id') AS INTEGER) AND r.post_id=m.post_id AND r.actor='n8n'
 WHERE m.pilot_id=? AND m.arm='treatment' ORDER BY m.post_id`).bind(pilotId).all<any>()
 const members=rows.results||[],applied=members.filter(m=>m.state==='applied'&&m.applied_at)
 const pending=members.filter(m=>m.state!=='applied'||!m.applied_at).map(m=>({post_id:m.post_id,state:m.state||'missing_job'}))
 // No-change is not exposure: it remains explicit and cannot silently become a treated observation.
 const startedAt=members.length>0&&pending.length===0?applied.map(m=>m.applied_at as string).sort().at(-1):null
 return {pilot_id:pilotId,status:startedAt?'observing':members.length?'awaiting_treatment':'empty',treatment_count:members.length,applied_count:applied.length,pending_count:pending.length,started_at:startedAt,pending}
}
export async function seoPilotStatuses(db:D1Database){
 const pilots=await db.prepare('SELECT id FROM seo_pilots WHERE prepared=1 ORDER BY id').all<any>(),statuses=[]
 for(const pilot of pilots.results||[])statuses.push(await pilotTreatmentStatus(db,pilot.id))
 return statuses
}
export async function dueSeoFollowups(db:D1Database,now=new Date()){
 const pilots=await db.prepare('SELECT * FROM seo_pilots WHERE prepared=1 ORDER BY id').all<any>(),output=[]
 for(const pilot of pilots.results||[]){
  const status=await pilotTreatmentStatus(db,pilot.id)
  if(!status.started_at)continue
  for(const days of [14,28] as const){
   const window=followupWindow(status.started_at,days)
   if(dateInPt(now)<calendarAdd(window.end_date,3))continue
   const recorded=await db.prepare('SELECT 1 AS found FROM seo_pilot_followups WHERE pilot_id=? AND window_days=?').bind(pilot.id,days).first<any>()
   if(recorded)continue
   const members=await db.prepare('SELECT post_id,arm,baseline_json FROM seo_pilot_members WHERE pilot_id=? ORDER BY pair_number,arm').bind(pilot.id).all<any>()
   output.push({pilot_id:pilot.id,window_days:days,started_at:status.started_at,...window,members:(members.results||[]).map(m=>({post_id:m.post_id,url:JSON.parse(m.baseline_json).url,arm:m.arm}))})
  }
 }
 return output
}
export async function recordSeoFollowup(db:D1Database,pilotId:number,days:14|28,metrics:PilotMetric[],now=new Date(),range?:{start_date:string;end_date:string}){
 const pilot=await db.prepare('SELECT * FROM seo_pilots WHERE id=?').bind(pilotId).first<any>()
 if(!pilot)throw new SeoAutomationError(404,'SEO_PILOT_NOT_FOUND')
 const status=await pilotTreatmentStatus(db,pilotId)
 if(!status.started_at)throw new SeoAutomationError(409,'SEO_PILOT_TREATMENT_PENDING')
 const expected=followupWindow(status.started_at,days)
 if(dateInPt(now)<calendarAdd(expected.end_date,3))throw new SeoAutomationError(409,'SEO_FOLLOWUP_TOO_EARLY')
 if(range&&(range.start_date!==expected.start_date||range.end_date!==expected.end_date))throw new SeoAutomationError(422,'SEO_FOLLOWUP_WINDOW_MISMATCH')
 const members=await db.prepare('SELECT baseline_json FROM seo_pilot_members WHERE pilot_id=?').bind(pilotId).all<any>()
 const expectedUrls=new Set((members.results||[]).map(m=>JSON.parse(m.baseline_json).url))
 if(metrics.length!==expectedUrls.size||new Set(metrics.map(m=>m.url)).size!==metrics.length||metrics.some(m=>!expectedUrls.has(m.url)))throw new SeoAutomationError(422,'SEO_FOLLOWUP_MEMBERS_MISMATCH')
 await db.prepare('INSERT INTO seo_pilot_followups(pilot_id,window_days,metrics_json,start_date,end_date,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(pilot_id,window_days) DO UPDATE SET metrics_json=excluded.metrics_json,start_date=excluded.start_date,end_date=excluded.end_date,created_at=excluded.created_at').bind(pilotId,days,JSON.stringify(metrics),expected.start_date,expected.end_date,iso(now)).run()
 return {pilot_id:pilotId,window_days:days,recorded:true}
}
