import { describe,expect,it } from 'vitest'
// @ts-ignore JavaScript source shared verbatim with n8n.
import { buildPilotNodes,buildPilotWorkflow,collectFollowupPayloads,followupMetric,pilotPageMetrics } from '../../scripts/seo-pilot-workflow.mjs'

const url='https://diario.dopovo.com.br/2026/11/06/noticia/'
const row={keys:[url],clicks:2,impressions:200,ctr:.01,position:7}
describe('SEO pilot GSC collection',()=>{
  it('compiles Code nodes; uses real data and preserves the canonical property',()=>{
    const nodes=buildPilotNodes()
    for(const node of nodes.filter((n:any)=>n.type==='n8n-nodes-base.code'))expect(()=>new Function(node.parameters.jsCode)).not.toThrow()
    expect(buildPilotWorkflow()).not.toContain('.first()')
    expect(nodes.find((n:any)=>n.name==='Referência do piloto').parameters.jsCode).toContain('Nenhum piloto será criado sem dados reais')
    expect(nodes.find((n:any)=>n.name==='Métricas reais para seleção').parameters.url).toContain(encodeURIComponent('https://diario.dopovo.com.br/'))
  })
  it('filters genuinely eligible page metrics and rejects duplicate/incomplete pagination',()=>{
    expect(pilotPageMetrics([{statusCode:200,body:{rows:[row,{...row,keys:[url+'other'],ctr:.05}]}}])).toEqual([{url,clicks:2,impressions:200,ctr:.01,position:7}])
    expect(()=>pilotPageMetrics([{body:{rows:[row]}},{body:{rows:[row]}}])).toThrow('URL repetida')
    expect(()=>pilotPageMetrics([{statusCode:403,body:{error:'scope'}}])).toThrow('indisponível')
  })
  it('records a successful empty response as zero but never substitutes API failures',()=>{
    expect(followupMetric({statusCode:200,body:{}},{url})).toEqual({url,clicks:0,impressions:0,ctr:0,position:0})
    for(const response of [{statusCode:500,body:{}},{statusCode:403,body:{error:'scope'}},{error:'timeout'},{body:{rows:'wrong'}}])expect(()=>followupMetric(response,{url})).toThrow()
  })
  it('requires all members of each due window and keeps 14/28-day windows distinct',()=>{
    const member={pilot_id:1,window_days:14,start_date:'2026-11-07',end_date:'2026-11-20',expected:2,url}
    const first={member,metric:{url,clicks:1,impressions:100,ctr:.01,position:4}}
    expect(()=>collectFollowupPayloads([first])).toThrow('Coleta parcial')
    const second={member:{...member,url:url+'second'},metric:{...first.metric,url:url+'second'}}
    expect(collectFollowupPayloads([first,second])[0].pages).toHaveLength(2)
    expect(()=>collectFollowupPayloads([first,first])).toThrow('URL repetida')
  })
})
