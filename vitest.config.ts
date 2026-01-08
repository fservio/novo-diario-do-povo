import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      thresholds: {
        lines: 85,
        functions: 85,
        statements: 85,
        branches: 80,
      },
      exclude: [
        'node_modules/**',
        'dist/**',
        '.wrangler/**',
        'coverage/**',
        '**/*.test.ts',
        '**/*.config.ts',
        'tests/**',
      ],
    },
  },
})
