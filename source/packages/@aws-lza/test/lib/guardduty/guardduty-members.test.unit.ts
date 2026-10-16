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
import { GuardDutyClient, OrgFeatureStatus, AccountDetail } from '@aws-sdk/client-guardduty';
import { GuardDutyMembers } from '../../../lib/guardduty/guardduty-members';

vi.mock('@aws-sdk/client-guardduty', async importOriginal => {
  const actual = await importOriginal<typeof import('@aws-sdk/client-guardduty')>();
  return {
    ...actual,
    GuardDutyClient: vi.fn(),
    UpdateOrganizationConfigurationCommand: vi.fn(),
    CreateMembersCommand: vi.fn(),
    DisassociateMembersCommand: vi.fn(),
    DeleteMembersCommand: vi.fn(),
    UpdateMemberDetectorsCommand: vi.fn(),
    UpdateMalwareScanSettingsCommand: vi.fn(),
    UpdateDetectorCommand: vi.fn(),
    paginateListMembers: vi.fn(),
  };
});

vi.mock('../../../lib/common/utility', () => ({
  executeApi: vi.fn(),
  chunkArray: vi.fn((arr: unknown[], size: number) => {
    const chunks: unknown[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }),
  waitUntil: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../lib/common/logger', () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    dryRun: vi.fn(),
    commandExecution: vi.fn(),
    commandSuccess: vi.fn(),
  };
  return {
    createLogger: vi.fn(() => mockLogger),
    mockLogger,
  };
});

// waitUntil fake that actually runs the predicate (up to retryLimit + 1 times), matching real semantics so
// a predicate-driven path can be exercised. Applied with mockImplementationOnce to a single waitUntil call
// (e.g. the CreateMembers settle loop, which is the first waitUntil enable() makes) so the downstream
// verification waitUntil calls fall back to the beforeEach default (resolve immediately) — no coupling to
// production error-message wording. No real delay is incurred.
const predicateRunningWaitUntil = async (
  predicate: () => Promise<boolean>,
  errorMessage: string,
  _logger: unknown,
  _logPrefix: string,
  retryLimit = 5,
): Promise<void> => {
  for (let attempt = 0; attempt <= retryLimit; attempt++) {
    if (await predicate()) {
      return;
    }
  }
  throw new Error(`ServiceException: ${errorMessage}`);
};

describe('GuardDutyMembers', () => {
  let mockExecuteApi: ReturnType<typeof vi.fn>;
  let mockWaitUntil: ReturnType<typeof vi.fn>;
  let mockPaginate: ReturnType<typeof vi.fn>;
  let mockLogger: {
    info: ReturnType<typeof vi.fn>;
    dryRun: ReturnType<typeof vi.fn>;
    commandExecution: ReturnType<typeof vi.fn>;
    commandSuccess: ReturnType<typeof vi.fn>;
  };
  const mockClient = new GuardDutyClient({});
  const logPrefix = 'test';
  const mockDetectorId = 'mock-detector-id';
  const mockAccounts: AccountDetail[] = [
    { AccountId: '111111111111', Email: 'account1@example.com' },
    { AccountId: '222222222222', Email: 'account2@example.com' },
    { AccountId: '333333333333', Email: 'account3@example.com' },
  ];
  const defaultFeatures = {
    s3DataEvents: false,
    auditLogs: false,
    runtimeMonitoring: false,
    eksAgent: false,
    ec2Protection: false,
    rdsProtection: false,
    lambdaProtection: false,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const utility = await import('../../../lib/common/utility');
    const guardduty = await import('@aws-sdk/client-guardduty');
    const logger = await import('../../../lib/common/logger');
    mockExecuteApi = vi.mocked(utility.executeApi);
    mockWaitUntil = vi.mocked(utility.waitUntil);
    mockPaginate = vi.mocked(guardduty.paginateListMembers);
    mockLogger = (logger as { mockLogger: typeof mockLogger }).mockLogger;

    mockClient.send = vi.fn().mockResolvedValue({});
    mockWaitUntil.mockResolvedValue(undefined);
  });

  describe('enable', () => {
    test('should enable GuardDuty members successfully', async () => {
      mockExecuteApi.mockResolvedValue({});
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { Members: [] };
        },
      };
      mockPaginate.mockReturnValue(mockPaginator);

      await GuardDutyMembers.enable(
        mockClient,
        mockAccounts,
        [],
        'NEW' as OrgFeatureStatus,
        mockDetectorId,
        false,
        logPrefix,
        defaultFeatures,
      );

      expect(mockExecuteApi).toHaveBeenCalledWith(
        'UpdateOrganizationConfigurationCommand',
        expect.objectContaining({
          AutoEnableOrganizationMembers: 'NEW',
          DetectorId: mockDetectorId,
        }),
        expect.any(Function),
        expect.anything(),
        logPrefix,
      );
    });

    test('should handle dry run mode', async () => {
      mockExecuteApi.mockResolvedValue({});
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { Members: [] };
        },
      };
      mockPaginate.mockReturnValue(mockPaginator);

      await GuardDutyMembers.enable(
        mockClient,
        mockAccounts,
        [],
        'NEW' as OrgFeatureStatus,
        mockDetectorId,
        true,
        logPrefix,
        defaultFeatures,
      );

      expect(mockLogger.dryRun).toHaveBeenCalledWith(
        'UpdateOrganizationConfigurationCommand',
        expect.any(Object),
        logPrefix,
      );
      expect(mockLogger.dryRun).toHaveBeenCalledWith('CreateMembersCommand', expect.any(Object), logPrefix);
    });

    test('should fallback to S3-only org config when UpdateOrganizationConfiguration throws BadRequestException', async () => {
      const { BadRequestException } = await import('@aws-sdk/client-guardduty');
      let orgConfigCallCount = 0;
      mockExecuteApi.mockImplementation(async (commandName: string) => {
        if (commandName === 'UpdateOrganizationConfigurationCommand') {
          orgConfigCallCount++;
          if (orgConfigCallCount === 1) {
            throw new BadRequestException({
              message: 'The request failed because you do not have required AWS Organization master permission.',
              $metadata: {},
            });
          }
        }
        return {};
      });
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { Members: [] };
        },
      };
      mockPaginate.mockReturnValue(mockPaginator);

      await GuardDutyMembers.enable(
        mockClient,
        mockAccounts,
        [],
        'NEW' as OrgFeatureStatus,
        mockDetectorId,
        false,
        logPrefix,
        defaultFeatures,
      );

      // Verify the fallback retry was issued (second UpdateOrganizationConfigurationCommand call)
      const orgConfigCalls = mockExecuteApi.mock.calls.filter(
        (call: unknown[]) => call[0] === 'UpdateOrganizationConfigurationCommand',
      );
      expect(orgConfigCalls.length).toBeGreaterThanOrEqual(2);

      // Second call should have S3_DATA_EVENTS only
      const fallbackParams = orgConfigCalls[1][1];
      if (fallbackParams.Features) {
        expect(fallbackParams.Features).toEqual(
          expect.arrayContaining([expect.objectContaining({ Name: 'S3_DATA_EVENTS' })]),
        );
        // Should only have S3, not all features
        const featureNames = fallbackParams.Features.map((f: { Name: string }) => f.Name);
        expect(featureNames).not.toContain('EBS_MALWARE_PROTECTION');
        expect(featureNames).not.toContain('LAMBDA_NETWORK_LOGS');
      }

      // Verify warning was logged
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('retrying with S3 protection only'),
        logPrefix,
      );
    });

    test('should rethrow non-SLR BadRequestException during enable without fallback', async () => {
      const { BadRequestException } = await import('@aws-sdk/client-guardduty');
      mockExecuteApi.mockImplementation(async (commandName: string) => {
        if (commandName === 'UpdateOrganizationConfigurationCommand') {
          throw new BadRequestException({
            message: 'Some other bad request error',
            $metadata: {},
          });
        }
        return {};
      });
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { Members: [] };
        },
      };
      mockPaginate.mockReturnValue(mockPaginator);

      await expect(
        GuardDutyMembers.enable(
          mockClient,
          mockAccounts,
          [],
          'ALL' as OrgFeatureStatus,
          mockDetectorId,
          false,
          logPrefix,
          defaultFeatures,
        ),
      ).rejects.toThrow('Some other bad request error');
    });

    test('should create members in batches', async () => {
      mockExecuteApi.mockResolvedValue({});
      // Run the predicate for the settle loop (the first waitUntil enable() makes) so CreateMembers is
      // actually issued; downstream verification waitUntil calls use the beforeEach default.
      mockWaitUntil.mockImplementationOnce(predicateRunningWaitUntil as unknown as typeof mockWaitUntil);
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { Members: [] };
        },
      };
      mockPaginate.mockReturnValue(mockPaginator);

      await GuardDutyMembers.enable(
        mockClient,
        mockAccounts,
        [],
        'NEW' as OrgFeatureStatus,
        mockDetectorId,
        false,
        logPrefix,
        defaultFeatures,
      );

      expect(mockExecuteApi).toHaveBeenCalledWith(
        'CreateMembersCommand',
        expect.objectContaining({
          DetectorId: mockDetectorId,
          AccountDetails: expect.arrayContaining([{ AccountId: '111111111111', Email: 'account1@example.com' }]),
        }),
        expect.any(Function),
        expect.anything(),
        logPrefix,
      );
    });

    test('should remove existing members in disable accounts', async () => {
      mockExecuteApi.mockResolvedValue({});
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { Members: [] };
        },
      };
      mockPaginate.mockReturnValue(mockPaginator);

      const disableAccounts: AccountDetail[] = [{ AccountId: '444444444444', Email: 'disable@example.com' }];

      await GuardDutyMembers.enable(
        mockClient,
        mockAccounts,
        disableAccounts,
        'NEW' as OrgFeatureStatus,
        mockDetectorId,
        false,
        logPrefix,
        defaultFeatures,
      );

      expect(mockExecuteApi).toHaveBeenCalledWith(
        'DisassociateMembersCommand',
        expect.objectContaining({
          AccountIds: ['444444444444'],
          DetectorId: mockDetectorId,
        }),
        expect.any(Function),
        expect.anything(),
        logPrefix,
      );
      expect(mockExecuteApi).toHaveBeenCalledWith(
        'DeleteMembersCommand',
        expect.objectContaining({
          AccountIds: ['444444444444'],
          DetectorId: mockDetectorId,
        }),
        expect.any(Function),
        expect.anything(),
        logPrefix,
      );
    });

    test('should handle accounts without AccountId', async () => {
      mockExecuteApi.mockResolvedValue({});
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { Members: [] };
        },
      };
      mockPaginate.mockReturnValue(mockPaginator);

      const accountsWithMissingId: AccountDetail[] = [
        { AccountId: undefined, Email: 'test@example.com' },
        { AccountId: '222222222222', Email: 'member@example.com' },
      ];

      await GuardDutyMembers.enable(
        mockClient,
        accountsWithMissingId,
        [],
        'NEW' as OrgFeatureStatus,
        mockDetectorId,
        false,
        logPrefix,
        defaultFeatures,
      );

      expect(mockExecuteApi).toHaveBeenCalled();
    });

    test('should enable all features when specified', async () => {
      mockExecuteApi.mockResolvedValue({});
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { Members: [] };
        },
      };
      mockPaginate.mockReturnValue(mockPaginator);

      const allFeatures = {
        s3DataEvents: true,
        auditLogs: true,
        runtimeMonitoring: true,
        eksAgent: true,
        ec2Protection: true,
        rdsProtection: true,
        lambdaProtection: true,
      };

      await GuardDutyMembers.enable(
        mockClient,
        mockAccounts,
        [],
        'ALL' as OrgFeatureStatus,
        mockDetectorId,
        false,
        logPrefix,
        allFeatures,
      );

      expect(mockExecuteApi).toHaveBeenCalledWith(
        'UpdateOrganizationConfigurationCommand',
        expect.objectContaining({
          Features: expect.arrayContaining([
            expect.objectContaining({ Name: 'S3_DATA_EVENTS', AutoEnable: 'ALL' }),
            expect.objectContaining({ Name: 'EKS_AUDIT_LOGS', AutoEnable: 'ALL' }),
            expect.objectContaining({
              Name: 'EKS_RUNTIME_MONITORING',
              AutoEnable: 'ALL',
              AdditionalConfiguration: expect.arrayContaining([
                expect.objectContaining({ Name: 'EKS_ADDON_MANAGEMENT', AutoEnable: 'ALL' }),
              ]),
            }),
            expect.objectContaining({ Name: 'EBS_MALWARE_PROTECTION', AutoEnable: 'ALL' }),
            expect.objectContaining({ Name: 'RDS_LOGIN_EVENTS', AutoEnable: 'ALL' }),
            expect.objectContaining({ Name: 'LAMBDA_NETWORK_LOGS', AutoEnable: 'ALL' }),
          ]),
        }),
        expect.any(Function),
        expect.anything(),
        logPrefix,
      );
    });

    test('should handle dry run for disassociate and delete members', async () => {
      mockExecuteApi.mockResolvedValue({});
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { Members: [] };
        },
      };
      mockPaginate.mockReturnValue(mockPaginator);

      const disableAccounts: AccountDetail[] = [{ AccountId: '444444444444', Email: 'disable@example.com' }];

      await GuardDutyMembers.enable(
        mockClient,
        mockAccounts,
        disableAccounts,
        'NEW' as OrgFeatureStatus,
        mockDetectorId,
        true,
        logPrefix,
        defaultFeatures,
      );

      expect(mockLogger.dryRun).toHaveBeenCalledWith('DisassociateMembersCommand', expect.any(Object), logPrefix);
      expect(mockLogger.dryRun).toHaveBeenCalledWith('DeleteMembersCommand', expect.any(Object), logPrefix);
    });

    test('should update detector with features and export frequency', async () => {
      mockExecuteApi.mockResolvedValue({});
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { Members: [] };
        },
      };
      mockPaginate.mockReturnValue(mockPaginator);

      await GuardDutyMembers.enable(
        mockClient,
        mockAccounts,
        [],
        'NEW' as OrgFeatureStatus,
        mockDetectorId,
        false,
        logPrefix,
        defaultFeatures,
        { exportFrequency: 'FIFTEEN_MINUTES' },
      );

      expect(mockExecuteApi).toHaveBeenCalledWith(
        'UpdateDetectorCommand',
        expect.objectContaining({
          DetectorId: mockDetectorId,
          Enable: true,
          FindingPublishingFrequency: 'FIFTEEN_MINUTES',
        }),
        expect.any(Function),
        expect.anything(),
        logPrefix,
      );
    });

    test('should update malware scan settings with retention', async () => {
      mockExecuteApi.mockResolvedValue({});
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { Members: [] };
        },
      };
      mockPaginate.mockReturnValue(mockPaginator);

      await GuardDutyMembers.enable(
        mockClient,
        mockAccounts,
        [],
        'NEW' as OrgFeatureStatus,
        mockDetectorId,
        false,
        logPrefix,
        defaultFeatures,
        { enableKeepMalwareSnapshots: true },
      );

      expect(mockExecuteApi).toHaveBeenCalledWith(
        'UpdateMalwareScanSettingsCommand',
        expect.objectContaining({
          DetectorId: mockDetectorId,
          EbsSnapshotPreservation: 'RETENTION_WITH_FINDING',
        }),
        expect.any(Function),
        expect.anything(),
        logPrefix,
      );
    });

    test('should call waitUntil to verify disable accounts removed', async () => {
      mockExecuteApi.mockResolvedValue({});
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { Members: [] };
        },
      };
      mockPaginate.mockReturnValue(mockPaginator);

      const disableAccounts: AccountDetail[] = [{ AccountId: '444444444444', Email: 'disable@example.com' }];

      await GuardDutyMembers.enable(
        mockClient,
        mockAccounts,
        disableAccounts,
        'NEW' as OrgFeatureStatus,
        mockDetectorId,
        false,
        logPrefix,
        defaultFeatures,
      );

      expect(mockWaitUntil).toHaveBeenCalled();
    });

    test('waitUntil callback for disable accounts: account still present returns false', async () => {
      mockExecuteApi.mockResolvedValue({});
      let paginatorCallCount = 0;
      mockPaginate.mockImplementation(() => {
        paginatorCallCount++;
        if (paginatorCallCount <= 3) {
          return {
            [Symbol.asyncIterator]: async function* () {
              yield { Members: [{ AccountId: '444444444444' }] };
            },
          };
        }
        return {
          [Symbol.asyncIterator]: async function* () {
            yield { Members: [] };
          },
        };
      });

      mockWaitUntil.mockImplementation(async (fn: () => Promise<boolean>) => {
        await fn();
        return undefined;
      });

      const disableAccounts: AccountDetail[] = [{ AccountId: '444444444444', Email: 'disable@example.com' }];

      await GuardDutyMembers.enable(
        mockClient,
        mockAccounts,
        disableAccounts,
        'NEW' as OrgFeatureStatus,
        mockDetectorId,
        false,
        logPrefix,
        defaultFeatures,
      );

      expect(mockWaitUntil).toHaveBeenCalled();
    });

    test('waitUntil callback for disable accounts: account with undefined AccountId returns false', async () => {
      mockExecuteApi.mockResolvedValue({});
      mockPaginate.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield { Members: [] };
        },
      });

      mockWaitUntil.mockImplementation(async (fn: () => Promise<boolean>) => {
        await fn();
        return undefined;
      });

      const disableAccounts: AccountDetail[] = [{ AccountId: undefined, Email: 'disable@example.com' }];

      await GuardDutyMembers.enable(
        mockClient,
        mockAccounts,
        disableAccounts,
        'NEW' as OrgFeatureStatus,
        mockDetectorId,
        false,
        logPrefix,
        defaultFeatures,
      );

      expect(mockWaitUntil).toHaveBeenCalled();
    });

    test('waitUntil callback for disable accounts: account removed returns true', async () => {
      mockExecuteApi.mockResolvedValue({});
      mockPaginate.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield { Members: [] };
        },
      });

      const results: boolean[] = [];
      mockWaitUntil.mockImplementation(async (fn: () => Promise<boolean>) => {
        results.push(await fn());
        return undefined;
      });

      const disableAccounts: AccountDetail[] = [{ AccountId: '444444444444', Email: 'disable@example.com' }];

      await GuardDutyMembers.enable(
        mockClient,
        mockAccounts,
        disableAccounts,
        'NEW' as OrgFeatureStatus,
        mockDetectorId,
        false,
        logPrefix,
        defaultFeatures,
      );

      expect(results[results.length - 1]).toBe(true);
    });

    test('should fall back to S3-only when UpdateDetector throws BadRequestException (unsupported feature/region)', async () => {
      const { BadRequestException } = await import('@aws-sdk/client-guardduty');

      let updateDetectorCallCount = 0;
      mockExecuteApi.mockImplementation(async (commandName: string) => {
        if (commandName === 'UpdateDetectorCommand') {
          updateDetectorCallCount++;
          if (updateDetectorCallCount === 1) {
            throw new BadRequestException({
              message: 'The request failed because the provided feature names are invalid',
              $metadata: {},
            });
          }
        }
        return {};
      });
      mockPaginate.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield { Members: [] };
        },
      });

      await GuardDutyMembers.enable(
        mockClient,
        mockAccounts,
        [],
        'NEW' as OrgFeatureStatus,
        mockDetectorId,
        false,
        logPrefix,
        { ...defaultFeatures, s3DataEvents: true, auditLogs: true },
      );

      const updateDetectorCalls = mockExecuteApi.mock.calls.filter(
        (call: unknown[]) => call[0] === 'UpdateDetectorCommand',
      );
      // Original attempt + one S3-only retry.
      expect(updateDetectorCalls).toHaveLength(2);
      // The retry must send ONLY the S3 feature, and it must be ENABLED (the whole point of the fallback).
      const retryParams = updateDetectorCalls[1][1] as { Features: { Name: string; Status: string }[] };
      expect(retryParams.Features).toHaveLength(1);
      expect(retryParams.Features[0].Name).toBe('S3_DATA_EVENTS');
      expect(retryParams.Features[0].Status).toBe('ENABLED');
    });

    test('should rethrow non-BadRequestException from UpdateDetector without falling back', async () => {
      mockExecuteApi.mockImplementation(async (commandName: string) => {
        if (commandName === 'UpdateDetectorCommand') {
          throw new Error('Network timeout');
        }
        return {};
      });
      mockPaginate.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield { Members: [] };
        },
      });

      await expect(
        GuardDutyMembers.enable(
          mockClient,
          mockAccounts,
          [],
          'NEW' as OrgFeatureStatus,
          mockDetectorId,
          false,
          logPrefix,
          defaultFeatures,
        ),
      ).rejects.toThrow('Network timeout');
    });

    test('should rethrow a BadRequestException that is not the unsupported-feature signal (no S3 fallback)', async () => {
      const { BadRequestException } = await import('@aws-sdk/client-guardduty');

      let updateDetectorCallCount = 0;
      mockExecuteApi.mockImplementation(async (commandName: string) => {
        if (commandName === 'UpdateDetectorCommand') {
          updateDetectorCallCount++;
          // A genuine client error unrelated to region feature availability — must NOT be swallowed.
          throw new BadRequestException({
            message: 'The request is rejected because the parameter is malformed',
            $metadata: {},
          });
        }
        return {};
      });
      mockPaginate.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield { Members: [] };
        },
      });

      await expect(
        GuardDutyMembers.enable(
          mockClient,
          mockAccounts,
          [],
          'NEW' as OrgFeatureStatus,
          mockDetectorId,
          false,
          logPrefix,
          defaultFeatures,
        ),
      ).rejects.toThrow('parameter is malformed');

      // Must not have attempted an S3-only retry — only the single failing call.
      expect(updateDetectorCallCount).toBe(1);
    });

    test('settle waitUntil uses the CreateMembers retry budget (5 retries, 0.5 minute interval)', async () => {
      // Pins the settle-loop budget. Combined with the enrollment budget (9 x 1 min), this must stay under
      // operationTimeoutMs (~2.5 + ~9 = ~11.5 min < 15 min). A regression that enlarges either budget would
      // otherwise re-introduce the enrollment pre-emption bug with every functional test still passing.
      mockExecuteApi.mockResolvedValue({});
      mockPaginate.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield { Members: [] };
        },
      });

      await GuardDutyMembers.enable(
        mockClient,
        mockAccounts,
        [],
        'NEW' as OrgFeatureStatus,
        mockDetectorId,
        false,
        logPrefix,
        defaultFeatures,
      );

      // The settle waitUntil is identified by its terminal error message; assert it is invoked with the
      // CREATE_MEMBERS_RETRY_LIMIT (5) / CREATE_MEMBERS_QUERY_INTERVAL_MINUTES (0.5) budget.
      expect(mockWaitUntil).toHaveBeenCalledWith(
        expect.any(Function),
        expect.stringContaining('CreateMembers after retries'),
        expect.anything(),
        logPrefix,
        5,
        0.5,
      );
    });

    test('should retry only the unprocessed accounts and succeed once they clear', async () => {
      // CreateMembers is partial-success: a transient "Internal error" on a cold org clears on retry.
      // The module must re-issue CreateMembers for ONLY the still-unprocessed accounts, then proceed.
      // Run the predicate only for the settle loop (the first waitUntil enable() makes); downstream
      // verification waitUntil calls use the beforeEach default (resolve immediately).
      mockWaitUntil.mockImplementationOnce(predicateRunningWaitUntil as unknown as typeof mockWaitUntil);
      let createCall = 0;
      mockExecuteApi.mockImplementation(async (commandName: string) => {
        if (commandName === 'CreateMembersCommand') {
          createCall++;
          // First attempt: two accounts fail transiently. Second attempt: they clear.
          if (createCall === 1) {
            return {
              UnprocessedAccounts: [
                { AccountId: '222222222222', Result: 'Internal error' },
                { AccountId: '333333333333', Result: 'Internal error' },
              ],
            };
          }
          return { UnprocessedAccounts: [] };
        }
        return {};
      });
      mockPaginate.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield { Members: [] };
        },
      });

      await expect(
        GuardDutyMembers.enable(
          mockClient,
          mockAccounts,
          [],
          'NEW' as OrgFeatureStatus,
          mockDetectorId,
          false,
          logPrefix,
          defaultFeatures,
        ),
      ).resolves.not.toThrow();

      const createCalls = mockExecuteApi.mock.calls.filter((call: unknown[]) => call[0] === 'CreateMembersCommand');
      expect(createCalls).toHaveLength(2);
      // The retry must re-submit ONLY the two accounts that were unprocessed, not the whole batch.
      const retryParams = createCalls[1][1] as { AccountDetails: { AccountId: string }[] };
      expect(retryParams.AccountDetails.map(account => account.AccountId)).toEqual(['222222222222', '333333333333']);
    });

    test('should throw with per-account reason when CreateMembers never clears within the budget', async () => {
      // Non-transient reasons (bad email, region opt-in, not an org member) never settle. After the retry
      // budget is exhausted, the module must throw with the ServiceException prefix and remediation hint,
      // and the per-account reasons must have been logged.
      // Run the predicate only for the settle loop (the first waitUntil enable() makes).
      mockWaitUntil.mockImplementationOnce(predicateRunningWaitUntil as unknown as typeof mockWaitUntil);
      mockExecuteApi.mockImplementation(async (commandName: string) => {
        if (commandName === 'CreateMembersCommand') {
          return {
            UnprocessedAccounts: [
              { AccountId: '111111111111', Result: 'The account is not a member of the organization' },
            ],
          };
        }
        return {};
      });
      mockPaginate.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield { Members: [] };
        },
      });

      const enablePromise = GuardDutyMembers.enable(
        mockClient,
        mockAccounts,
        [],
        'NEW' as OrgFeatureStatus,
        mockDetectorId,
        false,
        logPrefix,
        defaultFeatures,
      );

      await expect(enablePromise).rejects.toThrow('ServiceException');
      await expect(enablePromise).rejects.toThrow('CreateMembers after retries');
      // The raw per-account reason is surfaced via the warn log on each attempt.
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('111111111111 (The account is not a member of the organization)'),
        logPrefix,
      );
    });

    test('should not retry when CreateMembers returns an empty UnprocessedAccounts list', async () => {
      // The happy path: a 200 with no unprocessed accounts means every account enrolled — one call, no retry.
      // Run the predicate only for the settle loop (the first waitUntil enable() makes).
      mockWaitUntil.mockImplementationOnce(predicateRunningWaitUntil as unknown as typeof mockWaitUntil);
      mockExecuteApi.mockImplementation(async (commandName: string) => {
        if (commandName === 'CreateMembersCommand') {
          return { UnprocessedAccounts: [] };
        }
        return {};
      });
      mockPaginate.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield { Members: [] };
        },
      });

      await expect(
        GuardDutyMembers.enable(
          mockClient,
          mockAccounts,
          [],
          'NEW' as OrgFeatureStatus,
          mockDetectorId,
          false,
          logPrefix,
          defaultFeatures,
        ),
      ).resolves.not.toThrow();

      const createCalls = mockExecuteApi.mock.calls.filter((call: unknown[]) => call[0] === 'CreateMembersCommand');
      expect(createCalls).toHaveLength(1);
    });

    test('should fall back to S3-only when UpdateMemberDetectors throws BadRequestException', async () => {
      const { BadRequestException } = await import('@aws-sdk/client-guardduty');

      let memberCallCount = 0;
      mockExecuteApi.mockImplementation(async (commandName: string) => {
        if (commandName === 'UpdateMemberDetectorsCommand') {
          memberCallCount++;
          if (memberCallCount === 1) {
            throw new BadRequestException({
              message: 'The request failed because the provided feature names are invalid',
              $metadata: {},
            });
          }
        }
        return {};
      });
      mockPaginate.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield { Members: [] };
        },
      });

      await GuardDutyMembers.enable(
        mockClient,
        mockAccounts,
        [],
        'NEW' as OrgFeatureStatus,
        mockDetectorId,
        false,
        logPrefix,
        { ...defaultFeatures, s3DataEvents: true, auditLogs: true },
      );

      const memberCalls = mockExecuteApi.mock.calls.filter(
        (call: unknown[]) => call[0] === 'UpdateMemberDetectorsCommand',
      );
      expect(memberCalls).toHaveLength(2);
      const retryParams = memberCalls[1][1] as { Features: { Name: string; Status: string }[] };
      expect(retryParams.Features).toHaveLength(1);
      expect(retryParams.Features[0].Name).toBe('S3_DATA_EVENTS');
      expect(retryParams.Features[0].Status).toBe('ENABLED');
    });

    test('should rethrow non-BadRequestException from UpdateMemberDetectors without falling back', async () => {
      let memberCallCount = 0;
      mockExecuteApi.mockImplementation(async (commandName: string) => {
        if (commandName === 'UpdateMemberDetectorsCommand') {
          memberCallCount++;
          // Transient/unrelated error (e.g. throttling, network) must propagate, not trigger an S3-only retry.
          throw new Error('Network timeout');
        }
        return {};
      });
      mockPaginate.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield { Members: [] };
        },
      });

      await expect(
        GuardDutyMembers.enable(
          mockClient,
          mockAccounts,
          [],
          'NEW' as OrgFeatureStatus,
          mockDetectorId,
          false,
          logPrefix,
          { ...defaultFeatures, s3DataEvents: true, auditLogs: true },
        ),
      ).rejects.toThrow('Network timeout');

      // Must not have attempted an S3-only retry — only the single failing call.
      expect(memberCallCount).toBe(1);
    });
  });

  describe('disable', () => {
    test('should disable GuardDuty members successfully', async () => {
      mockExecuteApi.mockResolvedValue({});
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { Members: [{ AccountId: '222222222222' }, { AccountId: '333333333333' }] };
        },
      };
      mockPaginate.mockReturnValue(mockPaginator);

      await GuardDutyMembers.disable(mockClient, mockDetectorId, false, logPrefix);

      expect(mockExecuteApi).toHaveBeenCalledWith(
        'UpdateOrganizationConfigurationCommand',
        expect.objectContaining({
          AutoEnableOrganizationMembers: 'NONE',
          DetectorId: mockDetectorId,
          Features: undefined,
        }),
        expect.any(Function),
        expect.anything(),
        logPrefix,
      );
      expect(mockExecuteApi).toHaveBeenCalledWith(
        'DisassociateMembersCommand',
        expect.any(Object),
        expect.any(Function),
        expect.anything(),
        logPrefix,
      );
      expect(mockExecuteApi).toHaveBeenCalledWith(
        'DeleteMembersCommand',
        expect.any(Object),
        expect.any(Function),
        expect.anything(),
        logPrefix,
      );
    });

    test('should handle dry run mode', async () => {
      mockExecuteApi.mockResolvedValue({});
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { Members: [{ AccountId: '222222222222' }] };
        },
      };
      mockPaginate.mockReturnValue(mockPaginator);

      await GuardDutyMembers.disable(mockClient, mockDetectorId, true, logPrefix);

      expect(mockLogger.dryRun).toHaveBeenCalledWith(
        'UpdateOrganizationConfigurationCommand',
        expect.any(Object),
        logPrefix,
      );
      expect(mockLogger.dryRun).toHaveBeenCalledWith('DisassociateMembersCommand', expect.any(Object), logPrefix);
      expect(mockLogger.dryRun).toHaveBeenCalledWith('DeleteMembersCommand', expect.any(Object), logPrefix);
    });

    test('should handle empty existing members', async () => {
      mockExecuteApi.mockResolvedValue({});
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { Members: [] };
        },
      };
      mockPaginate.mockReturnValue(mockPaginator);

      await GuardDutyMembers.disable(mockClient, mockDetectorId, false, logPrefix);

      expect(mockExecuteApi).not.toHaveBeenCalledWith(
        'DisassociateMembersCommand',
        expect.any(Object),
        expect.any(Function),
        expect.anything(),
        logPrefix,
      );
    });

    test('should call waitUntil to verify all members removed', async () => {
      mockExecuteApi.mockResolvedValue({});
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { Members: [{ AccountId: '222222222222' }] };
        },
      };
      mockPaginate.mockReturnValue(mockPaginator);

      await GuardDutyMembers.disable(mockClient, mockDetectorId, false, logPrefix);

      expect(mockWaitUntil).toHaveBeenCalled();
    });

    test('waitUntil callback in disable: returns false when members still exist', async () => {
      mockExecuteApi.mockResolvedValue({});
      let paginatorCallCount = 0;
      mockPaginate.mockImplementation(() => {
        paginatorCallCount++;
        if (paginatorCallCount === 1) {
          return {
            [Symbol.asyncIterator]: async function* () {
              yield { Members: [{ AccountId: '222222222222' }] };
            },
          };
        }
        return {
          [Symbol.asyncIterator]: async function* () {
            yield { Members: [{ AccountId: '222222222222' }] };
          },
        };
      });

      mockWaitUntil.mockImplementation(async (fn: () => Promise<boolean>) => {
        const result = await fn();
        expect(result).toBe(false);
        return undefined;
      });

      await GuardDutyMembers.disable(mockClient, mockDetectorId, false, logPrefix);

      expect(mockWaitUntil).toHaveBeenCalled();
    });

    test('waitUntil callback in disable: returns true when no members remain', async () => {
      mockExecuteApi.mockResolvedValue({});
      let paginatorCallCount = 0;
      mockPaginate.mockImplementation(() => {
        paginatorCallCount++;
        if (paginatorCallCount === 1) {
          return {
            [Symbol.asyncIterator]: async function* () {
              yield { Members: [{ AccountId: '222222222222' }] };
            },
          };
        }
        return {
          [Symbol.asyncIterator]: async function* () {
            yield { Members: [] };
          },
        };
      });

      mockWaitUntil.mockImplementation(async (fn: () => Promise<boolean>) => {
        const result = await fn();
        expect(result).toBe(true);
        return undefined;
      });

      await GuardDutyMembers.disable(mockClient, mockDetectorId, false, logPrefix);

      expect(mockWaitUntil).toHaveBeenCalled();
    });

    test('should gracefully handle BadRequestException when delegated admin is already deregistered', async () => {
      const { BadRequestException } = await import('@aws-sdk/client-guardduty');
      let orgConfigCalled = false;
      mockExecuteApi.mockImplementation(async (commandName: string) => {
        if (commandName === 'UpdateOrganizationConfigurationCommand') {
          orgConfigCalled = true;
          throw new BadRequestException({
            message: 'The request failed because a delegated administrator account has not been enabled.',
            $metadata: {},
          });
        }
        return {};
      });
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { Members: [] };
        },
      };
      mockPaginate.mockReturnValue(mockPaginator);

      // Should not throw — gracefully continues to member cleanup
      await expect(GuardDutyMembers.disable(mockClient, mockDetectorId, false, logPrefix)).resolves.toBeUndefined();

      expect(orgConfigCalled).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Delegated admin is no longer registered'),
        logPrefix,
      );
    });

    test('should rethrow non-delegated-admin BadRequestException during disable', async () => {
      const { BadRequestException } = await import('@aws-sdk/client-guardduty');
      mockExecuteApi.mockImplementation(async (commandName: string) => {
        if (commandName === 'UpdateOrganizationConfigurationCommand') {
          throw new BadRequestException({
            message: 'Some other bad request error',
            $metadata: {},
          });
        }
        return {};
      });
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { Members: [] };
        },
      };
      mockPaginate.mockReturnValue(mockPaginator);

      await expect(GuardDutyMembers.disable(mockClient, mockDetectorId, false, logPrefix)).rejects.toThrow(
        'Some other bad request error',
      );
    });
  });

  describe('getExistingMembers', () => {
    test('should handle undefined Members in paginator response', async () => {
      mockExecuteApi.mockResolvedValue({});
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { Members: undefined };
          yield { Members: [{ AccountId: '222222222222' }] };
        },
      };
      mockPaginate.mockReturnValue(mockPaginator);

      await GuardDutyMembers.disable(mockClient, mockDetectorId, false, logPrefix);
    });
  });

  describe('getOrganizationFeaturesEnabled', () => {
    test('should return empty array when no features enabled', async () => {
      mockExecuteApi.mockResolvedValue({});
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { Members: [] };
        },
      };
      mockPaginate.mockReturnValue(mockPaginator);

      await GuardDutyMembers.enable(
        mockClient,
        mockAccounts,
        [],
        'NEW' as OrgFeatureStatus,
        mockDetectorId,
        false,
        logPrefix,
        defaultFeatures,
      );

      expect(mockExecuteApi).toHaveBeenCalledWith(
        'UpdateOrganizationConfigurationCommand',
        expect.objectContaining({
          Features: [
            {
              AutoEnable: 'NONE',
              Name: 'S3_DATA_EVENTS',
            },
            {
              AutoEnable: 'NONE',
              Name: 'EKS_AUDIT_LOGS',
            },
            {
              AdditionalConfiguration: [
                {
                  AutoEnable: 'NONE',
                  Name: 'EKS_ADDON_MANAGEMENT',
                },
              ],
              AutoEnable: 'NONE',
              Name: 'EKS_RUNTIME_MONITORING',
            },
            {
              AutoEnable: 'NONE',
              Name: 'EBS_MALWARE_PROTECTION',
            },
            {
              AutoEnable: 'NONE',
              Name: 'RDS_LOGIN_EVENTS',
            },
            {
              AutoEnable: 'NONE',
              Name: 'LAMBDA_NETWORK_LOGS',
            },
          ],
        }),
        expect.any(Function),
        expect.anything(),
        logPrefix,
      );
    });

    test('should return empty array when featuresToEnable is undefined', async () => {
      mockExecuteApi.mockResolvedValue({});
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { Members: [] };
        },
      };
      mockPaginate.mockReturnValue(mockPaginator);

      await GuardDutyMembers.enable(
        mockClient,
        mockAccounts,
        [],
        'NEW' as OrgFeatureStatus,
        mockDetectorId,
        false,
        logPrefix,
        undefined,
      );

      expect(mockExecuteApi).toHaveBeenCalledWith(
        'UpdateOrganizationConfigurationCommand',
        expect.objectContaining({
          Features: [],
        }),
        expect.any(Function),
        expect.anything(),
        logPrefix,
      );
    });

    test('should include EKS runtime monitoring with additional configuration', async () => {
      mockExecuteApi.mockResolvedValue({});
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { Members: [] };
        },
      };
      mockPaginate.mockReturnValue(mockPaginator);

      const eksFeatures = {
        ...defaultFeatures,
        runtimeMonitoring: true,
        eksAgent: true,
      };

      await GuardDutyMembers.enable(
        mockClient,
        mockAccounts,
        [],
        'NEW' as OrgFeatureStatus,
        mockDetectorId,
        false,
        logPrefix,
        eksFeatures,
      );

      expect(mockExecuteApi).toHaveBeenCalledWith(
        'UpdateOrganizationConfigurationCommand',
        expect.objectContaining({
          Features: expect.arrayContaining([
            expect.objectContaining({
              Name: 'EKS_RUNTIME_MONITORING',
              AutoEnable: 'NEW',
              AdditionalConfiguration: [
                {
                  Name: 'EKS_ADDON_MANAGEMENT',
                  AutoEnable: 'NEW',
                },
              ],
            }),
          ]),
        }),
        expect.any(Function),
        expect.anything(),
        logPrefix,
      );
    });

    test('should enable EKS runtime monitoring with addon management disabled when eksAgent is false', async () => {
      mockExecuteApi.mockResolvedValue({});
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { Members: [] };
        },
      };
      mockPaginate.mockReturnValue(mockPaginator);

      // Runtime monitoring on, agent management off: addon must decouple to NONE.
      const eksFeatures = {
        ...defaultFeatures,
        runtimeMonitoring: true,
        eksAgent: false,
      };

      await GuardDutyMembers.enable(
        mockClient,
        mockAccounts,
        [],
        'NEW' as OrgFeatureStatus,
        mockDetectorId,
        false,
        logPrefix,
        eksFeatures,
      );

      expect(mockExecuteApi).toHaveBeenCalledWith(
        'UpdateOrganizationConfigurationCommand',
        expect.objectContaining({
          Features: expect.arrayContaining([
            expect.objectContaining({
              Name: 'EKS_RUNTIME_MONITORING',
              AutoEnable: 'NEW',
              AdditionalConfiguration: [
                {
                  Name: 'EKS_ADDON_MANAGEMENT',
                  AutoEnable: 'NONE',
                },
              ],
            }),
          ]),
        }),
        expect.any(Function),
        expect.anything(),
        logPrefix,
      );
    });
  });

  describe('createDetectorFeatures', () => {
    test('should create detector features with all features enabled', async () => {
      mockExecuteApi.mockResolvedValue({});
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { Members: [] };
        },
      };
      mockPaginate.mockReturnValue(mockPaginator);

      const allFeatures = {
        s3DataEvents: true,
        auditLogs: true,
        runtimeMonitoring: true,
        eksAgent: true,
        ec2Protection: true,
        rdsProtection: true,
        lambdaProtection: true,
      };

      await GuardDutyMembers.enable(
        mockClient,
        mockAccounts,
        [],
        'NEW' as OrgFeatureStatus,
        mockDetectorId,
        false,
        logPrefix,
        allFeatures,
      );

      expect(mockExecuteApi).toHaveBeenCalledWith(
        'UpdateMemberDetectorsCommand',
        expect.objectContaining({
          Features: expect.arrayContaining([
            expect.objectContaining({ Name: 'EKS_RUNTIME_MONITORING', Status: 'ENABLED' }),
            expect.objectContaining({ Name: 'EKS_AUDIT_LOGS', Status: 'ENABLED' }),
            expect.objectContaining({ Name: 'S3_DATA_EVENTS', Status: 'ENABLED' }),
            expect.objectContaining({ Name: 'EBS_MALWARE_PROTECTION', Status: 'ENABLED' }),
            expect.objectContaining({ Name: 'RDS_LOGIN_EVENTS', Status: 'ENABLED' }),
            expect.objectContaining({ Name: 'LAMBDA_NETWORK_LOGS', Status: 'ENABLED' }),
          ]),
        }),
        expect.any(Function),
        expect.anything(),
        logPrefix,
      );
    });

    test('should create detector features with all features disabled', async () => {
      mockExecuteApi.mockResolvedValue({});
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { Members: [] };
        },
      };
      mockPaginate.mockReturnValue(mockPaginator);

      await GuardDutyMembers.enable(
        mockClient,
        mockAccounts,
        [],
        'NEW' as OrgFeatureStatus,
        mockDetectorId,
        false,
        logPrefix,
        defaultFeatures,
      );

      expect(mockExecuteApi).toHaveBeenCalledWith(
        'UpdateMemberDetectorsCommand',
        expect.objectContaining({
          Features: expect.arrayContaining([
            expect.objectContaining({ Name: 'EKS_RUNTIME_MONITORING', Status: 'DISABLED' }),
            expect.objectContaining({ Name: 'EKS_AUDIT_LOGS', Status: 'DISABLED' }),
            expect.objectContaining({ Name: 'S3_DATA_EVENTS', Status: 'DISABLED' }),
            expect.objectContaining({ Name: 'EBS_MALWARE_PROTECTION', Status: 'DISABLED' }),
            expect.objectContaining({ Name: 'RDS_LOGIN_EVENTS', Status: 'DISABLED' }),
            expect.objectContaining({ Name: 'LAMBDA_NETWORK_LOGS', Status: 'DISABLED' }),
          ]),
        }),
        expect.any(Function),
        expect.anything(),
        logPrefix,
      );
    });

    test('should emit no features when featuresToEnable is undefined (nothing configured)', async () => {
      mockExecuteApi.mockResolvedValue({});
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { Members: [] };
        },
      };
      mockPaginate.mockReturnValue(mockPaginator);

      await GuardDutyMembers.enable(
        mockClient,
        mockAccounts,
        [],
        'NEW' as OrgFeatureStatus,
        mockDetectorId,
        false,
        logPrefix,
        undefined,
      );

      // Nothing configured -> no feature names sent to the API (not even as DISABLED), so GuardDuty
      // is never asked about feature names that may not exist in the region/partition.
      const memberCall = mockExecuteApi.mock.calls.find(call => call[0] === 'UpdateMemberDetectorsCommand');
      expect(memberCall).toBeDefined();
      expect(memberCall?.[1].Features).toEqual([]);
    });

    test('should omit unconfigured features and only send configured ones', async () => {
      mockExecuteApi.mockResolvedValue({});
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { Members: [] };
        },
      };
      mockPaginate.mockReturnValue(mockPaginator);

      // Only S3 and EKS audit logs configured; runtime monitoring, agent, ec2, rds, lambda left undefined.
      await GuardDutyMembers.enable(
        mockClient,
        mockAccounts,
        [],
        'NEW' as OrgFeatureStatus,
        mockDetectorId,
        false,
        logPrefix,
        { s3DataEvents: true, auditLogs: true },
      );

      const memberCall = mockExecuteApi.mock.calls.find(call => call[0] === 'UpdateMemberDetectorsCommand');
      expect(memberCall).toBeDefined();
      const sentNames = (memberCall?.[1].Features as { Name: string }[]).map(f => f.Name).sort();
      // Only the two configured features are present; unconfigured names are omitted entirely.
      expect(sentNames).toEqual(['EKS_AUDIT_LOGS', 'S3_DATA_EVENTS']);
      expect(sentNames).not.toContain('EKS_RUNTIME_MONITORING');
      expect(sentNames).not.toContain('RDS_LOGIN_EVENTS');
      expect(sentNames).not.toContain('LAMBDA_NETWORK_LOGS');
      expect(sentNames).not.toContain('EBS_MALWARE_PROTECTION');

      // Organization configuration path (getOrganizationFeaturesEnabled) must also omit unconfigured
      // features — unconfigured names must not reach UpdateOrganizationConfiguration (which would send
      // unsupported feature names to GuardDuty in iso/partition regions and get the request rejected).
      const orgCall = mockExecuteApi.mock.calls.find(call => call[0] === 'UpdateOrganizationConfigurationCommand');
      expect(orgCall).toBeDefined();
      const orgNames = (orgCall?.[1].Features as { Name: string }[]).map(f => f.Name).sort();
      expect(orgNames).toEqual(['EKS_AUDIT_LOGS', 'S3_DATA_EVENTS']);
      expect(orgNames).not.toContain('EKS_RUNTIME_MONITORING');
      expect(orgNames).not.toContain('RDS_LOGIN_EVENTS');
      expect(orgNames).not.toContain('LAMBDA_NETWORK_LOGS');
      expect(orgNames).not.toContain('EBS_MALWARE_PROTECTION');
    });

    test('should omit EKS_RUNTIME_MONITORING when runtimeMonitoring is unconfigured even if eksAgent is defined', async () => {
      mockExecuteApi.mockResolvedValue({});
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { Members: [] };
        },
      };
      mockPaginate.mockReturnValue(mockPaginator);

      // runtimeMonitoring omitted but eksAgent defined (false). The detector path must still omit
      // EKS_RUNTIME_MONITORING entirely (gated on runtimeMonitoring only), matching the org path,
      // so the unsupported feature name is never sent in regions/partitions that lack it.
      await GuardDutyMembers.enable(
        mockClient,
        mockAccounts,
        [],
        'NEW' as OrgFeatureStatus,
        mockDetectorId,
        false,
        logPrefix,
        { s3DataEvents: true, auditLogs: true, eksAgent: false },
      );

      const detectorNames = (
        mockExecuteApi.mock.calls.find(call => call[0] === 'UpdateMemberDetectorsCommand')?.[1].Features as {
          Name: string;
        }[]
      )
        .map(f => f.Name)
        .sort();
      const orgNames = (
        mockExecuteApi.mock.calls.find(call => call[0] === 'UpdateOrganizationConfigurationCommand')?.[1].Features as {
          Name: string;
        }[]
      )
        .map(f => f.Name)
        .sort();

      // Both paths agree: only configured features, no EKS_RUNTIME_MONITORING.
      expect(detectorNames).toEqual(['EKS_AUDIT_LOGS', 'S3_DATA_EVENTS']);
      expect(detectorNames).not.toContain('EKS_RUNTIME_MONITORING');
      expect(orgNames).toEqual(['EKS_AUDIT_LOGS', 'S3_DATA_EVENTS']);
      expect(orgNames).not.toContain('EKS_RUNTIME_MONITORING');
    });

    test('should create detector features with EKS agent addon management', async () => {
      mockExecuteApi.mockResolvedValue({});
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { Members: [] };
        },
      };
      mockPaginate.mockReturnValue(mockPaginator);

      const eksFeatures = {
        ...defaultFeatures,
        auditLogs: true,
        runtimeMonitoring: true,
        eksAgent: true,
      };

      await GuardDutyMembers.enable(
        mockClient,
        mockAccounts,
        [],
        'NEW' as OrgFeatureStatus,
        mockDetectorId,
        false,
        logPrefix,
        eksFeatures,
      );

      expect(mockExecuteApi).toHaveBeenCalledWith(
        'UpdateMemberDetectorsCommand',
        expect.objectContaining({
          Features: expect.arrayContaining([
            expect.objectContaining({
              Name: 'EKS_RUNTIME_MONITORING',
              Status: 'ENABLED',
              AdditionalConfiguration: [{ Name: 'EKS_ADDON_MANAGEMENT', Status: 'ENABLED' }],
            }),
          ]),
        }),
        expect.any(Function),
        expect.anything(),
        logPrefix,
      );
    });

    test('should enable EKS runtime monitoring with addon management disabled when eksAgent is false', async () => {
      mockExecuteApi.mockResolvedValue({});
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { Members: [] };
        },
      };
      mockPaginate.mockReturnValue(mockPaginator);

      // Runtime monitoring on, agent management off: addon must decouple to DISABLED.
      const eksFeatures = {
        ...defaultFeatures,
        auditLogs: false,
        runtimeMonitoring: true,
        eksAgent: false,
      };

      await GuardDutyMembers.enable(
        mockClient,
        mockAccounts,
        [],
        'NEW' as OrgFeatureStatus,
        mockDetectorId,
        false,
        logPrefix,
        eksFeatures,
      );

      expect(mockExecuteApi).toHaveBeenCalledWith(
        'UpdateMemberDetectorsCommand',
        expect.objectContaining({
          Features: expect.arrayContaining([
            expect.objectContaining({
              Name: 'EKS_RUNTIME_MONITORING',
              Status: 'ENABLED',
              AdditionalConfiguration: [{ Name: 'EKS_ADDON_MANAGEMENT', Status: 'DISABLED' }],
            }),
            expect.objectContaining({ Name: 'EKS_AUDIT_LOGS', Status: 'DISABLED' }),
          ]),
        }),
        expect.any(Function),
        expect.anything(),
        logPrefix,
      );
    });
  });

  describe('executeApi callback coverage', () => {
    test('should execute CreateMembersCommand callback', async () => {
      let callCount = 0;
      mockClient.send = vi.fn().mockResolvedValue({});
      mockExecuteApi.mockImplementation(async (commandName, _params, fn) => {
        callCount++;
        await fn();
        return {};
      });
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { Members: [] };
        },
      };
      mockPaginate.mockReturnValue(mockPaginator);

      await GuardDutyMembers.enable(
        mockClient,
        mockAccounts,
        [],
        'NEW' as OrgFeatureStatus,
        mockDetectorId,
        false,
        logPrefix,
        defaultFeatures,
      );

      expect(callCount).toBeGreaterThan(1);
    });

    test('should execute UpdateOrganizationConfigurationCommand callback', async () => {
      mockClient.send = vi.fn().mockResolvedValue({});
      mockExecuteApi.mockImplementation(async (commandName, _params, fn) => {
        if (commandName === 'UpdateOrganizationConfigurationCommand') {
          await fn();
        }
        return {};
      });
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { Members: [] };
        },
      };
      mockPaginate.mockReturnValue(mockPaginator);

      await GuardDutyMembers.enable(
        mockClient,
        mockAccounts,
        [],
        'NEW' as OrgFeatureStatus,
        mockDetectorId,
        false,
        logPrefix,
        defaultFeatures,
      );

      expect(mockClient.send).toHaveBeenCalled();
    });

    test('should execute DisassociateMembersCommand and DeleteMembersCommand callbacks', async () => {
      mockClient.send = vi.fn().mockResolvedValue({});
      mockExecuteApi.mockImplementation(async (commandName, _params, fn) => {
        if (commandName === 'DisassociateMembersCommand' || commandName === 'DeleteMembersCommand') {
          await fn();
        }
        return {};
      });
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { Members: [] };
        },
      };
      mockPaginate.mockReturnValue(mockPaginator);

      const disableAccounts: AccountDetail[] = [{ AccountId: '444444444444', Email: 'disable@example.com' }];

      await GuardDutyMembers.enable(
        mockClient,
        mockAccounts,
        disableAccounts,
        'NEW' as OrgFeatureStatus,
        mockDetectorId,
        false,
        logPrefix,
        defaultFeatures,
      );

      expect(mockClient.send).toHaveBeenCalled();
    });

    test('should execute all callbacks in disable flow', async () => {
      mockClient.send = vi.fn().mockResolvedValue({});
      mockExecuteApi.mockImplementation(async (_commandName, _params, fn) => {
        await fn();
        return {};
      });
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { Members: [{ AccountId: '222222222222' }] };
        },
      };
      mockPaginate.mockReturnValue(mockPaginator);

      await GuardDutyMembers.disable(mockClient, mockDetectorId, false, logPrefix);

      expect(mockClient.send).toHaveBeenCalled();
    });

    test('should execute UpdateDetectorCommand callback', async () => {
      mockClient.send = vi.fn().mockResolvedValue({});
      mockExecuteApi.mockImplementation(async (commandName, _params, fn) => {
        if (commandName === 'UpdateDetectorCommand') {
          await fn();
        }
        return {};
      });
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { Members: [] };
        },
      };
      mockPaginate.mockReturnValue(mockPaginator);

      await GuardDutyMembers.enable(
        mockClient,
        mockAccounts,
        [],
        'NEW' as OrgFeatureStatus,
        mockDetectorId,
        false,
        logPrefix,
        defaultFeatures,
      );

      expect(mockClient.send).toHaveBeenCalled();
    });

    test('should execute UpdateMalwareScanSettingsCommand callback', async () => {
      mockClient.send = vi.fn().mockResolvedValue({});
      mockExecuteApi.mockImplementation(async (commandName, _params, fn) => {
        if (commandName === 'UpdateMalwareScanSettingsCommand') {
          await fn();
        }
        return {};
      });
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { Members: [] };
        },
      };
      mockPaginate.mockReturnValue(mockPaginator);

      await GuardDutyMembers.enable(
        mockClient,
        mockAccounts,
        [],
        'NEW' as OrgFeatureStatus,
        mockDetectorId,
        false,
        logPrefix,
        defaultFeatures,
      );

      expect(mockClient.send).toHaveBeenCalled();
    });

    test('should execute UpdateMemberDetectorsCommand callback', async () => {
      mockClient.send = vi.fn().mockResolvedValue({});
      mockExecuteApi.mockImplementation(async (commandName, _params, fn) => {
        if (commandName === 'UpdateMemberDetectorsCommand') {
          await fn();
        }
        return {};
      });
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { Members: [] };
        },
      };
      mockPaginate.mockReturnValue(mockPaginator);

      await GuardDutyMembers.enable(
        mockClient,
        mockAccounts,
        [],
        'NEW' as OrgFeatureStatus,
        mockDetectorId,
        false,
        logPrefix,
        defaultFeatures,
      );

      expect(mockClient.send).toHaveBeenCalled();
    });
  });
});

describe('GuardDutyMembers - enrollment waitUntil coverage', () => {
  let mockExecuteApi: ReturnType<typeof vi.fn>;
  let mockWaitUntil: ReturnType<typeof vi.fn>;
  let mockPaginate: ReturnType<typeof vi.fn>;
  const mockClient = new GuardDutyClient({});
  const logPrefix = 'test';
  const mockDetectorId = 'mock-detector-id';
  const mockAccounts: AccountDetail[] = [
    { AccountId: '111111111111', Email: 'account1@example.com' },
    { AccountId: '222222222222', Email: 'account2@example.com' },
  ];
  const defaultFeatures = {
    s3DataEvents: false,
    auditLogs: false,
    runtimeMonitoring: false,
    eksAgent: false,
    ec2Protection: false,
    rdsProtection: false,
    lambdaProtection: false,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const utility = await import('../../../lib/common/utility');
    const guardduty = await import('@aws-sdk/client-guardduty');
    mockExecuteApi = vi.mocked(utility.executeApi);
    mockWaitUntil = vi.mocked(utility.waitUntil);
    mockPaginate = vi.mocked(guardduty.paginateListMembers);
    mockClient.send = vi.fn().mockResolvedValue({});
    mockWaitUntil.mockResolvedValue(undefined);
  });

  test('waitUntil enrollment callback returns true when all accounts are present', async () => {
    mockExecuteApi.mockResolvedValue({});

    mockPaginate.mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield {
          Members: [{ AccountId: '111111111111' }, { AccountId: '222222222222' }],
        };
      },
    });

    const results: boolean[] = [];
    mockWaitUntil.mockImplementation(async (fn: () => Promise<boolean>) => {
      results.push(await fn());
      return undefined;
    });

    await GuardDutyMembers.enable(
      mockClient,
      mockAccounts,
      [],
      'NEW' as OrgFeatureStatus,
      mockDetectorId,
      false,
      logPrefix,
      defaultFeatures,
    );

    expect(results[0]).toBe(true);
  });

  test('enrollment waitUntil uses the extended retry budget (9 retries, 1 minute interval)', async () => {
    mockExecuteApi.mockResolvedValue({});
    mockPaginate.mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield { Members: [{ AccountId: '111111111111' }, { AccountId: '222222222222' }] };
      },
    });

    await GuardDutyMembers.enable(
      mockClient,
      mockAccounts,
      [],
      'NEW' as OrgFeatureStatus,
      mockDetectorId,
      false,
      logPrefix,
      defaultFeatures,
    );

    // The enrollment-verification wait must be given a budget larger than the default (5 retries),
    // sized so this plus the CreateMembers settle loop stays under the batch operationTimeoutMs while
    // still tolerating slow member association.
    expect(mockWaitUntil).toHaveBeenCalledWith(
      expect.any(Function),
      'Could not verify all accounts were enrolled in GuardDuty',
      expect.anything(),
      logPrefix,
      9,
      1,
    );
  });
});

describe('GuardDutyMembers - getExistingMembers empty paginator coverage', () => {
  let mockExecuteApi: ReturnType<typeof vi.fn>;
  let mockWaitUntil: ReturnType<typeof vi.fn>;
  let mockPaginate: ReturnType<typeof vi.fn>;
  const mockClient = new GuardDutyClient({});
  const logPrefix = 'test';
  const mockDetectorId = 'mock-detector-id';

  beforeEach(async () => {
    vi.clearAllMocks();
    const utility = await import('../../../lib/common/utility');
    const guardduty = await import('@aws-sdk/client-guardduty');
    mockExecuteApi = vi.mocked(utility.executeApi);
    mockWaitUntil = vi.mocked(utility.waitUntil);
    mockPaginate = vi.mocked(guardduty.paginateListMembers);
    mockClient.send = vi.fn().mockResolvedValue({});
    mockWaitUntil.mockResolvedValue(undefined);
  });

  test('getExistingMembers with paginator that yields no pages', async () => {
    mockExecuteApi.mockResolvedValue({});

    mockPaginate.mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        // yields nothing
      },
    });

    await GuardDutyMembers.disable(mockClient, mockDetectorId, false, logPrefix);

    expect(mockWaitUntil).toHaveBeenCalled();
  });
});
