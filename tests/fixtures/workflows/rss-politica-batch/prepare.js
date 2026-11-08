const seen=new Set(),output=[];
for(const [index,item] of $input.all().entries()){
 const link=String(item.json.link??'').trim(),title=String(item.json.title??'').trim();
 const source_content=[item.json['content:encoded'],item.json.content,item.json.contentSnippet].find(value=>typeof value==='string'&&value.trim())?.trim()||'';
 if(!/^https?:\/\//i.test(link)||!title||!source_content||seen.has(link))continue;
 seen.add(link);output.push({json:{...item.json,link,title,source_content},pairedItem:{item:index}});
}
return output;
