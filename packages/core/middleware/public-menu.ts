import type {Context,Next} from 'hono'
import type {Env} from '../types'
import {getActiveCategories} from '../db/categories-cache'
import {getSetting} from '../db'
import {renderPublicMenu} from '../web/public-menu'
import {getGuideLinks} from '../db/evergreen'
import {renderGuideContext} from '../web/guides'
import consentScript from '../../../public/static/cookie-consent.js?raw'
import consentCss from '../../../public/static/cookie-consent.css?raw'
import {escapeAttr} from '../web/layout'

const consentBanner=`<section id="diario-cookie-banner" aria-labelledby="diario-cookie-title" hidden>
 <h2 id="diario-cookie-title">Suas escolhas de cookies</h2>
 <p>Usamos cookies necessários para o site funcionar. Se você permitir, também usamos cookies para medir a audiência e para publicidade.</p>
 <p><a href="/p/privacidade">Política de Privacidade</a></p>
 <div class="diario-cookie-actions">
  <button type="button" data-cookie-reject>Recusar opcionais</button>
  <button type="button" data-cookie-accept>Aceitar opcionais</button>
  <button type="button" data-cookie-customize>Personalizar</button>
 </div>
 <fieldset data-cookie-settings hidden><legend>Preferências de cookies</legend>
  <p>Necessários · sempre ativos</p>
  <label><input type="checkbox" name="cookie-analytics"> Medição de audiência com Google Analytics</label>
  <label><input type="checkbox" name="cookie-advertising"> Publicidade e personalização de anúncios</label>
  <button type="button" data-cookie-save>Salvar preferências</button>
 </fieldset>
</section>`

// All public page layouts use the same CMS taxonomy, independently of their local navigation.
export async function completePublicMenu(c:Context,next:Next){
 await next()
 const path=c.req.path
 if(c.res.status!==200||/^\/(admin|api|static|i|portal|conta)(\/|$)/.test(path)||!c.res.headers.get('content-type')?.includes('text/html'))return
 const env=c.env as Env
 const [categories,analyticsId]=await Promise.all([
  getActiveCategories(env),
  getSetting(env,'google_analytics_id','public').catch(()=>null)
 ])
 const modern=renderPublicMenu(categories,path),legacy=renderPublicMenu(categories,path,true)
 const article=path.match(/^\/(?:\d{4}\/\d{2}\/\d{2}|noticia)\/([^/]+)\/?$/)
 const related=article?renderGuideContext(await getGuideLinks(c.env as Env,article[1])):''
 const rewriter=new HTMLRewriter()
 const nonce=escapeAttr(c.get('cspNonce')||'')
 const analytics=typeof analyticsId==='string'&&/^G-[A-Z0-9]+$/i.test(analyticsId)
  ?`window.diarioConsent.analytics(${JSON.stringify(analyticsId)});`:''
 rewriter.on('head',{element(element){
  element.prepend(`<style>${consentCss}</style><script nonce="${nonce}">${consentScript}\n${analytics}</script>`,{html:true})
 }})
 .on('body',{element(element){
  element.append(consentBanner+'<div class="diario-cookie-footer"><button type="button" id="diario-cookie-preferences" hidden>Preferências de cookies</button></div>',{html:true})
 }})
 if(categories.length)rewriter.on('.ed-menu-drawer__list',{element(element){element.setInnerContent(modern,{html:true})}})
  .on('.mobile-menu-panel nav',{element(element){element.prepend(legacy,{html:true})}})
  .on('.mobile-menu-panel nav a.mobile-nav-link',{element(element){element.remove()}})
 rewriter.on('#articleBody',{element(element){if(related)element.prepend(related,{html:true})}})
 const response=rewriter.transform(c.res)
 response.headers.delete('Content-Length');response.headers.delete('ETag')
 c.res=response
}
