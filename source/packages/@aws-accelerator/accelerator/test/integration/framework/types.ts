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

import { IAssumeRoleCredential, IModuleResponse } from 'aws-lza';
import { AcceleratorResourcePrefixes } from '../../../utils/app-utils';
import { ModuleParams } from '../../../lib/types';

/**
 * Test manifest schema for module integration tests.
 * Each manifest represents a single configuration variation to test.
 */
export interface TestManifest {
  /** Display name for test reporting */
  name: string;
  /** What this manifest tests */
  description: string;
  /** Execution order (manifests sorted ascending) */
  order: number;
  /** Module-specific configuration (uses logical account names) */
  moduleConfig: Record<string, unknown>;
  /** Expected assertions after execution */
  expectedAssertions: Record<string, unknown>;
  /** Optional: skip cleanup for this manifest (e.g., next manifest depends on this state) */
  skipCleanup?: boolean;
  /** Optional: create an external propagation in the prepare hook (ownership tests) */
  setupExternalPropagation?: boolean;
}

/**
 * Result of a single assertion check.
 */
export interface AssertionResult {
  /** Assertion name */
  name: string;
  /** Whether the assertion passed */
  passed: boolean;
  /** Actual value observed */
  actual?: unknown;
  /** Expected value */
  expected?: unknown;
  /** Human-readable message */
  message: string;
}

/**
 * Resolved environment for integration test execution.
 * Built from GitLab CI variables + ENV_MANIFEST at runtime.
 */
export interface ResolvedEnvironment {
  /** AWS partition */
  partition: string;
  /** Target region */
  region: string;
  /** Management account ID (resolved) */
  managementAccountId: string;
  /** Account name → ID mapping */
  accounts: Map<string, string>;
  /** STS credentials for management account */
  managementAccountCredentials?: IAssumeRoleCredential;
  /** Accelerator prefix (e.g., "AWSAccelerator") */
  prefix: string;
  /** Solution ID */
  solutionId: string;
  /** Resource prefixes */
  resourcePrefixes: AcceleratorResourcePrefixes;
  /** Logging config (bucket name, key ARN) */
  logging: {
    bucketName: string;
    bucketKeyArn: string;
  };
  /** Module infrastructure (deployed by create-module-infrastructure.sh) */
  moduleInfrastructure: {
    /** DynamoDB table name for module state: {prefix}-Module-State-{accountId}-{region} */
    stateTableName: string;
    /** DynamoDB table name for resource retention: {prefix}-Resource-Retention-{accountId}-{region} */
    retentionTableName: string;
  };
}

/**
 * Module test plugin interface.
 * Each module implements this to provide its specific handler, assertions, and lifecycle hooks.
 */
export interface ModuleTestPlugin {
  /** Module name (matches AcceleratorModules enum value) */
  moduleName: string;

  /** Build ModuleParams from manifest config + resolved environment */
  buildParams(manifest: TestManifest, environment: ResolvedEnvironment): Promise<ModuleParams>;

  /** Execute the module handler directly */
  execute(params: ModuleParams): Promise<IModuleResponse>;

  /** Assert AWS state matches expected assertions */
  assert(manifest: TestManifest, environment: ResolvedEnvironment): Promise<AssertionResult[]>;

  /** Optional: prepare pre-conditions before execution */
  prepare?(manifest: TestManifest, environment: ResolvedEnvironment): Promise<void>;

  /** Optional: cleanup after assertion */
  cleanup?(manifest: TestManifest, environment: ResolvedEnvironment): Promise<void>;
}

/**
 * Result of executing a single manifest through the lifecycle.
 */
export interface ManifestExecutionResult {
  /** Manifest that was executed */
  manifest: TestManifest;
  /** Module handler response */
  moduleResponse?: IModuleResponse;
  /** Assertion results */
  assertions: AssertionResult[];
  /** Whether execution succeeded (no errors in execute phase) */
  executionSuccess: boolean;
  /** Error if execution failed */
  error?: Error;
}
