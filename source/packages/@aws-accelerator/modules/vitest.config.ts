import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.test.unit.ts'],
    passWithNoTests: true,
    setupFiles: ['../../../vitest.shared-setup.ts'],
    // Threads share the module graph across files; the default forks pool
    // re-imports it per worker, measured ~31% slower here. Fall back to forks
    // only if the vitest 4 native SIGABRT resurfaces.
    pool: 'threads',
    reporters: ['default', 'junit'],
    outputFile: './test-reports/test-results.xml',
  },
});
