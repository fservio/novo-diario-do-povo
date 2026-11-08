import { describe, expect, it } from 'vitest'
import { runInNewContext } from 'node:vm'
// @ts-ignore JavaScript source is shared verbatim with n8n Code nodes.
import { contentToText, normalizeTrends, prepareJob, sanitizeGsc, searchWindow, seoPrompt, validateSeoOutput, temporalReviewReason } from '../../scripts/seo-workflow-runtime.mjs'
// @ts-ignore SDK generation is intentionally independent of package runtime.
import { buildSeoNodes, buildSeoWorkflow } from '../../scripts/seo-workflow.mjs'

const now=new Date('2026-11-06T12:00:00Z')
function article(id=101,overrides:any={}){return {post_id:id,job_id:id,lease_token:'lease-'+id,url:`https://diario.dopovo.com.br/2026/11/06/teresina-saude-${id}/`,title:'Teresina convoca profissionais da saúde',excerpt:'Convocação de 217 profissionais.',content:'<p>A Prefeitura de Teresina anunciou a convocação de 217 profissionais da saúde.</p><p>Os convocados devem conferir os documentos no edital.</p>',metadata:{seo_title:'',seo_description:'',seo_primary_keyword:'',seo_secondary_keywords:[]},seo_version:0,published_at:'2026-11-06T08:00:00Z',kind:'new',...overrides}}
function job(id=101,overrides:any={}){return prepareJob(article(id,overrides),{dry_run:false,gsc_enabled:false,run_id:'test-run',trends:{status:'not_configured',items:[]}},now)}
function response(overrides:any={}){return {seo_title:'Teresina convoca 217 profissionais da saúde',seo_description:'A Prefeitura de Teresina anunciou a convocação de 217 profissionais da saúde. Os convocados devem conferir os documentos no edital.',seo_primary_keyword:'Teresina',seo_secondary_keywords:['profissionais da saúde'],reason:'Preserva o fato e explicita a convocação.',support:[{term:'Teresina',quote:'A Prefeitura de Teresina anunciou a convocação de 217 profissionais da saúde.'},{term:'profissionais da saúde',quote:'A Prefeitura de Teresina anunciou a convocação de 217 profissionais da saúde.'}],used_sources:['content'],...overrides}}
const nodes=buildSeoNodes()
const code=(name:string)=>nodes.find((n:any)=>n.name===name).parameters.jsCode

describe('SEO workflow source and payload safety',()=>{
  it('compiles every Code node and validates ten responses against ten distinct jobs',()=>{
    for(const n of nodes.filter((n:any)=>n.type==='n8n-nodes-base.code'))expect(()=>new Function(n.parameters.jsCode)).not.toThrow()
    const jobs=Array.from({length:10},(_,i)=>job(100+i))
    const result=runInNewContext('(function(){'+code('Validar e vincular resposta')+'})()',{$input:{all:()=>jobs.map(()=>({json:{output:JSON.stringify(response())}}))},$:()=>({itemMatching:(index:number)=>({json:jobs[index]})})})
    expect(Array.from(result,(x:any)=>x.json.post_id)).toEqual(jobs.map(j=>j.post_id))
    expect(Array.from(result,(x:any)=>x.json.result.lease_token)).toEqual(jobs.map(j=>j.lease_token))
    expect(Array.from(result,(x:any)=>x.json.result.status)).toEqual(Array(10).fill('apply'))
    expect(new Set(Array.from(result,(x:any)=>x.json.result.operation_key)).size).toBe(10)
  })
  it('never uses first-item parser association and has no credential secrets or generic post PATCH',()=>{
    const source=buildSeoWorkflow()
    expect(source).not.toContain('.first()')
    expect(source).not.toMatch(/token=[a-z0-9]{12,}|sk-[a-zA-Z0-9]+/)
    expect(nodes.find((n:any)=>n.name==='Entregar resultado ao CMS').parameters.url).toContain('/api/n8n/seo/jobs/')
    expect(nodes.find((n:any)=>n.name==='A cada cinco minutos').parameters.rule.interval[0].minutesInterval).toBe(5)
    const model=nodes.find((n:any)=>n.name==='Modelo SEO autorizado')
    expect(model.parameters.model.value).toBe('gpt-6-luna')
    expect(model.parameters.responsesApiEnabled).toBe(true)
    expect(model.parameters.options.textFormat.textOptions.type).toBe('json_object')
    expect(model.parameters.options).not.toHaveProperty('temperature')
    const trends=nodes.find((n:any)=>n.name==='Ler fonte Trends')
    expect(trends.parameters.url).toBe('https://diario.dopovo.com.br/api/n8n/seo/trends')
    expect(trends.parameters.genericAuthType).toBe('httpHeaderAuth')
    expect(trends.credentials.httpHeaderAuth.id).toBe('h4xlwytBvEYpPQUE')
    expect(nodes.find((n:any)=>n.name==='Config produção').parameters.jsCode).toContain('trends_enabled:true')
  })
  it('uses no write endpoint in the dry-run source and marks previews as non-writing',()=>{
    expect(nodes.find((n:any)=>n.name==='Obter dez para simulação').parameters.url).toBe('https://diario.dopovo.com.br/api/n8n/seo/dry-run?limit=10')
    const result=runInNewContext('(function(){'+code('Resultado da simulação')+'})()',{$input:{all:()=>[{json:{post_id:101,result:{status:'apply'}}}]}})
    expect(result[0].json.write_performed).toBe(false)
    expect(buildSeoWorkflow()).toContain('.onTrue(step27).onFalse(')
    const simulationGraph=buildSeoWorkflow({simulationOnly:true}).split('export default')[1]
    expect(simulationGraph).not.toContain('.add(step0)')
    for(const name of ['Reservar até vinte','Entregar resultado ao CMS']){
      const index=nodes.findIndex((node:any)=>node.name===name)
      expect(simulationGraph).not.toContain('.to(step'+index+')')
    }
  })
  it('keeps full article text including relevant ending and defers oversized context',()=>{
    const end='A Prefeitura de Teresina anunciou a convocação de 217 profissionais da saúde.'
    const j=job(101,{content:'<p>'+('Contexto '.repeat(1000))+'</p><p>'+end+'</p><aside>PUBLICIDADE anúncio</aside><script>danger()</script>'})
    expect(j.content_text).toContain(end)
    expect(j.content_text).not.toContain('danger()')
    expect(j.content_text).not.toContain('anúncio')
    expect(seoPrompt(j)).toContain(end)
    expect(job(102,{content:'x'.repeat(61000)}).ready).toBe(false)
    expect(validateSeoOutput(response(),job(102,{content:'x'.repeat(61000)})).status).toBe('needs_review')
  })
  it('rejects invalid JSON, incomplete metadata and unexpected fields without empty-field writes',()=>{
    for(const output of ['{bad',JSON.stringify({seo_title:'Título'}),JSON.stringify(response({slug:'mudar-url'})),JSON.stringify(response({seo_secondary_keywords:['Teresina']}))]){
      const result=validateSeoOutput({output},job())
      expect(result.status).toBe('needs_review')
      expect(result.metadata).toBeUndefined()
    }
  })
  it('rejects fabricated evidence, numbers and false recency',()=>{
    expect(validateSeoOutput(response({seo_title:'Teresina convoca 500 profissionais'}),job()).status).toBe('needs_review')
    expect(validateSeoOutput(response({seo_title:'Teresina convoca hoje 217 profissionais'}),job()).status).toBe('needs_review')
    expect(validateSeoOutput(response({seo_title:'Teresina convoca amanhã 217 profissionais'}),job()).status).toBe('needs_review')
    expect(validateSeoOutput(response({support:[{term:'Teresina',quote:'A Prefeitura de Teresina iniciou as inscrições para concurso.'}]}),job()).status).toBe('needs_review')
    expect(validateSeoOutput(response({used_sources:['content','trends']}),job()).status).toBe('needs_review')
  })
  it('keeps old publication dates in the factual prompt and never sends title/body/date/canonical fields',()=>{
    const j=job(101,{published_at:'2026-10-23T08:00:00Z'})
    expect(seoPrompt(j)).toContain('2026-10-23T08:00:00Z')
    const result=validateSeoOutput(response(),j)
    expect(Object.keys(result.metadata)).toEqual(['seo_title','seo_description','seo_primary_keyword','seo_secondary_keywords'])
    for(const key of ['title','content','slug','published_at','updated_at','seo_canonical','seo_noindex'])expect(result.metadata).not.toHaveProperty(key)
  })
  it('handles model errors transiently and no-op metadata without extra edits',()=>{
    expect(validateSeoOutput({error:'timeout'},job())).toMatchObject({status:'error',transient:true})
    expect(validateSeoOutput({error:'The resource you are requesting could not be found'},job())).toMatchObject({status:'needs_review',transient:false})
    const original=validateSeoOutput(response(),job()).metadata
    expect(validateSeoOutput(response(),job(102,{metadata:original})).status).toBe('no_change')
  })
  it('sends the current Fortaleza date and rejects expired or unsupported future promises in old news',()=>{
    const dated=prepareJob(article(110,{published_at:'2026-10-26T18:00:00Z',content:'O resultado será divulgado em 28 de outubro de 2026.'}),{dry_run:true},new Date('2026-11-07T01:00:00Z'))
    expect(dated.current_date).toBe('2026-11-06')
    expect(seoPrompt(dated)).toContain('"current_date":"2026-11-06"')
    expect(temporalReviewReason('Resultado será divulgado em 28 de outubro',dated)).toContain('data já passada')
    expect(temporalReviewReason('Resultado será divulgado em breve',dated)).toContain('prazo relativo')
    expect(temporalReviewReason('Google planeja expansão nos próximos dois meses',dated)).toContain('prazo relativo')
    expect(temporalReviewReason('Resultado será divulgado',dated)).toContain('sem data futura')
    expect(temporalReviewReason('O órgão não deve transferir os custos ao consumidor',dated)).toBeNull()
    expect(temporalReviewReason('O regimento prevê eleição secreta para os dirigentes',dated)).toBeNull()
    expect(temporalReviewReason('O regimento determina que o presidente será eleito em escrutínio secreto',dated)).toBeNull()
    expect(temporalReviewReason('A lei será votada em 28 de outubro',dated)).toContain('data já passada')
    expect(temporalReviewReason('Inscrições estão abertas até 28 de outubro',dated)).toContain('data já passada')
    expect(temporalReviewReason('Sorteio marcado para 28 de outubro',dated)).toContain('data já passada')
    expect(temporalReviewReason('Resultado tinha divulgação prevista para 28 de outubro',dated)).toBeNull()
    const future={...dated,content_text:'A prova será aplicada em 29 de novembro de 2026.'}
    expect(temporalReviewReason('Prova será aplicada em 29 de novembro de 2026',future)).toBeNull()
    const old=job(111,{published_at:'2026-10-26T18:00:00Z'})
    expect(validateSeoOutput(response({seo_title:'Teresina vai convocar profissionais'}),old)).toMatchObject({status:'needs_review'})
  })
})

describe('Search Console and Trends evidence',()=>{
  it('uses finalized 28-day range ending three days earlier in Pacific time',()=>{
    expect(searchWindow(now)).toMatchObject({startDate:'2026-10-07',endDate:'2026-11-03',type:'web',dataState:'final'})
    expect(searchWindow(new Date('2026-11-06T01:00:00Z')).endDate).toBe('2026-11-02')
    const req=job().gsc_request
    expect(req.dimensionFilterGroups[0].filters).toEqual([{dimension:'page',operator:'equals',expression:job().url},{dimension:'country',operator:'equals',expression:'bra'}])
  })
  it('drops irrelevant query/trend terms, stale timestamps and future signals',()=>{
    const rss={rss:{channel:{item:[{title:'Teresina',pubDate:'Fri, 06 Nov 2026 10:00:00 GMT'},{title:'Teresina',pubDate:'Tue, 03 Nov 2026 10:00:00 GMT'},{title:'Futuro',pubDate:'Fri, 06 Nov 2026 20:00:00 GMT'},{title:'Flamengo',pubDate:'Fri, 06 Nov 2026 10:00:00 GMT'}]}}}
    const trends=normalizeTrends(rss,now)
    expect(trends.map((t:any)=>t.term)).toEqual(['Teresina','Flamengo'])
    const j=prepareJob(article(),{dry_run:true,gsc_enabled:true,trends:{status:'available',items:trends}},now)
    expect(j.trends.items.map((t:any)=>t.term)).toEqual(['Teresina'])
    const incidental=prepareJob(article(102,{content:article().content+'<p>O tenente Jorge comentou a ação.</p>'}),{dry_run:true,gsc_enabled:true,trends:{status:'available',items:[...trends,{term:'Jorge',published_at:'2026-11-06T10:00:00Z',geo:'BR'}]}},now)
    expect(incidental.trends.items.map((t:any)=>t.term)).toEqual(['Teresina'])
    const ambiguous=prepareJob(article(103,{title:'Jorge participa de homenagem',excerpt:'Jorge comentou a cerimônia.'}),{dry_run:true,gsc_enabled:true,trends:{status:'available',items:[{term:'Jorge',published_at:'2026-11-06T10:00:00Z',geo:'BR'}]}},now)
    expect(ambiguous.trends.items).toEqual([])
    expect(sanitizeGsc({rows:[{keys:['Teresina'],clicks:2,impressions:100,ctr:.02,position:5},{keys:['Flamengo'],clicks:2,impressions:100,ctr:.02,position:5}]},j,now).rows).toHaveLength(1)
  })
  it('records Google unavailable/not configured without fabricating observations',()=>{
    const j=job()
    expect(j.search_console).toMatchObject({status:'not_configured',rows:[]})
    expect(sanitizeGsc({statusCode:403,body:{error:'scope'}},j,now)).toMatchObject({status:'unavailable',rows:[]})
    expect(sanitizeGsc({error:'timeout'},j,now)).toMatchObject({status:'unavailable',rows:[]})
    expect(sanitizeGsc({statusCode:200,body:{responseAggregationType:'byPage'}},j,now)).toMatchObject({status:'no_relevant_queries',rows:[]})
    expect(sanitizeGsc({statusCode:200,body:{rows:'invalid'}},j,now)).toMatchObject({status:'unavailable',rows:[]})
    expect(validateSeoOutput(response({used_sources:['content','search_console']}),j).status).toBe('needs_review')
  })
  it('decodes accents and numeric HTML entities while removing markup',()=>{
    expect(contentToText('<p>Sa&uacute;de &#50;&#49;&#55;</p><ins>Publicidade</ins>')).toBe('Saúde 217')
  })
  it('distinguishes an unavailable Trends proxy from a valid feed with no fresh signals',()=>{
    const run=(failed:boolean)=>runInNewContext('(function(){'+code('Guardar contexto Trends')+'})()',{
      $input:{all:()=>[{json:{rss:{channel:{}}}}]},
      $:(name:string)=>({all:()=>[{json:name==='Preparar XML Trends'?{fetch_failed:failed}:{dry_run:true}}]}),
      $getWorkflowStaticData:()=>({})
    })[0].json.trends
    expect(run(true)).toMatchObject({status:'unavailable',items:[]})
    expect(run(false)).toMatchObject({status:'no_fresh_signals',items:[]})
  })
})
