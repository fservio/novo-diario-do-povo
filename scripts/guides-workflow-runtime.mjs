export function prepareWriting(items,config){
 return items.map((item,index)=>{
  const {job}=item.json
  if(!Number.isSafeInteger(job?.id)||!job.brief)throw Error('Pauta ou reserva inválida.')
  const {source_urls,...brief}=job.brief
  const prompt=[
   'Redija um rascunho para os Guias do Diário em português do Brasil, usando seu conhecimento e a pauta abaixo, sem pesquisa externa.',
   'Responda à dúvida principal, organize as perguntas secundárias em seções e respeite os limites da pauta. Use exemplos hipotéticos quando ajudarem.',
   'Não invente fontes, links, números ou citações. Explique conceitos e práticas gerais. Em temas legais, de saúde ou financeiros, evite afirmar regras vigentes, prazos e valores específicos sem verificação. Indique o que depende do contrato ou do caso concreto. Entregue as partes que puder desenvolver, mesmo que algum ponto exija conferência editorial.',
   'Produza somente JSON com title (5 a 180 caracteres), description (20 a 320), answer (30 a 1000), body_markdown (80 a 60000, seções ##, sem HTML, links ou imagens) e faq (0 a 8 objetos com question de 8 a 200 caracteres e answer de 20 a 900).',
   'PAUTA: '+JSON.stringify(brief),
   'DOCUMENTO ANTERIOR, se houver, para contexto: '+(job.existing_document||'nenhum')
  ].join('\n')
  return {json:{
   guide_id:job.id,version:job.version,lease_token:job.lease_token,
   research:{opened_urls:[],sources:[],claims:[]},
   writing_request:{model:config.MODEL,input:prompt,max_output_tokens:16000}
  },pairedItem:{item:index}}
 })
}
export function validateWriting(items,source){
 return items.map((item,index)=>{
  const prior=source.itemMatching(index).json,base={guide_id:prior.guide_id,version:prior.version,lease_token:prior.lease_token}
  try{
   const response=item.json;if(response.error||response.status!=='completed')throw Error('A redação não concluiu. Confira a execução do serviço de IA.')
   const text=(response.output||[]).filter(o=>o.type==='message').flatMap(o=>o.content||[]).filter(c=>c.type==='output_text').map(c=>c.text).join('\n'),doc=JSON.parse(text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''))
   if(doc.status==='blocked')throw Error(doc.reason||'A redação não produziu um rascunho.')
   const bounds={title:[5,180],description:[20,320],answer:[30,1000],body_markdown:[80,60000]}
   for(const [key,[min,max]] of Object.entries(bounds))if(typeof doc[key]!=='string'||doc[key].trim().length<min||doc[key].length>max)throw Error('Campo inválido na redação: '+key)
   if(/<\/?[a-z!][^>]*>|!\[|\]\(\s*(?:javascript|data|vbscript):/i.test(doc.body_markdown))throw Error('O texto contém HTML, imagem ou link não permitido.')
   const urls=new Set(prior.research.sources.map(s=>s.url));for(const m of doc.body_markdown.matchAll(/\]\((https?:\/\/[^\s)]+)\)/g))if(!urls.has(m[1]))throw Error('A redação acrescentou um link fora do dossiê.')
   const faq=doc.faq||[];if(!Array.isArray(faq)||faq.length>8||faq.some(f=>typeof f.question!=='string'||f.question.length<8||f.question.length>200||typeof f.answer!=='string'||f.answer.length<20||f.answer.length>900))throw Error('Perguntas frequentes inválidas.')
   return {json:{...base,operation:'draft',document:{title:doc.title,description:doc.description,answer:doc.answer,body_markdown:doc.body_markdown,faq},research:prior.research},pairedItem:{item:index}}
  }catch(e){return {json:{...base,operation:'blocked',reason:String(e.message||e).slice(0,600)},pairedItem:{item:index}}}
 })
}
