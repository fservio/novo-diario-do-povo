import { readFile, writeFile, mkdir, cp } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { builtinModules } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'vite'

// Extend the last production release instead of shipping unrelated local edits.
const base = 'artifacts/seo-home-release'
const target = process.argv[2] || 'artifacts/instagram-direct-release'
const metadata = JSON.parse(await readFile(`${base}/release.json`, 'utf8'))
let worker = await readFile(`${base}/site/_worker.js`, 'utf8')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
if (hash(worker) !== metadata.workerSha256) throw Error('Production base checksum mismatch')
await mkdir(target, { recursive: true })
await cp(`${base}/site`, `${target}/site`, { recursive: true, force: false, errorOnExist: true })

const entry = `${target}/instagram-entry.ts`
const relative = '../../'
await writeFile(entry, [
  `export * from '${relative}packages/core/admin/instagram'`,
  `export { renderIntegrationsPage } from '${relative}packages/core/admin/integrations'`,
  `export { handleInstagramN8nCallback } from '${relative}packages/core/web/instagram'`,
  `export * from '${relative}packages/core/instagram/direct'`,
  `export * from '${relative}packages/core/admin/instagram-audience'`,
  `export { handleInstagramWebhook,handleInstagramArticleLink } from '${relative}packages/core/instagram/links'`,
  `export { bodyLimit } from 'hono/body-limit'`
].join('\n'))
const handlers = [
  'handleInstagramApprove','handleInstagramCaption','handleInstagramCreate','handleInstagramDetail',
  'handleInstagramList','handleInstagramNew','handleInstagramPublish','handleInstagramStoryUpdate',
  'handleInstagramUpdate','handleInstagramN8nCallback','renderIntegrationsPage'
]
for (const name of handlers) {
  const expression = new RegExp(`\\b${name}:([A-Za-z_$][\\w$]*)`, 'g')
  let count = 0
  worker = worker.replace(/Object\.freeze\(Object\.defineProperty\(\{__proto__:null,[^}]*\},Symbol\.toStringTag,\{value:"Module"\}\)\)/g, namespace =>
    namespace.replace(expression, () => { count++; return `${name}:__instagramDirect.${name}` }))
  if (count !== 1) throw Error(`Expected one namespace export: ${name}, found ${count}`)
}
const route = worker.match(/([\w$]+)\.get\("\/admin\/instagram",/)
if (!route) throw Error('Instagram route insertion point missing')
const app = route[1]
const index = route.index
const routes = `
${app}.post('/admin/instagram/connect',c=>__instagramDirect.handleInstagramConnect(c));
${app}.get('/admin/instagram/connect/callback',c=>__instagramDirect.handleInstagramConnectCallback(c));
${app}.post('/admin/instagram/disconnect',c=>__instagramDirect.handleInstagramDisconnect(c));
${app}.get('/admin/instagram/audience',c=>__instagramDirect.handleInstagramAudience(c));
${app}.post('/admin/instagram/audience/sync',c=>__instagramDirect.handleInstagramAudienceSync(c));
${app}.post('/admin/instagram/audience/pause',c=>__instagramDirect.handleInstagramLinkPause(c));
${app}.post('/admin/instagram/:id{[0-9]+}/link',c=>__instagramDirect.handleInstagramLinkCampaign(c));
${app}.use('/webhooks/instagram',__instagramDirect.bodyLimit({maxSize:256*1024,onError:c=>c.text('Payload too large',413)}));
${app}.get('/webhooks/instagram',c=>__instagramDirect.handleInstagramWebhook(c));
${app}.post('/webhooks/instagram',c=>__instagramDirect.handleInstagramWebhook(c));
${app}.get('/ir/instagram/:token',c=>__instagramDirect.handleInstagramArticleLink(c));
${app}.use('/api/admin/instagram/:id{[0-9]+}/publish-direct',__instagramDirect.bodyLimit({maxSize:9*1024*1024,onError:c=>c.json({error:'A imagem excede o tamanho permitido.'},413)}));
${app}.post('/api/admin/instagram/:id{[0-9]+}/publish-direct',c=>__instagramDirect.handleInstagramDirectPublish(c));
${app}.get('/instagram/media/:token',c=>__instagramDirect.handleInstagramDirectImage(c));
`
worker = `import * as __instagramDirect from './instagram-entry.ts';\n` + worker.slice(0,index) + routes + worker.slice(index)
await writeFile(`${target}/worker-entry.js`, worker)
await build({configFile:false,publicDir:false,build:{outDir:`${target}/site`,emptyOutDir:false,target:'es2022',minify:'esbuild',
  lib:{entry:resolve(`${target}/worker-entry.js`),formats:['es'],fileName:()=> '_worker.js'},
  rollupOptions:{external:[...builtinModules,...builtinModules.map(m=>`node:${m}`),'cloudflare:sockets','__STATIC_CONTENT_MANIFEST']}}})
await cp('public/static/admin-instagram.js',`${target}/site/static/admin-instagram.js`)
await cp('public/static/admin-instagram.js',`${target}/site/static/static/admin-instagram.js`)
await cp('public/static/admin-instagram-audience.css',`${target}/site/static/admin-instagram-audience.css`)
await cp('public/static/admin-instagram-audience.css',`${target}/site/static/static/admin-instagram-audience.css`)
const changed=[]
for (const path of ['_worker.js','static/admin-instagram.js','static/static/admin-instagram.js','static/admin-instagram-audience.css','static/static/admin-instagram-audience.css']) changed.push({path,sha256:hash(await readFile(`${target}/site/${path}`))})
await writeFile(`${target}/release.json`,JSON.stringify({baseDeployment:'5fc2f25d-d720-4b41-b39c-e9df5cd67f43',baseWorkerSha256:metadata.workerSha256,changed,handlers,site:resolve(`${target}/site`)},null,2))
console.log(JSON.stringify({site:resolve(`${target}/site`),changed:changed.map(f=>f.path)}))
