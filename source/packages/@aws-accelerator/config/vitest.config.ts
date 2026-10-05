import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    reporters: ['default', 'junit'],
    outputFile: './test-reports/test-results.xml',
    silent: true,
    testTimeout: 300000,
    hookTimeout: 300000,
    teardownTimeout: 300000,
    // Threads share the module graph across files; the default forks pool
    // re-imports it per worker, measured ~20% slower here.
    pool: 'threads',
    coverage: {
      reporter: ['text', 'json-summary'],
      reportsDirectory: './coverage',
      exclude: ['**/*.d.ts', '**/dist/**', '**/node_modules/**'],
      thresholds: {
        branches: 55,
        functions: 85,
        lines: 63,
        statements: 63,
      },
    },
  },
});
