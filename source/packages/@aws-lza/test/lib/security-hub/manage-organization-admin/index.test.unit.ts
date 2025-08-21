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
  DisableOrganizationAdminAccountCommand,
  EnableOrganizationAdminAccountCommand,
  EnableSecurityHubCommand,
  paginateListOrganizationAdminAccounts,
  ResourceConflictException,
  SecurityHubClient,
} from '@aws-sdk/client-securityhub';
import { SecurityHubManageOrganizationAdminModule } from '../../../../lib/security-hub/manage-organization-admin';
import { MODULE_EXCEPTIONS } from '../../../../common/enums';
import { AcceleratorModuleName } from '../../../../common/resources';
import { ISecurityHubManageOrganizationAdminParameter } from '../../../../interfaces/security-hub/manage-organization-admin';

jest.mock('@aws-sdk/client-securityhub', () => {
  return {
    ...jest.requireActual('@aws-sdk/client-securityhub'),
    SecurityHubClient: jest.fn(),
    DisableOrganizationAdminAccountCommand: jest.fn(),
    EnableOrganizationAdminAccountCommand: jest.fn(),
    EnableSecurityHubCommand: jest.fn(),
    paginateListOrganizationAdminAccounts: jest.fn(),
  };
});

jest.mock('../../../../common/functions', () => {
  return {
    ...jest.requireActual('../../../../common/functions'),
    delay: jest.fn().mockResolvedValue(undefined),
  };
});

jest.mock('../../../../common/throttle', () => {
  return {
    throttlingBackOff: jest.fn().mockImplementation(fn => fn()),
  };
});

describe('SecurityHubManageOrganizationAdminModule', () => {
  const mockSend = jest.fn();
  let module: SecurityHubManageOrganizationAdminModule;

  const baseParams: ISecurityHubManageOrganizationAdminParameter = {
    partition: 'aws',
    region: 'us-east-1',
    configuration: {
      enable: true,
      accountId: '123456789012',
    },
    operation: 'test-manage-organization-admin',
    solutionId: 'test-solution',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    module = new SecurityHubManageOrganizationAdminModule();
    (SecurityHubClient as jest.Mock).mockImplementation(() => ({
      send: mockSend,
    }));
  });

  describe('handler', () => {
    test('should return dry-run response when dryRun is true', async () => {
      const params = { ...baseParams, dryRun: true };
      (paginateListOrganizationAdminAccounts as jest.Mock).mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield { AdminAccounts: [] };
        },
      });

      const result = await module.handler(params);

      expect(result).toContain('[DRY-RUN]');
      expect(result).toContain(AcceleratorModuleName.AWS_SECURITY_HUB);
    });

    test('should enable organization admin when no current admin exists', async () => {
      (paginateListOrganizationAdminAccounts as jest.Mock).mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield { AdminAccounts: [] };
        },
      });
      mockSend.mockResolvedValue({});

      const result = await module.handler(baseParams);

      expect(mockSend).toHaveBeenCalledWith(expect.any(EnableSecurityHubCommand));
      expect(mockSend).toHaveBeenCalledWith(expect.any(EnableOrganizationAdminAccountCommand));
      expect(result).toContain('Successfully set Security Hub Organization Admin');
    });

    test('should return message when account is already admin', async () => {
      (paginateListOrganizationAdminAccounts as jest.Mock).mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield { AdminAccounts: [{ AccountId: '123456789012', Status: 'ENABLED' }] };
        },
      });

      const result = await module.handler(baseParams);

      expect(result).toContain('is already the Security Hub Organization Admin');
      expect(mockSend).not.toHaveBeenCalled();
    });

    test('should disable organization admin when enable is false', async () => {
      const params = { ...baseParams, configuration: { enable: false, accountId: '123456789012' } };
      (paginateListOrganizationAdminAccounts as jest.Mock).mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield { AdminAccounts: [{ AccountId: '123456789012', Status: 'ENABLED' }] };
        },
      });
      mockSend.mockResolvedValue({});

      const result = await module.handler(params);

      expect(mockSend).toHaveBeenCalledWith(expect.any(DisableOrganizationAdminAccountCommand));
      expect(result).toContain('Successfully disabled Security Hub organization admin account');
    });

    test('should throw error when trying to enable different admin', async () => {
      (paginateListOrganizationAdminAccounts as jest.Mock).mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield { AdminAccounts: [{ AccountId: '999999999999', Status: 'ENABLED' }] };
        },
      });

      await expect(module.handler(baseParams)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.INVALID_INPUT}: Security Hub delegated admin is already set to 999999999999`,
      );
    });

    test('should throw error when trying to disable wrong admin', async () => {
      const params = { ...baseParams, configuration: { enable: false, accountId: '123456789012' } };
      (paginateListOrganizationAdminAccounts as jest.Mock).mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield { AdminAccounts: [{ AccountId: '999999999999', Status: 'ENABLED' }] };
        },
      });

      await expect(module.handler(params)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.INVALID_INPUT}: Could not remove Account with ID 123456789012`,
      );
    });
  });

  describe('getOrganizationAdmin', () => {
    test('should return undefined when no admin accounts exist', async () => {
      (paginateListOrganizationAdminAccounts as jest.Mock).mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield { AdminAccounts: [] };
        },
      });

      const result = await module['getOrganizationAdmin'](new SecurityHubClient({}));

      expect(result).toBeUndefined();
    });

    test('should return account ID when single admin exists', async () => {
      (paginateListOrganizationAdminAccounts as jest.Mock).mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield { AdminAccounts: [{ AccountId: '123456789012', Status: 'ENABLED' }] };
        },
      });

      const result = await module['getOrganizationAdmin'](new SecurityHubClient({}));

      expect(result).toBe('123456789012');
    });

    test('should throw error when multiple admin accounts exist', async () => {
      (paginateListOrganizationAdminAccounts as jest.Mock).mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield {
            AdminAccounts: [
              { AccountId: '123456789012', Status: 'ENABLED' },
              { AccountId: '999999999999', Status: 'ENABLED' },
            ],
          };
        },
      });

      await expect(module['getOrganizationAdmin'](new SecurityHubClient({}))).rejects.toThrow(
        'Multiple admin accounts for Security Hub in organization',
      );
    });

    test('should throw error when admin is in DISABLE_IN_PROGRESS status', async () => {
      (paginateListOrganizationAdminAccounts as jest.Mock).mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield { AdminAccounts: [{ AccountId: '123456789012', Status: 'DISABLE_IN_PROGRESS' }] };
        },
      });

      await expect(module['getOrganizationAdmin'](new SecurityHubClient({}))).rejects.toThrow(
        'Admin account 123456789012 is in DISABLE_IN_PROGRESS',
      );
    });
  });

  describe('enableSecurityHub', () => {
    test('should enable Security Hub successfully', async () => {
      mockSend.mockResolvedValue({});

      await module['enableSecurityHub'](new SecurityHubClient({}));

      expect(mockSend).toHaveBeenCalledWith(expect.any(EnableSecurityHubCommand));
    });

    test('should handle ResourceConflictException gracefully', async () => {
      const error = new ResourceConflictException({ message: 'Already enabled', $metadata: {} });
      mockSend.mockRejectedValue(error);

      await expect(module['enableSecurityHub'](new SecurityHubClient({}))).resolves.not.toThrow();
    });

    test('should throw error for other exceptions', async () => {
      const error = new Error('Unknown error');
      mockSend.mockRejectedValue(error);

      await expect(module['enableSecurityHub'](new SecurityHubClient({}))).rejects.toThrow(
        'Security Hub enable issue error message',
      );
    });
  });

  describe('enableOrganizationAdminAccount', () => {
    test('should enable organization admin account with retries', async () => {
      mockSend
        .mockResolvedValueOnce({}) // EnableSecurityHub
        .mockRejectedValueOnce(new Error('Temporary error')) // First EnableOrganizationAdminAccount attempt
        .mockResolvedValueOnce({}); // Second EnableOrganizationAdminAccount attempt

      const result = await module['enableOrganizationAdminAccount'](new SecurityHubClient({}), '123456789012');

      expect(mockSend).toHaveBeenCalledTimes(3);
      expect(result).toContain('Successfully set Security Hub Organization Admin');
    });

    test('should handle max retries exceeded', async () => {
      mockSend
        .mockResolvedValueOnce({}) // EnableSecurityHub
        .mockRejectedValue(new Error('Persistent error')); // All EnableOrganizationAdminAccount attempts fail

      const result = await module['enableOrganizationAdminAccount'](new SecurityHubClient({}), '123456789012');

      expect(mockSend).toHaveBeenCalledTimes(7); // 1 EnableSecurityHub + 6 EnableOrganizationAdminAccount attempts
      expect(result).toContain('Successfully set Security Hub Organization Admin');
    });
  });

  describe('disableOrganizationAdminAccount', () => {
    test('should disable organization admin account successfully', async () => {
      mockSend.mockResolvedValue({});

      const result = await module['disableOrganizationAdminAccount'](new SecurityHubClient({}), '123456789012');

      expect(mockSend).toHaveBeenCalledWith(expect.any(DisableOrganizationAdminAccountCommand));
      expect(result).toContain('Successfully disabled Security Hub organization admin account');
    });

    test('should throw error when disable fails', async () => {
      const error = new Error('Disable failed');
      mockSend.mockRejectedValue(error);

      await expect(
        module['disableOrganizationAdminAccount'](new SecurityHubClient({}), '123456789012'),
      ).rejects.toThrow('Disable failed');
    });
  });

  describe('setRequestedConfiguration', () => {
    test('should return message when no admin to remove', async () => {
      const result = module['setRequestedConfiguration'](
        new SecurityHubClient({}),
        { enable: false, accountId: '123456789012' },
        undefined,
      );

      expect(result).toContain('There is no Security Hub Organization Admin currently set');
    });
  });

  describe('getDryRunResponse', () => {
    test('should return correct dry-run response for enable when no current admin', () => {
      const result = module['getDryRunResponse'](
        AcceleratorModuleName.AWS_SECURITY_HUB,
        'test',
        { enable: true, accountId: '123456789012' },
        undefined,
      );

      expect(result).toContain('[DRY-RUN]');
      expect(result).toContain('will be set as the Security Hub Organization Admin');
    });

    test('should return correct dry-run response for enable when account is already admin', () => {
      const result = module['getDryRunResponse'](
        AcceleratorModuleName.AWS_SECURITY_HUB,
        'test',
        { enable: true, accountId: '123456789012' },
        '123456789012',
      );

      expect(result).toContain('is already the Security Hub Organization Admin');
    });

    test('should return error response for enable when different admin exists', () => {
      const result = module['getDryRunResponse'](
        AcceleratorModuleName.AWS_SECURITY_HUB,
        'test',
        { enable: true, accountId: '123456789012' },
        '999999999999',
      );

      expect(result).toContain(MODULE_EXCEPTIONS.INVALID_INPUT);
      expect(result).toContain('already set to 999999999999');
    });

    test('should return correct dry-run response for disable when no current admin', () => {
      const result = module['getDryRunResponse'](
        AcceleratorModuleName.AWS_SECURITY_HUB,
        'test',
        { enable: false, accountId: '123456789012' },
        undefined,
      );

      expect(result).toContain('will not need to be removed');
    });

    test('should return correct dry-run response for disable when account matches', () => {
      const result = module['getDryRunResponse'](
        AcceleratorModuleName.AWS_SECURITY_HUB,
        'test',
        { enable: false, accountId: '123456789012' },
        '123456789012',
      );

      expect(result).toContain('Will disable Security Hub Organization Admin');
    });

    test('should return error response for disable when account mismatch', () => {
      const result = module['getDryRunResponse'](
        AcceleratorModuleName.AWS_SECURITY_HUB,
        'test',
        { enable: false, accountId: '123456789012' },
        '999999999999',
      );

      expect(result).toContain(MODULE_EXCEPTIONS.INVALID_INPUT);
      expect(result).toContain('differs from the expected');
    });
  });
});
