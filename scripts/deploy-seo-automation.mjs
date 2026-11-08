import { spawnSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
const target=process.argv.find(v=>v.startsWith('--target='))?.slice('--target='.length)||'artifacts/seo-automation-release'
const manifestPath=resolve(target,'release.json')
const release=JSON.parse(await readFile(manifestPath,'utf8'))
const cli=resolve('node_modules/wrangler/bin/wrangler.js')
function run(args){const r=spawnSync(process.execPath,[cli,...args],{encoding:'utf8',maxBuffer:8*1024*1024,windowsHide:true});if(r.status!==0)throw Error(r.stderr||r.stdout||'Deployment operation failed');return r.stdout}
const deployments=JSON.parse(run(['pages','deployment','list','--project-name','novo-diario-do-povo','--json']))
const current=deployments.find(d=>d.Environment==='Production')
if(process.argv.includes('--inspect-current')){
 console.log(JSON.stringify(deployments.filter(d=>d.Environment==='Production').slice(0,4),null,2));process.exit(0)
}
// Subsequent fixes may replace only the SEO deployment previously verified against the same base.
const expected=process.argv.find(v=>v.startsWith('--expected-current='))?.slice('--expected-current='.length)||release.baseDeployment
if(!/^[a-f0-9]{8}(?:-[a-f0-9-]{27,})?$/.test(expected)||!current||!current.Id.startsWith(expected))throw Error('Production changed since the isolated package was prepared. Rebase before deploying.')
const worker=await readFile(resolve(target,'site/_worker.js'))
if(createHash('sha256').update(worker).digest('hex')!==release.workerSha256)throw Error('SEO artifact checksum mismatch')
const output=run(['pages','deploy',resolve(target,'site'),'--project-name','novo-diario-do-povo','--branch',current.Branch,'--commit-dirty=true','--commit-message','SEO automation, metadata history and keyword fields'])
console.log(output)
const match=output.match(/https:\/\/([a-z0-9]+)\.novo-diario-do-povo\.pages\.dev/)
if(!match)throw Error('Deployment finished without a recognizable URL; inspect Cloudflare before retrying.')
await writeFile(manifestPath,JSON.stringify({...release,replacesDeployment:current.Id,deploymentId:match[1],productionUrl:'https://diario.dopovo.com.br',deployedAt:new Date().toISOString()},null,2))
