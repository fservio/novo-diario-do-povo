import {readFile,writeFile,cp,mkdir,readdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {builtinModules} from 'node:module'
import {resolve} from 'node:path'
import ts from 'typescript'
import {build} from 'vite'

const base=process.argv[2]||'artifacts/seo-automation-release',target=process.argv[3]||'artifacts/guias-launch'
const hash=value=>createHash('sha256').update(value).digest('hex')
const manifest=JSON.parse(await readFile(base+'/release.json','utf8')),original=await readFile(base+'/site/_worker.js','utf8')
if(!manifest.deploymentId||hash(original)!==manifest.workerSha256)throw Error('A base não corresponde ao manifesto de produção.')
const tree=ts.createSourceFile('worker.js',original,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS),patches=[]
const routes=tree.statements.filter(s=>ts.isExpressionStatement(s)&&ts.isCallExpression(s.expression)&&s.expression.arguments[0]&&ts.isStringLiteral(s.expression.arguments[0]))
function route(method,path){const rows=routes.filter(s=>s.expression.expression.getText(tree).endsWith('.'+method)&&s.expression.arguments[0].text===path);if(rows.length!==1)throw Error('Rota ambígua: '+path);return rows[0]}
const media=route('post','/api/n8n/media'),app=media.expression.expression.expression.getText(tree),admin=route('get','/admin/posts')
patches.push({start:media.getStart(tree),end:media.getStart(tree),text:`${app}.post('/api/n8n/guides/:operation',c=>__guideApi(c));
${app}.get('/guias',c=>__guidesPage(c));
${app}.get('/guias/:slug',c=>__guidePage(c));
${app}.get('/sitemap-guias.xml',c=>__guidesSitemap(c));\n`})
patches.push({start:admin.getStart(tree),end:admin.getStart(tree),text:`${app}.use('/admin/guias',(c,n)=>__guideCsrf(c,n));
${app}.use('/admin/guias/*',(c,n)=>__guideCsrf(c,n));
${app}.get('/admin/guias',c=>__guidesAdmin(c));
${app}.post('/admin/guias',c=>__guideAdminSave(c));
${app}.post('/admin/guias/import',c=>__guideAdminSave(c,'import'));
${app}.get('/admin/guias/:id',c=>__guideAdmin(c));
${app}.get('/admin/guias/:id/preview',c=>__guidePreview(c));
${app}.post('/admin/guias/:id/:operation',c=>__guideAdminSave(c));\n`})
const menu=tree.statements.filter(s=>ts.isFunctionDeclaration(s)&&s.getText(tree).includes('.ed-menu-drawer__list')&&s.getText(tree).includes('.mobile-menu-panel nav'))
if(menu.length!==1)throw Error('Middleware público ambíguo.')
patches.push({start:menu[0].getStart(tree),end:menu[0].end,text:`async function ${menu[0].name.text}(c,n){return __guideMenu(c,n)}`})
const security=tree.statements.filter(s=>ts.isFunctionDeclaration(s)&&s.getText(tree).includes('"/api/n8n/seo"')&&s.getText(tree).includes('"/agenda/sugerir"')&&s.getText(tree).includes('"Cache-Control"'))
if(security.length!==1)throw Error('Middleware de cache ambíguo.')
const securityText=security[0].getText(tree),path=securityText.match(/(\w+) === "\/api\/n8n\/seo"/)?.[1]
if(!path)throw Error('Política de cache atual não reconhecida.')
patches.push({start:security[0].getStart(tree),end:security[0].end,text:securityText.replace(path+' === "/api/n8n/seo"',path+'.startsWith("/api/n8n/guides/") || '+path+' === "/api/n8n/seo"')})
let worker=original
for(const p of patches.sort((a,b)=>b.start-a.start))worker=worker.slice(0,p.start)+p.text+worker.slice(p.end)
let menus=0
worker=worker.replace(/<a class="\$\{(\w+)\("posts"\)\}" href="\/admin\/posts"\$\{(\w+)\("posts"\)\}>/g,(match,active,current,offset)=>{
 if(worker.slice(offset-240,offset).includes('href="/admin/guias"'))return match
 const before=worker.slice(offset-300,offset),user=before.match(/includes\((\w+)\.role\)/)?.[1],icon=before.match(/\$\{(\w+)\("cover"\)\}/)?.[1]
 if(!user||!icon)throw Error('Menu administrativo sem contexto reconhecido.')
 menus++
 return '${["admin","director","editor"].includes('+user+'.role)?`<a class="${'+active+'("guides")}" href="/admin/guias"${'+current+'("guides")}>${'+icon+'("cover")}Guias do Diário</a>`:""}'+match
})
if(menus!==4)throw Error('Quantidade inesperada de menus administrativos a completar: '+menus)
const sitemap=worker.match(/<loc>\$\{(\w+)\}\/sitemap-categories\.xml<\/loc>/g)
if(sitemap?.length!==1)throw Error('Índice de sitemaps ambíguo.')
worker=worker.replace(sitemap[0],sitemap[0]+'</sitemap><sitemap>'+sitemap[0].replace('sitemap-categories','sitemap-guias'))
worker=`import {handleN8nGuides as __guideApi} from '../../packages/core/web/n8n-guides';
import {handleGuidesPage as __guidesPage,handleGuidePage as __guidePage,handleGuidePreview as __guidePreview,handleGuidesSitemap as __guidesSitemap} from '../../packages/core/web/guides';
import {handleGuidesAdmin as __guidesAdmin,handleGuideAdmin as __guideAdmin,handleGuideAdminSave as __guideAdminSave} from '../../packages/core/admin/guides';
import {csrfProtection as __guideCsrf} from '../../packages/core/middleware';
import {completePublicMenu as __guideMenu} from '../../packages/core/middleware/public-menu';
`+worker
await mkdir(target,{recursive:true});await cp(base+'/site',target+'/site',{recursive:true,force:false,errorOnExist:true});await writeFile(target+'/worker-entry.js',worker)
const entry=resolve(target+'/worker-entry.js').replaceAll('\\','/'),external=new Set([...builtinModules,...builtinModules.map(m=>'node:'+m),'cloudflare:sockets','__STATIC_CONTENT_MANIFEST'])
await build({configFile:false,publicDir:false,build:{outDir:target+'/site',emptyOutDir:false,target:'es2022',minify:'esbuild',lib:{entry:resolve(entry),formats:['es'],fileName:()=> '_worker.js'},rollupOptions:{external:(id,importer)=>external.has(id)||(importer?.replaceAll('\\','/')===entry&&id.startsWith('./')&&id.endsWith('.js')),output:{inlineDynamicImports:true}}}})
async function files(root,dir=''){const out=[];for(const item of await readdir(resolve(root,dir),{withFileTypes:true})){const path=dir?dir+'/'+item.name:item.name;if(item.isDirectory())out.push(...await files(root,path));else out.push(path)}return out}
const changed=[];for(const file of await files(target+'/site'))if(hash(await readFile(target+'/site/'+file))!==hash(await readFile(base+'/site/'+file)))changed.push(file)
if(changed.length!==1||changed[0]!=='_worker.js')throw Error('Mudanças inesperadas no pacote: '+changed.join(', '))
const release={baseDeployment:manifest.deploymentId,baseWorkerSha256:manifest.workerSha256,workerSha256:hash(await readFile(target+'/site/_worker.js')),changed,site:resolve(target+'/site'),adminMenusPatched:menus}
await writeFile(target+'/release.json',JSON.stringify(release,null,2));console.log(JSON.stringify(release,null,2))
