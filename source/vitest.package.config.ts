import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration optimized for running individual packages
 * Used by run-all-tests.sh for package-by-package execution
 *
 * Key optimizations:
 * - Sequential file execution (fileParallelism: false) to reduce memory overhead
 * - Isolated test environment per package
 */
export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/build/**'],
    silent: false,
    testTimeout: 180000,
    setupFiles: ['./vitest.setup.ts'],
    reporters: ['default', 'junit'],
    coverage: {
      reporter: ['lcov', 'text'],
      reportsDirectory: './coverage',
      all: false,
      clean: true,
    },
    pool: 'forks',
    isolate: true,
    fileParallelism: false,
  },
});
