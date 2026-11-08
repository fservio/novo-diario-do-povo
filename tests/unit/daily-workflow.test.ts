import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'
import {describe,it,expect} from 'vitest'
const prepare=readFileSync(new URL('../fixtures/workflows/meu-dia/prepare-edition.js',import.meta.url),'utf8')
const validate=readFileSync(new URL('../fixtures/workflows/meu-dia/validate-edition.js',import.meta.url),'utf8')
const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
const post={id:1,status:'published',seo_noindex:0,opinion_type:'news',published_at:new Date(Date.now()-3600000).toISOString(),title:'Regra nacional de interesse público',excerpt:'Resumo',content:'<p>Conteúdo</p><a href="https://official.example/fonte?a=1&amp;b=2">Fonte</a>',original_link:'https://original.example/noticia'}
const item={post_id:1,section:'essential',scope:'BR',summary:'Uma informação confirmada e relevante para os leitores brasileiros.',source_url:'https://official.example/fonte',expires_at:null}
const run=(items:any[])=>runInNewContext('(function(){'+validate+'})()',{$input:{first:()=>({json:{status:'completed',output:[{type:'web_search_call',status:'completed',action:{type:'search',sources:[{url:item.source_url}]}},{type:'message',content:[{type:'output_text',text:JSON.stringify({date,items})}]}]}})},$:()=>({first:()=>({json:{date,posts:[post,{...post,id:2}]}})}),console})
describe('Seleção automática do Meu dia',()=>{
 it('mantém as fontes, reduz o texto e prioriza pesquisa nacional sem reclassificar itens locais',()=>{const result=runInNewContext('(function(){'+prepare+'})()',{$input:{first:()=>({json:{success:true,data:[{...post,content:post.content+'x'.repeat(5000)},{...post,id:2,status:'draft'}]}})},URL});const prepared=result[0].json;expect(prepared.posts).toHaveLength(1);expect(prepared.posts[0].source_urls).toContain('https://official.example/fonte?a=1&b=2');expect(prepared.posts[0].content.length).toBeLessThanOrEqual(2200);expect(prepared.request.instructions).toContain('Comece pela edição NACIONAL');expect(prepared.request.instructions).toContain('nunca transforme item regional em nacional')})
 it('torna explícito o bloqueio quando só há conteúdo regional',()=>{expect(()=>run([{...item,scope:'RJ'}])).toThrow(/nenhuma nacional essencial/)} )
 it('publica nacionais e regionais confirmadas e informa o descarte de item sem fonte',()=>{const result=run([item,{...item,post_id:2,scope:'PI'},{...item,post_id:3,source_url:'https://inventada.example'}]);expect(result[0].json.items).toHaveLength(2);expect(result[0].json.diagnostics).toMatchObject({proposed:3,discarded:1,national:1,regional:1})})
 it('não cria uma oportunidade a partir de prazo vencido',()=>{const result=run([item,{...item,post_id:2,section:'opportunities',expires_at:'2020-01-01T00:00:00Z'}]);expect(result[0].json.items).toHaveLength(1)})
})
