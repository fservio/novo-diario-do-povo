// Operational helper. Secrets remain in child-process buffers/environment; never printed or written to artifacts.
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'

function sql(query) {
  let r
  for(let attempt=0;attempt<3;attempt++){
    r=spawnSync(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'d1','execute','webapp-prod-v2','--remote','--json','--command',query],{encoding:'utf8',maxBuffer:8*1024*1024,windowsHide:true})
    if(r.status===0)break
    const message=String(r.stderr)+String(r.stdout)
    if(!/7403|authentication error|fetch failed|ECONNRESET|ETIMEDOUT|network/i.test(message))break
  }
  if(r.status!==0)throw Error('Cloudflare operation failed; output suppressed to protect private settings.')
  let data
  try{data=JSON.parse(r.stdout)}catch{throw Error('Invalid Cloudflare response; private output suppressed.')}
  if(!Array.isArray(data)||data.some(r=>!r.success))throw Error('Cloudflare did not confirm the operation.')
  return data.flatMap(r=>r.results||[])
}
const quote=s=>"'"+String(s).replaceAll("'","''")+"'"
function pilotGuard(){
  const columns=['title','excerpt','content','content_markdown','content_json','content_format','content_version','slug','seo_canonical','seo_noindex','status','published_at','updated_at','created_at']
  return sql(`SELECT m.arm,m.pair_number,p.id,${columns.map(c=>'p.'+c).join(',')},p.seo_title,p.seo_description,p.seo_primary_keyword,p.seo_secondary_keywords,p.seo_version,p.seo_updated_at FROM seo_pilot_members m JOIN posts p ON p.id=m.post_id JOIN seo_pilots s ON s.id=m.pilot_id WHERE s.seed='diario-seo-pilot-v1' ORDER BY p.id`).map(row=>({
    post_id:row.id,arm:row.arm,pair_number:row.pair_number,
    editorial_sha256:createHash('sha256').update(JSON.stringify(columns.map(c=>[c,row[c]??null]))).digest('hex'),
    published_at:row.published_at,updated_at:row.updated_at,seo_version:row.seo_version,seo_updated_at:row.seo_updated_at,
    metadata:{seo_title:row.seo_title,seo_description:row.seo_description,seo_primary_keyword:row.seo_primary_keyword,seo_secondary_keywords:row.seo_secondary_keywords}
  }))
}
async function publicPilotSamples(){
  const rows=sql("SELECT m.arm,p.id,p.title,p.excerpt,p.seo_title,p.seo_description,p.seo_canonical,p.seo_noindex,p.published_at,p.slug,p.updated_at FROM seo_pilot_members m JOIN posts p ON p.id=m.post_id JOIN seo_pilots s ON s.id=m.pilot_id WHERE s.seed='diario-seo-pilot-v1' ORDER BY m.arm,p.id")
  const selected=['treatment','control'].flatMap(arm=>rows.filter(r=>r.arm===arm).slice(0,2))
  const decode=s=>String(s??'').replace(/&(?:amp|quot|apos|lt|gt|#39);/g,e=>({'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&#39;':"'"}[e])).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&#x([\da-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)))
  return Promise.all(selected.map(async row=>{
    const date=new Date(row.published_at).toISOString().slice(0,10).replaceAll('-','/')
    const url=`https://diario.dopovo.com.br/${date}/${row.slug}/`
    const response=await fetch(url,{signal:AbortSignal.timeout(30000)})
    const html=await response.text()
    const title=decode(html.match(/<title[^>]*>([^]*?)<\/title>/i)?.[1])
    const description=decode(html.match(/<meta\s+name="description"\s+content="([^"]*)"/i)?.[1])
    const canonical=decode(html.match(/<link\s+rel="canonical"\s+href="([^"]*)"/i)?.[1])
    const h1=decode((html.match(/<h1\b[^>]*>([^]*?)<\/h1>/i)?.[1]||'').replace(/<[^>]*>/g,'')).replace(/\s+/g,' ').trim()
    const checks={title:title.startsWith((row.seo_title||row.title)+' | '),description:description===(row.seo_description||row.excerpt||row.title),canonical:canonical===(row.seo_canonical||url),headline:h1===row.title.replace(/\s+/g,' ').trim(),noMetaKeywords:!/<meta\s+name=["']keywords["']/i.test(html)}
    return {post_id:row.id,arm:row.arm,url,status:response.status,title,description,canonical,h1,updated_at:row.updated_at,checks,passed:response.ok&&Object.values(checks).every(Boolean)}
  }))
}
let cmsApiKey
async function api(path,body){
  if(cmsApiKey===undefined){
    const row=sql("SELECT value_json FROM settings WHERE key='n8n_api_key' AND scope='private' LIMIT 1")[0]
    cmsApiKey=row?JSON.parse(row.value_json):null
  }
  const key=cmsApiKey
  if(typeof key!=='string'||!key)throw Error('CMS n8n credential unavailable.')
  const base=process.env.SEO_API_BASE||'https://diario.dopovo.com.br'
  const url=new URL(path,base)
  if(url.origin!=='https://diario.dopovo.com.br')throw Error('Authenticated SEO operations are restricted to the official CMS origin.')
  const res=await fetch(url,{method:body?'POST':'GET',headers:{'X-API-Key':key,...body?{'Content-Type':'application/json'}:{}},...body?{body:JSON.stringify(body)}:{},signal:AbortSignal.timeout(60000)})
  if(!res.ok){
    const diagnostic=res.headers.get('x-seo-trends-diagnostic')||''
    let code=/^SEO_TRENDS_[A-Z0-9_]+$/.test(diagnostic)?' '+diagnostic:''
    if(res.headers.get('content-type')?.includes('application/json')){
      const data=await res.json().catch(()=>null)
      if(typeof data?.error==='string'&&/^[A-Z_]{1,80}$/.test(data.error))code=' '+data.error
    }
    throw Error(`CMS request failed (${res.status}; ${res.headers.get('content-type')||'unknown type'}).${code}`)
  }
  if(path==='/api/n8n/seo/trends'){
    const xml=await res.text()
    return {success:true,status:res.status,rss:xml.includes('<rss'),items:(xml.match(/<item[\s>]/g)||[]).length,cacheControl:res.headers.get('cache-control')}
  }
  return res.json()
}
try{
  const action=process.argv[2]
  if(action==='set-trends'){
    const value=process.env.SEO_TRENDS_RSS_URL
    if(!value)throw Error('Trends URL must be supplied privately in the environment.')
    const u=new URL(value)
    if(u.origin!=='https://conversor-rss.fabioservio.workers.dev'||u.pathname!=='/feeds/google-trends-pautas-4e80ef75.xml'||!u.searchParams.get('token'))throw Error('Unexpected Trends source.')
    sql(`INSERT INTO settings(key,value_json,scope,updated_at) VALUES('seo_trends_rss_url',${quote(JSON.stringify(value))},'private',datetime('now')) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,scope='private',updated_at=excluded.updated_at`)
    console.log('Private Trends source configured. URL/token omitted.')
  }else if(action==='trends-upstream'){
    const row=sql("SELECT value_json FROM settings WHERE key='seo_trends_rss_url' AND scope='private' LIMIT 1")[0]
    const url=new URL(JSON.parse(row.value_json))
    if(url.origin!=='https://conversor-rss.fabioservio.workers.dev'||url.pathname!=='/feeds/google-trends-pautas-4e80ef75.xml')throw Error('Unexpected Trends source.')
    const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(15000)})
    const body=await response.text()
    console.log(JSON.stringify({status:response.status,type:response.headers.get('content-type'),bytes:body.length,rss:body.includes('<rss'),items:(body.match(/<item[\s>]/g)||[]).length}))
  }else if(action==='pilot'){
    const input=JSON.parse(await readFile('artifacts/seo-automation/pilot-baseline-payload.json','utf8'))
    if(input.seed!=='diario-seo-pilot-v1')throw Error('Unexpected pilot seed.')
    const result=await api('/api/n8n/seo/pilot',input)
    await writeFile('artifacts/seo-automation/production-pilot.json',JSON.stringify(result,null,2))
    console.log(JSON.stringify(result,null,2))
  }else if(action==='correct-pilot'){
    const draft=JSON.parse(await readFile('artifacts/seo-automation/operator-corrections.json','utf8'))
    const corrections=Array.isArray(draft)?draft:draft.corrections
    if(!Array.isArray(corrections)||corrections.length!==8)throw Error('Expected the eight reviewed pilot corrections.')
    const expected=new Set([417640,418473,418749,418575,418518,408316,412742,412779])
    if(new Set(corrections.map(c=>c.post_id)).size!==8||corrections.some(c=>!expected.has(c.post_id)||!Number.isSafeInteger(c.job_id)||c.job_id<1))throw Error('Unexpected correction article/job identity.')
    const identities=new Map(sql('SELECT id,post_id FROM post_seo_jobs WHERE id IN ('+corrections.map(c=>c.job_id).join(',')+')').map(j=>[j.id,j.post_id]))
    if(corrections.some(c=>identities.get(c.job_id)!==c.post_id))throw Error('Correction draft does not match the persisted job/article identities.')
    const receipts=[]
    for(const item of corrections){
      const operationKey='operator-20261106:'+item.job_id+':'+item.expected_seo_version+':'+createHash('sha256').update(JSON.stringify(item.metadata)).digest('hex').slice(0,16)
      const body={operator_correction:true,expected_seo_version:item.expected_seo_version,operation_key:operationKey,metadata:item.metadata,reason:item.reason,evidence:item.evidence}
      const response=await api('/api/n8n/seo/jobs/'+item.job_id+'/correct',body)
      const receipt={post_id:item.post_id,job_id:item.job_id,operation_key:operationKey,...response}
      receipts.push(receipt)
      await writeFile('artifacts/seo-automation/production-corrections.json',JSON.stringify({applied_at:new Date().toISOString(),receipts},null,2))
      console.log(JSON.stringify(receipt))
    }
  }else if(action==='capture-pilot-guard'){
    const rows=pilotGuard()
    const path='artifacts/seo-automation/production-pilot-before.json'
    await writeFile(path,JSON.stringify({captured_at:new Date().toISOString(),rows},null,2),{flag:'wx'})
    console.log(JSON.stringify({captured:rows.length,treated:rows.filter(r=>r.arm==='treatment').length,controls:rows.filter(r=>r.arm==='control').length}))
  }else if(action==='verify-pilot-guard'){
    const before=JSON.parse(await readFile('artifacts/seo-automation/production-pilot-before.json','utf8')).rows
    const after=pilotGuard(),byId=new Map(after.map(r=>[r.post_id,r]))
    const changedEditorial=before.filter(r=>byId.get(r.post_id)?.editorial_sha256!==r.editorial_sha256).map(r=>r.post_id)
    const changedControls=before.filter(r=>r.arm==='control'&&JSON.stringify(byId.get(r.post_id)?.metadata)!==JSON.stringify(r.metadata)).map(r=>r.post_id)
    const changedTreatments=before.filter(r=>r.arm==='treatment'&&JSON.stringify(byId.get(r.post_id)?.metadata)!==JSON.stringify(r.metadata)).map(r=>r.post_id)
    const result={verified_at:new Date().toISOString(),total:before.length,changedEditorial,changedControls,changedTreatments,rows:after}
    await writeFile('artifacts/seo-automation/production-pilot-after.json',JSON.stringify(result,null,2))
    console.log(JSON.stringify({total:before.length,changedEditorial,changedControls,changedTreatments},null,2))
    if(changedEditorial.length||changedControls.length)process.exitCode=1
  }else if(action==='public-pilot-samples'){
    const samples=await publicPilotSamples()
    await writeFile('artifacts/seo-automation/production-public-html.json',JSON.stringify({verified_at:new Date().toISOString(),samples},null,2))
    console.log(JSON.stringify(samples,null,2))
    if(samples.some(s=>!s.passed))process.exitCode=1
  }else if(action==='stats'){
    const result=await api('/api/n8n/seo/stats')
    await writeFile('artifacts/seo-automation/production-status.json',JSON.stringify({verified_at:new Date().toISOString(),...result},null,2))
    const data=result.data
    console.log(JSON.stringify({success:result.success,config:data.config,day:data.day,generations:data.generations,states:data.states,pilots:data.pilots?.map(({pending,...p})=>p)},null,2))
  }
  else if(action==='trends')console.log(JSON.stringify(await api('/api/n8n/seo/trends'),null,2))
  else if(action==='dry-run-input'){
    const result=await api('/api/n8n/seo/dry-run?limit=10')
    await mkdir('artifacts/seo-automation',{recursive:true})
    await writeFile('artifacts/seo-automation/dry-run-input.json',JSON.stringify(result,null,2))
    console.log(JSON.stringify({success:result.success,count:result.data?.length,ids:result.data?.map(p=>p.post_id)}))
  }else if(action==='enable'||action==='disable')console.log(JSON.stringify(await api('/api/n8n/seo/config',{enabled:action==='enable',daily_limit:300}),null,2))
  else throw Error('Unknown SEO operation; see the documented helper actions.')
}catch(error){console.error(error instanceof Error?error.message:'Operation failed.');process.exitCode=1}
