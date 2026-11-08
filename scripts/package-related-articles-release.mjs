import { readFile, writeFile, cp } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { builtinModules } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'vite'
const base='artifacts/instagram-ranking-production',target='artifacts/related-articles-production'
const metadata=JSON.parse(await readFile(`${base}/release.json`,'utf8'))
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
let worker=await readFile(`${base}/site/_worker.js`,'utf8')
if(hash(worker)!==metadata.workerSha256)throw Error('Production base checksum mismatch')
const start=worker.indexOf('async function T6(t, e, a, r) {'),end=worker.indexOf('async function Hg(',start)
if(start<0||end<0)throw Error('Related query insertion point missing')
worker=worker.slice(0,start)+'async function T6(t,e,a,r){return __relatedFind(t,e,a,r);}\n'+worker.slice(end)
const marker='D.patch("/api/n8n/posts/:id", async (t) => {'
if(worker.split(marker).length!==2)throw Error('Route insertion point ambiguous')
worker=worker.replace(marker,'D.post("/api/n8n/posts/:id/related",t=>__relatedLink(t));\n'+marker)
worker="import { findRelatedPosts as __relatedFind } from '../../packages/core/db/article';\nimport { handleN8nRelatedArticle as __relatedLink } from '../../packages/core/web/n8n-related';\n"+worker
await cp(`${base}/site`,`${target}/site`,{recursive:true,errorOnExist:true,force:false})
await writeFile(`${target}/worker-entry.js`,worker)
await build({configFile:false,publicDir:false,build:{outDir:`${target}/site`,emptyOutDir:false,target:'es2022',minify:'esbuild',lib:{entry:resolve(`${target}/worker-entry.js`),formats:['es'],fileName:()=> '_worker.js'},rollupOptions:{external:[...builtinModules,...builtinModules.map(name=>`node:${name}`),'cloudflare:sockets','__STATIC_CONTENT_MANIFEST']}}})
await writeFile(`${target}/release.json`,JSON.stringify({baseDeployment:'839c8379',baseWorkerSha256:metadata.workerSha256,workerSha256:hash(await readFile(`${target}/site/_worker.js`)),site:resolve(`${target}/site`)},null,2))
