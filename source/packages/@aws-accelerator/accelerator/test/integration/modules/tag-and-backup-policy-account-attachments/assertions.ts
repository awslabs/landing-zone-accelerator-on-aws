/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'License' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { ListPoliciesCommand, ListTargetsForPolicyCommand, OrganizationsClient } from '@aws-sdk/client-organizations';
import { gunzipSync } from 'node:zlib';
import {
  createLogger,
  executeApi,
  IModuleResponse,
  ITagAndBackupPolicyAccountAttachmentsModuleResponse,
  queryDynamoDBTable,
} from 'aws-lza';
import path from 'node:path';
import { assertStateTableEntry } from '../../framework/state-table-assertion';
import { AssertionResult, ResolvedEnvironment, TestManifest } from '../../framework/types';

const logger = createLogger([path.parse(path.basename(__filename)).name]);
const LOG_PREFIX = 'PolicyAttachmentAssertions';
const SERVICE_NAME = 'tag-and-backup-policy-account-attachments';

type SupportedPolicyType = 'TAG_POLICY' | 'BACKUP_POLICY';
type AssertionFn = (manifest: TestManifest, environment: ResolvedEnvironment) => Promise<AssertionResult[]>;

const ASSERTION_REGISTRY: Record<string, AssertionFn> = {
  moduleResponseStatus: assertModuleResponseStatus,
  policyResults: assertPolicyResults,
  attachOperationsBeforeDetach: assertAttachOperationsBeforeDetach,
  policyTargets: assertPolicyTargets,
  stateOwnedAttachments: assertStateOwnedAttachments,
  stateTableEntry: async () => [],
};

let lastModuleResponse: IModuleResponse<ITagAndBackupPolicyAccountAttachmentsModuleResponse> | undefined;

interface AccountResultExpectation {
  readonly account: string;
  readonly operation: 'attach' | 'detach';
  readonly status: string;
}

/**
 * Expected normalized result for one Tag or Backup Policy in manifest order.
 */
interface PolicyResultExpectation {
  /** Exact Organizations policy name expected in configuration order. */
  readonly policyName: string;
  /** Organizations policy type expected for the result. */
  readonly policyType: SupportedPolicyType;
  /** Exact aggregate reconciliation status expected for the policy. */
  readonly status: string;
  /** Ordered account-level attach/detach operations expected from the module. */
  readonly accountResults?: AccountResultExpectation[];
  /** Logical account names expected to remain live but outside LZA configuration and ownership. */
  readonly unmanagedAccounts?: string[];
}

interface PolicyTargetExpectation {
  readonly policyName: string;
  readonly policyType: SupportedPolicyType;
  readonly accounts: string[];
  readonly exists?: boolean;
}

interface StateAttachmentExpectation {
  readonly policyName: string;
  readonly policyType: SupportedPolicyType;
  readonly accounts: string[];
}

/**
 * Record the response returned by the Policy Attachments module for subsequent manifest assertions.
 *
 * @param response Module execution response produced by the accelerator wrapper
 */
export function recordPolicyAttachmentResponse(response: IModuleResponse): void {
  lastModuleResponse = response as IModuleResponse<ITagAndBackupPolicyAccountAttachmentsModuleResponse>;
}

/**
 * Run every Policy Attachments assertion declared by a test manifest.
 *
 * Expected assertion keys are dispatched through the module assertion registry.
 * An unknown key is represented by a failed {@link AssertionResult} rather than
 * throwing. The `stateTableEntry` registry entry is intentionally a no-op during
 * dispatch; when requested, the shared module-state assertion is appended after
 * all module-specific assertions. Its expected status defaults to `success` when
 * the manifest does not provide `stateTableEntry.status`.
 *
 * @param manifest Test manifest containing the expected assertion keys and values
 * @param environment Resolved AWS integration environment used by Organizations and state-table assertions
 * @returns Ordered assertion results, followed by the shared state-table results when requested
 * @throws Any error raised by a registered assertion or by the final shared state-table assertion
 */
export async function runPolicyAttachmentAssertions(
  manifest: TestManifest,
  environment: ResolvedEnvironment,
): Promise<AssertionResult[]> {
  const results: AssertionResult[] = [];
  for (const key of Object.keys(manifest.expectedAssertions)) {
    const assertion = ASSERTION_REGISTRY[key];
    if (!assertion) {
      results.push({ name: key, passed: false, message: `No assertion function registered for key: ${key}` });
      continue;
    }
    results.push(...(await assertion(manifest, environment)));
  }

  if (manifest.expectedAssertions['stateTableEntry'] !== undefined) {
    const expectedStatus = (manifest.expectedAssertions['stateTableEntry'] as { status?: string }).status ?? 'success';
    results.push(...(await assertStateTableEntry(environment, { serviceName: SERVICE_NAME, expectedStatus })));
  }
  return results;
}

async function assertModuleResponseStatus(manifest: TestManifest): Promise<AssertionResult[]> {
  const expected = manifest.expectedAssertions['moduleResponseStatus'] as string;
  const actual = lastModuleResponse?.status;
  return [
    {
      name: 'moduleResponseStatus',
      passed: actual === expected,
      actual,
      expected,
      message:
        actual === expected
          ? `Module response status matches: ${actual}`
          : `Module response status mismatch: expected ${expected}, got ${actual}`,
    },
  ];
}

async function assertPolicyResults(
  manifest: TestManifest,
  environment: ResolvedEnvironment,
): Promise<AssertionResult[]> {
  const expectations = manifest.expectedAssertions['policyResults'] as PolicyResultExpectation[];
  const actualResults = lastModuleResponse?.response?.perPolicyResults ?? [];
  const expected = normalizeExpectedPolicyResults(expectations, environment);
  const actual = normalizeActualPolicyResults(actualResults);
  const passed = JSON.stringify(actual) === JSON.stringify(expected);
  return [
    {
      name: 'policyResults',
      passed,
      actual,
      expected,
      message: passed
        ? 'Policy and account operation results match exactly in order'
        : 'Policy/account results contain an unexpected value, order, or extra operation',
    },
  ];
}

/**
 * Normalize manifest policy expectations into account-ID-based values suitable for exact comparison.
 *
 * Missing account results and unmanaged accounts normalize to empty arrays.
 *
 * @param expectations Ordered policy result expectations from the manifest
 * @param environment Resolved environment used to map logical account names to IDs
 * @returns Ordered, normalized policy results
 */
function normalizeExpectedPolicyResults(expectations: PolicyResultExpectation[], environment: ResolvedEnvironment) {
  return expectations.map(expectation => ({
    policyName: expectation.policyName,
    policyType: expectation.policyType,
    status: expectation.status,
    unmanagedAccountIds: (expectation.unmanagedAccounts ?? [])
      .map(account => resolveAccountId(environment, account))
      .sort(),
    accountResults: (expectation.accountResults ?? []).map(accountResult => ({
      accountId: resolveAccountId(environment, accountResult.account),
      operation: accountResult.operation,
      status: accountResult.status,
    })),
  }));
}

/**
 * Normalize actual module policy results to the same exact comparison shape as manifest expectations.
 *
 * @param actualResults Ordered policy results returned by the module
 * @returns Ordered policy results containing status, unmanaged account IDs, and account operations
 */
function normalizeActualPolicyResults(
  actualResults: ITagAndBackupPolicyAccountAttachmentsModuleResponse['perPolicyResults'],
) {
  return actualResults.map(result => ({
    policyName: result.policyName,
    policyType: result.policyType,
    status: result.status,
    unmanagedAccountIds: [...result.unmanagedAccountIds],
    accountResults: result.accountResults.map(accountResult => ({
      accountId: accountResult.accountId,
      operation: accountResult.operation,
      status: accountResult.status,
    })),
  }));
}

async function assertAttachOperationsBeforeDetach(manifest: TestManifest): Promise<AssertionResult[]> {
  const expected = manifest.expectedAssertions['attachOperationsBeforeDetach'] as boolean;
  const actualResults = lastModuleResponse?.response?.perPolicyResults ?? [];
  const policiesWithBothOperations = actualResults.filter(result => {
    const operations = result.accountResults.map(accountResult => accountResult.operation);
    return operations.includes('attach') && operations.includes('detach');
  });
  const ordered = policiesWithBothOperations.every(result => {
    const operations = result.accountResults.map(accountResult => accountResult.operation);
    const lastAttachIndex = operations.lastIndexOf('attach');
    const firstDetachIndex = operations.indexOf('detach');
    return lastAttachIndex >= 0 && firstDetachIndex >= 0 && lastAttachIndex < firstDetachIndex;
  });
  const actual = policiesWithBothOperations.map(result => ({
    policyName: result.policyName,
    operations: result.accountResults.map(accountResult => accountResult.operation),
  }));
  const passed = ordered === expected && policiesWithBothOperations.length > 0;
  return [
    {
      name: 'attachOperationsBeforeDetach',
      passed,
      actual,
      expected,
      message: passed
        ? 'Every policy completed all attachment results before its detachment results'
        : 'Attach-before-detach ordering was not demonstrated by the complete policy results',
    },
  ];
}

async function assertPolicyTargets(
  manifest: TestManifest,
  environment: ResolvedEnvironment,
): Promise<AssertionResult[]> {
  const expectations = manifest.expectedAssertions['policyTargets'] as PolicyTargetExpectation[];
  const client = new OrganizationsClient({
    region: environment.region,
    credentials: environment.managementAccountCredentials,
  });
  const results: AssertionResult[] = [];

  for (const expectation of expectations) {
    try {
      const policyId = await findPolicyId(client, expectation.policyName, expectation.policyType);
      const expectedExists = expectation.exists ?? true;
      if (!policyId) {
        results.push({
          name: `policyTargets:${expectation.policyType}:${expectation.policyName}`,
          passed: !expectedExists,
          actual: 'not found',
          expected: expectedExists ? 'policy exists' : 'policy absent',
          message: expectedExists
            ? `Policy ${expectation.policyName} was not found`
            : `Policy ${expectation.policyName} is absent as expected`,
        });
        continue;
      }

      const actualAccountIds = (await listDirectAccountTargets(client, policyId)).sort();
      const expectedAccountIds = expectation.accounts.map(account => resolveAccountId(environment, account)).sort();
      const passed = expectedExists && JSON.stringify(actualAccountIds) === JSON.stringify(expectedAccountIds);
      results.push({
        name: `policyTargets:${expectation.policyType}:${expectation.policyName}`,
        passed,
        actual: actualAccountIds,
        expected: expectedAccountIds,
        message: passed
          ? `Direct account targets match for ${expectation.policyName}`
          : `Direct account targets do not match for ${expectation.policyName}`,
      });
    } catch (error: unknown) {
      results.push({
        name: `policyTargets:${expectation.policyType}:${expectation.policyName}`,
        passed: false,
        message: `Failed to inspect policy targets: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
  return results;
}

async function assertStateOwnedAttachments(
  manifest: TestManifest,
  environment: ResolvedEnvironment,
): Promise<AssertionResult[]> {
  const expectations = manifest.expectedAssertions['stateOwnedAttachments'] as StateAttachmentExpectation[];
  const item = await fetchStateItem(environment);
  const actualResources = getOwnedResources(item).sort();
  const expectedResources = expectations
    .flatMap(expectation =>
      expectation.accounts.map(account => {
        const accountId = resolveAccountId(environment, account);
        return `policy-account-attachment:${expectation.policyType}:${encodeURIComponent(
          expectation.policyName,
        )}:${accountId}`;
      }),
    )
    .sort();
  const passed = JSON.stringify(actualResources) === JSON.stringify(expectedResources);
  return [
    {
      name: 'stateOwnedAttachments',
      passed,
      actual: actualResources,
      expected: expectedResources,
      message: passed ? 'Persisted policy attachment ownership matches' : 'Persisted policy ownership does not match',
    },
  ];
}

async function findPolicyId(
  client: OrganizationsClient,
  policyName: string,
  policyType: SupportedPolicyType,
): Promise<string | undefined> {
  let nextToken: string | undefined;
  do {
    const response = await executeApi(
      'ListPoliciesCommand',
      { Filter: policyType, NextToken: nextToken },
      () => client.send(new ListPoliciesCommand({ Filter: policyType, NextToken: nextToken })),
      logger,
      LOG_PREFIX,
    );
    const policyId = response.Policies?.find(policy => policy.Name === policyName)?.Id;
    if (policyId) {
      return policyId;
    }
    nextToken = response.NextToken;
  } while (nextToken);
  return undefined;
}

async function listDirectAccountTargets(client: OrganizationsClient, policyId: string): Promise<string[]> {
  const accountIds: string[] = [];
  let nextToken: string | undefined;
  do {
    const response = await executeApi(
      'ListTargetsForPolicyCommand',
      { PolicyId: policyId, NextToken: nextToken },
      () => client.send(new ListTargetsForPolicyCommand({ PolicyId: policyId, NextToken: nextToken })),
      logger,
      LOG_PREFIX,
    );
    accountIds.push(
      ...(response.Targets ?? [])
        .filter(target => target.Type === 'ACCOUNT' && target.TargetId)
        .map(target => target.TargetId as string),
    );
    nextToken = response.NextToken;
  } while (nextToken);
  return accountIds;
}

async function fetchStateItem(environment: ResolvedEnvironment): Promise<Record<string, unknown> | undefined> {
  const client = new DynamoDBClient({
    region: environment.region,
    credentials: environment.managementAccountCredentials,
  });
  const result = await queryDynamoDBTable({
    client,
    tableName: environment.moduleInfrastructure.stateTableName,
    logPrefix: LOG_PREFIX,
    partitionKey: { name: 'PK', value: `MODULE#${SERVICE_NAME}` },
    sortKey: { name: 'SK', value: 'EXECUTION#latest' },
    pagination: { enabled: true, maxPages: 1 },
  });
  return result.items?.[0];
}

function getOwnedResources(item: Record<string, unknown> | undefined): string[] {
  const rawResponse = item?.['lastResponse'];
  if (typeof rawResponse !== 'string') {
    return [];
  }
  const parsed = JSON.parse(rawResponse) as { response?: { ownedResources?: string | string[] } };
  const ownedResources = parsed.response?.ownedResources;
  if (Array.isArray(ownedResources)) {
    return ownedResources;
  }
  if (typeof ownedResources === 'string' && ownedResources.startsWith('gz:')) {
    return JSON.parse(gunzipSync(Buffer.from(ownedResources.slice(3), 'base64')).toString('utf-8')) as string[];
  }
  return [];
}

function resolveAccountId(environment: ResolvedEnvironment, accountName: string): string {
  const accountId = environment.accounts.get(accountName);
  if (!accountId) {
    throw new Error(`Unable to resolve account "${accountName}"`);
  }
  return accountId;
}
