import type {Context} from 'hono'
import type {Env} from '../types'
import {renderEditorialLayout} from './layout-editorial'
import {escapeHtml as esc} from './layout'
import {renderMarkdownToHtml} from '../render/sanitize'
import {guideDocumentSchema,guideResearchSchema,guideUrl} from '../evergreen'
import {getPostUrl} from '../utils/post'
import css from '../../../public/static/guides.css?raw'
import {normalizeRole} from '../db/users'

const publishedFrom=`FROM evergreen_guides g JOIN evergreen_revisions r ON r.id=g.published_revision_id AND r.guide_id=g.id JOIN authors a ON a.id=g.author_id AND a.is_active=1 JOIN categories c ON c.slug=g.category_slug AND c.is_active=1 WHERE g.publication_status='published'`
const base=(env:Env)=>(env.PUBLIC_BASE_URL||'https://diario.dopovo.com.br').replace(/\/$/,'')
const date=(value:string)=>new Date(value).toLocaleDateString('pt-BR',{timeZone:'America/Fortaleza',day:'numeric',month:'long',year:'numeric'})
const json=(value:unknown)=>JSON.stringify(value).replace(/</g,'\\u003c')
function page(c:Context,title:string,description:string,path:string,body:string,structured?:unknown){return renderEditorialLayout({title:title+' | Diário do Povo',description,baseUrl:base(c.env as Env),siteName:'Diário do Povo',canonicalUrl:base(c.env as Env)+path,nonce:c.get('cspNonce')||'',navItems:[{label:'Guias do Diário',href:'/guias',active:true},{label:'Meu dia',href:'/meu-dia'},{label:'Últimas notícias',href:'/ultimas'}],bodyHtml:`<div class="guide-page">${c.req.path.startsWith('/admin/')?'<p class="guides-notice">Prévia editorial · ainda não publicada. <a href="/admin/guias/'+c.req.param('id')+'">Voltar à revisão</a></p>':''}${body}</div>`,extraHeadHtml:`<style>${css}</style>${structured?`<script type="application/ld+json">${json(structured)}</script>`:''}`})}
export async function handleGuidesPage(c:Context){
 const env=c.env as Env,number=Math.max(1,Math.min(10000,Number(c.req.query('page'))||1))|0
 const rows=(await env.DB.prepare(`SELECT g.slug,g.title,g.last_checked_at,r.document_json ${publishedFrom} ORDER BY g.public_updated_at DESC,g.id DESC LIMIT 25 OFFSET ?`).bind((number-1)*24).all<any>()).results
 const list=rows.slice(0,24)
 if(number>1&&!list.length)return c.notFound()
 c.header('Cache-Control','public, max-age=60, must-revalidate')
 return c.html(page(c,'Guias do Diário','Explicações para entender o que acontece e resolver dúvidas do dia a dia.','/guias'+(number>1?'?page='+number:''),`<header class="guide-hero"><p class="guides-kicker">Entender faz diferença</p><h1>Uma boa explicação.<br>Para quando você precisar.</h1><p>Guias para levar com você: conceitos, caminhos e respostas para as dúvidas que voltam ao nosso dia.</p></header><div class="guide-grid">${list.map(row=>{const doc=guideDocumentSchema.parse(JSON.parse(row.document_json));return `<a class="guide-card" href="${guideUrl(row.slug)}"><h2>${esc(doc.title)}</h2><p>${esc(doc.description)}</p><small>Conferido em ${date(row.last_checked_at)} · Abrir guia →</small></a>`}).join('')||'<p>Estamos preparando os primeiros guias. As explicações aparecerão aqui após a revisão da redação.</p>'}</div><nav class="guides-actions" aria-label="Paginação">${number>1?`<a href="/guias${number>2?'?page='+(number-1):''}">← Anterior</a>`:''}${rows.length>24?`<a href="/guias?page=${number+1}">Próxima →</a>`:''}</nav>`))
}
export async function handleGuidePage(c:Context){
 const env=c.env as Env,row=await env.DB.prepare(`SELECT g.*,r.document_json,r.research_json,a.name AS author_name,a.slug AS author_slug,c.name AS category_name ${publishedFrom} AND g.slug=?`).bind(c.req.param('slug')).first<any>()
 if(!row)return c.notFound()
 return guideResponse(c,row)
}
export async function handleGuidePreview(c:Context){
 if(!['director','editor'].includes(normalizeRole(c.get('adminUser')?.role||'')))return c.text('Acesso restrito à edição.',403)
 const row=await (c.env as Env).DB.prepare(`SELECT g.*,r.document_json,r.research_json,a.name AS author_name,a.slug AS author_slug,c.name AS category_name FROM evergreen_guides g JOIN evergreen_revisions r ON r.id=g.pending_revision_id LEFT JOIN authors a ON a.id=g.author_id LEFT JOIN categories c ON c.slug=g.category_slug WHERE g.id=?`).bind(Number(c.req.param('id'))).first<any>()
 if(!row)return c.notFound()
 row.author_name||='Autoria a escolher';row.category_name||='Editoria a escolher';row.published_at||=row.created_at;row.public_updated_at||=row.created_at;row.last_checked_at=JSON.parse(row.research_json).sources[0].checked_at
 return guideResponse(c,row,true)
}
async function guideResponse(c:Context,row:any,preview=false){
 const env=c.env as Env
 const doc=guideDocumentSchema.parse(JSON.parse(row.document_json)),research=guideResearchSchema.parse(JSON.parse(row.research_json)),headings:{id:string;text:string}[]=[]
 const content=renderMarkdownToHtml(doc.body_markdown).replace(/<h2>([\s\S]*?)<\/h2>/g,(_,text)=>{const id='secao-'+(headings.length+1);headings.push({id,text:text.replace(/<[^>]*>/g,'')});return `<h2 id="${id}">${text}</h2>`})
 const news=(await env.DB.prepare("SELECT p.title,p.slug,p.published_at,p.created_at FROM evergreen_news_links l JOIN posts p ON p.id=l.post_id WHERE l.guide_id=? AND p.status='published' AND p.seo_noindex=0 AND p.published_at<=? ORDER BY p.published_at DESC LIMIT 4").bind(row.id,new Date().toISOString()).all<any>()).results
 const canonical=base(env)+guideUrl(row.slug),structured={'@context':'https://schema.org','@type':'Article',headline:doc.title,description:doc.description,mainEntityOfPage:canonical,url:canonical,datePublished:row.published_at,dateModified:row.public_updated_at,inLanguage:'pt-BR',author:{'@type':'Person',name:row.author_name,url:base(env)+'/autor/'+encodeURIComponent(row.author_slug)},publisher:{'@type':'Organization',name:'Diário do Povo',url:base(env)},articleSection:row.category_name}
 c.header('Cache-Control',preview?'private, no-store':'public, max-age=60, must-revalidate')
 if(preview)c.header('X-Robots-Tag','noindex, nofollow')
 return c.html(page(c,doc.title,doc.description,guideUrl(row.slug),`<header class="guide-hero"><p class="guides-kicker"><a href="/guias">Guias do Diário</a> / ${esc(row.category_name)}</p><h1>${esc(doc.title)}</h1><p>${esc(doc.description)}</p><div class="guide-meta"><span>Por ${esc(row.author_name)}</span><span>Publicado em ${date(row.published_at)}</span>${row.public_updated_at!==row.published_at?`<span>Atualizado em ${date(row.public_updated_at)}</span>`:''}<span>Fontes conferidas em ${date(row.last_checked_at)}</span></div></header><section class="guide-answer" id="resposta"><strong>A resposta direta</strong><p>${esc(doc.answer)}</p></section><div class="guide-columns"><nav class="guide-toc" aria-label="Neste guia"><strong>Neste guia</strong><a href="#resposta">Resposta direta</a>${headings.map(h=>`<a href="#${h.id}">${esc(h.text)}</a>`).join('')}${doc.faq.length?'<a href="#perguntas">Perguntas frequentes</a>':''}<a href="#fontes">Fontes e conferência</a></nav><article><div class="guide-body">${content}${doc.faq.length?`<section class="guide-faq" id="perguntas"><h2>Perguntas frequentes</h2>${doc.faq.map(f=>`<details><summary>${esc(f.question)}</summary><p>${esc(f.answer)}</p></details>`).join('')}</section>`:''}</div><footer class="guide-sources" id="fontes"><h2>Fontes e conferência</h2><p>A redação revisa este guia quando as referências mudam. Última conferência: ${date(row.last_checked_at)}.</p><ul>${research.sources.map(s=>`<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a><small>Consultada em ${date(s.checked_at)}</small></li>`).join('')}</ul></footer>${news.length?`<section class="guide-news"><p class="guides-kicker">Este assunto no noticiário</p>${news.map(p=>`<a href="${esc(getPostUrl(p))}">${esc(p.title)} ↗</a>`).join('')}</section>`:''}</article></div>`,structured))
}
export async function handleGuidesSitemap(c:Context){
 const rows=(await (c.env as Env).DB.prepare(`SELECT g.slug,g.public_updated_at ${publishedFrom} ORDER BY g.id LIMIT 50000`).all<any>()).results
 c.header('Content-Type','application/xml; charset=UTF-8');c.header('Cache-Control','public, max-age=300')
 return c.body(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${rows.length?'<url><loc>https://diario.dopovo.com.br/guias</loc></url>':''}${rows.map(row=>`<url><loc>https://diario.dopovo.com.br${guideUrl(row.slug)}</loc><lastmod>${esc(row.public_updated_at)}</lastmod></url>`).join('')}</urlset>`)
}
export function renderGuideContext(guides:{slug:string;title:string}[]){return guides.length?`<aside class="guide-context" style="background:#f0f4ec;border-left:3px solid #64875d;padding:18px 22px;margin:24px 0"><strong style="font:700 11px system-ui;letter-spacing:.08em;color:#42613a">ENTENDA O CONTEXTO</strong>${guides.map(g=>`<a style="display:block;margin-top:8px;font:500 16px/1.5 system-ui;color:#1d4835" href="${guideUrl(g.slug)}">${esc(g.title)} ↗</a>`).join('')}</aside>`:''}
