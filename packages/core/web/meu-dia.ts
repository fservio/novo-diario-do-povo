import {getManagedEdition} from '../db/daily-management'
import {cultureActionsScript} from './components/culture-actions'
import type { Context } from 'hono'
import type { Env } from '../types'
import { BRAZIL_STATES, DAILY_SECTIONS, dailyDate, editionKey, dailyEditionSchema, type DailyEdition, type DailyItem } from '../meu-dia'
import { getPostUrl } from '../utils/post'
import { escapeHtml, escapeAttr } from './layout'
import { renderEditorialLayout } from './layout-editorial'
import dailyCss from '../../../public/static/meu-dia.css?raw'
import { getCulturalEvents } from '../db/culture'
import { renderCultureAgenda } from './culture'
import type { CulturalEvent } from '../culture'

const baseUrl=(env:Env)=>(env.PUBLIC_BASE_URL||'https://diario.dopovo.com.br').replace(/\/$/,'')
export async function handleDailyEditionSave(c:Context){
  const env=c.env as Env
  if(!env.CACHE)return c.json({success:false,error:'Cache indisponível.'},503)
  let raw:unknown
  try{raw=await c.req.json()}catch{return c.json({success:false,error:'JSON inválido.'},400)}
  const parsed=dailyEditionSchema.safeParse(raw),now=new Date()
  if(!parsed.success)return c.json({success:false,error:'Edição inválida.',details:parsed.error.issues.map(i=>i.message)},400)
  if(parsed.data.date!==dailyDate(now))return c.json({success:false,error:'A edição precisa ser do dia atual em America/Fortaleza.'},400)
  if(new Set(parsed.data.items.map(item=>item.post_id)).size!==parsed.data.items.length)return c.json({success:false,error:'Matéria repetida na edição.'},400)
  if(parsed.data.items.some(item=>item.expires_at&&Date.parse(item.expires_at)<=now.getTime()))return c.json({success:false,error:'Há itens com validade vencida.'},400)
  const ids=parsed.data.items.map(item=>item.post_id)
  const result=await env.DB.prepare(`SELECT id,slug,title,published_at,created_at FROM posts WHERE id IN (${ids.map(()=>'?').join(',')}) AND status='published' AND seo_noindex=0 AND published_at<=?`).bind(...ids,now.toISOString()).all<any>()
  if(result.results.length!==ids.length)return c.json({success:false,error:'Todas as matérias precisam estar publicadas e visíveis.'},400)
  const posts=new Map(result.results.map(p=>[p.id,p]))
  const edition:DailyEdition={date:parsed.data.date,updated_at:now.toISOString(),items:parsed.data.items.map(item=>{const p=posts.get(item.post_id)!;return {...item,title:p.title,url:getPostUrl(p,baseUrl(env))}})}
  await env.DB.prepare('INSERT INTO daily_editorial_editions(date,automatic_json) VALUES(?,?) ON CONFLICT(date) DO UPDATE SET automatic_json=excluded.automatic_json').bind(edition.date,JSON.stringify(edition)).run()
  await env.CACHE.put(editionKey(edition.date),JSON.stringify(edition),{expirationTtl:172800})
  return c.json({success:true,date:edition.date,count:edition.items.length})
}

export const renderDailyInvite=()=>`<aside class="daily-invite"><span>Uma seleção para organizar seu dia</span><h2>O que importa no Brasil — e perto de você.</h2><p>Notícias, explicações e oportunidades em um só lugar. Comece pela edição nacional e escolha sua região quando quiser.</p><a href="/meu-dia">Conhecer o Meu dia <span aria-hidden="true">→</span></a></aside>`

function renderItem(item:DailyItem,index=0){
  const scope=item.scope==='BR'?'Brasil':BRAZIL_STATES[item.scope]
  return `<article class="daily-card daily-card--${item.section}" data-daily-item data-scope="${escapeAttr(item.scope)}" data-post-id="${item.post_id}" data-section="${item.section}" data-expires="${escapeAttr(item.expires_at||'')}">
    <div class="daily-card__meta"><span class="daily-card__scope">${escapeHtml(scope)}</span><span class="daily-card__number" aria-hidden="true">${String(index+1).padStart(2,'0')}</span><span data-daily-read hidden>Você já abriu</span><span data-daily-new hidden>Novo desde sua última visita</span></div>
    <h3><a href="${escapeAttr(item.url)}" data-daily-article>${escapeHtml(item.title)}</a></h3><p>${escapeHtml(item.summary)}</p>
    ${item.expires_at?`<p class="daily-card__deadline">Validade: ${escapeHtml(new Date(item.expires_at).toLocaleString('pt-BR',{timeZone:'America/Fortaleza',dateStyle:'short',timeStyle:'short'}))} (horário de Brasília)</p>`:''}
    <div class="daily-card__links"><a href="${escapeAttr(item.url)}" data-daily-article>Entender melhor <span aria-hidden="true">↗</span></a><a href="${escapeAttr(item.source_url)}" target="_blank" rel="noopener noreferrer">Fonte de referência <span aria-hidden="true">↗</span></a></div>
  </article>`
}

export function renderDailyBody(edition:DailyEdition|null,region='BR',now=new Date(),events:CulturalEvent[]=[],cultureFilters:{city?:string;category?:string;period?:string}={}){
  const items=(edition?.items||[]).filter(item=>!item.expires_at||Date.parse(item.expires_at)>now.getTime())
  const date=now.toLocaleDateString('pt-BR',{timeZone:'America/Fortaleza',weekday:'long',day:'numeric',month:'long'})
  const regional=items.filter(item=>item.scope!=='BR')
  const descriptions:Record<string,string>={essential:'Comece por aqui. Os assuntos que merecem sua atenção.',changes:'Entenda o efeito das notícias na sua vida.',opportunities:'Inscrições e datas para colocar no radar.',follow:'O contexto de agora. Os próximos passos depois.'}
  const numbers:Record<string,string>={essential:'01',changes:'03',opportunities:'04',follow:'05'}
  const block=(key:string,title:string,entries:DailyItem[])=>`<section id="daily-${key}" class="daily-section daily-section--${key}" data-daily-section="${key}" ${!items.length?'hidden':''}><div class="daily-section__heading"><span class="daily-section__index" aria-hidden="true">${numbers[key]}</span><div><p class="daily-kicker">${key==='essential'?'Seu ponto de partida':key==='changes'?'Informação que faz diferença':key==='opportunities'?'Olho no calendário':'Além da manchete'}</p><h2>${title}</h2><p>${descriptions[key]}</p></div><span class="daily-section__count" data-daily-section-count>${entries.length} ${entries.length===1?'leitura':'leituras'}</span></div><div class="daily-grid">${entries.map(renderItem).join('')}</div><p class="daily-empty" data-daily-empty ${entries.length?'hidden':''}>Nenhum item confirmado neste bloco por enquanto. Uma boa seleção também sabe quando não acrescentar.</p></section>`
  return `<div class="daily-page" data-daily-page data-edition-date="${dailyDate(now)}" data-edition-updated="${escapeAttr(edition?.updated_at||'')}" data-initial-region="${escapeAttr(region)}">
    <header class="daily-hero"><div class="daily-hero__top"><a href="/" class="daily-signature">Diário do Povo <span>/</span> uma edição para você</a><p>${escapeHtml(date)}</p></div><div class="daily-hero__main"><div><p class="daily-kicker">Uma pausa para entender o dia</p><h1>Meu dia<span aria-hidden="true">.</span></h1><p class="daily-deck">O que importa hoje no Brasil<br>— e perto de você.</p></div><div class="daily-hero__aside"><div class="daily-sun" aria-hidden="true"><span></span><i></i></div><p>Menos ruído.<br><strong>Mais contexto.</strong></p><span>Uma seleção para ler, entender<br>e seguir o seu dia.</span></div></div><div class="daily-hero__bottom"><div class="daily-hero__edition"><span class="daily-location-dot" aria-hidden="true"></span><span data-daily-label>Brasil${region==='BR'?'':' + '+escapeHtml(BRAZIL_STATES[region])}</span><a href="#daily-region-section">Escolher região <span aria-hidden="true">↗</span></a></div>${edition?`<span class="daily-updated">Atualizado às ${escapeHtml(new Date(edition.updated_at).toLocaleTimeString('pt-BR',{timeZone:'America/Fortaleza',hour:'2-digit',minute:'2-digit'}))} <span>· Brasília</span></span>`:'<span class="daily-updated">A edição de hoje está em preparação</span>'}</div></header>
    <nav class="daily-nav" aria-label="Explore a edição"><span>Na edição de hoje</span><a href="#daily-essential">O essencial <span>01</span></a><a href="#daily-culture">Agenda cultural <span>02</span></a><a href="#daily-changes">Sua rotina <span>03</span></a><a href="#daily-opportunities">Oportunidades <span>04</span></a><a href="#daily-follow">No radar <span>05</span></a></nav>
    ${!items.length?'<div class="daily-preparing"><h2>Estamos preparando sua seleção.</h2><p>Enquanto isso, acompanhe as reportagens mais recentes do Diário.</p><a href="/ultimas">Ver últimas notícias →</a></div>':''}
    ${block('essential',DAILY_SECTIONS.essential,items.filter(item=>item.scope==='BR'&&item.section==='essential'))}
    ${renderCultureAgenda(events,now,{...cultureFilters,state:region})}
    <section id="daily-region-section" class="daily-region"><div class="daily-region__intro"><span class="daily-region__icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/></svg></span><div><p class="daily-kicker">Do Brasil para perto de você</p><h2>Seu lugar também importa.</h2><p>Inclua o estado que você quer acompanhar.<br>A edição nacional continua com você.</p></div></div><form action="/meu-dia" method="get" data-daily-region-form><label for="daily-region">Sua região de interesse</label><div><select id="daily-region" name="estado"><option value="BR" ${region==='BR'?'selected':''}>Somente Brasil</option>${Object.entries(BRAZIL_STATES).map(([uf,name])=>`<option value="${uf}" ${region===uf?'selected':''}>${name}</option>`).join('')}</select><button type="submit">Aplicar <span aria-hidden="true">→</span></button></div></form><p class="daily-region__note" data-daily-preference-status role="status">Sem cadastro e sem localização automática. Sua escolha fica neste navegador.</p></section>
    <section class="daily-section daily-section--regional" data-daily-section="regional" ${region==='BR'?'hidden':''}><div class="daily-section__heading"><span class="daily-section__index" aria-hidden="true">↳</span><div><p class="daily-kicker">Perto de você</p><h2 data-daily-region-heading>Na sua região${region==='BR'?'':' · '+escapeHtml(BRAZIL_STATES[region])}</h2><p>Uma seleção para o estado que você acompanha.</p></div><span class="daily-section__count" data-daily-section-count>${regional.filter(item=>item.scope===region).length} leituras</span></div><div class="daily-grid">${regional.map((item,index)=>renderItem(item,index).replace('data-daily-item','data-daily-item '+(item.scope!==region?'hidden':''))).join('')}</div><p class="daily-empty" data-daily-empty ${regional.some(item=>item.scope===region)?'hidden':''}>Ainda não há uma seleção confirmada para este estado hoje. Aproveite a edição nacional; sua preferência pode ser alterada a qualquer momento.</p></section>
    ${(['changes','opportunities','follow'] as const).map(section=>block(section,DAILY_SECTIONS[section],items.filter(item=>item.scope==='BR'&&item.section===section))).join('')}
    <footer class="daily-finish" ${!items.length?'hidden':''}><span class="daily-finish__mark" aria-hidden="true">✓</span><p class="daily-kicker">Você chegou ao fim da edição de hoje</p><h2>Agora, siga o seu dia.<br><em>Com mais contexto.</em></h2><p>Uma seleção com começo, meio e fim. Volte para a próxima edição ou continue nos assuntos que despertaram sua curiosidade.</p><a href="/ultimas">Explorar últimas notícias <span aria-hidden="true">↗</span></a><a class="daily-finish__top" href="#conteudo">Voltar ao início ↑</a></footer>
  </div>`
}

export async function handleDailyPage(c:Context){
  const env=c.env as Env,date=dailyDate(),raw=c.req.query('estado')||'BR',region=Object.hasOwn(BRAZIL_STATES,raw)?raw:'BR'
  const edition=await getManagedEdition(env,date)
  const events=await getCulturalEvents(env)
  return c.html(renderEditorialLayout({title:'Meu dia | Diário do Povo',description:'Notícias, agenda cultural, prazos e oportunidades para organizar seu dia. Brasil e sua região, sem cadastro.',baseUrl:baseUrl(env),siteName:'Diário do Povo',canonicalUrl:baseUrl(env)+'/meu-dia',nonce:c.get('cspNonce')||'',navItems:[{label:'Meu dia',href:'/meu-dia',active:true},{label:'Agenda cultural',href:'/meu-dia#daily-culture'},{label:'Últimas notícias',href:'/ultimas'}],bodyHtml:renderDailyBody(edition,region,new Date(),events,{city:c.req.query('cidade'),category:c.req.query('categoria'),period:c.req.query('periodo')}),extraHeadHtml:`<style>${dailyCss}</style>`,extraScriptsHtml:cultureActionsScript+'<script type="module" src="/static/meu-dia.js?v=20261105-1"></script><script type="module" src="/static/culture-agenda.js?v=20261105-1"></script>'}))
}
