import { readFile, writeFile, mkdir, cp, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { builtinModules } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'vite'
const base='artifacts/instagram-direct-release-v6', target='artifacts/whatsapp-channel-release'
const hash=b=>createHash('sha256').update(b).digest('hex')
const metadata=JSON.parse(await readFile(`${base}/release.json`,'utf8'))
let worker=await readFile(`${base}/site/_worker.js`,'utf8')
if(hash(worker)!==metadata.changed.find(f=>f.path==='_worker.js').sha256)throw Error('Base checksum mismatch')
await mkdir(target,{recursive:true})
await cp(`${base}/site`,`${target}/site`,{recursive:true,force:false,errorOnExist:true})
const edits=[]
function replaceOne(from,to){const count=worker.split(from).length-1;if(count!==1)throw Error(`Expected 1 match, got ${count}: ${from}`);worker=worker.replace(from,to);edits.push(from)}
const namespace=worker.match(/renderWhatsAppLanding:\s*([\w$]+), renderWhatsAppUnsubscribe:/g)
if(namespace?.length!==1)throw Error('Landing namespace ambiguous')
replaceOne(namespace[0], 'renderWhatsAppLanding: __channelLanding, renderWhatsAppUnsubscribe:')
replaceOne('<div class="ed-article__content">','<div class="ed-article__content">\n          ${__channelCta()}')
replaceOne('${US(t, A, N)}','${US(t, A, N)}\n      <div class="container">${__channelCta()}</div>')
replaceOne('${t.seo_noindex ? \'<meta name="robots" content="noindex, follow">\' : ""}', '<link rel="stylesheet" href="/static/whatsapp-channel.css?v=20261104-1">\n    ${t.seo_noindex ? \'<meta name="robots" content="noindex, follow">\' : ""}')
worker="import { renderWhatsAppLanding as __channelLanding } from '../../packages/core/web/whatsapp';\nimport { renderWhatsAppChannelCta as __channelCta } from '../../packages/core/web/components/whatsapp-channel';\n"+worker
await writeFile(`${target}/worker-entry.js`,worker)
await build({configFile:false,publicDir:false,build:{outDir:`${target}/site`,emptyOutDir:false,target:'es2022',minify:'esbuild',lib:{entry:resolve(`${target}/worker-entry.js`),formats:['es'],fileName:()=> '_worker.js'},rollupOptions:{external:[...builtinModules,...builtinModules.map(m=>`node:${m}`),'cloudflare:sockets','__STATIC_CONTENT_MANIFEST']}}})
await cp('public/static/whatsapp.css',`${target}/site/static/whatsapp.css`)
await cp('public/static/whatsapp-channel.css',`${target}/site/static/whatsapp-channel.css`)
async function walk(dir,prefix=''){const files=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=prefix+e.name;if(e.isDirectory())files.push(...await walk(`${dir}/${e.name}`,p+'/'));else files.push(p)}return files}
const changed=[]
for(const path of await walk(`${target}/site`)){const bytes=await readFile(`${target}/site/${path}`);let original;try{original=await readFile(`${base}/site/${path}`)}catch{}if(!original||!bytes.equals(original))changed.push({path,sha256:hash(bytes)})}
const allowed=['_worker.js','static/whatsapp.css','static/whatsapp-channel.css']
if(changed.some(f=>!allowed.includes(f.path))||changed.length!==3)throw Error('Unexpected changed files: '+JSON.stringify(changed))
await writeFile(`${target}/release.json`,JSON.stringify({baseDeployment:'46470cba-3400-40a5-837e-22bb141a56b6',baseWorkerSha256:metadata.changed.find(f=>f.path==='_worker.js').sha256,changed,edits,site:resolve(`${target}/site`)},null,2))
console.log(JSON.stringify({site:resolve(`${target}/site`),changed:changed.map(f=>f.path)}))
