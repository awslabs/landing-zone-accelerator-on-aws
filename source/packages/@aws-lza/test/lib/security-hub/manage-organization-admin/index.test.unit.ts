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

vi.mock('@aws-sdk/client-securityhub', async () => {
  const actual = await vi.importActual('@aws-sdk/client-securityhub');
  return {
    ...actual,
    SecurityHubClient: vi.fn(),
    DisableOrganizationAdminAccountCommand: vi.fn(),
    EnableOrganizationAdminAccountCommand: vi.fn(),
    EnableSecurityHubCommand: vi.fn(),
    paginateListOrganizationAdminAccounts: vi.fn(),
  };
});

vi.mock('../../../../common/functions', async () => {
  const actual = await vi.importActual('../../../../common/functions');
  return {
    ...actual,
    delay: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../../../../common/throttle', () => {
  return {
    throttlingBackOff: vi.fn().mockImplementation(fn => fn()),
  };
});

describe('SecurityHubManageOrganizationAdminModule', () => {
  const mockSend = vi.fn();
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
    vi.clearAllMocks();
    module = new SecurityHubManageOrganizationAdminModule();
    vi.mocked(SecurityHubClient).mockImplementation(
      () =>
        ({
          send: mockSend,
          // eslint-disable-next-line
        } as any),
    );
  });

  describe('handler', () => {
    test('should return dry-run response when dryRun is true', async () => {
      const params = { ...baseParams, dryRun: true };
      vi.mocked(paginateListOrganizationAdminAccounts).mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield { AdminAccounts: [], $metadata: {} };
        },
      } as ReturnType<typeof paginateListOrganizationAdminAccounts>);

      const result = await module.handler(params);

      expect(result).toContain('[DRY-RUN]');
      expect(result).toContain(AcceleratorModuleName.AWS_SECURITY_HUB);
    });

    test('should enable organization admin when no current admin exists', async () => {
      vi.mocked(paginateListOrganizationAdminAccounts).mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield { AdminAccounts: [], $metadata: {} };
        },
      } as ReturnType<typeof paginateListOrganizationAdminAccounts>);
      mockSend.mockResolvedValue({});

      const result = await module.handler(baseParams);

      expect(mockSend).toHaveBeenCalledWith(expect.any(EnableSecurityHubCommand));
      expect(mockSend).toHaveBeenCalledWith(expect.any(EnableOrganizationAdminAccountCommand));
      expect(result).toContain('Successfully set Security Hub Organization Admin');
    });

    test('should return message when account is already admin', async () => {
      vi.mocked(paginateListOrganizationAdminAccounts).mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield { AdminAccounts: [{ AccountId: '123456789012', Status: 'ENABLED' }], $metadata: {} };
        },
      } as ReturnType<typeof paginateListOrganizationAdminAccounts>);

      const result = await module.handler(baseParams);

      expect(result).toContain('is already the Security Hub Organization Admin');
      expect(mockSend).not.toHaveBeenCalled();
    });

    test('should disable organization admin when enable is false', async () => {
      const params = { ...baseParams, configuration: { enable: false, accountId: '123456789012' } };
      vi.mocked(paginateListOrganizationAdminAccounts).mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield { AdminAccounts: [{ AccountId: '123456789012', Status: 'ENABLED' }], $metadata: {} };
        },
      } as ReturnType<typeof paginateListOrganizationAdminAccounts>);
      mockSend.mockResolvedValue({});

      const result = await module.handler(params);

      expect(mockSend).toHaveBeenCalledWith(expect.any(DisableOrganizationAdminAccountCommand));
      expect(result).toContain('Successfully disabled Security Hub organization admin account');
    });

    test('should throw error when trying to enable different admin', async () => {
      vi.mocked(paginateListOrganizationAdminAccounts).mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield { AdminAccounts: [{ AccountId: '999999999999', Status: 'ENABLED' }], $metadata: {} };
        },
      } as ReturnType<typeof paginateListOrganizationAdminAccounts>);

      await expect(module.handler(baseParams)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.INVALID_INPUT}: Security Hub delegated admin is already set to 999999999999`,
      );
    });

    test('should throw error when trying to disable wrong admin', async () => {
      const params = { ...baseParams, configuration: { enable: false, accountId: '123456789012' } };
      vi.mocked(paginateListOrganizationAdminAccounts).mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield { AdminAccounts: [{ AccountId: '999999999999', Status: 'ENABLED' }], $metadata: {} };
        },
      } as ReturnType<typeof paginateListOrganizationAdminAccounts>);

      await expect(module.handler(params)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.INVALID_INPUT}: Could not remove Account with ID 123456789012`,
      );
    });
  });

  describe('getOrganizationAdmin', () => {
    test('should return undefined when no admin accounts exist', async () => {
      vi.mocked(paginateListOrganizationAdminAccounts).mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield { AdminAccounts: [], $metadata: {} };
        },
      } as ReturnType<typeof paginateListOrganizationAdminAccounts>);

      const result = await module['getOrganizationAdmin'](new SecurityHubClient({}));

      expect(result).toBeUndefined();
    });

    test('should return account ID when single admin exists', async () => {
      vi.mocked(paginateListOrganizationAdminAccounts).mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield { AdminAccounts: [{ AccountId: '123456789012', Status: 'ENABLED' }], $metadata: {} };
        },
      } as ReturnType<typeof paginateListOrganizationAdminAccounts>);

      const result = await module['getOrganizationAdmin'](new SecurityHubClient({}));

      expect(result).toBe('123456789012');
    });

    test('should throw error when multiple admin accounts exist', async () => {
      vi.mocked(paginateListOrganizationAdminAccounts).mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield {
            AdminAccounts: [
              { AccountId: '123456789012', Status: 'ENABLED' },
              { AccountId: '999999999999', Status: 'ENABLED' },
            ],
            $metadata: {},
          };
        },
      } as ReturnType<typeof paginateListOrganizationAdminAccounts>);

      await expect(module['getOrganizationAdmin'](new SecurityHubClient({}))).rejects.toThrow(
        'Multiple admin accounts for Security Hub in organization',
      );
    });

    test('should throw error when admin is in DISABLE_IN_PROGRESS status', async () => {
      vi.mocked(paginateListOrganizationAdminAccounts).mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield { AdminAccounts: [{ AccountId: '123456789012', Status: 'DISABLE_IN_PROGRESS' }], $metadata: {} };
        },
      } as ReturnType<typeof paginateListOrganizationAdminAccounts>);

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

      await expect(module['enableSecurityHub'](new SecurityHubClient({}))).rejects.toThrow('Unknown error');
    });
  });
});
