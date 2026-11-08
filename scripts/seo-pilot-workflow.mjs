import { mkdirSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { searchWindow } from './seo-workflow-runtime.mjs'

export function pilotPageMetrics(responses) {
  const rows=[],seen=new Set()
  for(const response of responses){
    const status=Number(response?.statusCode??200),body=response?.body??response
    if(status<200||status>=300||body?.error||!body||typeof body!=='object')throw Error('Search Console indisponível; referência não será gravada.')
    if(body.rows!==undefined&&!Array.isArray(body.rows))throw Error('Formato de métricas inválido.')
    for(const r of body.rows||[]){
      const url=r.keys?.[0]
      if(typeof url!=='string'||!url.startsWith('https://diario.dopovo.com.br/')||['clicks','impressions','ctr','position'].some(k=>typeof r[k]!=='number'||!Number.isFinite(r[k])))throw Error('Linha inválida do Search Console.')
      if(seen.has(url))throw Error('URL repetida na paginação; referência não será gravada.')
      seen.add(url)
      rows.push({url,clicks:r.clicks,impressions:r.impressions,ctr:r.ctr,position:r.position})
    }
  }
  if(responses.length>=3&&(responses.at(-1)?.body?.rows??responses.at(-1)?.rows??[]).length>=25000)throw Error('Paginação atingiu o limite; referência incompleta.')
  return rows.filter(r=>r.clicks>=0&&r.impressions>=100&&r.ctr>=0&&r.ctr<.03&&r.position>=4&&r.position<=20).sort((a,b)=>b.impressions-a.impressions||a.url.localeCompare(b.url)).slice(0,25000)
}

export function followupMetric(response, member) {
  const status=Number(response?.statusCode??200),body=response?.body??response
  if(status<200||status>=300||body?.error||!body||typeof body!=='object'||(body.rows!==undefined&&!Array.isArray(body.rows)))throw Error('Falha de coleta; acompanhamento não será gravado como zero.')
  const rows=body.rows??[]
  if(rows.length>1)throw Error('Esperava uma agregação por URL.')
  const metric=rows[0]??{clicks:0,impressions:0,ctr:0,position:0}
  if(['clicks','impressions','ctr','position'].some(k=>typeof metric[k]!=='number'||!Number.isFinite(metric[k])||metric[k]<0)||metric.ctr>1)throw Error('Métrica de acompanhamento inválida.')
  return {url:member.url,clicks:metric.clicks,impressions:metric.impressions,ctr:metric.ctr,position:metric.position}
}

export function collectFollowupPayloads(items) {
  const groups=new Map()
  for(const item of items){const key=item.member.pilot_id+':'+item.member.window_days;const group=groups.get(key)??{pilot_id:item.member.pilot_id,window_days:item.member.window_days,start_date:item.member.start_date,end_date:item.member.end_date,expected:item.member.expected,pages:[]};if(group.pages.some(p=>p.url===item.metric.url))throw Error('URL repetida no acompanhamento.');group.pages.push(item.metric);groups.set(key,group)}
  return [...groups.values()].map(g=>{if(g.pages.length!==g.expected)throw Error('Coleta parcial; acompanhamento não será gravado.');const {expected,...result}=g;return result})
}

export function buildPilotNodes(options={}) {
  const root='https://diario.dopovo.com.br',gscId=options.gscCredentialId||null,cmsId=options.cmsCredentialId||'h4xlwytBvEYpPQUE',nodes=[]
  const add=(name,type,typeVersion,parameters={},config={})=>{const n={name,type,typeVersion,parameters,...config,position:[nodes.length*240,0]};nodes.push(n);return n}
  const js=(name,body)=>add(name,'n8n-nodes-base.code',2,{mode:'runOnceForAllItems',jsCode:body})
  const cms={authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth'},cmsAuth={httpHeaderAuth:{id:cmsId,name:'Header Auth account'}}
  const google={authentication:gscId?'genericCredentialType':'none',...(gscId?{genericAuthType:'oAuth2Api'}:{})},gscAuth=gscId?{oAuth2Api:{id:gscId,name:'Diário Search Console readonly'}}:undefined
  const http=(name,parameters,credentials)=>add(name,'n8n-nodes-base.httpRequest',4.4,{...parameters,options:{timeout:45000,response:{response:{responseFormat:'json',fullResponse:true,neverError:true}},...parameters.options}},{...(credentials?{credentials}:{})})
  const endpoint='https://www.googleapis.com/webmasters/v3/sites/'+encodeURIComponent(root+'/')+'/searchAnalytics/query'
  add('Preparar piloto uma vez','n8n-nodes-base.manualTrigger',1)
  js('Referência do piloto',searchWindow.toString()+`\nif(!${Boolean(gscId)})throw Error('Search Console não configurado. Nenhum piloto será criado sem dados reais.');const w=searchWindow(new Date());return [{json:{seed:'diario-seo-pilot-v1',start_date:w.startDate,end_date:w.endDate,request:{startDate:w.startDate,endDate:w.endDate,type:'web',dataState:'final',dimensions:['page'],aggregationType:'byPage',rowLimit:25000,startRow:0,dimensionFilterGroups:[{groupType:'and',filters:[{dimension:'country',operator:'equals',expression:'bra'}]}]}}}];`)
  http('Métricas reais para seleção',{...google,method:'POST',url:endpoint,sendBody:true,specifyBody:'json',jsonBody:'={{ JSON.stringify($json.request) }}',options:{timeout:60000,response:{response:{responseFormat:'json',fullResponse:true,neverError:true}},pagination:{pagination:{paginationMode:'updateAParameterInEachRequest',parameters:{parameters:[{type:'body',name:'startRow',value:'={{ $pageCount * 25000 }}'}]},paginationCompleteWhen:'other',completeExpression:'={{ $response.statusCode !== 200 || ($response.body.rows ?? []).length < 25000 }}',limitPagesFetched:true,maxRequests:3}}}},gscAuth)
  js('Validar referência completa',pilotPageMetrics.toString()+`\nconst reference=$('Referência do piloto').all()[0].json;return [{json:{seed:reference.seed,start_date:reference.start_date,end_date:reference.end_date,pages:pilotPageMetrics($input.all().map(i=>i.json))}}];`)
  http('Registrar pares no CMS',{...cms,method:'POST',url:root+'/api/n8n/seo/pilot',sendBody:true,specifyBody:'json',jsonBody:'={{ JSON.stringify($json) }}'},cmsAuth)
  js('Confirmar piloto',`return $input.all().map(item=>{const r=item.json.body??item.json;if(Number(item.json.statusCode??200)!==200||r.success!==true)throw Error('CMS não confirmou os pares do piloto.');return {json:{status:'pilot_ready',...r.data}};});`)
  add('Verificar acompanhamentos','n8n-nodes-base.scheduleTrigger',1.3,{rule:{interval:[{field:'hours',hoursInterval:1,triggerAtMinute:0}]}})
  js('Janela diária Fortaleza',`const hour=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Fortaleza',hour:'2-digit',hourCycle:'h23'}).format(new Date());if(hour!=='09')return [];if(!${Boolean(gscId)})return [{json:{status:'search_console_not_configured',collect:false}}];return [{json:{collect:true}}];`)
  add('Google disponível?','n8n-nodes-base.if',2.3,{conditions:{options:{caseSensitive:true,leftValue:'',typeValidation:'strict'},conditions:[{leftValue:'={{ $json.collect }}',rightValue:true,operator:{type:'boolean',operation:'true'}}],combinator:'and'}})
  http('Janelas pendentes no CMS',{...cms,url:root+'/api/n8n/seo/pilot/due'},cmsAuth)
  js('Preparar URLs das janelas',`const response=$input.all()[0].json;const body=response.body??response;if(Number(response.statusCode??200)!==200||body.success!==true||!Array.isArray(body.data))throw Error('CMS não confirmou as janelas pendentes.');const output=[];for(const due of body.data){if(![14,28].includes(due.window_days)||!Array.isArray(due.members)||due.members.length>60)throw Error('Janela inválida.');for(const member of due.members)output.push({json:{...member,pilot_id:due.pilot_id,window_days:due.window_days,start_date:due.start_date,end_date:due.end_date,expected:due.members.length,request:{startDate:due.start_date,endDate:due.end_date,type:'web',dataState:'final',dimensions:[],aggregationType:'byPage',rowLimit:1,dimensionFilterGroups:[{groupType:'and',filters:[{dimension:'page',operator:'equals',expression:member.url},{dimension:'country',operator:'equals',expression:'bra'}]}]}},pairedItem:{item:0}});}return output;`)
  http('Medir cada URL do piloto',{...google,method:'POST',url:endpoint,sendBody:true,specifyBody:'json',jsonBody:'={{ JSON.stringify($json.request) }}',options:{timeout:45000,response:{response:{responseFormat:'json',fullResponse:true,neverError:true}},batching:{batch:{batchSize:1,batchInterval:100}}}},gscAuth)
  js('Consolidar acompanhamento',followupMetric.toString()+'\n'+collectFollowupPayloads.toString()+`\nconst results=$input.all().map((item,index)=>{const member=$('Preparar URLs das janelas').itemMatching(index).json;return {member,metric:followupMetric(item.json,member)}});return collectFollowupPayloads(results).map(p=>({json:p}));`)
  http('Gravar acompanhamento no CMS',{...cms,method:'POST',url:'={{ "'+root+'/api/n8n/seo/pilot/" + $json.pilot_id + "/followup" }}',sendBody:true,specifyBody:'json',jsonBody:'={{ JSON.stringify({window_days:$json.window_days,start_date:$json.start_date,end_date:$json.end_date,pages:$json.pages}) }}'},cmsAuth)
  js('Confirmar acompanhamento',`return $input.all().map(item=>{const r=item.json.body??item.json;if(Number(item.json.statusCode??200)!==200||r.success!==true)throw Error('CMS não confirmou o acompanhamento.');return {json:{status:'followup_saved',data:r.data}};});`)
  return nodes
}

export function buildPilotWorkflow(options={}) {
  const nodes=buildPilotNodes(options),sample={collect:true,pilot_id:1,window_days:14,start_date:'2026-11-07',end_date:'2026-11-20',pages:[],request:{},expected:1,url:'https://diario.dopovo.com.br/2026/11/06/piloto/'}
  const value=v=>typeof v==='string'&&v.startsWith('=')?'expr('+JSON.stringify(v.slice(1))+')':Array.isArray(v)?'['+v.map(value).join(',')+']':v&&typeof v==='object'?'{'+Object.entries(v).map(([k,x])=>JSON.stringify(k)+':'+value(x)).join(',')+'}':JSON.stringify(v)
  const decl=nodes.map((n,i)=>{const c={...n};delete c.type;delete c.typeVersion;const builder=n.type.includes('Trigger')?'trigger':n.type==='n8n-nodes-base.if'?'ifElse':'node';return 'const s'+i+'='+builder+'({type:'+JSON.stringify(n.type)+',version:'+n.typeVersion+',config:'+value(c)+',output:'+JSON.stringify([sample])+'});'}).join('\n')
  return "import {workflow,node,trigger,ifElse,expr} from '@n8n/workflow-sdk';\n"+decl+"\nexport default workflow('diario-seo-pilot-v1','SEO — piloto e acompanhamento').add(s0).to(s1).to(s2).to(s3).to(s4).to(s5).add(s6).to(s7).to(s8.onTrue(s9.to(s10).to(s11).to(s12).to(s13).to(s14)));\n"
}

if(import.meta.url===pathToFileURL(process.argv[1]||'').href){const options={cmsCredentialId:process.env.SEO_CMS_CREDENTIAL_ID||undefined,gscCredentialId:process.env.SEO_GSC_CREDENTIAL_ID||null};const source=buildPilotWorkflow(options);if(process.argv.includes('--print'))process.stdout.write(source);else{mkdirSync('artifacts/seo-automation',{recursive:true});writeFileSync('artifacts/seo-automation/pilot-workflow-sdk.ts',source);writeFileSync('artifacts/seo-automation/pilot-nodes.json',JSON.stringify(buildPilotNodes(options),null,2)+'\n')}}
