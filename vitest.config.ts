import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '.wrangler/**',
        '**/*.config.*',
        '**/validate.js',
      ],
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
