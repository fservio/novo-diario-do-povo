export function prepareInputs(items){
 return items.map((item,index)=>{
  const row=item.json,tipo=String(row.tipo||'').trim().toLowerCase(),url=String(row.url||'').trim();
  const valid=['rss','artigo'].includes(tipo)&&/^https:\/\/[^\s]+$/.test(url)&&url.length<=3000;
  return {json:{id:row.id,tipo,url,nome:String(row.nome||'').trim(),valid,error:valid?'':'Informe tipo rss ou artigo e uma URL HTTPS válida.'},pairedItem:{item:index}};
 });
}
export function inputResults(items,getSource){
 return items.map((item,index)=>{
  const source=getSource(index),body=item.json.body||item.json;
  const success=source.valid&&body.success===true&&/^\/feeds\/[a-z0-9-]+\.xml$/.test(body.rss_path||'');
  return {json:{id:source.id,processar:false,situacao:success?'cadastrado':'erro',rss_gerado:success?'http://news-extractor:8080'+body.rss_path:'',ultima_sincronizacao:new Date().toISOString(),erro:success?'':String(source.error||body.reason||'Não foi possível registrar a entrada.').slice(0,500)},pairedItem:{item:index}};
 });
}
