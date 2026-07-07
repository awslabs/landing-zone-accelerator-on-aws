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

import { describe, beforeEach, expect, test, vi } from 'vitest';
import { ListTagsForResourceCommand, TagResourceCommand, UntagResourceCommand } from '@aws-sdk/client-organizations';

const mockSend = vi.fn();

vi.mock('@aws-sdk/client-organizations', () => {
  return {
    OrganizationsClient: class {
      send = mockSend;
    },
    ListTagsForResourceCommand: vi.fn(),
    TagResourceCommand: vi.fn(),
    UntagResourceCommand: vi.fn(),
  };
});

vi.mock('../../../lib/common/throttle', () => ({
  throttlingBackOff: vi.fn(fn => fn()),
}));

vi.mock('../../../lib/common/utility', async () => ({
  ...(await vi.importActual('../../../lib/common/utility')),
  setRetryStrategy: vi.fn(() => ({})),
}));

// Import after mocks
import { manageAccountTags } from '../../../lib/aws-organizations/manage-account-tags';
import { IAccountTagsConfig, IManageAccountTagsModuleRequest } from '../../../lib/aws-organizations/interfaces';
import { MODULE_STATE_CODE } from '../../../lib/common/types';

// --- Generators (plain TypeScript, per LZA testing conventions) ---

const ALPHA_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.';

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomString(minLen: number, maxLen: number, chars = ALPHA_CHARS): string {
  const len = randomInt(minLen, maxLen);
  let result = '';
  for (let i = 0; i < len; i++) {
    result += chars[randomInt(0, chars.length - 1)];
  }
  return result;
}

function randomValidTagKey(): string {
  let key = randomString(1, 20);
  while (key.startsWith('aws:')) {
    key = randomString(1, 20);
  }
  return key;
}

function randomValidTagValue(): string {
  return randomString(0, 30);
}

function randomTagMap(maxCount = 10): Map<string, string> {
  const count = randomInt(0, maxCount);
  const map = new Map<string, string>();
  for (let i = 0; i < count; i++) {
    let key = randomValidTagKey();
    while (map.has(key)) {
      key = randomValidTagKey();
    }
    map.set(key, randomValidTagValue());
  }
  return map;
}

function tagsFromMap(map: Map<string, string>): Array<{ key: string; value: string }> {
  return [...map.entries()].map(([key, value]) => ({ key, value }));
}

function awsTagsFromMap(map: Map<string, string>): Array<{ Key: string; Value: string }> {
  return [...map.entries()].map(([Key, Value]) => ({ Key, Value }));
}

// --- Common setup ---

const ACCOUNT_ID = '123456789012';
const ACCOUNT_NAME = 'Workload-A';

function singleAccountRequest(
  desiredTags: Array<{ key: string; value: string }>,
  dryRun = false,
): IManageAccountTagsModuleRequest {
  return {
    operation: 'manage-account-tags',
    partition: 'aws',
    region: 'us-east-1',
    globalRegion: 'us-east-1',
    invokingAccountId: ACCOUNT_ID,
    dryRun,
    configuration: {
      accounts: [{ accountId: ACCOUNT_ID, accountName: ACCOUNT_NAME, tags: desiredTags }],
    },
  };
}

function multiAccountRequest(accounts: IAccountTagsConfig[], dryRun = false): IManageAccountTagsModuleRequest {
  return {
    operation: 'manage-account-tags',
    partition: 'aws',
    region: 'us-east-1',
    globalRegion: 'us-east-1',
    invokingAccountId: ACCOUNT_ID,
    dryRun,
    configuration: { accounts },
  };
}

describe('manageAccountTags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockReset();
  });

  // Feature: lza-account-tags, Property 4: Additive-only tag reconciliation
  describe('Property 4: Additive-only tag reconciliation', () => {
    /**
     * **Validates: Requirements 3.1, 3.2, 3.3, 3.5**
     * Tags are created or updated but never removed. External tags are preserved.
     */
    test('should only create/update tags and never remove across 100 random iterations', async () => {
      for (let i = 0; i < 100; i++) {
        mockSend.mockReset();

        const desiredMap = randomTagMap();
        const currentMap = randomTagMap();
        const desiredTags = tagsFromMap(desiredMap);
        const currentAwsTags = awsTagsFromMap(currentMap);

        // Ensure total won't exceed 50 so we don't hit the limit error
        const newKeys = desiredTags.filter(t => !currentMap.has(t.key)).length;
        if (currentMap.size + newKeys > 50) continue;

        mockSend.mockImplementation(command => {
          if (command instanceof ListTagsForResourceCommand) {
            return Promise.resolve({ Tags: currentAwsTags });
          }
          if (command instanceof TagResourceCommand) {
            return Promise.resolve({});
          }
          return Promise.reject(new Error('Unknown command'));
        });

        await manageAccountTags(singleAccountRequest(desiredTags));

        const expectedApply = desiredTags.filter(t => currentMap.get(t.key) !== t.value);

        const tagCalls = mockSend.mock.calls.filter(([cmd]) => cmd instanceof TagResourceCommand);
        const untagCalls = mockSend.mock.calls.filter(([cmd]) => cmd instanceof UntagResourceCommand);

        // UntagResource must never be called
        expect(untagCalls.length).toBe(0);

        if (expectedApply.length === 0) {
          expect(tagCalls.length).toBe(0);
          expect(mockSend).toHaveBeenCalledTimes(1);
        } else {
          expect(tagCalls.length).toBe(1);
        }
      }
    });
  });

  // Feature: lza-account-tags, Property 5: Dry-run mode describes changes without API calls
  describe('Property 5: Dry-run mode describes changes without API calls', () => {
    /**
     * **Validates: Requirements 3.6**
     */
    test('should not make TagResource calls in dry-run across 100 iterations', async () => {
      for (let i = 0; i < 100; i++) {
        mockSend.mockReset();

        const desiredMap = randomTagMap();
        const currentMap = randomTagMap();
        const desiredTags = tagsFromMap(desiredMap);
        const currentAwsTags = awsTagsFromMap(currentMap);

        mockSend.mockImplementation(command => {
          if (command instanceof ListTagsForResourceCommand) {
            return Promise.resolve({ Tags: currentAwsTags });
          }
          return Promise.reject(new Error('Should not be called in dry-run'));
        });

        const result = await manageAccountTags(singleAccountRequest(desiredTags, true));

        expect(mockSend).toHaveBeenCalledTimes(1);
        expect(result.dryRun).toBe(true);
        expect(result.summary.length).toBeGreaterThan(0);
      }
    });
  });

  describe('single account', () => {
    test('empty accounts list returns success with no API calls', async () => {
      const result = await manageAccountTags(multiAccountRequest([]));

      expect(result.status).toBe(MODULE_STATE_CODE.SUCCESS);
      expect(result.summary).toContain('No accounts supplied');
      expect(result.response?.perAccountResults).toHaveLength(0);
      expect(mockSend).not.toHaveBeenCalled();
    });

    test('no diff → no TagResource call and success response', async () => {
      const tags = [{ key: 'Env', value: 'Prod' }];
      mockSend.mockImplementation(command => {
        if (command instanceof ListTagsForResourceCommand) {
          return Promise.resolve({ Tags: [{ Key: 'Env', Value: 'Prod' }] });
        }
        return Promise.reject(new Error('Should not be called'));
      });

      const result = await manageAccountTags(singleAccountRequest(tags));

      expect(result.status).toBe(MODULE_STATE_CODE.SUCCESS);
      expect(result.response?.perAccountResults[0].status).toBe('no-change');
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('new tags are applied and external tags are preserved', async () => {
      const desired = [
        { key: 'Keep', value: 'Same' },
        { key: 'Update', value: 'V2' },
        { key: 'Add', value: 'Me' },
      ];
      mockSend.mockImplementation(command => {
        if (command instanceof ListTagsForResourceCommand) {
          return Promise.resolve({
            Tags: [
              { Key: 'Keep', Value: 'Same' },
              { Key: 'Update', Value: 'V1' },
              { Key: 'External', Value: 'Preserved' },
            ],
          });
        }
        if (command instanceof TagResourceCommand) {
          return Promise.resolve({});
        }
        return Promise.reject(new Error('Unknown command'));
      });

      const result = await manageAccountTags(singleAccountRequest(desired));

      expect(result.status).toBe(MODULE_STATE_CODE.SUCCESS);
      expect(result.response?.perAccountResults[0].status).toBe('applied');
      expect(result.response?.perAccountResults[0].appliedCount).toBe(2);
      const untagCalls = mockSend.mock.calls.filter(([cmd]) => cmd instanceof UntagResourceCommand);
      expect(untagCalls.length).toBe(0);
    });

    test('applying tags beyond the 50-tag limit surfaces a structured failure', async () => {
      const existingTags = Array.from({ length: 48 }, (_, i) => ({
        Key: `existing-${i}`,
        Value: `val-${i}`,
      }));
      const desired = [
        { key: 'new-1', value: 'a' },
        { key: 'new-2', value: 'b' },
        { key: 'new-3', value: 'c' },
      ];

      mockSend.mockImplementation(command => {
        if (command instanceof ListTagsForResourceCommand) {
          return Promise.resolve({ Tags: existingTags });
        }
        return Promise.reject(new Error('Should not be called'));
      });

      const result = await manageAccountTags(singleAccountRequest(desired));

      expect(result.status).toBe(MODULE_STATE_CODE.FAILED);
      expect(result.error?.name).toBe('TagLimitExceeded');
      expect(result.response?.perAccountResults[0].status).toBe('failed');
    });

    test('updating existing keys does not count toward the 50-tag limit', async () => {
      const existingTags = Array.from({ length: 50 }, (_, i) => ({
        Key: `tag-${i}`,
        Value: `old-${i}`,
      }));
      const desired = [
        { key: 'tag-0', value: 'updated-0' },
        { key: 'tag-1', value: 'updated-1' },
      ];

      mockSend.mockImplementation(command => {
        if (command instanceof ListTagsForResourceCommand) {
          return Promise.resolve({ Tags: existingTags });
        }
        if (command instanceof TagResourceCommand) {
          return Promise.resolve({});
        }
        return Promise.reject(new Error('Unknown command'));
      });

      const result = await manageAccountTags(singleAccountRequest(desired));

      expect(result.response?.perAccountResults[0].appliedCount).toBe(2);
    });

    test('SDK error surfaces as failed per-account result', async () => {
      const apiError = new Error('Organizations API failure');
      mockSend.mockImplementation(command => {
        if (command instanceof ListTagsForResourceCommand) {
          return Promise.resolve({ Tags: [] });
        }
        if (command instanceof TagResourceCommand) {
          return Promise.reject(apiError);
        }
        return Promise.reject(new Error('Unknown command'));
      });

      const result = await manageAccountTags(singleAccountRequest([{ key: 'Fail', value: 'Me' }]));

      expect(result.status).toBe(MODULE_STATE_CODE.FAILED);
      expect(result.error?.message).toContain('Organizations API failure');
      expect(result.response?.perAccountResults[0].status).toBe('failed');
    });

    test('dry-run surfaces dry-run status without making write calls', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListTagsForResourceCommand) {
          return Promise.resolve({ Tags: [{ Key: 'Old', Value: 'Tag' }] });
        }
        return Promise.reject(new Error('Should not be called in dry-run'));
      });

      const result = await manageAccountTags(singleAccountRequest([{ key: 'New', value: 'Tag' }], true));

      expect(result.dryRun).toBe(true);
      expect(result.response?.perAccountResults[0].status).toBe('dry-run');
      expect(result.response?.perAccountResults[0].appliedCount).toBe(1);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('multi-account orchestration', () => {
    test('aggregates per-account results when every account succeeds', async () => {
      const accounts: IAccountTagsConfig[] = [
        { accountId: '111111111111', accountName: 'A', tags: [{ key: 'x', value: '1' }] },
        { accountId: '222222222222', accountName: 'B', tags: [{ key: 'x', value: '2' }] },
        { accountId: '333333333333', accountName: 'C', tags: [{ key: 'x', value: '3' }] },
      ];
      mockSend.mockImplementation(command => {
        if (command instanceof ListTagsForResourceCommand) {
          return Promise.resolve({ Tags: [] });
        }
        if (command instanceof TagResourceCommand) {
          return Promise.resolve({});
        }
        return Promise.reject(new Error('Unknown command'));
      });

      const result = await manageAccountTags(multiAccountRequest(accounts));

      expect(result.status).toBe(MODULE_STATE_CODE.SUCCESS);
      expect(result.response?.perAccountResults).toHaveLength(3);
      expect(result.response?.perAccountResults.map(r => r.accountId)).toEqual([
        '111111111111',
        '222222222222',
        '333333333333',
      ]);
      expect(result.response?.perAccountResults.every(r => r.status === 'applied')).toBe(true);
    });

    test('per-account errors are isolated: one failure does not drop successful accounts', async () => {
      const accounts: IAccountTagsConfig[] = [
        { accountId: '111111111111', accountName: 'A', tags: [{ key: 'x', value: '1' }] },
        { accountId: '222222222222', accountName: 'B', tags: [{ key: 'x', value: '2' }] },
      ];

      mockSend.mockImplementation(command => {
        if (command instanceof ListTagsForResourceCommand) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const resourceId = (command as any).input?.ResourceId;
          if (resourceId === '222222222222') {
            return Promise.reject(new Error('Account B boom'));
          }
          return Promise.resolve({ Tags: [] });
        }
        if (command instanceof TagResourceCommand) {
          return Promise.resolve({});
        }
        return Promise.reject(new Error('Unknown command'));
      });

      // The mock instance doesn't actually set `input` on the command (since commands are vi.fn()),
      // so we differentiate by call order instead.
      mockSend.mockReset();
      let listCallIndex = 0;
      mockSend.mockImplementation(command => {
        if (command instanceof ListTagsForResourceCommand) {
          const idx = listCallIndex++;
          if (idx === 1) {
            return Promise.reject(new Error('Account B boom'));
          }
          return Promise.resolve({ Tags: [] });
        }
        if (command instanceof TagResourceCommand) {
          return Promise.resolve({});
        }
        return Promise.reject(new Error('Unknown command'));
      });

      const result = await manageAccountTags(multiAccountRequest(accounts));

      expect(result.status).toBe(MODULE_STATE_CODE.FAILED);
      expect(result.response?.perAccountResults).toHaveLength(2);
      const succeeded = result.response?.perAccountResults.filter(r => r.status === 'applied');
      const failed = result.response?.perAccountResults.filter(r => r.status === 'failed');
      expect(succeeded).toHaveLength(1);
      expect(failed).toHaveLength(1);
      expect(result.error?.message).toContain('Account B boom');
    });
  });
});
