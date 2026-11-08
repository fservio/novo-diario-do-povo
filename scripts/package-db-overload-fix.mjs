import {readFile,writeFile,cp,mkdir,readdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {builtinModules} from 'node:module'
import {resolve} from 'node:path'
import ts from 'typescript'
import {build} from 'vite'
const base='artifacts/guias-delivery-fix-v2',target=process.argv[2]||'artifacts/db-overload-release',hash=value=>createHash('sha256').update(value).digest('hex'),manifest=JSON.parse(await readFile(base+'/release.json','utf8')),original=await readFile(base+'/site/_worker.js','utf8')
if(manifest.deploymentId!=='8443dfea'||hash(original)!==manifest.workerSha256)throw Error('A base de produção não foi confirmada.')
const parse=text=>ts.createSourceFile('worker.js',text,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS),tree=parse(original),changes=[]
function declarations(name){return tree.statements.filter(s=>ts.isFunctionDeclaration(s)&&s.name?.text===name)}
function replace(name,alias){const list=declarations(name);if(list.length!==1)throw Error('Função ambígua: '+name);changes.push({start:list[0].getStart(tree),end:list[0].end,text:`async function ${name}(...args){return ${alias}(...args)}`})}
const related=tree.statements.filter(s=>ts.isFunctionDeclaration(s)&&s.getText(tree).includes('AS reading_path')&&s.getText(tree).includes('post_related_articles'))
if(related.length!==1)throw Error('Consulta de relacionadas ambígua.')
replace(related[0].name.text,'__dbRelated')
const handlers=tree.statements.filter(s=>ts.isFunctionDeclaration(s)&&s.getText(tree).includes('[Unhandled Error]')&&s.getText(tree).includes('Unhandled error'))
if(handlers.length!==1)throw Error('Tratamento de erros ambíguo.')
replace(handlers[0].name.text,'__dbError')
let worker=original
for(const c of changes.sort((a,b)=>b.start-a.start))worker=worker.slice(0,c.start)+c.text+worker.slice(c.end)
worker=`import {findRelatedPosts as __dbRelated} from '../../packages/core/db/article';
import {errorHandler as __dbError} from '../../packages/core/middleware/logging';
`+worker
await mkdir(target,{recursive:true});await cp(base+'/site',target+'/site',{recursive:true,errorOnExist:true,force:false});await writeFile(target+'/worker-entry.js',worker)
const entry=resolve(target+'/worker-entry.js').replaceAll('\\','/'),external=new Set([...builtinModules,...builtinModules.map(m=>'node:'+m),'cloudflare:sockets','__STATIC_CONTENT_MANIFEST'])
await build({configFile:false,publicDir:false,build:{outDir:target+'/site',emptyOutDir:false,target:'es2022',minify:'esbuild',lib:{entry,formats:['es'],fileName:()=> '_worker.js'},rollupOptions:{external:(id,importer)=>external.has(id)||(importer?.replaceAll('\\','/')===entry&&id.startsWith('./')&&id.endsWith('.js')),output:{inlineDynamicImports:true}}}})
async function files(root,dir=''){const out=[];for(const file of await readdir(resolve(root,dir),{withFileTypes:true})){const path=dir?dir+'/'+file.name:file.name;if(file.isDirectory())out.push(...await files(root,path));else out.push(path)}return out}
const changed=[];for(const file of await files(target+'/site'))if(hash(await readFile(target+'/site/'+file))!==hash(await readFile(base+'/site/'+file)))changed.push(file)
if(changed.length!==1||changed[0]!=='_worker.js')throw Error('Mudança estática inesperada: '+changed.join(', '))
const routes=source=>parse(source).statements.filter(n=>ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)&&ts.isPropertyAccessExpression(n.expression.expression)&&n.expression.arguments[0]&&ts.isStringLiteral(n.expression.arguments[0])).map(n=>n.expression.expression.name.text+' '+n.expression.arguments[0].text).sort()
const before=routes(original),after=routes(await readFile(target+'/site/_worker.js','utf8'));if(JSON.stringify(before)!==JSON.stringify(after))throw Error('O conjunto de rotas mudou durante a correção.')
const result={baseDeployment:manifest.deploymentId,baseWorkerSha256:manifest.workerSha256,workerSha256:hash(await readFile(target+'/site/_worker.js')),changed,site:resolve(target+'/site'),routesPreserved:before.length,functionsReplaced:changes.length,relatedWindowHours:24}
await writeFile(target+'/release.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2))
