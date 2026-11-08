return $input.all().map((item,index)=>{
 const response=item.json,source=$('Confirm Still New').itemMatching(index).json;
 if(response.success!==true||!response.data?.id||response.data.status!=='published')throw Error('A API não confirmou a publicação de '+source.original_link);
 if(response.data.original_link&&response.data.original_link!==source.original_link)throw Error('A API retornou uma publicação vinculada a outra fonte.');
 return {json:{success:true,post_id:response.data.id,title:response.data.title||source.title,original_link:source.original_link,status:'published'},pairedItem:{item:index}};
});
