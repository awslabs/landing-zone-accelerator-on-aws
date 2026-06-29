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
 * @fileoverview TGW-specific assertions for integration tests.
 *
 * - IModuleResponse-derived assertions (status/counts/failed/skipped/unchanged) are
 *   resolved from the DynamoDB Module-State row written by `saveModuleExecutionState`
 *   (fields: `lastStatus`, `lastResponse` JSON) to avoid brittle CloudWatch log scraping.
 * - AWS-state assertions (RT associations/propagations, DX-GW association state) hit the
 *   Network account via cross-account clients built with `getCredentials` from @aws-lza.
 * - All SDK calls are wrapped with `executeApi` for throttling/backoff and standardized logging.
 */

import {
  DirectConnectClient,
  DescribeDirectConnectGatewayAssociationsCommand,
  DescribeDirectConnectGatewayAssociationProposalsCommand,
} from '@aws-sdk/client-direct-connect';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  EC2Client,
  GetTransitGatewayRouteTableAssociationsCommand,
  GetTransitGatewayRouteTablePropagationsCommand,
} from '@aws-sdk/client-ec2';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { IAssumeRoleCredential, createLogger, executeApi, getCredentials, queryDynamoDBTable } from 'aws-lza';
import path from 'node:path';
import { assertStateTableEntry } from '../../framework/state-table-assertion';
import { AssertionResult, ResolvedEnvironment, TestManifest } from '../../framework/types';

const logger = createLogger([path.parse(path.basename(__filename)).name]);

const LOG_PREFIX = 'TgwAssertions';
const SERVICE_NAME = 'tgw-associations-and-propagations';

/**
 * Stores the `lastExecutionTime` from the state table BEFORE each manifest runs.
 * Used by skipped/idempotent assertions to detect whether the wrapper wrote a new row.
 * Set by {@link capturePreExecutionTimestamp} (called from the plugin's prepare hook).
 */
let preExecutionTimestamp: string | undefined;

/**
 * Assertion function type — takes manifest + environment, returns assertion results.
 */
type AssertionFn = (manifest: TestManifest, environment: ResolvedEnvironment) => Promise<AssertionResult[]>;

/**
 * Registry mapping `expectedAssertions` keys to assertion functions.
 */
const ASSERTION_REGISTRY: Record<string, AssertionFn> = {
  moduleResponseStatus: assertModuleResponseStatus,
  moduleResponseOperationCounts: assertModuleResponseOperationCounts,
  moduleResponseFailed: assertModuleResponseFailed,
  moduleResponseSkipped: assertModuleResponseSkipped,
  moduleResponseUnchanged: assertModuleResponseUnchanged,
  tgwRouteTableAssociations: assertTgwRouteTableAssociations,
  tgwRouteTablePropagations: assertTgwRouteTablePropagations,
  dxGatewayAssociationState: assertDxGatewayAssociationState,
  stateTableEntry: assertStateTableEntryPassthrough,
};

/**
 * Run all assertions for a TGW manifest.
 *
 * Iterates over `expectedAssertions` keys, dispatches to registered assertion functions,
 * and appends the shared state-table assertion (status derived from `moduleResponseStatus`
 * when present, defaulting to `'completed'`).
 */
export async function runTgwAssertions(
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

  const expectedStatus = (manifest.expectedAssertions['moduleResponseStatus'] as string | undefined) ?? 'completed';
  // Skip the default state-table append when the manifest expects a skipped outcome.
  // The wrapper's short-circuit path doesn't overwrite the state row, so the row reflects
  // the PREVIOUS execution — which would fail an expectedStatus:'skipped' check.
  if (expectedStatus !== 'skipped') {
    const stateResults = await assertStateTableEntry(environment, {
      serviceName: SERVICE_NAME,
      expectedStatus,
    });
    results.push(...stateResults);
  }

  return results;
}

// ─── State-table-derived assertions ─────────────────────────────────────────

/**
 * Capture the current `lastExecutionTime` from the state table BEFORE a manifest runs.
 * Called from the plugin's prepare hook so that skipped/idempotent assertions can
 * compare against a known baseline instead of relying on wall-clock staleness.
 */
export async function capturePreExecutionTimestamp(environment: ResolvedEnvironment): Promise<void> {
  const item = await fetchStateItem(environment);
  preExecutionTimestamp = (item?.['lastExecutionTime'] as string | undefined) ?? undefined;
  logger.info(`Captured pre-execution timestamp: ${preExecutionTimestamp ?? '(none)'}`);
}

/**
 * Fetch the latest state row for this module.
 */
async function fetchStateItem(environment: ResolvedEnvironment): Promise<{ [key: string]: unknown } | undefined> {
  const client = new DynamoDBClient({
    region: environment.region,
    credentials: toSdkCreds(environment.managementAccountCredentials),
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

/**
 * Parse the stored `lastResponse` JSON into an IModuleResponse-shaped object.
 */
function parseLastResponse(item: { [key: string]: unknown } | undefined): Record<string, unknown> | undefined {
  const raw = item?.['lastResponse'] as string | undefined;
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (error) {
    logger.warn(`Failed to parse lastResponse as JSON: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

async function assertModuleResponseStatus(
  manifest: TestManifest,
  environment: ResolvedEnvironment,
): Promise<AssertionResult[]> {
  const expected = manifest.expectedAssertions['moduleResponseStatus'] as string;
  const item = await fetchStateItem(environment);
  const actual = item?.['lastStatus'] as string | undefined;

  // Special case: when a manifest is expected to be "skipped", the wrapper's short-circuit
  // path does not overwrite the state-table row (no saveModuleExecutionState on the
  // unchanged-config branch). We detect this by comparing the current `lastExecutionTime`
  // against the pre-execution snapshot captured before this manifest ran.
  if (expected === 'skipped') {
    const lastExec = item?.['lastExecutionTime'] as string | undefined;
    const unchanged = lastExec === preExecutionTimestamp;
    return [
      {
        name: 'moduleResponseStatus',
        passed: unchanged,
        actual: `lastExecutionTime=${lastExec}`,
        expected: `unchanged from pre-execution (${preExecutionTimestamp ?? '(none)'})`,
        message: unchanged
          ? `State row unchanged — confirms wrapper skipped (timestamp=${lastExec})`
          : `State row was updated (pre=${preExecutionTimestamp}, post=${lastExec}) — wrapper did not skip`,
      },
    ];
  }

  const passed = actual === expected;
  return [
    {
      name: 'moduleResponseStatus',
      passed,
      actual,
      expected,
      message: passed
        ? `Module response status matches: ${actual}`
        : `Module response status mismatch: expected ${expected}, got ${actual}`,
    },
  ];
}

async function assertModuleResponseOperationCounts(
  manifest: TestManifest,
  environment: ResolvedEnvironment,
): Promise<AssertionResult[]> {
  const expected = manifest.expectedAssertions['moduleResponseOperationCounts'] as Record<
    'associations' | 'propagations' | 'dxAssociations',
    Record<string, number>
  >;
  const item = await fetchStateItem(environment);
  const parsed = parseLastResponse(item);
  const summary = (parsed?.['summary'] as string | undefined) ?? '';

  // Parse counts from summary string: "associations(+N -M =K), propagations(+N -M =K)".
  // The wrapper reports actions taken (created/deleted) + terminal state (exists).
  // dxAssociations aren't in the summary string — fall back to response array tally for those.
  const parseGroup = (group: string): Record<string, number> => {
    const re = new RegExp(`${group}\\(\\+(\\d+) -(\\d+) =(\\d+)\\)`);
    const match = summary.match(re);
    if (!match) return { created: 0, deleted: 0, exists: 0 };
    return { created: Number(match[1]), deleted: Number(match[2]), exists: Number(match[3]) };
  };

  const dxResponse =
    (parsed?.['response'] as { dxAssociations?: Array<{ operation: string }> } | undefined)?.dxAssociations ?? [];
  const dxCounts: Record<string, number> = { created: 0, deleted: 0, exists: 0 };
  for (const entry of dxResponse) {
    dxCounts[entry.operation] = (dxCounts[entry.operation] ?? 0) + 1;
  }

  const actual = {
    associations: parseGroup('associations'),
    propagations: parseGroup('propagations'),
    dxAssociations: dxCounts,
  };

  const passed = (['associations', 'propagations', 'dxAssociations'] as const).every(group => {
    const expectedGroup = expected?.[group] ?? {};
    const actualGroup = actual[group];
    return Object.entries(expectedGroup).every(([op, count]) => actualGroup[op] === count);
  });

  return [
    {
      name: 'moduleResponseOperationCounts',
      passed,
      actual: JSON.stringify(actual),
      expected: JSON.stringify(expected),
      message: passed
        ? 'Module response operation counts match expected tallies'
        : `Module response operation counts differ. actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)} summary="${summary}"`,
    },
  ];
}

async function assertModuleResponseFailed(
  manifest: TestManifest,
  environment: ResolvedEnvironment,
): Promise<AssertionResult[]> {
  const expected =
    (manifest.expectedAssertions['moduleResponseFailed'] as { errorNameRegex?: string; messageRegex?: string }) ?? {};
  const item = await fetchStateItem(environment);
  const status = item?.['lastStatus'] as string | undefined;
  const parsed = parseLastResponse(item);
  const error = (parsed?.['error'] ?? {}) as { name?: string; message?: string };

  const results: AssertionResult[] = [
    {
      name: 'moduleResponseFailedStatus',
      passed: status === 'failed',
      actual: status,
      expected: 'failed',
      message: status === 'failed' ? 'Module reported failure' : `Expected failed status, got ${status}`,
    },
  ];

  if (expected.errorNameRegex) {
    const re = new RegExp(expected.errorNameRegex);
    const passed = !!error.name && re.test(error.name);
    results.push({
      name: 'moduleResponseFailedErrorName',
      passed,
      actual: error.name,
      expected: expected.errorNameRegex,
      message: passed ? `Error name matches /${expected.errorNameRegex}/` : `Error name does not match regex`,
    });
  }

  if (expected.messageRegex) {
    const re = new RegExp(expected.messageRegex);
    const passed = !!error.message && re.test(error.message);
    results.push({
      name: 'moduleResponseFailedMessage',
      passed,
      actual: error.message,
      expected: expected.messageRegex,
      message: passed ? `Error message matches /${expected.messageRegex}/` : `Error message does not match regex`,
    });
  }

  return results;
}

async function assertModuleResponseSkipped(
  _manifest: TestManifest,
  environment: ResolvedEnvironment,
): Promise<AssertionResult[]> {
  const item = await fetchStateItem(environment);
  const status = item?.['lastStatus'] as string | undefined;
  const lastExec = item?.['lastExecutionTime'] as string | undefined;
  // The wrapper's skip path does not write a new state-table row.
  // Compare against the pre-execution snapshot to detect whether the row changed.
  const unchanged = lastExec === preExecutionTimestamp;
  const passed = status === 'skipped' || unchanged;
  return [
    {
      name: 'moduleResponseSkipped',
      passed,
      actual: `lastStatus=${status}, lastExecutionTime=${lastExec}`,
      expected: `skipped or unchanged from pre-execution (${preExecutionTimestamp ?? '(none)'})`,
      message: passed
        ? `Module execution was skipped (status=${status}, timestampUnchanged=${unchanged})`
        : `Expected skipped status, got ${status} (timestamp changed: pre=${preExecutionTimestamp}, post=${lastExec})`,
    },
  ];
}

async function assertModuleResponseUnchanged(
  _manifest: TestManifest,
  environment: ResolvedEnvironment,
): Promise<AssertionResult[]> {
  const item = await fetchStateItem(environment);
  const lastExec = item?.['lastExecutionTime'] as string | undefined;
  // Dry-run detection: saveModuleExecutionState passes dryRun=true to putItem,
  // which skips the actual DynamoDB write. So the state-table row should be
  // unchanged from the pre-execution snapshot. If the row IS unchanged, the
  // dry-run path was followed correctly (no persistent state mutation).
  const unchanged = lastExec === preExecutionTimestamp;

  // Also check the stored response in case a non-dry-run write did occur
  // (e.g., if the putItem dryRun guard was bypassed).
  const parsed = parseLastResponse(item);
  const summary = (parsed?.['summary'] as string | undefined) ?? '';
  const dryRunField = parsed?.['dryRun'] as boolean | undefined;
  const responseIndicatesDryRun = dryRunField === true || /^Dry-?run/i.test(summary);

  const passed = unchanged || responseIndicatesDryRun;
  return [
    {
      name: 'moduleResponseUnchanged',
      passed,
      actual: `stateRowUnchanged=${unchanged}, dryRun=${dryRunField}, summary="${summary}"`,
      expected: 'state row unchanged (dry-run skips write) or response indicates dryRun=true',
      message: passed
        ? 'Module dry-run confirmed — no persistent state mutation'
        : `Module execution was not a dry run (stateRowUnchanged=${unchanged}, dryRun=${dryRunField}, summary="${summary}")`,
    },
  ];
}

// ─── AWS-state assertions (Network account) ─────────────────────────────────

/**
 * Convert an IAssumeRoleCredential into an SDK credentials object.
 */
function toSdkCreds(
  credentials: IAssumeRoleCredential | undefined,
): { accessKeyId: string; secretAccessKey: string; sessionToken?: string } | undefined {
  if (!credentials) return undefined;
  return {
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey,
    sessionToken: credentials.sessionToken,
  };
}

function resolveNetworkAccountId(environment: ResolvedEnvironment): string {
  const id = environment.accounts.get('Network');
  if (!id) {
    throw new Error(
      `Cannot resolve "Network" account. Available accounts: ${[...environment.accounts.keys()].join(', ')}`,
    );
  }
  return id;
}

function resolveSsmPrefix(environment: ResolvedEnvironment): string {
  return process.env['TGW_INTEG_SSM_PREFIX'] ?? environment.resourcePrefixes.ssmParamName;
}

async function getNetworkCredentials(environment: ResolvedEnvironment): Promise<IAssumeRoleCredential | undefined> {
  return getCredentials({
    accountId: resolveNetworkAccountId(environment),
    region: environment.region,
    partition: environment.partition,
    assumeRoleName: process.env['LZA_GITLAB_ROLE_NAME'] ?? 'LzaGitlabRole',
    solutionId: 'LzaIntegTest',
    logPrefix: LOG_PREFIX,
    credentials: environment.managementAccountCredentials,
  });
}

async function createNetworkEc2Client(environment: ResolvedEnvironment): Promise<EC2Client> {
  const creds = await getNetworkCredentials(environment);
  return new EC2Client({ region: environment.region, credentials: toSdkCreds(creds) });
}

async function createNetworkSsmClient(environment: ResolvedEnvironment): Promise<SSMClient> {
  const creds = await getNetworkCredentials(environment);
  return new SSMClient({ region: environment.region, credentials: toSdkCreds(creds) });
}

async function createNetworkDxClient(environment: ResolvedEnvironment): Promise<DirectConnectClient> {
  const creds = await getNetworkCredentials(environment);
  return new DirectConnectClient({ region: environment.region, credentials: toSdkCreds(creds) });
}

function resolveSharedServicesAccountId(environment: ResolvedEnvironment): string {
  const id = environment.accounts.get('Shared Services');
  if (!id) {
    throw new Error(
      `Cannot resolve "Shared Services" account. Available accounts: ${[...environment.accounts.keys()].join(', ')}`,
    );
  }
  return id;
}

async function getSharedServicesCredentials(
  environment: ResolvedEnvironment,
): Promise<IAssumeRoleCredential | undefined> {
  return getCredentials({
    accountId: resolveSharedServicesAccountId(environment),
    region: environment.region,
    partition: environment.partition,
    assumeRoleName: process.env['LZA_GITLAB_ROLE_NAME'] ?? 'LzaGitlabRole',
    solutionId: 'LzaIntegTest',
    logPrefix: LOG_PREFIX,
    credentials: environment.managementAccountCredentials,
  });
}

async function createSharedServicesSsmClient(environment: ResolvedEnvironment): Promise<SSMClient> {
  const creds = await getSharedServicesCredentials(environment);
  return new SSMClient({ region: environment.region, credentials: toSdkCreds(creds) });
}

async function createSharedServicesDxClient(environment: ResolvedEnvironment): Promise<DirectConnectClient> {
  const creds = await getSharedServicesCredentials(environment);
  return new DirectConnectClient({ region: environment.region, credentials: toSdkCreds(creds) });
}

/**
 * Resolve an SSM parameter value in the Network account.
 */
async function readSsm(ssm: SSMClient, name: string): Promise<string | undefined> {
  const response = await executeApi(
    'GetParameterCommand',
    { Name: name },
    () => ssm.send(new GetParameterCommand({ Name: name })),
    logger,
    LOG_PREFIX,
  );
  return response.Parameter?.Value;
}

async function assertTgwRouteTableAssociations(
  manifest: TestManifest,
  environment: ResolvedEnvironment,
): Promise<AssertionResult[]> {
  const expected = manifest.expectedAssertions['tgwRouteTableAssociations'] as Record<string, string[]>;
  return assertRouteTableMembers(environment, expected, 'associations');
}

async function assertTgwRouteTablePropagations(
  manifest: TestManifest,
  environment: ResolvedEnvironment,
): Promise<AssertionResult[]> {
  const expected = manifest.expectedAssertions['tgwRouteTablePropagations'] as Record<string, string[]>;
  return assertRouteTableMembers(environment, expected, 'propagations');
}

/**
 * Shared implementation for RT associations and propagations — both take a route-table-id
 * and return an attachment list keyed by TransitGatewayAttachmentId.
 */
async function assertRouteTableMembers(
  environment: ResolvedEnvironment,
  expected: Record<string, string[]>,
  kind: 'associations' | 'propagations',
): Promise<AssertionResult[]> {
  const ssmPrefix = resolveSsmPrefix(environment);
  const ssm = await createNetworkSsmClient(environment);
  const ec2 = await createNetworkEc2Client(environment);
  const results: AssertionResult[] = [];

  for (const [rtName, expectedAttachments] of Object.entries(expected)) {
    const paramName = `${ssmPrefix}/network/transitGateways/main-tgw/routeTables/${rtName}/id`;
    let rtId: string | undefined;
    try {
      rtId = await readSsm(ssm, paramName);
    } catch (error: unknown) {
      results.push({
        name: `tgwRouteTable${kind === 'associations' ? 'Associations' : 'Propagations'}:${rtName}`,
        passed: false,
        message: `Failed to read ${paramName}: ${error instanceof Error ? error.message : String(error)}`,
      });
      continue;
    }

    if (!rtId) {
      results.push({
        name: `tgwRouteTable${kind === 'associations' ? 'Associations' : 'Propagations'}:${rtName}`,
        passed: false,
        message: `No route table id resolved from ${paramName}`,
      });
      continue;
    }

    try {
      const actualIds = kind === 'associations' ? await listAssociations(ec2, rtId) : await listPropagations(ec2, rtId);

      const sortedActual = [...actualIds].sort();
      const sortedExpected = [...expectedAttachments].sort();
      const passed =
        sortedActual.length === sortedExpected.length &&
        sortedActual.every(id => sortedExpected.includes(id)) &&
        sortedExpected.every(id => sortedActual.includes(id));

      results.push({
        name: `tgwRouteTable${kind === 'associations' ? 'Associations' : 'Propagations'}:${rtName}`,
        passed,
        actual: sortedActual.join(', '),
        expected: sortedExpected.join(', '),
        message: passed
          ? `[${rtName}] ${kind} match expected (${sortedExpected.length} attachment(s))`
          : `[${rtName}] ${kind} differ from expected`,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      results.push({
        name: `tgwRouteTable${kind === 'associations' ? 'Associations' : 'Propagations'}:${rtName}`,
        passed: false,
        message: `[${rtName}] Failed to list ${kind}: ${msg}`,
      });
    }
  }

  return results;
}

async function listAssociations(ec2: EC2Client, rtId: string): Promise<string[]> {
  const response = await executeApi(
    'GetTransitGatewayRouteTableAssociationsCommand',
    { TransitGatewayRouteTableId: rtId },
    () => ec2.send(new GetTransitGatewayRouteTableAssociationsCommand({ TransitGatewayRouteTableId: rtId })),
    logger,
    LOG_PREFIX,
  );
  return (response.Associations ?? []).map(a => a.TransitGatewayAttachmentId ?? '').filter(Boolean);
}

async function listPropagations(ec2: EC2Client, rtId: string): Promise<string[]> {
  const response = await executeApi(
    'GetTransitGatewayRouteTablePropagationsCommand',
    { TransitGatewayRouteTableId: rtId },
    () => ec2.send(new GetTransitGatewayRouteTablePropagationsCommand({ TransitGatewayRouteTableId: rtId })),
    logger,
    LOG_PREFIX,
  );
  return (response.TransitGatewayRouteTablePropagations ?? [])
    .map(p => p.TransitGatewayAttachmentId ?? '')
    .filter(Boolean);
}

function assertAllowedPrefixes(
  expected: { name: string; allowedPrefixes?: string[] },
  actualPrefixes: string[],
): AssertionResult[] {
  if (!expected.allowedPrefixes) return [];
  const actual = [...actualPrefixes].sort();
  const exp = [...expected.allowedPrefixes].sort();
  const passed = actual.length === exp.length && actual.every((v, i) => v === exp[i]);
  return [
    {
      name: `dxGatewayAllowedPrefixes:${expected.name}`,
      passed,
      actual: actual.join(', ') || 'none',
      expected: exp.join(', '),
      message: passed
        ? `DX Gateway ${expected.name} has expected allowed prefixes`
        : `DX Gateway ${expected.name} allowed prefixes mismatch (actual=[${actual.join(', ')}], expected=[${exp.join(', ')}])`,
    },
  ];
}

async function assertDxGatewayAssociationState(
  manifest: TestManifest,
  environment: ResolvedEnvironment,
): Promise<AssertionResult[]> {
  const expected = manifest.expectedAssertions['dxGatewayAssociationState'] as {
    name: string;
    account?: string;
    associationType: 'direct' | 'proposal';
    state?: string;
    allowedPrefixes?: string[];
  };
  const ssmPrefix = resolveSsmPrefix(environment);

  // For proposals, the DX GW ID lives in the DX GW owner's account (Shared Services),
  // but the proposal itself must be queried from the TGW owner's account (Network).
  if (expected.associationType === 'proposal') {
    // SSM client for Shared Services (DX GW owner) to resolve the DX GW ID
    const ssm = await createSharedServicesSsmClient(environment);
    const dxIdParam = `${ssmPrefix}/network/directConnectGateways/${expected.name}/id`;
    let dxGatewayId: string | undefined;
    try {
      dxGatewayId = await readSsm(ssm, dxIdParam);
    } catch (error: unknown) {
      return [
        {
          name: `dxGatewayAssociationState:${expected.name}`,
          passed: false,
          message: `Failed to read ${dxIdParam}: ${error instanceof Error ? error.message : String(error)}`,
        },
      ];
    }

    if (!dxGatewayId) {
      return [
        {
          name: `dxGatewayAssociationState:${expected.name}`,
          passed: false,
          message: `No DX Gateway id resolved from ${dxIdParam}`,
        },
      ];
    }

    try {
      // DirectConnect client for Network (TGW owner) to query proposals
      const dx = await createNetworkDxClient(environment);
      const response = await executeApi(
        'DescribeDirectConnectGatewayAssociationProposalsCommand',
        { directConnectGatewayId: dxGatewayId },
        () =>
          dx.send(new DescribeDirectConnectGatewayAssociationProposalsCommand({ directConnectGatewayId: dxGatewayId })),
        logger,
        LOG_PREFIX,
      );

      const proposals = response.directConnectGatewayAssociationProposals ?? [];
      const actualStates = proposals.map(p => String(p.proposalState ?? 'unknown'));
      const expectedState = expected.state;

      let passed: boolean;
      if (expectedState) {
        passed = actualStates.includes(expectedState);
      } else {
        // No specific state required — just verify at least one proposal exists
        passed = proposals.length > 0;
      }

      return [
        {
          name: `dxGatewayAssociationState:${expected.name}`,
          passed,
          actual: actualStates.join(', ') || 'none',
          expected: expectedState ?? 'any proposal exists',
          message: passed
            ? `DX Gateway ${expected.name} has expected proposal state`
            : `DX Gateway ${expected.name} proposal state does not match expected (actual=[${actualStates.join(', ')}])`,
        },
        ...assertAllowedPrefixes(
          expected,
          proposals.flatMap(p => (p.requestedAllowedPrefixesToDirectConnectGateway ?? []).map(r => r.cidr ?? '')),
        ),
      ];
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return [
        {
          name: `dxGatewayAssociationState:${expected.name}`,
          passed: false,
          message: `Failed to describe DX Gateway association proposals: ${msg}`,
        },
      ];
    }
  }

  // Non-proposal (direct) association path — existing behavior
  // Select clients based on the DX GW's owning account
  const isNetworkAccount = expected.account === 'Network';
  const ssm = isNetworkAccount
    ? await createNetworkSsmClient(environment)
    : await createSharedServicesSsmClient(environment);
  const dx = isNetworkAccount
    ? await createNetworkDxClient(environment)
    : await createSharedServicesDxClient(environment);

  const dxIdParam = `${ssmPrefix}/network/directConnectGateways/${expected.name}/id`;
  let dxGatewayId: string | undefined;
  try {
    dxGatewayId = await readSsm(ssm, dxIdParam);
  } catch (error: unknown) {
    return [
      {
        name: `dxGatewayAssociationState:${expected.name}`,
        passed: false,
        message: `Failed to read ${dxIdParam}: ${error instanceof Error ? error.message : String(error)}`,
      },
    ];
  }

  if (!dxGatewayId) {
    return [
      {
        name: `dxGatewayAssociationState:${expected.name}`,
        passed: false,
        message: `No DX Gateway id resolved from ${dxIdParam}`,
      },
    ];
  }

  try {
    const response = await executeApi(
      'DescribeDirectConnectGatewayAssociationsCommand',
      { directConnectGatewayId: dxGatewayId },
      () => dx.send(new DescribeDirectConnectGatewayAssociationsCommand({ directConnectGatewayId: dxGatewayId })),
      logger,
      LOG_PREFIX,
    );

    const associations = response.directConnectGatewayAssociations ?? [];
    const actualStates: string[] = associations.map(a => String(a.associationState ?? 'unknown'));
    const expectedState = expected.state;

    // When no state specified and associationType is 'direct': require at least one
    // non-terminal (not disassociated/requested-disassociated) association.
    // When state is explicitly 'disassociated': tolerate empty list (AWS removes assoc records).
    let passed: boolean;
    if (expectedState === 'disassociated') {
      passed = associations.length === 0 || actualStates.every(s => s === 'disassociated');
    } else if (expectedState) {
      passed = actualStates.includes(expectedState);
    } else {
      passed = associations.some(a => a.associationState !== 'disassociated');
    }

    return [
      {
        name: `dxGatewayAssociationState:${expected.name}`,
        passed,
        actual: actualStates.join(', ') || 'none',
        expected: expectedState ?? `any active ${expected.associationType ?? ''} association`,
        message: passed
          ? `DX Gateway ${expected.name} has expected association state`
          : `DX Gateway ${expected.name} association state does not match expected (actual=[${actualStates.join(', ')}])`,
      },
      ...assertAllowedPrefixes(
        expected,
        associations.flatMap(a => (a.allowedPrefixesToDirectConnectGateway ?? []).map(p => p.cidr ?? '')),
      ),
    ];
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return [
      {
        name: `dxGatewayAssociationState:${expected.name}`,
        passed: false,
        message: `Failed to describe DX Gateway associations: ${msg}`,
      },
    ];
  }
}

/**
 * Pass-through delegator for `stateTableEntry` manifest key — the primary state-table
 * assertion is appended unconditionally by `runTgwAssertions`, so this registration just
 * prevents the unregistered-key warning when manifest authors opt in explicitly.
 */
async function assertStateTableEntryPassthrough(
  _manifest: TestManifest,
  _environment: ResolvedEnvironment,
): Promise<AssertionResult[]> {
  void _manifest;
  void _environment;
  return [];
}
