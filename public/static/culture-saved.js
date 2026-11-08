const KEY='diario.culture.saved.v1'
export function normalizeSavedEvents(value){
 if(!Array.isArray(value))return []
 const seen=new Set()
 return value.filter(item=>{if(!item||typeof item.slug!=='string'||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug)||item.slug.length>160||seen.has(item.slug)||typeof item.title!=='string'||!item.title.trim()||typeof item.city!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(item.date))return false;seen.add(item.slug);return true}).slice(0,50).map(item=>({slug:item.slug,title:item.title.slice(0,180),city:item.city.slice(0,120),date:item.date}))
}
export function initializeCultureSaved(){
 const root=document.querySelector('[data-culture-favorites]');if(!root)return
 const query=selector=>root.querySelector(selector),buttons=Array.from(document.querySelectorAll('[data-culture-save]')),dialog=query('[data-culture-saved-dialog]')
 let saved=[]
 try{saved=normalizeSavedEvents(JSON.parse(localStorage.getItem(KEY)))}catch{}
 function persist(){try{localStorage.setItem(KEY,JSON.stringify(saved));return true}catch{query('[data-culture-saved-status]').textContent='O navegador não permitiu guardar os favoritos. Eles valem apenas nesta página.';return false}}
 function refresh(){for(const button of buttons){button.hidden=false;const active=saved.some(item=>item.slug===button.dataset.slug);button.setAttribute('aria-pressed',String(active));button.textContent=active?'Evento salvo ✓':'Salvar evento'}query('[data-culture-saved-count]').textContent='('+saved.length+')'}
 for(const button of buttons)button.addEventListener('click',()=>{
  const active=saved.some(item=>item.slug===button.dataset.slug)
  saved=active?saved.filter(item=>item.slug!==button.dataset.slug):normalizeSavedEvents([{slug:button.dataset.slug,title:button.dataset.title,city:button.dataset.city,date:button.dataset.date},...saved])
  query('[data-culture-saved-status]').textContent=active?'Evento removido dos favoritos.':'Evento salvo neste navegador. São guardados até 50 programas.'
  persist();refresh()
 })
 function renderList(){
  const list=query('[data-culture-saved-list]');list.replaceChildren();query('[data-culture-no-saved]').hidden=saved.length>0
  for(const item of saved){const row=document.createElement('li'),content=document.createElement('div'),link=document.createElement('a'),meta=document.createElement('span'),remove=document.createElement('button');link.href='/agenda/'+item.slug;link.textContent=item.title;meta.textContent=item.city+' · '+item.date.split('-').reverse().join('/');remove.type='button';remove.textContent='Remover';remove.setAttribute('aria-label','Remover evento: '+item.title);remove.addEventListener('click',()=>{saved=saved.filter(event=>event.slug!==item.slug);persist();refresh();renderList();query('[data-culture-close-saved]').focus()});content.append(link,meta);row.append(content,remove);list.append(row)}
 }
 query('[data-culture-open-saved]').addEventListener('click',()=>{renderList();dialog.showModal()})
 query('[data-culture-close-saved]').addEventListener('click',()=>dialog.close())
 root.hidden=false;refresh()
}
if(typeof document!=='undefined')initializeCultureSaved()
