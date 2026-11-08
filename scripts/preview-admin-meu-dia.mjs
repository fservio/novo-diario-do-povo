import {build} from 'vite'
import {resolve} from 'node:path'
await build({configFile:false,publicDir:false,build:{outDir:'artifacts/admin-meu-dia/build',emptyOutDir:false,target:'es2022',minify:false,lib:{entry:resolve('artifacts/admin-meu-dia/preview-entry.ts'),formats:['es'],fileName:()=> 'renderer.mjs'},rollupOptions:{external:['node:sqlite','node:fs']}}})
await import('../artifacts/admin-meu-dia/build/renderer.mjs')
