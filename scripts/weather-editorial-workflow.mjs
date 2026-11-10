import {workflow,node,trigger,expr} from '@n8n/workflow-sdk'

const cms={httpHeaderAuth:{id:'h4xlwytBvEYpPQUE',name:'Header Auth account'}}
const openai={openAiApi:{id:'nLuuEwm3AOMjFhwE',name:'OpenAi account'}}
const clock=trigger({type:'n8n-nodes-base.scheduleTrigger',version:1.3,config:{
 name:'Verificar horário editorial',parameters:{rule:{interval:[{field:'cronExpression',expression:'*/10 * * * *'}]}}
}})
const select=node({type:'n8n-nodes-base.code',version:2,config:{
 name:'Escolher estado da rodada',parameters:{mode:'runOnceForAllItems',jsCode:`
 const timestamp=$input.first().json.timestamp;
 const time=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Fortaleza',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(timestamp?new Date(timestamp):new Date());
 const [hour,minute]=time.split(':').map(Number);
 const offset=hour*60+minute;
 const start=offset>=610?610:310;
 const slot=Math.floor((offset-start)/10);
 const states=['PI','AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
 return slot>=0&&slot<states.length?[{json:{uf:states[slot]}}]:[];
 `}
}})
const jobs=node({type:'n8n-nodes-base.httpRequest',version:4.4,config:{
 name:'Ler boletins do estado',credentials:cms,parameters:{
  method:'POST',url:'https://diario.dopovo.com.br/api/n8n/tempo-editorial/editorial-jobs',authentication:'genericCredentialType',
  genericAuthType:'httpHeaderAuth',sendBody:true,specifyBody:'json',jsonBody:expr('{{ JSON.stringify($json) }}'),
  options:{timeout:20000}
 }
}})
const prepare=node({type:'n8n-nodes-base.code',version:2,config:{
 name:'Preparar textos de serviço',parameters:{mode:'runOnceForAllItems',jsCode:`
 const data=$input.first().json;
 if(!data.success)throw Error('Boletins indisponíveis.');
 if(!data.jobs.length)return [];
 const input=[
  'Escreva um parágrafo curto de serviço para cada boletim informado, em português brasileiro.',
  'Use só os dados do CPTEC/INPE abaixo. Comente o que a previsão significa para os planos do leitor. Não inclua números, datas, horários, probabilidade de chuva, alertas, UV ou condições que não estejam no boletim.',
  'O CMS inclui as temperaturas, as condições de cada cidade e a fonte. Retorne JSON com uma chave para cada kind solicitado, capital ou interior. Cada texto deve ter de 60 a 550 caracteres e estar em texto simples.',
  JSON.stringify(data)
 ].join(' ');
 return [{json:{data,request:{model:'gpt-6-luna',input,max_output_tokens:2400,text:{format:{type:'json_object'}}}}}];
 `}
}})
const write=node({type:'n8n-nodes-base.httpRequest',version:4.4,config:{
 name:'Redigir previsões',credentials:openai,parameters:{
  method:'POST',url:'https://api.openai.com/v1/responses',authentication:'predefinedCredentialType',nodeCredentialType:'openAiApi',
  sendBody:true,specifyBody:'json',jsonBody:expr('{{ JSON.stringify($json.request) }}'),options:{timeout:90000}
 }
}})
const verify=node({type:'n8n-nodes-base.code',version:2,config:{
 name:'Validar textos',parameters:{mode:'runOnceForAllItems',jsCode:`
 const response=$input.first().json;
 if(response.status!=='completed')throw Error('Redação incompleta.');
 const message=response.output.filter(item=>item.type==='message').flatMap(item=>item.content).find(item=>item.type==='output_text');
 const output=JSON.parse(message.text);
 const {data}=$('Preparar textos de serviço').first().json;
 const texts={};
 for(const {kind} of data.jobs){
  const text=typeof output[kind]==='string'?output[kind].trim():'';
  if(text.length<60||text.length>550||/[<>0-9]/.test(text))throw Error('Texto fora do formato: '+kind);
  texts[kind]=text;
 }
 return [{json:{uf:data.uf,date:data.date,texts}}];
 `}
}})
const publish=node({type:'n8n-nodes-base.httpRequest',version:4.4,config:{
 name:'Publicar boletins no Diário',credentials:cms,parameters:{
  method:'POST',url:'https://diario.dopovo.com.br/api/n8n/tempo-editorial/editorial-publish',authentication:'genericCredentialType',
  genericAuthType:'httpHeaderAuth',sendBody:true,specifyBody:'json',jsonBody:expr('{{ JSON.stringify($json) }}'),options:{timeout:25000}
 }
}})
export default workflow('diario-tempo-editorial','Diário do Povo — Boletins do tempo').add(clock).to(select).to(jobs).to(prepare).to(write).to(verify).to(publish)
