import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { describe,it,expect } from 'vitest'
import { updatePost } from '../../packages/core/db/posts'
import { claimSeoJobs,configureSeo,correctSeoJob,createSeoAutomationRouter,dryRunSeo,dueSeoFollowups,finishSeoJob,getSeoPost,listSeoHistory,prepareSeoPilot,readSeoMetadata,recordSeoFollowup,restoreSeoRevision,saveSeoMetadata,seoMetadataSchema,seoSnapshot,seoStats,seoPilotStatuses } from '../../packages/core/seo-automation'
const {DatabaseSync}=createRequire(import.meta.url)('node:sqlite')
const NOW=new Date('2026-11-06T13:00:00Z')
const next={seo_title:'Concurso de Teresina abre inscrições',seo_description:'Confira os requisitos e prazos das inscrições do concurso de Teresina.',seo_primary_keyword:'concurso de Teresina',seo_secondary_keywords:['inscrições','requisitos']}
function fixture(){
 const sql=new DatabaseSync(':memory:')
 sql.exec('PRAGMA foreign_keys=ON')
 sql.exec(`CREATE TABLE posts(id INTEGER PRIMARY KEY, title TEXT,excerpt TEXT,content TEXT,content_markdown TEXT,content_json TEXT,content_version INTEGER DEFAULT 1,
 status TEXT,slug TEXT,published_at TEXT,created_at TEXT,updated_at TEXT,category_id INTEGER,opinion_type TEXT,is_live INTEGER,seo_noindex INTEGER,seo_canonical TEXT,seo_title TEXT,seo_description TEXT);
 CREATE TABLE posts_tags(post_id INTEGER,tag_id INTEGER,created_at TEXT);`)
 sql.exec(readFileSync(new URL('../../migrations/0054_seo_automation.sql',import.meta.url),'utf8'))
 function add(id:number,patch:Record<string,any>={}){
  const row={id,title:'Concurso de Teresina',excerpt:'Inscrições abertas.',content:'<p>As inscrições do concurso de Teresina abrem em novembro, com requisitos e prazo publicados.</p>',content_version:1,status:'published',slug:'concurso-'+id,published_at:'2026-11-06T12:30:00Z',created_at:'2026-11-06T12:30:00Z',updated_at:'2026-11-06T12:30:00Z',category_id:1,opinion_type:'news',is_live:0,seo_noindex:0,...patch}
  sql.prepare(`INSERT INTO posts(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(()=>'?').join(',')})`).run(...Object.values(row))
 }
 function prepare(query:string,args:any[]=[]):any{return {bind:(...v:any[])=>prepare(query,v),first:async()=>sql.prepare(query).get(...args)??null,all:async()=>({results:sql.prepare(query).all(...args)}),run:async()=>{hooks.beforeRun?.(query);const r=sql.prepare(query).run(...args);return {meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)},success:true}}}}
 const hooks:{beforeBatch:(()=>void)|null;beforeRun?:((query:string)=>void)|null}={beforeBatch:null}
 const db:any={prepare,batch:async(statements:any[])=>{if(hooks.beforeBatch){const callback=hooks.beforeBatch;hooks.beforeBatch=null;callback()}sql.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sql.exec('COMMIT');return result}catch(e){sql.exec('ROLLBACK');throw e}}}
 add(1)
 return {sql,db,add,hooks}
}
describe('SEO metadata persistence and optimistic concurrency',()=>{
 it('changes only four fields and SEO bookkeeping, records history and restores exact metadata',async()=>{
  const {sql,db}=fixture();try{
   const before=await getSeoPost(db,1),snapshot=seoSnapshot(before)
   const result=await saveSeoMetadata(db,1,next,{expectedSnapshot:snapshot,operationKey:'first',now:NOW})
   expect(result.status).toBe('applied')
   const after=await getSeoPost(db,1)
   for(const key of ['content','title','excerpt','slug','published_at','updated_at','status','seo_canonical','seo_noindex'])expect(after[key]).toBe(before[key])
   expect(readSeoMetadata(after)).toEqual(next);expect(after.seo_version).toBe(1)
   expect((await listSeoHistory(db,1))[0].before).toEqual(readSeoMetadata(before))
   await restoreSeoRevision(db,1,result.revision_id!,1)
   expect(readSeoMetadata(await getSeoPost(db,1))).toEqual(readSeoMetadata(before))
   expect((await listSeoHistory(db,1)).length).toBe(2)
  }finally{sql.close()}
 })
 it('does not churn history or dates for a no-op and replays an operation idempotently',async()=>{
  const {sql,db}=fixture();try{
   const first=await saveSeoMetadata(db,1,next,{operationKey:'same',now:NOW}),after=await getSeoPost(db,1)
   expect(await saveSeoMetadata(db,1,next,{operationKey:'same',now:NOW})).toEqual(first)
   expect(await saveSeoMetadata(db,1,next,{operationKey:'other'})).toEqual({status:'no_change'})
   expect((await listSeoHistory(db,1)).length).toBe(1);expect(await getSeoPost(db,1)).toEqual(after)
  }finally{sql.close()}
 })
 it.each(['title','excerpt','content','seo_title'])('rejects stale source after concurrent %s edit even with unchanged timestamp',async key=>{
  const {sql,db}=fixture();try{
   const snapshot=seoSnapshot(await getSeoPost(db,1));sql.prepare(`UPDATE posts SET ${key}=? WHERE id=1`).run('Concurrent change')
   await expect(saveSeoMetadata(db,1,next,{expectedSnapshot:snapshot})).rejects.toMatchObject({status:409})
   expect((await listSeoHistory(db,1)).length).toBe(0)
  }finally{sql.close()}
 })
 it('persists keywords through a full unchanged editor form without changing editorial dates',async()=>{
  const {sql,db}=fixture();try{
   const before=await getSeoPost(db,1)
   await updatePost(db,1,{title:before.title,excerpt:before.excerpt,content:before.content,category_id:1,opinion_type:'news',is_live:0,seo_noindex:0,...next,expected_seo_version:0})
   const after=await getSeoPost(db,1);expect(readSeoMetadata(after)).toEqual(next);expect(after.updated_at).toBe(before.updated_at);expect(after.content_version).toBe(1)
   await expect(updatePost(db,1,{...next,title:'stale editor',expected_seo_version:0})).rejects.toMatchObject({status:409})
   expect((await getSeoPost(db,1)).title).toBe(before.title)
  }finally{sql.close()}
 })
 it('records combined editorial and SEO updates in one revision',async()=>{
  const {sql,db}=fixture();try{
   await updatePost(db,1,{...next,title:'Nova manchete',expected_seo_version:0})
   expect((await getSeoPost(db,1)).title).toBe('Nova manchete');expect((await listSeoHistory(db,1)).length).toBe(1)
  }finally{sql.close()}
 })
 it('validates limits, unknown fields, duplicates and missing article',async()=>{
  const {sql,db}=fixture();try{
   expect(()=>seoMetadataSchema.parse({...next,seo_secondary_keywords:['Termo','termo']})).toThrow()
   expect(()=>seoMetadataSchema.parse({...next,slug:'alterar'})).toThrow()
   expect(()=>seoMetadataSchema.parse({...next,seo_title:'x'.repeat(201)})).toThrow()
   await expect(saveSeoMetadata(db,999,next)).rejects.toMatchObject({status:404})
  }finally{sql.close()}
 })
})
describe('Durable SEO jobs',()=>{
 it('keeps dry-run entirely read-only and disabled processing returns no leases',async()=>{
  const {sql,db}=fixture();try{
   const jobs=await dryRunSeo(db,10,NOW);expect(jobs).toHaveLength(1);expect(jobs[0].lease_token).toBeNull();expect(jobs[0].job_id).toBeNull()
   expect(await claimSeoJobs(db,20,NOW)).toEqual([])
   expect(sql.prepare('SELECT COUNT(*) n FROM post_seo_jobs').get().n).toBe(0)
   expect(sql.prepare('SELECT COUNT(*) n FROM seo_daily_usage').get().n).toBe(0)
  }finally{sql.close()}
 })
 it('claims exclusively, enforces daily budget and only includes new eligible publications',async()=>{
  const {sql,db,add}=fixture();try{
   add(2);add(3,{published_at:'2026-10-01'});add(4,{seo_noindex:1});add(5,{status:'draft'});add(6,{seo_canonical:'https://example.com/'});add(7,{is_live:1});add(8,{published_at:'2027-01-01'})
   await configureSeo(db,true,new Date('2026-11-06T12:00:00Z'),1)
   const first=await claimSeoJobs(db,20,NOW);expect(first).toHaveLength(1);expect(first[0].post_id).toBe(1)
   expect(await claimSeoJobs(db,20,NOW)).toHaveLength(0);expect((await seoStats(db,NOW)).generations).toBe(1)
  }finally{sql.close()}
 })
 it.each(['apply','no_change'] as const)('never reopens unchanged %s content after eight days but admits fresh and changed sources',async status=>{
  const {sql,db,add}=fixture();try{
   await configureSeo(db,true,new Date('2026-11-06T12:00:00Z'))
   const job=(await claimSeoJobs(db,1,NOW))[0]
   await finishSeoJob(db,job.job_id,{lease_token:job.lease_token,operation_key:'completed-'+status,status,metadata:status==='apply'?next:undefined,reason:'Concluído'},NOW)
   const later=new Date(NOW.getTime()+8*86400_000)
   expect(await claimSeoJobs(db,20,later)).toEqual([])
   add(2,{published_at:'2026-11-14T12:30:00Z'})
   expect((await claimSeoJobs(db,20,later)).map(j=>j.post_id)).toEqual([2])
   sql.exec("UPDATE posts SET content='<p>Atualização factual nova do concurso.</p>' WHERE id=1")
   expect((await claimSeoJobs(db,20,later)).map(j=>j.post_id)).toEqual([1])
   expect(sql.prepare('SELECT state FROM post_seo_jobs WHERE id=?').get(job.job_id).state).toBe(status==='apply'?'applied':'no_change')
  }finally{sql.close()}
 })
 it('keeps a changed no-change source in cooldown for seven days',async()=>{
  const {sql,db}=fixture();try{
   await configureSeo(db,true,new Date('2026-11-06T12:00:00Z'))
   const job=(await claimSeoJobs(db,1,NOW))[0]
   await finishSeoJob(db,job.job_id,{lease_token:job.lease_token,operation_key:'no-change-cooldown',status:'no_change',reason:'Sem alteração necessária'},NOW)
   sql.exec("UPDATE posts SET content='<p>Nova atualização do concurso.</p>' WHERE id=1")
   expect(await claimSeoJobs(db,1,new Date(NOW.getTime()+86400_000))).toEqual([])
   expect((await claimSeoJobs(db,1,new Date(NOW.getTime()+8*86400_000)))[0].post_id).toBe(1)
  }finally{sql.close()}
 })
 it('applies ten outputs to their own articles and replays receipts without second writes',async()=>{
  const {sql,db,add}=fixture();try{
   for(let id=2;id<=10;id++)add(id)
   await configureSeo(db,true,new Date('2026-11-06T12:00:00Z'))
   const jobs=await claimSeoJobs(db,20,NOW);expect(jobs).toHaveLength(10)
   for(const job of jobs){const input:any={lease_token:job.lease_token,operation_key:'job-'+job.job_id,status:'apply',metadata:{...next,seo_title:'Título específico '+job.post_id},reason:'Termos sustentados pelo texto'}
    const result=await finishSeoJob(db,job.job_id,input,NOW);expect(result.status).toBe('applied');expect(await finishSeoJob(db,job.job_id,input,NOW)).toEqual(result)
    expect((await getSeoPost(db,job.post_id)).seo_title).toBe('Título específico '+job.post_id)
   }
   expect(sql.prepare('SELECT COUNT(*) n FROM post_seo_revisions').get().n).toBe(10)
   expect(await claimSeoJobs(db,20,new Date(NOW.getTime()+86400000))).toHaveLength(0)
  }finally{sql.close()}
 })
 it('rejects expired reservations and stops transient retry after three claims',async()=>{
  const {sql,db}=fixture();try{
   await configureSeo(db,true,new Date('2026-11-06T12:00:00Z'))
   let time=NOW,job=(await claimSeoJobs(db,1,time))[0]
   await expect(finishSeoJob(db,job.job_id,{lease_token:job.lease_token,operation_key:'late',status:'apply',metadata:next,reason:'late'},new Date(time.getTime()+16*60000))).rejects.toMatchObject({status:409})
   for(let attempt=1;attempt<=3;attempt++){
    if(attempt>1){time=new Date(time.getTime()+5*60000);job=(await claimSeoJobs(db,1,time))[0]}
    const result=await finishSeoJob(db,job.job_id,{lease_token:job.lease_token,operation_key:'failure-'+attempt,status:'error',reason:'Temporary upstream error',transient:true},time)
    expect(result.status).toBe(attempt===3?'exhausted':'retry')
   }
   expect(await claimSeoJobs(db,1,new Date(time.getTime()+60*60000))).toHaveLength(0)
  }finally{sql.close()}
 })
 it('rejects stale result and does not clear existing metadata on invalid JSON',async()=>{
  const {sql,db}=fixture();try{
   await configureSeo(db,true,new Date('2026-11-06T12:00:00Z'));const job=(await claimSeoJobs(db,1,NOW))[0]
   sql.exec("UPDATE posts SET title='Mudança editorial' WHERE id=1")
   await expect(finishSeoJob(db,job.job_id,{lease_token:job.lease_token,operation_key:'stale',status:'apply',metadata:next,reason:'stale'},NOW)).rejects.toMatchObject({status:409})
   const router=createSeoAutomationRouter()
   const response=await router.request('/jobs/1/result',{method:'POST',headers:{'Content-Type':'application/json'},body:'{broken'}, {DB:db} as any)
   expect(response.status).toBe(422);expect((await listSeoHistory(db,1)).length).toBe(0)
  }finally{sql.close()}
 })
 it('does not starve fresh articles behind more than 200 completed no-change jobs',async()=>{
  const {sql,db,add}=fixture();try{
   for(let id=2;id<=205;id++)add(id)
   await configureSeo(db,true,new Date('2026-11-06T12:00:00Z'))
   for(let id=1;id<=200;id++){
    const snapshot=seoSnapshot(await getSeoPost(db,id))
    sql.prepare("INSERT INTO post_seo_jobs(post_id,kind,state,created_at,updated_at,source_key,snapshot_json) VALUES(?,'new','no_change',?,?,?,?)").run(id,NOW.toISOString(),NOW.toISOString(),'completed-'+id,JSON.stringify(snapshot))
   }
   const jobs=await claimSeoJobs(db,20,NOW);expect(jobs.map(j=>j.post_id)).toEqual([201,202,203,204,205])
  }finally{sql.close()}
 })
 it('refreshes conflicted SEO source next poll while preserving the three-attempt bound',async()=>{
  const {sql,db}=fixture();try{
   await configureSeo(db,true,new Date('2026-11-06T12:00:00Z'))
   for(let attempt=1;attempt<=3;attempt++){
    const job=(await claimSeoJobs(db,1,NOW))[0];expect(job).toBeDefined()
    sql.prepare('UPDATE posts SET seo_title=? WHERE id=1').run('Concurrent metadata '+attempt)
    await expect(finishSeoJob(db,job.job_id,{lease_token:job.lease_token,operation_key:'conflict-'+attempt,status:'apply',metadata:next,reason:'Old generation'},NOW)).rejects.toMatchObject({status:409})
   }
   expect(await claimSeoJobs(db,1,NOW)).toHaveLength(0)
   expect(sql.prepare('SELECT attempts,state FROM post_seo_jobs').get()).toMatchObject({attempts:3,state:'exhausted'})
  }finally{sql.close()}
 })
 it('does not start the activation window when only disabling the automation',async()=>{
  const {sql,db}=fixture();try{
   expect((await configureSeo(db,false,NOW)).activated_at).toBeNull()
   expect((await configureSeo(db,true,NOW)).activated_at).toBe(NOW.toISOString())
  }finally{sql.close()}
 })
 it('keeps existing article deletion compatible with SEO history and jobs',async()=>{
  const {sql,db}=fixture();try{
   await configureSeo(db,true,new Date('2026-11-06T12:00:00Z'));const job=(await claimSeoJobs(db,1,NOW))[0]
   await finishSeoJob(db,job.job_id,{lease_token:job.lease_token,operation_key:'delete-test',status:'apply',metadata:next,reason:'Test'},NOW)
   sql.exec('DELETE FROM posts WHERE id=1')
   expect(sql.prepare('SELECT COUNT(*) n FROM post_seo_revisions').get().n).toBe(0)
   expect(sql.prepare('SELECT COUNT(*) n FROM post_seo_jobs').get().n).toBe(0)
   expect(sql.prepare('SELECT COUNT(*) n FROM seo_job_receipts').get().n).toBe(0)
  }finally{sql.close()}
 })
 it('rejects a lease replaced after validation but before the atomic metadata write',async()=>{
  const {sql,db,hooks}=fixture();try{
   await configureSeo(db,true,new Date('2026-11-06T12:00:00Z'));const job=(await claimSeoJobs(db,1,NOW))[0]
   hooks.beforeBatch=()=>{sql.prepare("UPDATE post_seo_jobs SET lease_token='new-owner',lease_until='2026-11-06T14:00:00Z' WHERE id=?").run(job.job_id)}
   await expect(finishSeoJob(db,job.job_id,{lease_token:job.lease_token,operation_key:'replaced-lease',status:'apply',metadata:next,reason:'Old worker'},NOW)).rejects.toMatchObject({status:409,code:'SEO_LEASE_EXPIRED'})
   expect((await getSeoPost(db,1)).seo_title).toBeNull()
   expect(await listSeoHistory(db,1)).toHaveLength(0)
   expect(sql.prepare('SELECT state,lease_token FROM post_seo_jobs').get()).toMatchObject({state:'leased',lease_token:'new-owner'})
  }finally{sql.close()}
 })
 it('checks lease expiry against database time at the metadata commit boundary',async()=>{
  const {sql,db,hooks}=fixture();try{
   sql.exec("UPDATE posts SET published_at='2000-01-01T12:00:00Z' WHERE id=1")
   await configureSeo(db,true,new Date('1999-01-01T00:00:00Z'));const job=(await claimSeoJobs(db,1))[0]
   hooks.beforeBatch=()=>{sql.prepare("UPDATE post_seo_jobs SET lease_until='1970-01-01T00:00:00Z' WHERE id=?").run(job.job_id)}
   await expect(finishSeoJob(db,job.job_id,{lease_token:job.lease_token,operation_key:'expired-at-commit',status:'apply',metadata:next,reason:'Expired worker'})).rejects.toMatchObject({status:409,code:'SEO_LEASE_EXPIRED'})
   expect((await getSeoPost(db,1)).seo_title).toBeNull();expect(await listSeoHistory(db,1)).toHaveLength(0)
  }finally{sql.close()}
 })
 it('does not starve valid work behind jobs that acquired external canonicals',async()=>{
  const {sql,db,add}=fixture();try{
   for(let id=2;id<=61;id++)add(id)
   for(let id=1;id<=61;id++){
    if(id<=60)sql.prepare("UPDATE posts SET seo_canonical='https://example.com/original' WHERE id=?").run(id)
    sql.prepare("INSERT INTO post_seo_jobs(post_id,kind,state,created_at,updated_at,source_key) VALUES(?,'new','pending',?,?,?)").run(id,NOW.toISOString(),NOW.toISOString(),'queued-'+id)
   }
   await configureSeo(db,true,new Date('2026-11-06T12:00:00Z'))
   expect((await claimSeoJobs(db,20,NOW)).map(job=>job.post_id)).toEqual([61])
   expect((await seoStats(db,NOW)).generations).toBe(1)
  }finally{sql.close()}
 })
})
describe('Audited operator corrections',()=>{
 async function reviewFixture(applied=false){
  const f=fixture()
  await configureSeo(f.db,true,new Date('2026-11-06T12:00:00Z'))
  const job=(await claimSeoJobs(f.db,1,NOW))[0]
  await finishSeoJob(f.db,job.job_id,{lease_token:job.lease_token,operation_key:'original-review',status:applied?'apply':'needs_review',metadata:applied?next:undefined,reason:'Necessita verificação temporal'},NOW)
  await configureSeo(f.db,false,NOW)
  return {...f,job}
 }
 const input=(version=0)=>({operator_correction:true as const,expected_seo_version:version,operation_key:'operator-correct-1',metadata:{...next,seo_title:'Concurso de Teresina: prazo publicado'},reason:'Correção temporal verificada por operador',evidence:{reviewed_by:'operator'}})
 it.each([false,true])('corrects review/applied=%s through leased CAS, preserves all editorial values and reconciles the receipt',async applied=>{
  const {sql,db,job}=await reviewFixture(applied);try{
   const before=await getSeoPost(db,1),usage=(await seoStats(db,NOW)).generations
   const correction=input(before.seo_version),result=await correctSeoJob(db,job.job_id,correction,NOW)
   expect(result.status).toBe('applied');expect(await correctSeoJob(db,job.job_id,correction,NOW)).toEqual(result)
   const after=await getSeoPost(db,1)
   for(const key of ['title','excerpt','content','content_markdown','content_json','content_version','published_at','created_at','updated_at','slug','status','seo_canonical','seo_noindex'])expect(after[key]).toBe(before[key])
   expect(readSeoMetadata(after)).toEqual(correction.metadata);expect(after.seo_version).toBe(before.seo_version+1)
   const history=await listSeoHistory(db,1)
   expect(history[0]).toMatchObject({actor:'n8n',reason:correction.reason,evidence:{operator_correction:true,previous_job_state:applied?'applied':'needs_review'}})
   expect(sql.prepare('SELECT state,receipt_json FROM post_seo_jobs').get()).toMatchObject({state:'applied',receipt_json:JSON.stringify(result)})
   expect((await seoStats(db,NOW)).generations).toBe(usage)
   await configureSeo(db,true,NOW)
   expect(await claimSeoJobs(db,1,new Date(NOW.getTime()+86400_000))).toEqual([])
  }finally{sql.close()}
 })
 it('requires pause, current version and unchanged original content before reserving',async()=>{
  const {sql,db,job}=await reviewFixture();try{
   await configureSeo(db,true,NOW)
   await expect(correctSeoJob(db,job.job_id,input(),NOW)).rejects.toMatchObject({code:'SEO_CORRECTION_REQUIRES_PAUSE'})
   await configureSeo(db,false,NOW)
   await expect(correctSeoJob(db,job.job_id,input(3),NOW)).rejects.toMatchObject({code:'SEO_VERSION_CONFLICT'})
   sql.exec("UPDATE posts SET content='<p>Texto modificado</p>' WHERE id=1")
   await expect(correctSeoJob(db,job.job_id,input(),NOW)).rejects.toMatchObject({code:'SEO_CORRECTION_SOURCE_CONFLICT'})
   expect(sql.prepare('SELECT state FROM post_seo_jobs').get().state).toBe('needs_review');expect(await listSeoHistory(db,1)).toHaveLength(0)
  }finally{sql.close()}
 })
 it('atomically rejects an editor change between validation and manual reservation',async()=>{
  const {sql,db,job,hooks}=await reviewFixture();try{
   hooks.beforeRun=query=>{if(query.startsWith('UPDATE post_seo_jobs SET state=\'leased\'')){hooks.beforeRun=null;sql.exec("UPDATE posts SET title='Edição concorrente' WHERE id=1")}}
   await expect(correctSeoJob(db,job.job_id,input(),NOW)).rejects.toMatchObject({code:'SEO_CORRECTION_CONFLICT'})
   expect(await listSeoHistory(db,1)).toHaveLength(0);expect(sql.prepare('SELECT state FROM post_seo_jobs').get().state).toBe('needs_review')
  }finally{sql.close()}
 })
 it('does not bypass ownership when a manual lease is replaced before application',async()=>{
  const {sql,db,job,hooks}=await reviewFixture();try{
   hooks.beforeBatch=()=>{sql.exec("UPDATE post_seo_jobs SET lease_token='other-owner' WHERE id=1")}
   await expect(correctSeoJob(db,job.job_id,input(),NOW)).rejects.toMatchObject({code:'SEO_LEASE_EXPIRED'})
   expect(await listSeoHistory(db,1)).toHaveLength(0);expect((await getSeoPost(db,1)).seo_title).toBeNull()
  }finally{sql.close()}
 })
 it('recovers the same correction after metadata commit and receipt persistence failure',async()=>{
  const {sql,db,job,hooks}=await reviewFixture();try{
   hooks.beforeRun=query=>{if(query.startsWith('INSERT INTO seo_job_receipts')){hooks.beforeRun=null;throw new Error('Temporary receipt failure')}}
   await expect(correctSeoJob(db,job.job_id,input(),NOW)).rejects.toThrow('Temporary receipt failure')
   expect((await getSeoPost(db,1)).seo_version).toBe(1);expect(await listSeoHistory(db,1)).toHaveLength(1)
   const result=await correctSeoJob(db,job.job_id,input(),new Date(NOW.getTime()+20*60_000))
   expect(result.status).toBe('applied');expect(await listSeoHistory(db,1)).toHaveLength(1)
   expect(sql.prepare('SELECT state FROM post_seo_jobs').get().state).toBe('applied')
  }finally{sql.close()}
 })
 it('accepts only explicit correction requests and metadata fields at the authenticated router boundary',async()=>{
  const {sql,db,job}=await reviewFixture();try{
   const router=createSeoAutomationRouter(),body={...input(),metadata:{...input().metadata,content:'not allowed'}}
   const response=await router.request('/jobs/'+job.job_id+'/correct',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)},{DB:db} as any)
   expect(response.status).toBe(422);expect(await listSeoHistory(db,1)).toHaveLength(0)
  }finally{sql.close()}
 })
})

describe('SEO pilot',()=>{
 async function pilotFixture(){
  const f=fixture(),pages=[]
  for(let id=2;id<=61;id++){
   f.add(id,{published_at:'2026-10-10T10:00:00Z',category_id:id%2+1})
   pages.push({url:'https://diario.dopovo.com.br/2026/10/10/concurso-'+id+'/',clicks:2,impressions:200+id,ctr:.01,position:8})
  }
  const result:any=await prepareSeoPilot(f.db,{seed:'stable-seed',start_date:'2026-10-07',end_date:'2026-11-03',pages},NOW)
  return {...f,pages,result}
 }
 it('does not offer followups while treatment has never been applied',async()=>{
  const {sql,db,pages,result}=await pilotFixture();try{
   expect(result.count).toBe(60);expect(result.members.filter((m:any)=>m.arm==='control')).toHaveLength(30)
   expect(sql.prepare("SELECT COUNT(*) n FROM post_seo_jobs WHERE kind='pilot'").get().n).toBe(30)
   expect((await prepareSeoPilot(db,{seed:'stable-seed',start_date:'2026-10-07',end_date:'2026-11-03',pages},NOW)).reused).toBe(true)
   expect(await dueSeoFollowups(db,new Date('2027-01-01T13:00:00Z'))).toEqual([])
   expect((await seoPilotStatuses(db))[0]).toMatchObject({status:'awaiting_treatment',treatment_count:30,applied_count:0,pending_count:30,started_at:null})
   await expect(recordSeoFollowup(db,result.pilot_id,14,pages,new Date('2027-01-01T13:00:00Z'))).rejects.toMatchObject({status:409,code:'SEO_PILOT_TREATMENT_PENDING'})
  }finally{sql.close()}
 })
 it('anchors exact 14/28 day finalized windows after the last actual treatment application',async()=>{
  const {sql,db,pages,result}=await pilotFixture();try{
   await configureSeo(db,true,NOW)
   const first=await claimSeoJobs(db,20,NOW)
   for(const job of first)await finishSeoJob(db,job.job_id,{lease_token:job.lease_token,operation_key:'pilot-'+job.job_id,status:'apply',metadata:next,reason:'Tratamento'},NOW)
   expect((await seoPilotStatuses(db))[0]).toMatchObject({applied_count:20,pending_count:10,started_at:null})
   expect(await dueSeoFollowups(db,new Date('2027-01-01T13:00:00Z'))).toEqual([])
   const lastApplied=new Date('2026-11-08T13:00:00Z'),last=await claimSeoJobs(db,20,lastApplied)
   for(const job of last)await finishSeoJob(db,job.job_id,{lease_token:job.lease_token,operation_key:'pilot-'+job.job_id,status:'apply',metadata:next,reason:'Tratamento'},lastApplied)
   expect((await seoPilotStatuses(db))[0]).toMatchObject({status:'observing',applied_count:30,pending_count:0,started_at:lastApplied.toISOString()})
   expect(await dueSeoFollowups(db,new Date('2026-11-24T13:00:00Z'))).toEqual([])
   expect((await dueSeoFollowups(db,new Date('2026-11-25T13:00:00Z')))[0]).toMatchObject({pilot_id:result.pilot_id,window_days:14,start_date:'2026-11-09',end_date:'2026-11-22',started_at:lastApplied.toISOString()})
   await expect(recordSeoFollowup(db,result.pilot_id,14,pages,new Date('2026-11-24T13:00:00Z'))).rejects.toMatchObject({status:409})
   expect((await recordSeoFollowup(db,result.pilot_id,14,pages,new Date('2026-11-25T13:00:00Z'),{start_date:'2026-11-09',end_date:'2026-11-22'})).recorded).toBe(true)
   expect((await dueSeoFollowups(db,new Date('2026-12-09T13:00:00Z')))[0]).toMatchObject({window_days:28,start_date:'2026-11-09',end_date:'2026-12-06'})
  }finally{sql.close()}
 })
 it.each(['needs_review','exhausted','no_change'])('exposes %s as unexposed and blocks evaluation until resolved',async state=>{
  const {sql,db}=await pilotFixture();try{
   sql.prepare('UPDATE post_seo_jobs SET state=?').run(state)
   const status=(await seoPilotStatuses(db))[0]
   expect(status.status).toBe('awaiting_treatment');expect(status.pending.every(p=>p.state===state)).toBe(true)
   expect(await dueSeoFollowups(db,new Date('2027-01-01T13:00:00Z'))).toEqual([])
  }finally{sql.close()}
 })
 it('starts observation after an audited correction resolves the last review treatment',async()=>{
  const {sql,db}=await pilotFixture();try{
   await configureSeo(db,true,NOW)
   const jobs=[...await claimSeoJobs(db,20,NOW),...await claimSeoJobs(db,20,NOW)],review=jobs.pop()!
   for(const job of jobs)await finishSeoJob(db,job.job_id,{lease_token:job.lease_token,operation_key:'pilot-correct-'+job.job_id,status:'apply',metadata:next,reason:'Tratamento'},NOW)
   await finishSeoJob(db,review.job_id,{lease_token:review.lease_token,operation_key:'pilot-review',status:'needs_review',reason:'Verificar cronologia'},NOW)
   expect((await seoPilotStatuses(db))[0]).toMatchObject({applied_count:29,pending_count:1,started_at:null})
   await configureSeo(db,false,NOW)
   const correctedAt=new Date('2026-11-07T13:00:00Z')
   await correctSeoJob(db,review.job_id,{operator_correction:true,expected_seo_version:0,operation_key:'resolve-pilot-review',metadata:next,reason:'Cronologia conferida pelo operador'},correctedAt)
   expect((await seoPilotStatuses(db))[0]).toMatchObject({status:'observing',applied_count:30,pending_count:0,started_at:correctedAt.toISOString()})
  }finally{sql.close()}
 })
})
