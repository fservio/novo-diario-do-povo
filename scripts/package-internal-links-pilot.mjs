import {readFile,writeFile,cp,mkdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {builtinModules} from 'node:module'
import {resolve} from 'node:path'
import {build} from 'vite'
const base='artifacts/news-extractor-cms-production'
const target='artifacts/internal-links-pilot-release'
const hash=value=>createHash('sha256').update(value).digest('hex')
const manifest=JSON.parse(await readFile(base+'/release.json','utf8'))
const original=await readFile(base+'/site/_worker.js','utf8')
if(manifest.deploymentId!=='2fc6744b'||hash(original)!==manifest.workerSha256) throw Error('Base divergente')
const marker=/^([\w$]+)\.use\("\/api\/n8n\/\*", async /gm
const markers=[...original.matchAll(marker)]
if(markers.length!==1||original.includes('/api/n8n/internal-links/')) throw Error('Ponto de montagem ambíguo')
const source=await readFile('functions/index.ts','utf8')
const handler=source.match(/^app\.post\('\/api\/n8n\/internal-links\/:id\{\[0-9\]\+\}\/plan', async \(c\) => \{\r?\n([\s\S]*?)^\}\)/m)?.[1]
if(!handler) throw Error('Rota local ausente')
const route=`${markers[0][1]}.post('/api/n8n/internal-links/:id{[0-9]+}/plan', async (c) => {
  const key = c.env.N8N_INTERNAL_LINKS_PILOT_KEY
  if (!key || c.req.header('X-API-Key') !== key) return c.json({error:'UNAUTHORIZED'},401)
  const eligible = await c.env.DB.prepare("SELECT id FROM posts WHERE id=? AND status='published' AND COALESCE(seo_noindex,0)=0").bind(Number(c.req.param('id'))).first()
  if (!eligible) return c.json({error:'POST_NOT_FOUND'},404)
${handler.replaceAll('../packages/core/','../../packages/core/').replaceAll('new Set<number>()','new Set()')}
});
`
const pos=markers[0].index
await mkdir(target,{recursive:true})
await cp(base+'/site',target+'/site',{recursive:true,errorOnExist:false,force:false})
await writeFile(target+'/worker-entry.js',original.slice(0,pos)+route+original.slice(pos))
const entry=resolve(target+'/worker-entry.js').replaceAll('\\','/')
const external=new Set([...builtinModules,...builtinModules.map(m=>'node:'+m),'cloudflare:sockets','__STATIC_CONTENT_MANIFEST'])
await build({configFile:false,publicDir:false,build:{outDir:target+'/site',emptyOutDir:false,target:'es2022',minify:'esbuild',lib:{entry,formats:['es'],fileName:()=> '_worker.js'},rollupOptions:{external:(id,importer)=>external.has(id)||(importer?.replaceAll('\\','/')===entry&&id.startsWith('./')&&id.endsWith('.js')),output:{inlineDynamicImports:true}}}})
const built=await readFile(target+'/site/_worker.js','utf8')
if(!built.includes('N8N_INTERNAL_LINKS_PILOT_KEY')||!built.includes('/api/n8n/internal-links/:id{[0-9]+}/plan')) throw Error('Rota ausente no build')
await writeFile(target+'/release.json',JSON.stringify({baseDeployment:manifest.deploymentId,workerSha256:hash(built)},null,2))
