const items=$input.all(),sources=$('Select Up To 10 New').all(),config=$('Config1').first().json;
if(items.length!==sources.length||items.length>10)throw Error('Quantidade de reescritas diferente das notícias selecionadas.');
const escape=value=>String(value).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
return items.map((item,index)=>{
 const rss=$('Select Up To 10 New').itemMatching(index).json,raw=item.json.output;
 if(!rss?.link)throw Error('Notícia sem vínculo com o item original do RSS.');
 const parsed=typeof raw==='string'?JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'')):raw;
 if(!parsed||Array.isArray(parsed)||typeof parsed!=='object')throw Error('Resposta da IA não é um objeto JSON para '+rss.link);
 for(const field of ['title','hat','content','excerpt','tags'])if(typeof parsed[field]!=='string'||!parsed[field].trim())throw Error('Resposta da IA inválida: '+field+' em '+rss.link);
 let content=parsed.content.replace(/\\[nr]/g,'').replace(/\r?\n/g,'').replace(/<\/?n>/gi,'').replace(/>\s+</g,'><').trim();
 if(!/<p[\s>]/i.test(content)||!content.replace(/<[^>]*>/g,'').trim())throw Error('Conteúdo HTML vazio ou inválido.');
 if(/<(?:script|iframe|object|embed)\b|\bon\w+\s*=/i.test(content))throw Error('Conteúdo HTML contém elementos não permitidos.');
 if(parsed.title.trim().length>500||content.length>1000000)throw Error('Conteúdo excede os limites da API.');
 content=content.replace(/<p>\s*Fonte:[\s\S]*?<\/p>\s*$/i,'')+'<p>Fonte: <a href="'+escape(rss.link)+'" target="_blank" rel="noopener noreferrer">O Globo</a></p>';
 return {json:{title:parsed.title.trim(),hat:parsed.hat.trim().toUpperCase().slice(0,60),content,excerpt:parsed.excerpt.trim().slice(0,160),original_link:rss.link,category_id:Number(config.DEFAULT_CATEGORY_ID),author_id:Number(config.DEFAULT_AUTHOR_ID),status:'published'},pairedItem:{item:index}};
});
