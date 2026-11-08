import {readFile,writeFile,mkdir,cp,readdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {resolve} from 'node:path'
import Ajv from 'ajv'
const base='artifacts/cwv-mobile-release', target='artifacts/agent-discovery-release'
const sha=b=>createHash('sha256').update(b).digest('hex')
const m=JSON.parse(await readFile(`${base}/release.json`,'utf8'))
const baseline=await readFile(`${base}/site/_worker.js`)
if(sha(baseline)!==m.changed.find(f=>f.path==='_worker.js').sha256)throw Error('Base worker mismatch')
const files=['llms.txt','.well-known/ard.json','.well-known/ai-catalog.json','ai-catalog.json','_routes.json','_headers']
const markdown=await readFile('public/llms.txt','utf8')
if(!/^#\s+.+/m.test(markdown)||!/^>\s+.+/m.test(markdown)||!/^##\s+.+/m.test(markdown)||!/^\- \[.+\]\(https:\/\/.+\)/m.test(markdown)||markdown.length<50)throw Error('Invalid llms.txt')
const catalogText=await readFile('public/.well-known/ard.json','utf8')
const catalog=JSON.parse(catalogText)
for(const alias of ['.well-known/ai-catalog.json','ai-catalog.json'])if(await readFile(`public/${alias}`,'utf8')!==catalogText)throw Error(`Catalog alias mismatch: ${alias}`)
const legacySchema=JSON.parse(await readFile('artifacts/agent-discovery-validation/ai-catalog.schema.json','utf8'))
const modernSchema=JSON.parse(await readFile('artifacts/agent-discovery-validation/ard-entry.schema.json','utf8'))
// These schemas use the draft-07-compatible keyword subset; the installed Ajv 6
// validates their structure and internal references with meta-validation disabled.
const ajv=new Ajv({validateSchema:false,allErrors:true,schemaId:'auto'})
if(!ajv.validate(legacySchema,catalog))throw Error(JSON.stringify(ajv.errors))
const modernManifest={...modernSchema,$ref:'#/$defs/ArdManifest'}
if(!ajv.validate(modernManifest,catalog))throw Error(JSON.stringify(ajv.errors))
for(const e of catalog.entries){if(e.representativeQueries.length<2||e.representativeQueries.length>5||new URL(e.url).origin!=='https://diario.dopovo.com.br'||!e.identifier.startsWith('urn:air:diario.dopovo.com.br:'))throw Error('Invalid resource metadata')}
const routes=JSON.parse(await readFile('public/_routes.json','utf8'))
const oldRoutes=JSON.parse(await readFile(`${base}/site/_routes.json`,'utf8'))
if(JSON.stringify(routes.include)!==JSON.stringify(oldRoutes.include)||oldRoutes.exclude.some(p=>!routes.exclude.includes(p)))throw Error('Existing routing changed')
for(const path of files.filter(p=>!p.startsWith('_')))if(!routes.exclude.includes('/'+path))throw Error(`Asset still routed through worker: ${path}`)
await mkdir(`${target}/site`,{recursive:true})
await cp(`${base}/site`,`${target}/site`,{recursive:true,force:false,errorOnExist:true})
for(const path of files){await mkdir(resolve(`${target}/site/${path}`,'..'),{recursive:true});await cp(`public/${path}`,`${target}/site/${path}`)}
async function walk(d,p=''){let r=[];for(const e of await readdir(d,{withFileTypes:true}))r.push(...(e.isDirectory()?await walk(`${d}/${e.name}`,p+e.name+'/'):[p+e.name]));return r}
const changed=[]
for(const path of await walk(`${target}/site`)){const b=await readFile(`${target}/site/${path}`);let a;try{a=await readFile(`${base}/site/${path}`)}catch{}if(!a||!a.equals(b))changed.push({path,sha256:sha(b)})}
if(changed.length!==files.length||changed.some(f=>!files.includes(f.path)))throw Error('Unexpected changes')
await writeFile(`${target}/release.json`,JSON.stringify({baseDeployment:'8bff8e70',workerSha256:sha(baseline),changed,validation:{legacySchemaSha256:sha(JSON.stringify(legacySchema)),modernSchemaSha256:sha(JSON.stringify(modernSchema)),llmsMarkdown:true,schemas:true},site:resolve(`${target}/site`)},null,2))
console.log(JSON.stringify({validated:['llms.txt Markdown','legacy catalog JSON Schema','modern ARD manifest JSON Schema','catalog aliases','static routes'],changed:changed.map(f=>f.path),workerUnchanged:true}))
