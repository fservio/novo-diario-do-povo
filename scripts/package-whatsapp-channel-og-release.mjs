import {readFile,writeFile,mkdir,cp,readdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {builtinModules} from 'node:module'
import {resolve} from 'node:path'
import {build} from 'vite'
const base='artifacts/whatsapp-channel-release',target='artifacts/whatsapp-channel-og-release'
const hash=b=>createHash('sha256').update(b).digest('hex')
const m=JSON.parse(await readFile(`${base}/release.json`,'utf8'))
let worker=await readFile(`${base}/site/_worker.js`,'utf8')
if(hash(worker)!==m.changed.find(f=>f.path==='_worker.js').sha256)throw Error('Base checksum mismatch')
const re=/renderWhatsAppLanding:\s*[\w$]+, renderWhatsAppUnsubscribe:/g
if([...worker.matchAll(re)].length!==1)throw Error('Ambiguous landing export')
worker=worker.replace(re,'renderWhatsAppLanding: __channelOgLanding, renderWhatsAppUnsubscribe:')
worker="import {renderWhatsAppLanding as __channelOgLanding} from '../../packages/core/web/whatsapp';\n"+worker
await mkdir(target,{recursive:true});await cp(`${base}/site`,`${target}/site`,{recursive:true,force:false,errorOnExist:true})
await writeFile(`${target}/worker-entry.js`,worker)
await build({configFile:false,publicDir:false,build:{outDir:`${target}/site`,emptyOutDir:false,target:'es2022',minify:'esbuild',lib:{entry:resolve(`${target}/worker-entry.js`),formats:['es'],fileName:()=> '_worker.js'},rollupOptions:{external:[...builtinModules,...builtinModules.map(m=>`node:${m}`),'cloudflare:sockets','__STATIC_CONTENT_MANIFEST']}}})
for(const file of ['whatsapp.css','whatsapp-channel-og-v1.jpg'])await cp(`public/static/${file}`,`${target}/site/static/${file}`)
async function walk(d,p=''){let r=[];for(const e of await readdir(d,{withFileTypes:true}))r.push(...(e.isDirectory()?await walk(`${d}/${e.name}`,p+e.name+'/'):[p+e.name]));return r}
const changed=[];for(const path of await walk(`${target}/site`)){const b=await readFile(`${target}/site/${path}`);let a;try{a=await readFile(`${base}/site/${path}`)}catch{}if(!a||!a.equals(b))changed.push({path,sha256:hash(b)})}
if(changed.length!==3||changed.some(f=>!['_worker.js','static/whatsapp.css','static/whatsapp-channel-og-v1.jpg'].includes(f.path)))throw Error('Unexpected changes')
await writeFile(`${target}/release.json`,JSON.stringify({baseDeployment:'a33dd807',changed,site:resolve(`${target}/site`)},null,2))
console.log(JSON.stringify({changed:changed.map(f=>f.path)}))
