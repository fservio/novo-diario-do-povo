import type {Context,Next} from 'hono'
import type {Env} from '../types'
import {getActiveCategories} from '../db/categories-cache'
import {renderPublicMenu} from '../web/public-menu'
import {getGuideLinks} from '../db/evergreen'
import {renderGuideContext} from '../web/guides'

// All public page layouts use the same CMS taxonomy, independently of their local navigation.
export async function completePublicMenu(c:Context,next:Next){
 await next()
 const path=c.req.path
 if(c.res.status!==200||/^\/(admin|api|static|i|portal|conta)(\/|$)/.test(path)||!c.res.headers.get('content-type')?.includes('text/html'))return
 const categories=await getActiveCategories(c.env as Env)
 const modern=renderPublicMenu(categories,path),legacy=renderPublicMenu(categories,path,true)
 const article=path.match(/^\/(?:\d{4}\/\d{2}\/\d{2}|noticia)\/([^/]+)\/?$/)
 const related=article?renderGuideContext(await getGuideLinks(c.env as Env,article[1])):''
 const rewriter=new HTMLRewriter()
 if(categories.length)rewriter.on('.ed-menu-drawer__list',{element(element){element.setInnerContent(modern,{html:true})}})
  .on('.mobile-menu-panel nav',{element(element){element.prepend(legacy,{html:true})}})
  .on('.mobile-menu-panel nav a.mobile-nav-link',{element(element){element.remove()}})
 rewriter.on('#articleBody',{element(element){if(related)element.prepend(related,{html:true})}})
 const response=rewriter.transform(c.res)
 response.headers.delete('Content-Length');response.headers.delete('ETag')
 c.res=response
}
