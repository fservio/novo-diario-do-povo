import { defineConfig } from 'vite'
import pages from '@hono/vite-cloudflare-pages'

export default defineConfig({
  plugins: [
    pages({
      entry: 'functions/index.ts'
    })
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      external: ['__STATIC_CONTENT_MANIFEST'],
    },
  },
  resolve: {
    alias: {
      '@jornal/core': '/packages/core',
      '@jornal/ui': '/packages/ui',
      '@jornal/tests': '/packages/tests',
    },
  },
})
