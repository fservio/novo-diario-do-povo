import {build} from 'vite'
import {resolve} from 'node:path'
await build({configFile:false,publicDir:false,build:{outDir:'artifacts/guias-evergreen/preview-build',emptyOutDir:false,target:'es2022',minify:false,lib:{entry:resolve('artifacts/guias-evergreen/preview-entry.ts'),formats:['es'],fileName:()=> 'renderer.mjs'},rollupOptions:{external:['node:module','node:fs','node:sqlite']}}})
await import('../artifacts/guias-evergreen/preview-build/renderer.mjs')
