import { readFile,writeFile,cp } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { builtinModules } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'vite'
const base='artifacts/reader-tools-production',target='artifacts/reader-toolbar-production'
const metadata=JSON.parse(await readFile(`${base}/release.json`,'utf8'))
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
let worker=await readFile(`${base}/site/_worker.js`,'utf8')
if(hash(worker)!==metadata.workerSha256)throw Error('Production base checksum mismatch')
function once(before,after){if(worker.split(before).length!==2)throw Error('Ambiguous patch: '+before);worker=worker.replace(before,after)}
once('p = G6(e, i, s) + PE(e, I, !c && e.template !== "liveblog"), A = J6(N) + LE','p = G6(e, i, s), __toolbar = __newToolbar(e,I,!c && e.template !== "liveblog"), A = J6(N) + __newReaderScript')
once('${iy()}\n          ${O ?', '${iy()}\n          ${__toolbar}\n          ${O ?')
once('<!-- Content -->\n      ${O ?', '<!-- Content -->\n      <div class="container">${__toolbar}</div>\n      ${O ?')
worker="import {renderReaderTools as __newToolbar,readerToolsScript as __newReaderScript} from '../../packages/core/web/components/reader-tools';\n"+worker
await cp(`${base}/site`,`${target}/site`,{recursive:true,errorOnExist:true,force:false})
await writeFile(`${target}/worker-entry.js`,worker)
await build({configFile:false,publicDir:false,build:{outDir:`${target}/site`,emptyOutDir:false,target:'es2022',minify:'esbuild',lib:{entry:resolve(`${target}/worker-entry.js`),formats:['es'],fileName:()=> '_worker.js'},rollupOptions:{external:[...builtinModules,...builtinModules.map(name=>`node:${name}`),'cloudflare:sockets','__STATIC_CONTENT_MANIFEST']}}})
for(const prefix of ['static','static/static'])await cp('public/static/reader-tools.js',`${target}/site/${prefix}/reader-tools.js`)
await writeFile(`${target}/release.json`,JSON.stringify({baseDeployment:'58425774',baseWorkerSha256:metadata.workerSha256,workerSha256:hash(await readFile(`${target}/site/_worker.js`)),site:resolve(`${target}/site`)},null,2))
