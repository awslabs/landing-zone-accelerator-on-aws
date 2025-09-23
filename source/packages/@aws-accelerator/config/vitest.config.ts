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
      thresholds: {
        branches: 64,
        functions: 76,
        lines: 60,
        statements: 60,
      },
    },
  },
});
