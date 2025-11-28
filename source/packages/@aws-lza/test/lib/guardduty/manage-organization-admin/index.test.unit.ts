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

import { describe, beforeEach, expect, test, vi, afterEach } from 'vitest';

import {
  AdminAccount,
  AccessDeniedException,
  BadRequestException,
  CreateDetectorCommand,
  DisableOrganizationAdminAccountCommand,
  EnableOrganizationAdminAccountCommand,
  GetDetectorCommand,
  GuardDutyClient,
  ListDetectorsCommand,
  ListOrganizationAdminAccountsCommand,
  DetectorStatus,
} from '@aws-sdk/client-guardduty';
import { MOCK_CONSTANTS } from '../../../mocked-resources';
import { GuardDutyManageOrganizationAdminModule } from '../../../../lib/guardduty/manage-organization-admin';
import { MODULE_EXCEPTIONS } from '../../../../common/enums';
import { generateDryRunResponse } from '../../../../common/functions';
import { AcceleratorModuleName } from '../../../../common/resources';

vi.mock('@aws-sdk/client-guardduty', async () => {
  const actual = await vi.importActual('@aws-sdk/client-guardduty');
  return {
    ...actual,
    GuardDutyClient: vi.fn(),
    CreateDetectorCommand: vi.fn(),
    DisableOrganizationAdminAccountCommand: vi.fn(),
    EnableOrganizationAdminAccountCommand: vi.fn(),
    GetDetectorCommand: vi.fn(),
    ListDetectorsCommand: vi.fn(),
    ListOrganizationAdminAccountsCommand: vi.fn(),
  };
});

vi.mock('../../../../common/functions', async () => {
  const actual = await vi.importActual('../../../../common/functions');
  return {
    ...actual,
    delay: vi.fn().mockResolvedValue(undefined),
    waitUntil: vi.fn(),
  };
});

describe('GuardDutyManageOrganizationAdminModule', () => {
  const mockSend = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    (GuardDutyClient as vi.Mock).mockImplementation(() => ({
      send: mockSend,
    }));

    // Set up default waitUntil mock implementation
    const { waitUntil } = await import('../../../../common/functions');
    vi.mocked(waitUntil).mockImplementation(async (predicate: () => Promise<boolean>, error: string) => {
      // Default implementation that just calls the predicate once
      const result = await predicate();
      if (!result) {
        throw new Error(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: ${error}`);
      }
    });
  });

  const setupSend = (guardDutyEnabled: boolean, ...adminAccounts: AdminAccount[][]) => {
    let callIndex = 0;

    mockSend.mockImplementation(command => {
      if (command instanceof ListDetectorsCommand) {
        return Promise.resolve({
          DetectorIds: guardDutyEnabled ? ['detector-123'] : [],
        });
      }

      if (command instanceof GetDetectorCommand) {
        return Promise.resolve({ Status: DetectorStatus.ENABLED });
      }

      if (command instanceof CreateDetectorCommand) {
        return Promise.resolve({});
      }

      if (command instanceof EnableOrganizationAdminAccountCommand) {
        return Promise.resolve({});
      }

      if (command instanceof DisableOrganizationAdminAccountCommand) {
        return Promise.resolve({});
      }

      if (command instanceof ListOrganizationAdminAccountsCommand) {
        if (callIndex >= adminAccounts.length) {
          return Promise.resolve({ AdminAccounts: [] });
        }
        const accounts = adminAccounts[callIndex] || [];
        callIndex += 1;
        return Promise.resolve({ AdminAccounts: accounts });
      }

      return Promise.reject(MOCK_CONSTANTS.unknownError);
    });
  };

  interface InputConfig {
    enable: boolean;
    dryRun: boolean;
  }

  const adminId = MOCK_CONSTANTS.ManageOrganizationAdminModule.adminId;

  const getInput = (config: InputConfig) => ({
    ...MOCK_CONSTANTS.runnerParameters,
    configuration: {
      accountId: adminId,
      enable: config.enable,
    },
    dryRun: config.dryRun,
  });
  describe('Not Dry Run', () => {
    describe('Enable', () => {
      const input = getInput({ enable: true, dryRun: false });

      describe('Without Active Admin', () => {
        afterEach(() => {
          expect(ListDetectorsCommand).toHaveBeenCalledTimes(1);
          expect(GetDetectorCommand).toHaveBeenCalledTimes(1);
          expect(CreateDetectorCommand).toHaveBeenCalledTimes(0);
          expect(ListOrganizationAdminAccountsCommand).toHaveBeenCalledTimes(2);
          expect(EnableOrganizationAdminAccountCommand).toHaveBeenCalledWith({
            AdminAccountId: adminId,
          });
          expect(DisableOrganizationAdminAccountCommand).toHaveBeenCalledTimes(0);
        });

        test('should succeed when enabling with no admins', async () => {
          setupSend(true, [], [{ AdminAccountId: adminId, AdminStatus: 'ENABLED' }]);

          const response = await new GuardDutyManageOrganizationAdminModule().handler(input);
          expect(response).toMatch(`Successfully set GuardDuty Organization Admin to AWS Account with ID ${adminId}`);
        });

        test('should succeed when enabling with disabled admins', async () => {
          setupSend(true, [], [{ AdminAccountId: adminId, AdminStatus: 'ENABLED' }]);

          const response = await new GuardDutyManageOrganizationAdminModule().handler(input);
          expect(response).toMatch(`Successfully set GuardDuty Organization Admin to AWS Account with ID ${adminId}`);
        });
      });

      describe('With Active Admin', () => {
        afterEach(() => {
          expect(ListDetectorsCommand).toHaveBeenCalledTimes(1);
          expect(GetDetectorCommand).toHaveBeenCalledTimes(1);
          expect(CreateDetectorCommand).toHaveBeenCalledTimes(0);
          expect(ListOrganizationAdminAccountsCommand).toHaveBeenCalledTimes(1);
          expect(EnableOrganizationAdminAccountCommand).toHaveBeenCalledTimes(0);
          expect(DisableOrganizationAdminAccountCommand).toHaveBeenCalledTimes(0);
        });

        test('should fail when enabling with active admin', async () => {
          const activeAdmin = 'activeAdmin';
          setupSend(true, [{ AdminAccountId: activeAdmin, AdminStatus: 'ENABLED' }]);

          const promise = new GuardDutyManageOrganizationAdminModule().handler(input);
          await expect(promise).rejects.toThrowError(
            `${MODULE_EXCEPTIONS.INVALID_INPUT}: GuardDuty delegated admin is already set to ${activeAdmin} account, cannot assign another delegated account ${adminId}`,
          );
        });

        test('should succeed when requested account is already admin', async () => {
          setupSend(true, [{ AdminAccountId: adminId, AdminStatus: 'ENABLED' }]);

          const response = await new GuardDutyManageOrganizationAdminModule().handler(input);
          expect(response).toMatch(`AWS Account with ID ${adminId} is already the GuardDuty Organization Admin`);
        });
      });
    });

    describe('Disable', () => {
      const input = getInput({ enable: false, dryRun: false });

      describe('Without Active Admin', () => {
        afterEach(() => {
          expect(ListDetectorsCommand).toHaveBeenCalledTimes(1);
          expect(GetDetectorCommand).toHaveBeenCalledTimes(1);
          expect(CreateDetectorCommand).toHaveBeenCalledTimes(0);
          expect(ListOrganizationAdminAccountsCommand).toHaveBeenCalledTimes(1);
          expect(EnableOrganizationAdminAccountCommand).toHaveBeenCalledTimes(0);
          expect(DisableOrganizationAdminAccountCommand).toHaveBeenCalledTimes(0);
        });

        test('should succeed when disabling with no admins', async () => {
          setupSend(true, []);

          const response = await new GuardDutyManageOrganizationAdminModule().handler(input);
          expect(response).toMatch(
            `There is no Organization Admin currently set, so AWS Account with ID ${adminId} was not removed`,
          );
        });
      });

      describe('With Active Admin', () => {
        test('should fail when disabling with different active admin', async () => {
          const activeAdmin = 'activeAdmin';
          setupSend(true, [{ AdminAccountId: activeAdmin, AdminStatus: 'ENABLED' }]);

          const promise = new GuardDutyManageOrganizationAdminModule().handler(input);
          await expect(promise).rejects.toThrowError(
            `${MODULE_EXCEPTIONS.INVALID_INPUT}: Could not remove Account with ID ${adminId} as GuardDuty Organization Admin because the current Admin is AWS Account with ID ${activeAdmin}`,
          );
          expect(ListDetectorsCommand).toHaveBeenCalledTimes(1);
          expect(GetDetectorCommand).toHaveBeenCalledTimes(1);
          expect(CreateDetectorCommand).toHaveBeenCalledTimes(0);
          expect(ListOrganizationAdminAccountsCommand).toHaveBeenCalledTimes(1);
          expect(EnableOrganizationAdminAccountCommand).toHaveBeenCalledTimes(0);
          expect(DisableOrganizationAdminAccountCommand).toHaveBeenCalledTimes(0);
        });

        test('should succeed when disabling with same active admin', async () => {
          setupSend(true, [{ AdminAccountId: adminId, AdminStatus: 'ENABLED' }], []);

          const response = await new GuardDutyManageOrganizationAdminModule().handler(input);
          expect(response).toMatch(
            `Successfully removed AWS Account with ID ${adminId} as GuardDuty Organization Admin`,
          );
          expect(ListDetectorsCommand).toHaveBeenCalledTimes(1);
          expect(GetDetectorCommand).toHaveBeenCalledTimes(1);
          expect(CreateDetectorCommand).toHaveBeenCalledTimes(0);
          expect(ListOrganizationAdminAccountsCommand).toHaveBeenCalledTimes(2);
          expect(EnableOrganizationAdminAccountCommand).toHaveBeenCalledTimes(0);
          expect(DisableOrganizationAdminAccountCommand).toHaveBeenCalledTimes(1);
        });
      });
    });

    describe('GuardDuty Disabled', () => {
      test('should succeed when disabling', async () => {
        let getCallCount = 0;
        mockSend.mockImplementation(command => {
          if (command instanceof ListDetectorsCommand) {
            if (getCallCount == 0) {
              getCallCount += 1;
              return Promise.resolve({ DetectorIds: [] });
            }
            return Promise.resolve({ DetectorIds: ['detector-123'] });
          }
          if (command instanceof GetDetectorCommand) {
            return Promise.resolve({ Status: 'ENABLED' });
          }
          if (command instanceof CreateDetectorCommand) {
            return Promise.resolve({});
          }
          if (command instanceof ListOrganizationAdminAccountsCommand) {
            return Promise.resolve({ AdminAccounts: [] });
          }
          return Promise.reject(MOCK_CONSTANTS.unknownError);
        });

        const input = getInput({ enable: false, dryRun: false });

        const status = await new GuardDutyManageOrganizationAdminModule().handler(input);
        expect(status).toMatch(
          `There is no Organization Admin currently set, so AWS Account with ID ${adminId} was not removed`,
        );

        expect(ListDetectorsCommand).toHaveBeenCalledTimes(2);
        expect(CreateDetectorCommand).toHaveBeenCalledTimes(1);
        expect(ListOrganizationAdminAccountsCommand).toHaveBeenCalledTimes(1);
        expect(EnableOrganizationAdminAccountCommand).toHaveBeenCalledTimes(0);
        expect(DisableOrganizationAdminAccountCommand).toHaveBeenCalledTimes(0);
      });

      test('should succeed when enabling', async () => {
        let getCallCount = 0;
        mockSend.mockImplementation(command => {
          if (command instanceof ListDetectorsCommand) {
            if (getCallCount == 0) {
              getCallCount += 1;
              return Promise.resolve({ DetectorIds: [] });
            }
            return Promise.resolve({ DetectorIds: ['detector-123'] });
          }
          if (command instanceof GetDetectorCommand) {
            return Promise.resolve({ Status: DetectorStatus.ENABLED });
          }
          if (command instanceof CreateDetectorCommand) {
            return Promise.resolve({});
          }
          if (command instanceof EnableOrganizationAdminAccountCommand) {
            return Promise.resolve({});
          }
          if (command instanceof ListOrganizationAdminAccountsCommand) {
            return Promise.resolve({ AdminAccounts: [{ AdminAccountId: adminId, AdminStatus: 'ENABLED' }] });
          }
          return Promise.reject(MOCK_CONSTANTS.unknownError);
        });

        const input = getInput({ enable: true, dryRun: false });

        const response = await new GuardDutyManageOrganizationAdminModule().handler(input);
        expect(response).toMatch(`AWS Account with ID ${adminId} is already the GuardDuty Organization Admin`);
      });
    });
  });
  const dryRunResponse = (string: string) =>
    generateDryRunResponse(AcceleratorModuleName.AWS_GUARDDUTY, MOCK_CONSTANTS.runnerParameters.operation, string);

  describe('Dry Run', () => {
    afterEach(() => {
      expect(CreateDetectorCommand).toHaveBeenCalledTimes(0);
      expect(EnableOrganizationAdminAccountCommand).toHaveBeenCalledTimes(0);
      expect(DisableOrganizationAdminAccountCommand).toHaveBeenCalledTimes(0);
    });

    describe('Enable', () => {
      const input = getInput({ enable: true, dryRun: true });

      describe('Without Active Admin', () => {
        test('should succeed when enabling with no admins', async () => {
          setupSend(true, []);

          const response = await new GuardDutyManageOrganizationAdminModule().handler(input);
          expect(response).toMatch(
            dryRunResponse(`AWS Account with ID ${adminId} will be set as the GuardDuty Organization Admin`),
          );
          expect(ListDetectorsCommand).toHaveBeenCalledTimes(1);
          expect(ListOrganizationAdminAccountsCommand).toHaveBeenCalledTimes(1);
        });
      });

      describe('With Active Admin', () => {
        test('should fail when enabling with active admin', async () => {
          const activeAdmin = 'activeAdmin';
          setupSend(true, [{ AdminAccountId: activeAdmin, AdminStatus: 'ENABLED' }]);
          const input = getInput({ enable: true, dryRun: true });

          const response = await new GuardDutyManageOrganizationAdminModule().handler(input);

          expect(response).toMatch(
            dryRunResponse(
              `Will experience ${MODULE_EXCEPTIONS.INVALID_INPUT} because the GuardDuty Organization Administrator is already set to ${activeAdmin}, cannot additionally assign ${adminId}`,
            ),
          );
          expect(ListDetectorsCommand).toHaveBeenCalledTimes(1);
          expect(ListOrganizationAdminAccountsCommand).toHaveBeenCalledTimes(1);
        });

        test('should succeed when requested account is already admin', async () => {
          setupSend(true, [{ AdminAccountId: adminId, AdminStatus: 'ENABLED' }]);

          const response = await new GuardDutyManageOrganizationAdminModule().handler(input);
          expect(response).toMatch(
            dryRunResponse(`AWS Account with ID ${adminId} is already the GuardDuty Organization Administrator`),
          );
          expect(ListDetectorsCommand).toHaveBeenCalledTimes(1);
          expect(ListOrganizationAdminAccountsCommand).toHaveBeenCalledTimes(1);
        });
      });
    });

    describe('Disable', () => {
      const input = getInput({ enable: false, dryRun: true });

      describe('Without Active Admin', () => {
        test('should not fail when disabling with no admins', async () => {
          setupSend(true, []);

          const response = await new GuardDutyManageOrganizationAdminModule().handler(input);
          expect(response).toMatch(
            dryRunResponse(
              `There is no Organization Admin currently set, so AWS Account with ID ${adminId} will not need to be removed`,
            ),
          );
          expect(ListDetectorsCommand).toHaveBeenCalledTimes(1);
          expect(ListOrganizationAdminAccountsCommand).toHaveBeenCalledTimes(1);
        });
      });

      describe('With Active Admin', () => {
        test('should fail when disabling with different active admin', async () => {
          const activeAdmin = 'activeAdmin';
          setupSend(true, [{ AdminAccountId: activeAdmin, AdminStatus: 'ENABLED' }]);
          const input = getInput({ enable: false, dryRun: true });

          const response = await new GuardDutyManageOrganizationAdminModule().handler(input);
          expect(response).toMatch(
            dryRunResponse(
              `Will experience ${MODULE_EXCEPTIONS.INVALID_INPUT} because AWS Account with ID ${activeAdmin} is currently set as the GuardDuty Organization Admin, which differs from the expected account ${adminId}`,
            ),
          );
          expect(ListDetectorsCommand).toHaveBeenCalledTimes(1);
          expect(ListOrganizationAdminAccountsCommand).toHaveBeenCalledTimes(1);
        });

        test('should succeed when disabling with same active admin', async () => {
          setupSend(true, [{ AdminAccountId: adminId, AdminStatus: 'ENABLED' }]);

          const response = await new GuardDutyManageOrganizationAdminModule().handler(input);
          expect(response).toMatch(
            dryRunResponse(`AWS Account with ID ${adminId} will be removed as GuardDuty Organization Administrator`),
          );
          expect(ListDetectorsCommand).toHaveBeenCalledTimes(1);
          expect(ListOrganizationAdminAccountsCommand).toHaveBeenCalledTimes(1);
        });
      });
    });

    describe('GuardDuty Disabled', () => {
      test('should succeed when disabling', async () => {
        setupSend(false, []);
        const input = getInput({ enable: false, dryRun: true });

        const response = await new GuardDutyManageOrganizationAdminModule().handler(input);
        expect(response).toMatch(
          dryRunResponse(
            `GuardDuty is not enabled, so there is no Organization Admin currently set, so AWS Account with ID ${adminId} will not need to be removed`,
          ),
        );
        expect(ListDetectorsCommand).toHaveBeenCalledTimes(1);
        // With the refactored code, we now check for admin accounts even when GuardDuty is disabled
        expect(ListOrganizationAdminAccountsCommand).toHaveBeenCalledTimes(1);
      });

      test('should succeed when enabling', async () => {
        setupSend(false, []);
        const input = getInput({ enable: true, dryRun: true });

        const response = await new GuardDutyManageOrganizationAdminModule().handler(input);
        expect(response).toMatch(
          dryRunResponse(`AWS Account with ID ${adminId} will be set as the GuardDuty Organization Admin`),
        );
        expect(ListDetectorsCommand).toHaveBeenCalledTimes(1);
        // With the refactored code, we now check for admin accounts even when GuardDuty is disabled
        expect(ListOrganizationAdminAccountsCommand).toHaveBeenCalledTimes(1);
      });
    });
  });
  describe('API Errors', () => {
    const accessDenied = new AccessDeniedException({ message: 'message', $metadata: {} });
    const badRequest = new BadRequestException({
      message:
        'The request failed because another account is already enabled as GuardDuty delegated administrator for the organization.',
      $metadata: {},
    });

    test('should handle access denied when listing admin accounts', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListDetectorsCommand) {
          return Promise.resolve({ DetectorIds: ['detector-123'] });
        }
        if (command instanceof GetDetectorCommand) {
          return Promise.resolve({ Status: DetectorStatus.ENABLED });
        }
        if (command instanceof ListOrganizationAdminAccountsCommand) {
          return Promise.reject(accessDenied);
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const input = getInput({ enable: true, dryRun: false });
      const promise = new GuardDutyManageOrganizationAdminModule().handler(input);

      await expect(promise).rejects.toThrow(accessDenied);
    });

    test('should handle errors when checking GuardDuty status', async () => {
      // Use a counter to simulate first call failing, subsequent calls succeeding
      let callCount = 0;
      mockSend.mockImplementation(command => {
        if (command instanceof ListDetectorsCommand) {
          if (callCount === 0) {
            callCount++;
            throw new Error('Error checking GuardDuty status');
          }
          return Promise.resolve({ DetectorIds: ['detector-123'] });
        }
        if (command instanceof GetDetectorCommand) {
          return Promise.resolve({ Status: DetectorStatus.ENABLED });
        }
        if (command instanceof ListOrganizationAdminAccountsCommand) {
          return Promise.resolve({ AdminAccounts: [{ AdminAccountId: adminId, AdminStatus: 'ENABLED' }] });
        }
        if (command instanceof CreateDetectorCommand) {
          return Promise.resolve({});
        }
        return Promise.resolve({});
      });

      const input = getInput({ enable: true, dryRun: false });
      const response = await new GuardDutyManageOrganizationAdminModule().handler(input);

      // Should still work even when there's an error checking GuardDuty status
      expect(response).toMatch(`AWS Account with ID ${adminId} is already the GuardDuty Organization Admin`);
    });

    test('should directly test isGuardDutyEnabled error handling', async () => {
      // Mock the logger to verify it's called
      const mockLogger = {
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
      };

      // Create a test instance with the mocked logger
      const module = new GuardDutyManageOrganizationAdminModule();
      // @ts-ignore - Replace the private logger with our mock
      module.logger = mockLogger;

      // Mock the getDetectors method to throw an error
      // @ts-ignore - Replace the private method with our mock
      module.getDetectors = vi.fn().mockImplementation(() => {
        throw new Error('Direct error test');
      });

      // Call the method directly
      // @ts-ignore - Accessing private method for testing
      const result = await module.isGuardDutyEnabled(new GuardDutyClient({}));

      // Verify the result is false
      expect(result).toBe(false);

      // Verify the logger was called with the error
      expect(mockLogger.error).toHaveBeenCalledWith('Error checking GuardDuty status:', expect.any(Error));
    });

    test('should throw error when multiple admin accounts exist', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListDetectorsCommand) {
          return Promise.resolve({ DetectorIds: ['detector-123'] });
        }
        if (command instanceof GetDetectorCommand) {
          return Promise.resolve({ Status: DetectorStatus.ENABLED });
        }
        if (command instanceof ListOrganizationAdminAccountsCommand) {
          return Promise.resolve({
            AdminAccounts: [
              { AdminAccountId: 'admin1', AdminStatus: 'ENABLED' },
              { AdminAccountId: 'admin2', AdminStatus: 'ENABLED' },
            ],
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const input = getInput({ enable: true, dryRun: false });
      const promise = new GuardDutyManageOrganizationAdminModule().handler(input);

      await expect(promise).rejects.toThrowError(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Multiple admin accounts for GuardDuty in organization`,
      );
    });

    test('should throw error when admin account is in DISABLE_IN_PROGRESS state', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListDetectorsCommand) {
          return Promise.resolve({ DetectorIds: ['detector-123'] });
        }
        if (command instanceof GetDetectorCommand) {
          return Promise.resolve({ Status: DetectorStatus.ENABLED });
        }
        if (command instanceof ListOrganizationAdminAccountsCommand) {
          return Promise.resolve({
            AdminAccounts: [{ AdminAccountId: 'admin1', AdminStatus: 'DISABLE_IN_PROGRESS' }],
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const input = getInput({ enable: true, dryRun: false });
      const promise = new GuardDutyManageOrganizationAdminModule().handler(input);

      await expect(promise).rejects.toThrowError(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Admin account admin1 is in DISABLE_IN_PROGRESS`,
      );
    });

    test('should handle error when disabling organization admin account', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListDetectorsCommand) {
          return Promise.resolve({ DetectorIds: ['detector-123'] });
        }
        if (command instanceof GetDetectorCommand) {
          return Promise.resolve({ Status: DetectorStatus.ENABLED });
        }
        if (command instanceof ListOrganizationAdminAccountsCommand) {
          return Promise.resolve({ AdminAccounts: [{ AdminAccountId: adminId, AdminStatus: 'ENABLED' }] });
        }
        if (command instanceof DisableOrganizationAdminAccountCommand) {
          throw new Error('Error disabling organization admin account');
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const input = getInput({ enable: false, dryRun: false });
      const promise = new GuardDutyManageOrganizationAdminModule().handler(input);

      await expect(promise).rejects.toThrowError('Error disabling organization admin account');
    });

    test('should handle timeout when waiting for admin account to be removed', async () => {
      // Mock implementation that simulates the admin account never being removed
      let disableCallCount = 0;
      mockSend.mockImplementation(command => {
        if (command instanceof ListDetectorsCommand) {
          return Promise.resolve({ DetectorIds: ['detector-123'] });
        }
        if (command instanceof GetDetectorCommand) {
          return Promise.resolve({ Status: DetectorStatus.ENABLED });
        }
        if (command instanceof ListOrganizationAdminAccountsCommand) {
          // Always return the admin account, simulating that it never gets removed
          return Promise.resolve({ AdminAccounts: [{ AdminAccountId: adminId, AdminStatus: 'ENABLED' }] });
        }
        if (command instanceof DisableOrganizationAdminAccountCommand) {
          disableCallCount++;
          return Promise.resolve({});
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Mock waitUntil to simulate timeout
      const { waitUntil } = await import('../../../../common/functions');
      vi.mocked(waitUntil).mockImplementation(() => {
        throw new Error(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Could not get confirmation that ${adminId} was removed as GuardDuty Organization Admin`,
        );
      });

      const input = getInput({ enable: false, dryRun: false });
      const promise = new GuardDutyManageOrganizationAdminModule().handler(input);

      await expect(promise).rejects.toThrowError(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Could not get confirmation that ${adminId} was removed as GuardDuty Organization Admin`,
      );

      // Verify DisableOrganizationAdminAccountCommand was called
      expect(disableCallCount).toBeGreaterThan(0);
    }, 5000); // 5 second timeout should be enough now

    test('should handle errors when getting detector details', async () => {
      // Use a counter to simulate first call succeeding, second call failing
      let callCount = 0;
      mockSend.mockImplementation(command => {
        if (command instanceof ListDetectorsCommand) {
          return Promise.resolve({ DetectorIds: ['detector-123'] });
        }
        if (command instanceof GetDetectorCommand) {
          if (callCount === 0) {
            callCount++;
            throw new Error('Error getting detector details');
          }
          return Promise.resolve({ Status: DetectorStatus.ENABLED });
        }
        if (command instanceof ListOrganizationAdminAccountsCommand) {
          return Promise.resolve({ AdminAccounts: [{ AdminAccountId: adminId, AdminStatus: 'ENABLED' }] });
        }
        if (command instanceof CreateDetectorCommand) {
          return Promise.resolve({});
        }
        return Promise.resolve({});
      });

      const input = getInput({ enable: true, dryRun: false });
      const response = await new GuardDutyManageOrganizationAdminModule().handler(input);

      // Should still work even when there's an error getting detector details
      expect(response).toMatch(`AWS Account with ID ${adminId} is already the GuardDuty Organization Admin`);
    });

    test('should handle admin account with status other than ENABLED or DISABLE_IN_PROGRESS', async () => {
      // Mock implementation that allows the test to complete without waiting
      let listOrgCallCount = 0;
      mockSend.mockImplementation(command => {
        if (command instanceof ListDetectorsCommand) {
          return Promise.resolve({ DetectorIds: ['detector-123'] });
        }
        if (command instanceof GetDetectorCommand) {
          return Promise.resolve({ Status: DetectorStatus.ENABLED });
        }
        if (command instanceof ListOrganizationAdminAccountsCommand) {
          if (listOrgCallCount === 0) {
            listOrgCallCount++;
            return Promise.resolve({
              AdminAccounts: [{ AdminAccountId: 'admin1', AdminStatus: 'SOME_OTHER_STATUS' }],
            });
          }
          return Promise.resolve({ AdminAccounts: [{ AdminAccountId: adminId, AdminStatus: 'ENABLED' }] });
        }
        if (command instanceof EnableOrganizationAdminAccountCommand) {
          return Promise.resolve({});
        }
        return Promise.resolve({});
      });

      const input = getInput({ enable: true, dryRun: false });

      // This should not throw an error
      const response = await new GuardDutyManageOrganizationAdminModule().handler(input);
      expect(response).toMatch(`Successfully set GuardDuty Organization Admin to AWS Account with ID ${adminId}`);
    });

    test('should handle bad request when enabling admin account', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListDetectorsCommand) {
          return Promise.resolve({ DetectorIds: ['detector-123'] });
        }
        if (command instanceof GetDetectorCommand) {
          return Promise.resolve({ Status: DetectorStatus.ENABLED });
        }
        if (command instanceof ListOrganizationAdminAccountsCommand) {
          return Promise.resolve({ AdminAccounts: [] });
        }
        if (command instanceof EnableOrganizationAdminAccountCommand) {
          return Promise.reject(badRequest);
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const input = getInput({ enable: true, dryRun: false });
      const promise = new GuardDutyManageOrganizationAdminModule().handler(input);

      // Since we removed the specific BadRequestException handling, the error should be thrown as is
      await expect(promise).rejects.toThrow(badRequest);
    });
  });
});
test('should directly test getDetectors error handling', async () => {
  // Mock the logger to verify it's called
  const mockLogger = {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  };

  // Create a test instance with the mocked logger
  const module = new GuardDutyManageOrganizationAdminModule();
  // @ts-ignore - Replace the private logger with our mock
  module.logger = mockLogger;

  // Create a mock client with a mock send function
  const mockClient = {
    send: vi.fn().mockImplementation(() => {
      throw new Error('Direct detector error test');
    }),
  };

  // Call the method directly
  // @ts-ignore - Accessing private method for testing
  const result = await module.getDetectors(mockClient as unknown as GuardDutyClient);

  // Verify the result is undefined
  expect(result).toBeUndefined();

  // Verify the logger was called with the error
  expect(mockLogger.error).toHaveBeenCalledWith('Error getting GuardDuty detectors:', expect.any(Error));
});
test('should test getDetectors with empty detector IDs', async () => {
  // Create a mock client with a mock send function
  const mockClient = {
    send: vi.fn().mockImplementation(command => {
      if (command instanceof ListDetectorsCommand) {
        return Promise.resolve({ DetectorIds: [] });
      }
      return Promise.resolve({});
    }),
  };

  const module = new GuardDutyManageOrganizationAdminModule();
  // @ts-ignore - Accessing private method for testing
  const result = await module.getDetectors(mockClient as unknown as GuardDutyClient);

  // Verify the result is undefined when no detector IDs are returned
  expect(result).toBeUndefined();
});

test('should test getDetectors with undefined detector IDs', async () => {
  // Create a mock client with a mock send function
  const mockClient = {
    send: vi.fn().mockImplementation(command => {
      if (command instanceof ListDetectorsCommand) {
        return Promise.resolve({ DetectorIds: undefined });
      }
      return Promise.resolve({});
    }),
  };

  const module = new GuardDutyManageOrganizationAdminModule();
  // @ts-ignore - Accessing private method for testing
  const result = await module.getDetectors(mockClient as unknown as GuardDutyClient);

  // Verify the result is undefined when detector IDs are undefined
  expect(result).toBeUndefined();
});

test('should test getDetectors with undefined detector status', async () => {
  // Create a mock client with a mock send function
  const mockClient = {
    send: vi.fn().mockImplementation(command => {
      if (command instanceof ListDetectorsCommand) {
        return Promise.resolve({ DetectorIds: ['detector-123'] });
      }
      if (command instanceof GetDetectorCommand) {
        return Promise.resolve({ Status: undefined });
      }
      return Promise.resolve({});
    }),
  };

  const module = new GuardDutyManageOrganizationAdminModule();
  // @ts-ignore - Accessing private method for testing
  const result = await module.getDetectors(mockClient as unknown as GuardDutyClient);

  // Verify the result has the correct structure with UNKNOWN status
  expect(result).toEqual({
    detectorId: 'detector-123',
    status: 'UNKNOWN',
  });
});
test('should test listAdminAccounts pagination', async () => {
  // Create a mock client with a mock send function that simulates pagination
  let callCount = 0;
  const mockClient = {
    send: vi.fn().mockImplementation(command => {
      if (command instanceof ListOrganizationAdminAccountsCommand) {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            AdminAccounts: [{ AdminAccountId: 'admin1', AdminStatus: 'ENABLED' }],
            NextToken: 'nextPageToken',
          });
        } else {
          return Promise.resolve({
            AdminAccounts: [{ AdminAccountId: 'admin2', AdminStatus: 'ENABLED' }],
            NextToken: undefined,
          });
        }
      }
      return Promise.resolve({});
    }),
  };

  const module = new GuardDutyManageOrganizationAdminModule();
  // @ts-ignore - Accessing private method for testing
  const result = await module.listAdminAccounts(mockClient as unknown as GuardDutyClient);

  // Verify the result contains both admin accounts from both pages
  expect(result).toHaveLength(2);
  expect(result[0].AdminAccountId).toBe('admin1');
  expect(result[1].AdminAccountId).toBe('admin2');

  // Verify the send method was called twice (once for each page)
  expect(mockClient.send).toHaveBeenCalledTimes(2);
});
test('should test listAdminAccounts with undefined AdminAccounts', async () => {
  // Create a mock client with a mock send function that returns undefined AdminAccounts
  const mockClient = {
    send: vi.fn().mockImplementation(command => {
      if (command instanceof ListOrganizationAdminAccountsCommand) {
        return Promise.resolve({
          // AdminAccounts is undefined
        });
      }
      return Promise.resolve({});
    }),
  };

  const module = new GuardDutyManageOrganizationAdminModule();
  // @ts-ignore - Accessing private method for testing
  const result = await module.listAdminAccounts(mockClient as unknown as GuardDutyClient);

  // Verify the result is an empty array
  expect(result).toEqual([]);

  // Verify the send method was called once
  expect(mockClient.send).toHaveBeenCalledTimes(1);
});
