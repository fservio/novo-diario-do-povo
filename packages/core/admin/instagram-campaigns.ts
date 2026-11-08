import type { Context } from 'hono'
import type { Env } from '../types'
import { normalizeRole } from '../db/users'
import { randomHex } from '../utils'
import { connection, graph, openToken } from '../instagram/direct'
import { isoNow, safeInstagramError } from '../instagram/audience'
import { campaignDestination, normalizeCampaignKeyword } from '../instagram/links'
import { WHATSAPP_CHANNEL_URL } from '../web/components/whatsapp-channel'
import { escapeHtml as esc, renderAdminLayout, renderCsrfInput } from './ui'

const director=(c:Context)=>normalizeRole(c.get('adminUser')?.role || '')==='director'
const root='/admin/instagram/campaigns'
const message=(text:string,error=false)=>`<div class="ig-audience-notice ${error?'is-error':''}" role="status">${esc(text)}</div>`
const redirect=(c:Context,text:string,error=false)=>c.redirect(`${root}?${error?'error':'message'}=${encodeURIComponent(text)}`,303)
const clip=(text:string,max:number)=>Array.from(text).slice(0,max).join('')
function field(body:Record<string,string>,key:string,max:number,required=true){
  const value=String(body[key] || '').trim()
  if((required && !value) || Array.from(value).length>max)throw Error(`Confira o campo ${key}: limite de ${max} caracteres.`)
  return value
}
async function ownPosts(env:Env,account:any){
  const result=await graph(env,await openToken(env,account.token_cipher),`${account.account_id}/media?fields=id,caption,permalink,media_type,media_url,thumbnail_url&limit=100`)
  if(!Array.isArray(result.data))throw Error('O Instagram não disponibilizou os posts da conta.')
  return result.data.filter((post:any)=>/^\d{1,40}$/.test(String(post.id)) && /^https:\/\/(www\.)?instagram\.com\//.test(post.permalink || ''))
}
export async function handleInstagramCampaigns(c:Context){
  const env=c.env as Env,account=await connection(env),csrf=c.get('csrfToken') || '',isDirector=director(c)
  const rows=account?(await env.DB.prepare(`SELECT c.*,
    (SELECT COUNT(*) FROM instagram_campaign_deliveries r WHERE r.campaign_id=c.id AND r.status='sent') sent,
    (SELECT COUNT(*) FROM instagram_campaign_deliveries r WHERE r.campaign_id=c.id AND r.status='queued') queued,
    (SELECT COUNT(*) FROM instagram_campaign_deliveries r WHERE r.campaign_id=c.id AND r.status IN ('failed','uncertain')) failed
    FROM instagram_comment_campaigns c WHERE account_id=? ORDER BY updated_at DESC LIMIT 100`).bind(account.account_id).all<any>()).results:[]
  const editing=rows.find((row:any)=>String(row.id)===c.req.query('id'))
  const showForm=isDirector && (c.req.query('new')==='1' || editing)
  let posts:any[]=[],loadError=''
  if(showForm && account && !editing)try{posts=await ownPosts(env,account)}catch(error){loadError=safeInstagramError(error)}
  const preset=c.req.query('preset')==='whatsapp'
  const values=editing || {name:preset?'Canal do WhatsApp':'',keyword:preset?'CANAL':'',card_title:preset?'Notícias do Diário no WhatsApp':'',card_text:preset?'Siga nosso canal e acompanhe as notícias do Diário do Povo.':'',button_text:preset?'Seguir canal':'Abrir link',destination_url:preset?WHATSAPP_CHANNEL_URL:'',image_url:''}
  const input=(label:string,key:string,max:number,type='text',required=true)=>`<label>${label}<input class="form-input" type="${type}" name="${key}" maxlength="${max}" value="${esc(values[key] || '')}" ${required?'required':''}></label>`
  const bodyHtml=`<link rel="stylesheet" href="/static/admin-instagram-audience.css?v=20261104-campaigns">
    <div class="page-intro"><div><p class="page-kicker">Instagram · Relacionamento com leitores</p><h1 class="page-title">Campanhas por comentário</h1><p class="page-description">Transforme um comentário em um convite, uma inscrição ou acesso a uma reportagem.</p></div><a class="btn btn-outline" href="/admin/instagram/audience">Audiência e matérias</a></div>
    ${c.req.query('message')?message(c.req.query('message')!):''}${c.req.query('error')?message(c.req.query('error')!,true):''}
    ${!account?message('Conecte a conta do Instagram em Integrações antes de criar campanhas.',true):`<section class="card ig-audience-toolbar"><div><strong>@${esc(account.username)}</strong><p>Uma resposta por pessoa em cada campanha. O leitor decide se deseja seguir ou se inscrever.</p></div>${isDirector?`<div class="ig-audience-actions"><a class="btn" href="${root}?new=1">Nova campanha</a><a class="btn btn-outline" href="${root}?new=1&preset=whatsapp">Convidar para o WhatsApp</a></div>`:''}</section>`}
    ${showForm?`<section class="card"><h2>${editing?'Editar campanha':'Nova campanha'}</h2><p>Salve e revise antes de ativar. Só comentários feitos após a ativação geram respostas.</p>${loadError?message(loadError,true):''}
      <form method="post" action="${root}" class="ig-campaign-form">${renderCsrfInput(csrf)}<input type="hidden" name="id" value="${editing?.id || ''}">
      ${input('Nome da campanha','name',100)}
      ${editing?`<input type="hidden" name="media_id" value="${esc(editing.media_id)}"><p>Post associado: <a href="${esc(editing.post_permalink)}" target="_blank" rel="noopener noreferrer">Ver no Instagram ↗</a></p>`:`<label>Post do Instagram<select class="form-input" name="media_id" required><option value="">Selecione um dos 100 posts mais recentes</option>${posts.map((post:any)=>`<option value="${esc(post.id)}">${esc(clip(post.caption || `Post ${post.id}`,110))}</option>`).join('')}</select></label><p class="ig-audience-muted">Inclui posts publicados fora do CMS. Publique o convite no Instagram antes de associá-lo aqui.</p>`}
      ${input('Palavra-chave (ex.: CANAL)','keyword',40)}${input('Título do cartão','card_title',80)}${input('Texto da resposta','card_text',80)}${input('Texto do botão','button_text',20)}${input('Endereço de destino','destination_url',2048,'url')}
      ${input('Imagem do cartão — URL HTTPS (opcional)','image_url',2048,'url',false)}<p class="ig-audience-muted">Deixe a imagem vazia para usar a imagem do post ou a miniatura do vídeo. Para outra imagem, use o endereço público de uma imagem da Biblioteca de mídia.</p>
      <div class="ig-audience-actions"><button class="btn" ${!editing && !posts.length?'disabled':''}>Salvar como pausada</button><a class="btn btn-outline" href="${root}">Cancelar</a></div></form>
    </section>`:''}
    <div class="ig-campaign-grid">${rows.length?rows.map((row:any)=>`<section class="card ig-campaign-card"><div class="ig-audience-heading"><h2>${esc(row.name)}</h2><strong>${row.enabled?'Ativa':'Pausada'}</strong></div>
      <p>Comente <strong>${esc(row.keyword)}</strong> <a href="${esc(row.post_permalink)}" target="_blank" rel="noopener noreferrer">neste post ↗</a></p>
      <div class="ig-campaign-preview">${row.image_url?`<img src="${esc(row.image_url)}" alt="Imagem da campanha" loading="lazy" referrerpolicy="no-referrer">`:''}<strong>${esc(row.card_title)}</strong><p>${esc(row.card_text)}</p><a class="btn btn-outline" href="${esc(row.destination_url)}" target="_blank" rel="noopener noreferrer">${esc(row.button_text)} ↗</a></div>
      <div class="ig-campaign-counts"><span><strong>${row.sent}</strong> enviadas</span><span><strong>${row.opens}</strong> aberturas</span><span><strong>${row.queued}</strong> na fila</span><span><strong>${row.failed}</strong> com atenção</span></div>
      ${row.poll_error?message(row.poll_error,true):''}${row.failed?message('Há envios que precisam de atenção. Resultados incertos não são repetidos automaticamente.',true):''}
      ${isDirector?`<div class="ig-audience-actions"><a class="btn btn-outline" href="${root}?id=${row.id}">Editar</a><form method="post" action="${root}/${row.id}/state">${renderCsrfInput(csrf)}<input type="hidden" name="enabled" value="${row.enabled?'0':'1'}"><button class="btn">${row.enabled?'Pausar':'Ativar campanha'}</button></form></div>`:''}</section>`).join(''):`<section class="card"><h2>Convide leitores para o próximo passo</h2><p>Crie uma campanha, associe um post e escolha o que enviar quando alguém comentar a palavra-chave.</p><p>Exemplo: “Comente CANAL para receber o convite do WhatsApp pelo Direct.”</p></section>`}</div>
    <p class="ig-audience-muted">Envios e filas cobrem os últimos 30 dias. Aberturas incluem acessos repetidos e prévias; não confirmam adesão ao canal. Limites compartilhados com as respostas de matérias: 100 envios por campanha e 200 por conta em 24 horas.</p>`
  c.header('Cache-Control','private, no-store')
  return c.html(renderAdminLayout({title:'Campanhas do Instagram',user:c.get('adminUser'),bodyHtml,activeTab:'instagram',csrfToken:csrf}))
}
export async function handleInstagramCampaignSave(c:Context){
  if(!director(c))return c.text('Acesso negado.',403)
  const env=c.env as Env
  try{
    const account=await connection(env)
    if(!account || account.expires_at<=isoNow())throw Error('Reconecte a conta do Instagram antes de salvar.')
    const body=(c.get('parsedBody') || await c.req.parseBody()) as Record<string,string>
    const id=Number(body.id || 0),name=field(body,'name',100),keyword=normalizeCampaignKeyword(field(body,'keyword',40))
    const title=field(body,'card_title',80),text=field(body,'card_text',80),button=field(body,'button_text',20)
    const destination=campaignDestination(field(body,'destination_url',2048)).toString()
    const image=field(body,'image_url',2048,false),imageUrl=image?campaignDestination(image).toString():null
    let mediaId:string,permalink:string
    if(id){
      const current=await env.DB.prepare('SELECT media_id,post_permalink FROM instagram_comment_campaigns WHERE id=? AND account_id=?').bind(id,account.account_id).first<any>()
      if(!current)throw Error('Campanha não encontrada nesta conta.')
      mediaId=current.media_id;permalink=current.post_permalink
    }else{
      const post=(await ownPosts(env,account)).find((post:any)=>post.id===body.media_id)
      if(!post)throw Error('Escolha um post recente pertencente à conta conectada.')
      mediaId=post.id;permalink=post.permalink
      const existing=await env.DB.prepare('SELECT id FROM instagram_comment_campaigns WHERE account_id=? AND media_id=?').bind(account.account_id,mediaId).first()
      if(existing)throw Error('Este post já tem campanha. Edite a campanha existente.')
    }
    if(id)await env.DB.prepare(`UPDATE instagram_comment_campaigns SET name=?,keyword=?,card_title=?,card_text=?,button_text=?,destination_url=?,image_url=?,enabled=0,poll_cursor=NULL,poll_error=NULL,updated_at=? WHERE id=? AND account_id=?`)
      .bind(name,keyword,title,text,button,destination,imageUrl,isoNow(),id,account.account_id).run()
    else await env.DB.prepare(`INSERT INTO instagram_comment_campaigns(account_id,media_id,post_permalink,name,keyword,card_title,card_text,button_text,destination_url,image_url,link_token,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(account.account_id,mediaId,permalink,name,keyword,title,text,button,destination,imageUrl,randomHex(24),isoNow()).run()
    return redirect(c,'Campanha salva e pausada. Revise o cartão e ative quando estiver pronta.')
  }catch(error){return redirect(c,error instanceof Error?error.message:'Não foi possível salvar a campanha.',true)}
}
export async function handleInstagramCampaignState(c:Context){
  if(!director(c))return c.text('Acesso negado.',403)
  const env=c.env as Env
  try{
    const body=(c.get('parsedBody') || await c.req.parseBody()) as Record<string,string>,enabled=body.enabled==='1',account=await connection(env)
    if(!account)throw Error('Conecte a conta do Instagram.')
    const campaign=await env.DB.prepare('SELECT * FROM instagram_comment_campaigns WHERE id=? AND account_id=?').bind(Number(c.req.param('id')),account.account_id).first<any>()
    if(!campaign)throw Error('Campanha não encontrada nesta conta.')
    if(enabled){
      campaignDestination(campaign.destination_url)
      const conflict=await env.DB.prepare('SELECT publication_id FROM instagram_link_campaigns WHERE media_id=? AND enabled=1').bind(campaign.media_id).first()
      if(conflict)throw Error('Pause a resposta LINK da matéria antes de ativar outra campanha neste post.')
      await graph(env,await openToken(env,account.token_cipher),`${campaign.media_id}/comments?fields=id&limit=1`)
    }
    await env.DB.prepare(`UPDATE instagram_comment_campaigns SET enabled=?,enabled_at=CASE WHEN enabled=0 AND ?=1 THEN ? ELSE enabled_at END,poll_cursor=NULL,updated_at=? WHERE id=? AND account_id=?`)
      .bind(enabled?1:0,enabled?1:0,isoNow(),isoNow(),campaign.id,account.account_id).run()
    return redirect(c,enabled?'Campanha ativada para novos comentários.':'Campanha pausada.')
  }catch(error){return redirect(c,error instanceof Error?error.message:'Não foi possível atualizar a campanha.',true)}
}
