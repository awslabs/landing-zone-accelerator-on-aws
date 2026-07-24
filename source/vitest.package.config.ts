import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration optimized for running individual packages
 * Used by run-all-tests.sh for package-by-package execution
 *
 * Key optimizations:
 * - Single fork pool to reduce memory overhead
 * - Controlled worker count
 * - Isolated test environment per package
 */
export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/build/**'],
    silent: false,
    testTimeout: 90000,
    setupFiles: ['./vitest.setup.ts'],
    reporters: ['default', 'junit'],
    coverage: {
      reporter: ['lcov', 'text'],
      reportsDirectory: './coverage',
      all: false,
      clean: true,
    },
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    isolate: true,
    fileParallelism: false,
  },
});
