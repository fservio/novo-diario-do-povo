import type {Context} from 'hono'
import {getCookie,setCookie,deleteCookie} from 'hono/cookie'
import {z} from 'zod'
import type {Env} from '../types'
import {cultureEventSchema,CULTURE_CATEGORIES} from '../culture'
import {BRAZIL_STATES} from '../meu-dia'
import {localEventTimestamp} from '../culture-calendar'
import {cultureLocalDay} from '../../../public/static/culture-agenda.js'
import {randomHex,sha256Hex} from '../utils'
import {escapeAttr,escapeHtml} from './layout'
import {renderEditorialLayout} from './layout-editorial'
import cultureCss from '../../../public/static/culture-agenda.css?raw'
const COOKIE='culture_suggestion'
export function parseSuggestedEvent(body:Record<string,unknown>,slug='suggestion'){
 const value=(key:string)=>typeof body[key]==='string'?String(body[key]).trim():''
 return cultureEventSchema.parse({slug,title:value('title'),summary:value('summary'),category:value('category'),state:value('state'),city:value('city'),venue:value('venue'),address:value('address')||null,starts_on:value('starts_on'),ends_on:value('ends_on'),starts_at:localEventTimestamp(value('starts_on'),value('starts_time'),value('timezone')),ends_at:localEventTimestamp(value('ends_on'),value('ends_time'),value('timezone')),timezone:value('timezone'),price_type:value('price_type'),price_text:value('price_text')||null,source_url:value('source_url'),verified_at:new Date().toISOString(),image_media_id:null,status:'scheduled'})
}
export function renderSuggestedEventFields(values:Record<string,any>={}){
 const input=(name:string,label:string,type='text',required=true)=>`<label>${label}<input name="${name}" type="${type}" ${required?'required':''} value="${escapeAttr(String(values[name]||''))}" maxlength="${name==='title'?180:name==='source_url'?1500:240}"></label>`
 const select=(name:string,label:string,options:Record<string,string>,fallback:string)=>`<label>${label}<select name="${name}">${Object.entries(options).map(([key,text])=>`<option value="${key}" ${String(values[name]||fallback)===key?'selected':''}>${escapeHtml(text)}</option>`).join('')}</select></label>`
 const times={'America/Fortaleza':'Brasília / Fortaleza / Teresina (UTC−3)','America/Sao_Paulo':'São Paulo / Sul / Sudeste (Brasília)','America/Manaus':'Manaus (UTC−4)','America/Campo_Grande':'Campo Grande (UTC−4)','America/Cuiaba':'Cuiabá (UTC−4)','America/Porto_Velho':'Porto Velho (UTC−4)','America/Boa_Vista':'Boa Vista (UTC−4)','America/Rio_Branco':'Rio Branco (UTC−5)','America/Noronha':'Fernando de Noronha (UTC−2)'}
 return `<div class="culture-form__grid">${input('title','Nome do evento')}${select('category','Categoria',CULTURE_CATEGORIES,'music')}${select('state','Estado',BRAZIL_STATES,'PI')}${input('city','Cidade')}${input('venue','Local do evento')}${input('address','Endereço completo','text',false)}${input('starts_on','Data inicial','date')}${input('ends_on','Último dia','date')}${input('starts_time','Horário inicial (se informado)','time',false)}${input('ends_time','Horário final (se informado)','time',false)}${select('timezone','Fuso dos horários informados',times,'America/Fortaleza')}${select('price_type','Ingresso',{unknown:'Preço não informado',free:'Gratuito',paid:'Pago'},'unknown')}${input('price_text','Valor ou condição de acesso (se pago)','text',false)}${input('source_url','Link oficial da programação','url')}<label class="culture-form__wide">Descrição do evento<textarea name="summary" required minlength="20" maxlength="600" rows="5">${escapeHtml(String(values.summary||''))}</textarea></label></div>`
}
export function renderCultureSuggestionForm(values:Record<string,any>={},token='',error=''){
 return `<div class="culture-form"><a href="/meu-dia#daily-culture">← Voltar à agenda</a><p class="daily-kicker">Para produtores, espaços e organizadores</p><h1 class="culture-form__title"><span>Seu evento pode fazer</span><span>parte do nosso dia.</span></h1><p>Envie a programação para a redação. Todas as sugestões passam por conferência; o envio não garante publicação.</p>${error?`<p class="culture-form__error" role="alert">${escapeHtml(error)}</p>`:''}<form method="post" action="/agenda/sugerir"><input type="hidden" name="token" value="${escapeAttr(token)}"><div class="culture-form__trap" aria-hidden="true"><label>Deixe este campo vazio<input name="website" tabindex="-1" autocomplete="off"></label></div><h2>Sobre a programação</h2>${renderSuggestedEventFields(values)}<p class="culture-form__help">Não sabe o horário ou o preço? Deixe o horário vazio e selecione “Preço não informado”. Não indique gratuidade sem confirmação.</p><h2>Contato do organizador</h2><div class="culture-form__grid"><label>Nome ou organização<input name="organizer_name" required maxlength="120" value="${escapeAttr(String(values.organizer_name||''))}" autocomplete="organization"></label><label>E-mail de contato<input type="email" name="organizer_email" required maxlength="254" value="${escapeAttr(String(values.organizer_email||''))}" autocomplete="email"></label></div><p class="culture-form__help">O contato fica restrito à redação e não aparece na agenda pública.</p><label class="culture-form__consent"><input type="checkbox" name="consent" value="yes" required ${values.consent==='yes'?'checked':''}>Autorizo o uso destes dados para analisar a sugestão e entrar em contato sobre este evento. Li a <a href="/p/privacidade">Política de Privacidade</a>.</label><button type="submit">Enviar para conferência →</button></form></div>`
}
function page(c:Context,body:string){const env=c.env as Env,base=(env.PUBLIC_BASE_URL||'https://diario.dopovo.com.br').replace(/\/$/,'');return renderEditorialLayout({title:'Sugerir evento | Diário do Povo',description:'Envie uma programação cultural para análise da redação.',bodyHtml:body,siteName:'Diário do Povo',baseUrl:base,canonicalUrl:base+'/agenda/sugerir',nonce:c.get('cspNonce')||'',navItems:[{label:'Agenda cultural',href:'/meu-dia#daily-culture'}],extraHeadHtml:`<meta name="robots" content="noindex,follow"><style>${cultureCss}</style>`})}
function issueToken(c:Context){const token=randomHex(24);setCookie(c,COOKIE,token,{httpOnly:true,secure:new URL(c.req.url).protocol==='https:',sameSite:'Strict',path:'/agenda/sugerir',maxAge:3600});return token}
export async function handleCultureSuggestionPage(c:Context){
 c.header('Cache-Control','private, no-store')
 if(c.req.query('enviado')==='1')return c.html(page(c,'<div class="culture-form"><p class="daily-kicker">Sugestão recebida</p><h1>Obrigado por compartilhar<br>seu próximo programa.</h1><p>A redação vai conferir a programação. Se precisarmos de algum detalhe, usaremos o contato informado. A sugestão ainda não está publicada.</p><a href="/meu-dia#daily-culture">Voltar à agenda cultural →</a></div>'))
 return c.html(page(c,renderCultureSuggestionForm({city:'Teresina'},issueToken(c))))
}
export async function handleCultureSuggestionSubmit(c:Context){
 const env=c.env as Env,origin=c.req.header('origin')
 c.header('Cache-Control','private, no-store')
 if(origin&&origin!==new URL(c.req.url).origin)return c.text('Origem inválida.',403)
 if(!(c.req.header('content-type')||'').startsWith('application/x-www-form-urlencoded'))return c.text('Formato inválido.',415)
 const raw=await c.req.text();if(raw.length>24000)return c.text('Formulário muito grande.',413)
 const body=Object.fromEntries(new URLSearchParams(raw)),cookie=getCookie(c,COOKIE)
 if(!cookie||!/^[a-f0-9]{48}$/.test(cookie)||body.token!==cookie)return c.text('Formulário expirado. Abra a página de sugestão e tente novamente.',403)
 if(body.website)return c.redirect('/agenda/sugerir?enviado=1',303)
 let event:ReturnType<typeof parseSuggestedEvent>,contact:{organizer_name?:string;organizer_email?:string}
 try{
  contact=z.object({organizer_name:z.string().trim().min(2).max(120),organizer_email:z.string().trim().email().max(254)}).parse(body)
  if(body.consent!=='yes')throw Error('Confirme a autorização para analisar a sugestão.')
  event=parseSuggestedEvent(body)
  if(event.ends_on<cultureLocalDay(Date.now(),event.timezone)||(event.ends_at&&Date.parse(event.ends_at)<=Date.now()))throw Error('O evento já terminou. Envie uma programação atual ou futura.')
 }catch(error){const message=error instanceof z.ZodError?'Confira os campos, as datas e o link oficial.':error instanceof Error?error.message:'Confira os campos.';return c.html(page(c,renderCultureSuggestionForm(body,issueToken(c),message)),400)}
 const now=new Date(),fingerprint=await sha256Hex([contact.organizer_email.toLowerCase(),event.source_url,event.starts_on,event.title.toLowerCase()].join('|'))
 const duplicate=await env.DB.prepare('SELECT id FROM cultural_suggestions WHERE fingerprint=?').bind(fingerprint).first()
 if(!duplicate){
  const bucket=await sha256Hex((env.JWT_SECRET||'')+':culture:'+String(c.req.header('CF-Connecting-IP')||'unknown')+':'+now.toISOString().slice(0,13))
  await env.DB.prepare('DELETE FROM cultural_suggestion_limits WHERE expires_at<?').bind(now.toISOString()).run()
  const slot=await env.DB.prepare('INSERT INTO cultural_suggestion_limits(bucket,count,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 WHERE count<5 RETURNING count').bind(bucket,new Date(now.getTime()+3600000).toISOString()).first()
  if(!slot)return c.html(page(c,renderCultureSuggestionForm(body,issueToken(c),'Limite de sugestões atingido. Tente novamente mais tarde.')),429)
  const {slug,verified_at,image_media_id,status,...eventData}=event
  await env.DB.prepare('INSERT OR IGNORE INTO cultural_suggestions(fingerprint,organizer_name,organizer_email,event_json,created_at) VALUES(?,?,?,?,?)').bind(fingerprint,contact.organizer_name,contact.organizer_email.toLowerCase(),JSON.stringify(eventData),now.toISOString()).run()
 }
 deleteCookie(c,COOKIE,{path:'/agenda/sugerir'})
 return c.redirect('/agenda/sugerir?enviado=1',303)
}
