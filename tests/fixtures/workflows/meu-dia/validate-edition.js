const response=$input.first().json,prepared=$('Preparar edição').first().json;
if(response.status!=='completed'||response.error||!Array.isArray(response.output))throw Error('Pesquisa da edição não concluída.');
const calls=response.output.filter(value=>value.type==='web_search_call'&&value.status==='completed');
if(!calls.length)throw Error('Pesquisa web não confirmada.');
const sources=new Set();
for(const call of calls){for(const source of call.action?.sources||[])if(typeof source.url==='string')sources.add(source.url);if(['open_page','find_in_page'].includes(call.action?.type)&&call.action.url)sources.add(call.action.url);}
const contents=response.output.filter(value=>value.type==='message').flatMap(value=>value.content||[]);
for(const part of contents)for(const citation of part.annotations||[])if(citation.type==='url_citation')sources.add(citation.url);
const raw=contents.filter(value=>value.type==='output_text').map(value=>value.text).join('\n');
const edition=JSON.parse(raw.trim().replace(/^`{3}(?:json)?\s*/i,'').replace(/\s*`{3}$/,''));
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
if(today!==prepared.date||edition.date!==today)throw Error('O dia editorial mudou. Refaça a seleção.');
if(!Array.isArray(edition.items))throw Error('Itens da edição inválidos.');
const allowed=new Set(prepared.posts.map(post=>post.id)),states=new Set(['BR','AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']),seen=new Set(),counts={};
const output=[];
const diagnostics={candidates:prepared.posts.length,proposed:edition.items.length,discarded:0};
for(const item of edition.items){
 if(!allowed.has(item.post_id)||seen.has(item.post_id)||!states.has(item.scope)||!['essential','changes','opportunities','follow'].includes(item.section)||typeof item.summary!=='string'||item.summary.trim().length<20||item.summary.length>320||!sources.has(item.source_url)||!/^https:\/\/[^\s@]+$/i.test(item.source_url))continue;
 if(item.expires_at!==null&&item.expires_at!==undefined&&(!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(item.expires_at)||!Number.isFinite(Date.parse(item.expires_at))||Date.parse(item.expires_at)<=Date.now()))continue;
 if(item.section==='opportunities'&&!item.expires_at)continue;
 const key=item.scope==='BR'?'BR:'+item.section:item.scope,limit=item.scope==='BR'?(item.section==='essential'?5:3):2;
 if((counts[key]||0)>=limit)continue;
 counts[key]=(counts[key]||0)+1;seen.add(item.post_id);
 output.push({post_id:item.post_id,section:item.section,scope:item.scope,summary:item.summary.trim(),source_url:item.source_url,expires_at:item.expires_at||null});
 if(output.length>=32)break;
}
if(!output.some(item=>item.scope==='BR'&&item.section==='essential')){throw Error('Edição não publicada: '+diagnostics.candidates+' candidatas, '+diagnostics.proposed+' propostas, '+output.length+' aceitas, mas nenhuma nacional essencial. A edição anterior foi preservada. Confira a pesquisa e a abrangência das propostas.');}
return [{json:{date:today,items:output,diagnostics:{...diagnostics,discarded:edition.items.length-output.length,national:output.filter(item=>item.scope==='BR').length,regional:output.filter(item=>item.scope!=='BR').length}}}];
