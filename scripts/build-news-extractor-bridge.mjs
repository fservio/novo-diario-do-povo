import {mkdir,writeFile} from 'node:fs/promises'
import {planExtractorCommand,extractorAcknowledgment} from './news-extractor-bridge-runtime.mjs'
const auth={httpHeaderAuth:{id:'h4xlwytBvEYpPQUE',name:'Header Auth account'}}
const nodes=[]
const add=(name,type,version,parameters,extra={})=>{nodes.push({name,type,typeVersion:version,parameters,...extra});return 's'+(nodes.length-1)}
const schedule=add('A cada cinco minutos','n8n-nodes-base.scheduleTrigger',1.3,{rule:{interval:[{field:'minutes',minutesInterval:5}]}})
const cms=(name,operation,body)=>add(name,'n8n-nodes-base.httpRequest',4.4,{method:'POST',url:'https://diario.dopovo.com.br/api/n8n/news-extractor/'+operation,authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',sendBody:true,specifyBody:'json',jsonBody:body,options:{timeout:30000,response:{response:{responseFormat:'json'}}}},{credentials:auth})
const claim=cms('Reservar solicitações do CMS','claim',JSON.stringify({limit:3}))
const plan=add('Preparar comandos privados','n8n-nodes-base.code',2,{mode:'runOnceForAllItems',jsCode:planExtractorCommand.toString()+"\nconst response=$input.first().json;if(response.success!==true||!Array.isArray(response.jobs))throw Error('Fila indisponível.');return response.jobs.map(job=>({json:planExtractorCommand(job),pairedItem:{item:0}}));"})
const inspect=add('Consultar itens?','n8n-nodes-base.if',2.3,{conditions:{options:{caseSensitive:true,leftValue:'',typeValidation:'strict',version:2},conditions:[{leftValue:'={{ $json.kind }}',rightValue:'inspect',operator:{type:'string',operation:'equals'}}],combinator:'and'}})
const readItems=add('Ler itens no extrator','n8n-nodes-base.httpRequest',4.4,{url:'={{ $json.extractor_url }}',options:{timeout:20000,response:{response:{responseFormat:'json',neverError:true}}}},{onError:'continueRegularOutput'})
const send=add('Encaminhar ao extrator','n8n-nodes-base.httpRequest',4.4,{method:'POST',url:'={{ $json.extractor_url }}',sendBody:true,specifyBody:'json',jsonBody:'={{ JSON.stringify($json.extractor_body) }}',options:{timeout:20000,batching:{batch:{batchSize:1,batchInterval:250}},response:{response:{responseFormat:'json',neverError:true}}}},{onError:'continueRegularOutput'})
const ackBody=add('Preparar confirmação','n8n-nodes-base.code',2,{mode:'runOnceForAllItems',jsCode:extractorAcknowledgment.toString()+"\nreturn $input.all().map((item,index)=>({json:extractorAcknowledgment(item.json,$('Preparar comandos privados').itemMatching(index).json),pairedItem:{item:index}}));"})
const ack=cms('Confirmar solicitação no CMS','ack','={{ JSON.stringify($json) }}')
const check=add('Conferir confirmações','n8n-nodes-base.code',2,{mode:'runOnceForAllItems',jsCode:"for(const item of $input.all())if(item.json.success!==true)throw Error('O CMS não confirmou a operação.');return $input.all();"})
const status=add('Ler estado do extrator','n8n-nodes-base.httpRequest',4.4,{url:'http://news-extractor:8080/feeds',options:{timeout:20000,response:{response:{responseFormat:'json'}}}})
const reportBody=add('Preparar relatório compacto','n8n-nodes-base.code',2,{mode:'runOnceForAllItems',jsCode:"const response=$input.first().json;if(response.success!==true||!Array.isArray(response.feeds))throw Error('Extrator indisponível.');return [{json:{checked_at:new Date().toISOString(),feeds:response.feeds}}];"})
const report=cms('Atualizar painel do CMS','report','={{ JSON.stringify($json) }}')
const emit=(v,k='')=>typeof v==='string'?(k!=='jsCode'&&v.includes('{{')?'expr('+JSON.stringify(v.startsWith('=')?v.slice(1):v)+')':JSON.stringify(v)):Array.isArray(v)?'['+v.map(x=>emit(x)).join(',')+']':v&&typeof v==='object'?'{'+Object.entries(v).map(([a,b])=>JSON.stringify(a)+':'+emit(b,a)).join(',')+'}':JSON.stringify(v)
const sample={success:true,kind:'inspect',jobs:[],extractor_method:'GET',extractor_url:'http://news-extractor:8080/feeds',extractor_body:{}}
const lines=nodes.map((n,i)=>'const s'+i+'='+(i===0?'trigger':n.type==='n8n-nodes-base.if'?'ifElse':'node')+'({type:'+JSON.stringify(n.type)+',version:'+n.typeVersion+',config:'+emit({name:n.name,parameters:n.parameters,...(n.credentials?{credentials:n.credentials}:{}),...(n.onError?{onError:n.onError}:{})})+',output:'+JSON.stringify([sample])+'});')
const acknowledge=ackBody+'.to('+ack+'.to('+check+'))'
const code="import {workflow,node,trigger,ifElse,expr} from '@n8n/workflow-sdk';\n"+lines.join('\n')+'\nexport default workflow("news-extractor-cms-bridge","NewsExtractor — ponte com CMS").add('+schedule+').to('+claim+').to('+plan+').to('+inspect+'.onTrue('+readItems+'.to('+acknowledge+')).onFalse('+send+'.to('+acknowledge+'))).add('+schedule+').to('+status+').to('+reportBody+').to('+report+');'
await mkdir('artifacts/news-extractor-cms',{recursive:true})
await writeFile('artifacts/news-extractor-cms/bridge-workflow.ts',code)
await writeFile('artifacts/news-extractor-cms/bridge-nodes.json',JSON.stringify(nodes,null,2))
console.log(JSON.stringify({nodes:nodes.length,aiCalls:0}))
