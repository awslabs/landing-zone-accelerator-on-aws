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
 * @fileoverview Macie-specific assertions for integration tests.
 *
 * Uses executeApi from @aws-lza to wrap Macie SDK calls with throttling backoff
 * and standardized logging, plus shared state table assertions for DynamoDB verification.
 */

import {
  GetAutomatedDiscoveryConfigurationCommand,
  GetClassificationScopeCommand,
  GetFindingsPublicationConfigurationCommand,
  GetMacieSessionCommand,
  ListOrganizationAdminAccountsCommand,
  Macie2Client,
} from '@aws-sdk/client-macie2';
import { createLogger, executeApi, getCredentials } from 'aws-lza';
import path from 'node:path';
import { getModuleTestRoleName } from '../../framework/permissions-boundary';
import { assertStateTableEntry } from '../../framework/state-table-assertion';
import { AssertionResult, ResolvedEnvironment, TestManifest } from '../../framework/types';

const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * Assertion function type — takes manifest + environment, returns assertion results.
 */
type AssertionFn = (manifest: TestManifest, environment: ResolvedEnvironment) => Promise<AssertionResult[]>;

/**
 * Registry mapping expectedAssertions keys to assertion functions.
 */
const ASSERTION_REGISTRY: Record<string, AssertionFn> = {
  macieSessionEnabled: assertMacieSession,
  delegatedAdminConfigured: assertDelegatedAdmin,
  delegatedAdminRemoved: assertDelegatedAdminRemoved,
  findingsPublishingConfigured: assertFindingsPublishing,
  publishingFrequency: assertPublishingFrequency,
  regionIgnored: assertRegionIgnored,
  automatedDiscoveryEnabled: assertAutomatedDiscovery,
  classificationScopeExclusions: assertClassificationScopeExclusions,
};

/**
 * Create a Macie2Client with management account credentials.
 */
function createMacieClient(environment: ResolvedEnvironment): Macie2Client {
  return new Macie2Client({
    region: environment.region,
    credentials: environment.managementAccountCredentials
      ? {
          accessKeyId: environment.managementAccountCredentials.accessKeyId,
          secretAccessKey: environment.managementAccountCredentials.secretAccessKey,
          sessionToken: environment.managementAccountCredentials.sessionToken,
        }
      : undefined,
  });
}

/**
 * Run all assertions for a Macie manifest.
 *
 * Iterates over expectedAssertions keys, dispatches to registered assertion functions,
 * and appends state table assertions.
 */
export async function runMacieAssertions(
  manifest: TestManifest,
  environment: ResolvedEnvironment,
): Promise<AssertionResult[]> {
  const results: AssertionResult[] = [];

  for (const key of Object.keys(manifest.expectedAssertions)) {
    const assertionFn = ASSERTION_REGISTRY[key];
    if (assertionFn) {
      const fnResults = await assertionFn(manifest, environment);
      results.push(...fnResults);
    } else {
      logger.warn(`No assertion function registered for key: ${key}`);
      results.push({
        name: key,
        passed: false,
        message: `No assertion function registered for key: ${key}`,
      });
    }
  }

  // Always assert state table entry after execution
  const stateResults = await assertStateTableEntry(environment, {
    serviceName: 'macie',
    expectedStatus: 'completed',
  });
  results.push(...stateResults);

  return results;
}

const LOG_PREFIX = 'MacieAssertions';

/**
 * Assert Macie session is enabled or disabled via GetMacieSession.
 */
async function assertMacieSession(
  manifest: TestManifest,
  environment: ResolvedEnvironment,
): Promise<AssertionResult[]> {
  const expected = manifest.expectedAssertions['macieSessionEnabled'] as boolean;
  const client = createMacieClient(environment);

  try {
    const response = await executeApi(
      'GetMacieSessionCommand',
      {},
      () => client.send(new GetMacieSessionCommand({})),
      logger,
      LOG_PREFIX,
    );
    const status = response.status; // 'ENABLED' or 'PAUSED'
    const isEnabled = status === 'ENABLED';
    const expectedStatus = expected ? 'ENABLED' : 'PAUSED';
    const passed = isEnabled === expected;

    return [
      {
        name: 'macieSessionEnabled',
        passed,
        actual: status,
        expected: expectedStatus,
        message: passed
          ? `Macie session status: ${status}`
          : `Macie session status mismatch: expected ${expectedStatus}, got ${status}`,
      },
    ];
  } catch (error: unknown) {
    if (expected === false) {
      return [
        {
          name: 'macieSessionEnabled',
          passed: true,
          actual: 'NOT_ENABLED',
          expected: 'NOT_ENABLED',
          message: 'Macie session not enabled (expected)',
        },
      ];
    }
    const msg = error instanceof Error ? error.message : String(error);
    return [
      {
        name: 'macieSessionEnabled',
        passed: false,
        message: `Failed to get Macie session: ${msg}`,
      },
    ];
  }
}

/**
 * Assert delegated admin account is configured via ListOrganizationAdminAccounts.
 */
async function assertDelegatedAdmin(
  manifest: TestManifest,
  environment: ResolvedEnvironment,
): Promise<AssertionResult[]> {
  const delegatedAdminName = manifest.moduleConfig['delegatedAdminAccount'] as string;
  const expectedAccountId = environment.accounts.get(delegatedAdminName);
  const client = createMacieClient(environment);

  try {
    const response = await executeApi(
      'ListOrganizationAdminAccountsCommand',
      {},
      () => client.send(new ListOrganizationAdminAccountsCommand({})),
      logger,
      LOG_PREFIX,
    );
    const adminAccounts = response.adminAccounts ?? [];
    const found = adminAccounts.some(a => a.accountId === expectedAccountId && a.status === 'ENABLED');

    return [
      {
        name: 'delegatedAdminConfigured',
        passed: found,
        actual: adminAccounts.map(a => `${a.accountId}:${a.status}`).join(', ') || 'none',
        expected: `${expectedAccountId}:ENABLED`,
        message: found
          ? `Delegated admin ${expectedAccountId} is configured`
          : `Delegated admin ${expectedAccountId} not found in admin accounts`,
      },
    ];
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return [
      {
        name: 'delegatedAdminConfigured',
        passed: false,
        message: `Failed to list admin accounts: ${msg}`,
      },
    ];
  }
}

/**
 * Assert delegated admin has been removed (for disable manifests).
 */
async function assertDelegatedAdminRemoved(
  _manifest: TestManifest,
  environment: ResolvedEnvironment,
): Promise<AssertionResult[]> {
  const client = createMacieClient(environment);

  try {
    const response = await executeApi(
      'ListOrganizationAdminAccountsCommand',
      {},
      () => client.send(new ListOrganizationAdminAccountsCommand({})),
      logger,
      LOG_PREFIX,
    );
    const adminAccounts = response.adminAccounts ?? [];
    const hasEnabled = adminAccounts.some(a => a.status === 'ENABLED');
    const isRemoved = !hasEnabled;
    const actualDisplay =
      adminAccounts.length > 0 ? adminAccounts.map(a => `${a.accountId}:${a.status}`).join(', ') : 'none';

    return [
      {
        name: 'delegatedAdminRemoved',
        passed: isRemoved,
        actual: actualDisplay,
        expected: 'no enabled admin accounts',
        message: isRemoved
          ? 'No enabled delegated admin accounts (expected after disable)'
          : `Found enabled admin accounts: ${adminAccounts.map(a => a.accountId).join(', ')}`,
      },
    ];
  } catch (error: unknown) {
    // If Macie is fully disabled, this API may throw — acceptable for "removed" assertion
    const msg = error instanceof Error ? error.message : String(error);
    logger.info(`Macie API not accessible (${msg}) — treating as admin removed (expected after full disable)`);
    return [
      {
        name: 'delegatedAdminRemoved',
        passed: true,
        message: 'Macie API not accessible (expected after full disable)',
      },
    ];
  }
}

/**
 * Assert findings publishing configuration is set.
 */
async function assertFindingsPublishing(
  manifest: TestManifest,
  environment: ResolvedEnvironment,
): Promise<AssertionResult[]> {
  const client = createMacieClient(environment);

  try {
    const response = await executeApi(
      'GetFindingsPublicationConfigurationCommand',
      {},
      () => client.send(new GetFindingsPublicationConfigurationCommand({})),
      logger,
      LOG_PREFIX,
    );
    const securityHubConfig = response.securityHubConfiguration;
    const hasConfig = securityHubConfig !== undefined;

    return [
      {
        name: 'findingsPublishingConfigured',
        passed: hasConfig,
        actual: hasConfig ? JSON.stringify(securityHubConfig) : 'not configured',
        message: hasConfig ? 'Findings publishing configuration is set' : 'Findings publishing configuration not found',
      },
    ];
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return [
      {
        name: 'findingsPublishingConfigured',
        passed: false,
        message: `Failed to get findings publication config: ${msg}`,
      },
    ];
  }
}

/**
 * Assert publishing frequency matches expected value.
 */
async function assertPublishingFrequency(
  manifest: TestManifest,
  environment: ResolvedEnvironment,
): Promise<AssertionResult[]> {
  const expectedFrequency = manifest.expectedAssertions['publishingFrequency'] as string;
  const client = createMacieClient(environment);

  try {
    const response = await executeApi(
      'GetMacieSessionCommand',
      {},
      () => client.send(new GetMacieSessionCommand({})),
      logger,
      LOG_PREFIX,
    );
    const actualFrequency = response.findingPublishingFrequency;

    return [
      {
        name: 'publishingFrequency',
        passed: actualFrequency === expectedFrequency,
        actual: actualFrequency,
        expected: expectedFrequency,
        message:
          actualFrequency === expectedFrequency
            ? `Publishing frequency matches: ${actualFrequency}`
            : `Publishing frequency mismatch: expected ${expectedFrequency}, got ${actualFrequency}`,
      },
    ];
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return [
      {
        name: 'publishingFrequency',
        passed: false,
        message: `Failed to get Macie session for frequency check: ${msg}`,
      },
    ];
  }
}

/**
 * Assert Macie is NOT enabled in the ignored region.
 *
 * Ignored regions are never touched by the module — Macie should not be enabled there.
 * The expectedAssertions value is the region name (e.g. "eu-west-1").
 */
async function assertRegionIgnored(
  manifest: TestManifest,
  environment: ResolvedEnvironment,
): Promise<AssertionResult[]> {
  const ignoredRegion = manifest.expectedAssertions['regionIgnored'] as string;

  const client = new Macie2Client({
    region: ignoredRegion,
    credentials: environment.managementAccountCredentials
      ? {
          accessKeyId: environment.managementAccountCredentials.accessKeyId,
          secretAccessKey: environment.managementAccountCredentials.secretAccessKey,
          sessionToken: environment.managementAccountCredentials.sessionToken,
        }
      : undefined,
  });

  try {
    const response = await executeApi(
      'GetMacieSessionCommand',
      {},
      () => client.send(new GetMacieSessionCommand({})),
      logger,
      LOG_PREFIX,
    );
    const isEnabled = response.status === 'ENABLED';

    return [
      {
        name: 'regionIgnored',
        passed: !isEnabled,
        actual: response.status,
        expected: 'NOT ENABLED',
        message: isEnabled
          ? `Macie is ENABLED in ignored region ${ignoredRegion} (should not be)`
          : `Macie is not enabled in ignored region ${ignoredRegion} (expected)`,
      },
    ];
  } catch (error: unknown) {
    // AccessDeniedException = "Macie is not enabled" — this is the expected case
    const errorMessage = error instanceof Error ? error.message : String(error);
    return [
      {
        name: 'regionIgnored',
        passed: true,
        actual: 'NOT_ENABLED',
        expected: 'NOT_ENABLED',
        message: `Macie not enabled in ignored region ${ignoredRegion} (expected: ${errorMessage})`,
      },
    ];
  }
}

/**
 * Create a Macie2Client with delegated admin (Audit) account credentials.
 *
 * GetAutomatedDiscoveryConfiguration and GetClassificationScope are delegated-admin-only APIs,
 * so we need to assume a role into the Audit account to call them.
 *
 * @param manifest - Test manifest containing delegated admin account name
 * @param environment - Resolved test environment
 * @param region - Optional AWS region override. Defaults to environment.region.
 */
async function createDelegatedAdminMacieClient(
  manifest: TestManifest,
  environment: ResolvedEnvironment,
  region?: string,
): Promise<Macie2Client> {
  const targetRegion = region ?? environment.region;
  const delegatedAdminName = manifest.moduleConfig['delegatedAdminAccount'] as string;
  const delegatedAdminAccountId = environment.accounts.get(delegatedAdminName);
  if (!delegatedAdminAccountId) {
    throw new Error(
      `Cannot resolve delegated admin account "${delegatedAdminName}". ` +
        `Available accounts: ${[...environment.accounts.keys()].join(', ')}`,
    );
  }

  const accessRole = getModuleTestRoleName('macie');

  const credentials = await getCredentials({
    accountId: delegatedAdminAccountId,
    region: targetRegion,
    partition: environment.partition,
    assumeRoleName: accessRole,
    solutionId: 'LzaIntegTest',
    logPrefix: LOG_PREFIX,
    credentials: environment.managementAccountCredentials,
  });

  return new Macie2Client({
    region: targetRegion,
    credentials: credentials
      ? {
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
          sessionToken: credentials.sessionToken,
        }
      : undefined,
  });
}

/**
 * Assert automated sensitive data discovery is enabled/disabled and autoEnableOrganizationMembers matches.
 *
 * Runs GetAutomatedDiscoveryConfiguration on the delegated admin account.
 * expectedAssertions value: true (enabled) or false (disabled).
 */
async function assertAutomatedDiscovery(
  manifest: TestManifest,
  environment: ResolvedEnvironment,
): Promise<AssertionResult[]> {
  const expected = manifest.expectedAssertions['automatedDiscoveryEnabled'] as boolean;

  try {
    const client = await createDelegatedAdminMacieClient(manifest, environment);
    const response = await client.send(new GetAutomatedDiscoveryConfigurationCommand({}));

    const results: AssertionResult[] = [];

    // Check discovery status
    const actualStatus = response.status; // 'ENABLED' or 'DISABLED'
    const expectedStatus = expected ? 'ENABLED' : 'DISABLED';
    const statusPassed = actualStatus === expectedStatus;
    results.push({
      name: 'automatedDiscoveryStatus',
      passed: statusPassed,
      actual: actualStatus,
      expected: expectedStatus,
      message: statusPassed
        ? `Automated discovery status: ${actualStatus}`
        : `Automated discovery status mismatch: expected ${expectedStatus}, got ${actualStatus}`,
    });

    // Check autoEnableOrganizationMembers
    const actualAutoEnable = response.autoEnableOrganizationMembers;
    const expectedAutoEnable = expected ? 'ALL' : 'NONE';
    const autoEnablePassed = actualAutoEnable === expectedAutoEnable;
    results.push({
      name: 'automatedDiscoveryAutoEnable',
      passed: autoEnablePassed,
      actual: actualAutoEnable,
      expected: expectedAutoEnable,
      message: autoEnablePassed
        ? `autoEnableOrganizationMembers: ${actualAutoEnable}`
        : `autoEnableOrganizationMembers mismatch: expected ${expectedAutoEnable}, got ${actualAutoEnable}`,
    });

    return results;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return [
      {
        name: 'automatedDiscoveryStatus',
        passed: false,
        message: `Failed to get automated discovery configuration: ${msg}`,
      },
    ];
  }
}

/**
 * Assert classification scope exclusions match expected bucket names per region.
 *
 * Runs GetClassificationScope on the delegated admin account in each region specified
 * in the expectedAssertions. The Macie UpdateClassificationScope API is regional —
 * each region's scope should only contain buckets that reside in that region.
 *
 * expectedAssertions value: Record<string, string[]> mapping region to expected bucket names.
 * Example: { "us-east-1": ["bucket-a"], "ca-central-1": ["bucket-b"] }
 *
 * Also supports legacy flat array format (string[]) for backward compatibility,
 * which asserts against environment.region only.
 */
async function assertClassificationScopeExclusions(
  manifest: TestManifest,
  environment: ResolvedEnvironment,
): Promise<AssertionResult[]> {
  const raw = manifest.expectedAssertions['classificationScopeExclusions'];

  // Support both per-region object and legacy flat array format
  let regionBucketMap: Record<string, string[]>;
  if (Array.isArray(raw)) {
    // Legacy format: flat array — assert against environment.region
    regionBucketMap = { [environment.region]: raw as string[] };
  } else {
    regionBucketMap = raw as Record<string, string[]>;
  }

  const results: AssertionResult[] = [];

  for (const [region, expectedBuckets] of Object.entries(regionBucketMap)) {
    try {
      const client = await createDelegatedAdminMacieClient(manifest, environment, region);

      // Get the classification scope ID from automated discovery config
      const discoveryResponse = await client.send(new GetAutomatedDiscoveryConfigurationCommand({}));

      const scopeId = discoveryResponse.classificationScopeId;
      if (!scopeId) {
        results.push({
          name: `classificationScopeExclusions:${region}`,
          passed: false,
          message: `No classificationScopeId found in automated discovery configuration in ${region}`,
        });
        continue;
      }

      // Get the classification scope details
      const scopeResponse = await client.send(new GetClassificationScopeCommand({ id: scopeId }));

      const actualBuckets = scopeResponse.s3?.excludes?.bucketNames ?? [];
      const sortedActual = [...actualBuckets].sort();
      const sortedExpected = [...expectedBuckets].sort();

      // Check that all expected buckets are present in the exclusion list
      const missingBuckets = sortedExpected.filter(bucket => !sortedActual.includes(bucket));
      const allExpectedPresent = missingBuckets.length === 0;

      results.push({
        name: `classificationScopeExclusions:${region}`,
        passed: allExpectedPresent,
        actual: sortedActual.join(', '),
        expected: sortedExpected.join(', '),
        message: allExpectedPresent
          ? `[${region}] All expected buckets found in classification scope exclusions (${sortedExpected.length} bucket(s))`
          : `[${region}] Missing buckets in classification scope exclusions: ${missingBuckets.join(', ')}`,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      results.push({
        name: `classificationScopeExclusions:${region}`,
        passed: false,
        message: `[${region}] Failed to get classification scope: ${msg}`,
      });
    }
  }

  return results;
}
