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
    testTimeout: 180000,
    include: ['**/*.test.ts'],
    setupFiles: ['../../../vitest.shared-setup.ts', 'vitest.setup.ts'],
    // Threads share the CDK module graph across files; forks re-import it per
    // worker, which measured ~31% slower on this import-heavy suite. If the
    // vitest 4 native SIGABRT resurfaces (see vitest.setup.ts), fall back to
    // the default forks pool, which contains native crashes to one worker.
    pool: 'threads',
    hookTimeout: 300000,
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
        branches: 62,
        functions: 72,
        lines: 58,
        statements: 58,
      },
    },
  },
});
