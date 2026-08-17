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

import { BadRequestException, GuardDutyClient } from '@aws-sdk/client-guardduty';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { OrganizationsDelegatedAdminAccount } from '../../../lib/guardduty/organizations-delegated-admin-account';

vi.mock('@aws-sdk/client-guardduty', async () => {
  const actual = await vi.importActual('@aws-sdk/client-guardduty');
  return {
    ...actual,
    GuardDutyClient: vi.fn(),
    DisableOrganizationAdminAccountCommand: vi.fn(),
    EnableOrganizationAdminAccountCommand: vi.fn(),
  };
});

vi.mock('../../../lib/common/utility', () => ({
  executeApi: vi.fn(),
  waitUntil: vi.fn(),
}));

vi.mock('../../../lib/guardduty/functions', () => ({
  listAdminAccounts: vi.fn(),
  getOrganizationAdminAccountId: vi.fn(),
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
  let mockGetOrganizationAdminAccountId: ReturnType<typeof vi.fn>;
  const mockClient = new GuardDutyClient({});
  const logPrefix = 'test';
  const delegatedAdminAccountId = 'XXXXXXXXXXXX';

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    const utility = await import('../../../lib/common/utility.js');
    const functions = await import('../../../lib/guardduty/functions.js');

    mockExecuteApi = vi.mocked(utility.executeApi);
    mockWaitUntil = vi.mocked(utility.waitUntil);
    mockListAdminAccounts = vi.mocked(functions.listAdminAccounts);
    mockGetOrganizationAdminAccountId = vi.mocked(functions.getOrganizationAdminAccountId);
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
        { AdminAccountId: delegatedAdminAccountId },
        expect.any(Function),
        expect.anything(),
        logPrefix,
      );
      expect(mockWaitUntil).toHaveBeenCalled();
    });

    test('should gracefully handle BadRequestException when delegated admin is already deregistered', async () => {
      const badRequestError = new BadRequestException({
        message: 'The request failed because a delegated administrator account has not been enabled.',
        $metadata: {},
      });
      mockExecuteApi.mockRejectedValue(badRequestError);

      await OrganizationsDelegatedAdminAccount.disableOrganizationAdminAccount(
        mockClient,
        false,
        delegatedAdminAccountId,
        logPrefix,
      );

      expect(mockExecuteApi).toHaveBeenCalled();
      expect(mockWaitUntil).not.toHaveBeenCalled();
    });

    test('should rethrow BadRequestException with different message', async () => {
      const badRequestError = new BadRequestException({
        message: 'Some other bad request error.',
        $metadata: {},
      });
      mockExecuteApi.mockRejectedValue(badRequestError);

      await expect(
        OrganizationsDelegatedAdminAccount.disableOrganizationAdminAccount(
          mockClient,
          false,
          delegatedAdminAccountId,
          logPrefix,
        ),
      ).rejects.toThrow('Some other bad request error.');
    });

    test('should rethrow non-BadRequestException errors', async () => {
      const genericError = new Error('Network timeout');
      mockExecuteApi.mockRejectedValue(genericError);

      await expect(
        OrganizationsDelegatedAdminAccount.disableOrganizationAdminAccount(
          mockClient,
          false,
          delegatedAdminAccountId,
          logPrefix,
        ),
      ).rejects.toThrow('Network timeout');
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
      mockGetOrganizationAdminAccountId.mockResolvedValue(delegatedAdminAccountId);

      await OrganizationsDelegatedAdminAccount.enableOrganizationAdminAccount(
        mockClient,
        false,
        delegatedAdminAccountId,
        logPrefix,
      );

      expect(mockExecuteApi).toHaveBeenCalledWith(
        'EnableOrganizationAdminAccountCommand',
        { AdminAccountId: delegatedAdminAccountId },
        expect.any(Function),
        expect.anything(),
        logPrefix,
      );
      expect(mockWaitUntil).toHaveBeenCalled();
    });
  });

  describe('disableOrganizationAdminAccount - waitUntil predicate', () => {
    test('should return true when account is no longer admin', async () => {
      mockExecuteApi.mockResolvedValue(undefined);
      let predicateResult = false;
      mockWaitUntil.mockImplementation(async predicate => {
        predicateResult = await predicate();
      });
      mockGetOrganizationAdminAccountId.mockResolvedValue(undefined);

      await OrganizationsDelegatedAdminAccount.disableOrganizationAdminAccount(
        mockClient,
        false,
        delegatedAdminAccountId,
        logPrefix,
      );

      expect(predicateResult).toBe(true);
    });

    test('should return false when account is still admin', async () => {
      mockExecuteApi.mockResolvedValue(undefined);
      let predicateResult = true;
      mockWaitUntil.mockImplementation(async predicate => {
        predicateResult = await predicate();
      });
      mockGetOrganizationAdminAccountId.mockResolvedValue(delegatedAdminAccountId);

      await OrganizationsDelegatedAdminAccount.disableOrganizationAdminAccount(
        mockClient,
        false,
        delegatedAdminAccountId,
        logPrefix,
      );

      expect(predicateResult).toBe(false);
    });

    test('should return true when different account is admin', async () => {
      mockExecuteApi.mockResolvedValue(undefined);
      let predicateResult = false;
      mockWaitUntil.mockImplementation(async predicate => {
        predicateResult = await predicate();
      });
      mockGetOrganizationAdminAccountId.mockResolvedValue('other-account');

      await OrganizationsDelegatedAdminAccount.disableOrganizationAdminAccount(
        mockClient,
        false,
        delegatedAdminAccountId,
        logPrefix,
      );

      expect(predicateResult).toBe(true);
    });
  });

  describe('enableOrganizationAdminAccount - waitUntil predicate', () => {
    test('should return true when admin account ID matches expected', async () => {
      mockExecuteApi.mockResolvedValue(undefined);
      let predicateResult = false;
      mockWaitUntil.mockImplementation(async predicate => {
        predicateResult = await predicate();
      });

      mockGetOrganizationAdminAccountId.mockResolvedValue(delegatedAdminAccountId);

      await OrganizationsDelegatedAdminAccount.enableOrganizationAdminAccount(
        mockClient,
        false,
        delegatedAdminAccountId,
        logPrefix,
      );

      expect(predicateResult).toBe(true);
    });

    test('should return false when admin account ID does not match', async () => {
      mockExecuteApi.mockResolvedValue(undefined);
      let predicateResult = true;
      mockWaitUntil.mockImplementation(async predicate => {
        predicateResult = await predicate();
      });

      mockGetOrganizationAdminAccountId.mockResolvedValue('different-account');

      await OrganizationsDelegatedAdminAccount.enableOrganizationAdminAccount(
        mockClient,
        false,
        delegatedAdminAccountId,
        logPrefix,
      );

      expect(predicateResult).toBe(false);
    });

    test('should return false when no admin account exists', async () => {
      mockExecuteApi.mockResolvedValue(undefined);
      let predicateResult = true;
      mockWaitUntil.mockImplementation(async predicate => {
        predicateResult = await predicate();
      });

      mockGetOrganizationAdminAccountId.mockResolvedValue(undefined);

      await OrganizationsDelegatedAdminAccount.enableOrganizationAdminAccount(
        mockClient,
        false,
        delegatedAdminAccountId,
        logPrefix,
      );

      expect(predicateResult).toBe(false);
    });
  });
});
