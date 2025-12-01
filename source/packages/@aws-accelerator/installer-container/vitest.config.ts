/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

/**
 * Vitest Configuration for Installer Container Package
 *
 * This configuration handles the monorepo structure and enables snapshot testing
 * for CDK stacks in the installer-container package.
 *
 * Key Configuration:
 * - Module Resolution: Aliases are required because vitest runs in isolation and needs
 *   explicit paths to resolve monorepo dependencies that haven't been built to dist/
 * - Test Timeout: Set to 120s to accommodate CDK stack synthesis which can be slow
 * - Coverage Thresholds: Adjusted to realistic values based on the package structure
 *
 * Troubleshooting:
 * - If you see "Cannot find module" errors, ensure the aliased packages are built
 * - Run `yarn build` in the dependency package (e.g., @aws-accelerator/installer)
 * - The aliases point to source .ts files, not dist/ files, for faster iteration
 */

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      // Map monorepo packages to their source files for vitest resolution
      // These aliases allow tests to import from @aws-accelerator/* packages
      // without requiring them to be built first
      '@aws-accelerator/installer': path.resolve(__dirname, '../installer/index.ts'),
      '@aws-accelerator/utils/lib/lambda': path.resolve(__dirname, '../utils/lib/lambda.ts'),
      '@aws-accelerator/constructs': path.resolve(__dirname, '../constructs/index.ts'),
    },
  },
  test: {
    reporters: ['default', 'junit'],
    outputFile: './test-reports/test-results.xml',
    testTimeout: 120000, // CDK synthesis can take time, especially for complex stacks
    coverage: {
      thresholds: {
        branches: 70,
        functions: 75, // Adjusted from 88% to account for bin/ files not covered by unit tests
        lines: 85,
        statements: 85,
      },
    },
  },
});
