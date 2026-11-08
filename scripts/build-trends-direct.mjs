import {readFile,writeFile} from 'node:fs/promises'
import {collectionRequests,prepareDirectAnalysis,rssSourceUrls,directValidatorCode} from './trends-direct-runtime.mjs'

export function buildDirectWorkflow(baseline) {
 const original=structuredClone(baseline),nodes=original.nodes;
 const find=name=>nodes.find(n=>n.name===name);
 // get_workflow_details omits credential references; these IDs were verified through the read-only n8n export.
 for(const n of nodes){
  if(['Research Topic','OpenAI Chat Model1'].includes(n.name))n.credentials={openAiApi:{id:'nLuuEwm3AOMjFhwE',name:'OpenAi account'}};
  if(['Check Duplicate1','Recheck Before Publish','Create Post1'].includes(n.name))n.credentials={httpHeaderAuth:{id:'h4xlwytBvEYpPQUE',name:'Header Auth account'}};
 }
 const model=find('OpenAI Chat Model1');
 if(!model.parameters.responsesApiEnabled&&Object.keys(model.parameters.builtInTools||{}).length===0)delete model.parameters.builtInTools;
 const parser=find('Parse AI1');
 if(!parser.parameters.jsCode.includes("$('Validate Research').itemMatching(index).json.research"))throw Error('Parser alterado desde a auditoria.');
 parser.parameters.jsCode=parser.parameters.jsCode.replace("$('Validate Research').itemMatching(index).json.research", "$('Apuração aprovada').itemMatching(index).json.research")
  .replace('!research?.verified_search||','!(research?.verified_search||(research?.verified_collection&&research.collection_receipts?.length))||');
 const add=(name,type,parameters,extra={})=>{nodes.push({name,type,typeVersion:type==='n8n-nodes-base.if'?2.3:2,parameters,...extra});};
 const code=(name,jsCode)=>add(name,'n8n-nodes-base.code',{mode:'runOnceForAllItems',jsCode});
 code('Preparar coleta direta',rssSourceUrls.toString()+'\n'+collectionRequests.toString()+'\nreturn collectionRequests($input.all());');
 add('Coletar links do RSS','n8n-nodes-base.httpRequest',{method:'POST',url:'http://news-extractor:8080/extract',sendBody:true,specifyBody:'json',jsonBody:'={{ JSON.stringify($json.collection_request) }}',options:{batching:{batch:{batchSize:1,batchInterval:250}},timeout:180000,response:{response:{responseFormat:'json',neverError:true}}}},{typeVersion:4.4,onError:'continueRegularOutput'});
 code('Preparar apuração direta',prepareDirectAnalysis.toString()+"\nreturn prepareDirectAnalysis($input.all(),index=>$('Preparar coleta direta').itemMatching(index).json);");
 const gate=(name,field)=>add(name,'n8n-nodes-base.if',{conditions:{options:{caseSensitive:true,leftValue:'',typeValidation:'strict',version:2},conditions:[{leftValue:'={{ $json.'+field+' }}',rightValue:true,operator:{type:'boolean',operation:'true',singleValue:true}}],combinator:'and'}});
 gate('Há conteúdo coletado?','direct_available');
 const research=find('Research Topic');
 nodes.push({...structuredClone(research),id:undefined,name:'Analisar fontes coletadas',parameters:{...structuredClone(research.parameters),jsonBody:'={{ JSON.stringify($json.direct_request) }}'},onError:'continueRegularOutput'});
 code('Validar apuração direta',directValidatorCode(find('Validate Research').parameters.jsCode));
 gate('Apuração direta aprovada?','direct_ok');
 code('Apuração aprovada','return $input.all().map((item,index)=>({json:item.json,pairedItem:{item:index}}));');
 add('Coletar uma pauta por vez','n8n-nodes-base.splitInBatches',{batchSize:1,options:{}},{typeVersion:3});
 const aliases=new Map(nodes.map((n,i)=>[n.name,'n'+i]));
 function emit(value,key=''){
  if(typeof value==='string')return key!=='jsCode'&&value.includes('{{')?'expr('+JSON.stringify(value.startsWith('=')?value.slice(1):value)+')':JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(v=>emit(v)).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.entries(value).filter(([,v])=>v!==undefined).map(([k,v])=>JSON.stringify(k)+':'+emit(v,k)).join(',')+'}';
  return JSON.stringify(value);
 }
 const declarations=nodes.filter(n=>n.type.includes('lmChatOpenAi')).concat(nodes.filter(n=>!n.type.includes('lmChatOpenAi'))).map(n=>{
  const factory=n.type.includes('scheduleTrigger')?'trigger':n.type.includes('lmChatOpenAi')?'languageModel':n.type==='n8n-nodes-base.if'?'ifElse':n.type==='n8n-nodes-base.splitInBatches'?'splitInBatches':'node';
  const config={name:n.name,parameters:n.parameters,...(n.credentials?{credentials:n.credentials}:{}),...(n.onError?{onError:n.onError}:{})};
  let encoded=emit(config);
  if(n.type==='@n8n/n8n-nodes-langchain.agent')encoded=encoded.slice(0,-1)+',subnodes:{model:'+aliases.get('OpenAI Chat Model1')+'}}';
  const sample={link:'https://trends.google.com/trends/explore?q=example',collection_request:{urls:['https://example.com/news']},direct_available:true,direct_ok:true,original_link:'https://trends.google.com/trends/explore?q=example',research:{temporal_reference:{editorial_datetime:'2026-11-06T12:00:00-03:00',editorial_timezone:'America/Fortaleza'}}};
  return 'const '+aliases.get(n.name)+'='+factory+'({type:'+JSON.stringify(n.type)+',version:'+n.typeVersion+',config:'+encoded+',output:['+JSON.stringify(sample)+']});';
 });
 const chain=(...names)=>names.map(name=>aliases.get(name)).reduceRight((tail,name)=>tail?name+'.to('+tail+')':name,'');
 const finish=chain('Apuração aprovada','AI Journalist1','Parse AI1','Recheck Before Publish','Confirm Still New','Create Post1','Confirm Published');
 const fallback=aliases.get('Research Topic')+'.to('+aliases.get('Validate Research')+'.to('+finish+'))';
 const direct=aliases.get('Analisar fontes coletadas')+'.to('+aliases.get('Validar apuração direta')+'.to('+aliases.get('Apuração direta aprovada?')+'.onTrue('+finish+').onFalse('+fallback+')))';
 const flow=chain('Schedule Trigger','Config1','RSS Read1','Prepare RSS','Check Duplicate1','Select All New','Prepare Research Request','Preparar coleta direta');
 const gatePath=aliases.get('Há conteúdo coletado?')+'.onTrue('+direct+').onFalse('+fallback+')';
 const loop=aliases.get('Coletar uma pauta por vez');
 const collection=loop+'.onEachBatch('+aliases.get('Coletar links do RSS')+'.to(nextBatch('+loop+'))).onDone('+aliases.get('Preparar apuração direta')+'.to('+gatePath+'))';
 const codeText="import {workflow,node,trigger,ifElse,languageModel,expr,splitInBatches,nextBatch} from '@n8n/workflow-sdk';\n"+declarations.join('\n')+'\nexport default workflow('+JSON.stringify(original.id)+','+JSON.stringify(original.name)+').add('+flow+'.to('+collection+'));';
 return {code:codeText,nodes,changedOriginalNodes:['Parse AI1','OpenAI Chat Model1'],newNodes:nodes.filter(n=>!baseline.nodes.some(b=>b.name===n.name)).map(n=>n.name)};
}

if(process.argv[1]?.replaceAll('\\','/').endsWith('/build-trends-direct.mjs')){
 const baseline=JSON.parse(await readFile('artifacts/trends-direct/baseline-redacted.json','utf8'));
 const result=buildDirectWorkflow(baseline);
 await writeFile('artifacts/trends-direct/workflow-sdk.template.ts',result.code);
 await writeFile('artifacts/trends-direct/prepared-nodes.json',JSON.stringify(result.nodes,null,2));
 console.log(JSON.stringify({nodes:result.nodes.length,changedOriginalNodes:result.changedOriginalNodes,newNodes:result.newNodes}));
}
