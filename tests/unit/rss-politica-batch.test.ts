import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'
import {describe,it,expect} from 'vitest'
const code=(file:string)=>readFileSync(new URL('../fixtures/workflows/rss-politica-batch/'+file+'.js',import.meta.url),'utf8')
const execute=(file:string,inputs:any[],previous:any={})=>runInNewContext('(function(){'+code(file)+'})()',{$input:{all:()=>inputs},$:(name:string)=>previous[name],console})
const rss=(i:number)=>({json:{link:'https://oglobo.globo.com/politica/noticia-'+i,title:'Notícia '+i,content:'<p>Texto completo '+i+'</p>',contentSnippet:'Resumo '+i}})
const rewritten=(i:number)=>({json:{output:JSON.stringify({title:'Título reescrito '+i,hat:'POLÍTICA',content:'<p>Conteúdo reescrito '+i+'.</p><p>Fonte: <a href="https://errada.example">Errada</a></p>',excerpt:'Chamada '+i,tags:'política, brasil, congresso'})}})
describe('RSS Política em lote de dez',()=>{
 it('prioriza o conteúdo completo, não duplica links do feed e preserva o pareamento',()=>{
  const source=[rss(1),rss(1),{...rss(2),json:{...rss(2).json,'content:encoded':'<p>HTML completo estendido</p>'}}]
  const output=execute('prepare',source)
  expect(output).toHaveLength(2);expect(output[0].json.source_content).toBe(source[0].json.content);expect(output[1].json.source_content).toBe('<p>HTML completo estendido</p>');expect(output[1].pairedItem.item).toBe(2)
 })
 it('seleciona até dez inéditas e para se a consulta de duplicidade for inválida',()=>{
  const source=Array.from({length:15},(_,i)=>rss(i)),responses=source.map((_,i)=>({json:{success:true,data:i<2?[{id:i+1}]:[]}}))
  const previous={'Prepare RSS':{all:()=>source,itemMatching:(i:number)=>source[i]}}
  const output=execute('select',responses,previous);expect(output).toHaveLength(10);expect(output[0].json.link).toBe(source[2].json.link);expect(output[9].json.link).toBe(source[11].json.link);expect(output[0].pairedItem.item).toBe(2)
  expect(()=>execute('select',[...responses.slice(0,14),{json:{success:false}}],previous)).toThrow(/consulta de duplicidade falhou/)
 })
 it('faz dez publicações distintas seguindo os vínculos dos itens, sem usar a primeira notícia para todas',()=>{
  const source=Array.from({length:10},(_,i)=>rss(i)),inputs=source.map((_,i)=>rewritten(9-i))
  const result=execute('parse',inputs,{'Select Up To 10 New':{all:()=>source,itemMatching:(i:number)=>source[9-i]},Config1:{first:()=>({json:{DEFAULT_CATEGORY_ID:1,DEFAULT_AUTHOR_ID:3}})}})
  expect(result).toHaveLength(10);expect(new Set(result.map((item:any)=>item.json.original_link)).size).toBe(10)
  result.forEach((item:any,i:number)=>{expect(item.json.title).toBe('Título reescrito '+(9-i));expect(item.json.original_link).toBe(source[9-i].json.link);expect(item.json.content).toContain('href="'+source[9-i].json.link+'"');expect(item.json.content).not.toContain('errada.example');expect(item.pairedItem.item).toBe(i)})
 })
 it('retira duplicatas encontradas após a IA e confirma cada publicação com a sua própria fonte',()=>{
  const posts=Array.from({length:10},(_,i)=>({json:{original_link:rss(i).json.link,title:'Título '+i}}))
  const responses=posts.map((_,i)=>({json:{success:true,data:i===1||i===6?[{id:999}]:[]}}))
  const fresh=execute('recheck',responses,{'Parse AI1':{itemMatching:(i:number)=>posts[i]}})
  expect(fresh).toHaveLength(8);expect(fresh[1].json.original_link).toBe(posts[2].json.original_link)
  const confirmed=execute('confirm',fresh.map((item:any,i:number)=>({json:{success:true,data:{...item.json,id:100+i,status:'published'}}})),{'Confirm Still New':{itemMatching:(i:number)=>fresh[i]}})
  expect(confirmed.map((item:any)=>item.json.original_link)).toEqual(fresh.map((item:any)=>item.json.original_link))
 })
 it('mantém o modelo, dispensa pesquisa externa e usa um item por chamada da IA',()=>{
  const sdk=readFileSync(new URL('../fixtures/workflows/rss-politica-batch/workflow-sdk.ts',import.meta.url),'utf8')
  expect(sdk).toContain('gpt-5.6-luna');expect(sdk).toContain('"batchSize":1,"delayBetweenBatches":250');expect(sdk).toContain('$json.source_content');expect(sdk).not.toContain("$('Select First New').first()");expect(sdk).not.toContain('webSearch')
 })
})
