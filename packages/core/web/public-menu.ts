import {escapeAttr,escapeHtml} from './layout'
type MenuCategory={slug:string;name:string;is_active?:number|boolean}
export function renderPublicMenu(categories:MenuCategory[],path:string,legacy=false){
 const current=path.replace(/\/+$/,'')||'/',seen=new Set<string>()
 const links=[{href:'/busca',label:'Busca'},{href:'/meu-dia',label:'Meu dia'},{href:'/guias',label:'Guias do Diário'},{href:'/jogos/extra-extra',label:'Extra! Extra!'},...categories.filter(category=>category.is_active!==0&&category.is_active!==false&&typeof category.slug==='string'&&category.slug&&typeof category.name==='string').map(category=>({href:'/categoria/'+encodeURIComponent(category.slug),label:category.name}))]
 return links.filter(link=>{if(seen.has(link.href))return false;seen.add(link.href);return true}).map(link=>{const anchor=`<a href="${escapeAttr(link.href)}"${legacy?' class="mobile-nav-link"':''}${current===link.href?' aria-current="page"':''}>${escapeHtml(link.label)}${legacy?'':'<span aria-hidden="true">→</span>'}</a>`;return legacy?anchor:`<li>${anchor}</li>`}).join('')
}
