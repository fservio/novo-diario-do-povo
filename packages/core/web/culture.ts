import type { Context } from 'hono'
import { z } from 'zod'
import type { Env } from '../types'
import { cultureEventSchema,CULTURE_CATEGORIES,type CulturalEvent } from '../culture'
import { getCulturalEvents,getCulturalEvent,refreshCulturalEvents } from '../db/culture'
import { cultureCityKey,cultureEventVisible } from '../../../public/static/culture-agenda.js'
import { escapeHtml,escapeAttr } from './layout'
import { renderEditorialLayout } from './layout-editorial'
import cultureCss from '../../../public/static/culture-agenda.css?raw'
import {eventCalendar} from '../culture-calendar'
import {renderEventSave,renderCultureFavorites,cultureActionsScript} from './components/culture-actions'

const columns=['slug','title','summary','category','state','city','city_key','venue','address','starts_on','ends_on','starts_at','ends_at','timezone','price_type','price_text','source_url','verified_at','image_key','status','updated_at']
export async function handleCultureCalendar(c:Context){
 const env=c.env as Env,event=await getCulturalEvent(env,c.req.param('slug'))
 if(!event)return c.notFound()
 const base=(env.PUBLIC_BASE_URL||'https://diario.dopovo.com.br').replace(/\/$/,'')
 c.header('Content-Type','text/calendar; charset=utf-8');c.header('Content-Disposition',`attachment; filename="${event.slug}.ics"`)
 c.header('Cache-Control','public, max-age=300')
 return c.body(eventCalendar(event,base+'/agenda/'+event.slug))
}
export async function handleCulturalEventsList(c:Context){return c.json({success:true,events:await getCulturalEvents(c.env as Env)})}
export async function handleCulturalEventsSave(c:Context){
  let raw:unknown
  try{raw=await c.req.json()}catch{return c.json({success:false,error:'JSON inválido.'},400)}
  const parsed=z.object({events:z.array(cultureEventSchema).min(1).max(30)}).safeParse(raw)
  if(!parsed.success)return c.json({success:false,error:'Programação inválida.',details:parsed.error.issues.map(issue=>issue.message)},400)
  if(new Set(parsed.data.events.map(event=>event.slug)).size!==parsed.data.events.length)return c.json({success:false,error:'Evento repetido no lote.'},400)
  const now=new Date(),env=c.env as Env
  if(parsed.data.events.some(event=>Date.parse(event.verified_at)>now.getTime()+300000||now.getTime()-Date.parse(event.verified_at)>7*86400000))return c.json({success:false,error:'A conferência da fonte deve ser recente e não pode estar no futuro.'},400)
  try{
    const events=await saveCulturalEventRecords(env,parsed.data.events)
    return c.json({success:true,count:events.length,events:events.map(event=>({slug:event.slug,url:'/agenda/'+event.slug}))})
  }catch(error){if(error instanceof Error&&error.message==='Imagem não encontrada na biblioteca de mídia.')return c.json({success:false,error:error.message},400);throw error}
}
export async function saveCulturalEventRecords(env:Env,inputs:z.infer<typeof cultureEventSchema>[],options:{actorId?:number;origin?:'editorial'|'organizer';revision?:number;featured?:boolean}={}){
  const now=new Date(),mediaIds=[...new Set(inputs.flatMap(event=>event.image_media_id?[event.image_media_id]:[]))]
  const images=new Map<number,string>()
  if(mediaIds.length){
    const media=await env.DB.prepare(`SELECT id,r2_key FROM media WHERE id IN (${mediaIds.map(()=>'?').join(',')}) AND mime_type LIKE 'image/%'`).bind(...mediaIds).all<{id:number;r2_key:string}>()
    for(const image of media.results)images.set(image.id,image.r2_key)
    if(images.size!==mediaIds.length)throw Error('Imagem não encontrada na biblioteca de mídia.')
  }
  const events:CulturalEvent[]=inputs.map(({image_media_id,...event})=>({...event,city_key:cultureCityKey(event.city,event.state),image_key:image_media_id?images.get(image_media_id)!:null,updated_at:now.toISOString()}))
  const update=columns.filter(key=>key!=='slug').map(key=>key==='image_key'?'image_key=COALESCE(excluded.image_key,cultural_events.image_key)':key+'=excluded.'+key).join(',')
  if(options.origin){
    if(events.length!==1)throw Error('Edite um evento por vez.')
    const event=events[0],result=await env.DB.prepare(`INSERT INTO cultural_events(${columns.join(',')},origin,editorial_locked,edited_by,featured,revision) VALUES(${columns.map(()=>'?').join(',')},?,1,?,?,1) ON CONFLICT(slug) DO UPDATE SET ${update},editorial_locked=1,edited_by=excluded.edited_by,featured=excluded.featured,revision=cultural_events.revision+1 WHERE cultural_events.revision=? RETURNING slug`).bind(...columns.map(key=>event[key as keyof CulturalEvent]),options.origin,options.actorId||null,options.featured?1:0,options.revision??-1).first()
    if(!result)throw Error('O evento foi alterado por outra pessoa ou pela coleta. Reabra antes de salvar.')
  }else{
    await env.DB.batch(events.map(event=>env.DB.prepare(`INSERT INTO cultural_events(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')}) ON CONFLICT(slug) DO UPDATE SET ${update},revision=cultural_events.revision+1 WHERE cultural_events.editorial_locked=0`).bind(...columns.map(key=>event[key as keyof CulturalEvent]))))
  }
  const saved=await env.DB.prepare(`SELECT * FROM cultural_events WHERE slug IN (${events.map(()=>'?').join(',')})`).bind(...events.map(event=>event.slug)).all<CulturalEvent>()
  for(const event of saved.results){try{await env.CACHE?.put('culture:event:v1:'+event.slug,JSON.stringify(event),{expirationTtl:3600})}catch{}}
  await refreshCulturalEvents(env)
  return saved.results
}

function eventDate(event:CulturalEvent){
  const date=new Date(event.starts_on+'T12:00:00Z')
  return {day:date.toLocaleDateString('pt-BR',{timeZone:'UTC',day:'2-digit'}),month:date.toLocaleDateString('pt-BR',{timeZone:'UTC',month:'short'}).replace('.',''),full:date.toLocaleDateString('pt-BR',{timeZone:'UTC',day:'numeric',month:'long',year:'numeric'}),time:event.starts_at?new Date(event.starts_at).toLocaleTimeString('pt-BR',{timeZone:event.timezone,hour:'2-digit',minute:'2-digit'}):'Horário a confirmar'}
}
const price=(event:CulturalEvent)=>event.price_type==='free'?'Gratuito':event.price_type==='paid'?(event.price_text||'Pago · valor não informado'):'Preço não informado'
function eventCard(event:CulturalEvent){
  const date=eventDate(event),category=CULTURE_CATEGORIES[event.category]
  return `<article class="culture-card culture-card--${event.category}" data-culture-event data-city-key="${escapeAttr(event.city_key)}" data-category="${event.category}" data-starts-on="${event.starts_on}" data-ends-on="${event.ends_on}" data-ends-at="${escapeAttr(event.ends_at||'')}" data-timezone="${escapeAttr(event.timezone)}" data-status="${event.status}">
    <a class="culture-card__visual" href="/agenda/${event.slug}" aria-label="Ver programação: ${escapeAttr(event.title)}">${event.image_key?`<img src="/i/${escapeAttr(event.image_key)}?w=720&h=440&fit=cover" alt="" width="720" height="440" loading="lazy">`:`<span class="culture-card__art" aria-hidden="true"><i></i><b>${escapeHtml(category)}</b></span>`}<span class="culture-card__date"><strong>${date.day}</strong><span>${date.month}</span></span></a>
    <div class="culture-card__body"><p class="culture-card__eyebrow">${escapeHtml(category)} <span>·</span> ${escapeHtml(event.city)} / ${event.state}</p><h3><a href="/agenda/${event.slug}">${escapeHtml(event.title)}</a></h3><p class="culture-card__summary">${escapeHtml(event.summary)}</p><p class="culture-card__place">${escapeHtml(event.venue)}<span>${escapeHtml(date.time)}${event.starts_at?' · horário local':''}</span></p><div class="culture-card__bottom"><span class="culture-price${event.price_type==='free'?' culture-price--free':''}">${escapeHtml(price(event))}</span><a href="/agenda/${event.slug}">Ver programação <span aria-hidden="true">↗</span></a></div><div class="culture-card__save">${renderEventSave(event)}</div></div>
  </article>`
}

export function renderCultureAgenda(events:CulturalEvent[],now=new Date(),filters:{city?:string;category?:string;period?:string;state?:string}={}){
  const active=events.filter(event=>cultureEventVisible(event,{},now.getTime()))
  const cities=new Map<string,string>([['pi-teresina','Teresina / PI']])
  for(const event of active)cities.set(event.city_key,event.city+' / '+event.state)
  const options=[...cities.entries()].sort((a,b)=>a[0]==='pi-teresina'?-1:b[0]==='pi-teresina'?1:a[1].localeCompare(b[1],'pt-BR'))
  const selectedCity=filters.city&&/^[a-z]{2}-[a-z0-9-]+$/.test(filters.city)?filters.city:''
  if(selectedCity&&!cities.has(selectedCity))options.push([selectedCity,'Cidade selecionada'])
  const selectedCategory=filters.category&&Object.hasOwn(CULTURE_CATEGORIES,filters.category)?filters.category:''
  const selectedPeriod=['today','weekend','upcoming'].includes(filters.period||'')?filters.period!:'upcoming'
  const selected=active.filter(event=>cultureEventVisible(event,{city:selectedCity,category:selectedCategory,period:selectedPeriod},now.getTime()))
  let visible=0
  return `<style>${cultureCss}</style><section id="daily-culture" class="culture-agenda" data-culture-agenda aria-labelledby="culture-heading"><header class="culture-agenda__header"><div><p class="daily-kicker">Depois das notícias, viva a cidade</p><h2 id="culture-heading">Seu próximo<br><em>bom programa.</em></h2><p>Música, encontros e descobertas.<br>Encontre um motivo para sair da rotina.</p></div><div class="culture-agenda__stamp" aria-hidden="true"><span>Agenda</span><strong>Cultural</strong><i>↓</i></div></header>
    <form id="culture-filter-form" class="culture-filters" data-culture-form action="/meu-dia#daily-culture" method="get">${filters.state?`<input type="hidden" name="estado" value="${escapeAttr(filters.state)}">`:''}<div><label for="culture-city">Onde você quer ir?</label><select id="culture-city" name="cidade" data-culture-city><option value="">Programação pelo Brasil</option>${options.map(([key,name])=>`<option value="${key}" ${selectedCity===key?'selected':''}>${escapeHtml(name)}</option>`).join('')}</select></div><div><label for="culture-category">O que combina com você?</label><select id="culture-category" name="categoria" data-culture-category><option value="">Todas as experiências</option>${Object.entries(CULTURE_CATEGORIES).map(([key,name])=>`<option value="${key}" ${selectedCategory===key?'selected':''}>${name}</option>`).join('')}</select></div><button type="submit">Encontrar programas <span aria-hidden="true">→</span></button></form>
    <div class="culture-agenda__toolbar"><div class="culture-periods" role="group" aria-label="Período da programação">${[['today','Hoje'],['weekend','Fim de semana'],['upcoming','Próximos dias']].map(([value,label])=>`<button type="submit" form="culture-filter-form" name="periodo" value="${value}" data-culture-period="${value}" aria-pressed="${value===selectedPeriod}" ${value==='weekend'?'title="Sábado e domingo"':''}>${label}</button>`).join('')}</div><span data-culture-count aria-live="polite">${Math.min(6,selected.length)}${selected.length>6?' de '+selected.length:''} eventos</span></div>
    ${renderCultureFavorites()}<p class="culture-agenda__location" data-culture-location>${escapeHtml(options.find(([key])=>key===selectedCity)?.[1]||'Programação pelo Brasil')}</p><p class="culture-status" data-culture-status role="status"></p><div id="culture-results" class="culture-grid">${active.map(event=>{const show=selected.includes(event)&&visible++<6;return eventCard(event).replace('data-culture-event','data-culture-event'+(show?'':' hidden'))}).join('')}</div><button type="button" class="culture-more" data-culture-more aria-controls="culture-results" hidden>Mostrar mais programas ↓</button><div class="culture-empty" data-culture-empty ${selected.length?'hidden':''}><span aria-hidden="true">↗</span><h3>O próximo encontro ainda está sendo preparado.</h3><p>Ainda não temos programação confirmada para essa combinação. Experimente outra cidade, período ou categoria.</p><p>Não encontrou sua cidade? A cobertura será ampliada conforme novas fontes forem confirmadas.</p></div><p class="culture-agenda__note">Organiza um evento? <a href="/agenda/sugerir">Envie sua programação para análise da redação ↗</a><br>Confira a programação com o organizador antes de sair. Informações podem mudar. Imagens, quando disponíveis, vêm da biblioteca editorial.</p></section>`
}

export async function handleCulturalEventPage(c:Context){
  const env=c.env as Env,event=await getCulturalEvent(env,c.req.param('slug'))
  if(!event)return c.notFound()
  const base=(env.PUBLIC_BASE_URL||'https://diario.dopovo.com.br').replace(/\/$/,''),date=eventDate(event),active=cultureEventVisible(event,{period:'any'},Date.now())
  const status=event.status==='cancelled'?'Evento cancelado':!active?'Programação encerrada':'Programação confirmada na fonte'
  const body=`<div class="culture-detail"><a class="culture-detail__back" href="/meu-dia#daily-culture">← Voltar à agenda cultural</a><p class="daily-kicker">${escapeHtml(CULTURE_CATEGORIES[event.category])} · ${escapeHtml(event.city)} / ${event.state}</p><h1>${escapeHtml(event.title)}</h1><span class="culture-detail__status">${status}</span>${event.image_key?`<img class="culture-detail__image" src="/i/${escapeAttr(event.image_key)}?w=1200" alt="${escapeAttr(event.title)}" width="1200" height="730">`:''}<p class="culture-detail__summary">${escapeHtml(event.summary)}</p><dl><div><dt>Quando</dt><dd>${escapeHtml(date.full)}${event.ends_on!==event.starts_on?' a '+escapeHtml(new Date(event.ends_on+'T12:00:00Z').toLocaleDateString('pt-BR',{timeZone:'UTC',dateStyle:'long'})):''}<span>${escapeHtml(date.time)}${event.starts_at?' · horário local':''}</span></dd></div><div><dt>Onde</dt><dd>${escapeHtml(event.venue)}<span>${escapeHtml(event.address||'Endereço completo a confirmar')} · ${escapeHtml(event.city)} / ${event.state}</span></dd></div><div><dt>Ingresso</dt><dd>${escapeHtml(price(event))}</dd></div></dl><a class="culture-detail__official" href="${escapeAttr(event.source_url)}" target="_blank" rel="noopener noreferrer">Consultar programação oficial ↗</a>${active?`<div class="culture-detail__actions">${renderEventSave(event)}<a class="culture-calendar" href="/agenda/${event.slug}/calendario.ics">Adicionar ao calendário ↓</a></div><p class="culture-calendar__note">${!event.starts_at?'Sem horário confirmado: será criado um lembrete de dia inteiro. ':''}Arquivo .ics, sem acesso à sua conta. Mudanças futuras não atualizam automaticamente o arquivo importado.</p>`:''}${renderCultureFavorites()}<p class="culture-detail__note">Informação conferida em ${escapeHtml(new Date(event.verified_at).toLocaleDateString('pt-BR',{timeZone:event.timezone}))}. Consulte o organizador sobre alterações, disponibilidade e condições de acesso.</p></div>`
  return c.html(renderEditorialLayout({title:event.title+' | Agenda cultural | Diário do Povo',description:event.summary,bodyHtml:body,baseUrl:base,siteName:'Diário do Povo',canonicalUrl:base+'/agenda/'+event.slug,nonce:c.get('cspNonce')||'',navItems:[{label:'Meu dia',href:'/meu-dia'},{label:'Agenda cultural',href:'/meu-dia#daily-culture',active:true}],extraScriptsHtml:cultureActionsScript,extraHeadHtml:`<style>${cultureCss}</style>`}))
}
