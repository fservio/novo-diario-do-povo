import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: 'dist/static',
    emptyOutDir: false,
    target: 'es2022',
    minify: 'esbuild',
    sourcemap: false,
    lib: {
      entry: 'packages/core/admin/editor-client.ts',
      formats: ['es'],
      fileName: () => 'admin-editor.js'
    },
    rollupOptions: {
      output: { inlineDynamicImports: true }
    }
  }
})
