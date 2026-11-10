import {workflow,node,trigger,expr} from '@n8n/workflow-sdk'

const cms={httpHeaderAuth:{id:'h4xlwytBvEYpPQUE',name:'Header Auth account'}}
const openai={openAiApi:{id:'nLuuEwm3AOMjFhwE',name:'OpenAi account'}}
const start=trigger({type:'n8n-nodes-base.scheduleTrigger',version:1.3,config:{
 name:'Acionamento avulso',parameters:{rule:{interval:[{field:'cronExpression',expression:'0 0 29 2 *'}]}}
}})
const forecast=node({type:'n8n-nodes-base.httpRequest',version:4.4,config:{
 name:'Consultar Teresina',credentials:cms,parameters:{
  method:'POST',url:'https://diario.dopovo.com.br/api/n8n/tempo/refresh',
  authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',sendBody:true,specifyBody:'json',
  jsonBody:'{"slug":"teresina-pi"}',options:{timeout:12000}
 }
}})
const prepare=node({type:'n8n-nodes-base.code',version:2,config:{
 name:'Preparar pauta',parameters:{mode:'runOnceForAllItems',jsCode:`
 const data=$input.first().json;
 if(!data.success||!data.forecast)throw Error('Sem boletim válido para a data atual.');
 const input=[
  'Você escreve uma matéria curta de serviço para o Diário do Povo. Use apenas o boletim do CPTEC/INPE abaixo.',
  'Escreva um parágrafo conciso de 35 a 60 palavras sobre como a condição prevista pode influenciar o planejamento do dia.',
  'Não inclua números, datas, horários, probabilidade de chuva, alertas, UV, temperatura observada ou condições que o boletim não informa.',
  'Retorne somente um objeto JSON com a chave contexto, contendo o parágrafo em texto simples.',
  JSON.stringify(data)
 ].join(' ');
 return [{json:{data,request:{model:'gpt-6-luna',input,max_output_tokens:1800,text:{format:{type:'json_object'}}}}}];
 `}
}})
const write=node({type:'n8n-nodes-base.httpRequest',version:4.4,config:{
 name:'Redigir contexto do dia',credentials:openai,parameters:{
  method:'POST',url:'https://api.openai.com/v1/responses',authentication:'predefinedCredentialType',nodeCredentialType:'openAiApi',
  sendBody:true,specifyBody:'json',jsonBody:expr('{{ JSON.stringify($json.request) }}'),options:{timeout:90000}
 }
}})
const verify=node({type:'n8n-nodes-base.code',version:2,config:{
 name:'Montar rascunho com dados oficiais',parameters:{mode:'runOnceForAllItems',jsCode:`
 const r=$input.first().json;
 const {city,forecast}=$('Preparar pauta').first().json.data;
 if(r.status!=='completed')throw Error('A redação da IA não foi concluída.');
 const message=r.output.filter(item=>item.type==='message').flatMap(item=>item.content).find(item=>item.type==='output_text');
 const context=JSON.parse(message.text).contexto?.trim();
 if(!context||context.length<70||context.length>550||/[<>0-9]/.test(context))throw Error('Contexto fora do formato da pauta.');
 const escape=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
 const date=forecast.date.split('-').reverse().join('/');
 const title='Previsão do tempo em '+city.name+' indica máxima de '+forecast.max+' °C';
 const intro='O CPTEC/INPE prevê '+forecast.description.toLowerCase()+' em '+city.name+' ('+city.uf+') nesta data, '+date+', com mínima de '+forecast.min+' °C e máxima de '+forecast.max+' °C.';
 const content='<p>'+escape(intro)+'</p><p>'+escape(context)+'</p><p><a href="'+forecast.localPage+'">Confira a previsão para os próximos dias</a> · <a href="'+forecast.source+'">Fonte: CPTEC/INPE</a></p>';
 return [{json:{title,excerpt:intro,content,hat:'Previsão do tempo',slug:'previsao-do-tempo-'+city.slug+'-'+forecast.date,
  category_id:8,author_id:5,status:'draft',original_link:'https://diario.dopovo.com.br'+forecast.localPage+'?boletim='+forecast.date}}];
 `}
}})
const save=node({type:'n8n-nodes-base.httpRequest',version:4.4,config:{
 name:'Salvar rascunho no CMS',credentials:cms,parameters:{
  method:'POST',url:'https://diario.dopovo.com.br/api/n8n/posts',authentication:'genericCredentialType',
  genericAuthType:'httpHeaderAuth',sendBody:true,specifyBody:'json',jsonBody:expr('{{ JSON.stringify($json) }}'),
  options:{timeout:20000}
 }
}})
export default workflow('diario-tempo-piloto','Diário do Povo — Piloto editorial de previsão').add(start).to(forecast).to(prepare).to(write).to(verify).to(save)
