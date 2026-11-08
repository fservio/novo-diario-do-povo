import {readFile,writeFile,cp,mkdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {builtinModules} from 'node:module'
import {resolve} from 'node:path'
import {build} from 'vite'
const base='artifacts/news-extractor-cms-production'
const target='artifacts/internal-links-production-release'
const hash=value=>createHash('sha256').update(value).digest('hex')
const manifest=JSON.parse(await readFile(base+'/release.json','utf8'))
const original=await readFile(base+'/site/_worker.js','utf8')
if(manifest.deploymentId!=='2fc6744b'||hash(original)!==manifest.workerSha256) throw Error('Base divergente')
const marker=/^([\w$]+)\.post\("\/api\/n8n\/media",/gm
const markers=[...original.matchAll(marker)]
if(markers.length!==1||original.includes('/api/n8n/internal-links/')) throw Error('Ponto de montagem ambíguo')
const source=await readFile('functions/index.ts','utf8')
const handlers=source.split("\n").map(line=>line.trimEnd()).join("\n").match(/^app\.(?:post|put)\('\/api\/n8n\/internal-links\/.*?^\}\)/gms) || []
const routes=handlers.filter(handler=>handler.startsWith("app.put(")||handler.split("\n")[0].includes('/plan'))
if(routes.length!==2) throw Error('Rotas locais ausentes')
const app=markers[0][1]
const route=routes.map(handler=>handler.replace(/^app\./,app+'.').replaceAll('../packages/core/','../../packages/core/').replaceAll('new Set<number>()','new Set()').replace('(link: any)','(link)').replace('(): null => null','() => null')).join(';\n')+';\n'
const pos=markers[0].index
const render=/L = (gY\(e\.content_markdown[^\n]+?\)), z = uS\(L\);/g
if([...original.matchAll(render)].length!==1) throw Error('Renderizador ambíguo')
const worker=(original.slice(0,pos)+route+original.slice(pos)).replace(render,(_,html)=>`L = d ? ${html} : await __renderLinks(t.env.DB,e.id,e.content||'',${html}).catch(()=>${html}), z = uS(L);`)
await mkdir(target,{recursive:true})
await cp(base+'/site',target+'/site',{recursive:true,errorOnExist:false,force:false})
await writeFile(target+'/worker-entry.js',"import {applyStoredInternalLinks as __renderLinks} from '../../packages/core/seo/internal-links';\n"+worker)
const entry=resolve(target+'/worker-entry.js').replaceAll('\\','/')
const external=new Set([...builtinModules,...builtinModules.map(m=>'node:'+m),'cloudflare:sockets','__STATIC_CONTENT_MANIFEST'])
await build({configFile:false,publicDir:false,build:{outDir:target+'/site',emptyOutDir:false,target:'es2022',minify:'esbuild',lib:{entry,formats:['es'],fileName:()=> '_worker.js'},rollupOptions:{external:(id,importer)=>external.has(id)||(importer?.replaceAll('\\','/')===entry&&id.startsWith('./')&&id.endsWith('.js')),output:{inlineDynamicImports:true}}}})
const built=await readFile(target+'/site/_worker.js','utf8')
if(!built.includes('post_internal_links')||!built.includes('/api/n8n/internal-links/:id{[0-9]+}/plan')) throw Error('Rota ausente no build')
await writeFile(target+'/release.json',JSON.stringify({baseDeployment:manifest.deploymentId,workerSha256:hash(built)},null,2))
