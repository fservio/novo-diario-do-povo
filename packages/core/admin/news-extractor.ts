import type {Context,Next} from 'hono'
import type {Env} from '../types'
import {normalizeRole} from '../db/users'
import {renderAdminLayout,renderCsrfInput,escapeHtml as esc} from './ui'
import {EXTRACTOR_STATUS_KEY,extractorSourceId,queueExtractorCommand,retryExtractorCommand,type ExtractorSnapshot,type ExtractorCommand} from '../news-extractor'
import css from '../../../public/static/admin-news-extractor.css?raw'

const allowed=(c:Context)=>['director','editor'].includes(normalizeRole(c.get('adminUser')?.role||''))
export async function attachExtractorNavigation(c:Context,next:Next){
 await next()
 if(!allowed(c)||c.res.status!==200||!c.res.headers.get('Content-Type')?.includes('text/html'))return
 let html=await c.res.text(),changed=false
 if(!html.includes('href="/admin/news-extractor"')){
  const marker=/(<a\b[^>]*href="\/admin\/redacao-ia"[^>]*>[\s\S]*?<\/a>)/
  if(marker.test(html)){html=html.replace(marker,'$1<a class="nav-item" href="/admin/news-extractor"><span class="admin-icon" aria-hidden="true">↳</span>NewsExtractor</a>');changed=true}
 }
 if(c.req.path==='/admin/integrations'&&!html.includes('Gerenciar coleta de fontes')){html=html.replace('</main>','<section class="card"><h3>NewsExtractor</h3><p>Cadastre RSS e acompanhe a coleta de fontes.</p><a class="btn" href="/admin/news-extractor">Gerenciar coleta de fontes</a></section></main>');changed=true}
 if(changed){const headers=new Headers(c.res.headers);headers.delete('Content-Length');c.res=new Response(html,{status:200,headers})}
 else {c.res=new Response(html,{status:200,headers:c.res.headers})}
}
const date=(value:string|number|null)=>value?new Date(typeof value==='number'?value*1000:value).toLocaleString('pt-BR',{timeZone:'America/Fortaleza',dateStyle:'short',timeStyle:'short'}):'Ainda não informado'
const states:Record<string,string>={queued:'Na fila',processing:'Em processamento',completed:'Confirmado pelo extrator',failed:'Falhou',ready:'Texto disponível',pending:'Aguardando coleta',review:'Revisão necessária',expired:'Fora da janela'}
const notice=(text:string,kind='info')=>`<p class="collector-notice collector-notice--${kind}" role="status">${esc(text)}</p>`
const safeLink=(value:string)=>value.startsWith('https://')?esc(value):'#'
export function renderExtractorWorkspace(data:{snapshot:ExtractorSnapshot|null;commands:ExtractorCommand[];csrf:string;source?:string;details?:any;message?:string;error?:string}){
 const {snapshot,commands,csrf,source,details}=data,feeds=snapshot?.feeds||[],totals=feeds.reduce((sum,f)=>({ready:sum.ready+f.ready,pending:sum.pending+f.pending,review:sum.review+f.review}),{ready:0,pending:0,review:0})
 const online=!!snapshot&&Date.now()-Date.parse(snapshot.checked_at)<15*60000,token=renderCsrfInput(csrf)
 const removal=(id:string)=>`<details class="collector-remove"><summary>Excluir fonte</summary><p>A fonte sairá da coleta e do RSS agregado. As matérias já publicadas serão preservadas.</p><form method="post" action="/admin/news-extractor/commands">${token}<input type="hidden" name="kind" value="remove"><input type="hidden" name="source_id" value="${esc(id)}"><label><input type="checkbox" name="confirm_remove" value="yes" required> Confirmo a exclusão desta fonte</label><button class="btn btn-outline" type="submit">Confirmar exclusão</button></form></details>`
 const action=(id:string,kind:string,label:string)=>`<form method="post" action="/admin/news-extractor/commands">${token}<input type="hidden" name="kind" value="${kind}"><input type="hidden" name="source_id" value="${esc(id)}"><button class="btn btn-outline" type="submit">${label}</button></form>`
 const sources=feeds.map(f=>`<article class="collector-source"><header><div><h3>${esc(f.name)}</h3><span>${f.mode==='individual'?'Artigos individuais':f.mode==='trends'?'Google Trends':'RSS de artigos'}</span></div><span class="collector-state ${f.error?'':'collector-state--ok'}">${f.error?'Atenção':'Cadastrada'}</span></header><dl><div><dt>Disponíveis</dt><dd>${f.ready}</dd></div><div><dt>Pendentes</dt><dd>${f.pending}</dd></div><div><dt>Revisão</dt><dd>${f.review}</dd></div></dl><p class="collector-hint">Última coleta: ${date(f.last_sync)}</p>${f.error?notice(f.error,'error'):''}<div class="collector-actions"><a class="btn btn-outline" href="/admin/news-extractor?source=${encodeURIComponent(f.id)}#collector-items">Ver itens</a>${action(f.id,'inspect','Atualizar itens')}${action(f.id,'sync','Coletar agora')}</div>${f.id==='articles'?'':removal(f.id)}</article>`).join('')
 const items=(details?.items||[]).map((item:any)=>`<article><div><h3>${esc(item.title||'Artigo aguardando extração')}</h3><a href="${safeLink(item.link)}" target="_blank" rel="noopener noreferrer">Ver fonte ↗</a>${item.reason?`<p>${esc(item.reason)}</p>`:''}</div><span class="collector-state">${esc(states[item.status]||item.status)}</span></article>`).join('')
 const history=commands.map(command=>`<article><div><h3>${esc(({rss:'Cadastro de RSS',article:'Coleta de artigo',sync:'Atualização da fonte',inspect:'Consulta de itens',remove:'Exclusão de fonte'} as any)[command.kind])}</h3><p>${esc(command.label)} · ${date(command.created_at)}</p>${command.last_error?`<p>${esc(command.last_error)}</p>`:''}<small>${command.attempts} tentativa(s)</small></div><div><span class="collector-state">${esc(states[command.state]||command.state)}</span>${command.state==='failed'?`<form method="post" action="/admin/news-extractor/retry">${token}<input type="hidden" name="id" value="${esc(command.id)}"><button class="btn btn-outline" type="submit">Tentar novamente</button></form>`:''}</div></article>`).join('')
 return `<style>${css}</style><section class="collector-workspace"><header class="collector-intro"><div><p class="collector-kicker">Redação · fontes de conteúdo</p><h1>NewsExtractor</h1><p>Receba o texto completo das fontes para abastecer a redação, sem novas buscas web nesta coleta.</p></div><a class="btn btn-outline" href="/admin/news-extractor">Atualizar painel</a></header>${data.message?notice(data.message):''}${data.error?notice(data.error,'error'):''}
 <div class="collector-connection"><span class="collector-state ${online?'collector-state--ok':''}">${online?'Conector respondendo':snapshot?'Conector sem atualização recente':'Aguardando conexão com o n8n'}</span><span>Última comunicação: ${date(snapshot?.checked_at||null)}</span></div>${!online?notice('As solicitações ficam salvas na fila. Serão encaminhadas quando a ponte com o n8n estiver ativa. Nenhum texto é publicado por este painel.'):''}
 <div class="collector-stats"><article><span>Fontes acompanhadas</span><strong>${feeds.length}</strong></article><article><span>Textos disponíveis</span><strong>${totals.ready}</strong></article><article><span>Aguardando coleta</span><strong>${totals.pending}</strong></article><article><span>Em revisão</span><strong>${totals.review}</strong></article></div>
 <div class="collector-forms"><section class="card"><p class="collector-kicker">Coleta recorrente</p><h2>Cadastrar fonte RSS</h2><p>Use o feed do veículo ou do seu conversor de páginas em RSS.</p><form method="post" action="/admin/news-extractor/commands">${token}<input type="hidden" name="kind" value="rss"><label>Nome da fonte<input name="name" required maxlength="160" placeholder="Ex.: Últimas notícias — fonte"></label><label>Endereço do RSS<input name="url" type="url" required maxlength="3000" placeholder="https://fonte.com.br/rss" autocomplete="off"></label><label>Formato<select name="mode"><option value="articles">RSS de artigos</option><option value="trends">Google Trends com links de notícias</option></select></label><button class="btn" type="submit">Cadastrar fonte</button></form></section>
 <section class="card"><p class="collector-kicker">Coleta pontual</p><h2>Enviar artigo individual</h2><p>Cole o endereço da matéria que deseja disponibilizar para a redação.</p><form method="post" action="/admin/news-extractor/commands">${token}<input type="hidden" name="kind" value="article"><label>Endereço do artigo<input name="url" type="url" required maxlength="3000" placeholder="https://fonte.com.br/noticia" autocomplete="off"></label><p class="collector-hint">O extrator coleta uma página por link. Páginas de últimas notícias devem chegar por RSS.</p><button class="btn" type="submit">Solicitar coleta</button></form><div class="collector-steps"><span>1. Receber link</span><span>2. Extrair texto</span><span>3. Disponibilizar no RSS</span></div></section></div>
 <section class="card"><h2>Fontes no extrator</h2><p>RSS atualizado a cada 15 minutos. Os números mostram coleta, não publicações no site.</p>${sources?`<div class="collector-source-grid">${sources}</div>`:'<p class="collector-empty">As fontes aparecerão após o primeiro relatório do n8n, incluindo as já cadastradas na VPS.</p>'}</section>
 ${source?`<section class="card" id="collector-items"><div class="collector-section-title"><div><h2>Itens · ${esc(feeds.find(f=>f.id===source)?.name||source)}</h2><p>Última consulta: ${date(details?.checked_at||null)} · até 100 itens.</p></div>${action(source,'inspect','Consultar extrator')}</div>${items?`<div class="collector-item-list">${items}</div>`:notice('Ainda não há itens recebidos. Use “Consultar extrator” e atualize o painel após o processamento.')}</section>`:''}
 <section class="card"><h2>Últimas solicitações</h2><p>“Confirmado pelo extrator” significa que o comando foi recebido. A extração e a publicação são etapas posteriores.</p><div class="collector-history">${history||'<p class="collector-empty">Nenhuma solicitação enviada pelo CMS.</p>'}</div></section></section>`
}
export async function handleExtractorAdmin(c:Context){
 if(!allowed(c))return c.text('Acesso restrito à edição.',403)
 c.header('Cache-Control','private, no-store')
 const env=c.env as Env,source=extractorSourceId.safeParse(c.req.query('source'))
 const [snapshot,rows,details]=await Promise.all([env.CACHE.get<ExtractorSnapshot>(EXTRACTOR_STATUS_KEY,'json'),env.DB.prepare('SELECT id,kind,label,state,attempts,last_error,created_at,updated_at FROM news_extractor_commands ORDER BY created_at DESC LIMIT 30').all<ExtractorCommand>(),source.success?env.CACHE.get('news-extractor:details:v1:'+source.data,'json'):Promise.resolve(null)])
 const message=c.req.query('queued')?'Solicitação salva. O n8n buscará a fila a cada cinco minutos.':''
 return c.html(renderAdminLayout({title:'NewsExtractor',activeTab:'news-extractor',user:c.get('adminUser'),csrfToken:c.get('csrfToken'),bodyHtml:renderExtractorWorkspace({snapshot,commands:rows.results,csrf:c.get('csrfToken'),source:source.success?source.data:undefined,details,message,error:c.req.query('error')})}))
}
export async function handleExtractorAdminSave(c:Context){
 if(!allowed(c))return c.text('Acesso restrito à edição.',403)
 c.header('Cache-Control','private, no-store')
 try{
  const body=c.get('parsedBody')||await c.req.parseBody()
  if(c.req.path.endsWith('/retry')){if(!/^[a-f0-9]{32}$/.test(String(body.id)))throw Error('Solicitação inválida.');await retryExtractorCommand(c.env as Env,String(body.id))}
  else await queueExtractorCommand(c.env as Env,body,c.get('adminUser').id)
  const source=extractorSourceId.safeParse(body.source_id)
  return c.redirect('/admin/news-extractor?queued=1'+(source.success?'&source='+source.data+'#collector-items':''),303)
 }catch(error){const text=error instanceof Error&&!(error as any).issues?error.message:'Confira o nome, o tipo e a URL HTTPS da fonte.';return c.redirect('/admin/news-extractor?error='+encodeURIComponent(text.slice(0,240)),303)}
}
