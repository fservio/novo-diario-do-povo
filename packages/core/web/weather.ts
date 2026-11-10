import type {Context} from 'hono'
import type {Env} from '../types'
import {escapeHtml as esc} from './layout'
import {renderEditorialLayout} from './layout-editorial'
import {findActiveSlotsByTemplate,generateAdsLoaderScript,renderAdSlot} from '../ads'
import {renderEditorialAd} from './components/editorial-ad'
import {readWeather,refreshWeather,weatherCities,weatherCondition,weatherDate,weatherSource,weatherEditionKey} from '../weather'
import {getPostUrl} from '../utils/post'
import css from '../../../public/static/weather.css?raw'

const dateLabel=(date:string)=>new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC',day:'2-digit',month:'short'}).format(new Date(date+'T12:00:00Z'))
const icon=(code:string)=>['cl','ps'].includes(code)?'☀':code==='t'?'ϟ':
 ['c','ch','pc','pp','ci','pm','pt','ct','cv','cn','cm'].includes(code)?'☂':'☁'
const cityLink=(slug:string)=>'/tempo/'+slug

export async function handleWeatherPage(c:Context){
 const env=c.env as Env
 const slug=c.req.param('city')
 const selected=c.req.query('cidade')
 if(!slug&&selected&&weatherCities.some(city=>city.slug===selected))return c.redirect(cityLink(selected),302)
 const city=weatherCities.find(city=>city.slug===(slug||'teresina-pi'))
 if(!city)return c.notFound()
 const nonce=c.get('cspNonce')||''
 const today=weatherDate()
 const [bulletin,slots,coverage]=await Promise.all([
  readWeather(env,city).catch(()=>null),
  findActiveSlotsByTemplate(env,'home').catch(()=>[]),
  env.DB?env.DB.prepare(`SELECT title,slug,published_at FROM posts WHERE original_link IN (?,?)
   AND status='published' AND published_at<=? ORDER BY published_at DESC LIMIT 2`)
   .bind(weatherEditionKey(city.slug,today),weatherEditionKey('estado-'+city.uf.toLowerCase(),today),new Date().toISOString())
   .all<{title:string;slug:string;published_at:string}>().then(result=>result.results).catch(()=>[]):[]
 ])
 const topSlot=slots.find(item=>item.name==='home_top_leaderboard')
 const infeedSlot=slots.find(item=>item.name==='home_infeed_1')
 const adsScript=topSlot||infeedSlot?await generateAdsLoaderScript(env,nonce).catch(()=>''):''
 const ad=(slot:typeof topSlot)=>slot&&adsScript.startsWith('<script')?renderEditorialAd(renderAdSlot({
  slot,page:{template:'home',path:c.req.path,referrer:c.req.header('referer')||'',slug:'tempo'},
  user:{isSubscriber:false,isLoggedIn:false}
 })):''
 const topAd=ad(topSlot),infeedAd=ad(infeedSlot)
 const days=bulletin?.days.filter(day=>day.date>=today)||[]
 const current=days.find(day=>day.date===today)
 const groups=[...new Set(weatherCities.map(item=>item.uf))]
 const chooser=groups.map(uf=>`<optgroup label="${uf}">${weatherCities.filter(item=>item.uf===uf).map(item=>
  `<option value="${item.slug}"${item.slug===city.slug?' selected':''}${!item.cptec?' disabled':''}>${esc(item.name)} · ${item.uf}${item.cptec?'':' · em validação'}</option>`).join('')}</optgroup>`).join('')
 const min=days.length?Math.min(...days.map(day=>day.min)):0
 const max=days.length?Math.max(...days.map(day=>day.max)):1
 const scale=(value:number)=>Math.round((value-min)/Math.max(1,max-min)*100)
 const title='Previsão do tempo em '+city.name+' – '+city.uf
 const body=`${topAd}<div class="weather-page">
  <header class="weather-intro">
   <div><p class="weather-kicker">Diário do Povo · Serviço</p><h1>${esc(slug?title:'Previsão do tempo')}</h1>
   <p>Veja o que esperar do tempo na sua cidade e planeje os próximos dias.</p></div>
   <form class="weather-picker" action="/tempo" method="get"><label for="weather-city">Cidade e estado</label>
   <div><select id="weather-city" name="cidade">${chooser}</select><button type="submit">Ver previsão</button></div></form>
  </header>
  <section class="weather-hero" aria-labelledby="weather-today">
   <div><p class="weather-kicker">${esc(city.name)} · ${city.uf}</p><h2 id="weather-today">Hoje · ${dateLabel(today)}</h2>
   ${current?`<p class="weather-condition"><span aria-hidden="true">${icon(current.condition)}</span>${esc(weatherCondition(current.condition))}</p>`:'<p>Previsão de hoje temporariamente indisponível.</p>'}</div>
   ${current?`<dl class="weather-temperature"><div><dt>Mínima</dt><dd>${current.min}°</dd></div><div><dt>Máxima</dt><dd>${current.max}°</dd></div></dl>`:''}
   <p class="weather-source"><a href="${weatherSource}">Fonte: CPTEC/INPE</a>${bulletin&&days.length?' · Boletim de '+dateLabel(bulletin.updated):''}</p>
  </section>
  ${days.some(day=>day.date>today)?`<section class="weather-next" aria-labelledby="weather-next"><h2 id="weather-next">Próximos dias</h2>
   <div class="weather-grid">${days.filter(day=>day.date>today).map(day=>`<article class="weather-day">
    <h3><time datetime="${day.date}">${dateLabel(day.date)}</time></h3><p><span aria-hidden="true">${icon(day.condition)}</span> ${esc(weatherCondition(day.condition))}</p>
    <div class="weather-range" aria-hidden="true"><span style="left:${scale(day.min)}%;width:${scale(day.max)-scale(day.min)}%"></span></div>
    <p><strong>${day.min} °C</strong> mínima <strong>${day.max} °C</strong> máxima</p>
   </article>`).join('')}</div></section>`:''}
  ${infeedAd}
  ${coverage.length?`<section class="weather-capitals" aria-labelledby="weather-coverage"><h2 id="weather-coverage">Na cobertura do Diário</h2>
   <ul>${coverage.map(post=>`<li><a href="${esc(getPostUrl(post))}">${esc(post.title)}</a></li>`).join('')}</ul>
  </section>`:''}
  <section class="weather-capitals" aria-labelledby="weather-capitals"><h2 id="weather-capitals">Capitais brasileiras</h2>
   <ul>${weatherCities.filter(city=>city.capital&&city.cptec).map(city=>`<li><a href="${cityLink(city.slug)}">${esc(city.name)} · ${city.uf}</a></li>`).join('')}</ul>
  </section>
 </div>`
 const base=(env.PUBLIC_BASE_URL||'https://diario.dopovo.com.br').replace(/\/$/,'')
 c.header('Cache-Control','public, max-age=120, must-revalidate')
 return c.html(renderEditorialLayout({title:(slug?title:'Previsão do tempo no Brasil')+' | Diário do Povo',
  description:'Previsão por cidade com mínima, máxima e condições do tempo do CPTEC/INPE.',baseUrl:base,siteName:'Diário do Povo',
  canonicalUrl:base+(slug?cityLink(city.slug):'/tempo'),nonce,
  navItems:[{label:'Clima',href:'/tempo',active:true},{label:'Meu Dia',href:'/meu-dia'}],
  bodyHtml:body,extraHeadHtml:`<style>${css}</style>`,extraScriptsHtml:topAd||infeedAd?adsScript:''}))
}

export async function handleWeatherAutomation(c:Context){
 const env=c.env as Env
 const operation=c.req.param('operation')
 c.header('Cache-Control','private, no-store')
 if(operation==='catalog')return c.json({cities:weatherCities.filter(city=>city.cptec).map(({slug,capital,uf})=>({slug,capital,uf}))})
 if(operation!=='refresh'&&operation!=='brief')return c.notFound()
 const body=await c.req.json().catch(()=>null)
 const slug=body?.slug
 const city=weatherCities.find(city=>city.slug===slug&&city.cptec)
 if(!city)return c.json({success:false,error:'Localidade não cadastrada.'},400)
 try{
  const bulletin=operation==='refresh'?await refreshWeather(env,city):await readWeather(env,city)
  const day=weatherDate(),forecast=bulletin?.days.find(item=>item.date===day)
  return c.json({success:true,city:{name:city.name,uf:city.uf,slug:city.slug,capital:city.capital},
   forecast:forecast?{...forecast,description:weatherCondition(forecast.condition),updated:bulletin?.updated,
    source:weatherSource,localPage:cityLink(city.slug)}:null})
 }catch{
  return c.json({success:false,error:'Boletim do CPTEC temporariamente indisponível.'},502)
 }
}
