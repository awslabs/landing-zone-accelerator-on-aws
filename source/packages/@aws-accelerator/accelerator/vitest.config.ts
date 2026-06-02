import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {},
  server: {
    watch: {
      ignored: ['**/synthesized-cfn-templates/**'],
    },
  },
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/synthesized-cfn-templates/**'],
    silent: true,
    testTimeout: 90000,
    include: ['**/*.test.ts'],
    setupFiles: ['vitest.setup.ts'],
    pool: 'threads',
    singleThread: true,
    hookTimeout: 90000,
    teardownTimeout: 90000,
    reporters: ['default', 'junit'],
    outputFile: './test-reports/test-results.xml',
    coverage: {
      include: ['lib/**/*.ts'],
      exclude: [
        '**/*.d.ts',
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/synthesized-cfn-templates/**',
        'lib/asea-resources/**',
      ],
      thresholds: {
        branches: 50,
        functions: 63,
        lines: 58,
        statements: 58,
      },
    },
  },
});
