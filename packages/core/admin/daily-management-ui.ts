import managementCss from '../../../public/static/admin-daily-management.css?raw'
import type {Context} from 'hono'
import {normalizeRole} from '../db/users'
import {renderAdminLayout,escapeHtml as esc} from './ui'
export const canManageDaily=(c:Context)=>['director','editor'].includes(normalizeRole(c.get('adminUser')?.role||''))
export const managementNav=(active:string)=>`<style>${managementCss}</style><nav class="daily-admin-nav" aria-label="Meu dia e Agenda">${[['edition','/admin/meu-dia','Edição do dia'],['events','/admin/culture/events','Eventos'],['suggestions','/admin/culture/suggestions','Sugestões']].map(([key,url,title])=>`<a class="btn ${key===active?'':'btn-outline'}" href="${url}" ${key===active?'aria-current="page"':''}>${title}</a>`).join('')}<a class="btn btn-outline" href="/meu-dia" target="_blank" rel="noopener">Ver página pública ↗</a></nav>`
export function managementLayout(c:Context,title:string,active:string,body:string){return renderAdminLayout({title,user:c.get('adminUser'),activeTab:'culture',csrfToken:c.get('csrfToken')||'',bodyHtml:`<section class="daily-admin-workspace"><div class="page-intro"><div><p class="page-kicker">Meu dia e Agenda</p><h1 class="page-title">${esc(title)}</h1></div></div>${managementNav(active)}${body}</section>`})}
export const managementDate=(value:string)=>new Date(value).toLocaleString('pt-BR',{timeZone:'America/Fortaleza'})
