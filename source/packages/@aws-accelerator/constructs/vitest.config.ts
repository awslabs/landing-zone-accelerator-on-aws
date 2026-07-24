import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['**/*.integration.test.ts', '**/dist/*', '**/node_modules/**'],
    include: ['**/*.test.ts'],
    passWithNoTests: true,
    setupFiles: ['./vitest.setup.ts'],
    reporters: ['default', 'junit'],
    outputFile: './test-reports/test-results.xml',
    coverage: {
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
