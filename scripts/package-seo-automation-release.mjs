import { readFile, writeFile, cp, mkdir, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { builtinModules } from 'node:module'
import { resolve } from 'node:path'
import ts from 'typescript'
import { build } from 'vite'

const base = 'artifacts/article-placeholder-production'
const target = 'artifacts/seo-automation-release'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const manifest = JSON.parse(await readFile(`${base}/release.json`, 'utf8'))
const original = await readFile(`${base}/site/_worker.js`, 'utf8')
if (manifest.deploymentId !== 'a4c8ae84' || hash(original) !== manifest.workerSha256) throw Error('SEO release base does not match verified production a4c8ae84')
const tree = ts.createSourceFile('production.js', original, ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS)
const replacements = []
const locateFunction = (name, alias) => {
  const matches = tree.statements.filter(n => ts.isFunctionDeclaration(n) && n.name?.text === name)
  if (matches.length !== 1) throw Error(`Ambiguous function ${name}`)
  const n = matches[0]
  replacements.push({ start: n.getStart(tree), end: n.end, text: `${n.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword) ? 'async ' : ''}function ${name}(...args){return ${alias}(...args)}` })
}
locateFunction('Gd', '__seoCreatePost')
locateFunction('Lf', '__seoUpdatePost')
locateFunction('Z7', '__seoRenderForm')
const securityFunctions = tree.statements.filter(n => ts.isFunctionDeclaration(n) && n.name?.text === 'hf')
if (securityFunctions.length !== 1) throw Error('Ambiguous production security middleware')
const securityFunction = securityFunctions[0]
const securityText = securityFunction.getText(tree)
const securityMarker = 'A === "/agenda/sugerir" || A.startsWith("/admin")'
if (securityText.split(securityMarker).length !== 2) throw Error('Production private cache branch changed')
replacements.push({ start: securityFunction.getStart(tree), end: securityFunction.end, text: securityText.replace(securityMarker, 'A === "/api/n8n/seo" || A.startsWith("/api/n8n/seo/") || ' + securityMarker) })
for (const [name, alias] of [['U7', '__seoCreateSchema'], ['H7', '__seoUpdateSchema']]) {
  let count = 0
  for (const statement of tree.statements) if (ts.isVariableStatement(statement)) for (const d of statement.declarationList.declarations) {
    if (d.name.getText(tree) === name && d.initializer) { count++; replacements.push({ start:d.initializer.getStart(tree), end:d.initializer.end, text:alias }) }
  }
  if (count !== 1) throw Error(`Ambiguous schema ${name}`)
}
let createRoute = 0, saveRoute = 0
for (const statement of tree.statements) {
  if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) continue
  const call = statement.expression, path = call.arguments[0], method = call.expression.getText(tree)
  if (!path || !ts.isStringLiteral(path)) continue
  if (method === 'O.post' && path.text === '/api/n8n/posts') {
    const text = statement.getText(tree), marker = 'seo_description: r.seo_description,'
    if (text.split(marker).length !== 2) throw Error('n8n post SEO mapping changed')
    replacements.push({start:statement.getStart(tree),end:statement.end,text:text.replace(marker,marker+' seo_primary_keyword: r.seo_primary_keyword, seo_secondary_keywords: r.seo_secondary_keywords,')});createRoute++
  }
  if (method === 'O.post' && path.text === '/admin/posts/:id') {
    const text=statement.getText(tree)
    const payloadMarker='const g = x.content_json?.trim() ? { ...x, content_json: x.content_json, content_markdown: void 0, expected_content_version: w } : { ...x, ...x.content !== void 0 ? { content_markdown: x.content } : {} };'
    if(text.split(payloadMarker).length!==2)throw Error('Editor content payload changed; SEO-only preservation patch not applied')
    const match=text.match(/catch \((\w+)\) \{\s*return console\.error\("\[Admin Posts\] Update error:", \1\)/)
    if(!match)throw Error('Editor conflict handler changed')
    const idMatch=text.match(/(\w+) = parseInt\(t\.req\.param\("id"\)\)/)
    if(!idMatch)throw Error('Editor id binding changed')
    const v=match[1],before=`catch (${v}) {`,after=before+` if (${v} && typeof ${v} === "object" && ["SEO_VERSION_CONFLICT","SEO_SOURCE_CONFLICT"].includes(${v}.code)) return t.redirect(\`/admin/posts/\${${idMatch[1]}}?error=seo_conflict\`,303);`
    replacements.push({start:statement.getStart(tree),end:statement.end,text:text.replace(before,after).replace(payloadMarker,'const g = __seoBuildUpdate(x, $, w);')});saveRoute++
  }
}
if(createRoute!==1||saveRoute!==1)throw Error('Missing production post routes')
let worker=original
for(const r of replacements.sort((a,b)=>b.start-a.start))worker=worker.slice(0,r.start)+r.text+worker.slice(r.end)
const anchor='O.get("/admin/posts", async (t) => {'
if(worker.split(anchor).length!==2)throw Error('Production route insertion point changed')
worker=worker.replace(anchor,`O.route("/api/n8n/seo", __seoRouter());
O.get("/admin/posts/seo/automation",t=>__seoStatus(t));
O.get("/admin/posts/:id{[0-9]+}/seo/history",t=>__seoHistory(t));
O.post("/admin/posts/:id{[0-9]+}/seo/revisions/:revisionId{[0-9]+}/restore",t=>__seoRestore(t));
${anchor}`)
worker=`import {createPost as __seoCreatePost,updatePost as __seoUpdatePost} from '../../packages/core/db/posts';
import {renderPostFormPage as __seoRenderForm,createPostSchema as __seoCreateSchema,updatePostSchema as __seoUpdateSchema,buildAdminPostUpdatePayload as __seoBuildUpdate} from '../../packages/core/admin/posts';
import {createSeoAutomationRouter as __seoRouter} from '../../packages/core/seo-automation';
import {handleSeoAutomationStatus as __seoStatus,handleSeoHistory as __seoHistory,handleSeoRestore as __seoRestore} from '../../packages/core/admin/seo-automation';
`+worker
await mkdir(target,{recursive:true})
await cp(`${base}/site`,`${target}/site`,{recursive:true,force:true})
for(const file of ['admin-seo.js','admin-seo.css'])await cp(`public/static/${file}`,`${target}/site/static/${file}`)
await writeFile(`${target}/worker-entry.js`,worker)
const entryPath=resolve(`${target}/worker-entry.js`).replaceAll('\\','/')
const externalModules=new Set([...builtinModules,...builtinModules.map(n=>`node:${n}`),'cloudflare:sockets','__STATIC_CONTENT_MANIFEST'])
await build({configFile:false,publicDir:false,build:{outDir:`${target}/site`,emptyOutDir:false,target:'es2022',minify:'esbuild',lib:{entry:resolve(`${target}/worker-entry.js`),formats:['es'],fileName:()=> '_worker.js'},rollupOptions:{external:(id,importer)=>externalModules.has(id)||(importer?.replaceAll('\\','/')===entryPath&&id.startsWith('./')&&id.endsWith('.js')),output:{inlineDynamicImports:true}}}})
async function files(root,dir=''){let result=[];for(const entry of await readdir(resolve(root,dir),{withFileTypes:true})){const p=dir?dir+'/'+entry.name:entry.name;if(entry.isDirectory())result.push(...await files(root,p));else result.push(p)}return result}
const changed=[]
for(const file of await files(`${target}/site`)){
 const bytes=await readFile(`${target}/site/${file}`);let old=null;try{old=await readFile(`${base}/site/${file}`)}catch{}
 if(!old||hash(bytes)!==hash(old))changed.push(file)
}
const allowed=['_worker.js','static/admin-seo.js','static/admin-seo.css']
if(changed.some(p=>!allowed.includes(p)))throw Error('Unexpected SEO release changes: '+changed.join(','))
const result={baseDeployment:manifest.deploymentId,baseWorkerSha256:manifest.workerSha256,workerSha256:hash(await readFile(`${target}/site/_worker.js`)),changed,site:resolve(`${target}/site`)}
await writeFile(`${target}/release.json`,JSON.stringify(result,null,2))
console.log(JSON.stringify(result,null,2))
