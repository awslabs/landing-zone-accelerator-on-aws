import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    reporters: ['default', 'junit'],
    outputFile: './test-reports/test-results.xml',
    coverage: {
      reporter: ['text', 'json-summary'],
      reportsDirectory: './coverage',
      exclude: ['**/*.d.ts', '**/dist/**', '**/node_modules/**'],
      thresholds: {
        branches: 48,
        functions: 92,
        lines: 85,
        statements: 85,
      },
    },
  },
});
