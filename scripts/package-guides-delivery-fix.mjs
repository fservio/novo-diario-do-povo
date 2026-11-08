import {readFile,writeFile,cp,mkdir,readdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {builtinModules} from 'node:module'
import {resolve} from 'node:path'
import ts from 'typescript'
import {build} from 'vite'
const base='artifacts/seo-backend-fix-release',target=process.argv[2]||'artifacts/guias-delivery-fix-v2',hash=value=>createHash('sha256').update(value).digest('hex'),manifest=JSON.parse(await readFile(base+'/release.json','utf8')),original=await readFile(base+'/site/_worker.js','utf8')
if(manifest.deploymentId!=='e4cf7373'||hash(original)!==manifest.workerSha256)throw Error('A base de produção não foi confirmada.')
const parse=text=>ts.createSourceFile('worker.js',text,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS),tree=parse(original),changes=[]
function declarations(name){return tree.statements.filter(s=>ts.isFunctionDeclaration(s)&&s.name?.text===name)}
function replace(name,alias){const list=declarations(name);if(list.length!==1)throw Error('Função ambígua: '+name);changes.push({start:list[0].getStart(tree),end:list[0].end,text:`async function ${name}(...args){return ${alias}(...args)}`})}
function routeHandler(path,method){const found=tree.statements.filter(s=>ts.isExpressionStatement(s)&&ts.isCallExpression(s.expression)&&s.expression.arguments[0]&&ts.isStringLiteral(s.expression.arguments[0])&&s.expression.arguments[0].text===path&&s.expression.expression.getText(tree).endsWith('.'+method));if(found.length!==1)throw Error('Rota ambígua: '+path);const callback=found[0].expression.arguments[1];if(!ts.isArrowFunction(callback)||!ts.isCallExpression(callback.body)||!ts.isIdentifier(callback.body.expression))throw Error('Handler não reconhecido: '+path);return callback.body.expression.text}
replace(routeHandler('/api/n8n/guides/:operation','post'),'__deliveryApi')
replace(routeHandler('/admin/guias/:id/:operation','post'),'__deliveryAdminSave')
const menus=tree.statements.filter(s=>ts.isFunctionDeclaration(s)&&s.getText(tree).includes('.ed-menu-drawer__list')&&s.getText(tree).includes('.mobile-menu-panel nav'))
if(menus.length!==1)throw Error('Middleware público ambíguo.')
replace(menus[0].name.text,'__deliveryMenu')
let worker=original
for(const c of changes.sort((a,b)=>b.start-a.start))worker=worker.slice(0,c.start)+c.text+worker.slice(c.end)
worker=`import {handleN8nGuides as __deliveryApi} from '../../packages/core/web/n8n-guides';
import {handleGuideAdminSave as __deliveryAdminSave} from '../../packages/core/admin/guides';
import {completePublicMenu as __deliveryMenu} from '../../packages/core/middleware/public-menu';
`+worker
await mkdir(target,{recursive:true});await cp(base+'/site',target+'/site',{recursive:true,errorOnExist:true,force:false});await writeFile(target+'/worker-entry.js',worker)
const entry=resolve(target+'/worker-entry.js').replaceAll('\\','/'),external=new Set([...builtinModules,...builtinModules.map(m=>'node:'+m),'cloudflare:sockets','__STATIC_CONTENT_MANIFEST'])
await build({configFile:false,publicDir:false,build:{outDir:target+'/site',emptyOutDir:false,target:'es2022',minify:'esbuild',lib:{entry,formats:['es'],fileName:()=> '_worker.js'},rollupOptions:{external:(id,importer)=>external.has(id)||(importer?.replaceAll('\\','/')===entry&&id.startsWith('./')&&id.endsWith('.js')),output:{inlineDynamicImports:true}}}})
async function files(root,dir=''){const out=[];for(const file of await readdir(resolve(root,dir),{withFileTypes:true})){const path=dir?dir+'/'+file.name:file.name;if(file.isDirectory())out.push(...await files(root,path));else out.push(path)}return out}
const changed=[];for(const file of await files(target+'/site'))if(hash(await readFile(target+'/site/'+file))!==hash(await readFile(base+'/site/'+file)))changed.push(file)
if(changed.length!==1||changed[0]!=='_worker.js')throw Error('Mudança estática inesperada: '+changed.join(', '))
const routes=source=>parse(source).statements.filter(n=>ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)&&ts.isPropertyAccessExpression(n.expression.expression)&&n.expression.arguments[0]&&ts.isStringLiteral(n.expression.arguments[0])).map(n=>n.expression.expression.name.text+' '+n.expression.arguments[0].text).sort()
const before=routes(original),after=routes(await readFile(target+'/site/_worker.js','utf8'));if(JSON.stringify(before)!==JSON.stringify(after))throw Error('O conjunto de rotas mudou durante a correção.')
const result={baseDeployment:manifest.deploymentId,baseWorkerSha256:manifest.workerSha256,workerSha256:hash(await readFile(target+'/site/_worker.js')),changed,site:resolve(target+'/site'),routesPreserved:before.length}
await writeFile(target+'/release.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2))
