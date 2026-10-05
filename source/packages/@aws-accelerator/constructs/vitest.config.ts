import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['**/*.integration.test.ts', '**/dist/*', '**/node_modules/**'],
    include: ['**/*.test.ts'],
    passWithNoTests: true,
    testTimeout: 180000,
    hookTimeout: 300000,
    setupFiles: ['./vitest.setup.ts'],
    // Threads share the CDK module graph across files; the default forks pool
    // re-imports it per worker, measured ~31% slower on this large suite.
    pool: 'threads',
    reporters: ['default', 'junit'],
    outputFile: './test-reports/test-results.xml',
    coverage: {
      reporter: ['text', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['**/*.ts'],
      exclude: ['**/*.d.ts', '**/dist/**', '**/node_modules/**', '**/test/**'],
      thresholds: {
        branches: 12,
        functions: 18,
        lines: 16,
        statements: 16,
      },
    },
  },
});
