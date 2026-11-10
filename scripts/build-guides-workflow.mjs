import {writeFile,mkdir} from 'node:fs/promises'
import {prepareWriting,validateWriting} from './guides-workflow-runtime.mjs'
const folder='artifacts/guias-evergreen';await mkdir(folder,{recursive:true})
const entries=[],sample={guide_id:1,version:1,lease_token:'a'.repeat(48),operation:'draft'}
function add(variable,type,version,name,parameters,extra={}){const outputs={config:{BASE_URL:'https://diario.dopovo.com.br',MODEL:'gpt-6-luna',BATCH_SIZE:1},prepare:{...sample,writing_request:{model:'gpt-6-luna'}},claim:{success:true,jobs:[]},split:{job:{id:1}},write:{status:'completed',output:[]}};entries.push(`const ${variable}=${type==='n8n-nodes-base.scheduleTrigger'?'trigger':'node'}(${JSON.stringify({type,version,config:{name,parameters,position:[entries.length*240,0],...extra},output:[outputs[variable]||sample]})});`)}
const exp=s=>'EXPR:'+s
const cms={httpHeaderAuth:{id:'h4xlwytBvEYpPQUE',name:'Header Auth account'}},openai={openAiApi:{id:'nLuuEwm3AOMjFhwE',name:'OpenAi account'}}
const post=(url,body,ai=false)=>({method:'POST',url,authentication:ai?'predefinedCredentialType':'genericCredentialType',...(ai?{nodeCredentialType:'openAiApi'}:{genericAuthType:'httpHeaderAuth'}),sendBody:true,specifyBody:'json',jsonBody:body,options:{timeout:ai?240000:30000,response:{response:{responseFormat:'json',neverError:ai}}}})
add('schedule','n8n-nodes-base.scheduleTrigger',1.3,'A cada hora',{rule:{interval:[{field:'hours',hoursInterval:1}]}})
add('config','n8n-nodes-base.set',3.4,'Configuração',{mode:'raw',jsonOutput:JSON.stringify({BASE_URL:'https://diario.dopovo.com.br',MODEL:'gpt-6-luna',BATCH_SIZE:1})})
add('claim','n8n-nodes-base.httpRequest',4.4,'Reservar pautas',post(exp("{{ $json.BASE_URL }}/api/n8n/guides/claim"),exp('{{ JSON.stringify({limit:$json.BATCH_SIZE}) }}')),{credentials:cms,retryOnFail:true,maxTries:3,waitBetweenTries:1000})
add('split','n8n-nodes-base.splitOut',1,'Uma pauta por item',{fieldToSplitOut:'jobs',options:{destinationFieldName:'job'}})
add('prepare','n8n-nodes-base.code',2,'Preparar redação',{mode:'runOnceForAllItems',jsCode:'return ('+prepareWriting.toString()+')($input.all(),$("Configuração").first().json);'})
add('write','n8n-nodes-base.httpRequest',4.4,'Redigir guia',post('https://api.openai.com/v1/responses',exp('{{ JSON.stringify($json.writing_request) }}'),true),{credentials:openai,onError:'continueRegularOutput',retryOnFail:true,maxTries:3,waitBetweenTries:1000})
add('checkText','n8n-nodes-base.code',2,'Validar redação',{mode:'runOnceForAllItems',jsCode:'return ('+validateWriting.toString()+')($input.all(),$("Preparar redação"));'})
add('submit','n8n-nodes-base.httpRequest',4.4,'Entregar para o CMS',post(exp('{{ $("Configuração").first().json.BASE_URL }}/api/n8n/guides/{{ $json.operation }}'),exp('{{ JSON.stringify($json) }}')),{credentials:cms,retryOnFail:true,maxTries:4,waitBetweenTries:5000})
add('confirm','n8n-nodes-base.code',2,'Confirmar entrega',{mode:'runOnceForAllItems',jsCode:'for(const item of $input.all())if(item.json.success!==true)throw Error("O CMS não confirmou a entrega. Confira a reserva e a versão no painel.");return $input.all();'})
let code="import {workflow,node,trigger,expr,sticky} from '@n8n/workflow-sdk';\n"+entries.join('\n')+"\nconst note=sticky('## Guias do Diário\\nRedação com conhecimento do modelo, sem pesquisa externa. O CMS recebe um rascunho para conferência e publicação editorial.');\nexport default workflow('diario-evergreen-guides','Guias do Diário — redação e revisão').add(note).add(schedule).to(config).to(claim).to(split).to(prepare).to(write).to(checkText).to(submit).to(confirm);\n"
code=code.replace(/"EXPR:((?:[^"\\]|\\.)*)"/g,(_,s)=>'expr('+JSON.stringify(JSON.parse('"'+s+'"'))+')')
await writeFile(folder+'/workflow-sdk.ts',code)
