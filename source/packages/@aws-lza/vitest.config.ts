import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.test.unit.ts'],
    passWithNoTests: true,
    // Threads share the module graph across files; the default forks pool
    // re-imports it per worker, measured ~24% slower here.
    pool: 'threads',
    reporters: ['default', 'junit'],
    outputFile: './test-reports/test-results.xml',
    coverage: {
      include: ['lib/**', 'common/**', 'executors/**'],
      exclude: ['**/*.d.ts', '**/dist/**', '**/*.test.*', '**/node_modules/**', '**/test/**', '**/interfaces.ts'],
      thresholds: {
        branches: 70,
        functions: 70,
        lines: 70,
        statements: 70,
      },
    },
  },
});
