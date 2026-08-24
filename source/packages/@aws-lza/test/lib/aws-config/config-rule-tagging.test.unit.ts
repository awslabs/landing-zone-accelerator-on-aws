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

import {
  DescribeConfigRulesCommand,
  ListTagsForResourceCommand,
  TagResourceCommand,
  UntagResourceCommand,
} from '@aws-sdk/client-config-service';
import { GetParametersCommand } from '@aws-sdk/client-ssm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IConfigRuleTag, IConfigRuleTaggingModuleRequest } from '../../../lib/aws-config/interfaces';

const { mockSend, mockSsmSend, mockGetCredentials, mockLogger } = vi.hoisted(() => ({
  mockSend: vi.fn(),
  mockSsmSend: vi.fn(),
  mockGetCredentials: vi.fn(),
  mockLogger: {
    error: vi.fn(),
    info: vi.fn(),
    processEnd: vi.fn(),
    processStart: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('@aws-sdk/client-config-service', () => ({
  ConfigServiceClient: class {
    send = mockSend;
  },
  DescribeConfigRulesCommand: vi.fn(function (this: { input: unknown }, input) {
    this.input = input;
  }),
  ListTagsForResourceCommand: vi.fn(function (this: { input: unknown }, input) {
    this.input = input;
  }),
  TagResourceCommand: vi.fn(function (this: { input: unknown }, input) {
    this.input = input;
  }),
  UntagResourceCommand: vi.fn(function (this: { input: unknown }, input) {
    this.input = input;
  }),
}));

vi.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: class {
    send = mockSsmSend;
  },
  GetParametersCommand: vi.fn(function (this: { input: unknown }, input) {
    this.input = input;
  }),
}));

vi.mock('../../../lib/common/sts-functions', () => ({
  getCredentials: mockGetCredentials,
}));

vi.mock('../../../lib/common/logger', () => ({
  createLogger: vi.fn(() => mockLogger),
}));

vi.mock('../../../lib/common/throttle', () => ({
  throttlingBackOff: vi.fn(operation => operation()),
}));

vi.mock('../../../lib/common/utility', async () => ({
  ...(await vi.importActual('../../../lib/common/utility')),
  setRetryStrategy: vi.fn(() => ({})),
}));

import { tagConfigRules } from '../../../lib/aws-config/config-rule-tagging';
import { MODULE_STATE_CODE } from '../../../lib/common/types';

type CommandWithInput = { input: Record<string, unknown> };

const MANAGEMENT_ACCOUNT_ID = '111111111111';
const MEMBER_ACCOUNT_ID = '222222222222';
const RULE_ARN = `arn:aws:config:us-east-1:${MANAGEMENT_ACCOUNT_ID}:config-rule/config-rule-abc`;

function request(
  rules: Array<{
    ruleName: string;
    tags: IConfigRuleTag[];
    externallyManagedTagKeys?: string[];
    ownedTagKeys?: string[];
    cleanupOnly?: boolean;
  }>,
  options: { dryRun?: boolean; accountId?: string } = {},
): IConfigRuleTaggingModuleRequest {
  return {
    invokingAccountId: MANAGEMENT_ACCOUNT_ID,
    region: 'us-east-1',
    globalRegion: 'us-east-1',
    partition: 'aws',
    operation: 'tag',
    moduleName: 'config-rule-tagging',
    dryRun: options.dryRun ?? false,
    credentials: {
      accessKeyId: 'access',
      secretAccessKey: 'secret',
      sessionToken: 'token',
    },
    sessionPolicy: '{"Version":"2012-10-17","Statement":[]}',
    configuration: {
      managementAccountId: MANAGEMENT_ACCOUNT_ID,
      accountAccessRoleName: 'AWSAcceleratorExecutionRole',
      targets: [
        {
          accountId: options.accountId ?? MANAGEMENT_ACCOUNT_ID,
          region: 'us-east-1',
          rules: rules.map(rule => ({ ...rule, ownedTagKeys: rule.ownedTagKeys ?? [] })),
        },
      ],
    },
  };
}

function defaultApi(tags: Array<{ Key: string; Value: string }> = []): void {
  mockSend.mockImplementation(command => {
    const input = (command as CommandWithInput).input;
    if (command instanceof DescribeConfigRulesCommand) {
      return Promise.resolve({
        ConfigRules: (input['ConfigRuleNames'] as string[]).map(ruleName => ({
          ConfigRuleName: ruleName,
          ConfigRuleArn: `${RULE_ARN}/${ruleName}`,
        })),
      });
    }
    if (command instanceof ListTagsForResourceCommand) {
      return Promise.resolve({ Tags: tags });
    }
    if (command instanceof TagResourceCommand) {
      return Promise.resolve(undefined);
    }
    if (command instanceof UntagResourceCommand) {
      return Promise.resolve(undefined);
    }
    return Promise.reject(new Error('Unexpected command'));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCredentials.mockResolvedValue({
    accessKeyId: 'member-access',
    secretAccessKey: 'member-secret',
    sessionToken: 'member-token',
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('tagConfigRules', () => {
  it('batches named DescribeConfigRules requests at 25 names', async () => {
    const rules = Array.from({ length: 26 }, (_, index) => ({
      ruleName: `rule-${index}`,
      tags: [{ key: 'Accelerator', value: 'AWSAccelerator' }],
    }));
    defaultApi([{ Key: 'Accelerator', Value: 'AWSAccelerator' }]);

    await tagConfigRules(request(rules));

    const calls = mockSend.mock.calls
      .map(([command]) => command)
      .filter(command => command instanceof DescribeConfigRulesCommand) as CommandWithInput[];
    expect(calls).toHaveLength(2);
    expect(calls[0].input['ConfigRuleNames']).toHaveLength(25);
    expect(calls[1].input['ConfigRuleNames']).toHaveLength(1);
  });

  it('handles DescribeConfigRules and ListTagsForResource pagination', async () => {
    let describePage = 0;
    let tagPage = 0;
    mockSend.mockImplementation(command => {
      if (command instanceof DescribeConfigRulesCommand) {
        describePage++;
        return Promise.resolve(
          describePage === 1
            ? { ConfigRules: [], NextToken: 'describe-next' }
            : { ConfigRules: [{ ConfigRuleName: 'rule-a', ConfigRuleArn: RULE_ARN }] },
        );
      }
      if (command instanceof ListTagsForResourceCommand) {
        tagPage++;
        return Promise.resolve(
          tagPage === 1
            ? { Tags: [{ Key: 'aws:service-tag', Value: 'preserved' }], NextToken: 'tag-next' }
            : { Tags: [{ Key: 'Accelerator', Value: 'AWSAccelerator' }] },
        );
      }
      return Promise.reject(new Error('TagResource should not be called'));
    });

    const result = await tagConfigRules(
      request([{ ruleName: 'rule-a', tags: [{ key: 'Accelerator', value: 'AWSAccelerator' }] }]),
    );

    expect(result.status).toBe(MODULE_STATE_CODE.SUCCESS);
    expect(describePage).toBe(2);
    expect(tagPage).toBe(2);
    expect(result.response?.targets[0].rules[0].status).toBe('no-change');
  });

  it('overwrites drifted desired keys, removes old owned keys, and preserves unowned tags', async () => {
    defaultApi([
      { Key: 'Accelerator', Value: 'drifted' },
      { Key: 'OwnedLegacy', Value: 'removed' },
      { Key: 'Unrelated', Value: 'preserved' },
    ]);

    const result = await tagConfigRules(
      request([
        {
          ruleName: 'rule-a',
          tags: [{ key: 'Accelerator', value: 'AWSAccelerator' }],
          ownedTagKeys: ['Accelerator', 'OwnedLegacy'],
        },
      ]),
    );

    const tagCall = mockSend.mock.calls
      .map(([command]) => command)
      .find(command => command instanceof TagResourceCommand) as CommandWithInput;
    expect(tagCall.input).toEqual({
      ResourceArn: `${RULE_ARN}/rule-a`,
      Tags: [{ Key: 'Accelerator', Value: 'AWSAccelerator' }],
    });
    const untagCall = mockSend.mock.calls
      .map(([command]) => command)
      .find(command => command instanceof UntagResourceCommand) as CommandWithInput;
    expect(untagCall.input).toEqual({
      ResourceArn: `${RULE_ARN}/rule-a`,
      TagKeys: ['OwnedLegacy'],
    });
    const writes = mockSend.mock.calls
      .map(([command]) => command)
      .filter(command => command instanceof UntagResourceCommand || command instanceof TagResourceCommand);
    expect(writes[0]).toBeInstanceOf(UntagResourceCommand);
    expect(writes[1]).toBeInstanceOf(TagResourceCommand);
    expect(result.response?.targets[0].rules[0].status).toBe('tagged');
    expect(result.response?.targets[0].rules[0].removedTagKeys).toEqual(['OwnedLegacy']);
  });

  it('logs only sorted unmanaged tag keys without exposing values', async () => {
    defaultApi([
      { Key: 'ZCustomer', Value: 'secret-z' },
      { Key: 'Desired', Value: 'desired-value' },
      { Key: 'OwnedLegacy', Value: 'owned-value' },
      { Key: 'ACustomer', Value: 'secret-a' },
      { Key: 'aws:service-tag', Value: 'aws-value' },
    ]);

    const result = await tagConfigRules(
      request([
        {
          ruleName: 'rule-a',
          tags: [{ key: 'Desired', value: 'desired-value' }],
          ownedTagKeys: ['OwnedLegacy'],
        },
      ]),
    );

    const unmanagedCalls = mockLogger.warn.mock.calls.filter(([message]) =>
      String(message).includes('not managed by LZA configuration'),
    );
    expect(unmanagedCalls).toEqual([
      [
        'Config rule "rule-a" has tag keys that are not managed by LZA configuration and will be preserved: ' +
          'ACustomer, ZCustomer; consider adding them to configuration to let LZA manage them',
        `${MANAGEMENT_ACCOUNT_ID}:us-east-1`,
      ],
    ]);
    expect(result.response?.targets[0].rules[0].unmanagedTagKeys).toEqual(['ACustomer', 'ZCustomer']);
    expect(JSON.stringify(unmanagedCalls)).not.toContain('secret-a');
    expect(JSON.stringify(unmanagedCalls)).not.toContain('secret-z');
    expect(JSON.stringify(unmanagedCalls)).not.toContain('desired-value');
    expect(JSON.stringify(unmanagedCalls)).not.toContain('owned-value');
    expect(JSON.stringify(unmanagedCalls)).not.toContain('aws-value');
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('removes only previous-owned non-desired tags and preserves unowned and AWS-reserved tags', async () => {
    defaultApi([
      { Key: 'OwnedTag', Value: 'removed' },
      { Key: 'CustomerTag', Value: 'preserved' },
      { Key: 'aws:service-tag', Value: 'preserved' },
    ]);

    const result = await tagConfigRules(
      request([
        {
          ruleName: 'rule-a',
          tags: [],
          ownedTagKeys: ['OwnedTag', 'CustomerTagThatIsNotLive', 'aws:service-tag'],
        },
      ]),
    );

    const untagCall = mockSend.mock.calls
      .map(([command]) => command)
      .find(command => command instanceof UntagResourceCommand) as CommandWithInput;
    expect(untagCall.input).toEqual({
      ResourceArn: `${RULE_ARN}/rule-a`,
      TagKeys: ['OwnedTag'],
    });
    expect(mockSend.mock.calls.some(([command]) => command instanceof TagResourceCommand)).toBe(false);
    expect(result.response?.targets[0].rules[0]).toMatchObject({
      status: 'tagged',
      changedTagKeys: [],
      removedTagKeys: ['OwnedTag'],
    });
  });

  it('adopts desired tags without deleting any live tags when no previous ownership exists', async () => {
    defaultApi([{ Key: 'CustomerTag', Value: 'preserved' }]);

    const result = await tagConfigRules(
      request([{ ruleName: 'rule-a', tags: [{ key: 'Accelerator', value: 'AWSAccelerator' }] }]),
    );

    expect(mockSend.mock.calls.some(([command]) => command instanceof UntagResourceCommand)).toBe(false);
    expect(mockSend.mock.calls.some(([command]) => command instanceof TagResourceCommand)).toBe(true);
    expect(result.response?.targets[0].rules[0]).toMatchObject({
      status: 'tagged',
      changedTagKeys: ['Accelerator'],
      removedTagKeys: [],
    });
  });

  it('does not call TagResource when desired tags already match', async () => {
    defaultApi([{ Key: 'Accelerator', Value: 'AWSAccelerator' }]);

    const result = await tagConfigRules(
      request([{ ruleName: 'rule-a', tags: [{ key: 'Accelerator', value: 'AWSAccelerator' }] }]),
    );

    expect(mockSend.mock.calls.some(([command]) => command instanceof TagResourceCommand)).toBe(false);
    expect(mockSend.mock.calls.some(([command]) => command instanceof UntagResourceCommand)).toBe(false);
    expect(result.response?.targets[0].rules[0].status).toBe('no-change');
    expect(result.response?.targets[0].rules[0].unmanagedTagKeys).toEqual([]);
  });

  it('returns stable-sorted unmanaged keys for a no-change result', async () => {
    defaultApi([
      { Key: 'Desired', Value: 'value' },
      { Key: 'ZCustomer', Value: 'secret-z' },
      { Key: 'aws:service-tag', Value: 'aws-value' },
      { Key: 'ACustomer', Value: 'secret-a' },
    ]);

    const result = await tagConfigRules(request([{ ruleName: 'rule-a', tags: [{ key: 'Desired', value: 'value' }] }]));

    expect(result.response?.targets[0].rules[0]).toMatchObject({
      status: 'no-change',
      unmanagedTagKeys: ['ACustomer', 'ZCustomer'],
    });
    expect(JSON.stringify(result.response?.targets[0].rules[0].unmanagedTagKeys)).not.toContain('secret');
  });

  it('reports tag updates and removals without writing in dry-run mode', async () => {
    defaultApi([
      { Key: 'CustomerTag', Value: 'removed' },
      { Key: 'ZUnmanaged', Value: 'secret-z' },
      { Key: 'AUnmanaged', Value: 'secret-a' },
    ]);

    const result = await tagConfigRules(
      request(
        [
          {
            ruleName: 'rule-a',
            tags: [{ key: 'Accelerator', value: 'AWSAccelerator' }],
            ownedTagKeys: ['CustomerTag'],
          },
        ],
        { dryRun: true },
      ),
    );

    expect(mockSend.mock.calls.some(([command]) => command instanceof TagResourceCommand)).toBe(false);
    expect(mockSend.mock.calls.some(([command]) => command instanceof UntagResourceCommand)).toBe(false);
    expect(result.response?.targets[0].rules[0].status).toBe('dry-run');
    expect(result.response?.targets[0].rules[0].changedTagKeys).toEqual(['Accelerator']);
    expect(result.response?.targets[0].rules[0].removedTagKeys).toEqual(['CustomerTag']);
    expect(result.response?.targets[0].rules[0].unmanagedTagKeys).toEqual(['AUnmanaged', 'ZUnmanaged']);
  });

  it('splits owned tag removals into requests of at most 50 keys', async () => {
    const ownedTags = Array.from({ length: 51 }, (_, index) => ({
      Key: `Owned${index.toString().padStart(2, '0')}`,
      Value: 'value',
    }));
    defaultApi(ownedTags);

    const result = await tagConfigRules(
      request([
        {
          ruleName: 'rule-a',
          tags: [],
          ownedTagKeys: ownedTags.map(tag => tag.Key),
        },
      ]),
    );

    const untagCalls = mockSend.mock.calls
      .map(([command]) => command)
      .filter(command => command instanceof UntagResourceCommand) as CommandWithInput[];
    expect(untagCalls.map(call => (call.input['TagKeys'] as string[]).length)).toEqual([50, 1]);
    expect(result.status).toBe(MODULE_STATE_CODE.SUCCESS);
  });

  it('reports a missing dry-run rule as pending creation with its complete desired tags and no retry delay', async () => {
    const timerSpy = vi.spyOn(globalThis, 'setTimeout');
    mockSend.mockResolvedValue({ ConfigRules: [] });

    const result = await tagConfigRules(
      request(
        [
          {
            ruleName: 'pending-rule',
            tags: [
              { key: 'Accelerator', value: 'AWSAccelerator' },
              { key: 'Owner', value: 'first' },
              { key: 'Owner', value: 'last' },
            ],
          },
        ],
        { dryRun: true },
      ),
    );

    expect(result.status).toBe(MODULE_STATE_CODE.SUCCESS);
    expect(result.summary).toContain('1 rule(s) are pending creation');
    expect(result.response?.targets[0].rules[0]).toEqual({
      ruleName: 'pending-rule',
      status: 'pending-create',
      managedTagKeys: ['Accelerator', 'Owner'],
      skippedTagKeys: [],
      changedTagKeys: ['Accelerator', 'Owner'],
      message: 'Config rule "pending-rule" is pending creation and would receive 2 configured tag(s)',
    });
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(timerSpy).not.toHaveBeenCalled();
    timerSpy.mockRestore();
  });

  it('retries cleanup-only discovery and removes owned tags when the rule becomes discoverable', async () => {
    vi.useFakeTimers();
    let describeCalls = 0;
    mockSend.mockImplementation(command => {
      if (command instanceof DescribeConfigRulesCommand) {
        describeCalls++;
        return Promise.resolve(
          describeCalls === 1
            ? { ConfigRules: [] }
            : { ConfigRules: [{ ConfigRuleName: 'removed-rule', ConfigRuleArn: RULE_ARN }] },
        );
      }
      if (command instanceof ListTagsForResourceCommand) {
        return Promise.resolve({ Tags: [{ Key: 'Accelerator', Value: 'AWSAccelerator' }] });
      }
      if (command instanceof UntagResourceCommand) {
        return Promise.resolve({});
      }
      return Promise.reject(new Error('Unexpected command'));
    });

    const resultPromise = tagConfigRules(
      request([
        {
          ruleName: 'removed-rule',
          tags: [],
          ownedTagKeys: ['Accelerator'],
          cleanupOnly: true,
        },
      ]),
    );
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(describeCalls).toBe(2);
    expect(mockSend.mock.calls.some(([command]) => command instanceof UntagResourceCommand)).toBe(true);
    expect(result.response?.targets[0].rules[0].status).toBe('tagged');
  });

  it('treats a cleanup-only rule as cleaned after bounded discovery retries are exhausted', async () => {
    vi.useFakeTimers();
    mockSend.mockResolvedValue({ ConfigRules: [] });

    const resultPromise = tagConfigRules(
      request([
        {
          ruleName: 'removed-rule',
          tags: [],
          ownedTagKeys: ['Accelerator'],
          cleanupOnly: true,
        },
      ]),
    );
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.status).toBe(MODULE_STATE_CODE.SUCCESS);
    expect(result.response?.targets[0].rules[0]).toEqual({
      ruleName: 'removed-rule',
      status: 'no-change',
      managedTagKeys: [],
      skippedTagKeys: [],
      message: 'Config rule "removed-rule" no longer exists; no owned tags require cleanup',
    });
    expect(mockSend).toHaveBeenCalledTimes(4);
  });

  it('performs one cleanup-only discovery pass during dry-run', async () => {
    const timerSpy = vi.spyOn(globalThis, 'setTimeout');
    mockSend.mockResolvedValue({ ConfigRules: [] });

    const result = await tagConfigRules(
      request(
        [
          {
            ruleName: 'removed-rule',
            tags: [],
            ownedTagKeys: ['Accelerator'],
            cleanupOnly: true,
          },
        ],
        { dryRun: true },
      ),
    );

    expect(result.status).toBe(MODULE_STATE_CODE.SUCCESS);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(timerSpy).not.toHaveBeenCalled();
    timerSpy.mockRestore();
  });

  it('removes owned tags from a cleanup-only rule that still exists', async () => {
    defaultApi([
      { Key: 'Accelerator', Value: 'AWSAccelerator' },
      { Key: 'CustomerTag', Value: 'preserved' },
    ]);

    const result = await tagConfigRules(
      request([
        {
          ruleName: 'removed-rule',
          tags: [],
          ownedTagKeys: ['Accelerator'],
          cleanupOnly: true,
        },
      ]),
    );

    const untagCall = mockSend.mock.calls
      .map(([command]) => command)
      .find(command => command instanceof UntagResourceCommand) as CommandWithInput;
    expect(untagCall.input['TagKeys']).toEqual(['Accelerator']);
    expect(result.response?.targets[0].rules[0]).toMatchObject({
      status: 'tagged',
      removedTagKeys: ['Accelerator'],
    });
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Config rule "removed-rule" has tag keys that are not managed by LZA configuration and will be preserved: ' +
        'CustomerTag; consider adding them to configuration to let LZA manage them',
      `${MANAGEMENT_ACCOUNT_ID}:us-east-1`,
    );
  });

  it.each(['list', 'untag'])('treats a cleanup-only rule deleted before %s as already cleaned', async failurePoint => {
    const notFound = new Error('resource no longer exists');
    notFound.name = 'ResourceNotFoundException';
    mockSend.mockImplementation(command => {
      if (command instanceof DescribeConfigRulesCommand) {
        return Promise.resolve({
          ConfigRules: [{ ConfigRuleName: 'removed-rule', ConfigRuleArn: RULE_ARN }],
        });
      }
      if (command instanceof ListTagsForResourceCommand) {
        return failurePoint === 'list'
          ? Promise.reject(notFound)
          : Promise.resolve({ Tags: [{ Key: 'Accelerator', Value: 'AWSAccelerator' }] });
      }
      if (command instanceof UntagResourceCommand) {
        return Promise.reject(notFound);
      }
      return Promise.reject(new Error('Unexpected command'));
    });

    const result = await tagConfigRules(
      request([
        {
          ruleName: 'removed-rule',
          tags: [],
          ownedTagKeys: ['Accelerator'],
          cleanupOnly: true,
        },
      ]),
    );

    expect(result.status).toBe(MODULE_STATE_CODE.SUCCESS);
    expect(result.response?.targets[0].rules[0]).toEqual({
      ruleName: 'removed-rule',
      status: 'no-change',
      managedTagKeys: [],
      skippedTagKeys: [],
      ...(failurePoint === 'untag' ? { unmanagedTagKeys: [] } : {}),
      message: 'Config rule "removed-rule" no longer exists; no owned tags require cleanup',
    });
  });

  it('keeps ResourceNotFoundException as a failure for a current rule', async () => {
    const notFound = new Error('resource no longer exists');
    notFound.name = 'ResourceNotFoundException';
    mockSend.mockImplementation(command => {
      if (command instanceof DescribeConfigRulesCommand) {
        return Promise.resolve({
          ConfigRules: [{ ConfigRuleName: 'current-rule', ConfigRuleArn: RULE_ARN }],
        });
      }
      if (command instanceof ListTagsForResourceCommand) {
        return Promise.reject(notFound);
      }
      return Promise.reject(new Error('Unexpected command'));
    });

    const result = await tagConfigRules(
      request([
        {
          ruleName: 'current-rule',
          tags: [{ key: 'Accelerator', value: 'AWSAccelerator' }],
          ownedTagKeys: ['Accelerator'],
        },
      ]),
    );

    expect(result.status).toBe(MODULE_STATE_CODE.FAILED);
    expect(result.response?.targets[0].rules[0]).toMatchObject({
      status: 'failed',
      error: { name: 'ResourceNotFoundException' },
    });
  });

  it('never applies desired tags supplied on a cleanup-only rule', async () => {
    defaultApi();

    const result = await tagConfigRules(
      request([
        {
          ruleName: 'removed-rule',
          tags: [{ key: 'Unexpected', value: 'value' }],
          ownedTagKeys: [],
          cleanupOnly: true,
        },
      ]),
    );

    expect(mockSend.mock.calls.some(([command]) => command instanceof TagResourceCommand)).toBe(false);
    expect(result.response?.targets[0].rules[0].status).toBe('no-change');
  });

  it('reports invalid desired tags for a pending dry-run rule as a validation failure', async () => {
    mockSend.mockResolvedValue({ ConfigRules: [] });

    const result = await tagConfigRules(
      request([{ ruleName: 'pending-rule', tags: [{ key: 'aws:Reserved', value: 'value' }] }], { dryRun: true }),
    );

    expect(result.status).toBe(MODULE_STATE_CODE.FAILED);
    expect(result.response?.targets[0].rules[0]).toMatchObject({
      ruleName: 'pending-rule',
      status: 'validation-error',
      error: { name: 'ValidationError' },
    });
  });

  it('applies exactly 50 desired user tags and skips a 51st tag', async () => {
    const desiredTags = Array.from({ length: 50 }, (_, index) => ({
      key: `Desired${index.toString().padStart(2, '0')}`,
      value: 'value',
    }));
    defaultApi();

    const boundaryResult = await tagConfigRules(request([{ ruleName: 'rule-a', tags: desiredTags }]));
    expect(boundaryResult.status).toBe(MODULE_STATE_CODE.SUCCESS);
    expect(boundaryResult.response?.targets[0].rules[0].status).toBe('tagged');

    vi.clearAllMocks();
    defaultApi();
    const overLimitResult = await tagConfigRules(
      request([{ ruleName: 'rule-a', tags: [...desiredTags, { key: 'Desired50', value: 'value' }] }]),
    );

    expect(overLimitResult.status).toBe(MODULE_STATE_CODE.SUCCESS);
    expect(overLimitResult.response?.targets[0].rules[0]).toMatchObject({
      status: 'tagged',
      managedTagKeys: desiredTags.map(tag => tag.key),
      skippedTagKeys: [{ key: 'Desired50', reason: 'tag-limit' }],
    });
    const tagCall = mockSend.mock.calls
      .map(([command]) => command)
      .find(command => command instanceof TagResourceCommand) as CommandWithInput;
    expect(tagCall.input['Tags']).toHaveLength(50);
    expect(tagCall.input['Tags']).not.toContainEqual({ Key: 'Desired50', Value: 'value' });
  });

  it('preserves a full unmanaged quota and skips missing module tags without failing', async () => {
    const unmanagedTags = Array.from({ length: 50 }, (_, index) => ({
      Key: `Customer${index}`,
      Value: 'preserved',
    }));
    defaultApi(unmanagedTags);

    const result = await tagConfigRules(
      request([
        {
          ruleName: 'rule-a',
          tags: [
            { key: 'DesiredOne', value: 'value' },
            { key: 'DesiredTwo', value: 'value' },
          ],
        },
      ]),
    );

    expect(result.status).toBe(MODULE_STATE_CODE.SUCCESS);
    expect(result.response?.targets[0].rules[0]).toMatchObject({
      status: 'no-change',
      managedTagKeys: [],
      skippedTagKeys: [
        { key: 'DesiredOne', reason: 'tag-limit' },
        { key: 'DesiredTwo', reason: 'tag-limit' },
      ],
      unmanagedTagKeys: unmanagedTags.map(tag => tag.Key).sort((left, right) => left.localeCompare(right)),
    });
    expect(
      mockSend.mock.calls.some(
        ([command]) => command instanceof TagResourceCommand || command instanceof UntagResourceCommand,
      ),
    ).toBe(false);
  });

  it('allows 50 final tags after planned owned removals and excludes AWS-reserved tags from the limit', async () => {
    const unmanagedTags = Array.from({ length: 49 }, (_, index) => ({
      Key: `Customer${index}`,
      Value: 'preserved',
    }));
    defaultApi([
      ...unmanagedTags,
      { Key: 'OwnedLegacy', Value: 'remove' },
      { Key: 'aws:service-tag', Value: 'excluded' },
    ]);

    const result = await tagConfigRules(
      request([
        {
          ruleName: 'rule-a',
          tags: [{ key: 'Desired', value: 'value' }],
          ownedTagKeys: ['OwnedLegacy'],
        },
      ]),
    );

    expect(result.status).toBe(MODULE_STATE_CODE.SUCCESS);
    expect(result.response?.targets[0].rules[0].status).toBe('tagged');
    expect(result.response?.targets[0].rules[0]).toMatchObject({
      managedTagKeys: ['Desired'],
      skippedTagKeys: [],
    });
    const writes = mockSend.mock.calls
      .map(([command]) => command)
      .filter(command => command instanceof UntagResourceCommand || command instanceof TagResourceCommand);
    expect(writes[0]).toBeInstanceOf(UntagResourceCommand);
    expect(writes[1]).toBeInstanceOf(TagResourceCommand);
  });

  it('does not count an update to an existing desired key as an additional tag', async () => {
    const unmanagedTags = Array.from({ length: 49 }, (_, index) => ({
      Key: `Customer${index}`,
      Value: 'preserved',
    }));
    defaultApi([...unmanagedTags, { Key: 'Desired', Value: 'drifted' }]);

    const result = await tagConfigRules(
      request([{ ruleName: 'rule-a', tags: [{ key: 'Desired', value: 'corrected' }] }]),
    );

    expect(result.status).toBe(MODULE_STATE_CODE.SUCCESS);
    expect(result.response?.targets[0].rules[0]).toMatchObject({
      status: 'tagged',
      changedTagKeys: ['Desired'],
    });
  });

  it('validates Config tag key and value constraints before writing', async () => {
    defaultApi();

    const result = await tagConfigRules(
      request([{ ruleName: 'rule-a', tags: [{ key: 'aws:Reserved', value: 'value' }] }]),
    );

    expect(result.response?.targets[0].rules[0].status).toBe('validation-error');
    expect(mockSend.mock.calls.some(([command]) => command instanceof TagResourceCommand)).toBe(false);
  });

  it.each([
    [
      'an unsupported value character',
      { key: 'ValidKey', value: 'invalid!' },
      'Tag "ValidKey" contains characters that AWS Config does not allow',
    ],
    [
      'a 129-character key',
      { key: 'k'.repeat(129), value: 'value' },
      'Tag key must contain between 1 and 128 characters',
    ],
    [
      'a 257-character value',
      { key: 'ValidKey', value: 'v'.repeat(257) },
      'Tag value for "ValidKey" exceeds 256 characters',
    ],
    [
      'a reserved value prefix',
      { key: 'Owner', value: 'AWS:Reserved' },
      'Tag value for "Owner" uses the reserved aws: prefix',
    ],
  ])('rejects %s before writing tags', async (_description, tag, expectedMessage) => {
    defaultApi();

    const result = await tagConfigRules(request([{ ruleName: 'rule-a', tags: [tag] }]));

    expect(result.status).toBe(MODULE_STATE_CODE.FAILED);
    expect(result.response?.targets[0].rules[0]).toMatchObject({
      status: 'validation-error',
      message: expectedMessage,
      error: { name: 'ValidationError' },
    });
    expect(mockSend.mock.calls.some(([command]) => command instanceof TagResourceCommand)).toBe(false);
  });

  it('counts astral Unicode letters as single code points for key and value limits', async () => {
    const astralLetter = '\u{10400}';
    defaultApi();

    const boundaryResult = await tagConfigRules(
      request([
        {
          ruleName: 'rule-a',
          tags: [{ key: astralLetter.repeat(128), value: astralLetter.repeat(256) }],
        },
      ]),
    );

    expect(boundaryResult.status).toBe(MODULE_STATE_CODE.SUCCESS);
    expect(boundaryResult.response?.targets[0].rules[0].status).toBe('tagged');
    expect(mockSend.mock.calls.some(([command]) => command instanceof TagResourceCommand)).toBe(true);

    vi.clearAllMocks();
    defaultApi();
    const longKeyResult = await tagConfigRules(
      request([{ ruleName: 'rule-a', tags: [{ key: astralLetter.repeat(129), value: 'value' }] }]),
    );

    expect(longKeyResult.response?.targets[0].rules[0]).toMatchObject({
      status: 'validation-error',
      message: 'Tag key must contain between 1 and 128 characters',
    });
    expect(mockSend.mock.calls.some(([command]) => command instanceof TagResourceCommand)).toBe(false);

    vi.clearAllMocks();
    defaultApi();
    const longValueResult = await tagConfigRules(
      request([{ ruleName: 'rule-a', tags: [{ key: 'Owner', value: astralLetter.repeat(257) }] }]),
    );

    expect(longValueResult.response?.targets[0].rules[0]).toMatchObject({
      status: 'validation-error',
      message: 'Tag value for "Owner" exceeds 256 characters',
    });
    expect(mockSend.mock.calls.some(([command]) => command instanceof TagResourceCommand)).toBe(false);
  });

  it('retries only rules that are still missing until they become discoverable', async () => {
    vi.useFakeTimers();
    let describeCall = 0;
    mockSend.mockImplementation(command => {
      if (command instanceof DescribeConfigRulesCommand) {
        describeCall++;
        if (describeCall === 1) {
          return Promise.resolve({
            ConfigRules: [{ ConfigRuleName: 'present-rule', ConfigRuleArn: `${RULE_ARN}/present-rule` }],
          });
        }
        if (describeCall === 2) {
          return Promise.resolve({ ConfigRules: [] });
        }
        return Promise.resolve({
          ConfigRules: [{ ConfigRuleName: 'eventual-rule', ConfigRuleArn: `${RULE_ARN}/eventual-rule` }],
        });
      }
      if (command instanceof ListTagsForResourceCommand) {
        return Promise.resolve({ Tags: [{ Key: 'Accelerator', Value: 'AWSAccelerator' }] });
      }
      return Promise.reject(new Error('Unexpected command'));
    });

    const resultPromise = tagConfigRules(
      request([
        { ruleName: 'present-rule', tags: [{ key: 'Accelerator', value: 'AWSAccelerator' }] },
        { ruleName: 'eventual-rule', tags: [{ key: 'Accelerator', value: 'AWSAccelerator' }] },
      ]),
    );
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    const describeCalls = mockSend.mock.calls
      .map(([command]) => command)
      .filter(command => command instanceof DescribeConfigRulesCommand) as CommandWithInput[];
    expect(describeCalls.map(call => call.input['ConfigRuleNames'])).toEqual([
      ['present-rule', 'eventual-rule'],
      ['eventual-rule'],
      ['eventual-rule'],
    ]);
    expect(result.status).toBe(MODULE_STATE_CODE.SUCCESS);
    expect(result.response?.targets[0].rules.map(rule => rule.status)).toEqual(['no-change', 'no-change']);
  });

  it('reports a rule that is still missing after bounded discovery attempts without failing the module', async () => {
    vi.useFakeTimers();
    mockSend.mockResolvedValue({ ConfigRules: [] });

    const resultPromise = tagConfigRules(
      request([{ ruleName: 'missing-rule', tags: [{ key: 'Accelerator', value: 'AWSAccelerator' }] }]),
    );
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.status).toBe(MODULE_STATE_CODE.SUCCESS);
    expect(result.summary).toBe('config-rule-tagging completed across 1 rule target(s); 1 rule(s) were not found');
    expect(result.error).toBeUndefined();
    expect(result.response?.targets[0].rules[0]).toEqual({
      ruleName: 'missing-rule',
      status: 'missing',
      skippedTagKeys: [],
      message:
        'Config rule "missing-rule" was not found after 4 discovery attempts and was not tagged; ' +
        'it may not be deployed to this account and Region',
    });
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Config rule(s) not found and not tagged: missing-rule'),
      `${MANAGEMENT_ACCOUNT_ID}:us-east-1`,
    );
    expect(mockLogger.error).not.toHaveBeenCalled();
    expect(mockSend).toHaveBeenCalledTimes(4);
  });

  it('keeps a target successful when one rule is tagged and another is missing', async () => {
    vi.useFakeTimers();
    mockSend.mockImplementation(command => {
      const input = (command as CommandWithInput).input;
      if (command instanceof DescribeConfigRulesCommand) {
        return Promise.resolve({
          ConfigRules: (input['ConfigRuleNames'] as string[])
            .filter(ruleName => ruleName === 'present-rule')
            .map(ruleName => ({ ConfigRuleName: ruleName, ConfigRuleArn: `${RULE_ARN}/${ruleName}` })),
        });
      }
      if (command instanceof ListTagsForResourceCommand) {
        return Promise.resolve({ Tags: [] });
      }
      if (command instanceof TagResourceCommand) {
        return Promise.resolve({});
      }
      return Promise.reject(new Error('Unexpected command'));
    });

    const resultPromise = tagConfigRules(
      request([
        { ruleName: 'present-rule', tags: [{ key: 'Accelerator', value: 'AWSAccelerator' }] },
        { ruleName: 'missing-rule', tags: [{ key: 'Accelerator', value: 'AWSAccelerator' }] },
      ]),
    );
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.status).toBe(MODULE_STATE_CODE.SUCCESS);
    expect(result.summary).toBe('config-rule-tagging completed across 2 rule target(s); 1 rule(s) were not found');
    expect(result.response?.targets[0].rules.map(rule => rule.status)).toEqual(['tagged', 'missing']);
    expect(mockLogger.error).not.toHaveBeenCalled();
    expect(mockSend.mock.calls.filter(([command]) => command instanceof TagResourceCommand)).toHaveLength(1);
  });

  it('reconciles a rule discovered on an earlier page when a later page fails for its batch', async () => {
    const accessDenied = new Error('describe denied');
    accessDenied.name = 'AccessDeniedException';
    let describeCalls = 0;
    mockSend.mockImplementation(command => {
      if (command instanceof DescribeConfigRulesCommand) {
        describeCalls++;
        return describeCalls === 1
          ? Promise.resolve({
              ConfigRules: [{ ConfigRuleName: 'present-rule', ConfigRuleArn: `${RULE_ARN}/present-rule` }],
              NextToken: 'describe-next',
            })
          : Promise.reject(accessDenied);
      }
      if (command instanceof ListTagsForResourceCommand) {
        return Promise.resolve({ Tags: [] });
      }
      if (command instanceof TagResourceCommand) {
        return Promise.resolve({});
      }
      return Promise.reject(new Error('Unexpected command'));
    });

    const result = await tagConfigRules(
      request([
        { ruleName: 'present-rule', tags: [{ key: 'Accelerator', value: 'AWSAccelerator' }] },
        { ruleName: 'later-page-rule', tags: [{ key: 'Accelerator', value: 'AWSAccelerator' }] },
      ]),
    );

    expect(result.status).toBe(MODULE_STATE_CODE.FAILED);
    expect(result.summary).toBe('config-rule-tagging completed with 1 failure(s) across 2 rule target(s)');
    expect(result.response?.targets[0].rules).toEqual([
      {
        ruleName: 'present-rule',
        status: 'tagged',
        managedTagKeys: ['Accelerator'],
        skippedTagKeys: [],
        changedTagKeys: ['Accelerator'],
        removedTagKeys: [],
        unmanagedTagKeys: [],
        message: 'Config rule "present-rule" updated 1 tag(s) and removed 0 tag(s)',
      },
      {
        ruleName: 'later-page-rule',
        status: 'failed',
        skippedTagKeys: [],
        message: 'describe denied',
        error: { name: 'AccessDeniedException', message: 'describe denied' },
      },
    ]);
    const tagCalls = mockSend.mock.calls
      .map(([command]) => command)
      .filter(command => command instanceof TagResourceCommand) as CommandWithInput[];
    expect(tagCalls.map(call => call.input['ResourceArn'])).toEqual([`${RULE_ARN}/present-rule`]);
  });

  it('records a generic multi-name DescribeConfigRules failure for every rule without splitting', async () => {
    const accessDenied = new Error('describe denied');
    accessDenied.name = 'AccessDeniedException';
    const expectedError = { name: 'AccessDeniedException', message: 'describe denied' };
    mockSend.mockImplementation(command => {
      if (command instanceof DescribeConfigRulesCommand) {
        return Promise.reject(accessDenied);
      }
      return Promise.reject(new Error('Unexpected command'));
    });

    const result = await tagConfigRules(
      request([
        { ruleName: 'rule-a', tags: [{ key: 'Accelerator', value: 'AWSAccelerator' }] },
        { ruleName: 'rule-b', tags: [{ key: 'Accelerator', value: 'AWSAccelerator' }] },
      ]),
    );

    const commands = mockSend.mock.calls.map(([command]) => command);
    const describeCommands = commands.filter(command => command instanceof DescribeConfigRulesCommand);
    expect(result.status).toBe(MODULE_STATE_CODE.FAILED);
    expect(result.summary).toBe('config-rule-tagging completed with 2 failure(s) across 2 rule target(s)');
    expect(result.response?.targets[0].rules).toEqual([
      {
        ruleName: 'rule-a',
        status: 'failed',
        skippedTagKeys: [],
        message: 'describe denied',
        error: expectedError,
      },
      {
        ruleName: 'rule-b',
        status: 'failed',
        skippedTagKeys: [],
        message: 'describe denied',
        error: expectedError,
      },
    ]);
    expect(result.error).toEqual(expectedError);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(describeCommands).toHaveLength(1);
    expect((describeCommands[0] as CommandWithInput).input['ConfigRuleNames']).toEqual(['rule-a', 'rule-b']);
    expect(
      commands.some(
        command =>
          command instanceof ListTagsForResourceCommand ||
          command instanceof TagResourceCommand ||
          command instanceof UntagResourceCommand,
      ),
    ).toBe(false);
  });

  it('splits a multi-name NoSuchConfigRuleException and retains an individual generic failure', async () => {
    const noSuchRule = new Error('batch contains a missing rule');
    noSuchRule.name = 'NoSuchConfigRuleException';
    const accessDenied = new Error('individual describe denied');
    accessDenied.name = 'AccessDeniedException';
    const expectedError = { name: 'AccessDeniedException', message: 'individual describe denied' };

    mockSend.mockImplementation(command => {
      const input = (command as CommandWithInput).input;
      if (command instanceof DescribeConfigRulesCommand) {
        const names = input['ConfigRuleNames'];
        if (!Array.isArray(names) || !names.every((name: unknown): name is string => typeof name === 'string')) {
          return Promise.reject(new Error('Expected Config rule names'));
        }
        if (names.length > 1) {
          return Promise.reject(noSuchRule);
        }
        if (names[0] === 'present-rule') {
          return Promise.resolve({
            ConfigRules: [
              {
                ConfigRuleName: 'present-rule',
                ConfigRuleArn: `${RULE_ARN}/present-rule`,
              },
            ],
          });
        }
        if (names[0] === 'denied-rule') {
          return Promise.reject(accessDenied);
        }
      }
      if (command instanceof ListTagsForResourceCommand) {
        return Promise.resolve({ Tags: [{ Key: 'Accelerator', Value: 'AWSAccelerator' }] });
      }
      return Promise.reject(new Error('Unexpected command'));
    });

    const result = await tagConfigRules(
      request([
        { ruleName: 'present-rule', tags: [{ key: 'Accelerator', value: 'AWSAccelerator' }] },
        { ruleName: 'denied-rule', tags: [{ key: 'Accelerator', value: 'AWSAccelerator' }] },
      ]),
    );

    const commands = mockSend.mock.calls.map(([command]) => command);
    const describeCommands = commands.filter(command => command instanceof DescribeConfigRulesCommand);
    expect(result.status).toBe(MODULE_STATE_CODE.FAILED);
    expect(result.summary).toBe('config-rule-tagging completed with 1 failure(s) across 2 rule target(s)');
    expect(result.response?.targets[0].rules).toEqual([
      {
        ruleName: 'present-rule',
        status: 'no-change',
        managedTagKeys: ['Accelerator'],
        skippedTagKeys: [],
        unmanagedTagKeys: [],
        message: 'Config rule "present-rule" already has the desired tags',
      },
      {
        ruleName: 'denied-rule',
        status: 'failed',
        skippedTagKeys: [],
        message: 'individual describe denied',
        error: expectedError,
      },
    ]);
    expect(result.error).toEqual(expectedError);
    expect(describeCommands).toHaveLength(3);
    expect(describeCommands.map(command => (command as CommandWithInput).input['ConfigRuleNames'])).toEqual(
      expect.arrayContaining([['present-rule', 'denied-rule'], ['present-rule'], ['denied-rule']]),
    );
    expect(
      commands.some(command => command instanceof TagResourceCommand || command instanceof UntagResourceCommand),
    ).toBe(false);
  });

  it('isolates a missing rule when AWS rejects its named DescribeConfigRules batch', async () => {
    vi.useFakeTimers();
    const noSuchRule = new Error('missing');
    noSuchRule.name = 'NoSuchConfigRuleException';
    let batchRejected = false;

    mockSend.mockImplementation(command => {
      const input = (command as CommandWithInput).input;
      if (command instanceof DescribeConfigRulesCommand) {
        const names = input['ConfigRuleNames'] as string[];
        if (names.length > 1 && !batchRejected) {
          batchRejected = true;
          return Promise.reject(noSuchRule);
        }
        if (names[0] === 'missing-rule') {
          return Promise.reject(noSuchRule);
        }
        return Promise.resolve({
          ConfigRules: [{ ConfigRuleName: names[0], ConfigRuleArn: `${RULE_ARN}/${names[0]}` }],
        });
      }
      if (command instanceof ListTagsForResourceCommand) {
        return Promise.resolve({ Tags: [] });
      }
      if (command instanceof TagResourceCommand) {
        return Promise.resolve({});
      }
      return Promise.reject(new Error('Unexpected command'));
    });

    const resultPromise = tagConfigRules(
      request([
        { ruleName: 'present-rule', tags: [{ key: 'Accelerator', value: 'AWSAccelerator' }] },
        { ruleName: 'missing-rule', tags: [{ key: 'Accelerator', value: 'AWSAccelerator' }] },
      ]),
    );
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.status).toBe(MODULE_STATE_CODE.SUCCESS);
    expect(result.response?.targets[0].rules.map(rule => rule.status)).toEqual(['tagged', 'missing']);
  });

  it('isolates rule failures and continues with later rules', async () => {
    let listCall = 0;
    mockSend.mockImplementation(command => {
      const input = (command as CommandWithInput).input;
      if (command instanceof DescribeConfigRulesCommand) {
        return Promise.resolve({
          ConfigRules: (input['ConfigRuleNames'] as string[]).map(ruleName => ({
            ConfigRuleName: ruleName,
            ConfigRuleArn: `${RULE_ARN}/${ruleName}`,
          })),
        });
      }
      if (command instanceof ListTagsForResourceCommand) {
        listCall++;
        return listCall === 1 ? Promise.reject(new Error('list failed')) : Promise.resolve({ Tags: [] });
      }
      if (command instanceof TagResourceCommand) {
        return Promise.resolve({});
      }
      return Promise.reject(new Error('Unexpected command'));
    });

    const result = await tagConfigRules(
      request([
        { ruleName: 'rule-a', tags: [{ key: 'Accelerator', value: 'AWSAccelerator' }] },
        { ruleName: 'rule-b', tags: [{ key: 'Accelerator', value: 'AWSAccelerator' }] },
      ]),
    );

    expect(result.status).toBe(MODULE_STATE_CODE.FAILED);
    expect(result.response?.targets[0].rules.map(rule => rule.status)).toEqual(['failed', 'tagged']);
  });

  it('aggregates target failures while preserving input target order', async () => {
    const accessDenied = new Error('assume role denied');
    accessDenied.name = 'AccessDeniedException';
    const expectedError = { name: 'AccessDeniedException', message: 'assume role denied' };
    mockGetCredentials.mockRejectedValueOnce(accessDenied);
    defaultApi([{ Key: 'Accelerator', Value: 'AWSAccelerator' }]);

    const baseRequest = request([]);
    const result = await tagConfigRules({
      ...baseRequest,
      configuration: {
        ...baseRequest.configuration,
        targets: [
          {
            accountId: MANAGEMENT_ACCOUNT_ID,
            region: 'us-east-1',
            rules: [{ ruleName: 'management-rule', tags: [{ key: 'Accelerator', value: 'AWSAccelerator' }] }],
          },
          {
            accountId: MEMBER_ACCOUNT_ID,
            region: 'us-west-2',
            rules: [
              { ruleName: 'member-rule-a', tags: [{ key: 'Accelerator', value: 'AWSAccelerator' }] },
              { ruleName: 'member-rule-b', tags: [{ key: 'Accelerator', value: 'AWSAccelerator' }] },
            ],
          },
        ],
      },
    });

    expect(result.status).toBe(MODULE_STATE_CODE.FAILED);
    expect(result.summary).toBe('config-rule-tagging completed with 2 failure(s) across 3 rule target(s)');
    expect(result.response?.targets.map(target => ({ accountId: target.accountId, region: target.region }))).toEqual([
      { accountId: MANAGEMENT_ACCOUNT_ID, region: 'us-east-1' },
      { accountId: MEMBER_ACCOUNT_ID, region: 'us-west-2' },
    ]);
    expect(result.response?.targets[0].rules.map(rule => rule.status)).toEqual(['no-change']);
    expect(result.response?.targets[1].rules).toEqual([
      {
        ruleName: 'member-rule-a',
        status: 'failed',
        message: 'assume role denied',
        error: expectedError,
      },
      {
        ruleName: 'member-rule-b',
        status: 'failed',
        message: 'assume role denied',
        error: expectedError,
      },
    ]);
    expect(result.error).toEqual(expectedError);
    expect(mockGetCredentials).toHaveBeenCalledTimes(1);
    expect(mockGetCredentials).toHaveBeenCalledWith(expect.objectContaining({ accountId: MEMBER_ACCOUNT_ID }));
  });

  it('resolves standalone, embedded, repeated, and versioned SSM global tags without returning values', async () => {
    mockSsmSend.mockResolvedValue({
      Parameters: [
        { Name: '/global/plain', Value: 'plain-value', Type: 'String', Version: 8 },
        {
          Name: '/global/versioned',
          Selector: ':3',
          Value: 'versioned-value',
          Type: 'String',
          Version: 3,
        },
      ],
      InvalidParameters: [],
    });
    defaultApi();

    const result = await tagConfigRules(
      request([
        {
          ruleName: 'rule-a',
          tags: [
            { key: 'Static', value: 'static-value' },
            { key: 'Dynamic', dynamicValue: '{{resolve:ssm:/global/plain}}' },
            { key: 'Embedded', dynamicValue: 'env-{{resolve:ssm:/global/plain}}' },
            {
              key: 'Multiple',
              dynamicValue:
                '{{resolve:ssm:/global/plain}}-{{resolve:ssm:/global/versioned:3}}-{{resolve:ssm:/global/plain}}',
            },
            { key: 'Versioned', dynamicValue: '{{resolve:ssm:/global/versioned:3}}' },
          ],
        },
      ]),
    );

    const ssmCommand = mockSsmSend.mock.calls[0][0] as CommandWithInput;
    expect(ssmCommand).toBeInstanceOf(GetParametersCommand);
    expect(ssmCommand.input).toEqual({
      Names: ['/global/plain', '/global/versioned:3'],
      WithDecryption: false,
    });
    const tagCommand = mockSend.mock.calls
      .map(([command]) => command)
      .find(command => command instanceof TagResourceCommand) as CommandWithInput;
    expect(tagCommand.input['Tags']).toEqual([
      { Key: 'Dynamic', Value: 'plain-value' },
      { Key: 'Embedded', Value: 'env-plain-value' },
      { Key: 'Multiple', Value: 'plain-value-versioned-value-plain-value' },
      { Key: 'Static', Value: 'static-value' },
      { Key: 'Versioned', Value: 'versioned-value' },
    ]);
    expect(result.response?.targets[0].rules[0]).toMatchObject({
      status: 'tagged',
      managedTagKeys: ['Dynamic', 'Embedded', 'Multiple', 'Static', 'Versioned'],
      changedTagKeys: ['Dynamic', 'Embedded', 'Multiple', 'Static', 'Versioned'],
    });
    expect(JSON.stringify(result)).not.toContain('plain-value');
    expect(JSON.stringify(result)).not.toContain('versioned-value');
    expect(JSON.stringify(result)).not.toContain('/global/plain');
  });

  it.each([
    {
      responseOrder: 'pinned response first',
      parameters: [
        {
          Name: '/global/shared',
          Selector: ':3',
          Value: 'pinned-value',
          Type: 'String',
          Version: 3,
        },
        { Name: '/global/shared', Value: 'latest-value', Type: 'String', Version: 4 },
      ],
    },
    {
      responseOrder: 'latest response first',
      parameters: [
        { Name: '/global/shared', Value: 'latest-value', Type: 'String', Version: 4 },
        {
          Name: '/global/shared',
          Selector: ':3',
          Value: 'pinned-value',
          Type: 'String',
          Version: 3,
        },
      ],
    },
  ])('maps same-name latest and pinned selectors exactly with $responseOrder', async ({ parameters }) => {
    mockSsmSend.mockResolvedValue({ Parameters: parameters, InvalidParameters: [] });
    defaultApi();

    const result = await tagConfigRules(
      request([
        {
          ruleName: 'rule-a',
          tags: [
            { key: 'Latest', dynamicValue: '{{resolve:ssm:/global/shared}}' },
            { key: 'Pinned', dynamicValue: '{{resolve:ssm:/global/shared:3}}' },
          ],
        },
      ]),
    );

    const ssmCommand = mockSsmSend.mock.calls[0][0] as CommandWithInput;
    expect(ssmCommand.input['Names']).toEqual(['/global/shared', '/global/shared:3']);
    const tagCommand = mockSend.mock.calls
      .map(([command]) => command)
      .find(command => command instanceof TagResourceCommand) as CommandWithInput;
    expect(tagCommand.input['Tags']).toEqual([
      { Key: 'Latest', Value: 'latest-value' },
      { Key: 'Pinned', Value: 'pinned-value' },
    ]);
    expect(result.response?.targets[0].rules[0]).toMatchObject({
      status: 'tagged',
      managedTagKeys: ['Latest', 'Pinned'],
    });
    expect(JSON.stringify(result)).not.toContain('latest-value');
    expect(JSON.stringify(result)).not.toContain('pinned-value');
  });

  it.each([
    {
      mismatch: 'a pinned response without Selector',
      tag: { key: 'Pinned', dynamicValue: '{{resolve:ssm:/global/shared:3}}' },
      parameter: { Name: '/global/shared', Value: 'unmatched-value', Type: 'String', Version: 3 },
    },
    {
      mismatch: 'an unknown response Selector for a latest request',
      tag: { key: 'Latest', dynamicValue: '{{resolve:ssm:/global/shared}}' },
      parameter: {
        Name: '/global/shared',
        Selector: ':99',
        Value: 'unmatched-value',
        Type: 'String',
        Version: 99,
      },
    },
  ])('skips $mismatch without guessing a value', async ({ tag, parameter }) => {
    mockSsmSend.mockResolvedValue({ Parameters: [parameter], InvalidParameters: [] });
    defaultApi();

    const result = await tagConfigRules(request([{ ruleName: 'rule-a', tags: [tag] }]));

    expect(result.response?.targets[0].rules[0]).toMatchObject({
      status: 'no-change',
      managedTagKeys: [],
      skippedTagKeys: [{ key: tag.key, reason: 'ssm-parameter-missing' }],
    });
    expect(mockSend.mock.calls.some(([command]) => command instanceof TagResourceCommand)).toBe(false);
    expect(JSON.stringify(result)).not.toContain('unmatched-value');
  });

  it('deduplicates selectors and resolves sequential batches of at most 10', async () => {
    mockSsmSend.mockImplementation(command => {
      const names = ((command as CommandWithInput).input['Names'] as string[]) ?? [];
      return Promise.resolve({
        Parameters: names.map(name => ({ Name: name, Value: 'value', Type: 'String', Version: 1 })),
        InvalidParameters: [],
      });
    });
    defaultApi();
    const dynamicTags = Array.from({ length: 11 }, (_, index) => ({
      key: `Dynamic${index}`,
      dynamicValue: `{{resolve:ssm:/global/parameter-${index}}}`,
    }));

    await tagConfigRules(
      request([
        { ruleName: 'rule-a', tags: dynamicTags },
        { ruleName: 'rule-b', tags: [dynamicTags[0]] },
      ]),
    );

    const batches = mockSsmSend.mock.calls.map(
      ([command]) => ((command as CommandWithInput).input['Names'] as string[]) ?? [],
    );
    expect(batches.map(batch => batch.length)).toEqual([10, 1]);
    expect(batches.flat()).toEqual(Array.from({ length: 11 }, (_, index) => `/global/parameter-${index}`));
  });

  it('uses target-local SSM values without cross-target caching', async () => {
    mockSsmSend
      .mockResolvedValueOnce({
        Parameters: [{ Name: '/global/shared', Value: 'target-one', Type: 'String', Version: 1 }],
        InvalidParameters: [],
      })
      .mockResolvedValueOnce({
        Parameters: [{ Name: '/global/shared', Value: 'target-two', Type: 'String', Version: 1 }],
        InvalidParameters: [],
      });
    defaultApi();
    const baseRequest = request([]);

    const result = await tagConfigRules({
      ...baseRequest,
      configuration: {
        ...baseRequest.configuration,
        targets: [
          {
            accountId: MANAGEMENT_ACCOUNT_ID,
            region: 'us-east-1',
            rules: [{ ruleName: 'rule-a', tags: [{ key: 'Dynamic', dynamicValue: '{{resolve:ssm:/global/shared}}' }] }],
          },
          {
            accountId: MEMBER_ACCOUNT_ID,
            region: 'us-west-2',
            rules: [{ ruleName: 'rule-b', tags: [{ key: 'Dynamic', dynamicValue: '{{resolve:ssm:/global/shared}}' }] }],
          },
        ],
      },
    });

    expect(mockSsmSend).toHaveBeenCalledTimes(2);
    const tagValues = mockSend.mock.calls
      .map(([command]) => command)
      .filter(command => command instanceof TagResourceCommand)
      .flatMap(command => ((command as CommandWithInput).input['Tags'] as Array<{ Value: string }>) ?? [])
      .map(tag => tag.Value)
      .sort();
    expect(tagValues).toEqual(['target-one', 'target-two']);
    expect(JSON.stringify(result)).not.toContain('target-one');
    expect(JSON.stringify(result)).not.toContain('target-two');
  });

  it('applies a comma-free StringList value because CloudFormation resolves that type too', async () => {
    mockSsmSend.mockResolvedValue({
      Parameters: [{ Name: '/global/dynamic', Value: 'single-element-value', Type: 'StringList', Version: 1 }],
      InvalidParameters: [],
    });
    defaultApi();

    const result = await tagConfigRules(
      request([{ ruleName: 'rule-a', tags: [{ key: 'Dynamic', dynamicValue: '{{resolve:ssm:/global/dynamic}}' }] }]),
    );

    const tagValues = mockSend.mock.calls
      .map(([command]) => command)
      .filter(command => command instanceof TagResourceCommand)
      .flatMap(command => ((command as CommandWithInput).input['Tags'] as Array<{ Value: string }>) ?? [])
      .map(tag => tag.Value);
    expect(tagValues).toEqual(['single-element-value']);
    expect(JSON.stringify(result)).not.toContain('single-element-value');
  });

  it.each([
    {
      name: 'missing parameter',
      response: { Parameters: [], InvalidParameters: ['/global/dynamic'] },
      reason: 'ssm-parameter-missing',
    },
    {
      name: 'access denied',
      errorName: 'AccessDeniedException',
      reason: 'ssm-access-denied',
    },
    {
      name: 'throttling exhaustion',
      errorName: 'ThrottlingException',
      reason: 'ssm-throttling-exhausted',
    },
    {
      name: 'SecureString parameter',
      response: {
        Parameters: [{ Name: '/global/dynamic', Value: 'ciphertext', Type: 'SecureString', Version: 1 }],
        InvalidParameters: [],
      },
      reason: 'ssm-unsupported-type',
    },
    {
      name: 'multi-element StringList parameter, because AWS tags do not allow commas',
      response: {
        Parameters: [{ Name: '/global/dynamic', Value: 'one,two', Type: 'StringList', Version: 1 }],
        InvalidParameters: [],
      },
      reason: 'ssm-resolved-value-invalid',
    },
    {
      name: 'invalid resolved String value',
      response: {
        Parameters: [{ Name: '/global/dynamic', Value: 'one,two', Type: 'String', Version: 1 }],
        InvalidParameters: [],
      },
      reason: 'ssm-resolved-value-invalid',
    },
  ])('non-fatally skips $name and protects the live key', async scenario => {
    if (scenario.errorName) {
      const error = new Error('resolution failed');
      error.name = scenario.errorName;
      mockSsmSend.mockRejectedValue(error);
    } else {
      mockSsmSend.mockResolvedValue(scenario.response);
    }
    defaultApi([{ Key: 'Dynamic', Value: 'existing-value' }]);

    const result = await tagConfigRules(
      request([
        {
          ruleName: 'rule-a',
          tags: [{ key: 'Dynamic', dynamicValue: '{{resolve:ssm:/global/dynamic}}' }],
          ownedTagKeys: ['Dynamic'],
        },
      ]),
    );

    expect(result.status).toBe(MODULE_STATE_CODE.SUCCESS);
    expect(result.response?.targets[0].rules[0]).toMatchObject({
      status: 'no-change',
      managedTagKeys: [],
      skippedTagKeys: [{ key: 'Dynamic', reason: scenario.reason }],
      unmanagedTagKeys: [],
    });
    expect(mockSend.mock.calls.some(([command]) => command instanceof TagResourceCommand)).toBe(false);
    expect(mockSend.mock.calls.some(([command]) => command instanceof UntagResourceCommand)).toBe(false);
    expect(JSON.stringify(result)).not.toContain('existing-value');
    expect(JSON.stringify(result)).not.toContain('/global/dynamic');
  });

  it.each(
    [
      {
        name: 'missing dynamic',
        response: { Parameters: [], InvalidParameters: ['/global/capacity'] },
        reason: 'ssm-parameter-missing',
      },
      {
        name: 'invalid resolved dynamic',
        response: {
          Parameters: [{ Name: '/global/capacity', Value: 'invalid!', Type: 'String', Version: 1 }],
          InvalidParameters: [],
        },
        reason: 'ssm-resolved-value-invalid',
      },
    ].flatMap(scenario => [
      { ...scenario, dryRun: false },
      { ...scenario, dryRun: true },
    ]),
  )('lets a later valid tag fill capacity after $name in dryRun=$dryRun', async scenario => {
    const externallyManagedTags = Array.from({ length: 48 }, (_, index) => ({
      Key: `Rule${index.toString().padStart(2, '0')}`,
      Value: 'rule-value',
    }));
    mockSsmSend.mockResolvedValue(scenario.response);
    defaultApi(externallyManagedTags);

    const result = await tagConfigRules(
      request(
        [
          {
            ruleName: 'rule-a',
            tags: [
              { key: 'ADynamic', dynamicValue: '{{resolve:ssm:/global/capacity}}' },
              { key: 'Accelerator', value: 'AWSAccelerator' },
              { key: 'ZValid', value: 'value' },
            ],
            externallyManagedTagKeys: externallyManagedTags.map(tag => tag.Key),
          },
        ],
        { dryRun: scenario.dryRun },
      ),
    );

    expect(result.status).toBe(MODULE_STATE_CODE.SUCCESS);
    expect(result.response?.targets[0].rules[0]).toMatchObject({
      status: scenario.dryRun ? 'dry-run' : 'tagged',
      managedTagKeys: ['Accelerator', 'ZValid'],
      changedTagKeys: ['Accelerator', 'ZValid'],
      skippedTagKeys: [{ key: 'ADynamic', reason: scenario.reason }],
      unmanagedTagKeys: [],
    });
    const tagCommands = mockSend.mock.calls
      .map(([command]) => command)
      .filter(command => command instanceof TagResourceCommand) as CommandWithInput[];
    expect(tagCommands).toHaveLength(scenario.dryRun ? 0 : 1);
    if (!scenario.dryRun) {
      expect(tagCommands[0].input['Tags']).toEqual([
        { Key: 'Accelerator', Value: 'AWSAccelerator' },
        { Key: 'ZValid', Value: 'value' },
      ]);
    }
  });

  it.each([
    '{{resolve:ssm-secure:/sensitive/secure-path}}',
    '{{resolve:secretsmanager:sensitive-secret-id:SecretString:key}}',
    '{{resolve:unknown:sensitive-identifier}}',
    '{{resolve:ssm:/malformed:not-a-version}}',
  ])('non-fatally skips unsupported dynamic value without an SSM lookup: %s', async dynamicValue => {
    defaultApi([{ Key: 'Dynamic', Value: 'existing-value' }]);

    const result = await tagConfigRules(
      request([
        {
          ruleName: 'rule-a',
          tags: [{ key: 'Dynamic', dynamicValue }],
          ownedTagKeys: ['Dynamic'],
        },
      ]),
    );

    expect(result.status).toBe(MODULE_STATE_CODE.SUCCESS);
    expect(result.response?.targets[0].rules[0]).toMatchObject({
      status: 'no-change',
      managedTagKeys: [],
      skippedTagKeys: [{ key: 'Dynamic', reason: 'unsupported-dynamic-reference' }],
      unmanagedTagKeys: [],
    });
    expect(mockSsmSend).not.toHaveBeenCalled();
    expect(mockSend.mock.calls.some(([command]) => command instanceof TagResourceCommand)).toBe(false);
    expect(mockSend.mock.calls.some(([command]) => command instanceof UntagResourceCommand)).toBe(false);
    expect(JSON.stringify(result)).not.toContain(dynamicValue);
    expect(JSON.stringify(result)).not.toContain('sensitive');
    expect(JSON.stringify(result)).not.toContain('existing-value');
  });

  it('suppresses unmanaged reporting and deletion for externally managed rule keys', async () => {
    defaultApi([
      { Key: 'RuleTag', Value: 'legacy-value' },
      { Key: 'GlobalTag', Value: 'global-value' },
    ]);

    const result = await tagConfigRules(
      request([
        {
          ruleName: 'rule-a',
          tags: [{ key: 'GlobalTag', value: 'global-value' }],
          externallyManagedTagKeys: ['RuleTag'],
          ownedTagKeys: ['RuleTag'],
        },
      ]),
    );

    expect(result.response?.targets[0].rules[0]).toMatchObject({
      status: 'no-change',
      managedTagKeys: ['GlobalTag'],
      unmanagedTagKeys: [],
    });
    expect(mockSend.mock.calls.some(([command]) => command instanceof UntagResourceCommand)).toBe(false);
  });

  it('skips one capacity-conflict tag while reconciling a later rule', async () => {
    const externalTags = Array.from({ length: 49 }, (_, index) => ({
      Key: `External${index}`,
      Value: 'preserved',
    }));
    mockSend.mockImplementation(command => {
      const input = (command as CommandWithInput).input;
      if (command instanceof DescribeConfigRulesCommand) {
        return Promise.resolve({
          ConfigRules: (input['ConfigRuleNames'] as string[]).map(ruleName => ({
            ConfigRuleName: ruleName,
            ConfigRuleArn: `${RULE_ARN}/${ruleName}`,
          })),
        });
      }
      if (command instanceof ListTagsForResourceCommand) {
        return Promise.resolve({
          Tags: String(input['ResourceArn']).endsWith('/rule-a') ? externalTags : [],
        });
      }
      if (command instanceof TagResourceCommand) {
        return Promise.resolve({});
      }
      return Promise.reject(new Error('Unexpected command'));
    });

    const result = await tagConfigRules(
      request([
        {
          ruleName: 'rule-a',
          tags: [
            { key: 'GlobalOne', value: 'value' },
            { key: 'GlobalTwo', value: 'value' },
          ],
          externallyManagedTagKeys: externalTags.map(tag => tag.Key),
        },
        {
          ruleName: 'rule-b',
          tags: [{ key: 'GlobalOne', value: 'value' }],
        },
      ]),
    );

    expect(result.status).toBe(MODULE_STATE_CODE.SUCCESS);
    expect(result.response?.targets[0].rules.map(rule => rule.status)).toEqual(['tagged', 'tagged']);
    expect(result.response?.targets[0].rules[0]).toMatchObject({
      managedTagKeys: ['GlobalOne'],
      skippedTagKeys: [{ key: 'GlobalTwo', reason: 'tag-limit' }],
      unmanagedTagKeys: [],
    });
    const tagCalls = mockSend.mock.calls
      .map(([command]) => command)
      .filter(command => command instanceof TagResourceCommand);
    expect(tagCalls).toHaveLength(2);
    expect(tagCalls.map(command => (command as CommandWithInput).input['ResourceArn'])).toEqual([
      `${RULE_ARN}/rule-a`,
      `${RULE_ARN}/rule-b`,
    ]);
  });

  it('resolves a dynamic global for pending-create dry-run without returning its value', async () => {
    mockSsmSend.mockResolvedValue({
      Parameters: [{ Name: '/global/pending', Value: 'resolved-value', Type: 'String', Version: 1 }],
      InvalidParameters: [],
    });
    mockSend.mockResolvedValue({ ConfigRules: [] });

    const result = await tagConfigRules(
      request(
        [
          {
            ruleName: 'pending-rule',
            tags: [{ key: 'Dynamic', dynamicValue: '{{resolve:ssm:/global/pending}}' }],
          },
        ],
        { dryRun: true },
      ),
    );

    expect(result.response?.targets[0].rules[0]).toMatchObject({
      status: 'pending-create',
      managedTagKeys: ['Dynamic'],
      changedTagKeys: ['Dynamic'],
    });
    expect(JSON.stringify(result)).not.toContain('resolved-value');
    expect(JSON.stringify(result)).not.toContain('/global/pending');
  });

  it('assumes the configured access role only for non-management accounts', async () => {
    defaultApi([{ Key: 'Accelerator', Value: 'AWSAccelerator' }]);

    await tagConfigRules(request([{ ruleName: 'rule-a', tags: [{ key: 'Accelerator', value: 'AWSAccelerator' }] }]));
    expect(mockGetCredentials).not.toHaveBeenCalled();

    await tagConfigRules(
      request([{ ruleName: 'rule-a', tags: [{ key: 'Accelerator', value: 'AWSAccelerator' }] }], {
        accountId: MEMBER_ACCOUNT_ID,
      }),
    );
    expect(mockGetCredentials).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: MEMBER_ACCOUNT_ID,
        assumeRoleName: 'AWSAcceleratorExecutionRole',
        sessionPolicy: expect.any(String),
      }),
    );
  });
});
