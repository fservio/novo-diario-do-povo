import {z} from 'zod'
import {marked} from 'marked'
const https=z.string().url().max(1600).refine(value=>{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password},'Use uma URL HTTPS sem credenciais')
const slug=z.string().min(3).max(150).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
export const guideBriefSchema=z.object({
 intent_key:slug,slug,title:z.string().trim().min(5).max(180),category_slug:slug,
 reader_question:z.string().trim().min(15).max(500),questions:z.array(z.string().trim().min(5).max(500)).min(1).max(12),
 scope_limits:z.array(z.string().trim().min(5).max(500)).min(1).max(12),
 source_urls:z.array(https).min(1).max(12),news_triggers:z.array(z.string().trim().min(3).max(100)).min(1).max(15),
 revision_triggers:z.array(z.string().trim().min(3).max(300)).min(1).max(12)
})
const safeMarkdown=z.string().trim().min(80).max(60000).refine(value=>!/<\/?[a-z!][^>]*>|!\[|\]\(\s*(?:javascript|data|vbscript):/i.test(value),'Use Markdown sem HTML ou imagens externas')
export const guideDocumentSchema=z.object({
 title:z.string().trim().min(5).max(180),description:z.string().trim().min(20).max(320),answer:z.string().trim().min(30).max(1000),body_markdown:safeMarkdown,
 faq:z.array(z.object({question:z.string().trim().min(8).max(200),answer:z.string().trim().min(20).max(900)})).max(8).default([])
})
export const guideResearchSchema=z.object({
 opened_urls:z.array(https).min(1).max(30),
 sources:z.array(z.object({url:https,title:z.string().trim().min(3).max(220),checked_at:z.string().datetime({offset:true})})).min(1).max(12),
 claims:z.array(z.object({id:slug,text:z.string().trim().min(15).max(800),source_url:https,locator:z.string().trim().min(5).max(500),valid_as_of:z.string().max(100).nullable().default(null)})).min(1).max(60)
}).superRefine((research,ctx)=>{
 const opened=new Set(research.opened_urls),sources=new Set(research.sources.map(source=>source.url))
 if(sources.size!==research.sources.length)ctx.addIssue({code:'custom',message:'Fonte repetida'})
 if(new Set(research.claims.map(claim=>claim.id)).size!==research.claims.length)ctx.addIssue({code:'custom',message:'Identificador de afirmação repetido'})
 if(research.sources.some(source=>!opened.has(source.url)))ctx.addIssue({code:'custom',message:'Fonte sem abertura comprovada'})
 if(research.claims.some(claim=>!sources.has(claim.source_url)))ctx.addIssue({code:'custom',message:'Afirmação sem fonte no dossiê'})
})
export type GuideBrief=z.infer<typeof guideBriefSchema>
export type GuideDocument=z.infer<typeof guideDocumentSchema>
export type GuideResearch=z.infer<typeof guideResearchSchema>
export class GuideConflict extends Error{}
export function validateGuideDossier(brief:GuideBrief,document:GuideDocument,research:GuideResearch,now=new Date()){
 const hosts=new Set(brief.source_urls.map(url=>new URL(url).hostname.replace(/^www\./,'')))
 if(research.sources.some(source=>!hosts.has(new URL(source.url).hostname.replace(/^www\./,''))))throw Error('O dossiê usa um domínio fora das fontes da pauta.')
 if(research.sources.some(source=>{const age=now.getTime()-Date.parse(source.checked_at);return age < -300000||age>7*86400000}))throw Error('As fontes precisam de conferência recente, sem data futura.')
 const allowed=new Set(research.sources.map(s=>s.url))
 marked.walkTokens(marked.lexer(document.body_markdown),token=>{if(token.type==='link'&&!allowed.has(token.href))throw Error('O texto contém um link fora das fontes do dossiê.')})
}
export const guideUrl=(slug:string)=>'/guias/'+slug
