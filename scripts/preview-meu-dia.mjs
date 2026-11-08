import {build} from 'vite'
import {writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
await build({configFile:false,publicDir:false,build:{outDir:'artifacts/meu-dia/preview-build',emptyOutDir:false,target:'es2022',minify:false,lib:{entry:resolve('artifacts/meu-dia/preview-entry.ts'),formats:['es'],fileName:()=> 'renderer.mjs'}}})
const {html,previewEventPages,suggestionPreview,savedPreviewScript}=await import('../artifacts/meu-dia/preview-build/renderer.mjs')
await writeFile('artifacts/meu-dia/sugerir-evento.html',suggestionPreview)
await writeFile('artifacts/meu-dia/culture-saved-preview.js',savedPreviewScript)
let preview=html.replaceAll('/agenda/sugerir','sugerir-evento.html')
for(const event of await previewEventPages()){
  const filename='agenda-'+event.slug+'.html'
  await writeFile('artifacts/meu-dia/'+event.slug+'.ics',event.calendar)
  preview=preview.replaceAll('/agenda/'+event.slug,filename)
  await writeFile('artifacts/meu-dia/'+filename,event.html)
}
await writeFile('artifacts/meu-dia/preview.html',preview)
