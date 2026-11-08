import {readFileSync} from 'node:fs'
import {createContext,runInContext} from 'node:vm'
import {describe,it,expect} from 'vitest'
// @ts-ignore standalone n8n runtime
import {prepareEnrichedItems,parseEnrichedWriting} from '../../scripts/rss-enriched-runtime.mjs'
// @ts-ignore standalone builder
import {buildEnrichedWorkflow} from '../../scripts/build-rss-enriched-workflow.mjs'
// @ts-ignore standalone input workflow runtime
import {prepareInputs,inputResults} from '../../scripts/rss-inputs-runtime.mjs'
const base=JSON.parse(readFileSync('tests/fixtures/workflows/rss-enriched/workflow-baseline-redacted.json','utf8'))
const parser=base.nodes.find((n:any)=>n.name==='Parse AI1').parameters.jsCode
const prefix=parser.slice(0,parser.indexOf('for(const [index,item]'))
const functions=runInContext('(function(){'+prefix+';return {editorialReference,temporalMetadata,countBodyWords};})()',createContext({Intl,Date}))
const now=Date.parse('2026-11-06T21:00:00Z')
const reference=functions.editorialReference(new Date(now))
function fixture(){
 const quote='O órgão anunciou a abertura do novo espaço nesta sexta-feira, com acesso gratuito e atendimento ao público.'
 const doc={url:'https://example.com/noticia',requested_url:'https://example.com/noticia',title:'Fonte',text:(quote+' ').repeat(20),fetched_at:'2026-11-06T20:59:00Z',text_sha256:'a'.repeat(64),truncated:false}
 const item={title:'Tema',link:'https://trends.google.com/trends/explore?q=tema',guid:'guid-1','dp:version':'1','dp:feed_id':'trends','dp:documents':JSON.stringify([doc])}
 const prepared=prepareEnrichedItems([{json:item}],reference,now)[0].json
 const raw={status:'ready',title:'Órgão anuncia abertura de espaço gratuito',hat:'SERVIÇO',content:'<p>'+('O novo espaço recebe o público com atividades gratuitas e serviços descritos pela organização. ').repeat(10)+'</p>',excerpt:'Abertura foi anunciada pelo órgão.',tags:'serviço,cultura',source_urls:[doc.url],primary_fact:{text:quote,source_url:doc.url,evidence_excerpt:quote,kind:'announcement',status:'completed',event_at:'2026-11-06T17:00:00-03:00',event_date:'2026-11-06',event_timezone:'America/Fortaleza'}}
 const parse=()=>parseEnrichedWriting([{json:{output:JSON.stringify(raw)}}],()=>prepared,{DEFAULT_CATEGORY_ID:13,DEFAULT_AUTHOR_ID:3},()=>reference,functions.temporalMetadata,functions.countBodyWords)[0].json
 return {doc,item,prepared,raw,parse}
}
describe('enriched RSS to journalist',()=>{
 it('accepts collected documents and preserves feed identity',()=>{
  const f=fixture();expect(f.prepared.collection_ready).toBe(true);expect(f.prepared.collector_guid).toBe('guid-1');expect(f.prepared.documents[0].text).toBe(f.doc.text)
 })
 it('rejects missing, stale and truncated collection evidence',()=>{
  const f=fixture()
  for(const item of [{...f.item,'dp:documents':'invalid'},{...f.item,'dp:documents':JSON.stringify([{...f.doc,truncated:true}])},{...f.item,'dp:documents':JSON.stringify([{...f.doc,fetched_at:'2026-11-05T00:00:00Z'}])}])expect(prepareEnrichedItems([{json:item}],reference,now)[0].json.collection_ready).toBe(false)
 })
 it('creates the original CMS payload with sources and no six-fact requirement',()=>{
  const result=fixture().parse();expect(result.status).toBe('published');expect(result.author_id).toBe(3);expect(result.content).toContain('Fontes:');expect(result.original_link).toContain('trends.google.com');expect(result).not.toHaveProperty('research')
 })
 it.each(['unknown-url','false-quote','future','unsafe-html','refusal'])('holds %s for review without invoking research',kind=>{
  const f=fixture()
  if(kind==='unknown-url')f.raw.source_urls=['https://other.example/a']
  if(kind==='false-quote')f.raw.primary_fact.evidence_excerpt='Este trecho foi inventado e não existe no documento recebido.'
  if(kind==='future')f.raw.primary_fact.event_at='2026-11-07T17:00:00-03:00'
  if(kind==='unsafe-html')f.raw.content+='<script>alert(1)</script>'
  if(kind==='refusal')f.raw.status='needs_review'
  expect(f.parse().status).toBe('pending');expect(f.parse().collector_feed_id).toBe('trends')
 })
 it('has one journalist and no search or preliminary AI analysis node',()=>{
  const built=buildEnrichedWorkflow(base)
  expect(built.nodes).toHaveLength(16)
  expect(built.nodes.some((n:any)=>n.name==='Research Topic'||n.name==='Analisar fontes coletadas')).toBe(false)
  expect(built.nodes.find((n:any)=>n.name==='RSS Read1').parameters.url).toBe('http://news-extractor:8080/feeds/all.xml')
  for(const name of ['Check Duplicate1','Select All New','Recheck Before Publish','Confirm Still New','Create Post1','Confirm Published'])expect(built.nodes.find((n:any)=>n.name===name).parameters).toEqual(base.nodes.find((n:any)=>n.name===name).parameters)
 })
 it('validates source registrations and exposes registration failures without model calls',()=>{
  const input=prepareInputs([{json:{id:1,tipo:'artigo',url:'https://example.com/a',nome:'Fonte'}},{json:{id:2,tipo:'rss',url:'http://127.0.0.1/internal'}}])
  expect(input[0].json.valid).toBe(true);expect(input[1].json.valid).toBe(false)
  const success=inputResults([{json:{success:true,rss_path:'/feeds/articles.xml'}}],()=>input[0].json)[0].json
  expect(success.processar).toBe(false);expect(success.situacao).toBe('cadastrado')
  const failure=inputResults([{json:input[1].json}],()=>input[1].json)[0].json
  expect(failure.situacao).toBe('erro');expect(failure.erro).toContain('HTTPS')
 })
})
