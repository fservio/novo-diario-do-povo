import { readFile, writeFile, cp } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { builtinModules } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'vite'
const base='artifacts/related-articles-production',target='artifacts/reading-cards-production'
const metadata=JSON.parse(await readFile(`${base}/release.json`,'utf8'))
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
let worker=await readFile(`${base}/site/_worker.js`,'utf8')
if(hash(worker)!==metadata.workerSha256)throw Error('Production base checksum mismatch')
function once(before,after){if(worker.split(before).length!==2)throw Error('Ambiguous patch: '+before);worker=worker.replace(before,after)}
const start=worker.indexOf('async function OE(t, e, a, r) {'),end=worker.indexOf('async function CE(',start)
if(start<0||end<0)throw Error('Related query insertion point missing')
worker=worker.slice(0,start)+'async function OE(t,e,a,r){return __readingRelated(t,e,a,r);}\n'+worker.slice(end)
once('relatedPosts: o, mostRead: d, isBlocked: c','relatedPosts: __allRelated, mostRead: d, isBlocked: c')
once('googleAnalyticsId: u } = a, f = await Se(t.env, "site.public_theme")', 'googleAnalyticsId: u } = a, __readingPost = !c && e.template !== "liveblog" ? __allRelated.find(item=>item.reading_path === "next" || item.reading_path === "origin") : undefined, __readingCard = __readingPost ? __renderReading(__readingPost,i) : "", o = __readingPost ? __allRelated.filter(item=>item.id !== __readingPost.id) : __allRelated, f = await Se(t.env, "site.public_theme")')
const expression='e.content_markdown && e.content_markdown.length > 0 || N6(T) ? Ns(T) : Dr(T)'
once('p = '+expression+', A = zg(p)', 'p = __readingClean(('+expression+'),__readingPost,i), A = zg(p)')
once('${c && m ? D6(m) : ""}', '${__readingCard}\n            ${c && m ? D6(m) : ""}')
const legacy='${aa ? Pu(y, e.is_live === 1, xt) : R6(xt, c, g, e.author_type, m)}'
once(legacy,legacy+'\n      ${__readingCard ? `<div class="container">${__readingCard}</div>` : ""}')
worker="import { findRelatedPosts as __readingRelated } from '../../packages/core/db/article';\nimport { renderReadingPath as __renderReading,removeLegacyReadingLink as __removeReading } from '../../packages/core/web/components/reading-path';\nfunction __readingClean(html,post,base){return post?.reading_path === 'origin' ? __removeReading(html,X(post,base)) : html;}\n"+worker
await cp(`${base}/site`,`${target}/site`,{recursive:true,errorOnExist:true,force:false})
await writeFile(`${target}/worker-entry.js`,worker)
await build({configFile:false,publicDir:false,build:{outDir:`${target}/site`,emptyOutDir:false,target:'es2022',minify:'esbuild',lib:{entry:resolve(`${target}/worker-entry.js`),formats:['es'],fileName:()=> '_worker.js'},rollupOptions:{external:[...builtinModules,...builtinModules.map(name=>`node:${name}`),'cloudflare:sockets','__STATIC_CONTENT_MANIFEST']}}})
await writeFile(`${target}/release.json`,JSON.stringify({baseDeployment:'8e3b132c',baseWorkerSha256:metadata.workerSha256,workerSha256:hash(await readFile(`${target}/site/_worker.js`)),site:resolve(`${target}/site`)},null,2))
