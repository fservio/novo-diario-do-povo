import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
const root = process.argv[2] || 'artifacts/story-audio-release'
await mkdir(root,{recursive:true})
await cp('dist',`${root}/site`,{recursive:true,errorOnExist:true,force:false})
async function entries(folder,prefix='') {
  const result=[]
  for (const entry of await readdir(folder,{withFileTypes:true})) {
    const name=prefix+entry.name
    if (entry.isDirectory()) result.push(...await entries(`${folder}/${entry.name}`,name+'/'))
    else result.push({path:name,sha256:createHash('sha256').update(await readFile(`${folder}/${entry.name}`)).digest('hex')})
  }
  return result.sort((a,b)=>a.path.localeCompare(b.path))
}
const manifest=await entries(`${root}/site`)
const digest=createHash('sha256').update(JSON.stringify(manifest)).digest('hex')
await writeFile(`${root}/manifest.json`,JSON.stringify({digest,files:manifest},null,2))
await writeFile(`${root}/working-tree.patch`,execFileSync('git',['diff','--no-ext-diff'],{encoding:'utf8'}))
const added=['packages/core/instagram/audio.ts','packages/core/instagram/audio-ui.ts','migrations/0045_instagram_audio_stories.sql','infra/story-renderer/server.py','infra/story-renderer/compose.yaml','infra/story-renderer/Dockerfile','tests/unit/instagram-audio.test.ts']
for (const file of added) { const target=`${root}/sources/${file}`; await mkdir(target.slice(0,target.lastIndexOf('/')),{recursive:true}); await cp(file,target) }
console.log(JSON.stringify({release:root,files:manifest.length,manifest_sha256:digest}))
