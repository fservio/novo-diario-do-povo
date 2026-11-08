import {readFileSync} from 'node:fs'
import {createContext,runInContext} from 'node:vm'
import {describe,it,expect} from 'vitest'
// @ts-ignore standalone workflow runtime
import {rssSourceUrls,collectionRequests,prepareDirectAnalysis,directValidatorCode} from '../../scripts/trends-direct-runtime.mjs'
// @ts-ignore standalone workflow builder
import {buildDirectWorkflow} from '../../scripts/build-trends-direct.mjs'
const baseline=JSON.parse(readFileSync('tests/fixtures/workflows/trends-direct/baseline-redacted.json','utf8'))
const original=baseline.nodes.find((n:any)=>n.name==='Validate Research').parameters.jsCode
const now=Date.parse('2026-11-06T18:00:00Z')
const temporal_reference={execution_date:'2026-11-06T18:00:00.000Z',editorial_timezone:'America/Fortaleza',editorial_datetime:'2026-11-06T15:00:00-03:00',editorial_date:'2026-11-06'}
function fixture(){
 const text=Array.from({length:6},(_,i)=>`A organização confirmou a informação número ${i+1} nesta sexta-feira, com os detalhes disponíveis ao público.`).join('\n')
 const document={requested_url:'https://example.com/noticia',url:'https://example.com/noticia',title:'Notícia confirmada',text:text.repeat(2),text_sha256:'a'.repeat(64),html_sha256:'b'.repeat(64),fetched_at:'2026-11-06T17:59:00Z'}
 const prepared={title:'Tema',link:'https://trends.google.com/trends/explore?q=tema',source_urls:[document.url],temporal_reference,research_request:{model:'gpt-6-luna',instructions:'Use obrigatoriamente pesquisa web e leia fontes atuais.\nCopie as URLs EXATAS retornadas pela ferramenta.',input:'Tema',tools:[{type:'web_search'}],tool_choice:'required',include:['web_search_call.action.sources']}}
 const analyzed=prepareDirectAnalysis([{json:{success:true,documents:[document]}}],()=>prepared,now)[0].json
 const facts=text.split('\n').map((text:string)=>({text,source_url:document.url,evidence_excerpt:text,kind:'announcement',status:'completed',event_at:'2026-11-06T14:00:00-03:00',event_date:'2026-11-06',event_timezone:'America/Fortaleza'}))
 const dossier={status:'ready',primary_fact:{...facts[0]},facts,sources:[{url:document.url,name:'Fonte',published_at:'2026-11-06',updated_at:null}]}
 const response=()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(dossier)}]}]})
 const validate=()=>runInContext('(function(){'+directValidatorCode(original)+'})()',createContext({$input:{all:()=>[{json:response()}]},$:(name:string)=>({itemMatching:()=>({json:analyzed})}),console:{warn:()=>{}},Intl,Date}))
 return {document,prepared,analyzed,dossier,validate}
}
describe('Trends direct collection',()=>{
 it('extracts only source links from RSS while retaining item lineage',()=>{
  const topic={link:'https://trends.google.com/trends/explore?q=tema',content:'Veja https://example.com/a e https://example.com/b?utm_source=rss e https://trends.google.com/trends/explore?q=tema https://example.com/a'}
  expect(rssSourceUrls(topic)).toEqual(['https://example.com/a','https://example.com/b?utm_source=rss'])
  expect(collectionRequests([{json:topic}])[0].pairedItem).toEqual({item:0})
 })
 it('omits search tools from direct analysis and keeps the original fallback request',()=>{
  const {analyzed,prepared}=fixture()
  expect(analyzed.direct_available).toBe(true)
  expect(analyzed.direct_request.tools).toBeUndefined()
  expect(analyzed.direct_request.tool_choice).toBeUndefined()
  expect(analyzed.research_request).toEqual(prepared.research_request)
 })
 it('falls back on transport failure, stale evidence and an unrelated source',()=>{
  const {prepared,document}=fixture()
  for(const body of [{error:'timeout'},{success:true,documents:[{...document,fetched_at:'2026-11-05T00:00:00Z'}]},{success:true,documents:[{...document,requested_url:'https://other.example/a'}]}])expect(prepareDirectAnalysis([{json:body}],()=>prepared,now)[0].json.direct_available).toBe(false)
 })
 it('approves evidence-backed facts without fabricating web-search activity',()=>{
  const result=fixture().validate()[0].json
  expect(result.direct_ok).toBe(true)
  expect(result.research.verified_search).toBe(false)
  expect(result.research.verified_collection).toBe(true)
  expect(result.research.evidence).toHaveLength(6)
 })
 it.each(['quote','url','future','missing-primary'])('falls back on invalid %s evidence',kind=>{
  const f=fixture()
  if(kind==='quote')f.dossier.facts[1].evidence_excerpt='Esta informação não aparece em nenhum documento consultado.'
  if(kind==='url')f.dossier.sources[0].url='https://other.example/noticia'
  if(kind==='future')f.dossier.primary_fact.event_at='2026-11-07T14:00:00-03:00'
  if(kind==='missing-primary')f.dossier.primary_fact.text='Fato central ausente dos fatos comprovados.'
  expect(f.validate()[0].json.direct_ok).toBe(false)
 })
 it('returns to web research when the model emits malformed fact entries',()=>{
  const f=fixture()
  f.dossier.facts.unshift(null as any)
  expect(f.validate()[0].json.direct_ok).toBe(false)
 })
 it('preserves publication and duplicate guards and changes only the approved parser and empty model setting',()=>{
  const result=buildDirectWorkflow(baseline)
  expect(result.nodes).toHaveLength(25)
  for(const old of baseline.nodes.filter((n:any)=>!result.changedOriginalNodes.includes(n.name)))expect(result.nodes.find((n:any)=>n.name===old.name).parameters).toEqual(old.parameters)
  const parser=result.nodes.find((n:any)=>n.name==='Parse AI1').parameters.jsCode
  expect(parser).toContain("$('Apuração aprovada').itemMatching(index).json.research")
  expect(parser).toContain('research.collection_receipts?.length')
 })
})
