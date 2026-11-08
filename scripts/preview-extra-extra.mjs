import {build} from 'vite'
import {writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
await build({configFile:false,publicDir:false,build:{outDir:'artifacts/extra-extra/build',emptyOutDir:false,target:'es2022',minify:false,lib:{entry:resolve('artifacts/extra-extra/preview-entry.ts'),formats:['es'],fileName:()=> 'renderer.mjs'}}})
const {html}=await import('../artifacts/extra-extra/build/renderer.mjs')
await writeFile('artifacts/extra-extra/preview.html',html)
await build({configFile:false,publicDir:false,build:{outDir:'artifacts/extra-extra',emptyOutDir:false,target:'es2022',minify:false,lib:{entry:resolve('public/static/extra-extra.js'),formats:['iife'],name:'ExtraExtra',fileName:()=> 'game.js'}}})
