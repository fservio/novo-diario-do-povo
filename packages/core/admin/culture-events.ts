import type {Context} from 'hono'
import type {Env} from '../types'
import {randomHex} from '../utils'
import {saveCulturalEventRecords} from '../web/culture'
import {renderSuggestedEventFields,parseSuggestedEvent} from '../web/culture-suggestions'
import {getCulturalEvent,refreshCulturalEvents} from '../db/culture'
import {recordManagementAudit} from '../db/daily-management'
import {escapeHtml as esc,renderCsrfInput} from './ui'
import {canManageDaily,managementLayout,managementDate} from './daily-management-ui'
import css from '../../../public/static/culture-agenda.css?raw'

const originLabel=(origin:string)=>({automation:'Coleta automática',editorial:'Redação',organizer:'Organizador'}[origin]||'Coleta automática')
export async function handleCultureEventsAdmin(c:Context){
 if(!canManageDaily(c))return c.text('Acesso restrito à edição.',403)
 const env=c.env as Env,q=(c.req.query('q')||'').trim().slice(0,120),status=c.req.query('status')||'upcoming',page=Math.max(1,Math.min(10000,Math.floor(Number(c.req.query('page'))||1))),args:any[]=[]
 let where='1=1'
 if(q){where+=' AND (e.title LIKE ? OR e.city LIKE ?)';args.push('%'+q+'%','%'+q+'%')}
 if(status==='cancelled'){where+=" AND e.status='cancelled'"}else if(status==='protected'){where+=' AND e.editorial_locked=1'}else if(status!=='all'){where+=" AND e.status='scheduled' AND e.ends_on>=?";args.push(new Date(Date.now()-86400000).toISOString().slice(0,10))}
 const rows=(await env.DB.prepare(`SELECT e.*,u.name AS editor_name FROM cultural_events e LEFT JOIN users u ON u.id=e.edited_by WHERE ${where} ORDER BY e.featured DESC,e.starts_on DESC,e.title LIMIT 26 OFFSET ?`).bind(...args,(page-1)*25).all<any>()).results
 const params=new URLSearchParams({q,status}),link=(p:number)=>'?'+new URLSearchParams({...Object.fromEntries(params),page:String(p)})
 const body=`<p>Eventos de todas as origens. A coleta roda a cada 12 horas. Correções da redação ficam protegidas até serem liberadas.</p><div class="daily-admin-nav"><a class="btn" href="/admin/culture/events/new">Cadastrar evento</a><a class="btn btn-outline" href="/agenda/sugerir" target="_blank" rel="noopener">Formulário dos organizadores ↗</a></div><form class="daily-admin-item daily-admin-filters" method="get"><label>Buscar título ou cidade<input name="q" value="${esc(q)}" maxlength="120"></label><label>Exibir<select name="status">${Object.entries({upcoming:'Programação atual e futura',protected:'Protegidos pela redação',cancelled:'Cancelados',all:'Todos, incluindo encerrados'}).map(([key,label])=>`<option value="${key}" ${status===key?'selected':''}>${label}</option>`).join('')}</select></label><button class="btn" type="submit">Filtrar</button></form><div class="daily-admin-table"><table><thead><tr><th>Evento</th><th>Origem e controle</th><th>Última conferência</th><th></th></tr></thead><tbody>${rows.slice(0,25).map(row=>`<tr><td><strong>${esc(row.title)}</strong><p>${esc(row.city)} / ${esc(row.state)} · ${esc(row.starts_on)}${row.status==='cancelled'?' · Cancelado':''}${row.featured?' · Destaque':''}</p></td><td>${originLabel(row.origin)}<p>${row.editorial_locked?'Protegido pela redação':'Atualização automática liberada'}${row.editor_name?' · '+esc(row.editor_name):''}</p></td><td>${esc(managementDate(row.verified_at))}</td><td><a href="/admin/culture/events/${row.slug}">Gerenciar →</a></td></tr>`).join('')||'<tr><td colspan="4">Nenhum evento para este filtro.</td></tr>'}</tbody></table></div><div class="daily-admin-nav">${page>1?`<a class="btn btn-outline" href="${esc(link(page-1))}">← Anterior</a>`:''}${rows.length>25?`<a class="btn btn-outline" href="${esc(link(page+1))}">Próxima →</a>`:''}</div>`
 return c.html(managementLayout(c,'Eventos culturais','events',body))
}
async function eventPage(c:Context,values?:any,error=''){
 const env=c.env as Env,isNew=c.req.param('slug')==='new',event=isNew?null:await env.DB.prepare('SELECT e.*,u.name AS editor_name FROM cultural_events e LEFT JOIN users u ON u.id=e.edited_by WHERE slug=?').bind(c.req.param('slug')).first<any>()
 if(!isNew&&!event)return null
 const time=(value:string)=>value?new Date(value).toLocaleTimeString('en-GB',{timeZone:event.timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}):''
 const fields=values||(event?{...event,starts_time:time(event.starts_at),ends_time:time(event.ends_at)}:{city:'Teresina',slug:'redacao-'+randomHex(12)})
 const history=event?(await env.DB.prepare("SELECT a.action,a.created_at,u.name AS actor FROM daily_management_audit a LEFT JOIN users u ON u.id=a.actor_id WHERE resource='event' AND resource_key=? ORDER BY a.id DESC LIMIT 12").bind(event.slug).all<any>()).results:[]
 const body=`<style>${css}</style><a href="/admin/culture/events">← Voltar aos eventos</a>${error?`<p class="daily-admin-notice daily-admin-error" role="alert">${esc(error)}</p>`:''}${c.req.query('saved')?'<p class="daily-admin-notice" role="status">Alteração salva.</p>':''}${event?`<div class="daily-admin-notice">Origem: ${originLabel(event.origin)}. ${event.editorial_locked?'Protegido contra alterações automáticas.':'Coleta automática liberada.'}<br>Fonte conferida em ${esc(managementDate(event.verified_at))}. Última atualização: ${esc(managementDate(event.updated_at))}${event.editor_name?' · '+esc(event.editor_name):''}.<br><a href="/agenda/${event.slug}" target="_blank" rel="noopener">Ver evento público ↗</a></div>`:''}<form method="post" class="culture-form" action="/admin/culture/events/${isNew?'new':event.slug}">${renderCsrfInput(c.get('csrfToken')||'')}<input type="hidden" name="slug" value="${esc(fields.slug)}"><input type="hidden" name="revision" value="${esc(String(fields.revision??0))}">${renderSuggestedEventFields(fields)}<label>Situação<select name="status"><option value="scheduled" ${fields.status!=='cancelled'?'selected':''}>Programação confirmada</option><option value="cancelled" ${fields.status==='cancelled'?'selected':''}>Cancelado pela organização</option></select></label><label class="culture-form__consent"><input type="checkbox" name="featured" value="yes" ${fields.featured==='yes'||fields.featured===1?'checked':''}> Destacar na agenda (aparece primeiro dentro dos filtros)</label><label class="culture-form__consent"><input type="checkbox" name="verified" value="yes" required> Conferi a fonte, as datas, o local e as condições de acesso.</label><button name="action" value="save">Salvar e proteger evento</button></form>${event?.editorial_locked?`<form method="post" class="daily-admin-item" action="/admin/culture/events/${event.slug}">${renderCsrfInput(c.get('csrfToken')||'')}<input type="hidden" name="revision" value="${event.revision}"><p>Ao liberar, a coleta poderá substituir dados, inclusive uma correção ou cancelamento. A origem e o histórico são preservados.</p><label><input type="checkbox" name="confirm_unlock" value="yes" required> Autorizo novas atualizações automáticas deste evento.</label><button class="btn btn-outline" name="action" value="unlock">Liberar coleta automática</button></form>`:''}<section class="daily-admin-history"><h2>Histórico editorial</h2>${history.map(row=>`<p>${esc(managementDate(row.created_at))} · ${esc(row.actor||'Editor')} · ${({save:'Salvou e protegeu',unlock:'Liberou coleta automática','approve-suggestion':'Aprovou sugestão de organizador'} as any)[row.action]||esc(row.action)}</p>`).join('')||'<p>Nenhuma ação registrada.</p>'}</section>`
 return managementLayout(c,isNew?'Cadastrar evento':'Gerenciar evento','events',body)
}
export async function handleCultureEventAdmin(c:Context){if(!canManageDaily(c))return c.text('Acesso restrito à edição.',403);const html=await eventPage(c);return html?c.html(html):c.notFound()}
export async function handleCultureEventAdminSave(c:Context){
 if(!canManageDaily(c))return c.text('Acesso restrito à edição.',403)
 const env=c.env as Env,body=(c.get('parsedBody')||await c.req.parseBody()) as Record<string,string>,isNew=c.req.param('slug')==='new',slug=isNew?String(body.slug||''):c.req.param('slug'),revision=Number(body.revision),actor=c.get('adminUser').id
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||slug.length>160||!Number.isSafeInteger(revision)||revision<0)return c.text('Identificador ou versão inválida.',400)
 const existing=await env.DB.prepare('SELECT * FROM cultural_events WHERE slug=?').bind(slug).first<any>()
 if(!isNew&&!existing)return c.notFound()
 if(isNew&&existing)return c.text('Este identificador já existe. Reabra o cadastro.',409)
 try{
  if(body.action==='unlock'&&!isNew){
   if(body.confirm_unlock!=='yes')throw Error('Confirme a liberação da coleta automática.')
   const result=await env.DB.prepare('UPDATE cultural_events SET editorial_locked=0,revision=revision+1,edited_by=?,updated_at=? WHERE slug=? AND revision=? RETURNING slug').bind(actor,new Date().toISOString(),slug,revision).first()
   if(!result)throw Error('Este evento mudou. Reabra a página antes de liberar.')
  }else{
   if(body.action!=='save'||body.verified!=='yes')throw Error('Confirme a conferência da programação.')
   const event=parseSuggestedEvent(body,slug)
   if(!['scheduled','cancelled'].includes(body.status))throw Error('Situação inválida.')
   event.status=body.status as 'scheduled'|'cancelled'
   await saveCulturalEventRecords(env,[event],{origin:'editorial',actorId:actor,revision:isNew?-1:revision,featured:body.featured==='yes'})
  }
  await recordManagementAudit(env,'event',slug,body.action,actor,await env.DB.prepare('SELECT * FROM cultural_events WHERE slug=?').bind(slug).first())
  await env.CACHE?.delete('culture:event:v1:'+slug)
  await getCulturalEvent(env,slug);await refreshCulturalEvents(env)
  return c.redirect('/admin/culture/events/'+slug+'?saved=1',303)
 }catch(error){const message=error instanceof Error?error.message:'Não foi possível salvar.';return c.html((await eventPage(c,body,message.length>350?'Confira os campos e as datas.':message))||'Evento indisponível.',400)}
}
