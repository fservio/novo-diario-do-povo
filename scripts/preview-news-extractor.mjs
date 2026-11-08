import {build} from 'vite'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
await mkdir('artifacts/news-extractor-cms',{recursive:true})
await build({configFile:false,publicDir:false,build:{outDir:'artifacts/news-extractor-cms/build',emptyOutDir:false,target:'es2022',minify:false,lib:{entry:resolve('artifacts/news-extractor-cms/preview-entry.ts'),formats:['es'],fileName:()=> 'renderer.mjs'},rollupOptions:{external:['node:fs']}}})
await import('../artifacts/news-extractor-cms/build/renderer.mjs')
