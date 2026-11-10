import {escapeAttr,escapeHtml} from './layout'
export const weatherIcon='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v2M4.9 5.9l1.4 1.4M3 12h2m14.1-6.1-1.4 1.4M8 12a4 4 0 1 1 7.6 1.7"/><path d="M18 20H8a3 3 0 1 1 .8-5.9 4.3 4.3 0 0 1 8.1.9H18a2.5 2.5 0 0 1 0 5Z"/></svg>'
type MenuCategory={slug:string;name:string;is_active?:number|boolean}
export function renderPublicMenu(categories:MenuCategory[],path:string,legacy=false){
 const current=path.replace(/\/+$/,'')||'/',seen=new Set<string>()
 const links=[{href:'/busca',label:'Busca'},{href:'/meu-dia',label:'Meu dia'},{href:'/tempo',label:'Clima'},{href:'/guias',label:'Guias do Diário'},{href:'/jogos/extra-extra',label:'Extra! Extra!'},...categories.filter(category=>category.is_active!==0&&category.is_active!==false&&typeof category.slug==='string'&&category.slug&&typeof category.name==='string').map(category=>({href:'/categoria/'+encodeURIComponent(category.slug),label:category.name}))]
 return links.filter(link=>{if(seen.has(link.href))return false;seen.add(link.href);return true}).map(link=>{
  const weather=link.href==='/tempo'
  const active=current===link.href||(weather&&current.startsWith('/tempo/'))
  const label=weather?`<strong class="ed-weather-menu-label">${weatherIcon} Clima</strong>`:escapeHtml(link.label)
  const anchor=`<a href="${escapeAttr(link.href)}"${legacy?' class="mobile-nav-link"':''}${active?' aria-current="page"':''}>${label}${legacy?'':'<span aria-hidden="true">→</span>'}</a>`
  return legacy?anchor:`<li>${anchor}</li>`
 }).join('')
}
