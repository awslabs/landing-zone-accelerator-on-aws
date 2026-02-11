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
import { describe, beforeEach, afterEach, expect, test, vi } from 'vitest';

import {
  BaselineOperationStatus,
  ControlTowerClient,
  EnabledBaselineDriftStatus,
  EnablementStatus,
  GetBaselineOperationCommand,
  paginateListEnabledBaselines,
  ResetEnabledBaselineCommand,
} from '@aws-sdk/client-controltower';

import { EnrollAccountsModule } from '../../../../lib/control-tower/enroll-accounts/index';
import { MOCK_CONSTANTS } from '../../../mocked-resources';
import { MODULE_EXCEPTIONS } from '../../../../common/enums';
import { IEnrollAccountsHandlerParameter } from '../../../../interfaces/control-tower/enroll-accounts';

// Mock dependencies
vi.mock('@aws-sdk/client-controltower', () => {
  return {
    BaselineOperationStatus: {
      IN_PROGRESS: 'IN_PROGRESS',
      SUCCEEDED: 'SUCCEEDED',
      FAILED: 'FAILED',
    },
    ControlTowerClient: vi.fn(),
    paginateListEnabledBaselines: vi.fn(),
    ResetEnabledBaselineCommand: vi.fn(),
    GetBaselineOperationCommand: vi.fn(),
    EnablementStatus: {
      SUCCEEDED: 'SUCCEEDED',
      FAILED: 'FAILED',
      UNDER_CHANGE: 'UNDER_CHANGE',
    },
    EnabledBaselineDriftStatus: {
      DRIFTED: 'DRIFTED',
      IN_SYNC: 'IN_SYNC',
    },
  };
});

vi.mock('../../../../common/functions', async () => {
  const actual = await vi.importActual('../../../../common/functions');
  return {
    ...actual,
    delay: vi.fn().mockResolvedValue(undefined),
    getLandingZoneIdentifier: vi.fn(),
  };
});

// Test ARNs with realistic format so getIdFromArn can extract IDs
const OU_TARGET_ARN = 'arn:aws:organizations::123456789012:ou/o-abc123/ou-g2dm-6xseqdih';
const OU_BASELINE_ARN = 'arn:aws:controltower:us-east-1:123456789012:enabledbaseline/XONE9V7UZYD6NNTYW';
const ACCOUNT_TARGET_ARN_1 = 'arn:aws:organizations::123456789012:account/o-abc123/111111111111';
const ACCOUNT_TARGET_ARN_2 = 'arn:aws:organizations::123456789012:account/o-abc123/222222222222';
const ACCOUNT_BASELINE_ARN_1 = 'arn:aws:controltower:us-east-1:123456789012:enabledbaseline/XAE8ALI9U7D6NNYX7';
const ACCOUNT_BASELINE_ARN_2 = 'arn:aws:controltower:us-east-1:123456789012:enabledbaseline/XAFWYNFRXGD6NNYWB';
const MOCK_OPERATION_ID = 'mock-operation-id';
const MOCK_ACCOUNT_OPERATION_ID = 'mock-account-operation-id';

function makeOuBaseline(overrides?: Record<string, unknown>) {
  return {
    arn: OU_BASELINE_ARN,
    baselineIdentifier: 'mockBaselineIdentifier',
    targetIdentifier: OU_TARGET_ARN,
    baselineVersion: '5.0',
    statusSummary: { status: EnablementStatus.SUCCEEDED },
    driftStatusSummary: { types: { inheritance: { status: EnabledBaselineDriftStatus.IN_SYNC } } },
    ...overrides,
  };
}

function makeAccountBaseline(targetArn: string, baselineArn: string, overrides?: Record<string, unknown>) {
  return {
    arn: baselineArn,
    baselineIdentifier: 'mockBaselineIdentifier',
    targetIdentifier: targetArn,
    baselineVersion: '5.0',
    parentIdentifier: OU_BASELINE_ARN,
    statusSummary: { status: EnablementStatus.SUCCEEDED },
    ...overrides,
  };
}

describe('EnrollAccountsModule', () => {
  const mockSend = vi.fn();
  let getLandingZoneIdentifierSpy: vi.SpyInstance;

  const input: IEnrollAccountsHandlerParameter = {
    configuration: {},
    ...MOCK_CONSTANTS.runnerParameters,
  };

  const dryRunInput: IEnrollAccountsHandlerParameter = {
    ...input,
    dryRun: true,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    delete process.env['ENROLL_ACCOUNTS_TIMEOUT_IN_MINUTES'];

    (ControlTowerClient as vi.Mock).mockImplementation(() => ({
      send: mockSend,
    }));

    mockSend.mockImplementation(command => {
      if (command instanceof ResetEnabledBaselineCommand) {
        return Promise.resolve({ operationIdentifier: MOCK_OPERATION_ID });
      }
      if (command instanceof GetBaselineOperationCommand) {
        return Promise.resolve({ baselineOperation: { status: BaselineOperationStatus.SUCCEEDED } });
      }
      return Promise.reject(MOCK_CONSTANTS.unknownError);
    });

    const commonFunctions = await import('../../../../common/functions');
    getLandingZoneIdentifierSpy = vi.mocked(commonFunctions.getLandingZoneIdentifier);
    getLandingZoneIdentifierSpy.mockResolvedValue('mockLandingZoneArn');

    // Default: no baselines
    (paginateListEnabledBaselines as vi.Mock).mockImplementation(() => [{ enabledBaselines: [] }]);
  });

  afterEach(() => {
    delete process.env['ENROLL_ACCOUNTS_TIMEOUT_IN_MINUTES'];
  });

  describe('Live Execution', () => {
    test('should return no action needed when no baselines need changes', async () => {
      (paginateListEnabledBaselines as vi.Mock).mockImplementation(() => [
        {
          enabledBaselines: [makeOuBaseline(), makeAccountBaseline(ACCOUNT_TARGET_ARN_1, ACCOUNT_BASELINE_ARN_1)],
        },
      ]);

      const response = await new EnrollAccountsModule().handler(input);

      expect(response).toContain('No action needed');
      expect(ResetEnabledBaselineCommand).toHaveBeenCalledTimes(0);
    });

    test('should reset drifted OU baseline and wait for completion', async () => {
      (paginateListEnabledBaselines as vi.Mock).mockImplementation(() => [
        {
          enabledBaselines: [
            makeOuBaseline({
              driftStatusSummary: { types: { inheritance: { status: EnabledBaselineDriftStatus.DRIFTED } } },
            }),
          ],
        },
      ]);

      const response = await new EnrollAccountsModule().handler(input);

      expect(ResetEnabledBaselineCommand).toHaveBeenCalledTimes(1);
      expect(GetBaselineOperationCommand).toHaveBeenCalledTimes(1);
      expect(response).toContain('completed successfully');
    });

    test('should wait for accounts with UNDER_CHANGE status', async () => {
      (paginateListEnabledBaselines as vi.Mock).mockImplementation(() => [
        {
          enabledBaselines: [
            makeOuBaseline(),
            makeAccountBaseline(ACCOUNT_TARGET_ARN_1, ACCOUNT_BASELINE_ARN_1, {
              statusSummary: {
                status: EnablementStatus.UNDER_CHANGE,
                lastOperationIdentifier: MOCK_ACCOUNT_OPERATION_ID,
              },
            }),
          ],
        },
      ]);

      const response = await new EnrollAccountsModule().handler(input);

      expect(ResetEnabledBaselineCommand).toHaveBeenCalledTimes(0);
      expect(GetBaselineOperationCommand).toHaveBeenCalledTimes(1);
      expect(response).toContain('completed successfully');
    });

    test('should handle both drifted OUs and enrolling accounts together', async () => {
      (paginateListEnabledBaselines as vi.Mock).mockImplementation(() => [
        {
          enabledBaselines: [
            makeOuBaseline({
              driftStatusSummary: { types: { inheritance: { status: EnabledBaselineDriftStatus.DRIFTED } } },
            }),
            makeAccountBaseline(ACCOUNT_TARGET_ARN_1, ACCOUNT_BASELINE_ARN_1, {
              statusSummary: {
                status: EnablementStatus.UNDER_CHANGE,
                lastOperationIdentifier: MOCK_ACCOUNT_OPERATION_ID,
              },
            }),
            makeAccountBaseline(ACCOUNT_TARGET_ARN_2, ACCOUNT_BASELINE_ARN_2),
          ],
        },
      ]);

      const response = await new EnrollAccountsModule().handler(input);

      expect(ResetEnabledBaselineCommand).toHaveBeenCalledTimes(1);
      // 2 operations: 1 OU reset + 1 account under change, both checked in parallel
      expect(GetBaselineOperationCommand).toHaveBeenCalledTimes(2);
      expect(response).toContain('completed successfully');
    });

    test('should throw error when baseline operation exceeds timeout', async () => {
      process.env['ENROLL_ACCOUNTS_TIMEOUT_IN_MINUTES'] = '4';

      (paginateListEnabledBaselines as vi.Mock).mockImplementation(() => [
        {
          enabledBaselines: [
            makeOuBaseline({
              driftStatusSummary: { types: { inheritance: { status: EnabledBaselineDriftStatus.DRIFTED } } },
            }),
          ],
        },
      ]);

      mockSend.mockImplementation(command => {
        if (command instanceof ResetEnabledBaselineCommand) {
          return Promise.resolve({ operationIdentifier: MOCK_OPERATION_ID });
        }
        if (command instanceof GetBaselineOperationCommand) {
          return Promise.resolve({ baselineOperation: { status: BaselineOperationStatus.IN_PROGRESS } });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      await expect(new EnrollAccountsModule().handler(input)).rejects.toThrow(
        'Baseline operations took more than 4 minutes',
      );

      expect(ResetEnabledBaselineCommand).toHaveBeenCalledTimes(1);
    });

    test('should throw error when ResetEnabledBaseline does not return operationIdentifier', async () => {
      (paginateListEnabledBaselines as vi.Mock).mockImplementation(() => [
        {
          enabledBaselines: [
            makeOuBaseline({
              driftStatusSummary: { types: { inheritance: { status: EnabledBaselineDriftStatus.DRIFTED } } },
            }),
          ],
        },
      ]);

      mockSend.mockImplementation(command => {
        if (command instanceof ResetEnabledBaselineCommand) {
          return Promise.resolve({ operationIdentifier: undefined });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      await expect(new EnrollAccountsModule().handler(input)).rejects.toThrow(
        'ResetEnabledBaseline api did not return operationIdentifier',
      );

      expect(ResetEnabledBaselineCommand).toHaveBeenCalledTimes(1);
    });

    test('should throw error when Control Tower Landing Zone not found', async () => {
      getLandingZoneIdentifierSpy.mockResolvedValue(undefined);

      await expect(new EnrollAccountsModule().handler(input)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.INVALID_INPUT}: AWS Control Tower Landing Zone not found in the region`,
      );

      expect(ResetEnabledBaselineCommand).toHaveBeenCalledTimes(0);
    });

    test('should throw error when baseline operation fails', async () => {
      (paginateListEnabledBaselines as vi.Mock).mockImplementation(() => [
        {
          enabledBaselines: [
            makeOuBaseline({
              driftStatusSummary: { types: { inheritance: { status: EnabledBaselineDriftStatus.DRIFTED } } },
            }),
          ],
        },
      ]);

      mockSend.mockImplementation(command => {
        if (command instanceof ResetEnabledBaselineCommand) {
          return Promise.resolve({ operationIdentifier: MOCK_OPERATION_ID });
        }
        if (command instanceof GetBaselineOperationCommand) {
          return Promise.resolve({ baselineOperation: { status: BaselineOperationStatus.FAILED } });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      await expect(new EnrollAccountsModule().handler(input)).rejects.toThrow(
        'Investigate baseline operation before executing pipeline',
      );
    });

    test('should skip accounts with UNDER_CHANGE but no lastOperationIdentifier', async () => {
      (paginateListEnabledBaselines as vi.Mock).mockImplementation(() => [
        {
          enabledBaselines: [
            makeOuBaseline(),
            makeAccountBaseline(ACCOUNT_TARGET_ARN_1, ACCOUNT_BASELINE_ARN_1, {
              statusSummary: { status: EnablementStatus.UNDER_CHANGE },
              // no lastOperationIdentifier
            }),
          ],
        },
      ]);

      const response = await new EnrollAccountsModule().handler(input);

      expect(response).toContain('No action needed');
      expect(GetBaselineOperationCommand).toHaveBeenCalledTimes(0);
    });
  });

  describe('Dry Run', () => {
    test('should return dry run message when Control Tower not found', async () => {
      getLandingZoneIdentifierSpy.mockResolvedValue(undefined);

      const response = await new EnrollAccountsModule().handler(dryRunInput);

      expect(response).toMatch(`Will experience ${MODULE_EXCEPTIONS.INVALID_INPUT}`);
      expect(response).toMatch('does not have AWS Control Tower Landing Zone configured');
      expect(ResetEnabledBaselineCommand).toHaveBeenCalledTimes(0);
    });

    test('should return no action needed when nothing is drifted or enrolling', async () => {
      (paginateListEnabledBaselines as vi.Mock).mockImplementation(() => [
        {
          enabledBaselines: [makeOuBaseline(), makeAccountBaseline(ACCOUNT_TARGET_ARN_1, ACCOUNT_BASELINE_ARN_1)],
        },
      ]);

      const response = await new EnrollAccountsModule().handler(dryRunInput);

      expect(response).toMatch('No action needed');
      expect(ResetEnabledBaselineCommand).toHaveBeenCalledTimes(0);
    });

    test('should report drifted OUs in dry run', async () => {
      (paginateListEnabledBaselines as vi.Mock).mockImplementation(() => [
        {
          enabledBaselines: [
            makeOuBaseline({
              driftStatusSummary: { types: { inheritance: { status: EnabledBaselineDriftStatus.DRIFTED } } },
            }),
          ],
        },
      ]);

      const response = await new EnrollAccountsModule().handler(dryRunInput);

      expect(response).toMatch('OUs have drifted');
      expect(response).toMatch('ou-g2dm-6xseqdih');
      expect(response).toMatch('Will reset baseline to enroll accounts');
      expect(ResetEnabledBaselineCommand).toHaveBeenCalledTimes(0);
    });

    test('should report enrolling accounts in dry run', async () => {
      (paginateListEnabledBaselines as vi.Mock).mockImplementation(() => [
        {
          enabledBaselines: [
            makeOuBaseline(),
            makeAccountBaseline(ACCOUNT_TARGET_ARN_1, ACCOUNT_BASELINE_ARN_1, {
              statusSummary: {
                status: EnablementStatus.UNDER_CHANGE,
                lastOperationIdentifier: MOCK_ACCOUNT_OPERATION_ID,
              },
            }),
          ],
        },
      ]);

      const response = await new EnrollAccountsModule().handler(dryRunInput);

      expect(response).toMatch('enrolling into Control Tower');
      expect(response).toMatch('111111111111');
      expect(response).toMatch('Will wait for enrollment to complete');
      expect(ResetEnabledBaselineCommand).toHaveBeenCalledTimes(0);
    });

    test('should report both drifted OUs and enrolling accounts in dry run', async () => {
      (paginateListEnabledBaselines as vi.Mock).mockImplementation(() => [
        {
          enabledBaselines: [
            makeOuBaseline({
              driftStatusSummary: { types: { inheritance: { status: EnabledBaselineDriftStatus.DRIFTED } } },
            }),
            makeAccountBaseline(ACCOUNT_TARGET_ARN_1, ACCOUNT_BASELINE_ARN_1, {
              statusSummary: {
                status: EnablementStatus.UNDER_CHANGE,
                lastOperationIdentifier: MOCK_ACCOUNT_OPERATION_ID,
              },
            }),
          ],
        },
      ]);

      const response = await new EnrollAccountsModule().handler(dryRunInput);

      expect(response).toMatch('OUs have drifted');
      expect(response).toMatch('ou-g2dm-6xseqdih');
      expect(response).toMatch('enrolling into Control Tower');
      expect(response).toMatch('111111111111');
      expect(ResetEnabledBaselineCommand).toHaveBeenCalledTimes(0);
    });
  });

  describe('Timeout Override', () => {
    test('should use env var timeout when set', async () => {
      process.env['ENROLL_ACCOUNTS_TIMEOUT_IN_MINUTES'] = '2';

      (paginateListEnabledBaselines as vi.Mock).mockImplementation(() => [
        {
          enabledBaselines: [
            makeOuBaseline({
              driftStatusSummary: { types: { inheritance: { status: EnabledBaselineDriftStatus.DRIFTED } } },
            }),
          ],
        },
      ]);

      mockSend.mockImplementation(command => {
        if (command instanceof ResetEnabledBaselineCommand) {
          return Promise.resolve({ operationIdentifier: MOCK_OPERATION_ID });
        }
        if (command instanceof GetBaselineOperationCommand) {
          return Promise.resolve({ baselineOperation: { status: BaselineOperationStatus.IN_PROGRESS } });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      await expect(new EnrollAccountsModule().handler(input)).rejects.toThrow(
        'Baseline operations took more than 2 minutes',
      );
    });

    test('should use default timeout when env var is invalid', async () => {
      process.env['ENROLL_ACCOUNTS_TIMEOUT_IN_MINUTES'] = 'not-a-number';

      (paginateListEnabledBaselines as vi.Mock).mockImplementation(() => [
        {
          enabledBaselines: [
            makeOuBaseline({
              driftStatusSummary: { types: { inheritance: { status: EnabledBaselineDriftStatus.DRIFTED } } },
            }),
          ],
        },
      ]);

      mockSend.mockImplementation(command => {
        if (command instanceof ResetEnabledBaselineCommand) {
          return Promise.resolve({ operationIdentifier: MOCK_OPERATION_ID });
        }
        if (command instanceof GetBaselineOperationCommand) {
          return Promise.resolve({ baselineOperation: { status: BaselineOperationStatus.IN_PROGRESS } });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      await expect(new EnrollAccountsModule().handler(input)).rejects.toThrow(
        'Baseline operations took more than 30 minutes',
      );
    });
  });
});
