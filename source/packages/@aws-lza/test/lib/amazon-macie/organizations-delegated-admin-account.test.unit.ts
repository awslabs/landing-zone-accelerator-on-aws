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
import { Macie2Client, MacieStatus } from '@aws-sdk/client-macie2';
import { OrganizationsDelegatedAdminAccount } from '../../../lib/amazon-macie/organizations-delegated-admin-account';

vi.mock('@aws-sdk/client-macie2', () => ({
  Macie2Client: vi.fn(),
  DisableOrganizationAdminAccountCommand: vi.fn(),
  EnableOrganizationAdminAccountCommand: vi.fn(),
  MacieStatus: { ENABLED: 'ENABLED', PAUSED: 'PAUSED' },
}));

vi.mock('../../../lib/common/utility', () => ({
  executeApi: vi.fn(),
  waitUntil: vi.fn(),
}));

vi.mock('../../../lib/amazon-macie/functions', () => ({
  listAdminAccounts: vi.fn(),
}));

vi.mock('../../../lib/common/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    dryRun: vi.fn(),
  })),
}));

describe('OrganizationsDelegatedAdminAccount', () => {
  let mockExecuteApi: ReturnType<typeof vi.fn>;
  let mockWaitUntil: ReturnType<typeof vi.fn>;
  let mockListAdminAccounts: ReturnType<typeof vi.fn>;
  const mockClient = new Macie2Client({});
  const logPrefix = 'test';
  const delegatedAdminAccountId = '123456789012';

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    const utility = await import('../../../lib/common/utility');
    const functions = await import('../../../lib/amazon-macie/functions');

    mockExecuteApi = vi.mocked(utility.executeApi);
    mockWaitUntil = vi.mocked(utility.waitUntil);
    mockListAdminAccounts = vi.mocked(functions.listAdminAccounts);
  });

  describe('disableOrganizationAdminAccount', () => {
    test('should handle dry run mode', async () => {
      await OrganizationsDelegatedAdminAccount.disableOrganizationAdminAccount(
        mockClient,
        true,
        delegatedAdminAccountId,
        logPrefix,
      );

      expect(mockExecuteApi).not.toHaveBeenCalled();
    });

    test('should disable organization admin account successfully', async () => {
      mockExecuteApi.mockResolvedValue(undefined);
      mockWaitUntil.mockResolvedValue(undefined);
      mockListAdminAccounts.mockResolvedValue([]);

      await OrganizationsDelegatedAdminAccount.disableOrganizationAdminAccount(
        mockClient,
        false,
        delegatedAdminAccountId,
        logPrefix,
      );

      expect(mockExecuteApi).toHaveBeenCalledWith(
        'DisableOrganizationAdminAccountCommand',
        { adminAccountId: delegatedAdminAccountId },
        expect.any(Function),
        expect.anything(),
        logPrefix,
      );
      expect(mockWaitUntil).toHaveBeenCalled();
    });
  });

  describe('enableOrganizationAdminAccount', () => {
    test('should handle dry run mode', async () => {
      await OrganizationsDelegatedAdminAccount.enableOrganizationAdminAccount(
        mockClient,
        true,
        delegatedAdminAccountId,
        logPrefix,
      );

      expect(mockExecuteApi).not.toHaveBeenCalled();
    });

    test('should enable organization admin account successfully', async () => {
      mockExecuteApi.mockResolvedValue(undefined);
      mockWaitUntil.mockResolvedValue(undefined);

      const getAdminAccountIdSpy = vi.spyOn(OrganizationsDelegatedAdminAccount, 'getOrganizationAdminAccountId');
      getAdminAccountIdSpy.mockResolvedValue(delegatedAdminAccountId);

      await OrganizationsDelegatedAdminAccount.enableOrganizationAdminAccount(
        mockClient,
        false,
        delegatedAdminAccountId,
        logPrefix,
      );

      expect(mockExecuteApi).toHaveBeenCalledWith(
        'EnableOrganizationAdminAccountCommand',
        { adminAccountId: delegatedAdminAccountId },
        expect.any(Function),
        expect.anything(),
        logPrefix,
      );
      expect(mockWaitUntil).toHaveBeenCalled();
    });
  });

  describe('disableOrganizationAdminAccount - waitUntil predicate', () => {
    test('should return false when account still enabled', async () => {
      mockExecuteApi.mockResolvedValue(undefined);
      let predicateResult = true;
      mockWaitUntil.mockImplementation(async predicate => {
        predicateResult = await predicate();
      });
      mockListAdminAccounts.mockResolvedValue([{ accountId: 'other-account', status: MacieStatus.ENABLED }]);

      await OrganizationsDelegatedAdminAccount.disableOrganizationAdminAccount(
        mockClient,
        false,
        delegatedAdminAccountId,
        logPrefix,
      );

      expect(predicateResult).toBe(false);
    });

    test('should return false when account matches delegated admin ID', async () => {
      mockExecuteApi.mockResolvedValue(undefined);
      let predicateResult = true;
      mockWaitUntil.mockImplementation(async predicate => {
        predicateResult = await predicate();
      });
      mockListAdminAccounts.mockResolvedValue([{ accountId: delegatedAdminAccountId, status: MacieStatus.PAUSED }]);

      await OrganizationsDelegatedAdminAccount.disableOrganizationAdminAccount(
        mockClient,
        false,
        delegatedAdminAccountId,
        logPrefix,
      );

      expect(predicateResult).toBe(false);
    });
  });

  describe('getOrganizationAdminAccountId', () => {
    test('should return undefined when no enabled admin accounts', async () => {
      mockListAdminAccounts.mockResolvedValue([{ accountId: '999999999999', status: MacieStatus.PAUSED }]);

      const result = await OrganizationsDelegatedAdminAccount.getOrganizationAdminAccountId(mockClient, logPrefix);

      expect(result).toBeUndefined();
    });

    test('should return admin account id when one enabled account exists', async () => {
      mockListAdminAccounts.mockResolvedValue([{ accountId: delegatedAdminAccountId, status: MacieStatus.ENABLED }]);

      const result = await OrganizationsDelegatedAdminAccount.getOrganizationAdminAccountId(mockClient, logPrefix);

      expect(result).toBe(delegatedAdminAccountId);
    });

    test('should throw error when multiple enabled admin accounts exist', async () => {
      mockListAdminAccounts.mockResolvedValue([
        { accountId: '999999999998', status: MacieStatus.ENABLED },
        { accountId: '999999999999', status: MacieStatus.ENABLED },
      ]);

      await expect(
        OrganizationsDelegatedAdminAccount.getOrganizationAdminAccountId(mockClient, logPrefix),
      ).rejects.toThrow(
        'ServiceException: ListOrganizationAdminAccountsCommand returned more than one enabled admin account',
      );
    });

    test('should filter out accounts with undefined accountId', async () => {
      mockListAdminAccounts.mockResolvedValue([
        { accountId: undefined, status: MacieStatus.ENABLED },
        { accountId: delegatedAdminAccountId, status: MacieStatus.ENABLED },
      ]);

      const result = await OrganizationsDelegatedAdminAccount.getOrganizationAdminAccountId(mockClient, logPrefix);

      expect(result).toBe(delegatedAdminAccountId);
    });
  });
});
