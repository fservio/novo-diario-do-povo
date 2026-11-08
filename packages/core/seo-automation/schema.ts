import { z } from 'zod'

export const seoMetadataShape = {
 seo_title: z.string().trim().max(200),
 seo_description: z.string().trim().max(500),
 seo_primary_keyword: z.string().trim().max(120),
 seo_secondary_keywords: z.array(z.string().trim().min(1).max(120)).max(5).refine(
  values => new Set(values.map(v=>v.toLocaleLowerCase('pt-BR'))).size===values.length,
  'Palavras-chave secundárias repetidas.'),
}
export const seoMetadataSchema=z.object(seoMetadataShape).strict()
export const seoMetadataPartialSchema=seoMetadataSchema.partial()
export type SeoMetadata=z.infer<typeof seoMetadataSchema>
export class SeoAutomationError extends Error {
 constructor(public status:number,public code:string,message=code){super(message)}
}
export function readSeoMetadata(post:any):SeoMetadata {
 let secondary=post?.seo_secondary_keywords
 if(typeof secondary==='string'){try{secondary=JSON.parse(secondary)}catch{secondary=[]}}
 return {seo_title:post?.seo_title||'',seo_description:post?.seo_description||'',seo_primary_keyword:post?.seo_primary_keyword||'',seo_secondary_keywords:Array.isArray(secondary)?secondary:[]}
}
export function mergeSeoMetadata(post:any,patch:any):SeoMetadata {
 return seoMetadataSchema.parse({...readSeoMetadata(post),...seoMetadataPartialSchema.parse(patch)})
}
export function seoPlainText(html:string):string {
 return html.replace(/<(script|style|aside|nav)\b[^>]*>[\s\S]*?<\/\1>/gi,' ')
  .replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<')
  .replace(/&gt;/gi,'>').replace(/&quot;/gi,'"').replace(/&#(?:39|x27);/gi,"'")
  .replace(/&#(x[0-9a-f]+|\d+);/gi,(_,v)=>{const n=v[0].toLowerCase()==='x'?parseInt(v.slice(1),16):+v;return n>0&&n<=0x10ffff?String.fromCodePoint(n):' '})
  .replace(/\s+/g,' ').trim()
}
