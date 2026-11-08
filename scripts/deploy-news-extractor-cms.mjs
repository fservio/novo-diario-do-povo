import {spawnSync} from 'node:child_process'
import {readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {resolve} from 'node:path'
const target='artifacts/news-extractor-cms-production',path=target+'/release.json',release=JSON.parse(await readFile(path,'utf8'))
function run(args){const result=spawnSync(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),...args],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});if(result.status!==0)throw Error(result.stderr||result.stdout||'Cloudflare operation failed');return result.stdout}
const current=JSON.parse(run(['pages','deployment','list','--project-name','novo-diario-do-povo','--json'])).find(d=>d.Environment==='Production')
if(release.deploymentId&&current?.Id.startsWith(release.deploymentId)){console.log('Already deployed: '+release.deploymentId);process.exit(0)}
if(!current?.Id.startsWith(release.baseDeployment))throw Error('A produção mudou; revisar a base antes de publicar.')
if(createHash('sha256').update(await readFile(target+'/site/_worker.js')).digest('hex')!==release.workerSha256)throw Error('O pacote mudou após a verificação.')
const output=run(['pages','deploy',target+'/site','--project-name','novo-diario-do-povo','--branch',current.Branch,'--commit-dirty=true','--commit-message','Integrate CMS with private NewsExtractor and source removal'])
console.log(output)
const id=output.match(/https:\/\/([a-z0-9]+)\.novo-diario-do-povo\.pages\.dev/)?.[1]
if(!id)throw Error('Confirmar o resultado no Cloudflare antes de repetir a publicação.')
await writeFile(path,JSON.stringify({...release,replacesDeployment:current.Id,deploymentId:id,productionUrl:'https://diario.dopovo.com.br',deployedAt:new Date().toISOString()},null,2))
