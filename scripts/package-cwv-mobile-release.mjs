import {readFile,writeFile,mkdir,cp,readdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {builtinModules} from 'node:module'
import {resolve} from 'node:path'
import ts from 'typescript'
import {build} from 'vite'
const base='artifacts/whatsapp-channel-og-v2-release', target='artifacts/cwv-mobile-release'
const hash=b=>createHash('sha256').update(b).digest('hex')
const metadata=JSON.parse(await readFile(`${base}/release.json`,'utf8'))
let worker=await readFile(`${base}/site/_worker.js`,'utf8')
if(hash(worker)!==metadata.changed.find(f=>f.path==='_worker.js').sha256)throw Error('Base checksum mismatch')
const names=['renderAdSlot','generateAdsLoaderScript','renderEditorialLayout']
const aliases={}
const namespaces=[...worker.matchAll(/Object\.freeze\(Object\.defineProperty\(\{ __proto__: null, ([^\n]+?)\}, Symbol\.toStringTag/g)].map(match=>match[1]).join('\n')
for(const name of names){const matches=[...namespaces.matchAll(new RegExp(`${name}:\\s*([\\w$]+)[, }]+`,'g'))];if(matches.length!==1)throw Error(`Ambiguous export ${name}: ${matches.length}`);aliases[name]=matches[0][1]}
const ast=ts.createSourceFile('worker.js',worker,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS)
const ranges=ast.statements.filter(node=>ts.isFunctionDeclaration(node)&&Object.values(aliases).includes(node.name?.text)).map(node=>[node.getStart(ast),node.end])
if(ranges.length!==names.length)throw Error('Function declarations not found')
for(const [start,end] of ranges.sort((a,b)=>b[0]-a[0]))worker=worker.slice(0,start)+worker.slice(end)
const link='<link rel="stylesheet" href="/static/whatsapp-channel.css?v=20261104-1">'
if(worker.split(link).length!==2)throw Error('Channel CSS link not unique')
worker=worker.replace(link,'<style data-source="/static/whatsapp-channel.css">${__cwvChannelCss}</style>')
worker=`import {renderAdSlot as ${aliases.renderAdSlot},generateAdsLoaderScript as ${aliases.generateAdsLoaderScript}} from '../../packages/core/ads';\nimport {renderEditorialLayout as ${aliases.renderEditorialLayout}} from '../../packages/core/web/layout-editorial';\nimport __cwvChannelCss from '../../public/static/whatsapp-channel.css?raw';\n`+worker
await mkdir(target,{recursive:true});await cp(`${base}/site`,`${target}/site`,{recursive:true,force:false,errorOnExist:true})
await writeFile(`${target}/worker-entry.js`,worker)
await build({configFile:false,publicDir:false,build:{outDir:`${target}/site`,emptyOutDir:false,target:'es2022',minify:'esbuild',lib:{entry:resolve(`${target}/worker-entry.js`),formats:['es'],fileName:()=> '_worker.js'},rollupOptions:{external:[...builtinModules,...builtinModules.map(m=>`node:${m}`),'cloudflare:sockets','__STATIC_CONTENT_MANIFEST']}}})
async function walk(d,p=''){let r=[];for(const e of await readdir(d,{withFileTypes:true}))r.push(...(e.isDirectory()?await walk(`${d}/${e.name}`,p+e.name+'/'):[p+e.name]));return r}
const changed=[];for(const path of await walk(`${target}/site`)){const b=await readFile(`${target}/site/${path}`);let a;try{a=await readFile(`${base}/site/${path}`)}catch{}if(!a||!a.equals(b))changed.push({path,sha256:hash(b)})}
if(changed.length!==1||changed[0].path!=='_worker.js')throw Error('Unexpected changes')
await writeFile(`${target}/release.json`,JSON.stringify({baseDeployment:'4de35b13-13ca-4ed6-916e-087a022b433a',baseWorkerSha256:metadata.changed.find(f=>f.path==='_worker.js').sha256,changed,site:resolve(`${target}/site`)},null,2))
console.log(JSON.stringify({changed:changed.map(f=>f.path),aliases}))
