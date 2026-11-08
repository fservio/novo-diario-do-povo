import { readFile, writeFile, cp } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { builtinModules } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'vite'

const base='artifacts/generate-posts-production', target='artifacts/instagram-ranking-production'
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
const metadata=JSON.parse(await readFile(`${base}/release.json`,'utf8'))
let worker=await readFile(`${base}/site/_worker.js`,'utf8')
if(hash(worker)!==metadata.workerSha256)throw Error('Production base checksum mismatch')
function once(before,after){if(worker.split(before).length!==2)throw Error('Ambiguous patch: '+before);worker=worker.replace(before,after)}
once('relatedPosts: o, mostRead: [], isBlocked:', 'relatedPosts: o, mostRead: await __instagramRanking(t.env), isBlocked:')
const start=worker.indexOf('        <aside class="ed-article__rail" aria-label="Mais lidas">')
if(start<0)throw Error('Missing article rail')
const end=worker.indexOf('        </aside>',start)+'        </aside>'.length
const rail=worker.slice(start,end).replace('aria-label="Mais lidas"','aria-label="Mais vistas no Instagram"').replace('<h2>Mais lidas</h2>','<h2>Mais vistas no Instagram</h2><p>Publicações dos últimos 30 dias, por visualizações no Instagram.</p>')
once(worker.slice(start,end),'${d.length ? `'+rail+'` : ""}')
once('>Mais Lidas</h3>','>Mais vistas no Instagram</h3><p>Publicações dos últimos 30 dias, por visualizações no Instagram.</p>')
worker="import { getInstagramRanking as __instagramRanking } from '../../packages/core/instagram/ranking';\n"+worker
await cp(`${base}/site`,`${target}/site`,{recursive:true,errorOnExist:true,force:false})
await writeFile(`${target}/worker-entry.js`,worker)
await build({configFile:false,publicDir:false,build:{outDir:`${target}/site`,emptyOutDir:false,target:'es2022',minify:'esbuild',lib:{entry:resolve(`${target}/worker-entry.js`),formats:['es'],fileName:()=> '_worker.js'},rollupOptions:{external:[...builtinModules,...builtinModules.map(name=>`node:${name}`),'cloudflare:sockets','__STATIC_CONTENT_MANIFEST']}}})
await writeFile(`${target}/release.json`,JSON.stringify({baseDeployment:'14a9b7a3',baseWorkerSha256:metadata.workerSha256,workerSha256:hash(await readFile(`${target}/site/_worker.js`)),site:resolve(`${target}/site`)},null,2))
const ranking=await readFile('packages/core/instagram/ranking.ts','utf8')
const query=ranking.match(/env\.DB\.prepare\(`([\s\S]*?)`\)/)[1]
const now=new Date(),since=new Date(now.getTime()-30*86400000)
const dates=[now,since,now]
await writeFile(`${target}/preflight.sql`,query.replace(/\?/g,()=>`'${dates.shift().toISOString()}'`))
