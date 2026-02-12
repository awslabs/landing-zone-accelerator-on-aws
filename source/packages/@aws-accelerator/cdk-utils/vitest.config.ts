import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['**/*.integration.test.ts', '**/dist/*', '**/node_modules/**'],
    include: ['**/*.test.ts'],
    passWithNoTests: true,
    reporters: ['default', 'junit'],
    outputFile: './test-reports/test-results.xml',
    coverage: {
      include: ['index.ts', 'lib/**/*.ts'],
      exclude: ['test/**', '**/*.test.ts', '**/*.d.ts'],
      thresholds: {
        branches: 70,
        functions: 70,
        lines: 40,
        statements: 40,
      },
    },
  },
});
