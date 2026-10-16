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

import { GuardDutyClient } from '@aws-sdk/client-guardduty';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  getDetectorId,
  listAdminAccounts,
  getOrganizationAdminAccountId,
  createDetector,
  deleteDetectorId,
  getFeaturesToEnable,
  deduplicateOrderedAccountListType,
} from '../../../lib/guardduty/functions';

vi.mock('@aws-sdk/client-guardduty', () => ({
  GuardDutyClient: vi.fn(),
  paginateListOrganizationAdminAccounts: vi.fn(),
  ListDetectorsCommand: vi.fn(),
  CreateDetectorCommand: vi.fn(),
  DeleteDetectorCommand: vi.fn(),
}));

vi.mock('@aws-sdk/client-organizations', async importOriginal => {
  const actual = await importOriginal<typeof import('@aws-sdk/client-organizations')>();
  return {
    ...actual,
    OrganizationsClient: vi.fn(),
  };
});

vi.mock('../../../lib/common/utility', () => ({
  executeApi: vi.fn(),
  setRetryStrategy: vi.fn(() => undefined),
}));

vi.mock('../../../lib/common/organizations-functions', () => ({
  getDelegatedAdministratorAccountId: vi.fn(),
}));

vi.mock('../../../lib/common/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    dryRun: vi.fn(),
    commandExecution: vi.fn(),
    commandSuccess: vi.fn(),
  })),
}));

describe('guardduty functions', () => {
  let mockPaginate: ReturnType<typeof vi.fn>;
  let mockExecuteApi: ReturnType<typeof vi.fn>;
  const mockClient = new GuardDutyClient({});
  const logPrefix = 'test';

  beforeEach(async () => {
    vi.clearAllMocks();
    const guardduty = await import('@aws-sdk/client-guardduty');
    const utility = await import('../../../lib/common/utility.js');
    mockPaginate = vi.mocked(guardduty.paginateListOrganizationAdminAccounts);
    mockExecuteApi = vi.mocked(utility.executeApi);
  });

  describe('listAdminAccounts', () => {
    test('should list admin accounts successfully', async () => {
      const mockAccounts = [
        { AdminAccountId: 'XXXXXXXXXXXX', AdminStatus: 'ENABLED' },
        { AdminAccountId: 'YYYYYYYYYYYY', AdminStatus: 'ENABLED' },
      ];

      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { AdminAccounts: [mockAccounts[0]] };
          yield { AdminAccounts: [mockAccounts[1]] };
        },
      };

      mockPaginate.mockReturnValue(mockPaginator);

      const result = await listAdminAccounts(mockClient, logPrefix);

      expect(result).toEqual(mockAccounts);
    });

    test('should handle empty admin accounts', async () => {
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { AdminAccounts: [] };
        },
      };

      mockPaginate.mockReturnValue(mockPaginator);

      const result = await listAdminAccounts(mockClient, logPrefix);

      expect(result).toEqual([]);
    });

    test('should handle multiple pages of admin accounts', async () => {
      const mockAccounts = [
        { AdminAccountId: 'XXXXXXXXXXXX', AdminStatus: 'ENABLED' },
        { AdminAccountId: 'YYYYYYYYYYYY', AdminStatus: 'ENABLED' },
        { AdminAccountId: 'ZZZZZZZZZZZZ', AdminStatus: 'ENABLED' },
      ];

      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { AdminAccounts: [mockAccounts[0], mockAccounts[1]] };
          yield { AdminAccounts: [mockAccounts[2]] };
        },
      };

      mockPaginate.mockReturnValue(mockPaginator);

      const result = await listAdminAccounts(mockClient, logPrefix);

      expect(result).toEqual(mockAccounts);
    });
  });

  describe('getDetectorId', () => {
    test('should return detector ID when exactly one exists', async () => {
      mockExecuteApi.mockResolvedValue({ DetectorIds: ['detector-abc123'] });

      const result = await getDetectorId(mockClient, logPrefix);

      expect(result).toBe('detector-abc123');
      expect(mockExecuteApi).toHaveBeenCalledWith(
        'ListDetectorsCommand',
        {},
        expect.any(Function),
        expect.anything(),
        logPrefix,
      );
    });

    test('should return undefined when no detector IDs are returned', async () => {
      mockExecuteApi.mockResolvedValue({ DetectorIds: [] });

      const result = await getDetectorId(mockClient, logPrefix);
      expect(result).toBeUndefined();
    });

    test('should throw when multiple detector IDs are returned', async () => {
      mockExecuteApi.mockResolvedValue({ DetectorIds: ['detector-1', 'detector-2'] });

      await expect(getDetectorId(mockClient, logPrefix)).rejects.toThrow('Expected 1 detector ID but found 2');
    });

    test('should return undefined when DetectorIds is undefined', async () => {
      mockExecuteApi.mockResolvedValue({});

      const result = await getDetectorId(mockClient, logPrefix);
      expect(result).toBeUndefined();
    });

    test('should return undefined when DetectorIds has one empty element', async () => {
      mockExecuteApi.mockResolvedValue({ DetectorIds: [undefined] });

      const result = await getDetectorId(mockClient, logPrefix);
      expect(result).toBeUndefined();
    });
  });

  describe('getOrganizationAdminAccountId', () => {
    test('should return undefined when no admin accounts exist', async () => {
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { AdminAccounts: [] };
        },
      };
      mockPaginate.mockReturnValue(mockPaginator);

      const result = await getOrganizationAdminAccountId(mockClient, logPrefix);
      expect(result).toBeUndefined();
    });

    test('should return admin account id when one account exists', async () => {
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { AdminAccounts: [{ AdminAccountId: 'XXXXXXXXXXXX' }] };
        },
      };
      mockPaginate.mockReturnValue(mockPaginator);

      const result = await getOrganizationAdminAccountId(mockClient, logPrefix);
      expect(result).toBe('XXXXXXXXXXXX');
    });

    test('should throw error when multiple admin accounts exist', async () => {
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { AdminAccounts: [{ AdminAccountId: 'YYYYYYYYYYYY' }, { AdminAccountId: 'ZZZZZZZZZZZZ' }] };
        },
      };
      mockPaginate.mockReturnValue(mockPaginator);

      await expect(getOrganizationAdminAccountId(mockClient, logPrefix)).rejects.toThrow(
        'Found multiple enabled GuardDuty admin accounts: YYYYYYYYYYYY, ZZZZZZZZZZZZ',
      );
    });

    test('should filter out accounts with undefined AdminAccountId', async () => {
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { AdminAccounts: [{ AdminAccountId: undefined }, { AdminAccountId: 'XXXXXXXXXXXX' }] };
        },
      };
      mockPaginate.mockReturnValue(mockPaginator);

      const result = await getOrganizationAdminAccountId(mockClient, logPrefix);
      expect(result).toBe('XXXXXXXXXXXX');
    });

    test('should return undefined when all accounts have undefined AdminAccountId', async () => {
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { AdminAccounts: [{ AdminAccountId: undefined }, { AdminAccountId: undefined }] };
        },
      };
      mockPaginate.mockReturnValue(mockPaginator);

      const result = await getOrganizationAdminAccountId(mockClient, logPrefix);
      expect(result).toBeUndefined();
    });
  });

  describe('createDetector', () => {
    test('should create detector and return detector ID', async () => {
      mockExecuteApi.mockResolvedValue({ DetectorId: 'new-detector-123' });

      const result = await createDetector(mockClient, false, logPrefix);
      expect(result).toBe('new-detector-123');
      expect(mockExecuteApi).toHaveBeenCalledWith(
        'CreateDetectorCommand',
        { Enable: true },
        expect.any(Function),
        expect.anything(),
        logPrefix,
      );
    });

    test('should return undefined in dry run mode', async () => {
      const result = await createDetector(mockClient, true, logPrefix);
      expect(result).toBeUndefined();
      expect(mockExecuteApi).not.toHaveBeenCalled();
    });
  });

  describe('deleteDetectorId', () => {
    test('should delete detector successfully', async () => {
      mockExecuteApi.mockResolvedValue(undefined);

      await deleteDetectorId(mockClient, 'detector-123', false, logPrefix);
      expect(mockExecuteApi).toHaveBeenCalledWith(
        'DeleteDetectorCommand',
        { DetectorId: 'detector-123' },
        expect.any(Function),
        expect.anything(),
        logPrefix,
      );
    });

    test('should handle dry run mode', async () => {
      await deleteDetectorId(mockClient, 'detector-123', true, logPrefix);
      expect(mockExecuteApi).not.toHaveBeenCalled();
    });
  });

  describe('getFeaturesToEnable', () => {
    test('should return default flags when no config provided', () => {
      const result = getFeaturesToEnable('us-east-1', logPrefix, undefined);
      // EKS granular flags stay undefined (omitted downstream, so unsupported names are never sent).
      // ec2/rds/lambda default to false (sent as DISABLED) because GuardDuty enables those protection
      // plans on a new detector by default and they must be actively turned off when unconfigured.
      // s3 carries s3Protection.enable, which is undefined when no config is provided.
      expect(result).toEqual({
        s3DataEvents: undefined,
        auditLogs: undefined,
        runtimeMonitoring: undefined,
        eksAgent: undefined,
        ec2Protection: false,
        rdsProtection: false,
        lambdaProtection: false,
      });
    });

    test('should return flags from config', () => {
      const config = {
        s3Protection: { enable: true },
        eksProtection: { auditLogs: true, runtimeMonitoring: true, manageAgent: true },
        ec2Protection: { enable: true, keepSnapshots: false },
        rdsProtection: { enable: true },
        lambdaProtection: { enable: true },
      };

      const result = getFeaturesToEnable('us-east-1', logPrefix, config);
      expect(result).toEqual({
        s3DataEvents: true,
        auditLogs: true,
        runtimeMonitoring: true,
        eksAgent: true,
        ec2Protection: true,
        rdsProtection: true,
        lambdaProtection: true,
      });
    });

    test('should map EKS audit logs and runtime monitoring independently', () => {
      const auditOnly = getFeaturesToEnable('us-east-1', logPrefix, {
        s3Protection: { enable: false },
        eksProtection: { auditLogs: true, runtimeMonitoring: false, manageAgent: false },
      });
      expect(auditOnly.auditLogs).toBe(true);
      expect(auditOnly.runtimeMonitoring).toBe(false);
      expect(auditOnly.eksAgent).toBe(false);

      const runtimeOnly = getFeaturesToEnable('us-east-1', logPrefix, {
        s3Protection: { enable: false },
        eksProtection: { auditLogs: false, runtimeMonitoring: true, manageAgent: true },
      });
      expect(runtimeOnly.auditLogs).toBe(false);
      expect(runtimeOnly.runtimeMonitoring).toBe(true);
      expect(runtimeOnly.eksAgent).toBe(true);
    });

    test('should disable s3 protection for excluded region', () => {
      const config = {
        s3Protection: { enable: true, excludedRegions: ['us-west-2'] },
      };

      const result = getFeaturesToEnable('us-west-2', logPrefix, config);
      expect(result.s3DataEvents).toBe(false);
    });

    test('should not disable s3 protection for non-excluded region', () => {
      const config = {
        s3Protection: { enable: true, excludedRegions: ['us-west-2'] },
      };

      const result = getFeaturesToEnable('us-east-1', logPrefix, config);
      expect(result.s3DataEvents).toBe(true);
    });

    test('should disable eks protection for excluded region', () => {
      const config = {
        s3Protection: { enable: false },
        eksProtection: { auditLogs: true, runtimeMonitoring: true, manageAgent: true, excludedRegions: ['eu-west-1'] },
      };

      const result = getFeaturesToEnable('eu-west-1', logPrefix, config);
      expect(result.auditLogs).toBe(false);
      expect(result.runtimeMonitoring).toBe(false);
      expect(result.eksAgent).toBe(false);
    });

    test('unconfigured ec2/rds/lambda default to false (DISABLED) while unconfigured EKS stays undefined (omitted)', () => {
      // Only S3 and EKS audit logs configured; EKS runtime/agent and ec2/rds/lambda all omitted.
      const config = {
        s3Protection: { enable: true },
        eksProtection: { auditLogs: true },
      };

      const result = getFeaturesToEnable('us-east-1', logPrefix, config);
      expect(result.s3DataEvents).toBe(true);
      expect(result.auditLogs).toBe(true);
      // EKS runtime/agent not configured -> undefined (omitted; unsupported names never sent).
      expect(result.runtimeMonitoring).toBeUndefined();
      expect(result.eksAgent).toBeUndefined();
      // ec2/rds/lambda not configured -> false (sent as DISABLED to turn off default-on plans).
      expect(result.ec2Protection).toBe(false);
      expect(result.rdsProtection).toBe(false);
      expect(result.lambdaProtection).toBe(false);
    });

    test('should force configured EKS flags off in excluded region but keep unconfigured ones undefined', () => {
      // Partial config: only auditLogs set; runtimeMonitoring and manageAgent omitted.
      const config = {
        s3Protection: { enable: false },
        eksProtection: { auditLogs: true, excludedRegions: ['eu-west-1'] },
      };

      const result = getFeaturesToEnable('eu-west-1', logPrefix, config);
      // Configured flag is forced OFF for the excluded region...
      expect(result.auditLogs).toBe(false);
      // ...but unconfigured flags must stay undefined (omitted), not coerced to false, so their
      // feature names are never sent to a region/partition that may not support them.
      expect(result.runtimeMonitoring).toBeUndefined();
      expect(result.eksAgent).toBeUndefined();
    });

    test('should disable ec2 protection for excluded region', () => {
      const config = {
        s3Protection: { enable: false },
        ec2Protection: { enable: true, keepSnapshots: false, excludedRegions: ['ap-southeast-1'] },
      };

      const result = getFeaturesToEnable('ap-southeast-1', logPrefix, config);
      expect(result.ec2Protection).toBe(false);
    });

    test('should disable rds protection for excluded region', () => {
      const config = {
        s3Protection: { enable: false },
        rdsProtection: { enable: true, excludedRegions: ['us-east-1'] },
      };

      const result = getFeaturesToEnable('us-east-1', logPrefix, config);
      expect(result.rdsProtection).toBe(false);
    });

    test('should disable lambda protection for excluded region', () => {
      const config = {
        s3Protection: { enable: false },
        lambdaProtection: { enable: true, excludedRegions: ['us-east-1'] },
      };

      const result = getFeaturesToEnable('us-east-1', logPrefix, config);
      expect(result.lambdaProtection).toBe(false);
    });
  });

  describe('deduplicateOrderedAccountListType', () => {
    test('should remove empty account groups', () => {
      const input = [
        { name: 'Group1', order: 1, accounts: [] },
        { name: 'Group2', order: 2, accounts: [{ Id: '111111111111', Name: 'Account1' }] },
      ];

      const result = deduplicateOrderedAccountListType(input);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Group2');
    });

    test('should remove duplicate account groups by first account Id', () => {
      const input = [
        { name: 'Group1', order: 1, accounts: [{ Id: '111111111111', Name: 'Account1' }] },
        { name: 'Group2', order: 2, accounts: [{ Id: '111111111111', Name: 'Account1' }] },
      ];

      const result = deduplicateOrderedAccountListType(input);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Group1');
    });

    test('should keep unique account groups', () => {
      const input = [
        { name: 'Group1', order: 1, accounts: [{ Id: '111111111111', Name: 'Account1' }] },
        { name: 'Group2', order: 2, accounts: [{ Id: '222222222222', Name: 'Account2' }] },
      ];

      const result = deduplicateOrderedAccountListType(input);
      expect(result).toHaveLength(2);
    });

    test('should handle empty input', () => {
      const result = deduplicateOrderedAccountListType([]);
      expect(result).toHaveLength(0);
    });
  });

  describe('isGuardDutyAvailableInPartition', () => {
    test('should return true when getDelegatedAdministratorAccountId succeeds', async () => {
      const { isGuardDutyAvailableInPartition } = await import('../../../lib/guardduty/functions');
      const orgFunctions = await import('../../../lib/common/organizations-functions');
      vi.mocked(orgFunctions.getDelegatedAdministratorAccountId).mockResolvedValue(undefined);

      const result = await isGuardDutyAvailableInPartition({ region: 'us-east-1' }, 'test');

      expect(result).toBe(true);
    });

    test('should return false when InvalidInputException with unrecognized service principal', async () => {
      const { isGuardDutyAvailableInPartition } = await import('../../../lib/guardduty/functions');
      const { InvalidInputException } = await import('@aws-sdk/client-organizations');
      const orgFunctions = await import('../../../lib/common/organizations-functions');

      vi.mocked(orgFunctions.getDelegatedAdministratorAccountId).mockRejectedValue(
        new InvalidInputException({
          message: 'You specified an unrecognized service principal',
          $metadata: {},
        }),
      );

      const result = await isGuardDutyAvailableInPartition({ region: 'us-east-1' }, 'test');

      expect(result).toBe(false);
    });

    test('should rethrow non-InvalidInputException errors', async () => {
      const { isGuardDutyAvailableInPartition } = await import('../../../lib/guardduty/functions');
      const orgFunctions = await import('../../../lib/common/organizations-functions');

      vi.mocked(orgFunctions.getDelegatedAdministratorAccountId).mockRejectedValue(new Error('Network timeout'));

      await expect(isGuardDutyAvailableInPartition({ region: 'us-east-1' }, 'test')).rejects.toThrow('Network timeout');
    });

    test('should rethrow InvalidInputException with different message', async () => {
      const { isGuardDutyAvailableInPartition } = await import('../../../lib/guardduty/functions');
      const { InvalidInputException } = await import('@aws-sdk/client-organizations');
      const orgFunctions = await import('../../../lib/common/organizations-functions');

      vi.mocked(orgFunctions.getDelegatedAdministratorAccountId).mockRejectedValue(
        new InvalidInputException({
          message: 'Some other input error',
          $metadata: {},
        }),
      );

      await expect(isGuardDutyAvailableInPartition({ region: 'us-east-1' }, 'test')).rejects.toThrow(
        'Some other input error',
      );
    });
  });
});
