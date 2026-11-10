import {workflow,node,trigger} from '@n8n/workflow-sdk'

const schedule=trigger({
 type:'n8n-nodes-base.scheduleTrigger',version:1.3,
 config:{name:'A cada 30 minutos em dias úteis',parameters:{
  rule:{interval:[{field:'cronExpression',expression:'*/30 * * * 1-5'}]}
 }}
})
const refresh=node({
 type:'n8n-nodes-base.httpRequest',version:4.4,
 config:{name:'Atualizar PTAX do Banco Central',parameters:{
  method:'POST',url:'https://diario.dopovo.com.br/api/n8n/cambio/refresh',
  authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',
  options:{timeout:15000}
 },credentials:{httpHeaderAuth:{id:'h4xlwytBvEYpPQUE',name:'Header Auth account'}}}
})

export default workflow('diario-cambio-bcb','Diário do Povo — Câmbio do Banco Central').add(schedule).to(refresh)
