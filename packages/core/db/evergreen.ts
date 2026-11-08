import type {Env} from '../types'
import {randomHex,sha256Hex} from '../utils'
import {guideBriefSchema,guideDocumentSchema,guideResearchSchema,validateGuideDossier,GuideConflict,type GuideBrief} from '../evergreen'
import seed from './evergreen-library.json'

export async function getGuide(env:Env,id:number){return env.DB.prepare('SELECT * FROM evergreen_guides WHERE id=?').bind(id).first<any>()}
export async function importGuideLibrary(env:Env,actor:number){
 const sources=new Map(seed.source_catalog.map(source=>[source.id,source.url])),now=new Date().toISOString()
 for(const item of seed.topics){
  const brief=guideBriefSchema.parse({...item,source_urls:item.source_ids.map(id=>sources.get(id))})
  await env.DB.prepare('INSERT OR IGNORE INTO evergreen_guides(intent_key,slug,title,brief_json,category_slug,created_at,updated_at,edited_by) VALUES(?,?,?,?,?,?,?,?)').bind(brief.intent_key,brief.slug,brief.title,JSON.stringify(brief),brief.category_slug,now,now,actor).run()
 }
}
export async function createGuide(env:Env,input:unknown,actor:number){
 const brief=guideBriefSchema.parse(input),now=new Date().toISOString()
 const row=await env.DB.prepare('INSERT INTO evergreen_guides(intent_key,slug,title,brief_json,category_slug,created_at,updated_at,edited_by) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING RETURNING id').bind(brief.intent_key,brief.slug,brief.title,JSON.stringify(brief),brief.category_slug,now,now,actor).first<{id:number}>()
 if(!row)throw new GuideConflict('Já existe uma pauta com a mesma intenção ou URL. Consulte a biblioteca.')
 return row.id
}
async function auditStatement(env:Env,id:number,key:string,action:string,actor:number|null,details:string){return env.DB.prepare('INSERT OR IGNORE INTO evergreen_audit(guide_id,action,actor_id,version,details,action_key,created_at) SELECT id,?,?,version,?,?,? FROM evergreen_guides WHERE id=? AND action_key=?').bind(action,actor,details,key,new Date().toISOString(),id,key)}
export async function changeGuide(env:Env,id:number,version:number,assignments:string,values:any[],actor:number|null,action:string,extraWhere='',extraValues:any[]=[]){
 const key=randomHex(18),now=new Date().toISOString()
 await env.DB.batch([
  env.DB.prepare(`UPDATE evergreen_guides SET ${assignments},version=version+1,edited_by=?,updated_at=?,action_key=? WHERE id=? AND version=? ${extraWhere}`).bind(...values,actor,now,key,id,version,...extraValues),
  await auditStatement(env,id,key,action,actor,action)
 ])
 if(!await env.DB.prepare('SELECT id FROM evergreen_audit WHERE action_key=?').bind(key).first())throw new GuideConflict('O guia mudou durante esta operação. Reabra a página para carregar a versão atual.')
 return getGuide(env,id)
}
export async function claimGuideJobs(env:Env,limit=1){
 const jobs:any[]=[],now=new Date(),expires=new Date(now.getTime()+30*60000).toISOString()
 for(let i=0;i<Math.min(5,Math.max(1,limit));i++){
  const token=randomHex(24)
  const row=await env.DB.prepare(`UPDATE evergreen_guides SET work_state='researching',lease_token=?,lease_expires_at=?,lease_version=version,last_error=NULL
   WHERE id=(SELECT id FROM evergreen_guides WHERE work_state='queued' OR (work_state='researching' AND lease_expires_at<?) OR (work_state='idle' AND publication_status='published' AND review_due_at<=?) ORDER BY id LIMIT 1) RETURNING *`).bind(token,expires,now.toISOString(),now.toISOString()).first<any>()
  if(!row)break
  jobs.push({id:row.id,version:row.version,lease_token:token,lease_expires_at:expires,brief:JSON.parse(row.brief_json),existing_document:row.published_revision_id?(await env.DB.prepare('SELECT document_json FROM evergreen_revisions WHERE id=?').bind(row.published_revision_id).first<any>())?.document_json:null})
 }
 return jobs
}
export async function storeGuideRevision(env:Env,id:number,version:number,documentInput:unknown,researchInput:unknown,options:{origin:'ai'|'editorial';actor?:number;lease_token?:string}){
 const document=guideDocumentSchema.parse(documentInput),research=guideResearchSchema.parse(researchInput),guide=await getGuide(env,id)
 if(!guide)throw Error('Guia não encontrado.')
 const key=options.origin==='ai'?'ai:'+options.lease_token:'editor:'+randomHex(18),checksum=await sha256Hex(JSON.stringify({document,research}))
 const existing=await env.DB.prepare('SELECT id,checksum FROM evergreen_revisions WHERE commit_key=? AND guide_id=?').bind(key,id).first<any>()
 if(existing){if(existing.checksum!==checksum)throw new GuideConflict('Esta tentativa já recebeu outro conteúdo.');return {revision_id:existing.id,reused:true}}
 validateGuideDossier(guideBriefSchema.parse(JSON.parse(guide.brief_json)),document,research)
 const now=new Date().toISOString(),extra=options.origin==='ai'?" AND lease_token=? AND lease_expires_at>? AND work_state='researching'":'',extraValues=options.origin==='ai'?[options.lease_token,now]:[]
 if(options.origin==='ai'&&!/^[a-f0-9]{48}$/.test(options.lease_token||''))throw Error('Reserva inválida.')
 await env.DB.batch([
  env.DB.prepare(`INSERT INTO evergreen_revisions(guide_id,commit_key,origin,document_json,research_json,checksum,created_by,created_at) SELECT id,?,?,?,?,?,?,? FROM evergreen_guides WHERE id=? AND version=? ${extra}`).bind(key,options.origin,JSON.stringify(document),JSON.stringify(research),checksum,options.actor||null,now,id,version,...extraValues),
  env.DB.prepare(`UPDATE evergreen_guides SET pending_revision_id=(SELECT id FROM evergreen_revisions WHERE commit_key=?),work_state='review',lease_token=NULL,lease_expires_at=NULL,version=version+1,last_error=NULL,updated_at=?,edited_by=?,action_key=? WHERE id=? AND version=? ${extra}`).bind(key,now,options.actor||null,key,id,version,...extraValues),
  await auditStatement(env,id,key,options.origin==='ai'?'draft-received':'editorial-save',options.actor||null,checksum)
 ])
 const result=await env.DB.prepare('SELECT id,checksum FROM evergreen_revisions WHERE commit_key=?').bind(key).first<{id:number;checksum:string}>()
 if(!result)throw new GuideConflict('A reserva expirou ou houve uma alteração editorial. O texto existente foi preservado.')
 if(result.checksum!==checksum)throw new GuideConflict('Esta tentativa já recebeu outro conteúdo.')
 return {revision_id:result.id,reused:false}
}
export async function publishGuide(env:Env,id:number,version:number,revisionId:number,actor:number){
 const guide=await getGuide(env,id)
 if(!guide||guide.pending_revision_id!==revisionId)throw new GuideConflict('A revisão selecionada não é a atual.')
 const revision=await env.DB.prepare('SELECT * FROM evergreen_revisions WHERE id=? AND guide_id=?').bind(revisionId,id).first<any>()
 if(!revision)throw Error('Revisão não encontrada.')
 const document=guideDocumentSchema.parse(JSON.parse(revision.document_json)),research=guideResearchSchema.parse(JSON.parse(revision.research_json)),now=new Date()
 validateGuideDossier(guideBriefSchema.parse(JSON.parse(guide.brief_json)),document,research,now)
 const author=await env.DB.prepare('SELECT id FROM authors WHERE id=? AND is_active=1').bind(guide.author_id).first()
 const category=await env.DB.prepare('SELECT id FROM categories WHERE slug=? AND is_active=1').bind(guide.category_slug).first()
 if(!author||!category)throw Error('Escolha autoria e editoria ativas antes de publicar.')
 const previous=guide.published_revision_id?await env.DB.prepare('SELECT document_json,research_json FROM evergreen_revisions WHERE id=?').bind(guide.published_revision_id).first<any>():null
 const publicSources=(r:any)=>r.sources.map((source:any)=>({url:source.url,title:source.title}))
 const unchanged=previous&&JSON.stringify(JSON.parse(previous.document_json))===JSON.stringify(document)&&JSON.stringify(publicSources(JSON.parse(previous.research_json)))===JSON.stringify(publicSources(research))
 await changeGuide(env,id,version,"published_revision_id=pending_revision_id,pending_revision_id=NULL,publication_status='published',work_state='idle',title=?,last_checked_at=?,review_due_at=?,published_at=COALESCE(published_at,?),public_updated_at=?,lease_token=NULL,lease_expires_at=NULL",[document.title,now.toISOString(),new Date(now.getTime()+guide.review_interval_days*86400000).toISOString(),now.toISOString(),unchanged?guide.public_updated_at:now.toISOString()],actor,unchanged?'check-only':'publish',' AND pending_revision_id=?',[revisionId])
}
export async function findPublishedGuidesForNews(env:Env,postId:number){
 const post=await env.DB.prepare("SELECT id,title,excerpt FROM posts WHERE id=? AND status='published' AND seo_noindex=0 AND published_at<=?").bind(postId,new Date().toISOString()).first<any>()
 if(!post)throw Error('A notícia precisa estar publicada e visível.')
 const normalize=(s:string)=>s.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase(),text=normalize(post.title+' '+(post.excerpt||''))
 const rows=(await env.DB.prepare("SELECT g.id,g.slug,json_extract(r.document_json,'$.title') AS title,g.brief_json FROM evergreen_guides g JOIN evergreen_revisions r ON r.id=g.published_revision_id JOIN authors a ON a.id=g.author_id AND a.is_active=1 JOIN categories c ON c.slug=g.category_slug AND c.is_active=1 WHERE g.publication_status='published' ORDER BY g.id LIMIT 500").all<any>()).results
 return rows.filter(row=>{const brief:GuideBrief=JSON.parse(row.brief_json);return brief.news_triggers.some(term=>{const t=normalize(term),at=text.indexOf(t);return at>=0&&!/[a-z0-9]/.test(text[at-1]||'')&&!/[a-z0-9]/.test(text[at+t.length]||'')})}).slice(0,2).map(({brief_json,...row})=>row)
}
export async function linkExistingGuides(env:Env,postId:number){const matches=await findPublishedGuidesForNews(env,postId);for(const guide of matches)await env.DB.prepare('INSERT OR IGNORE INTO evergreen_news_links(guide_id,post_id,created_at) VALUES(?,?,?)').bind(guide.id,postId,new Date().toISOString()).run();if(matches.length)await refreshGuideLinks(env);return matches}

const linkCacheKey='evergreen:news-links:v1'
export const GUIDE_NEWS_LINKS_SQL=`SELECT p.slug AS post_slug,g.slug,g.title FROM (SELECT guide_id,post_id,created_at FROM evergreen_news_links ORDER BY created_at DESC LIMIT 4000) l CROSS JOIN evergreen_guides g ON g.id=l.guide_id CROSS JOIN posts p ON p.id=l.post_id CROSS JOIN authors a ON a.id=g.author_id AND a.is_active=1 CROSS JOIN categories c ON c.slug=g.category_slug AND c.is_active=1 WHERE g.publication_status='published' AND g.published_revision_id IS NOT NULL AND p.status='published' AND p.seo_noindex=0 AND p.published_at<=? ORDER BY l.created_at DESC`
export async function refreshGuideLinks(env:Env){
 const rows=(await env.DB.prepare(GUIDE_NEWS_LINKS_SQL).bind(new Date().toISOString()).all<any>()).results
 const links:Record<string,{slug:string;title:string}[]>=Object.create(null)
 for(const row of rows){const list=links[row.post_slug]??=[];if(list.length<2&&!list.some(g=>g.slug===row.slug))list.push({slug:row.slug,title:row.title})}
 try{await env.CACHE?.put(linkCacheKey,JSON.stringify(links),{expirationTtl:600})}catch{console.warn('[Guias] O vínculo foi salvo; o cache será renovado na próxima leitura.')}
 return links
}
export async function getGuideLinks(env:Env,postSlug:string){
 try{const snapshot=await env.CACHE?.get<Record<string,{slug:string;title:string}[]>>(linkCacheKey,'json')||await refreshGuideLinks(env);return Object.hasOwn(snapshot,postSlug)?snapshot[postSlug]:[]}catch{return []}
}
export async function blockGuideJob(env:Env,id:number,version:number,token:string,reason:string){
 const key='blocked:'+token,now=new Date().toISOString()
 if(await env.DB.prepare("SELECT id FROM evergreen_audit WHERE guide_id=? AND action_key=? AND action='research-blocked'").bind(id,key).first())return
 await env.DB.batch([
  env.DB.prepare("UPDATE evergreen_guides SET work_state='blocked',last_error=?,lease_token=NULL,lease_expires_at=NULL,version=version+1,updated_at=?,action_key=? WHERE id=? AND version=? AND lease_token=? AND lease_expires_at>? AND work_state='researching'").bind(reason,now,key,id,version,token,now),
  await auditStatement(env,id,key,'research-blocked',null,reason)
 ])
 if(!await env.DB.prepare('SELECT id FROM evergreen_audit WHERE action_key=?').bind(key).first())throw new GuideConflict('A reserva não está mais ativa. O trabalho atual foi preservado.')
}
