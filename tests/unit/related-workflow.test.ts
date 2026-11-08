import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
const nodes=JSON.parse(readFileSync(new URL('../fixtures/workflows/related-articles/nodes.json',import.meta.url),'utf8'))
const code=(name:string)=>nodes.find((n:any)=>n.name===name).parameters.jsCode
const base='https://diario.dopovo.com.br'
function candidate(overrides:any={}){return {id:42,title:'Notícia',slug:'noticia',status:'published',published_at:new Date(Date.now()-3600000).toISOString(),seo_noindex:0,category_id:13,original_link:'https://fonte.example/noticia',content:'<p>'+('Texto de notícia '.repeat(80))+'</p>',...overrides}}
function runCandidates(posts:any[],history:any={}){
 return runInNewContext('(function(){'+code('Preparar candidatas')+'})()',{$input:{first:()=>({json:{success:true,data:posts}})},$:()=>({first:()=>({json:{BASE_URL:base}})}),$getWorkflowStaticData:()=>history})
}
describe('Related generation workflow',()=>{
  it('compiles every executable Code node',()=>{
    for(const node of nodes.filter((n:any)=>n.type==='n8n-nodes-base.code'))expect(()=>new Function(node.parameters.jsCode)).not.toThrow()
  })
  it('accepts RSS, Trends and manual news while excluding generated articles',()=>{
    const result=runCandidates([candidate(),candidate({id:43,original_link:base+'/pauta-manual/abc'}),candidate({id:44,original_link:base+'/ia/relacionada/v1/999'})])
    expect(Array.from(result,(item:any)=>item.json.parent_post_id)).toEqual([42,43])
    expect(result[0].json.link).toBe(base+'/ia/relacionada/v1/42')
  })
  it('excludes hidden, old, future, live, opinion and recently attempted news',()=>{
    const result=runCandidates([candidate({id:1,seo_noindex:1}),candidate({id:2,published_at:'2020-01-01'}),candidate({id:3,published_at:new Date(Date.now()+3600000).toISOString()}),candidate({id:4,is_live:1}),candidate({id:5,opinion_type:'column'}),candidate()],{attempts:{42:Date.now()}})
    expect(result.length).toBe(0)
  })
  it('limits research and publication to two new parents per round',()=>{
    const history:any={}
    const source=Array.from({length:5},(_,i)=>({json:candidate({id:100+i,parent_post_id:100+i})}))
    const result=runInNewContext('(function(){'+code('Select All New')+'})()',{$input:{all:()=>source.map(()=>({json:{success:true,data:[]}}))},$:()=>({itemMatching:(i:number)=>source[i]}),$getWorkflowStaticData:()=>history})
    expect(result.length).toBe(2)
    expect(Object.keys(history.attempts)).toEqual(['100','101'])
  })
})
