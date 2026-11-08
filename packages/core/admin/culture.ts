import {managementNav} from './daily-management-ui'
import {recordManagementAudit} from '../db/daily-management'
import type {Context} from 'hono'
import type {Env} from '../types'
import {normalizeRole} from '../db/users'
import {escapeHtml as esc,renderAdminLayout,renderCsrfInput} from './ui'
import {renderSuggestedEventFields,parseSuggestedEvent} from '../web/culture-suggestions'
import {saveCulturalEventRecords} from '../web/culture'
import {cultureEventVisible} from '../../../public/static/culture-agenda.js'
import css from '../../../public/static/culture-agenda.css?raw'
const canReview=(c:Context)=>['director','editor'].includes(normalizeRole(c.get('adminUser')?.role||''))
const date=(value:string)=>new Date(value).toLocaleString('pt-BR',{timeZone:'America/Fortaleza'})
export async function handleCultureSuggestionsAdmin(c:Context){
 if(!canReview(c))return c.text('Acesso restrito à edição.',403)
 const env=c.env as Env,status=['pending','published','rejected'].includes(c.req.query('status')||'')?c.req.query('status')!:'pending'
 const page=Math.min(10000,Math.max(1,Math.floor(Number(c.req.query('page'))||1)))
 const rows=(await env.DB.prepare('SELECT id,organizer_name,event_json,status,created_at FROM cultural_suggestions WHERE status=? ORDER BY created_at DESC,id DESC LIMIT 26 OFFSET ?').bind(status,(page-1)*25).all<any>()).results
 const labels:Record<string,string>={pending:'Aguardando conferência',published:'Publicadas',rejected:'Recusadas'}
 const body=`<div class="page-intro"><div><p class="page-kicker">Agenda cultural · Organizadores</p><h1 class="page-title">Sugestões de eventos</h1><p class="page-description">Dados enviados pelo público. Confira a fonte, data, local e ingresso antes de publicar.</p></div><a class="btn btn-outline" href="/agenda/sugerir" target="_blank" rel="noopener">Abrir formulário público</a></div><nav class="culture-admin-tabs">${Object.entries(labels).map(([key,label])=>`<a class="btn ${status===key?'':'btn-outline'}" href="/admin/culture/suggestions?status=${key}">${label}</a>`).join('')}</nav><section class="card"><div class="newsletter-table-wrap"><table><thead><tr><th>Evento</th><th>Organizador</th><th>Recebida</th><th></th></tr></thead><tbody>${rows.slice(0,25).map(row=>{const event=JSON.parse(row.event_json);return `<tr><td><strong>${esc(event.title)}</strong><small style="display:block">${esc(event.city)} / ${esc(event.state)}</small></td><td>${esc(row.organizer_name)}</td><td>${esc(date(row.created_at))}</td><td><a href="/admin/culture/suggestions/${row.id}">Conferir →</a></td></tr>`}).join('')||'<tr><td colspan="4">Nenhuma sugestão nesta fila.</td></tr>'}</tbody></table></div><div class="culture-admin-tabs">${page>1?`<a href="?status=${status}&page=${page-1}">← Anterior</a>`:''}${rows.length>25?`<a href="?status=${status}&page=${page+1}">Próxima →</a>`:''}</div></section>`
 return c.html(renderAdminLayout({title:'Sugestões culturais',user:c.get('adminUser'),activeTab:'culture',csrfToken:c.get('csrfToken')||'',bodyHtml:`<section class="daily-admin-workspace"><style>${css}</style>${managementNav('suggestions')}${body}</section>`}))
}
export async function handleCultureSuggestionReview(c:Context){
 if(!canReview(c))return c.text('Acesso restrito à edição.',403)
 const row=await (c.env as Env).DB.prepare('SELECT s.*,u.name AS reviewer_name FROM cultural_suggestions s LEFT JOIN users u ON u.id=s.reviewed_by WHERE s.id=?').bind(Number(c.req.param('id'))).first<any>()
 if(!row)return c.notFound()
 const event=JSON.parse(row.event_json)
 const time=(value:string|null)=>value?new Date(value).toLocaleTimeString('en-GB',{timeZone:event.timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}):''
 const fields={...event,starts_time:time(event.starts_at),ends_time:time(event.ends_at)}
 const error=c.req.query('error')
 const body=`<style>${css}</style><div class="page-intro"><div><a href="/admin/culture/suggestions">← Sugestões</a><h1 class="page-title">Conferir programação</h1><p class="page-description">Recebida em ${esc(date(row.created_at))}. Contato privado: ${esc(row.organizer_name)} · ${esc(row.organizer_email)}</p></div></div>${error?`<p role="alert" class="culture-form__error">${esc(error)}</p>`:''}<section class="card culture-form"><a href="${esc(event.source_url)}" target="_blank" rel="noopener noreferrer">Consultar fonte enviada ↗</a>${row.status!=='pending'?`<p>Sugestão ${row.status==='published'?'publicada':'recusada'}.</p>${row.reviewed_at?`<p>Revisada em ${esc(date(row.reviewed_at))} por ${esc(row.reviewer_name||'Editor')}.</p>`:''}${row.event_slug?`<a href="/agenda/${esc(row.event_slug)}">Abrir evento →</a> · <a href="/admin/culture/events/${esc(row.event_slug)}">Gerenciar evento</a>`:''}${row.review_note?`<p>${esc(row.review_note)}</p>`:''}`:`<form method="post" action="/admin/culture/suggestions/${row.id}">${renderCsrfInput(c.get('csrfToken')||'')}${renderSuggestedEventFields(fields)}<label class="culture-form__consent"><input type="checkbox" name="verified" value="yes">Conferi a fonte, data, local e informações de ingresso.</label><label>Nota interna<textarea name="review_note" maxlength="1000" rows="3"></textarea></label><div class="culture-admin-tabs"><button type="submit" name="action" value="publish">Conferir e publicar</button><button type="submit" name="action" value="reject" formnovalidate>Recusar sugestão</button></div></form>`}</section>`
 return c.html(renderAdminLayout({title:'Conferir evento',user:c.get('adminUser'),activeTab:'culture',csrfToken:c.get('csrfToken')||'',bodyHtml:'<section class="daily-admin-workspace">'+managementNav('suggestions')+body+'</section>'}))
}
export async function handleCultureSuggestionDecision(c:Context){
 if(!canReview(c))return c.text('Acesso restrito à edição.',403)
 const env=c.env as Env,id=Number(c.req.param('id')),body=(c.get('parsedBody')||await c.req.parseBody()) as Record<string,string>
 const row=await env.DB.prepare('SELECT * FROM cultural_suggestions WHERE id=? AND status=\'pending\'').bind(id).first<any>()
 if(!row)return c.text('Sugestão indisponível ou já revisada.',409)
 const note=String(body.review_note||'').slice(0,1000),now=new Date().toISOString(),reviewer=c.get('adminUser').id
 if(body.action==='reject'){
  await env.DB.prepare("UPDATE cultural_suggestions SET status='rejected',reviewed_at=?,reviewed_by=?,review_note=? WHERE id=? AND status='pending'").bind(now,reviewer,note,id).run()
  return c.redirect('/admin/culture/suggestions?status=rejected',303)
 }
 try{
  if(body.action!=='publish'||body.verified!=='yes')throw Error('Confirme a conferência da programação antes de publicar.')
  const event=parseSuggestedEvent(body,'organizadores-'+id)
  if(!cultureEventVisible({...event,city_key:''},{period:'any'},Date.now()))throw Error('A programação já terminou.')
  await saveCulturalEventRecords(env,[event],{origin:'organizer',actorId:reviewer})
  await recordManagementAudit(env,'event',event.slug,'approve-suggestion',reviewer,event)
  await env.DB.prepare("UPDATE cultural_suggestions SET status='published',reviewed_at=?,reviewed_by=?,event_slug=?,review_note=? WHERE id=? AND status='pending'").bind(now,reviewer,event.slug,note,id).run()
  return c.redirect('/admin/culture/suggestions/'+id,303)
 }catch(error){const message=error instanceof Error?error.message:'Não foi possível publicar.';return c.redirect('/admin/culture/suggestions/'+id+'?error='+encodeURIComponent(message.length>300?'Confira os campos e as datas do evento.':message),303)}
}
