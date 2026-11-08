const responses=$input.all(),sources=$('Prepare RSS').all();
if(responses.length!==sources.length)throw Error('Quantidade inesperada de respostas da consulta de duplicidade.');
for(const item of responses)if(item.json.success!==true||!Array.isArray(item.json.data))throw Error('A consulta de duplicidade falhou. Nenhuma notícia deste lote será publicada.');
const output=[];
for(let index=0;index<responses.length&&output.length<10;index++){
 if(responses[index].json.data.length===0){
  const source=$('Prepare RSS').itemMatching(index);
  if(!source?.json?.link)throw Error('Vínculo com o RSS não encontrado.');
  output.push({json:source.json,pairedItem:{item:index}});
 }
}
console.log('RSS: '+sources.length+' candidatas; '+output.length+' inéditas selecionadas (máximo 10).');
return output;
