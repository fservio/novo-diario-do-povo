import {workflow,node,trigger,expr} from '@n8n/workflow-sdk'

const cms={httpHeaderAuth:{id:'h4xlwytBvEYpPQUE',name:'Header Auth account'}}
const clock=trigger({type:'n8n-nodes-base.scheduleTrigger',version:1.3,config:{
 name:'Verificar horário da rodada diária',
 parameters:{rule:{interval:[{field:'cronExpression',expression:'*/5 * * * *'}]}}
}})
const dailyGate=node({type:'n8n-nodes-base.code',version:2,config:{
 name:'Abrir janela das 2h às 5h',parameters:{mode:'runOnceForAllItems',jsCode:`
 const timestamp=$input.first().json.timestamp;
 const date=timestamp?new Date(timestamp):new Date();
 const time=new Intl.DateTimeFormat('pt-BR',{
  timeZone:'America/Fortaleza',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
 }).format(date);
 const [hour,minute]=time.split(':').map(Number);
 if(hour<2||hour>=5)return [];
 return [{json:{slot:(hour-2)*12+Math.floor(minute/5)}}];
 `}
}})
const catalog=node({type:'n8n-nodes-base.httpRequest',version:4.4,config:{
 name:'Ler municípios validados',credentials:cms,parameters:{
  method:'POST',url:'https://diario.dopovo.com.br/api/n8n/tempo/catalog',
  authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth'
 }
}})
const batch=node({type:'n8n-nodes-base.code',version:2,config:{
 name:'Selecionar lote da rodada',parameters:{mode:'runOnceForAllItems',jsCode:`
 const cities=$input.first().json.cities;
 if(!Array.isArray(cities))throw Error('Catálogo de cidades indisponível.');
 const {slot}=$('Abrir janela das 2h às 5h').first().json;
 const from=Math.floor(slot*cities.length/36);
 const to=Math.floor((slot+1)*cities.length/36);
 return cities.slice(from,to).map(({slug})=>({json:{slug}}));
 `}
}})
const collect=node({type:'n8n-nodes-base.httpRequest',version:4.4,config:{
 name:'Atualizar previsão da cidade',credentials:cms,onError:'continueRegularOutput',
 parameters:{method:'POST',url:'https://diario.dopovo.com.br/api/n8n/tempo/refresh',
  authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',
  sendBody:true,specifyBody:'json',jsonBody:expr('{{ JSON.stringify($json) }}'),
  options:{timeout:12000,batching:{batch:{batchSize:3,batchInterval:600}}}}
}})
export default workflow('diario-tempo-cptec','Diário do Povo — Previsões CPTEC').add(clock).to(dailyGate).to(catalog).to(batch).to(collect)
