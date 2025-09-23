import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.test.unit.ts'],
    passWithNoTests: true,
    reporters: ['default', 'junit'],
    outputFile: './test-reports/test-results.xml',
    coverage: {
      thresholds: {
        branches: 70,
        functions: 92,
        lines: 85,
        statements: 85,
      },
    },
  },
});
