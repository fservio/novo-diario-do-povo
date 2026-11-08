import {readFile,writeFile} from 'node:fs/promises'
import {buildDirectWorkflow} from './build-trends-direct.mjs'
const base=JSON.parse(await readFile('artifacts/trends-direct/baseline-redacted.json','utf8'));
const built=buildDirectWorkflow(base),topics=JSON.parse(await readFile('artifacts/trends-direct/sample-rss.json','utf8'));
const topic=topics.find(t=>t.title===(process.argv[2]||'predio desaba no bras'));if(!topic)throw Error('Pauta de teste ausente.');
const writing=process.argv.includes('--with-writing');
let code=built.code.slice(0,built.code.indexOf('\nexport default'));
const alias=name=>'n'+built.nodes.findIndex(n=>n.name===name);
code+='\nconst fixture=node({type:"n8n-nodes-base.code",version:2,config:{name:"Select All New",parameters:{mode:"runOnceForAllItems",jsCode:'+JSON.stringify('return [{json:'+JSON.stringify(topic)+'}];')+'}},output:[{}]});';
const stop=writing?"return $input.all().map((item,index)=>({json:{title:item.json.title,original_link:item.json.original_link,content_words:String(item.json.content||'').replace(/<[^>]*>/g,' ').split(/\\s+/).filter(Boolean).length,publication_status:item.json.status},pairedItem:{item:index}}));":"return $input.all().map((item,index)=>({json:{direct_ok:item.json.direct_ok,proof:item.json.research,source_urls:item.json.source_urls,fallback_reason:item.json.direct_fallback_reason},pairedItem:{item:index}}));";
code+='\nconst preview=node({type:"n8n-nodes-base.code",version:2,config:{name:"Resultado sem publicação",parameters:{mode:"runOnceForAllItems",jsCode:'+JSON.stringify(stop)+'}},output:[{}]});';
const path=['Prepare Research Request','Preparar coleta direta','Coletar links do RSS','Preparar apuração direta','Analisar fontes coletadas','Validar apuração direta',...(writing?['Apuração aprovada','AI Journalist1','Parse AI1']:[])];
code+='\nexport default workflow("trends-direct-preflight","Teste — coleta direta Trends sem publicação").add('+alias('Schedule Trigger')+').to('+alias('Config1')+').to(fixture).to('+path.map(alias).join(').to(')+').to(preview);';
// Drop unused declarations, including every publication and paid-search node.
const used=new Set([...path,'Schedule Trigger','Config1',...(writing?['OpenAI Chat Model1']:[])].map(alias));
code=code.split('\n').filter(line=>!/^const n\d+=/.test(line)||used.has(line.match(/^const (n\d+)=/)[1])).join('\n');
await writeFile('artifacts/trends-direct/preflight-sdk.ts',code);
console.log('Preflight: collection and one tool-free analysis; no CMS writes or web-search fallback.');
