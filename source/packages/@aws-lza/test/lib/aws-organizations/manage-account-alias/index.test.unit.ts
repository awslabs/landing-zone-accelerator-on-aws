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

import { describe, beforeEach, expect, test } from '@jest/globals';
import {
  IAMClient,
  CreateAccountAliasCommand,
  DeleteAccountAliasCommand,
  ListAccountAliasesCommand,
  EntityAlreadyExistsException,
} from '@aws-sdk/client-iam';
import { ManageAccountAlias } from '../../../../lib/aws-organizations/manage-account-alias';
import { IManageAccountAliasHandlerParameter } from '../../../../interfaces/aws-organizations/manage-account-alias';
import { MODULE_EXCEPTIONS } from '../../../../common/enums';

jest.mock('@aws-sdk/client-iam', () => {
  return {
    IAMClient: jest.fn(),
    CreateAccountAliasCommand: jest.fn(),
    DeleteAccountAliasCommand: jest.fn(),
    ListAccountAliasesCommand: jest.fn(),
    EntityAlreadyExistsException: jest.fn(),
  };
});

jest.mock('../../../../common/throttle', () => ({
  throttlingBackOff: jest.fn(fn => fn()),
}));

jest.mock('../../../../common/functions', () => {
  return {
    ...jest.requireActual('../../../../common/functions'),
    setRetryStrategy: jest.fn(() => ({})),
  };
});

describe('ManageAccountAlias', () => {
  const mockSend = jest.fn();

  const mockParams: IManageAccountAliasHandlerParameter = {
    operation: 'manage-account-alias',
    partition: 'aws',
    region: 'us-east-1',
    configuration: {
      alias: 'test-alias',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    (IAMClient as jest.Mock).mockImplementation(() => ({
      send: mockSend,
    }));
  });

  describe('handler', () => {
    test('should successfully set new alias when no current alias exists', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListAccountAliasesCommand) {
          return Promise.resolve({ AccountAliases: [] });
        }
        if (command instanceof CreateAccountAliasCommand) {
          return Promise.resolve({});
        }
        return Promise.reject(new Error('Unknown command'));
      });

      const result = await new ManageAccountAlias().handler(mockParams);

      expect(result).toBe('Account alias "test-alias" successfully set.');
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    test('should return early when desired alias is already set', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListAccountAliasesCommand) {
          return Promise.resolve({ AccountAliases: ['test-alias'] });
        }
        return Promise.reject(new Error('Unknown command'));
      });

      const result = await new ManageAccountAlias().handler(mockParams);

      expect(result).toBe('Account alias "test-alias" is already set for this account');
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('should delete existing alias and create new one', async () => {
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

      const result = await new ManageAccountAlias().handler(mockParams);

      expect(result).toBe(
        'Successfully deleted existing account alias "old-alias"\nAccount alias "test-alias" successfully set.',
      );
      expect(mockSend).toHaveBeenCalledTimes(3);
    });

    test('should handle alias conflict and rollback successfully', async () => {
      let callCount = 0;
      mockSend.mockImplementation(command => {
        if (command instanceof ListAccountAliasesCommand) {
          return Promise.resolve({ AccountAliases: ['old-alias'] });
        }
        if (command instanceof DeleteAccountAliasCommand) {
          return Promise.resolve({});
        }
        if (command instanceof CreateAccountAliasCommand) {
          callCount++;
          if (callCount === 1) {
            return Promise.reject(new EntityAlreadyExistsException({ message: 'Alias exists', $metadata: {} }));
          }
          return Promise.resolve({});
        }
        return Promise.reject(new Error('Unknown command'));
      });

      const result = await new ManageAccountAlias().handler(mockParams);

      expect(result).toBe(
        'Successfully deleted existing account alias "old-alias"\nAlias "test-alias" is already taken by another AWS account. Aliases must be unique across all AWS accounts globally.\nReverted to previous account alias "old-alias"',
      );
      expect(mockSend).toHaveBeenCalledTimes(4);
    });

    test('should handle rollback failure gracefully', async () => {
      let callCount = 0;
      mockSend.mockImplementation(command => {
        if (command instanceof ListAccountAliasesCommand) {
          return Promise.resolve({ AccountAliases: ['old-alias'] });
        }
        if (command instanceof DeleteAccountAliasCommand) {
          return Promise.resolve({});
        }
        if (command instanceof CreateAccountAliasCommand) {
          callCount++;
          if (callCount === 1) {
            return Promise.reject(new EntityAlreadyExistsException({ message: 'Alias exists', $metadata: {} }));
          }
          return Promise.reject(new Error('Rollback failed'));
        }
        return Promise.reject(new Error('Unknown command'));
      });

      const result = await new ManageAccountAlias().handler(mockParams);

      expect(result).toBe(
        'Successfully deleted existing account alias "old-alias"\nAlias "test-alias" is already taken by another AWS account. Aliases must be unique across all AWS accounts globally.\nFailed to revert to previous alias "old-alias". Account left without alias.',
      );
    });

    test('should handle alias conflict with no previous alias to rollback', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListAccountAliasesCommand) {
          return Promise.resolve({ AccountAliases: [] });
        }
        if (command instanceof CreateAccountAliasCommand) {
          return Promise.reject(new EntityAlreadyExistsException({ message: 'Alias exists', $metadata: {} }));
        }
        return Promise.reject(new Error('Unknown command'));
      });

      const result = await new ManageAccountAlias().handler(mockParams);

      expect(result).toBe(
        'Alias "test-alias" is already taken by another AWS account. Aliases must be unique across all AWS accounts globally.',
      );
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    test('should throw error for non-EntityAlreadyExistsException during create', async () => {
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

      await expect(new ManageAccountAlias().handler(mockParams)).rejects.toThrow(genericError);
    });

    test('should throw error when delete fails', async () => {
      const deleteError = new Error('Delete failed');
      mockSend.mockImplementation(command => {
        if (command instanceof ListAccountAliasesCommand) {
          return Promise.resolve({ AccountAliases: ['old-alias'] });
        }
        if (command instanceof DeleteAccountAliasCommand) {
          return Promise.reject(deleteError);
        }
        return Promise.reject(new Error('Unknown command'));
      });

      await expect(new ManageAccountAlias().handler(mockParams)).rejects.toThrow(deleteError);
    });
  });

  describe('validateAlias', () => {
    test('should accept valid alias formats', async () => {
      const validAliases = ['abc', 'test-alias', 'my-company-123', 'a1b2c3', 'x'.repeat(63)];

      mockSend.mockImplementation(command => {
        if (command instanceof ListAccountAliasesCommand) {
          return Promise.resolve({ AccountAliases: [] });
        }
        if (command instanceof CreateAccountAliasCommand) {
          return Promise.resolve({});
        }
        return Promise.reject(new Error('Unknown command'));
      });

      for (const alias of validAliases) {
        const result = await new ManageAccountAlias().handler({
          ...mockParams,
          configuration: { alias },
        });
        expect(result).toBe(`Account alias "${alias}" successfully set.`);
      }
    });

    test('should reject invalid alias formats', async () => {
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
        const result = await new ManageAccountAlias().handler({
          ...mockParams,
          configuration: { alias },
        });
        expect(result).toMatch(new RegExp(`${MODULE_EXCEPTIONS.INVALID_INPUT}.*Invalid alias format`));
      }
    });
  });

  describe('Dry Run Mode Operations', () => {
    const dryRunParams = {
      ...mockParams,
      dryRun: true,
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('should be successful when alias already set', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListAccountAliasesCommand) {
          return Promise.resolve({ AccountAliases: ['test-alias'] });
        }
        return Promise.reject(new Error('Unknown command'));
      });

      const result = await new ManageAccountAlias().handler(dryRunParams);

      expect(result).toMatch('Account alias "test-alias" is already set for this account');
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(ListAccountAliasesCommand).toHaveBeenCalledTimes(1);
      expect(CreateAccountAliasCommand).toHaveBeenCalledTimes(0);
      expect(DeleteAccountAliasCommand).toHaveBeenCalledTimes(0);
    });

    test('should be successful when no existing alias', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListAccountAliasesCommand) {
          return Promise.resolve({ AccountAliases: [] });
        }
        return Promise.reject(new Error('Unknown command'));
      });

      const result = await new ManageAccountAlias().handler(dryRunParams);

      expect(result).toMatch('Will set account alias "test-alias" (no existing alias)');
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(ListAccountAliasesCommand).toHaveBeenCalledTimes(1);
      expect(CreateAccountAliasCommand).toHaveBeenCalledTimes(0);
      expect(DeleteAccountAliasCommand).toHaveBeenCalledTimes(0);
    });

    test('should be successful when replacing existing alias', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListAccountAliasesCommand) {
          return Promise.resolve({ AccountAliases: ['old-alias'] });
        }
        return Promise.reject(new Error('Unknown command'));
      });

      const result = await new ManageAccountAlias().handler(dryRunParams);

      expect(result).toMatch('Will delete existing account alias "old-alias" and set new alias "test-alias"');
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(ListAccountAliasesCommand).toHaveBeenCalledTimes(1);
      expect(CreateAccountAliasCommand).toHaveBeenCalledTimes(0);
      expect(DeleteAccountAliasCommand).toHaveBeenCalledTimes(0);
    });

    test('should show validation error for invalid alias format', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListAccountAliasesCommand) {
          return Promise.resolve({ AccountAliases: [] });
        }
        return Promise.reject(new Error('Unknown command'));
      });

      const result = await new ManageAccountAlias().handler({
        ...dryRunParams,
        configuration: { alias: 'INVALID' },
      });

      expect(result).toMatch(
        `Will experience ${MODULE_EXCEPTIONS.INVALID_INPUT}: Invalid alias format "INVALID" - must be 3-63 chars, lowercase alphanumeric with hyphens, no consecutive hyphens`,
      );
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(ListAccountAliasesCommand).toHaveBeenCalledTimes(1);
      expect(CreateAccountAliasCommand).toHaveBeenCalledTimes(0);
      expect(DeleteAccountAliasCommand).toHaveBeenCalledTimes(0);
    });
  });
});
