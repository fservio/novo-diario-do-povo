const output=[];
for(const [index,item] of $input.all().entries()){
 const response=item.json;
 if(response.success!==true||!Array.isArray(response.data))throw Error('Não foi possível confirmar duplicidade antes da publicação.');
 if(response.data.length>0)continue;
 const post=$('Parse AI1').itemMatching(index).json;
 if(!post?.original_link)throw Error('Reescrita sem vínculo com a fonte.');
 output.push({json:post,pairedItem:{item:index}});
}
return output;
