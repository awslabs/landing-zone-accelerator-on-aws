import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {},
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/build/**'],
    silent: true,
    testTimeout: 90000,
    include: ['**/*.test.ts'],
    setupFiles: ['vitest.setup.ts'],
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
    hookTimeout: 90000,
    teardownTimeout: 90000,
    reporters: ['default', 'junit'],
    outputFile: './test-reports/test-results.xml',
    coverage: {
      include: ['**/*.ts'],
      exclude: [
        '*.d.ts',
        'integ.*.ts',
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '/lib/asea-resources/',
        'app-lib.ts',
        'import-asea-resources-stack.ts',
        'import-stack-resources.ts',
        'stack-utils.ts',
      ],
      thresholds: {
        branches: 70,
        functions: 78,
        lines: 63,
        statements: 63,
      },
    },
  },
});
