/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { ResourcePolicyEnforcementConfig, SecurityConfig } from '@aws-accelerator/config';
import { gunzipSync, gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigRuleTagging } from '../../../../lib/actions/security/config-rule-tagging';
import { formatModuleDiff } from '../../../../lib/actions/utils/module-diff-formatter';
import { IModuleExecutionState } from '../../../../lib/actions/utils/types';
import { AcceleratorModules, ModuleExecutionPhase, ModuleParams } from '../../../../lib/types';

const { mockGetModuleExecutionState, mockSaveModuleExecutionState, mockTagConfigRules, mockLogger } = vi.hoisted(
  () => ({
    mockGetModuleExecutionState: vi.fn(),
    mockSaveModuleExecutionState: vi.fn(),
    mockTagConfigRules: vi.fn(),
    mockLogger: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      processStart: vi.fn(),
      processEnd: vi.fn(),
    },
  }),
);

vi.mock('aws-lza', () => ({
  createLogger: vi.fn(() => mockLogger),
  createStatusLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    processStart: vi.fn(),
    processEnd: vi.fn(),
  })),
  tagConfigRules: mockTagConfigRules,
  MODULE_STATE_CODE: {
    SUCCESS: 'success',
    COMPLETED: 'completed',
    FAILED: 'failed',
    SKIPPED: 'skipped',
  },
}));

vi.mock('../../../../lib/actions/utils/module-logging', () => ({
  logModuleExecutionResult: vi.fn(),
}));

vi.mock('../../../../lib/actions/utils/module-state', () => ({
  getModuleExecutionState: mockGetModuleExecutionState,
  saveModuleExecutionState: mockSaveModuleExecutionState,
}));

const ACCOUNT_IDS: Record<string, string> = {
  Management: '111111111111',
  Workload: '222222222222',
  Suspended: '333333333333',
};

function createParams(overrides: any = {}): ModuleParams {
  const accountsConfig = {
    getManagementAccountId: vi.fn(() => ACCOUNT_IDS['Management']),
    getActiveAccountIds: vi.fn(() => [ACCOUNT_IDS['Management'], ACCOUNT_IDS['Workload']]),
    getAccountIdsFromDeploymentTarget: vi.fn((targets: any) => {
      if (targets.organizationalUnits?.includes('Root')) {
        return Object.values(ACCOUNT_IDS).filter(
          accountId => !targets.excludedAccounts?.some((name: string) => ACCOUNT_IDS[name] === accountId),
        );
      }
      return (targets.accounts ?? []).map((name: string) => ACCOUNT_IDS[name]);
    }),
  };
  const globalConfig = {
    enabledRegions: ['us-east-1', 'us-west-2'],
    managementAccountAccessRole: 'AWSAcceleratorExecutionRole',
    tags: [
      { key: 'Owner', value: 'global-owner' },
      { key: 'GlobalOnly', value: 'global' },
    ],
  };
  const securityConfig = {
    awsConfig: {
      ruleSets: [
        {
          deploymentTargets: {
            organizationalUnits: ['Root'],
            excludedAccounts: [],
            excludedRegions: ['us-west-2'],
          },
          rules: [
            {
              name: 'managed-rule',
              tags: [
                { key: 'Owner', value: 'rule-owner' },
                { key: 'RuleOnly', value: 'rule' },
              ],
            },
          ],
        },
      ],
    },
    resourcePolicyEnforcement: undefined,
  };

  return {
    moduleItem: {
      name: AcceleratorModules.CONFIG_RULE_TAGGING,
      description: 'Config rule tagging',
      runOrder: 1,
      executionPhase: ModuleExecutionPhase.DEPLOY,
      handler: vi.fn(),
    },
    runnerParameters: {
      sessionContext: {
        invokingAccountId: ACCOUNT_IDS['Management'],
        region: 'us-east-1',
        globalRegion: 'us-east-1',
        partition: overrides.partition ?? 'aws',
      },
      configDirPath: '/config',
      prefix: 'AWSAccelerator',
      solutionId: 'AwsSolution/SO0199/v1.0.0',
      dryRun: overrides.dryRun ?? false,
      loadOrganizationsFromDynamoDbTable: false,
    },
    moduleRunnerParameters: {
      configs: {
        accountsConfig,
        globalConfig,
        organizationConfig: { getIgnoredOus: vi.fn(() => [{ name: 'Suspended' }]) },
        securityConfig,
        ...overrides.configs,
      },
      resourcePrefixes: { accelerator: 'AWSAccelerator' } as never,
      acceleratorResourceNames: {} as never,
      logging: { centralizedRegion: 'us-east-1' },
      organizationAccounts: [],
      managementAccountCredentials: {
        accessKeyId: 'access',
        secretAccessKey: 'secret',
        sessionToken: 'token',
      },
      sessionPolicy: '{"Version":"2012-10-17","Statement":[]}',
    },
  } as ModuleParams;
}

function moduleExecutionState(ownedResources: string[] | string, lastStatus = 'success'): IModuleExecutionState {
  return {
    serviceName: AcceleratorModules.CONFIG_RULE_TAGGING,
    lastExecutionTime: '2026-08-06T00:00:00.000Z',
    lastConfig: '{}',
    configHash: 'hash',
    lastStatus,
    lastResponse: JSON.stringify({
      status: lastStatus,
      response: { ownedResources },
    }),
  };
}

/**
 * Compress ownership IDs using the persisted module-state representation.
 *
 * @param ownedResources Ownership resource IDs
 * @returns Compressed ownership state value
 */
function compressOwnedResourcesForState(ownedResources: string[]): string {
  return `gz:${gzipSync(Buffer.from(JSON.stringify(ownedResources), 'utf-8')).toString('base64')}`;
}

function decompressOwnedResources(ownedResources: string): string[] {
  expect(ownedResources.startsWith('gz:')).toBe(true);
  return JSON.parse(gunzipSync(Buffer.from(ownedResources.slice(3), 'base64')).toString('utf-8'));
}

function resultOwnedResources(response: { response: { ownedResources: string | string[] } }): string[] {
  const ownedResources = response.response.ownedResources;
  return Array.isArray(ownedResources) ? ownedResources : decompressOwnedResources(ownedResources);
}

function moduleRequest(): any {
  return mockTagConfigRules.mock.calls[0][0];
}

function findRule(request: any, accountId: string, ruleName = 'managed-rule'): any {
  return request.configuration.targets
    .find((target: any) => target.accountId === accountId)
    .rules.find((rule: any) => rule.ruleName === ruleName);
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env['ACCELERATOR_ENABLE_TAG'];
  delete process.env['ACCELERATOR_ENABLE_SINGLE_ACCOUNT_MODE'];
  mockGetModuleExecutionState.mockResolvedValue(undefined);
  mockSaveModuleExecutionState.mockResolvedValue(undefined);
  mockTagConfigRules.mockImplementation(request => ({
    status: 'success',
    summary: 'tagged',
    timestamp: new Date().toISOString(),
    moduleName: AcceleratorModules.CONFIG_RULE_TAGGING,
    dryRun: request.dryRun,
    response: {
      targets: request.configuration.targets.map((target: any) => ({
        accountId: target.accountId,
        region: target.region,
        rules: target.rules.map((rule: any) => ({
          ruleName: rule.ruleName,
          status: 'no-change',
          managedTagKeys: rule.tags.map((tag: any) => tag.key).sort(),
          message: 'already matches',
        })),
      })),
    },
  }));
});

afterEach(() => {
  delete process.env['ACCELERATOR_ENABLE_TAG'];
  delete process.env['ACCELERATOR_ENABLE_SINGLE_ACCOUNT_MODE'];
});

describe('ConfigRuleTagging', () => {
  it('expands rule-set targets to active accounts and enabled, non-excluded regions', async () => {
    await ConfigRuleTagging.configure(createParams());

    const request = moduleRequest();
    expect(request.configuration.targets.map((target: any) => `${target.accountId}:${target.region}`)).toEqual([
      '111111111111:us-east-1',
      '222222222222:us-east-1',
    ]);
  });

  it('targets only the management account in single account mode', async () => {
    process.env['ACCELERATOR_ENABLE_SINGLE_ACCOUNT_MODE'] = 'true';
    const params = createParams();

    await ConfigRuleTagging.configure(params);

    const request = moduleRequest();
    expect(request.configuration.targets.map((target: any) => `${target.accountId}:${target.region}`)).toEqual([
      '111111111111:us-east-1',
    ]);
    expect((params.moduleRunnerParameters.configs.accountsConfig as any).getActiveAccountIds).not.toHaveBeenCalled();
  });

  it('uses canonical tag precedence with global tags overriding rule tags', async () => {
    await ConfigRuleTagging.configure(createParams());

    const tags = new Map(
      moduleRequest().configuration.targets[0].rules[0].tags.map((tag: any) => [tag.key, tag.value]),
    );
    expect(tags).toEqual(
      new Map([
        ['Accelerator', 'AWSAccelerator'],
        ['GlobalOnly', 'global'],
      ]),
    );
  });

  it('uses the canonical ISO partition gate', async () => {
    const disabledResult = await ConfigRuleTagging.configure(createParams({ partition: 'aws-iso-b' }));
    expect(disabledResult.status).toBe('skipped');
    expect(mockTagConfigRules).not.toHaveBeenCalled();

    process.env['ACCELERATOR_ENABLE_TAG'] = 'true';
    await ConfigRuleTagging.configure(createParams({ partition: 'aws-iso-b' }));

    const enabledRule = moduleRequest().configuration.targets[0].rules[0];
    expect(enabledRule.tags).toEqual([
      { key: 'Accelerator', value: 'AWSAccelerator' },
      { key: 'GlobalOnly', value: 'global' },
    ]);
    expect(enabledRule.externallyManagedTagKeys).toEqual(['Owner', 'RuleOnly']);
  });

  it('filters unsupported dynamics without consuming config-time capacity', async () => {
    const params = createParams();
    const { globalConfig, securityConfig } = params.moduleRunnerParameters.configs as any;
    const unsupportedValue = '{{resolve:ssm-secure:/sensitive/capacity-slot}}';
    globalConfig.tags = [
      { key: 'AUnsupported', value: unsupportedValue },
      { key: 'ZValid', value: 'value' },
    ];
    securityConfig.awsConfig.ruleSets[0].rules[0].tags = Array.from({ length: 48 }, (_, index) => ({
      key: `Rule${index}`,
      value: 'value',
    }));

    const result = await ConfigRuleTagging.configure(params);

    expect(result.status).toBe('success');
    const request = moduleRequest();
    expect(request.configuration.targets[0].rules[0].tags).toEqual([
      { key: 'Accelerator', value: 'AWSAccelerator' },
      { key: 'ZValid', value: 'value' },
    ]);
    expect(JSON.stringify(request)).not.toContain(unsupportedValue);
    expect(result.response?.warnings).toEqual([
      {
        code: 'skipped-global-tag',
        ruleName: 'managed-rule',
        tagKey: 'AUnsupported',
        reason: 'unsupported-dynamic-reference',
        message: 'Config rule "managed-rule" skipped global tag "AUnsupported" because unsupported-dynamic-reference',
      },
    ]);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Config rule "managed-rule" skipped global tag "AUnsupported" because unsupported-dynamic-reference',
      '111111111111:us-east-1',
    );
  });

  it('passes only plaintext SSM templates and keeps all dynamic inputs out of observable state', async () => {
    const standaloneValue = '{{resolve:ssm:/sensitive/standalone-path}}';
    const embeddedValue = 'env-{{resolve:ssm:/sensitive/embedded-path}}';
    const secureValue = '{{resolve:ssm-secure:/sensitive/secure-path}}';
    const secretsManagerValue = '{{resolve:secretsmanager:sensitive-secret-id:SecretString:value}}';
    const unknownValue = '{{resolve:unknown:sensitive-identifier}}';
    const malformedValue = '{{resolve:ssm:/sensitive/malformed:not-a-version}}';
    const dynamicKey = '{{resolve:secretsmanager:sensitive-secret-id:SecretString:key}}';
    const params = createParams();
    Reflect.set(params.moduleRunnerParameters.configs.globalConfig, 'tags', [
      { key: 'GlobalOnly', value: 'global' },
      { key: 'EmbeddedDynamic', value: embeddedValue },
      { key: 'MalformedDynamic', value: malformedValue },
      { key: 'SecretsManagerDynamic', value: secretsManagerValue },
      { key: 'SecureDynamic', value: secureValue },
      { key: 'StandaloneDynamic', value: standaloneValue },
      { key: 'UnknownDynamic', value: unknownValue },
      { key: dynamicKey, value: 'dynamic-key-value' },
    ]);
    mockGetModuleExecutionState.mockResolvedValue(
      moduleExecutionState([
        'tag:111111111111:us-east-1:managed-rule:MalformedDynamic',
        'tag:111111111111:us-east-1:managed-rule:SecretsManagerDynamic',
        'tag:111111111111:us-east-1:managed-rule:SecureDynamic',
        'tag:111111111111:us-east-1:managed-rule:UnknownDynamic',
        `tag:111111111111:us-east-1:managed-rule:${encodeURIComponent(dynamicKey)}`,
      ]),
    );

    const result = await ConfigRuleTagging.configure(params);

    const request = moduleRequest();
    const managementRule = request.configuration.targets[0].rules[0];
    expect(managementRule.tags).toEqual([
      { key: 'Accelerator', value: 'AWSAccelerator' },
      { key: 'EmbeddedDynamic', dynamicValue: embeddedValue },
      { key: 'GlobalOnly', value: 'global' },
      { key: 'StandaloneDynamic', dynamicValue: standaloneValue },
    ]);
    expect(managementRule.ownedTagKeys).toEqual([]);
    const serializedRequest = JSON.stringify(request);
    for (const filteredValue of [
      secureValue,
      secretsManagerValue,
      unknownValue,
      malformedValue,
      dynamicKey,
      '/sensitive/secure-path',
      'sensitive-secret-id',
      'sensitive-identifier',
      '/sensitive/malformed',
      'dynamic-key-value',
    ]) {
      expect(serializedRequest).not.toContain(filteredValue);
    }
    expect(serializedRequest).toContain(standaloneValue);
    expect(serializedRequest).toContain(embeddedValue);

    expect(result.response?.warnings).toHaveLength(5);
    expect(result.response?.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tagKey: '<dynamic-reference>',
          reason: 'unsupported-dynamic-reference',
        }),
        expect.objectContaining({
          tagKey: 'SecureDynamic',
          reason: 'unsupported-dynamic-reference',
        }),
        expect.objectContaining({
          tagKey: 'SecretsManagerDynamic',
          reason: 'unsupported-dynamic-reference',
        }),
        expect.objectContaining({
          tagKey: 'UnknownDynamic',
          reason: 'unsupported-dynamic-reference',
        }),
        expect.objectContaining({
          tagKey: 'MalformedDynamic',
          reason: 'unsupported-dynamic-reference',
        }),
      ]),
    );
    expect(mockLogger.warn).toHaveBeenCalledTimes(5);

    const expectedOwnedResources = [
      'tag:111111111111:us-east-1:managed-rule:Accelerator,EmbeddedDynamic,GlobalOnly,StandaloneDynamic',
      'tag:222222222222:us-east-1:managed-rule:Accelerator,EmbeddedDynamic,GlobalOnly,StandaloneDynamic',
    ];
    expect(result.response?.ownedResources).toEqual(expectedOwnedResources);
    const persistedState = mockSaveModuleExecutionState.mock.calls[0][0];
    expect(resultOwnedResources(persistedState.response)).toEqual(expectedOwnedResources);
    expect(persistedState.config[0].rules[0].tags).toEqual([
      { key: 'Accelerator', valueType: 'static' },
      { key: 'EmbeddedDynamic', valueType: 'dynamic' },
      { key: 'GlobalOnly', valueType: 'static' },
      { key: 'StandaloneDynamic', valueType: 'dynamic' },
    ]);

    const observableOutput = JSON.stringify({
      result,
      persistedState,
      warningLogs: mockLogger.warn.mock.calls,
      diff: formatModuleDiff(result),
    });
    for (const sensitiveValue of [
      standaloneValue,
      embeddedValue,
      secureValue,
      secretsManagerValue,
      unknownValue,
      malformedValue,
      dynamicKey,
      '/sensitive/standalone-path',
      '/sensitive/embedded-path',
      '/sensitive/secure-path',
      'sensitive-secret-id',
      'dynamic-key-value',
    ]) {
      expect(observableOutput).not.toContain(sensitiveValue);
    }
  });

  it('deduplicates runtime skip warnings and owns only keys actually managed', async () => {
    mockTagConfigRules.mockResolvedValueOnce({
      status: 'success',
      summary: 'tagged with skips',
      timestamp: '2026-08-17T00:00:00.000Z',
      moduleName: AcceleratorModules.CONFIG_RULE_TAGGING,
      dryRun: false,
      response: {
        targets: [
          {
            accountId: ACCOUNT_IDS['Management'],
            region: 'us-east-1',
            rules: [
              {
                ruleName: 'managed-rule',
                status: 'tagged',
                managedTagKeys: ['Accelerator'],
                skippedTagKeys: [
                  { key: 'CapacityGlobal', reason: 'tag-limit' },
                  { key: 'DynamicGlobal', reason: 'ssm-parameter-missing' },
                ],
                changedTagKeys: ['Accelerator'],
                message: 'updated one tag',
              },
            ],
          },
          {
            accountId: ACCOUNT_IDS['Workload'],
            region: 'us-east-1',
            rules: [
              {
                ruleName: 'managed-rule',
                status: 'no-change',
                managedTagKeys: [],
                skippedTagKeys: [
                  { key: 'CapacityGlobal', reason: 'tag-limit' },
                  { key: 'DynamicGlobal', reason: 'ssm-parameter-missing' },
                ],
                message: 'no capacity',
              },
            ],
          },
        ],
      },
    });

    const result = await ConfigRuleTagging.configure(createParams());

    expect(result.response?.warnings).toEqual([
      expect.objectContaining({ tagKey: 'CapacityGlobal', reason: 'tag-limit' }),
      expect.objectContaining({ tagKey: 'DynamicGlobal', reason: 'ssm-parameter-missing' }),
    ]);
    expect(result.response?.warnings).toHaveLength(2);
    expect(mockLogger.warn).toHaveBeenCalledTimes(2);
    expect(result.response?.ownedResources).toEqual(['tag:111111111111:us-east-1:managed-rule:Accelerator']);
  });

  it('keeps ownership of a previously owned key that the module skipped at runtime', async () => {
    mockGetModuleExecutionState.mockResolvedValue(
      moduleExecutionState(['tag:111111111111:us-east-1:managed-rule:Accelerator,GlobalOnly']),
    );
    mockTagConfigRules.mockResolvedValueOnce({
      status: 'success',
      summary: 'tagged with skips',
      timestamp: '2026-08-17T00:00:00.000Z',
      moduleName: AcceleratorModules.CONFIG_RULE_TAGGING,
      dryRun: false,
      response: {
        targets: [
          {
            accountId: ACCOUNT_IDS['Management'],
            region: 'us-east-1',
            rules: [
              {
                ruleName: 'managed-rule',
                status: 'tagged',
                managedTagKeys: ['Accelerator'],
                skippedTagKeys: [{ key: 'GlobalOnly', reason: 'tag-limit' }],
                message: 'no capacity for one tag',
              },
            ],
          },
        ],
      },
    });

    const result = await ConfigRuleTagging.configure(createParams());

    expect(result.response?.ownedResources).toEqual(['tag:111111111111:us-east-1:managed-rule:Accelerator,GlobalOnly']);
  });

  it('relinquishes whole-rule ownership without cleanup when a dynamic rule key may resolve to an owned key', async () => {
    process.env['ACCELERATOR_ENABLE_SINGLE_ACCOUNT_MODE'] = 'true';
    const params = createParams();
    const ruleSet = params.moduleRunnerParameters.configs.securityConfig.awsConfig.ruleSets[0];
    Reflect.set(ruleSet, 'rules', [
      {
        name: 'managed-rule',
        tags: [{ key: '{{resolve:ssm:/config-rule/tag-key}}', value: 'rule-specific' }],
      },
    ]);
    mockGetModuleExecutionState.mockResolvedValue(
      moduleExecutionState(['tag:111111111111:us-east-1:managed-rule:Accelerator']),
    );

    const result = await ConfigRuleTagging.configure(params);

    expect(result.status).toBe('skipped');
    expect(result.response?.ownedResources).toEqual([]);
    expect(result.response?.warnings).toEqual([
      expect.objectContaining({ tagKey: '<dynamic-reference>', reason: 'dynamic-rule-key' }),
    ]);
    expect(mockTagConfigRules).not.toHaveBeenCalled();
    expect(resultOwnedResources(mockSaveModuleExecutionState.mock.calls[0][0].response)).toEqual([]);
  });

  it('includes the generated resource-policy-enforcement Config rule', async () => {
    const params = createParams();
    const securityConfig = params.moduleRunnerParameters.configs.securityConfig as any;
    securityConfig.resourcePolicyEnforcement = {
      enable: true,
      remediation: {},
      policySets: [
        {
          deploymentTargets: {
            accounts: ['Workload'],
            excludedRegions: ['us-west-2'],
          },
        },
      ],
    };

    await ConfigRuleTagging.configure(params);

    const generatedRule = findRule(
      moduleRequest(),
      ACCOUNT_IDS['Workload'],
      `AWSAccelerator-${ResourcePolicyEnforcementConfig.DEFAULT_RULE_NAME}`,
    );
    expect(generatedRule).toBeDefined();
    expect(generatedRule.tags).toEqual(
      expect.arrayContaining([
        { key: 'Accelerator', value: 'AWSAccelerator' },
        { key: 'Owner', value: 'global-owner' },
      ]),
    );
  });

  it('forwards dry-run and SDK failures unchanged', async () => {
    mockTagConfigRules.mockResolvedValueOnce({
      status: 'failed',
      summary: 'one target failed',
      timestamp: new Date().toISOString(),
      moduleName: AcceleratorModules.CONFIG_RULE_TAGGING,
      dryRun: true,
      error: { name: 'AccessDeniedException', message: 'denied' },
    });

    const result = await ConfigRuleTagging.configure(createParams({ dryRun: true }));

    expect(mockTagConfigRules).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true }));
    expect(result.status).toBe('failed');
    expect(result.error).toEqual({ name: 'AccessDeniedException', message: 'denied' });
    expect(mockSaveModuleExecutionState).not.toHaveBeenCalled();
  });

  it('reconciles live state on every run without config-hash skipping', async () => {
    const params = createParams();

    await ConfigRuleTagging.configure(params);
    await ConfigRuleTagging.configure(params);

    expect(mockGetModuleExecutionState).toHaveBeenCalledTimes(2);
    expect(mockTagConfigRules).toHaveBeenCalledTimes(2);
    expect(mockSaveModuleExecutionState).toHaveBeenCalledTimes(2);
  });

  it('persists only the compressed ownership ledger after a successful run', async () => {
    const result = await ConfigRuleTagging.configure(createParams());
    const expectedOwnedResources = [
      'tag:111111111111:us-east-1:managed-rule:Accelerator,GlobalOnly',
      'tag:222222222222:us-east-1:managed-rule:Accelerator,GlobalOnly',
    ];

    const request = moduleRequest();
    expect(request.configuration.targets).toHaveLength(2);
    expect(request.configuration.targets[0].rules[0].ownedTagKeys).toEqual([]);
    expect(result.response?.ownedResources).toEqual(expectedOwnedResources);

    const persistedResponse = mockSaveModuleExecutionState.mock.calls[0][0].response;
    expect(Object.keys(persistedResponse.response)).toEqual(['ownedResources']);
    expect(decompressOwnedResources(persistedResponse.response.ownedResources)).toEqual(expectedOwnedResources);
    expect(mockSaveModuleExecutionState).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceName: AcceleratorModules.CONFIG_RULE_TAGGING,
        status: 'success',
        response: persistedResponse,
        dryRun: false,
      }),
      expect.anything(),
      '111111111111:us-east-1',
    );
  });

  it('groups identical rule sets into shared state scopes', async () => {
    await ConfigRuleTagging.configure(createParams());

    expect(mockSaveModuleExecutionState.mock.calls[0][0].config).toEqual([
      {
        accountIds: [ACCOUNT_IDS['Management'], ACCOUNT_IDS['Workload']],
        regions: ['us-east-1'],
        rules: [
          {
            ruleName: 'managed-rule',
            tags: [
              { key: 'Accelerator', valueType: 'static' },
              { key: 'GlobalOnly', valueType: 'static' },
            ],
            externallyManagedTagKeys: ['Owner', 'RuleOnly'],
          },
        ],
      },
    ]);
  });

  it('owns only the effective last-wins tag keys for overlapping scopes', async () => {
    const params = createParams();
    const { globalConfig, securityConfig } = params.moduleRunnerParameters.configs as any;
    globalConfig.tags = [];
    const deploymentTargets = {
      accounts: ['Management'],
      excludedRegions: ['us-west-2'],
    };
    securityConfig.awsConfig.ruleSets = [
      {
        deploymentTargets,
        rules: [{ name: 'overlap-rule', tags: [{ key: 'ZuluOwned', value: 'first' }] }],
      },
      {
        deploymentTargets,
        rules: [{ name: 'overlap-rule', tags: [{ key: 'AlphaOwned', value: 'last' }] }],
      },
    ];

    await ConfigRuleTagging.configure(params);

    const savedOwnedResources = resultOwnedResources(mockSaveModuleExecutionState.mock.calls[0][0].response);
    expect(savedOwnedResources).toEqual(['tag:111111111111:us-east-1:overlap-rule:Accelerator']);

    mockGetModuleExecutionState.mockResolvedValue(moduleExecutionState(savedOwnedResources));
    mockTagConfigRules.mockClear();
    mockSaveModuleExecutionState.mockClear();

    await ConfigRuleTagging.configure(params);

    const effectiveRule = moduleRequest().configuration.targets[0].rules[0];
    expect(effectiveRule.tags).toEqual([{ key: 'Accelerator', value: 'AWSAccelerator' }]);
    expect(effectiveRule.externallyManagedTagKeys).toEqual(['AlphaOwned']);
    expect(effectiveRule.ownedTagKeys).toEqual(['Accelerator']);
    expect(effectiveRule.ownedTagKeys).not.toContain('ZuluOwned');
  });

  it('decodes rule names and tag keys from single-key and multi-key ownership entries', async () => {
    mockGetModuleExecutionState.mockResolvedValue(
      moduleExecutionState([
        `tag:111111111111:us-east-1:managed-rule:${encodeURIComponent('Legacy:Key')},${encodeURIComponent('Second,Key')}`,
        'tag:222222222222:us-east-1:managed-rule:Single',
      ]),
    );

    await ConfigRuleTagging.configure(createParams());

    const request = moduleRequest();
    expect(findRule(request, ACCOUNT_IDS['Management']).ownedTagKeys).toEqual(['Legacy:Key', 'Second,Key']);
    expect(findRule(request, ACCOUNT_IDS['Management']).cleanupOnly).toBeUndefined();
    expect(findRule(request, ACCOUNT_IDS['Workload']).ownedTagKeys).toEqual(['Single']);
  });

  it.each([
    {
      stateFormat: 'compressed per-rule state',
      ownedResources: compressOwnedResourcesForState([
        'tag:111111111111:us-east-1:managed-rule:Accelerator,GlobalOnly',
      ]),
    },
    {
      stateFormat: 'legacy single-key state',
      ownedResources: [
        'tag:111111111111:us-east-1:managed-rule:Accelerator',
        'tag:111111111111:us-east-1:managed-rule:GlobalOnly',
      ],
    },
  ])('retains $stateFormat while a configured rule is missing and reuses it after recovery', async scenario => {
    process.env['ACCELERATOR_ENABLE_SINGLE_ACCOUNT_MODE'] = 'true';
    mockGetModuleExecutionState.mockResolvedValue(moduleExecutionState(scenario.ownedResources));
    mockTagConfigRules.mockResolvedValueOnce({
      status: 'success',
      summary: 'one configured rule is temporarily missing',
      timestamp: '2026-08-18T00:00:00.000Z',
      moduleName: AcceleratorModules.CONFIG_RULE_TAGGING,
      dryRun: false,
      response: {
        targets: [
          {
            accountId: ACCOUNT_IDS['Management'],
            region: 'us-east-1',
            rules: [{ ruleName: 'managed-rule', status: 'missing', message: 'temporarily not found' }],
          },
        ],
      },
    });

    const missingResult = await ConfigRuleTagging.configure(createParams());

    const expectedOwnership = ['tag:111111111111:us-east-1:managed-rule:Accelerator,GlobalOnly'];
    expect(missingResult.status).toBe('success');
    expect(findRule(moduleRequest(), ACCOUNT_IDS['Management']).ownedTagKeys).toEqual(['Accelerator', 'GlobalOnly']);
    expect(missingResult.response?.ownedResources).toEqual(expectedOwnership);
    const missingStateResponse = mockSaveModuleExecutionState.mock.calls[0][0].response;
    expect(resultOwnedResources(missingStateResponse)).toEqual(expectedOwnership);

    mockGetModuleExecutionState.mockResolvedValue({
      ...moduleExecutionState([], 'success'),
      lastResponse: JSON.stringify(missingStateResponse),
    });
    mockTagConfigRules.mockClear();
    mockSaveModuleExecutionState.mockClear();

    const recoveredResult = await ConfigRuleTagging.configure(createParams());

    expect(findRule(moduleRequest(), ACCOUNT_IDS['Management']).ownedTagKeys).toEqual(['Accelerator', 'GlobalOnly']);
    expect(recoveredResult.response?.ownedResources).toEqual(expectedOwnership);
    expect(resultOwnedResources(mockSaveModuleExecutionState.mock.calls[0][0].response)).toEqual(expectedOwnership);
  });

  it('adds previous-only targets and rules as cleanup work', async () => {
    mockGetModuleExecutionState.mockResolvedValue(
      moduleExecutionState(['tag:111111111111:us-west-2:removed%3Arule:Accelerator']),
    );

    await ConfigRuleTagging.configure(createParams());

    expect(moduleRequest().configuration.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountId: ACCOUNT_IDS['Management'],
          region: 'us-west-2',
          rules: [
            {
              ruleName: 'removed:rule',
              externallyManagedTagKeys: [],
              tags: [],
              ownedTagKeys: ['Accelerator'],
              cleanupOnly: true,
            },
          ],
        }),
      ]),
    );
  });

  it('drops previous ownership for accounts and regions that left the accelerator scope', async () => {
    mockGetModuleExecutionState.mockResolvedValue(
      moduleExecutionState([
        'tag:333333333333:us-east-1:managed-rule:Accelerator',
        'tag:111111111111:eu-west-1:managed-rule:Accelerator',
        'tag:111111111111:us-west-2:managed-rule:Accelerator',
      ]),
    );

    await ConfigRuleTagging.configure(createParams());

    expect(moduleRequest().configuration.targets.map((target: any) => `${target.accountId}:${target.region}`)).toEqual([
      '111111111111:us-east-1',
      '111111111111:us-west-2',
      '222222222222:us-east-1',
    ]);
  });

  it('cleans previous ownership and saves an empty ledger when all current rules are removed', async () => {
    mockGetModuleExecutionState.mockResolvedValue(
      moduleExecutionState(['tag:111111111111:us-east-1:removed-rule:Owner']),
    );
    const params = createParams({ configs: { securityConfig: new SecurityConfig() } });

    const result = await ConfigRuleTagging.configure(params);

    expect(result.status).toBe('success');
    expect(mockTagConfigRules).toHaveBeenCalledWith(
      expect.objectContaining({
        configuration: expect.objectContaining({
          targets: [
            {
              accountId: ACCOUNT_IDS['Management'],
              region: 'us-east-1',
              rules: [
                {
                  ruleName: 'removed-rule',
                  externallyManagedTagKeys: [],
                  tags: [],
                  ownedTagKeys: ['Owner'],
                  cleanupOnly: true,
                },
              ],
            },
          ],
        }),
      }),
    );
    expect(mockSaveModuleExecutionState).toHaveBeenCalledWith(
      expect.objectContaining({
        response: expect.objectContaining({
          response: expect.objectContaining({ ownedResources: [] }),
        }),
      }),
      params,
      expect.any(String),
    );
  });

  it('ignores malformed resource IDs without granting deletion ownership', async () => {
    mockGetModuleExecutionState.mockResolvedValue(
      moduleExecutionState([
        'not-a-resource-id',
        'tag:not-an-account:us-east-1:managed-rule:Owner',
        'tag:111111111111:us-east-1:managed-rule:Owner:extra-segment',
        'tag:111111111111:us-east-1:managed-rule:',
      ]),
    );

    const result = await ConfigRuleTagging.configure(createParams());

    expect(result.status).toBe('success');
    expect(
      moduleRequest().configuration.targets.every((target: any) => target.rules[0].ownedTagKeys.length === 0),
    ).toBe(true);
  });

  it('uses create-only mode after failure and reseeds ownership on the next success', async () => {
    const previousOwnedResources = ['tag:111111111111:us-east-1:managed-rule:Legacy%3AKey'];
    mockGetModuleExecutionState.mockResolvedValue(moduleExecutionState(previousOwnedResources));
    mockTagConfigRules.mockResolvedValueOnce({
      status: 'failed',
      summary: 'one target failed after another target was tagged',
      timestamp: '2026-08-10T01:00:00.000Z',
      moduleName: AcceleratorModules.CONFIG_RULE_TAGGING,
      dryRun: false,
      response: {
        targets: [
          {
            accountId: ACCOUNT_IDS['Workload'],
            region: 'us-east-1',
            rules: [{ ruleName: 'managed-rule', status: 'tagged', message: 'tagged' }],
          },
        ],
      },
    });

    const failedResult = await ConfigRuleTagging.configure(createParams());

    expect(failedResult.status).toBe('failed');
    const failedStateResponse = mockSaveModuleExecutionState.mock.calls[0][0].response;
    expect(failedResult.response?.ownedResources).toBeUndefined();
    expect(failedStateResponse.response.ownedResources).toBeUndefined();

    mockGetModuleExecutionState.mockResolvedValue({
      ...moduleExecutionState(previousOwnedResources, 'failed'),
      lastResponse: JSON.stringify(failedStateResponse),
    });
    mockTagConfigRules.mockClear();
    mockSaveModuleExecutionState.mockClear();

    const retryResult = await ConfigRuleTagging.configure(createParams());

    expect(findRule(moduleRequest(), ACCOUNT_IDS['Management']).ownedTagKeys).toEqual([]);
    const retryOwnedResources = retryResult.response?.ownedResources ?? [];
    expect(retryOwnedResources).toEqual([
      'tag:111111111111:us-east-1:managed-rule:Accelerator,GlobalOnly',
      'tag:222222222222:us-east-1:managed-rule:Accelerator,GlobalOnly',
    ]);
    expect(resultOwnedResources(mockSaveModuleExecutionState.mock.calls[0][0].response)).toEqual(retryOwnedResources);
  });

  it('fails before service calls when ownership state cannot be read', async () => {
    mockGetModuleExecutionState.mockRejectedValue(new Error('DynamoDB read failed'));

    const result = await ConfigRuleTagging.configure(createParams());

    expect(result).toMatchObject({
      status: 'failed',
      error: { name: 'StateManagementError', message: 'DynamoDB read failed' },
    });
    expect(mockTagConfigRules).not.toHaveBeenCalled();
    expect(mockSaveModuleExecutionState).not.toHaveBeenCalled();
  });

  it('does not save ownership state during dry-run', async () => {
    const result = await ConfigRuleTagging.configure(createParams({ dryRun: true }));

    expect(result.status).toBe('success');
    expect(mockGetModuleExecutionState).toHaveBeenCalledOnce();
    expect(mockTagConfigRules).toHaveBeenCalledOnce();
    expect(mockSaveModuleExecutionState).not.toHaveBeenCalled();
  });

  it('skips when no LZA-created Config rules are in scope', async () => {
    const params = createParams({ configs: { securityConfig: new SecurityConfig() } });

    const result = await ConfigRuleTagging.configure(params);

    expect(result.status).toBe('skipped');
    expect(result.summary).toContain('no Config rules require global tag reconciliation');
    expect(mockGetModuleExecutionState).toHaveBeenCalledOnce();
    expect(mockTagConfigRules).not.toHaveBeenCalled();
    expect(mockSaveModuleExecutionState).toHaveBeenCalledOnce();
  });

  it('registers a detailed dry-run diff formatter', () => {
    const output = formatModuleDiff({
      status: 'success',
      summary: '1 rule target would change',
      timestamp: '2026-08-05T00:00:00.000Z',
      moduleName: AcceleratorModules.CONFIG_RULE_TAGGING,
      dryRun: true,
      response: {
        warnings: [
          {
            code: 'skipped-global-tag',
            ruleName: 'managed-rule',
            tagKey: 'CapacityGlobal',
            reason: 'tag-limit',
            message: 'Config rule "managed-rule" skipped global tag "CapacityGlobal" because tag-limit',
          },
        ],
        targets: [
          {
            accountId: ACCOUNT_IDS['Management'],
            region: 'us-east-1',
            rules: [
              {
                ruleName: 'managed-rule',
                status: 'dry-run',
                changedTagKeys: ['Accelerator', 'Owner'],
                removedTagKeys: ['CustomerTag'],
                unmanagedTagKeys: ['ExternalA', 'ExternalZ'],
                message: 'would update 2 tags and remove 1 tag',
              },
              {
                ruleName: 'unchanged-rule',
                status: 'no-change',
                message: 'already matches',
              },
              {
                ruleName: 'pending-rule',
                status: 'pending-create',
                changedTagKeys: ['Accelerator', 'Owner'],
                message: 'pending creation',
              },
            ],
          },
        ],
      },
    });

    expect(output).toContain('Account 111111111111 / us-east-1');
    expect(output).toContain('[~] managed-rule: Accelerator, Owner');
    expect(output).toContain('[-] managed-rule: CustomerTag');
    expect(output).toContain(
      '[!] managed-rule: ExternalA, ExternalZ - not managed by LZA configuration, will be preserved; ' +
        'consider adding them to configuration to let LZA manage them',
    );
    expect(output).toContain(
      '[!] skipped-global-tag: Config rule "managed-rule" skipped global tag "CapacityGlobal" because tag-limit',
    );
    expect(output).toContain('[+] pending-rule (pending creation): Accelerator, Owner');
    expect(output).toContain('[=] 1 rule target(s) unchanged');
  });

  it('shows unmanaged attention for a no-change rule without counting a planned mutation', () => {
    const output = formatModuleDiff({
      status: 'success',
      summary: 'No tag changes are planned',
      timestamp: '2026-08-05T00:00:00.000Z',
      moduleName: AcceleratorModules.CONFIG_RULE_TAGGING,
      dryRun: true,
      response: {
        targets: [
          {
            accountId: ACCOUNT_IDS['Management'],
            region: 'us-east-1',
            rules: [
              {
                ruleName: 'unchanged-rule',
                status: 'no-change',
                unmanagedTagKeys: ['ExternalA', 'ExternalZ'],
                message: 'already matches',
              },
            ],
          },
        ],
      },
    });

    expect(output).toContain('Account 111111111111 / us-east-1');
    expect(output).toContain(
      '[!] unchanged-rule: ExternalA, ExternalZ - not managed by LZA configuration, will be preserved; ' +
        'consider adding them to configuration to let LZA manage them',
    );
    expect(output).toContain('No changes');
    expect(output).toContain('[=] 1 rule target(s) unchanged');
    expect(output).not.toContain('[~] unchanged-rule');
    expect(output).not.toContain('[+] unchanged-rule');
    expect(output).not.toContain('[-] unchanged-rule');
  });

  it('reports a rule that is not deployed without marking the diff as failed', () => {
    const output = formatModuleDiff({
      status: 'success',
      summary: 'config-rule-tagging completed across 1 rule target(s); 1 rule(s) were not found',
      timestamp: '2026-08-05T00:00:00.000Z',
      moduleName: AcceleratorModules.CONFIG_RULE_TAGGING,
      dryRun: true,
      response: {
        targets: [
          {
            accountId: ACCOUNT_IDS['Management'],
            region: 'us-east-1',
            rules: [{ ruleName: 'absent-rule', status: 'missing', message: 'was not found' }],
          },
        ],
      },
    });

    expect(output).toContain('Mode: Dry Run\n');
    expect(output).toContain('[!] absent-rule: was not found');
    expect(output).toContain('No changes');
  });

  it('formats failed rule and module errors in the dry-run diff', () => {
    const ruleMessage = 'rule-scoped access denial';
    const moduleMessage = 'module-scoped access denial';
    const output = formatModuleDiff({
      status: 'failed',
      summary: '1 rule target failed',
      timestamp: '2026-08-05T00:00:00.000Z',
      moduleName: AcceleratorModules.CONFIG_RULE_TAGGING,
      dryRun: true,
      error: {
        name: 'AccessDeniedException',
        message: moduleMessage,
      },
      response: {
        targets: [
          {
            accountId: ACCOUNT_IDS['Management'],
            region: 'us-east-1',
            rules: [
              {
                ruleName: 'failed-rule',
                status: 'failed',
                message: ruleMessage,
              },
            ],
          },
        ],
      },
    });

    expect(output).toContain('Mode: Dry Run — FAILED');
    expect(output).toContain(`[!] failed-rule: ${ruleMessage}`);
    expect(output).toContain('Error: AccessDeniedException');
    expect(output).toContain(`Message: ${moduleMessage}`);
    expect(output).not.toContain('No changes');
  });
});
