export function planExtractorCommand(job){
 if(!/^[a-f0-9]{32}$/.test(job?.id||'')||!/^[a-f0-9]{48}$/.test(job?.lease_token||''))throw Error('Reserva do CMS inválida.')
 const p=job.payload,base='http://news-extractor:8080';let path,method='POST',body={};
 if(job.kind==='rss'||job.kind==='article'){
  if(typeof p?.url!=='string'||!p.url.startsWith('https://')||p.url.length>3000)throw Error('URL de origem inválida.')
  if(job.kind==='rss'){if(!['articles','trends'].includes(p.mode))throw Error('Formato inválido.');path='/feeds';body={url:p.url,name:p.name,mode:p.mode}}
  else {path='/articles';body={url:p.url}}
 }else if(job.kind==='sync'||job.kind==='inspect'||job.kind==='remove'){
  if(!/^[a-z0-9-]{1,64}$/.test(p?.source_id||''))throw Error('Fonte inválida.')
  if(job.kind==='remove'&&(p.source_id==='articles'||p.confirm_remove!=='yes'))throw Error('Exclusão não confirmada ou fonte protegida.')
  path='/feeds/'+p.source_id+(job.kind==='sync'?'/sync':job.kind==='remove'?'/remove':'/status');if(job.kind==='inspect')method='GET'
 }else throw Error('Comando desconhecido.')
 return {...job,extractor_url:base+path,extractor_method:method,extractor_body:body};
}
export function extractorAcknowledgment(response,job){
 return {id:job.id,lease_token:job.lease_token,success:response?.success===true,...(response?.success===true?{result:response}:{})};
}
