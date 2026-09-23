import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Resolve .ts ahead of .js so an import and its matching vi.mock() bind to the
  // same module instance. accelerator:build compiles some utils modules in-place
  // (.js next to the .ts) and ships them via its `untracked` artifact into the
  // release:test:utils job; with Vite's default order (.js before .ts) the code
  // and the mock would resolve to different instances (.js vs .ts) and the mock
  // would silently not apply. This list replaces Vite's default rather than
  // extending it, so .json is kept for extensionless JSON imports.
  resolve: {
    extensions: ['.ts', '.js', '.json'],
  },
  test: {
    reporters: ['default', 'junit'],
    outputFile: './test-reports/test-results.xml',
    silent: true,
    coverage: {
      exclude: ['**/*.d.ts', '**/dist/**', '**/node_modules/**'],
      thresholds: {
        branches: 63,
        functions: 68,
        lines: 70,
        statements: 70,
      },
    },
  },
});
