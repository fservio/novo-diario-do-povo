import {readFile,writeFile,cp,mkdir,readdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {builtinModules} from 'node:module'
import {resolve} from 'node:path'
import ts from 'typescript'
import {build} from 'vite'
const base='artifacts/db-overload-release-v2',target='artifacts/news-extractor-cms-production'
const hash=data=>createHash('sha256').update(data).digest('hex'),manifest=JSON.parse(await readFile(base+'/release.json','utf8')),original=await readFile(base+'/site/_worker.js','utf8')
if(manifest.deploymentId!=='2d8871f0'||hash(original)!==manifest.workerSha256)throw Error('A base deve ser a produção confirmada 2d8871f0.')
const parse=source=>ts.createSourceFile('worker.js',source,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS)
const routes=source=>{const tree=parse(source);return tree.statements.filter(n=>ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)&&ts.isPropertyAccessExpression(n.expression.expression)&&n.expression.arguments[0]&&ts.isStringLiteral(n.expression.arguments[0])).map(n=>({node:n,tree,method:n.expression.expression.name.text,path:n.expression.arguments[0].text,app:n.expression.expression.expression.getText(tree)}))}
const before=routes(original),api=before.filter(r=>r.method==='post'&&r.path==='/api/n8n/media'),admin=before.filter(r=>r.method==='get'&&r.path==='/admin/integrations')
if(api.length!==1||admin.length!==1||api[0].app!==admin[0].app)throw Error('Pontos de inserção ambíguos.')
if(before.some(r=>r.path.includes('/news-extractor')))throw Error('Integração já existe na base.')
const app=api[0].app,edits=[{at:api[0].node.getStart(api[0].tree),text:`${app}.use('/admin/*',__collectorNav);\n${app}.post('/api/n8n/news-extractor/:operation',__collectorApi);\n`},{at:admin[0].node.getStart(admin[0].tree),text:`${app}.use('/admin/news-extractor',__collectorCsrf);\n${app}.use('/admin/news-extractor/*',__collectorCsrf);\n${app}.get('/admin/news-extractor',__collectorAdmin);\n${app}.post('/admin/news-extractor/commands',__collectorSave);\n${app}.post('/admin/news-extractor/retry',__collectorSave);\n`}]
let worker=original;for(const edit of edits.sort((a,b)=>b.at-a.at))worker=worker.slice(0,edit.at)+edit.text+worker.slice(edit.at)
worker="import {attachExtractorNavigation as __collectorNav,handleExtractorAdmin as __collectorAdmin,handleExtractorAdminSave as __collectorSave} from '../../packages/core/admin/news-extractor';\nimport {handleN8nExtractor as __collectorApi} from '../../packages/core/web/n8n-news-extractor';\nimport {csrfProtection as __collectorCsrf} from '../../packages/core/middleware/security';\n"+worker
await mkdir(target,{recursive:true});await cp(base+'/site',target+'/site',{recursive:true,errorOnExist:false,force:false});await writeFile(target+'/worker-entry.js',worker)
const entry=resolve(target+'/worker-entry.js').replaceAll('\\','/'),external=new Set([...builtinModules,...builtinModules.map(m=>'node:'+m),'cloudflare:sockets','__STATIC_CONTENT_MANIFEST'])
await build({configFile:false,publicDir:false,build:{outDir:target+'/site',emptyOutDir:false,target:'es2022',minify:'esbuild',lib:{entry,formats:['es'],fileName:()=> '_worker.js'},rollupOptions:{external:(id,importer)=>external.has(id)||(importer?.replaceAll('\\','/')===entry&&id.startsWith('./')&&id.endsWith('.js')),output:{inlineDynamicImports:true}}}})
const after=routes(await readFile(target+'/site/_worker.js','utf8')),count=(rows,key)=>rows.filter(r=>r.method+' '+r.path===key).length
for(const r of before){const key=r.method+' '+r.path;if(count(after,key)<count(before,key))throw Error('Rota perdida: '+key)}
if(after.length!==before.length+7)throw Error('Número inesperado de rotas novas.')
async function files(root,dir=''){const result=[];for(const f of await readdir(resolve(root,dir),{withFileTypes:true})){const p=dir?dir+'/'+f.name:f.name;if(f.isDirectory())result.push(...await files(root,p));else result.push(p)}return result}
const changed=[];for(const file of await files(target+'/site'))if(hash(await readFile(target+'/site/'+file))!==hash(await readFile(base+'/site/'+file)))changed.push(file)
if(changed.length!==1||changed[0]!=='_worker.js')throw Error('Mudança estática inesperada: '+changed.join(','))
const result={baseDeployment:manifest.deploymentId,baseWorkerSha256:manifest.workerSha256,workerSha256:hash(await readFile(target+'/site/_worker.js')),routesPreserved:before.length,routesAdded:7,changed,site:resolve(target+'/site')}
await writeFile(target+'/release.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result))
