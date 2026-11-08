import {readFile,writeFile,mkdir,cp,readdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {builtinModules} from 'node:module'
import {resolve} from 'node:path'
import {build} from 'vite'
const base='artifacts/agent-discovery-release',target=process.argv[2] || 'artifacts/instagram-audience-production'
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
const metadata=JSON.parse(await readFile(`${base}/release.json`,'utf8'))
let worker=await readFile(`${base}/site/_worker.js`,'utf8')
if(hash(worker)!==metadata.workerSha256)throw Error('Production base checksum mismatch')
await mkdir(target,{recursive:true});await cp(`${base}/site`,`${target}/site`,{recursive:true,force:false,errorOnExist:true})
await writeFile(`${target}/engagement-entry.ts`,[
  "export * from '../../packages/core/admin/instagram'",
  "export * from '../../packages/core/admin/instagram-audience'",
  "export * from '../../packages/core/admin/instagram-campaigns'",
  "export * from '../../packages/core/instagram/direct'",
  "export { handleInstagramN8nCallback } from '../../packages/core/web/instagram'",
  "export { renderIntegrationsPage } from '../../packages/core/admin/integrations'",
  "export { handleInstagramWebhook,handleInstagramArticleLink } from '../../packages/core/instagram/links'",
  "export { bodyLimit } from 'hono/body-limit'"
].join('\n'))
const handlers=['handleInstagramApprove','handleInstagramCaption','handleInstagramCreate','handleInstagramDetail','handleInstagramList','handleInstagramNew','handleInstagramPublish','handleInstagramStoryUpdate','handleInstagramUpdate','handleInstagramN8nCallback','renderIntegrationsPage']
for(const name of handlers){let count=0;worker=worker.replace(/Object\.freeze\(Object\.defineProperty\(\{\s*__proto__:\s*null,[^}]*\},\s*Symbol\.toStringTag,\s*\{\s*value:\s*"Module"\s*\}\)\)/g,namespace=>namespace.replace(new RegExp(`\\b${name}:\\s*[\\w$]+`,'g'),()=>{count++;return `${name}:__engagement.${name}`}));if(count!==1)throw Error(`Ambiguous namespace ${name}: ${count}`)}
const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
let app
for(const [method,path,name] of [
  ['post','/admin/instagram/connect','handleInstagramConnect'],['get','/admin/instagram/connect/callback','handleInstagramConnectCallback'],
  ['post','/admin/instagram/disconnect','handleInstagramDisconnect'],['post','/api/admin/instagram/:id{[0-9]+}/publish-direct','handleInstagramDirectPublish'],
  ['get','/instagram/media/:token','handleInstagramDirectImage']
]){
  const expression=new RegExp(`^([\\w$]+)\\.${method}\\(${escape(JSON.stringify(path))},[^\\n]+$`,'gm')
  const matches=[...worker.matchAll(expression)]
  if(matches.length!==1 || !/=>\s*[\w$]+\([\w$]+\)\);$/.test(matches[0][0]))throw Error(`Ambiguous route ${path}`)
  app=matches[0][1];worker=worker.replace(matches[0][0],`${app}.${method}(${JSON.stringify(path)},c=>__engagement.${name}(c));`)
}
const marker=`${app}.get("/admin/instagram",`
if(worker.split(marker).length!==2)throw Error('Instagram route insertion point ambiguous')
const routes=`
${app}.get('/admin/instagram/audience',c=>__engagement.handleInstagramAudience(c));
${app}.get('/admin/instagram/campaigns',c=>__engagement.handleInstagramCampaigns(c));
${app}.post('/admin/instagram/campaigns',c=>__engagement.handleInstagramCampaignSave(c));
${app}.post('/admin/instagram/campaigns/:id{[0-9]+}/state',c=>__engagement.handleInstagramCampaignState(c));
${app}.post('/admin/instagram/audience/sync',c=>__engagement.handleInstagramAudienceSync(c));
${app}.post('/admin/instagram/audience/pause',c=>__engagement.handleInstagramLinkPause(c));
${app}.post('/admin/instagram/:id{[0-9]+}/link',c=>__engagement.handleInstagramLinkCampaign(c));
${app}.use('/webhooks/instagram',__engagement.bodyLimit({maxSize:256*1024,onError:c=>c.text('Payload too large',413)}));
${app}.get('/webhooks/instagram',c=>__engagement.handleInstagramWebhook(c));
${app}.post('/webhooks/instagram',c=>__engagement.handleInstagramWebhook(c));
${app}.get('/ir/instagram/:token',c=>__engagement.handleInstagramArticleLink(c));
`
worker="import * as __engagement from './engagement-entry.ts';\n"+worker.replace(marker,routes+marker)
await writeFile(`${target}/worker-entry.js`,worker)
await build({configFile:false,publicDir:false,build:{outDir:`${target}/site`,emptyOutDir:false,target:'es2022',minify:'esbuild',lib:{entry:resolve(`${target}/worker-entry.js`),formats:['es'],fileName:()=> '_worker.js'},rollupOptions:{external:[...builtinModules,...builtinModules.map(m=>`node:${m}`),'cloudflare:sockets','__STATIC_CONTENT_MANIFEST']}}})
for(const prefix of ['static','static/static'])for(const file of ['admin-instagram-audience.css','admin-instagram-audience.js'])await cp(`public/static/${file}`,`${target}/site/${prefix}/${file}`)
async function walk(folder,prefix=''){const files=[];for(const entry of await readdir(folder,{withFileTypes:true})){const path=prefix+entry.name;files.push(...(entry.isDirectory()?await walk(`${folder}/${entry.name}`,path+'/'):[path]))}return files}
const changed=[]
for(const path of await walk(`${target}/site`)){const bytes=await readFile(`${target}/site/${path}`);let original;try{original=await readFile(`${base}/site/${path}`)}catch{}if(!original||!bytes.equals(original))changed.push({path,sha256:hash(bytes)})}
if(changed.length!==5 || changed.some(file=>!['_worker.js','static/admin-instagram-audience.css','static/static/admin-instagram-audience.css','static/admin-instagram-audience.js','static/static/admin-instagram-audience.js'].includes(file.path)))throw Error('Unexpected files changed: '+JSON.stringify(changed))
await writeFile(`${target}/release.json`,JSON.stringify({baseDeployment:'0e5c6213-e33e-4ac0-8bc9-d83fcaf9a255',baseWorkerSha256:metadata.workerSha256,changed,site:resolve(`${target}/site`)},null,2))
console.log(JSON.stringify({site:resolve(`${target}/site`),changed:changed.map(file=>file.path)}))
