import {spawnSync} from 'node:child_process'
import {readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {resolve} from 'node:path'
const target=process.argv[2]||'artifacts/db-overload-release',path=target+'/release.json',release=JSON.parse(await readFile(path,'utf8'))
function run(args){const result=spawnSync(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),...args],{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});if(result.status!==0)throw Error(result.stderr||result.stdout||'Operação Cloudflare não concluída.');return result.stdout}
const current=JSON.parse(run(['pages','deployment','list','--project-name','novo-diario-do-povo','--json'])).find(d=>d.Environment==='Production')
const expected=process.argv.find(arg=>arg.startsWith('--expected-current='))?.split('=')[1]||release.baseDeployment
if(!/^[a-f0-9]{8}$/.test(expected)||!current?.Id.startsWith(expected))throw Error('A produção mudou. Atualize a base antes de publicar.')
const hash=createHash('sha256').update(await readFile(target+'/site/_worker.js')).digest('hex')
if(hash!==release.workerSha256)throw Error('O pacote mudou após a validação.')
const result=run(['pages','deploy',target+'/site','--project-name','novo-diario-do-povo','--branch',current.Branch,'--commit-dirty=true','--commit-message','Reduce D1 related-article reads and use a 24-hour recommendation window'])
console.log(result)
const id=result.match(/https:\/\/([a-z0-9]+)\.novo-diario-do-povo\.pages\.dev/)?.[1]
if(!id)throw Error('Confira o resultado no Cloudflare antes de repetir a publicação.')
await writeFile(path,JSON.stringify({...release,replacesDeployment:current.Id,deploymentId:id,productionUrl:'https://diario.dopovo.com.br',deployedAt:new Date().toISOString()},null,2))
