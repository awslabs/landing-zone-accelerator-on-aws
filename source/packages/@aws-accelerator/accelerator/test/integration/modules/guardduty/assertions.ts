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
 * @fileoverview GuardDuty-specific assertions for integration tests.
 *
 * Uses executeApi from @aws-lza to wrap GuardDuty SDK calls with throttling backoff
 * and standardized logging, plus shared state table assertions for DynamoDB verification.
 */

import {
  DescribeOrganizationConfigurationCommand,
  GetDetectorCommand,
  GuardDutyClient,
  ListDetectorsCommand,
  ListMembersCommand,
  ListOrganizationAdminAccountsCommand,
  ListPublishingDestinationsCommand,
} from '@aws-sdk/client-guardduty';
import { ListAWSServiceAccessForOrganizationCommand, OrganizationsClient } from '@aws-sdk/client-organizations';
import { createLogger, executeApi, getCredentials } from 'aws-lza';
import path from 'node:path';
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
  detectorEnabled: assertDetectorEnabled,
  delegatedAdminConfigured: assertDelegatedAdmin,
  delegatedAdminRemoved: assertDelegatedAdminRemoved,
  autoEnableOrgMembers: assertAutoEnableOrgMembers,
  exportDestinationConfigured: assertExportDestination,
  regionIgnored: assertRegionIgnored,
  protectionsEnabled: assertProtectionsEnabled,
  malwareProtectionTrustedAccess: assertMalwareProtectionTrustedAccess,
  memberBoundary: assertMemberBoundary,
};

const LOG_PREFIX = 'GuardDutyAssertions';

const GUARDDUTY_MALWARE_PROTECTION_SERVICE_PRINCIPAL = 'malware-protection.guardduty.amazonaws.com';

/**
 * Create a GuardDutyClient with management account credentials.
 */
function createGuardDutyClient(environment: ResolvedEnvironment, region?: string): GuardDutyClient {
  return new GuardDutyClient({
    region: region ?? environment.region,
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
 * Get the detector ID for the current region. Returns undefined if no detector exists.
 */
async function getDetectorId(client: GuardDutyClient): Promise<string | undefined> {
  const response = await executeApi(
    'ListDetectorsCommand',
    {},
    () => client.send(new ListDetectorsCommand({})),
    logger,
    LOG_PREFIX,
  );
  return response.DetectorIds?.[0];
}

/**
 * Run all assertions for a GuardDuty manifest.
 *
 * Iterates over expectedAssertions keys, dispatches to registered assertion functions,
 * and appends state table assertions.
 */
export async function runGuardDutyAssertions(
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
    serviceName: 'guardduty',
    expectedStatus: 'completed',
  });
  results.push(...stateResults);

  return results;
}

/**
 * Assert GuardDuty detector is enabled or disabled via ListDetectors + GetDetector.
 */
async function assertDetectorEnabled(
  manifest: TestManifest,
  environment: ResolvedEnvironment,
): Promise<AssertionResult[]> {
  const expected = manifest.expectedAssertions['detectorEnabled'] as boolean;
  const client = createGuardDutyClient(environment);

  try {
    const detectorId = await getDetectorId(client);

    if (!detectorId) {
      // No detector found
      const passed = expected === false;
      return [
        {
          name: 'detectorEnabled',
          passed,
          actual: 'NO_DETECTOR',
          expected: expected ? 'ENABLED' : 'NO_DETECTOR',
          message: passed
            ? 'No GuardDuty detector found (expected when disabled)'
            : 'No GuardDuty detector found but expected one to be enabled',
        },
      ];
    }

    const detectorResponse = await executeApi(
      'GetDetectorCommand',
      { DetectorId: detectorId },
      () => client.send(new GetDetectorCommand({ DetectorId: detectorId })),
      logger,
      LOG_PREFIX,
    );

    const status = detectorResponse.Status; // 'ENABLED' or 'DISABLED'
    const isEnabled = status === 'ENABLED';
    const expectedStatus = expected ? 'ENABLED' : 'DISABLED';
    const passed = isEnabled === expected;

    return [
      {
        name: 'detectorEnabled',
        passed,
        actual: status,
        expected: expectedStatus,
        message: passed
          ? `GuardDuty detector status: ${status}`
          : `GuardDuty detector status mismatch: expected ${expectedStatus}, got ${status}`,
      },
    ];
  } catch (error: unknown) {
    if (expected === false) {
      return [
        {
          name: 'detectorEnabled',
          passed: true,
          actual: 'NOT_ENABLED',
          expected: 'NOT_ENABLED',
          message: 'GuardDuty detector not enabled (expected)',
        },
      ];
    }
    const msg = error instanceof Error ? error.message : String(error);
    return [
      {
        name: 'detectorEnabled',
        passed: false,
        message: `Failed to get GuardDuty detector: ${msg}`,
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
  const client = createGuardDutyClient(environment);

  try {
    const response = await executeApi(
      'ListOrganizationAdminAccountsCommand',
      {},
      () => client.send(new ListOrganizationAdminAccountsCommand({})),
      logger,
      LOG_PREFIX,
    );
    const adminAccounts = response.AdminAccounts ?? [];
    const found = adminAccounts.some(a => a.AdminAccountId === expectedAccountId && a.AdminStatus === 'ENABLED');

    return [
      {
        name: 'delegatedAdminConfigured',
        passed: found,
        actual: adminAccounts.map(a => `${a.AdminAccountId}:${a.AdminStatus}`).join(', ') || 'none',
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
  const client = createGuardDutyClient(environment);

  try {
    const response = await executeApi(
      'ListOrganizationAdminAccountsCommand',
      {},
      () => client.send(new ListOrganizationAdminAccountsCommand({})),
      logger,
      LOG_PREFIX,
    );
    const adminAccounts = response.AdminAccounts ?? [];
    const hasEnabled = adminAccounts.some(a => a.AdminStatus === 'ENABLED');
    const isRemoved = !hasEnabled;
    const actualDisplay =
      adminAccounts.length > 0 ? adminAccounts.map(a => `${a.AdminAccountId}:${a.AdminStatus}`).join(', ') : 'none';

    return [
      {
        name: 'delegatedAdminRemoved',
        passed: isRemoved,
        actual: actualDisplay,
        expected: 'no enabled admin accounts',
        message: isRemoved
          ? 'No enabled delegated admin accounts (expected after disable)'
          : `Found enabled admin accounts: ${adminAccounts.map(a => a.AdminAccountId).join(', ')}`,
      },
    ];
  } catch (error: unknown) {
    // If GuardDuty is fully disabled, this API may throw — acceptable for "removed" assertion
    const msg = error instanceof Error ? error.message : String(error);
    logger.info(`GuardDuty API not accessible (${msg}) — treating as admin removed (expected after full disable)`);
    return [
      {
        name: 'delegatedAdminRemoved',
        passed: true,
        message: 'GuardDuty API not accessible (expected after full disable)',
      },
    ];
  }
}

/**
 * Assert autoEnableOrgMembers matches expected value (NEW or NONE).
 *
 * Runs DescribeOrganizationConfiguration on the delegated admin account.
 */
async function assertAutoEnableOrgMembers(
  manifest: TestManifest,
  environment: ResolvedEnvironment,
): Promise<AssertionResult[]> {
  const expected = manifest.expectedAssertions['autoEnableOrgMembers'] as string;

  try {
    const client = await createDelegatedAdminGuardDutyClient(manifest, environment);
    const detectorId = await getDetectorId(client);

    if (!detectorId) {
      return [
        {
          name: 'autoEnableOrgMembers',
          passed: false,
          message: 'No detector found on delegated admin account — cannot check org configuration',
        },
      ];
    }

    const response = await executeApi(
      'DescribeOrganizationConfigurationCommand',
      { DetectorId: detectorId },
      () => client.send(new DescribeOrganizationConfigurationCommand({ DetectorId: detectorId })),
      logger,
      LOG_PREFIX,
    );

    const actual = response.AutoEnableOrganizationMembers; // 'NEW', 'ALL', or 'NONE'
    const passed = actual === expected;

    return [
      {
        name: 'autoEnableOrgMembers',
        passed,
        actual,
        expected,
        message: passed
          ? `AutoEnableOrganizationMembers: ${actual}`
          : `AutoEnableOrganizationMembers mismatch: expected ${expected}, got ${actual}`,
      },
    ];
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return [
      {
        name: 'autoEnableOrgMembers',
        passed: false,
        message: `Failed to describe organization configuration: ${msg}`,
      },
    ];
  }
}

/**
 * Assert findings export (publishing) destination is configured.
 *
 * Runs ListPublishingDestinations on the delegated admin account to verify
 * an S3 export destination exists.
 */
async function assertExportDestination(
  manifest: TestManifest,
  environment: ResolvedEnvironment,
): Promise<AssertionResult[]> {
  const expected = manifest.expectedAssertions['exportDestinationConfigured'] as boolean;

  try {
    const client = await createDelegatedAdminGuardDutyClient(manifest, environment);
    const detectorId = await getDetectorId(client);

    if (!detectorId) {
      return [
        {
          name: 'exportDestinationConfigured',
          passed: expected === false,
          actual: 'NO_DETECTOR',
          expected: expected ? 'HAS_DESTINATION' : 'NO_DETECTOR',
          message: expected
            ? 'No detector found — cannot verify export destination'
            : 'No detector found (expected when export not configured)',
        },
      ];
    }

    const response = await executeApi(
      'ListPublishingDestinationsCommand',
      { DetectorId: detectorId },
      () => client.send(new ListPublishingDestinationsCommand({ DetectorId: detectorId })),
      logger,
      LOG_PREFIX,
    );

    const destinations = response.Destinations ?? [];
    const hasS3Destination = destinations.some(d => d.DestinationType === 'S3');
    const passed = hasS3Destination === expected;

    let message: string;
    if (passed && hasS3Destination) {
      message = `Export destination configured: S3 (${destinations.length} destination(s))`;
    } else if (passed) {
      message = 'No export destination configured (expected)';
    } else if (hasS3Destination) {
      message = 'Export destination found but none expected';
    } else {
      message = 'No export destination found but expected one';
    }

    return [
      {
        name: 'exportDestinationConfigured',
        passed,
        actual: hasS3Destination ? `S3 (${destinations.length} destination(s))` : 'none',
        expected: expected ? 'S3 destination configured' : 'no destination',
        message,
      },
    ];
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return [
      {
        name: 'exportDestinationConfigured',
        passed: false,
        message: `Failed to list publishing destinations: ${msg}`,
      },
    ];
  }
}

/**
 * Assert GuardDuty is NOT enabled in the ignored region.
 *
 * Ignored regions are never touched by the module — GuardDuty should not be enabled there.
 * The expectedAssertions value is the region name (e.g. "eu-west-1").
 */
async function assertRegionIgnored(
  manifest: TestManifest,
  environment: ResolvedEnvironment,
): Promise<AssertionResult[]> {
  const ignoredRegion = manifest.expectedAssertions['regionIgnored'] as string;

  const client = createGuardDutyClient(environment, ignoredRegion);

  try {
    const detectorId = await getDetectorId(client);

    if (!detectorId) {
      return [
        {
          name: 'regionIgnored',
          passed: true,
          actual: 'NO_DETECTOR',
          expected: 'NO_DETECTOR',
          message: `No GuardDuty detector in ignored region ${ignoredRegion} (expected)`,
        },
      ];
    }

    const detectorResponse = await executeApi(
      'GetDetectorCommand',
      { DetectorId: detectorId },
      () => client.send(new GetDetectorCommand({ DetectorId: detectorId })),
      logger,
      LOG_PREFIX,
    );

    const isEnabled = detectorResponse.Status === 'ENABLED';

    return [
      {
        name: 'regionIgnored',
        passed: !isEnabled,
        actual: detectorResponse.Status,
        expected: 'NOT ENABLED',
        message: isEnabled
          ? `GuardDuty is ENABLED in ignored region ${ignoredRegion} (should not be)`
          : `GuardDuty is not enabled in ignored region ${ignoredRegion} (expected)`,
      },
    ];
  } catch (error: unknown) {
    // AccessDeniedException or similar = GuardDuty not enabled — expected case
    const errorMessage = error instanceof Error ? error.message : String(error);
    return [
      {
        name: 'regionIgnored',
        passed: true,
        actual: 'NOT_ENABLED',
        expected: 'NOT_ENABLED',
        message: `GuardDuty not enabled in ignored region ${ignoredRegion} (expected: ${errorMessage})`,
      },
    ];
  }
}

/**
 * Assert GuardDuty protections are enabled/disabled as expected.
 *
 * Runs GetDetector on the delegated admin account and checks feature statuses.
 * expectedAssertions value: object with protection names and expected enabled state.
 * Example: { "s3Protection": true, "eksAuditLogs": true, "eksRuntimeMonitoring": false, "ec2Protection": false }
 */
async function assertProtectionsEnabled(
  manifest: TestManifest,
  environment: ResolvedEnvironment,
): Promise<AssertionResult[]> {
  const expectedProtections = manifest.expectedAssertions['protectionsEnabled'] as Record<string, boolean>;

  try {
    const client = await createDelegatedAdminGuardDutyClient(manifest, environment);
    const detectorId = await getDetectorId(client);

    if (!detectorId) {
      return [
        {
          name: 'protectionsEnabled',
          passed: false,
          message: 'No detector found on delegated admin account — cannot verify protections',
        },
      ];
    }

    const detectorResponse = await executeApi(
      'GetDetectorCommand',
      { DetectorId: detectorId },
      () => client.send(new GetDetectorCommand({ DetectorId: detectorId })),
      logger,
      LOG_PREFIX,
    );

    const results: AssertionResult[] = [];
    const features = detectorResponse.Features ?? [];

    // Map GuardDuty feature names to our config names
    const featureNameMap: Record<string, string> = {
      s3Protection: 'S3_DATA_EVENTS',
      // EKS Audit Log Monitoring and EKS Runtime Monitoring are independent features.
      eksAuditLogs: 'EKS_AUDIT_LOGS',
      eksRuntimeMonitoring: 'EKS_RUNTIME_MONITORING',
      ec2Protection: 'EBS_MALWARE_PROTECTION',
      rdsProtection: 'RDS_LOGIN_EVENTS',
      lambdaProtection: 'LAMBDA_NETWORK_LOGS',
    };

    for (const [protectionName, expectedEnabled] of Object.entries(expectedProtections)) {
      const featureName = featureNameMap[protectionName];
      if (!featureName) {
        results.push({
          name: `protection:${protectionName}`,
          passed: false,
          message: `Unknown protection name: ${protectionName}`,
        });
        continue;
      }

      const feature = features.find(f => f.Name === featureName);
      let actualStatus = feature?.Status; // 'ENABLED' or 'DISABLED'

      // Fallback for EKS runtime monitoring: accounts using the newer consolidated
      // RUNTIME_MONITORING feature report EKS runtime status under its
      // EKS_ADDON_MANAGEMENT additional configuration rather than as a standalone
      // EKS_RUNTIME_MONITORING feature. Only used when the standalone feature is absent.
      if (actualStatus === undefined && featureName === 'EKS_RUNTIME_MONITORING') {
        const consolidated = features.find(f => f.Name === 'RUNTIME_MONITORING');
        const eksAddon = consolidated?.AdditionalConfiguration?.find(c => c.Name === 'EKS_ADDON_MANAGEMENT');
        actualStatus = eksAddon?.Status;
      }

      const isEnabled = actualStatus === 'ENABLED';
      const passed = isEnabled === expectedEnabled;
      const expectedLabel = expectedEnabled ? 'ENABLED' : 'DISABLED';
      const actualLabel = actualStatus ?? 'NOT_FOUND';

      results.push({
        name: `protection:${protectionName}`,
        passed,
        actual: actualLabel,
        expected: expectedLabel,
        message: passed
          ? `${protectionName} (${featureName}): ${actualStatus}`
          : `${protectionName} (${featureName}) mismatch: expected ${expectedLabel}, got ${actualLabel}`,
      });
    }

    return results;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return [
      {
        name: 'protectionsEnabled',
        passed: false,
        message: `Failed to get detector for protections check: ${msg}`,
      },
    ];
  }
}

/**
 * Assert AWS Organizations trusted access is enabled for GuardDuty Malware Protection.
 *
 * EBS Malware Protection requires the management account to enable trusted access for
 * malware-protection.guardduty.amazonaws.com. The module establishes this prerequisite
 * (ensureOrganizationsTrustedAccess) before regional EC2 Protection configuration. This
 * verifies the principal is present in ListAWSServiceAccessForOrganization.
 */
async function assertMalwareProtectionTrustedAccess(
  _manifest: TestManifest,
  environment: ResolvedEnvironment,
): Promise<AssertionResult[]> {
  const name = 'malwareProtectionTrustedAccess';
  try {
    const client = new OrganizationsClient({
      region: environment.region,
      credentials: environment.managementAccountCredentials
        ? {
            accessKeyId: environment.managementAccountCredentials.accessKeyId,
            secretAccessKey: environment.managementAccountCredentials.secretAccessKey,
            sessionToken: environment.managementAccountCredentials.sessionToken,
          }
        : undefined,
    });

    let nextToken: string | undefined;
    let enabled = false;
    do {
      const response = await executeApi(
        'ListAWSServiceAccessForOrganizationCommand',
        nextToken ? { NextToken: nextToken } : {},
        () => client.send(new ListAWSServiceAccessForOrganizationCommand(nextToken ? { NextToken: nextToken } : {})),
        logger,
        LOG_PREFIX,
      );
      if (
        (response.EnabledServicePrincipals ?? []).some(
          service => service.ServicePrincipal === GUARDDUTY_MALWARE_PROTECTION_SERVICE_PRINCIPAL,
        )
      ) {
        enabled = true;
        break;
      }
      nextToken = response.NextToken;
    } while (nextToken);

    return [
      {
        name,
        passed: enabled,
        actual: enabled ? 'ENABLED' : 'NOT_ENABLED',
        expected: 'ENABLED',
        message: enabled
          ? `Organizations trusted access enabled for ${GUARDDUTY_MALWARE_PROTECTION_SERVICE_PRINCIPAL}`
          : `Organizations trusted access NOT enabled for ${GUARDDUTY_MALWARE_PROTECTION_SERVICE_PRINCIPAL}`,
      },
    ];
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return [{ name, passed: false, message: `Failed to verify malware-protection trusted access: ${msg}` }];
  }
}

/**
 * Assert GuardDuty membership is scoped to the deploymentTargets account boundary.
 *
 * This is the assertion that guards against the deploymentTargets regression: members
 * enrolled under the delegated admin must be exactly the resolved boundary set, and
 * accounts outside the boundary must NOT be members.
 *
 * expectedAssertions.memberBoundary shape (all values are logical account names):
 *   {
 *     "members": ["Management", "Network"],   // accounts that MUST be enrolled members
 *     "excluded": ["LogArchive", "..."]        // accounts that MUST NOT be members
 *   }
 * Both keys are optional; provide whichever the manifest wants to enforce. The delegated
 * admin account is never a member of itself and should not be listed under `members`.
 */
async function assertMemberBoundary(
  manifest: TestManifest,
  environment: ResolvedEnvironment,
): Promise<AssertionResult[]> {
  const expected = manifest.expectedAssertions['memberBoundary'] as {
    members?: string[];
    excluded?: string[];
  };

  const resolveIds = (names: string[] | undefined): { name: string; id: string }[] =>
    (names ?? []).map(name => {
      const id = environment.accounts.get(name);
      if (!id) {
        throw new Error(
          `memberBoundary: cannot resolve account "${name}". ` +
            `Available accounts: ${[...environment.accounts.keys()].join(', ')}`,
        );
      }
      return { name, id };
    });

  try {
    const client = await createDelegatedAdminGuardDutyClient(manifest, environment);
    const detectorId = await getDetectorId(client);

    if (!detectorId) {
      return [
        {
          name: 'memberBoundary',
          passed: false,
          message: 'No detector found on delegated admin account — cannot verify member boundary',
        },
      ];
    }

    // Collect the full set of enrolled member account IDs (paginated).
    const memberIds = new Set<string>();
    let nextToken: string | undefined;
    do {
      const response = await executeApi(
        'ListMembersCommand',
        { DetectorId: detectorId, OnlyAssociated: 'false' },
        () =>
          client.send(
            new ListMembersCommand({ DetectorId: detectorId, OnlyAssociated: 'false', NextToken: nextToken }),
          ),
        logger,
        LOG_PREFIX,
      );
      for (const member of response.Members ?? []) {
        if (member.AccountId) {
          memberIds.add(member.AccountId);
        }
      }
      nextToken = response.NextToken;
    } while (nextToken);

    const results: AssertionResult[] = [];
    const actualDisplay = [...memberIds].join(', ') || 'none';

    // Each expected member must be present.
    for (const { name, id } of resolveIds(expected.members)) {
      const present = memberIds.has(id);
      results.push({
        name: `memberBoundary:member:${name}`,
        passed: present,
        actual: actualDisplay,
        expected: `${id} present`,
        message: present
          ? `In-boundary account ${name} (${id}) is an enrolled member`
          : `In-boundary account ${name} (${id}) is NOT an enrolled member`,
      });
    }

    // Each excluded account must be absent.
    for (const { name, id } of resolveIds(expected.excluded)) {
      const absent = !memberIds.has(id);
      results.push({
        name: `memberBoundary:excluded:${name}`,
        passed: absent,
        actual: actualDisplay,
        expected: `${id} absent`,
        message: absent
          ? `Out-of-boundary account ${name} (${id}) is correctly NOT a member`
          : `Out-of-boundary account ${name} (${id}) is unexpectedly enrolled as a member`,
      });
    }

    return results;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return [
      {
        name: 'memberBoundary',
        passed: false,
        message: `Failed to verify member boundary: ${msg}`,
      },
    ];
  }
}

/**
 * Create a GuardDutyClient with delegated admin (Audit) account credentials.
 *
 * DescribeOrganizationConfiguration, ListPublishingDestinations, and GetDetector
 * for org-level features require delegated-admin credentials.
 *
 * @param manifest - Test manifest containing delegated admin account name
 * @param environment - Resolved test environment
 * @param region - Optional AWS region override. Defaults to environment.region.
 */
async function createDelegatedAdminGuardDutyClient(
  manifest: TestManifest,
  environment: ResolvedEnvironment,
  region?: string,
): Promise<GuardDutyClient> {
  const targetRegion = region ?? environment.region;
  const delegatedAdminName = manifest.moduleConfig['delegatedAdminAccount'] as string;
  const delegatedAdminAccountId = environment.accounts.get(delegatedAdminName);
  if (!delegatedAdminAccountId) {
    throw new Error(
      `Cannot resolve delegated admin account "${delegatedAdminName}". ` +
        `Available accounts: ${[...environment.accounts.keys()].join(', ')}`,
    );
  }

  const accessRole = process.env['LZA_GITLAB_ROLE_NAME'] ?? 'LzaGitlabRole';

  const credentials = await getCredentials({
    accountId: delegatedAdminAccountId,
    region: targetRegion,
    partition: environment.partition,
    assumeRoleName: accessRole,
    solutionId: 'LzaIntegTest',
    logPrefix: LOG_PREFIX,
    credentials: environment.managementAccountCredentials,
  });

  return new GuardDutyClient({
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
