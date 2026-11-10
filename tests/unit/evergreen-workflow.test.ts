import {describe,it,expect} from 'vitest'
import {prepareWriting,validateWriting} from '../../scripts/guides-workflow-runtime.mjs'
import {exampleBrief,exampleDocument} from '../fixtures/evergreen'

describe('Redação dos Guias do Diário',()=>{
 it('escreve sem busca e envia cada rascunho à revisão com a reserva certa',()=>{
  const jobs=[1,2].map(id=>({json:{job:{id,version:3,lease_token:String(id).repeat(48),brief:exampleBrief}}}))
  const prepared=prepareWriting(jobs,{MODEL:'gpt-6-luna'})
  for(const item of prepared){
   expect(item.json.writing_request).not.toHaveProperty('tools')
   expect(item.json.writing_request.input).not.toContain(exampleBrief.source_urls[0])
  }
  const document={...exampleDocument,body_markdown:'## Orientações gerais\n\n'+ 'Confira o que se aplica ao seu caso e reúna as informações antes de decidir. '.repeat(2)}
  const response={json:{status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(document)}]}]}}
  const result=validateWriting([response,response],{itemMatching:(i:number)=>prepared[i]})
  expect(result.map(x=>x.json.guide_id)).toEqual([1,2])
  expect(result.map(x=>x.json.operation)).toEqual(['draft','draft'])
  expect(result[1].pairedItem).toEqual({item:1})
  expect(result[0].json.research).toEqual({opened_urls:[],sources:[],claims:[]})
 })
})
