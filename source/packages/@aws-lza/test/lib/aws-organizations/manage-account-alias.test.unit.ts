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
import {
  CreateAccountAliasCommand,
  DeleteAccountAliasCommand,
  ListAccountAliasesCommand,
  EntityAlreadyExistsException,
} from '@aws-sdk/client-iam';

const mockSend = vi.fn();

vi.mock('@aws-sdk/client-iam', () => {
  class MockEntityAlreadyExistsException extends Error {
    constructor(input: { message: string; $metadata: Record<string, unknown> }) {
      super(input.message);
      this.name = 'EntityAlreadyExistsException';
    }
  }
  return {
    IAMClient: class {
      send = mockSend;
    },
    CreateAccountAliasCommand: vi.fn(),
    DeleteAccountAliasCommand: vi.fn(),
    ListAccountAliasesCommand: vi.fn(),
    EntityAlreadyExistsException: MockEntityAlreadyExistsException,
  };
});

vi.mock('../../../lib/common/throttle', () => ({
  throttlingBackOff: vi.fn(fn => fn()),
}));

vi.mock('../../../lib/common/utility', async () => ({
  ...(await vi.importActual('../../../lib/common/utility')),
  setRetryStrategy: vi.fn(() => ({})),
}));

vi.mock('../../../lib/common/sts-functions', () => ({
  getCredentials: vi.fn(async () => ({
    accessKeyId: 'assumed-ak',
    secretAccessKey: 'assumed-sk',
    sessionToken: 'assumed-token',
    expiration: new Date(Date.now() + 3600_000),
  })),
}));

// Import after mocks
import { manageAccountAlias } from '../../../lib/aws-organizations/manage-account-alias';
import { IAccountAliasConfig, IManageAccountAliasModuleRequest } from '../../../lib/aws-organizations/interfaces';
import { MODULE_EXCEPTIONS, MODULE_STATE_CODE } from '../../../lib/common/types';
import { getCredentials } from '../../../lib/common/sts-functions';

const MGMT_ACCOUNT_ID = '111111111111';

function singleAccountRequest(
  alias: string,
  accountId: string = MGMT_ACCOUNT_ID,
  dryRun = false,
): IManageAccountAliasModuleRequest {
  return {
    operation: 'manage-account-alias',
    partition: 'aws',
    region: 'us-east-1',
    globalRegion: 'us-east-1',
    invokingAccountId: MGMT_ACCOUNT_ID,
    dryRun,
    configuration: {
      accounts: [{ accountId, accountName: accountId === MGMT_ACCOUNT_ID ? 'Management' : 'Workload', alias }],
      accountAccessRoleName: 'AWSControlTowerExecution',
      managementAccountId: MGMT_ACCOUNT_ID,
    },
  };
}

function multiAccountRequest(accounts: IAccountAliasConfig[], dryRun = false): IManageAccountAliasModuleRequest {
  return {
    operation: 'manage-account-alias',
    partition: 'aws',
    region: 'us-east-1',
    globalRegion: 'us-east-1',
    invokingAccountId: MGMT_ACCOUNT_ID,
    dryRun,
    configuration: {
      accounts,
      accountAccessRoleName: 'AWSControlTowerExecution',
      managementAccountId: MGMT_ACCOUNT_ID,
    },
  };
}

describe('manageAccountAlias', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockReset();
  });

  describe('single account', () => {
    test('empty accounts list returns success with no API calls', async () => {
      const result = await manageAccountAlias(multiAccountRequest([]));

      expect(result.status).toBe(MODULE_STATE_CODE.SUCCESS);
      expect(result.summary).toContain('No accounts supplied');
      expect(result.response?.perAccountResults).toHaveLength(0);
      expect(mockSend).not.toHaveBeenCalled();
    });

    test('successfully sets new alias when no current alias exists', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListAccountAliasesCommand) {
          return Promise.resolve({ AccountAliases: [] });
        }
        if (command instanceof CreateAccountAliasCommand) {
          return Promise.resolve({});
        }
        return Promise.reject(new Error('Unknown command'));
      });

      const result = await manageAccountAlias(singleAccountRequest('test-alias'));

      expect(result.status).toBe(MODULE_STATE_CODE.SUCCESS);
      expect(result.response?.perAccountResults[0].status).toBe('created');
      expect(result.response?.perAccountResults[0].currentAlias).toBe('test-alias');
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    test('returns no-change when desired alias already set', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListAccountAliasesCommand) {
          return Promise.resolve({ AccountAliases: ['test-alias'] });
        }
        return Promise.reject(new Error('Unknown command'));
      });

      const result = await manageAccountAlias(singleAccountRequest('test-alias'));

      expect(result.status).toBe(MODULE_STATE_CODE.SUCCESS);
      expect(result.response?.perAccountResults[0].status).toBe('no-change');
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('replaces existing alias with new one', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListAccountAliasesCommand) {
          return Promise.resolve({ AccountAliases: ['old-alias'] });
        }
        if (command instanceof DeleteAccountAliasCommand) {
          return Promise.resolve({});
        }
        if (command instanceof CreateAccountAliasCommand) {
          return Promise.resolve({});
        }
        return Promise.reject(new Error('Unknown command'));
      });

      const result = await manageAccountAlias(singleAccountRequest('test-alias'));

      expect(result.status).toBe(MODULE_STATE_CODE.SUCCESS);
      expect(result.response?.perAccountResults[0].status).toBe('replaced');
      expect(result.response?.perAccountResults[0].previousAlias).toBe('old-alias');
      expect(result.response?.perAccountResults[0].currentAlias).toBe('test-alias');
      expect(mockSend).toHaveBeenCalledTimes(3);
    });

    test('rolls back after alias conflict', async () => {
      let createCount = 0;
      mockSend.mockImplementation(command => {
        if (command instanceof ListAccountAliasesCommand) {
          return Promise.resolve({ AccountAliases: ['old-alias'] });
        }
        if (command instanceof DeleteAccountAliasCommand) {
          return Promise.resolve({});
        }
        if (command instanceof CreateAccountAliasCommand) {
          createCount++;
          if (createCount === 1) {
            return Promise.reject(new EntityAlreadyExistsException({ message: 'Alias exists', $metadata: {} }));
          }
          return Promise.resolve({});
        }
        return Promise.reject(new Error('Unknown command'));
      });

      const result = await manageAccountAlias(singleAccountRequest('test-alias'));

      expect(result.status).toBe(MODULE_STATE_CODE.SUCCESS);
      expect(result.response?.perAccountResults[0].status).toBe('conflict');
      expect(mockSend).toHaveBeenCalledTimes(4);
    });

    test('handles rollback failure gracefully (alias left cleared)', async () => {
      let createCount = 0;
      mockSend.mockImplementation(command => {
        if (command instanceof ListAccountAliasesCommand) {
          return Promise.resolve({ AccountAliases: ['old-alias'] });
        }
        if (command instanceof DeleteAccountAliasCommand) {
          return Promise.resolve({});
        }
        if (command instanceof CreateAccountAliasCommand) {
          createCount++;
          if (createCount === 1) {
            return Promise.reject(new EntityAlreadyExistsException({ message: 'Alias exists', $metadata: {} }));
          }
          return Promise.reject(new Error('Rollback failed'));
        }
        return Promise.reject(new Error('Unknown command'));
      });

      const result = await manageAccountAlias(singleAccountRequest('test-alias'));

      expect(result.response?.perAccountResults[0].status).toBe('conflict');
      expect(result.response?.perAccountResults[0].message).toContain('Failed to revert to previous alias');
    });

    test('conflict with no previous alias does not attempt rollback', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListAccountAliasesCommand) {
          return Promise.resolve({ AccountAliases: [] });
        }
        if (command instanceof CreateAccountAliasCommand) {
          return Promise.reject(new EntityAlreadyExistsException({ message: 'Alias exists', $metadata: {} }));
        }
        return Promise.reject(new Error('Unknown command'));
      });

      const result = await manageAccountAlias(singleAccountRequest('test-alias'));

      expect(result.response?.perAccountResults[0].status).toBe('conflict');
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    test('non-EntityAlreadyExistsException during create surfaces as failed', async () => {
      const genericError = new Error('Generic AWS error');
      mockSend.mockImplementation(command => {
        if (command instanceof ListAccountAliasesCommand) {
          return Promise.resolve({ AccountAliases: [] });
        }
        if (command instanceof CreateAccountAliasCommand) {
          return Promise.reject(genericError);
        }
        return Promise.reject(new Error('Unknown command'));
      });

      const result = await manageAccountAlias(singleAccountRequest('test-alias'));

      expect(result.status).toBe(MODULE_STATE_CODE.FAILED);
      expect(result.response?.perAccountResults[0].status).toBe('failed');
    });

    test('delete failure surfaces as failed without attempting create', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListAccountAliasesCommand) {
          return Promise.resolve({ AccountAliases: ['old-alias'] });
        }
        if (command instanceof DeleteAccountAliasCommand) {
          return Promise.reject(new Error('Delete failed'));
        }
        return Promise.reject(new Error('Unknown command'));
      });

      const result = await manageAccountAlias(singleAccountRequest('test-alias'));

      expect(result.status).toBe(MODULE_STATE_CODE.FAILED);
      expect(result.response?.perAccountResults[0].status).toBe('failed');
      expect(result.error?.message).toContain('Delete failed');
    });
  });

  describe('validateAlias', () => {
    test('accepts valid alias formats', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListAccountAliasesCommand) {
          return Promise.resolve({ AccountAliases: [] });
        }
        if (command instanceof CreateAccountAliasCommand) {
          return Promise.resolve({});
        }
        return Promise.reject(new Error('Unknown command'));
      });

      const validAliases = ['abc', 'test-alias', 'my-company-123', 'a1b2c3', 'x'.repeat(63)];

      for (const alias of validAliases) {
        const result = await manageAccountAlias(singleAccountRequest(alias));
        expect(result.status).toBe(MODULE_STATE_CODE.SUCCESS);
      }
    });

    test('rejects invalid alias formats with validation-error status', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListAccountAliasesCommand) {
          return Promise.resolve({ AccountAliases: [] });
        }
        return Promise.reject(new Error('Unknown command'));
      });

      const invalidAliases = [
        'AB', // uppercase
        'a', // too short
        'x'.repeat(64), // too long
        '-abc', // starts with hyphen
        'abc-', // ends with hyphen
        'ab--c', // consecutive hyphens
        'ab_c', // underscore not allowed
        '', // empty
      ];

      for (const alias of invalidAliases) {
        const result = await manageAccountAlias(singleAccountRequest(alias));
        expect(result.response?.perAccountResults[0].status).toBe('validation-error');
        expect(result.response?.perAccountResults[0].message).toMatch(
          new RegExp(`${MODULE_EXCEPTIONS.INVALID_INPUT}.*Invalid alias format`),
        );
      }
    });
  });

  describe('dry-run', () => {
    test('no-change when alias already set', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListAccountAliasesCommand) {
          return Promise.resolve({ AccountAliases: ['test-alias'] });
        }
        return Promise.reject(new Error('Unknown command'));
      });

      const result = await manageAccountAlias(singleAccountRequest('test-alias', MGMT_ACCOUNT_ID, true));

      expect(result.dryRun).toBe(true);
      expect(result.response?.perAccountResults[0].status).toBe('dry-run');
      expect(CreateAccountAliasCommand).toHaveBeenCalledTimes(0);
      expect(DeleteAccountAliasCommand).toHaveBeenCalledTimes(0);
    });

    test('describes replacement when existing alias differs', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListAccountAliasesCommand) {
          return Promise.resolve({ AccountAliases: ['old-alias'] });
        }
        return Promise.reject(new Error('Unknown command'));
      });

      const result = await manageAccountAlias(singleAccountRequest('test-alias', MGMT_ACCOUNT_ID, true));

      expect(result.response?.perAccountResults[0].status).toBe('dry-run');
      expect(result.response?.perAccountResults[0].message).toContain(
        'Will delete existing account alias "old-alias" and set new alias "test-alias"',
      );
    });

    test('describes validation error without attempting writes', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListAccountAliasesCommand) {
          return Promise.resolve({ AccountAliases: [] });
        }
        return Promise.reject(new Error('Unknown command'));
      });

      const result = await manageAccountAlias(singleAccountRequest('INVALID', MGMT_ACCOUNT_ID, true));

      expect(result.response?.perAccountResults[0].status).toBe('dry-run');
      expect(result.response?.perAccountResults[0].message).toContain(
        `Will experience ${MODULE_EXCEPTIONS.INVALID_INPUT}: Invalid alias format "INVALID"`,
      );
    });
  });

  describe('cross-account role assumption', () => {
    test('skips STS assume for management account', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListAccountAliasesCommand) {
          return Promise.resolve({ AccountAliases: [] });
        }
        if (command instanceof CreateAccountAliasCommand) {
          return Promise.resolve({});
        }
        return Promise.reject(new Error('Unknown command'));
      });

      await manageAccountAlias(singleAccountRequest('mgmt-alias', MGMT_ACCOUNT_ID));

      expect(getCredentials).not.toHaveBeenCalled();
    });

    test('assumes role once per non-management account', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListAccountAliasesCommand) {
          return Promise.resolve({ AccountAliases: [] });
        }
        if (command instanceof CreateAccountAliasCommand) {
          return Promise.resolve({});
        }
        return Promise.reject(new Error('Unknown command'));
      });

      const accounts: IAccountAliasConfig[] = [
        { accountId: '222222222222', accountName: 'Workload-1', alias: 'workload-1' },
        { accountId: '333333333333', accountName: 'Workload-2', alias: 'workload-2' },
      ];

      await manageAccountAlias(multiAccountRequest(accounts));

      expect(getCredentials).toHaveBeenCalledTimes(2);
      expect(getCredentials).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: '222222222222',
          assumeRoleName: 'AWSControlTowerExecution',
        }),
      );
      expect(getCredentials).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: '333333333333',
          assumeRoleName: 'AWSControlTowerExecution',
        }),
      );
    });
  });

  describe('multi-account orchestration', () => {
    test('aggregates per-account results across a mix of accounts', async () => {
      let listCallIndex = 0;
      mockSend.mockImplementation(command => {
        if (command instanceof ListAccountAliasesCommand) {
          const idx = listCallIndex++;
          if (idx === 0) return Promise.resolve({ AccountAliases: [] }); // management
          if (idx === 1) return Promise.resolve({ AccountAliases: ['workload-1'] }); // already set
          return Promise.reject(new Error('Unknown list index'));
        }
        if (command instanceof CreateAccountAliasCommand) {
          return Promise.resolve({});
        }
        return Promise.reject(new Error('Unknown command'));
      });

      const accounts: IAccountAliasConfig[] = [
        { accountId: MGMT_ACCOUNT_ID, accountName: 'Management', alias: 'mgmt-alias' },
        { accountId: '222222222222', accountName: 'Workload-1', alias: 'workload-1' },
      ];

      const result = await manageAccountAlias(multiAccountRequest(accounts));

      expect(result.status).toBe(MODULE_STATE_CODE.SUCCESS);
      expect(result.response?.perAccountResults).toHaveLength(2);
      expect(result.response?.perAccountResults[0].status).toBe('created');
      expect(result.response?.perAccountResults[1].status).toBe('no-change');
    });

    test('isolates a credential-resolution failure so other accounts still report results', async () => {
      // One account's AssumeRole rejects; the module must return a FAILED
      // response while preserving the succeeding account's result rather than
      // crashing the whole run.
      vi.mocked(getCredentials).mockImplementation(async input => {
        if (input.accountId === '222222222222') {
          throw new Error('AssumeRole denied');
        }
        return {
          accessKeyId: 'assumed-ak',
          secretAccessKey: 'assumed-sk',
          sessionToken: 'assumed-token',
          expiration: new Date(Date.now() + 3600_000),
        };
      });

      mockSend.mockImplementation(command => {
        if (command instanceof ListAccountAliasesCommand) {
          return Promise.resolve({ AccountAliases: [] });
        }
        if (command instanceof CreateAccountAliasCommand) {
          return Promise.resolve({});
        }
        return Promise.reject(new Error('Unknown command'));
      });

      const accounts: IAccountAliasConfig[] = [
        { accountId: '222222222222', accountName: 'Workload-1', alias: 'workload-1' },
        { accountId: '333333333333', accountName: 'Workload-2', alias: 'workload-2' },
      ];

      const result = await manageAccountAlias(multiAccountRequest(accounts));

      expect(result.status).toBe(MODULE_STATE_CODE.FAILED);
      expect(result.response?.perAccountResults).toHaveLength(2);

      const failed = result.response?.perAccountResults.find(r => r.accountId === '222222222222');
      const succeeded = result.response?.perAccountResults.find(r => r.accountId === '333333333333');

      expect(failed?.status).toBe('failed');
      expect(failed?.error?.message).toContain('AssumeRole denied');
      expect(succeeded?.status).toBe('created');
      expect(succeeded?.currentAlias).toBe('workload-2');
    });
  });
});
