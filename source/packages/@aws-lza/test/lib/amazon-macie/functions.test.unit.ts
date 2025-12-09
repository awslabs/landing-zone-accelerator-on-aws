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
import { Macie2Client, MacieStatus, AccessDeniedException } from '@aws-sdk/client-macie2';
import { enableMacie, isMacieEnabled, disableMacie, listAdminAccounts } from '../../../lib/amazon-macie/functions';

vi.mock('@aws-sdk/client-macie2', () => ({
  Macie2Client: vi.fn(),
  EnableMacieCommand: vi.fn(),
  DisableMacieCommand: vi.fn(),
  GetMacieSessionCommand: vi.fn(),
  paginateListOrganizationAdminAccounts: vi.fn(),
  MacieStatus: { ENABLED: 'ENABLED', PAUSED: 'PAUSED' },
  AccessDeniedException: vi.fn(),
}));

vi.mock('../../../lib/common/utility', () => ({
  executeApi: vi.fn(),
  waitUntil: vi.fn(),
}));

vi.mock('../../../lib/common/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    dryRun: vi.fn(),
    commandExecution: vi.fn(),
    commandSuccess: vi.fn(),
  })),
}));

describe('amazon-macie functions', () => {
  let mockExecuteApi: ReturnType<typeof vi.fn>;
  let mockWaitUntil: ReturnType<typeof vi.fn>;
  let mockPaginate: ReturnType<typeof vi.fn>;
  const mockClient = new Macie2Client({});
  const logPrefix = 'test';

  beforeEach(async () => {
    vi.clearAllMocks();
    const utility = await import('../../../lib/common/utility');
    const macie = await import('@aws-sdk/client-macie2');
    mockExecuteApi = vi.mocked(utility.executeApi);
    mockWaitUntil = vi.mocked(utility.waitUntil);
    mockPaginate = vi.mocked(macie.paginateListOrganizationAdminAccounts);
  });

  describe('enableMacie', () => {
    test('should enable Macie successfully', async () => {
      mockExecuteApi.mockResolvedValue({});
      mockWaitUntil.mockResolvedValue(undefined);

      await enableMacie(mockClient, false, logPrefix);

      expect(mockExecuteApi).toHaveBeenCalledWith(
        'EnableMacieCommand',
        { status: MacieStatus.ENABLED },
        expect.any(Function),
        expect.anything(),
        logPrefix,
      );
      expect(mockWaitUntil).toHaveBeenCalled();
    });

    test('should handle dry run', async () => {
      await enableMacie(mockClient, true, logPrefix);
      expect(mockExecuteApi).not.toHaveBeenCalled();
    });

    test('should call waitUntil after enabling Macie', async () => {
      mockExecuteApi.mockResolvedValue({});
      mockWaitUntil.mockImplementation(async predicate => {
        await predicate(); // Execute the predicate to cover the waitUntil call
      });

      await enableMacie(mockClient, false, logPrefix);

      expect(mockWaitUntil).toHaveBeenCalledWith(
        expect.any(Function),
        'Could not get confirmation that macie was enabled',
      );
    });
  });

  describe('isMacieEnabled', () => {
    test('should return true when Macie is enabled', async () => {
      mockExecuteApi.mockResolvedValue({ status: MacieStatus.ENABLED });

      const result = await isMacieEnabled(mockClient, logPrefix);

      expect(result).toBe(true);
    });

    test('should return false when Macie is not enabled', async () => {
      mockExecuteApi.mockResolvedValue({ status: MacieStatus.PAUSED });

      const result = await isMacieEnabled(mockClient, logPrefix);

      expect(result).toBe(false);
    });

    test('should return false when AccessDeniedException is thrown', async () => {
      const error = new AccessDeniedException({ message: 'Access denied', $metadata: {} });
      mockExecuteApi.mockRejectedValue(error);

      const result = await isMacieEnabled(mockClient, logPrefix);

      expect(result).toBe(false);
    });

    test('should rethrow other errors', async () => {
      const error = new Error('Other error');
      mockExecuteApi.mockRejectedValue(error);

      await expect(isMacieEnabled(mockClient, logPrefix)).rejects.toThrow('Other error');
    });
  });

  describe('disableMacie', () => {
    test('should disable Macie successfully', async () => {
      mockExecuteApi.mockResolvedValue({});

      await disableMacie(mockClient, false, logPrefix);

      expect(mockExecuteApi).toHaveBeenCalledWith(
        'DisableMacieCommand',
        {},
        expect.any(Function),
        expect.anything(),
        logPrefix,
      );
    });

    test('should handle dry run', async () => {
      await disableMacie(mockClient, true, logPrefix);
      expect(mockExecuteApi).not.toHaveBeenCalled();
    });
  });

  describe('listAdminAccounts', () => {
    test('should list admin accounts successfully', async () => {
      const mockAccounts = [
        { accountId: '123456789012', status: 'ENABLED' },
        { accountId: '123456789013', status: 'ENABLED' },
      ];

      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { adminAccounts: [mockAccounts[0]] };
          yield { adminAccounts: [mockAccounts[1]] };
        },
      };

      mockPaginate.mockReturnValue(mockPaginator);

      const result = await listAdminAccounts(mockClient, logPrefix);

      expect(result).toEqual(mockAccounts);
    });

    test('should handle empty admin accounts', async () => {
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { adminAccounts: [] };
        },
      };

      mockPaginate.mockReturnValue(mockPaginator);

      const result = await listAdminAccounts(mockClient, logPrefix);

      expect(result).toEqual([]);
    });

    test('should handle undefined admin accounts', async () => {
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { adminAccounts: undefined };
          yield { adminAccounts: [{ accountId: '123456789012', status: 'ENABLED' }] };
        },
      };

      mockPaginate.mockReturnValue(mockPaginator);

      const result = await listAdminAccounts(mockClient, logPrefix);

      expect(result).toEqual([{ accountId: '123456789012', status: 'ENABLED' }]);
    });
  });
});
