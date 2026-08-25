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

import {
  ConfigServiceClient,
  DescribeConfigRulesCommand,
  ListTagsForResourceCommand,
} from '@aws-sdk/client-config-service';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { gunzipSync } from 'node:zlib';
import {
  createLogger,
  executeApi,
  getCredentials,
  IConfigRuleTaggingModuleResponse,
  IModuleResponse,
  queryDynamoDBTable,
} from 'aws-lza';
import path from 'node:path';
import { getModuleTestRoleName } from '../../framework/permissions-boundary';
import { assertStateTableEntry } from '../../framework/state-table-assertion';
import { AssertionResult, ResolvedEnvironment, TestManifest } from '../../framework/types';

const logger = createLogger([path.parse(path.basename(__filename)).name]);
const LOG_PREFIX = 'ConfigRuleTaggingAssertions';
const SERVICE_NAME = 'config-rule-tagging';

type AssertionFn = (manifest: TestManifest, environment: ResolvedEnvironment) => Promise<AssertionResult[]>;

const ASSERTION_REGISTRY: Record<string, AssertionFn> = {
  moduleResponseStatus: assertModuleResponseStatus,
  configRuleResults: assertConfigRuleResults,
  configRuleTags: assertConfigRuleTags,
  stateOwnedTagKeys: assertStateOwnedTagKeys,
  stateConfigRedacted: assertStateConfigRedacted,
  stateTableEntry: async () => [],
};

let lastModuleResponse: IModuleResponse<IConfigRuleTaggingModuleResponse> | undefined;

interface ConfigRuleResultExpectation {
  readonly account: string;
  readonly region?: string;
  readonly ruleName: string;
  readonly status: string;
  readonly changedTagKeys?: string[];
  readonly removedTagKeys?: string[];
  readonly unmanagedTagKeys?: string[];
}

interface ConfigRuleTagExpectation {
  readonly account: string;
  readonly region?: string;
  readonly ruleName: string;
  readonly tags: Record<string, string>;
  readonly absentTagKeys?: string[];
}

interface StateOwnedTagKeysExpectation {
  readonly account: string;
  readonly region?: string;
  readonly ruleName: string;
  readonly tagKeys: string[];
}

/**
 * Record the most recent Config Rule Tagging module response for subsequent manifest assertions.
 *
 * @param response Module execution response produced by the accelerator wrapper
 * @returns Nothing
 */
export function recordConfigRuleTaggingResponse(response: IModuleResponse): void {
  lastModuleResponse = response as IModuleResponse<IConfigRuleTaggingModuleResponse>;
}

/**
 * Run every Config Rule Tagging assertion declared by a test manifest.
 *
 * Expected assertion keys are dispatched through the module assertion registry.
 * An unknown key is represented by a failed {@link AssertionResult} rather than
 * throwing. The `stateTableEntry` registry entry is intentionally a no-op during
 * dispatch; when requested, the shared module-state assertion is appended after
 * all module-specific assertions. Its expected status defaults to `success` when
 * the manifest does not provide `stateTableEntry.status`.
 *
 * @param manifest Test manifest containing the expected assertion keys and values
 * @param environment Resolved AWS integration environment used by live and state-table assertions
 * @returns Ordered assertion results, followed by the shared state-table results when requested
 * @throws Any error raised by a registered assertion or by the final shared state-table assertion
 */
export async function runConfigRuleTaggingAssertions(
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

async function assertConfigRuleResults(
  manifest: TestManifest,
  environment: ResolvedEnvironment,
): Promise<AssertionResult[]> {
  const expectations = manifest.expectedAssertions['configRuleResults'] as ConfigRuleResultExpectation[];
  const targets = lastModuleResponse?.response?.targets ?? [];

  return expectations.map(expectation => {
    const accountId = resolveAccountId(environment, expectation.account);
    const region = expectation.region ?? environment.region;
    const target = targets.find(item => item.accountId === accountId && item.region === region);
    const actual = target?.rules.find(rule => rule.ruleName === expectation.ruleName);
    const passed =
      actual?.status === expectation.status &&
      matchesOptionalArray(actual.changedTagKeys, expectation.changedTagKeys) &&
      matchesOptionalArray(actual.removedTagKeys, expectation.removedTagKeys) &&
      matchesOptionalArray(actual.unmanagedTagKeys, expectation.unmanagedTagKeys);

    return {
      name: `configRuleResult:${expectation.ruleName}`,
      passed,
      actual,
      expected: expectation,
      message: passed
        ? `${expectation.ruleName} result matches ${expectation.status}`
        : `${expectation.ruleName} result did not match expected status or changed keys`,
    };
  });
}

async function assertConfigRuleTags(
  manifest: TestManifest,
  environment: ResolvedEnvironment,
): Promise<AssertionResult[]> {
  const expectations = manifest.expectedAssertions['configRuleTags'] as ConfigRuleTagExpectation[];
  const results: AssertionResult[] = [];

  for (const expectation of expectations) {
    const accountId = resolveAccountId(environment, expectation.account);
    const region = expectation.region ?? environment.region;
    try {
      const client = await createConfigClient(environment, accountId, region);
      const describe = await executeApi(
        'DescribeConfigRulesCommand',
        { ConfigRuleNames: [expectation.ruleName] },
        () => client.send(new DescribeConfigRulesCommand({ ConfigRuleNames: [expectation.ruleName] })),
        logger,
        LOG_PREFIX,
      );
      const ruleArn = describe.ConfigRules?.[0]?.ConfigRuleArn;
      if (!ruleArn) {
        results.push({
          name: `configRuleTags:${expectation.ruleName}`,
          passed: false,
          message: `Config rule ${expectation.ruleName} was not found`,
        });
        continue;
      }

      const tags = await listConfigRuleTags(client, ruleArn);
      const actual = new Map(tags.map(tag => [tag.Key ?? '', tag.Value ?? '']));
      const expectedPresent = Object.entries(expectation.tags).every(([key, value]) => actual.get(key) === value);
      const expectedAbsent = (expectation.absentTagKeys ?? []).every(key => !actual.has(key));
      const passed = expectedPresent && expectedAbsent;

      results.push({
        name: `configRuleTags:${expectation.ruleName}`,
        passed,
        actual: Object.fromEntries([...actual.entries()].sort(([left], [right]) => left.localeCompare(right))),
        expected: expectation,
        message: passed
          ? `Config rule ${expectation.ruleName} tags match`
          : `Config rule ${expectation.ruleName} tags do not match`,
      });
    } catch (error: unknown) {
      results.push({
        name: `configRuleTags:${expectation.ruleName}`,
        passed: false,
        message: `Failed to inspect Config rule tags: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  return results;
}

async function assertStateOwnedTagKeys(
  manifest: TestManifest,
  environment: ResolvedEnvironment,
): Promise<AssertionResult[]> {
  const expectations = manifest.expectedAssertions['stateOwnedTagKeys'] as StateOwnedTagKeysExpectation[];
  const item = await fetchStateItem(environment);
  const ownedResources = getOwnedResources(item);

  return expectations.map(expectation => {
    const accountId = resolveAccountId(environment, expectation.account);
    const region = expectation.region ?? environment.region;
    const prefix = `tag:${accountId}:${region}:${encodeURIComponent(expectation.ruleName)}:`;
    const resource = ownedResources.find(value => value.startsWith(prefix));
    const actualKeys = resource?.slice(prefix.length).split(',').filter(Boolean).map(decodeURIComponent).sort() ?? [];
    const expectedKeys = [...expectation.tagKeys].sort();
    const passed = JSON.stringify(actualKeys) === JSON.stringify(expectedKeys);
    return {
      name: `stateOwnedTagKeys:${expectation.ruleName}`,
      passed,
      actual: actualKeys,
      expected: expectedKeys,
      message: passed
        ? `Owned tag keys match for ${expectation.ruleName}`
        : `Owned tag keys do not match for ${expectation.ruleName}`,
    };
  });
}

async function assertStateConfigRedacted(
  manifest: TestManifest,
  environment: ResolvedEnvironment,
): Promise<AssertionResult[]> {
  const forbiddenValues = manifest.expectedAssertions['stateConfigRedacted'] as string[];
  const item = await fetchStateItem(environment);
  if (!item) {
    return [
      {
        name: 'stateConfigRedacted',
        passed: false,
        actual: 'missing state item',
        expected: 'state item with string lastConfig',
        message: 'State config redaction could not be verified because the state item is missing',
      },
    ];
  }
  const lastConfig = item['lastConfig'];
  if (typeof lastConfig !== 'string') {
    return [
      {
        name: 'stateConfigRedacted',
        passed: false,
        actual: typeof lastConfig,
        expected: 'string',
        message: 'State config redaction could not be verified because lastConfig is not a string',
      },
    ];
  }
  const leaked = forbiddenValues.filter(value => lastConfig.includes(value));
  return [
    {
      name: 'stateConfigRedacted',
      passed: leaked.length === 0,
      actual: leaked,
      expected: [],
      message: leaked.length === 0 ? 'State config contains no tag values or SSM paths' : 'State config leaked values',
    },
  ];
}

async function createConfigClient(
  environment: ResolvedEnvironment,
  accountId: string,
  region: string,
): Promise<ConfigServiceClient> {
  const credentials =
    accountId === environment.managementAccountId
      ? environment.managementAccountCredentials
      : await getCredentials({
          accountId,
          region,
          partition: environment.partition,
          assumeRoleName: getModuleTestRoleName(SERVICE_NAME),
          solutionId: environment.solutionId,
          credentials: environment.managementAccountCredentials,
          logPrefix: LOG_PREFIX,
        });

  if (!credentials) {
    throw new Error(`Unable to obtain credentials for account ${accountId}`);
  }
  return new ConfigServiceClient({ region, credentials });
}

async function listConfigRuleTags(
  client: ConfigServiceClient,
  resourceArn: string,
): Promise<Array<{ Key?: string; Value?: string }>> {
  const tags: Array<{ Key?: string; Value?: string }> = [];
  let nextToken: string | undefined;
  do {
    const response = await executeApi(
      'ListTagsForResourceCommand',
      { ResourceArn: resourceArn, NextToken: nextToken },
      () => client.send(new ListTagsForResourceCommand({ ResourceArn: resourceArn, NextToken: nextToken })),
      logger,
      LOG_PREFIX,
    );
    tags.push(...(response.Tags ?? []));
    nextToken = response.NextToken;
  } while (nextToken);
  return tags;
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
    throw new TypeError('Module state lastResponse is missing or is not a string');
  }
  let parsed: { response?: { ownedResources?: unknown } };
  try {
    parsed = JSON.parse(rawResponse) as { response?: { ownedResources?: unknown } };
  } catch (error: unknown) {
    throw new TypeError(`Module state lastResponse is not valid JSON: ${String(error)}`);
  }
  const ownedResources = parsed.response?.ownedResources;
  if (Array.isArray(ownedResources)) {
    if (!ownedResources.every(resource => typeof resource === 'string')) {
      throw new TypeError('Module state ownedResources array contains a non-string value');
    }
    return ownedResources;
  }
  if (typeof ownedResources === 'string' && ownedResources.startsWith('gz:')) {
    try {
      const decompressed = JSON.parse(
        gunzipSync(Buffer.from(ownedResources.slice(3), 'base64')).toString('utf-8'),
      ) as unknown;
      if (!Array.isArray(decompressed) || !decompressed.every(resource => typeof resource === 'string')) {
        throw new TypeError('Decompressed ownedResources is not an array of strings');
      }
      return decompressed;
    } catch (error: unknown) {
      throw new TypeError(`Module state ownedResources gzip payload is invalid: ${String(error)}`);
    }
  }
  throw new TypeError('Module state ownedResources is missing or uses an unsupported representation');
}

function resolveAccountId(environment: ResolvedEnvironment, accountName: string): string {
  const accountId = environment.accounts.get(accountName);
  if (!accountId) {
    throw new Error(`Unable to resolve account "${accountName}"`);
  }
  return accountId;
}

function matchesOptionalArray(actual: readonly string[] | undefined, expected: readonly string[] | undefined): boolean {
  if (expected === undefined) {
    return true;
  }
  return JSON.stringify([...(actual ?? [])].sort()) === JSON.stringify([...expected].sort());
}
