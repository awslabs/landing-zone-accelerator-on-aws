import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    reporters: ['default', 'junit'],
    outputFile: './test-reports/test-results.xml',
    pool: 'threads',
    silent: true,
    testTimeout: 300000,
    hookTimeout: 300000,
    teardownTimeout: 300000,
    coverage: {
      exclude: ['**/*.d.ts', '**/dist/**', '**/node_modules/**'],
      thresholds: {
        branches: 55,
        functions: 76,
        lines: 63,
        statements: 63,
      },
    },
  },
});
