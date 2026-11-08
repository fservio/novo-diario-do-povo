import { readFile, writeFile, cp } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { builtinModules } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'vite'
const base='artifacts/reading-cards-production',target='artifacts/reader-tools-production'
const metadata=JSON.parse(await readFile(`${base}/release.json`,'utf8'))
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
let worker=await readFile(`${base}/site/_worker.js`,'utf8')
if(hash(worker)!==metadata.workerSha256)throw Error('Production base checksum mismatch')
const before='p = H6(e, i, s), A = W6(N), O = r || e.content_markdown'
if(worker.split(before).length!==2)throw Error('Reader tools insertion point ambiguous')
worker=worker.replace(before,'p = H6(e, i, s) + __renderReaderTools(e,I,!c && e.template !== "liveblog"), A = W6(N) + __readerScript, O = r || e.content_markdown')
worker="import { renderReaderTools as __renderReaderTools,readerToolsScript as __readerScript } from '../../packages/core/web/components/reader-tools';\n"+worker
await cp(`${base}/site`,`${target}/site`,{recursive:true,errorOnExist:true,force:false})
await writeFile(`${target}/worker-entry.js`,worker)
await build({configFile:false,publicDir:false,build:{outDir:`${target}/site`,emptyOutDir:false,target:'es2022',minify:'esbuild',lib:{entry:resolve(`${target}/worker-entry.js`),formats:['es'],fileName:()=> '_worker.js'},rollupOptions:{external:[...builtinModules,...builtinModules.map(name=>`node:${name}`),'cloudflare:sockets','__STATIC_CONTENT_MANIFEST']}}})
for(const prefix of ['static','static/static'])await cp('public/static/reader-tools.js',`${target}/site/${prefix}/reader-tools.js`)
await writeFile(`${target}/release.json`,JSON.stringify({baseDeployment:'3ed3d867',baseWorkerSha256:metadata.workerSha256,workerSha256:hash(await readFile(`${target}/site/_worker.js`)),scriptSha256:hash(await readFile(`${target}/site/static/reader-tools.js`)),site:resolve(`${target}/site`)},null,2))
