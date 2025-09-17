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
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, beforeEach, expect, test, vi } from 'vitest';

import {
  ChildNotFoundException,
  ListParentsCommand,
  MoveAccountCommand,
  OrganizationsClient,
} from '@aws-sdk/client-organizations';

import { MOCK_CONSTANTS } from '../../../mocked-resources';
import { MoveAccountsBatchModule } from '../../../../lib/aws-organizations/move-accounts-batch';
import { MODULE_EXCEPTIONS } from '../../../../common/enums';

// Mock dependencies
vi.mock('@aws-sdk/client-organizations', () => {
  return {
    OrganizationsClient: vi.fn(),
    ListParentsCommand: vi.fn(),
    MoveAccountCommand: vi.fn(),
    ChildNotFoundException: vi.fn(),
  };
});

vi.mock('../../../../common/functions', async () => {
  const actual = await vi.importActual('../../../../common/functions');
  return {
    ...actual,
    getOrganizationRootId: vi.fn(),
    getOrganizationAccounts: vi.fn(),
    getOrganizationalUnitIdByPath: vi.fn(),
    getAccountDetailsFromOrganizationsByEmail: vi.fn(),
    getAccountId: vi.fn(),
    delay: vi.fn().mockResolvedValue(undefined),
    getModuleDefaultParameters: vi.fn((moduleName, props) => ({
      moduleName: props?.moduleName ?? moduleName,
      globalRegion: props?.globalRegion ?? props?.region ?? 'us-east-1',
      useExistingRole: props?.useExistingRole ?? false,
      dryRun: props?.dryRun ?? false,
    })),
    setRetryStrategy: vi.fn().mockReturnValue({}),
    generateDryRunResponse: vi.fn(
      (moduleName, operation, message) =>
        `[DRY-RUN]: ${moduleName} ${operation} (no actual changes were made)\n${message}`,
    ),
  };
});

describe('MoveAccountsBatchModule', () => {
  const mockSend = vi.fn();
  let getOrganizationRootIdSpy: vi.MockedFunction<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  let getOrganizationAccountsSpy: vi.MockedFunction<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  let getOrganizationalUnitIdByPathSpy: vi.MockedFunction<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  let getAccountDetailsFromOrganizationsByEmailSpy: vi.MockedFunction<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  let getAccountIdSpy: vi.MockedFunction<any>; // eslint-disable-line @typescript-eslint/no-explicit-any

  const input = {
    configuration: {
      accounts: MOCK_CONSTANTS.MoveAccountsBatchModule.configuration,
    },
    ...MOCK_CONSTANTS.runnerParameters,
  };
  const invalidInput = {
    configuration: {
      accounts: MOCK_CONSTANTS.MoveAccountsBatchModule.invalidConfiguration,
    },
    ...MOCK_CONSTANTS.runnerParameters,
  };

  const dryRunInput = {
    configuration: {
      accounts: MOCK_CONSTANTS.MoveAccountsBatchModule.configuration,
    },
    ...MOCK_CONSTANTS.runnerParameters,
    dryRun: true,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSend.mockReset();

    (OrganizationsClient as vi.Mock).mockImplementation(() => ({
      send: mockSend,
    }));

    const commonFunctions = await import('../../../../common/functions');
    getOrganizationRootIdSpy = vi.mocked(commonFunctions.getOrganizationRootId);
    getOrganizationRootIdSpy.mockReturnValue(MOCK_CONSTANTS.MoveAccountModule.rootDestinationOu);

    getOrganizationAccountsSpy = vi.mocked(commonFunctions.getOrganizationAccounts);
    getOrganizationAccountsSpy.mockReturnValue(MOCK_CONSTANTS.InviteAccountsBatchToOrganizationModule.existingAccounts);

    getOrganizationalUnitIdByPathSpy = vi.mocked(commonFunctions.getOrganizationalUnitIdByPath);

    getAccountDetailsFromOrganizationsByEmailSpy = vi.mocked(commonFunctions.getAccountDetailsFromOrganizationsByEmail);
    getAccountDetailsFromOrganizationsByEmailSpy.mockReturnValue(
      MOCK_CONSTANTS.MoveAccountsBatchModule.moveAccounts[0],
    );

    getAccountIdSpy = vi.mocked(commonFunctions.getAccountId);
    getAccountIdSpy.mockReturnValue(MOCK_CONSTANTS.MoveAccountModule.moveAccount.Id);
  });

  describe('Live Execution Operations', () => {
    test('should skip operation since all accounts are part of right destination ou', async () => {
      // Setup
      getOrganizationalUnitIdByPathSpy.mockReturnValue(MOCK_CONSTANTS.MoveAccountModule.rootDestinationOu);

      mockSend.mockImplementation(command => {
        if (command instanceof ListParentsCommand) {
          return Promise.resolve({
            Parents: [
              {
                Id: MOCK_CONSTANTS.MoveAccountModule.rootDestinationOu,
                Type: MOCK_CONSTANTS.MoveAccountModule.currentParent.Type,
              },
            ],
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new MoveAccountsBatchModule().handler(input);

      // Verify
      expect(response).toMatch(
        `Total ${MOCK_CONSTANTS.MoveAccountsBatchModule.configuration.length} AWS Account(s) already part of their destination AWS Organizations Organizational Unit, accelerator skipped the Account move process.`,
      );
      expect(getOrganizationRootIdSpy).toHaveBeenCalled();
      expect(getOrganizationAccountsSpy).toHaveBeenCalled();
      expect(getOrganizationalUnitIdByPathSpy).toHaveBeenCalled();
      expect(getAccountDetailsFromOrganizationsByEmailSpy).toHaveBeenCalled();
      expect(getAccountIdSpy).toHaveBeenCalledTimes(0);
      expect(ListParentsCommand).toHaveBeenCalledTimes(input.configuration.accounts.length);
      expect(MoveAccountCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(input.configuration.accounts.length);
    });

    test('should move all given accounts to destination ou', async () => {
      // Setup
      getOrganizationalUnitIdByPathSpy.mockReturnValueOnce(input.configuration.accounts[0].destinationOu);
      getOrganizationalUnitIdByPathSpy.mockReturnValueOnce(input.configuration.accounts[1].destinationOu);
      getAccountDetailsFromOrganizationsByEmailSpy.mockReturnValueOnce(
        MOCK_CONSTANTS.MoveAccountsBatchModule.moveAccounts[0],
      );
      getAccountDetailsFromOrganizationsByEmailSpy.mockReturnValueOnce(
        MOCK_CONSTANTS.MoveAccountsBatchModule.moveAccounts[1],
      );

      mockSend.mockImplementation(command => {
        if (command instanceof ListParentsCommand) {
          return Promise.resolve({
            Parents: [MOCK_CONSTANTS.MoveAccountModule.currentParent],
          });
        }
        if (command instanceof MoveAccountCommand) {
          return Promise.resolve({});
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new MoveAccountsBatchModule().handler(input);

      // Verify
      expect(response).toMatch(
        `AWS Account with email "${MOCK_CONSTANTS.MoveAccountsBatchModule.configuration[0].email}" successfully moved from "mockCurrentParentId" OU to "${MOCK_CONSTANTS.MoveAccountsBatchModule.configuration[0].destinationOu}" OU.\nAWS Account with email "${MOCK_CONSTANTS.MoveAccountsBatchModule.configuration[1].email}" successfully moved from "mockCurrentParentId" OU to "${MOCK_CONSTANTS.MoveAccountsBatchModule.configuration[1].destinationOu}" OU`,
      );
      expect(getOrganizationRootIdSpy).toHaveBeenCalled();
      expect(getOrganizationAccountsSpy).toHaveBeenCalled();
      expect(getOrganizationalUnitIdByPathSpy).toHaveBeenCalled();
      expect(getAccountDetailsFromOrganizationsByEmailSpy).toHaveBeenCalled();
      expect(getAccountIdSpy).toHaveBeenCalledTimes(input.configuration.accounts.length);
      expect(ListParentsCommand).toHaveBeenCalledTimes(input.configuration.accounts.length);
      expect(MoveAccountCommand).toHaveBeenCalledTimes(input.configuration.accounts.length);
      expect(mockSend).toHaveBeenCalledTimes(input.configuration.accounts.length * 2);
    });

    test('should move few accounts to destination ou and remaining will be skipped since those are part of right destination ou', async () => {
      // Setup
      getOrganizationalUnitIdByPathSpy.mockReturnValueOnce(input.configuration.accounts[0].destinationOu);
      getOrganizationalUnitIdByPathSpy.mockReturnValueOnce(input.configuration.accounts[1].destinationOu);

      getAccountDetailsFromOrganizationsByEmailSpy.mockReturnValueOnce(
        MOCK_CONSTANTS.MoveAccountsBatchModule.moveAccounts[0],
      );
      getAccountDetailsFromOrganizationsByEmailSpy.mockReturnValueOnce(
        MOCK_CONSTANTS.MoveAccountsBatchModule.moveAccounts[1],
      );
      let listParentsCommandCount = 0;
      mockSend.mockImplementation(command => {
        if (command instanceof ListParentsCommand) {
          listParentsCommandCount++;
          if (listParentsCommandCount === 1) {
            return Promise.resolve({
              Parents: [
                {
                  Id: input.configuration.accounts[0].destinationOu,
                  Type: MOCK_CONSTANTS.MoveAccountModule.currentParent.Type,
                },
              ],
            });
          }
          return Promise.resolve({
            Parents: [MOCK_CONSTANTS.MoveAccountModule.currentParent],
          });
        }
        if (command instanceof MoveAccountCommand) {
          return Promise.resolve({});
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new MoveAccountsBatchModule().handler(input);

      // Verify
      expect(response).toMatch(
        `AWS Account with email "${
          input.configuration.accounts[1].email
        }" successfully moved from "mockCurrentParentId" OU to "${
          input.configuration.accounts[1].destinationOu
        }" OU.\nTotal ${
          input.configuration.accounts.length - 1
        } AWS Account(s) already part of their destination AWS Organizations Organizational Unit, accelerator skipped the Account move process.`,
      );
      expect(getOrganizationRootIdSpy).toHaveBeenCalled();
      expect(getOrganizationAccountsSpy).toHaveBeenCalled();
      expect(getOrganizationalUnitIdByPathSpy).toHaveBeenCalled();
      expect(getAccountDetailsFromOrganizationsByEmailSpy).toHaveBeenCalled();
      expect(getAccountIdSpy).toHaveBeenCalledTimes(input.configuration.accounts.length - 1);
      expect(ListParentsCommand).toHaveBeenCalledTimes(input.configuration.accounts.length);
      expect(MoveAccountCommand).toHaveBeenCalledTimes(input.configuration.accounts.length - 1);
      expect(mockSend).toHaveBeenCalledTimes(input.configuration.accounts.length + 1);
    });

    test('should throw error when destination parent id not found', async () => {
      // Setup
      getOrganizationalUnitIdByPathSpy.mockReturnValueOnce(input.configuration.accounts[0].destinationOu);
      getOrganizationalUnitIdByPathSpy.mockReturnValueOnce(undefined);

      getAccountDetailsFromOrganizationsByEmailSpy.mockReturnValueOnce(
        MOCK_CONSTANTS.MoveAccountsBatchModule.moveAccounts[0],
      );
      getAccountDetailsFromOrganizationsByEmailSpy.mockReturnValueOnce(
        MOCK_CONSTANTS.MoveAccountsBatchModule.moveAccounts[1],
      );

      mockSend.mockImplementation(command => {
        if (command instanceof ListParentsCommand) {
          return Promise.resolve({
            Parents: [MOCK_CONSTANTS.MoveAccountModule.currentParent],
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });
      const errors: string[] = [
        `${MODULE_EXCEPTIONS.INVALID_INPUT}: Invalid destination organizational unit provided for account(s) with email "${input.configuration.accounts[1].email}".`,
      ];

      // Execute & Verify
      await expect(new MoveAccountsBatchModule().handler(input)).rejects.toThrowError(errors.join(' '));
      expect(getOrganizationRootIdSpy).toHaveBeenCalled();
      expect(getOrganizationAccountsSpy).toHaveBeenCalled();
      expect(getOrganizationalUnitIdByPathSpy).toHaveBeenCalled();
      expect(getAccountDetailsFromOrganizationsByEmailSpy).toHaveBeenCalled();
      expect(getAccountIdSpy).toHaveBeenCalledTimes(0);
      expect(ListParentsCommand).toHaveBeenCalledTimes(input.configuration.accounts.length);
      expect(MoveAccountCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(input.configuration.accounts.length);
    });

    test('should throw error when account does not have parent OU or the account is not part of AWS Organizations', async () => {
      // Setup
      getOrganizationalUnitIdByPathSpy.mockReturnValueOnce(input.configuration.accounts[0].destinationOu);
      getOrganizationalUnitIdByPathSpy.mockReturnValueOnce(input.configuration.accounts[1].destinationOu);

      getAccountDetailsFromOrganizationsByEmailSpy.mockReturnValueOnce(
        MOCK_CONSTANTS.MoveAccountsBatchModule.moveAccounts[0],
      );
      getAccountDetailsFromOrganizationsByEmailSpy.mockReturnValueOnce({
        Id: undefined,
        Email: MOCK_CONSTANTS.MoveAccountsBatchModule.moveAccounts[1].Email,
      });

      mockSend.mockImplementation(command => {
        if (command instanceof ListParentsCommand) {
          return Promise.resolve({
            Parents: [MOCK_CONSTANTS.MoveAccountModule.currentParent],
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const errors: string[] = [
        `${MODULE_EXCEPTIONS.INVALID_INPUT}: There are Account(s) without valid parent OU or the account not part of AWS Organizations.`,
      ];

      // Execute & Verify
      await expect(new MoveAccountsBatchModule().handler(input)).rejects.toThrowError(errors.join(' '));
      expect(getOrganizationRootIdSpy).toHaveBeenCalled();
      expect(getOrganizationAccountsSpy).toHaveBeenCalled();
      expect(getOrganizationalUnitIdByPathSpy).toHaveBeenCalled();
      expect(getAccountDetailsFromOrganizationsByEmailSpy).toHaveBeenCalled();
      expect(getAccountIdSpy).toHaveBeenCalledTimes(0);
      expect(ListParentsCommand).toHaveBeenCalledTimes(input.configuration.accounts.length - 1);
      expect(MoveAccountCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(input.configuration.accounts.length - 1);
    });

    test('should throw error when accounts not part of AWS Organizations', async () => {
      // Setup
      getOrganizationalUnitIdByPathSpy.mockReturnValueOnce(input.configuration.accounts[0].destinationOu);
      getOrganizationalUnitIdByPathSpy.mockReturnValueOnce(input.configuration.accounts[1].destinationOu);

      getAccountDetailsFromOrganizationsByEmailSpy.mockReturnValueOnce(
        MOCK_CONSTANTS.MoveAccountsBatchModule.moveAccounts[0],
      );

      getAccountDetailsFromOrganizationsByEmailSpy.mockReturnValueOnce(undefined);

      mockSend.mockImplementation(command => {
        if (command instanceof ListParentsCommand) {
          return Promise.resolve({
            Parents: [MOCK_CONSTANTS.MoveAccountModule.currentParent],
          });
        }

        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const errors: string[] = [
        `${MODULE_EXCEPTIONS.INVALID_INPUT}: There are Account(s) not part of AWS Organizations, could not retrieve account details.`,
      ];

      // Execute & Verify
      await expect(new MoveAccountsBatchModule().handler(input)).rejects.toThrowError(errors.join(' '));
      expect(getOrganizationRootIdSpy).toHaveBeenCalled();
      expect(getOrganizationAccountsSpy).toHaveBeenCalled();
      expect(getOrganizationalUnitIdByPathSpy).toHaveBeenCalled();
      expect(getAccountDetailsFromOrganizationsByEmailSpy).toHaveBeenCalled();
      expect(getAccountIdSpy).toHaveBeenCalledTimes(0);
      expect(ListParentsCommand).toHaveBeenCalledTimes(input.configuration.accounts.length - 1);
      expect(MoveAccountCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(input.configuration.accounts.length - 1);
    });

    test('should throw error when account does not have parent OU and the account is not part of AWS Organizations', async () => {
      // Setup
      getOrganizationalUnitIdByPathSpy.mockReturnValueOnce(input.configuration.accounts[0].destinationOu);
      getOrganizationalUnitIdByPathSpy.mockReturnValueOnce(undefined);

      getAccountDetailsFromOrganizationsByEmailSpy.mockReturnValueOnce(
        MOCK_CONSTANTS.MoveAccountsBatchModule.moveAccounts[0],
      );

      getAccountDetailsFromOrganizationsByEmailSpy.mockReturnValueOnce(undefined);

      mockSend.mockImplementation(command => {
        if (command instanceof ListParentsCommand) {
          return Promise.resolve({
            Parents: [MOCK_CONSTANTS.MoveAccountModule.currentParent],
          });
        }

        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const errors: string[] = [
        `${MODULE_EXCEPTIONS.INVALID_INPUT}: There are Account(s) for which could not retrieve destination ou and account details.`,
      ];

      // Execute & Verify
      await expect(new MoveAccountsBatchModule().handler(input)).rejects.toThrowError(errors.join(' '));
      expect(getOrganizationRootIdSpy).toHaveBeenCalled();
      expect(getOrganizationAccountsSpy).toHaveBeenCalled();
      expect(getOrganizationalUnitIdByPathSpy).toHaveBeenCalled();
      expect(getAccountDetailsFromOrganizationsByEmailSpy).toHaveBeenCalled();
      expect(getAccountIdSpy).toHaveBeenCalledTimes(0);
      expect(ListParentsCommand).toHaveBeenCalledTimes(input.configuration.accounts.length - 1);
      expect(MoveAccountCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(input.configuration.accounts.length - 1);
    });

    test('should handle ChildNotFoundException exception', async () => {
      // Setup
      getOrganizationalUnitIdByPathSpy.mockReturnValueOnce(input.configuration.accounts[0].destinationOu);
      getOrganizationalUnitIdByPathSpy.mockReturnValueOnce(input.configuration.accounts[1].destinationOu);
      getAccountDetailsFromOrganizationsByEmailSpy.mockReturnValueOnce(
        MOCK_CONSTANTS.MoveAccountsBatchModule.moveAccounts[0],
      );
      getAccountDetailsFromOrganizationsByEmailSpy.mockReturnValueOnce(
        MOCK_CONSTANTS.MoveAccountsBatchModule.moveAccounts[1],
      );

      mockSend.mockImplementation(command => {
        if (command instanceof ListParentsCommand) {
          return Promise.reject(new ChildNotFoundException({ message: 'Child not found', $metadata: {} }));
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const errors: string[] = [
        `${MODULE_EXCEPTIONS.INVALID_INPUT}: There are Account(s) without valid parent OU or the account not part of AWS Organizations.`,
      ];

      // Execute & Verify
      await expect(new MoveAccountsBatchModule().handler(input)).rejects.toThrowError(errors.join(' '));
      expect(getOrganizationRootIdSpy).toHaveBeenCalled();
      expect(getOrganizationAccountsSpy).toHaveBeenCalled();
      expect(getOrganizationalUnitIdByPathSpy).toHaveBeenCalled();
      expect(getAccountDetailsFromOrganizationsByEmailSpy).toHaveBeenCalled();
      expect(getAccountIdSpy).toHaveBeenCalledTimes(0);
      expect(ListParentsCommand).toHaveBeenCalledTimes(input.configuration.accounts.length);
      expect(MoveAccountCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(input.configuration.accounts.length);
    });

    test('should handle unknown exception for ListParentsCommand', async () => {
      // Setup
      getOrganizationalUnitIdByPathSpy.mockReturnValueOnce(input.configuration.accounts[0].destinationOu);
      getOrganizationalUnitIdByPathSpy.mockReturnValueOnce(input.configuration.accounts[1].destinationOu);
      getAccountDetailsFromOrganizationsByEmailSpy.mockReturnValueOnce(
        MOCK_CONSTANTS.MoveAccountsBatchModule.moveAccounts[0],
      );
      getAccountDetailsFromOrganizationsByEmailSpy.mockReturnValueOnce(
        MOCK_CONSTANTS.MoveAccountsBatchModule.moveAccounts[1],
      );

      mockSend.mockImplementation(command => {
        if (command instanceof ListParentsCommand) {
          return Promise.reject(MOCK_CONSTANTS.unknownError);
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new MoveAccountsBatchModule().handler(input)).rejects.toThrowError(
        new RegExp(MOCK_CONSTANTS.unknownError.message),
      );
      expect(getOrganizationRootIdSpy).toHaveBeenCalled();
      expect(getOrganizationAccountsSpy).toHaveBeenCalled();
      expect(getOrganizationalUnitIdByPathSpy).toHaveBeenCalled();
      expect(getAccountDetailsFromOrganizationsByEmailSpy).toHaveBeenCalled();
      expect(getAccountIdSpy).toHaveBeenCalledTimes(0);
      expect(ListParentsCommand).toHaveBeenCalledTimes(input.configuration.accounts.length - 1);
      expect(MoveAccountCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(input.configuration.accounts.length - 1);
    });

    test('should throw error when ListParentsCommand api returned undefined Parents object for account', async () => {
      // Setup
      getOrganizationalUnitIdByPathSpy.mockReturnValueOnce(input.configuration.accounts[0].destinationOu);
      getOrganizationalUnitIdByPathSpy.mockReturnValueOnce(input.configuration.accounts[1].destinationOu);
      getAccountDetailsFromOrganizationsByEmailSpy.mockReturnValueOnce(
        MOCK_CONSTANTS.MoveAccountsBatchModule.moveAccounts[0],
      );
      getAccountDetailsFromOrganizationsByEmailSpy.mockReturnValueOnce(
        MOCK_CONSTANTS.MoveAccountsBatchModule.moveAccounts[1],
      );

      mockSend.mockImplementation(command => {
        if (command instanceof ListParentsCommand) {
          return Promise.resolve({ Parents: undefined });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new MoveAccountsBatchModule().handler(input)).rejects.toThrowError(
        new RegExp(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: ListParentsCommand api returned undefined Parents object for account`,
        ),
      );
      expect(getOrganizationRootIdSpy).toHaveBeenCalled();
      expect(getOrganizationAccountsSpy).toHaveBeenCalled();
      expect(getOrganizationalUnitIdByPathSpy).toHaveBeenCalled();
      expect(getAccountDetailsFromOrganizationsByEmailSpy).toHaveBeenCalled();
      expect(getAccountIdSpy).toHaveBeenCalledTimes(0);
      expect(ListParentsCommand).toHaveBeenCalledTimes(input.configuration.accounts.length - 1);
      expect(MoveAccountCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(input.configuration.accounts.length - 1);
    });

    test('should throw error when ListParentsCommand api did returned multiple Parents', async () => {
      // Setup
      getOrganizationalUnitIdByPathSpy.mockReturnValueOnce(input.configuration.accounts[0].destinationOu);
      getOrganizationalUnitIdByPathSpy.mockReturnValueOnce(input.configuration.accounts[1].destinationOu);
      getAccountDetailsFromOrganizationsByEmailSpy.mockReturnValueOnce(
        MOCK_CONSTANTS.MoveAccountsBatchModule.moveAccounts[0],
      );
      getAccountDetailsFromOrganizationsByEmailSpy.mockReturnValueOnce(
        MOCK_CONSTANTS.MoveAccountsBatchModule.moveAccounts[1],
      );

      mockSend.mockImplementation(command => {
        if (command instanceof ListParentsCommand) {
          return Promise.resolve({
            Parents: [MOCK_CONSTANTS.MoveAccountModule.currentParent, MOCK_CONSTANTS.MoveAccountModule.currentParent],
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new MoveAccountsBatchModule().handler(input)).rejects.toThrowError(
        new RegExp(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: ListParentsCommand api returned multiple Parents for account`,
        ),
      );
      expect(getOrganizationRootIdSpy).toHaveBeenCalled();
      expect(getOrganizationAccountsSpy).toHaveBeenCalled();
      expect(getOrganizationalUnitIdByPathSpy).toHaveBeenCalled();
      expect(getAccountDetailsFromOrganizationsByEmailSpy).toHaveBeenCalled();
      expect(getAccountIdSpy).toHaveBeenCalledTimes(0);
      expect(ListParentsCommand).toHaveBeenCalledTimes(input.configuration.accounts.length - 1);
      expect(MoveAccountCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(input.configuration.accounts.length - 1);
    });

    test('should throw error when ListParentsCommand api did returned empty array for Parents object', async () => {
      // Setup
      getOrganizationalUnitIdByPathSpy.mockReturnValueOnce(input.configuration.accounts[0].destinationOu);
      getOrganizationalUnitIdByPathSpy.mockReturnValueOnce(input.configuration.accounts[1].destinationOu);
      getAccountDetailsFromOrganizationsByEmailSpy.mockReturnValueOnce(
        MOCK_CONSTANTS.MoveAccountsBatchModule.moveAccounts[0],
      );
      getAccountDetailsFromOrganizationsByEmailSpy.mockReturnValueOnce(
        MOCK_CONSTANTS.MoveAccountsBatchModule.moveAccounts[1],
      );

      mockSend.mockImplementation(command => {
        if (command instanceof ListParentsCommand) {
          return Promise.resolve({ Parents: [] });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new MoveAccountsBatchModule().handler(input)).rejects.toThrowError(
        new RegExp(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: ListParentsCommand api did returned empty array for Parents object for account`,
        ),
      );
      expect(getOrganizationRootIdSpy).toHaveBeenCalled();
      expect(getOrganizationAccountsSpy).toHaveBeenCalled();
      expect(getOrganizationalUnitIdByPathSpy).toHaveBeenCalled();
      expect(getAccountDetailsFromOrganizationsByEmailSpy).toHaveBeenCalled();
      expect(getAccountIdSpy).toHaveBeenCalledTimes(0);
      expect(ListParentsCommand).toHaveBeenCalledTimes(input.configuration.accounts.length - 1);
      expect(MoveAccountCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(input.configuration.accounts.length - 1);
    });

    test('should throw error when ListParentsCommand api did not returned Id property of Parents object for account', async () => {
      // Setup
      getOrganizationalUnitIdByPathSpy.mockReturnValueOnce(input.configuration.accounts[0].destinationOu);
      getOrganizationalUnitIdByPathSpy.mockReturnValueOnce(input.configuration.accounts[1].destinationOu);
      getAccountDetailsFromOrganizationsByEmailSpy.mockReturnValueOnce(
        MOCK_CONSTANTS.MoveAccountsBatchModule.moveAccounts[0],
      );
      getAccountDetailsFromOrganizationsByEmailSpy.mockReturnValueOnce(
        MOCK_CONSTANTS.MoveAccountsBatchModule.moveAccounts[1],
      );

      mockSend.mockImplementation(command => {
        if (command instanceof ListParentsCommand) {
          return Promise.resolve({
            Parents: [
              {
                Id: undefined,
                Type: MOCK_CONSTANTS.MoveAccountModule.currentParent.Type,
              },
            ],
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new MoveAccountsBatchModule().handler(input)).rejects.toThrowError(
        new RegExp(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: ListParentsCommand api did not returned Id property of Parents object for account`,
        ),
      );
      expect(getOrganizationRootIdSpy).toHaveBeenCalled();
      expect(getOrganizationAccountsSpy).toHaveBeenCalled();
      expect(getOrganizationalUnitIdByPathSpy).toHaveBeenCalled();
      expect(getAccountDetailsFromOrganizationsByEmailSpy).toHaveBeenCalled();
      expect(getAccountIdSpy).toHaveBeenCalledTimes(0);
      expect(ListParentsCommand).toHaveBeenCalledTimes(input.configuration.accounts.length - 1);
      expect(MoveAccountCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(input.configuration.accounts.length - 1);
    });

    test('should throw error when MoveAccountCommand return unknown error', async () => {
      // Setup
      getOrganizationalUnitIdByPathSpy.mockReturnValueOnce(input.configuration.accounts[0].destinationOu);
      getOrganizationalUnitIdByPathSpy.mockReturnValueOnce(input.configuration.accounts[1].destinationOu);
      getAccountDetailsFromOrganizationsByEmailSpy.mockReturnValueOnce(
        MOCK_CONSTANTS.MoveAccountsBatchModule.moveAccounts[0],
      );
      getAccountDetailsFromOrganizationsByEmailSpy.mockReturnValueOnce(
        MOCK_CONSTANTS.MoveAccountsBatchModule.moveAccounts[1],
      );

      mockSend.mockImplementation(command => {
        if (command instanceof ListParentsCommand) {
          return Promise.resolve({
            Parents: [MOCK_CONSTANTS.MoveAccountModule.currentParent],
          });
        }
        if (command instanceof MoveAccountCommand) {
          return Promise.reject(MOCK_CONSTANTS.unknownError);
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new MoveAccountsBatchModule().handler(input)).rejects.toThrowError(
        new RegExp(MOCK_CONSTANTS.unknownError.message),
      );
      expect(getOrganizationRootIdSpy).toHaveBeenCalled();
      expect(getOrganizationAccountsSpy).toHaveBeenCalled();
      expect(getOrganizationalUnitIdByPathSpy).toHaveBeenCalled();
      expect(getAccountDetailsFromOrganizationsByEmailSpy).toHaveBeenCalled();
      expect(getAccountIdSpy).toHaveBeenCalled();
      expect(ListParentsCommand).toHaveBeenCalledTimes(input.configuration.accounts.length);
      expect(MoveAccountCommand).toHaveBeenCalledTimes(input.configuration.accounts.length);
      expect(mockSend).toHaveBeenCalledTimes(input.configuration.accounts.length * 2);
    });

    test('should handle invalid input error', async () => {
      // Setup
      getOrganizationAccountsSpy.mockReturnValue(
        MOCK_CONSTANTS.InviteAccountsBatchToOrganizationModule.existingAccounts,
      );

      mockSend.mockImplementation(command => {
        if (command instanceof ListParentsCommand) {
          return Promise.resolve({
            Parents: [MOCK_CONSTANTS.MoveAccountModule.currentParent],
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new MoveAccountsBatchModule().handler(invalidInput)).rejects.toThrow(
        new RegExp(
          `${MODULE_EXCEPTIONS.INVALID_INPUT}: Invalid account email "${invalidInput.configuration.accounts.map(
            item => item.email,
          )}".`,
        ),
      );
      expect(getOrganizationRootIdSpy).toHaveBeenCalled();
      expect(getOrganizationAccountsSpy).toHaveBeenCalled();
      expect(getOrganizationalUnitIdByPathSpy).toHaveBeenCalled();
      expect(getAccountDetailsFromOrganizationsByEmailSpy).toHaveBeenCalled();
      expect(getAccountIdSpy).toHaveBeenCalledTimes(0);
      expect(ListParentsCommand).toHaveBeenCalledTimes(invalidInput.configuration.accounts.length);
      expect(MoveAccountCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(invalidInput.configuration.accounts.length);
    });

    test('should handle when no accounts provided', async () => {
      // Setup
      const emptyInput = {
        configuration: { accounts: [] },
        ...MOCK_CONSTANTS.runnerParameters,
      };

      // Execute
      const response = await new MoveAccountsBatchModule().handler(emptyInput);

      // Verify
      expect(response).toMatch(`No accounts provided to move between Organizational Units.`);
      expect(getOrganizationRootIdSpy).toHaveBeenCalledTimes(emptyInput.configuration.accounts.length);
      expect(getOrganizationAccountsSpy).toHaveBeenCalledTimes(emptyInput.configuration.accounts.length);
      expect(getOrganizationalUnitIdByPathSpy).toHaveBeenCalledTimes(emptyInput.configuration.accounts.length);
      expect(getAccountDetailsFromOrganizationsByEmailSpy).toHaveBeenCalledTimes(
        emptyInput.configuration.accounts.length,
      );
      expect(getAccountIdSpy).toHaveBeenCalledTimes(emptyInput.configuration.accounts.length);
      expect(ListParentsCommand).toHaveBeenCalledTimes(emptyInput.configuration.accounts.length);
      expect(MoveAccountCommand).toHaveBeenCalledTimes(emptyInput.configuration.accounts.length);
      expect(mockSend).toHaveBeenCalledTimes(emptyInput.configuration.accounts.length);
    });
  });

  describe('Dry Run Mode Operations', () => {
    test('should skip operation since all accounts are part of right destination ou', async () => {
      // Setup
      const commonFunctions = await import('../../../../common/functions');
      vi.mocked(commonFunctions.generateDryRunResponse).mockImplementationOnce(() => {
        return 'All AWS Accounts are already part of their destination AWS Organizations Organizational Units, accelerator will skip the Account move process.';
      });
      getOrganizationalUnitIdByPathSpy.mockReturnValue(MOCK_CONSTANTS.MoveAccountModule.rootDestinationOu);

      mockSend.mockImplementation(command => {
        if (command instanceof ListParentsCommand) {
          return Promise.resolve({
            Parents: [
              {
                Id: MOCK_CONSTANTS.MoveAccountModule.rootDestinationOu,
                Type: MOCK_CONSTANTS.MoveAccountModule.currentParent.Type,
              },
            ],
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new MoveAccountsBatchModule().handler(dryRunInput);

      // Verify
      expect(response).toContain(
        `All AWS Accounts are already part of their destination AWS Organizations Organizational Units, accelerator will skip the Account move process.`,
      );
      expect(getOrganizationRootIdSpy).toHaveBeenCalled();
      expect(getOrganizationAccountsSpy).toHaveBeenCalled();
      expect(getOrganizationalUnitIdByPathSpy).toHaveBeenCalled();
      expect(getAccountDetailsFromOrganizationsByEmailSpy).toHaveBeenCalled();
      expect(getAccountIdSpy).toHaveBeenCalledTimes(0);
      expect(ListParentsCommand).toHaveBeenCalledTimes(dryRunInput.configuration.accounts.length);
      expect(MoveAccountCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(dryRunInput.configuration.accounts.length);
    });

    test('should move all given accounts to destination ou', async () => {
      // Setup
      getOrganizationalUnitIdByPathSpy.mockReturnValueOnce(dryRunInput.configuration.accounts[0].destinationOu);
      getOrganizationalUnitIdByPathSpy.mockReturnValueOnce(dryRunInput.configuration.accounts[1].destinationOu);
      getAccountDetailsFromOrganizationsByEmailSpy.mockReturnValueOnce(
        MOCK_CONSTANTS.MoveAccountsBatchModule.moveAccounts[0],
      );
      getAccountDetailsFromOrganizationsByEmailSpy.mockReturnValueOnce(
        MOCK_CONSTANTS.MoveAccountsBatchModule.moveAccounts[1],
      );

      mockSend.mockImplementation(command => {
        if (command instanceof ListParentsCommand) {
          return Promise.resolve({
            Parents: [MOCK_CONSTANTS.MoveAccountModule.currentParent],
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new MoveAccountsBatchModule().handler(dryRunInput);

      // Verify
      expect(response).toMatch(
        `All AWS Accounts will be moved to their destination AWS Organizations Organizational Units.`,
      );
      expect(getOrganizationRootIdSpy).toHaveBeenCalled();
      expect(getOrganizationAccountsSpy).toHaveBeenCalled();
      expect(getOrganizationalUnitIdByPathSpy).toHaveBeenCalled();
      expect(getAccountDetailsFromOrganizationsByEmailSpy).toHaveBeenCalled();
      expect(getAccountIdSpy).toHaveBeenCalledTimes(0);
      expect(ListParentsCommand).toHaveBeenCalledTimes(dryRunInput.configuration.accounts.length);
      expect(MoveAccountCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(dryRunInput.configuration.accounts.length);
    });

    test('should move few accounts to destination ou and remaining will be skipped since those are part of right destination ou', async () => {
      // Setup
      getOrganizationalUnitIdByPathSpy.mockReset();
      getOrganizationalUnitIdByPathSpy.mockReturnValueOnce(dryRunInput.configuration.accounts[0].destinationOu);
      getOrganizationalUnitIdByPathSpy.mockReturnValueOnce(dryRunInput.configuration.accounts[1].destinationOu);

      getAccountDetailsFromOrganizationsByEmailSpy.mockReset();
      getAccountDetailsFromOrganizationsByEmailSpy.mockReturnValueOnce(
        MOCK_CONSTANTS.MoveAccountsBatchModule.moveAccounts[0],
      );
      getAccountDetailsFromOrganizationsByEmailSpy.mockReturnValueOnce(
        MOCK_CONSTANTS.MoveAccountsBatchModule.moveAccounts[1],
      );

      let listParentsCommandCount = 0;
      mockSend.mockImplementation(command => {
        if (command instanceof ListParentsCommand) {
          listParentsCommandCount++;
          if (listParentsCommandCount === 1) {
            return Promise.resolve({
              Parents: [
                {
                  Id: input.configuration.accounts[0].destinationOu,
                  Type: MOCK_CONSTANTS.MoveAccountModule.currentParent.Type,
                },
              ],
            });
          }
          return Promise.resolve({
            Parents: [MOCK_CONSTANTS.MoveAccountModule.currentParent],
          });
        }
        if (command instanceof MoveAccountCommand) {
          return Promise.resolve({});
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new MoveAccountsBatchModule().handler(dryRunInput);

      // Verify
      expect(response).toMatch(
        `${
          dryRunInput.configuration.accounts.length - 1
        } AWS Account(s) will be moved to their destination AWS Organizations Organizational Units, and ${
          dryRunInput.configuration.accounts.length - 1
        } AWS Account(s) will be skipped as they are already in their destination Organizational Units.`,
      );
      expect(getOrganizationRootIdSpy).toHaveBeenCalled();
      expect(getOrganizationAccountsSpy).toHaveBeenCalled();
      expect(getOrganizationalUnitIdByPathSpy).toHaveBeenCalled();
      expect(getAccountDetailsFromOrganizationsByEmailSpy).toHaveBeenCalled();
      expect(getAccountIdSpy).toHaveBeenCalledTimes(0);
      expect(ListParentsCommand).toHaveBeenCalledTimes(dryRunInput.configuration.accounts.length);
      expect(MoveAccountCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(dryRunInput.configuration.accounts.length);
    });

    test('should throw error when destination parent id not found', async () => {
      // Setup
      getOrganizationalUnitIdByPathSpy.mockReset();
      getOrganizationalUnitIdByPathSpy.mockReturnValueOnce(dryRunInput.configuration.accounts[0].destinationOu);
      getOrganizationalUnitIdByPathSpy.mockReturnValueOnce(undefined);

      getAccountDetailsFromOrganizationsByEmailSpy.mockReset();
      getAccountDetailsFromOrganizationsByEmailSpy.mockReturnValueOnce(
        MOCK_CONSTANTS.MoveAccountsBatchModule.moveAccounts[0],
      );
      getAccountDetailsFromOrganizationsByEmailSpy.mockReturnValueOnce(
        MOCK_CONSTANTS.MoveAccountsBatchModule.moveAccounts[1],
      );

      mockSend.mockImplementation(command => {
        if (command instanceof ListParentsCommand) {
          return Promise.resolve({
            Parents: [MOCK_CONSTANTS.MoveAccountModule.currentParent],
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new MoveAccountsBatchModule().handler(dryRunInput);

      // Verify
      expect(response).toMatch(
        `Will experience ${MODULE_EXCEPTIONS.INVALID_INPUT}: because, Invalid destination organizational unit provided for account(s) with email ${dryRunInput.configuration.accounts[1].email}.`,
      );
      expect(getOrganizationRootIdSpy).toHaveBeenCalled();
      expect(getOrganizationAccountsSpy).toHaveBeenCalled();
      expect(getOrganizationalUnitIdByPathSpy).toHaveBeenCalled();
      expect(getAccountDetailsFromOrganizationsByEmailSpy).toHaveBeenCalled();
      expect(getAccountIdSpy).toHaveBeenCalledTimes(0);
      expect(ListParentsCommand).toHaveBeenCalledTimes(dryRunInput.configuration.accounts.length);
      expect(MoveAccountCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(dryRunInput.configuration.accounts.length);
    });

    test('should handle invalid input error', async () => {
      // Setup
      getOrganizationAccountsSpy.mockReturnValue(
        MOCK_CONSTANTS.InviteAccountsBatchToOrganizationModule.existingAccounts,
      );

      mockSend.mockImplementation(command => {
        if (command instanceof ListParentsCommand) {
          return Promise.resolve({
            Parents: [MOCK_CONSTANTS.MoveAccountModule.currentParent],
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new MoveAccountsBatchModule().handler({ ...invalidInput, dryRun: true });

      // Verify
      expect(response).toMatch(
        `Will experience ${
          MODULE_EXCEPTIONS.INVALID_INPUT
        }: because, Invalid email id(s) provided for one or more accounts to be moved. Invalid email id(s) "${invalidInput.configuration.accounts.map(
          item => item.email,
        )}"`,
      );
      expect(getOrganizationRootIdSpy).toHaveBeenCalled();
      expect(getOrganizationAccountsSpy).toHaveBeenCalled();
      expect(getOrganizationalUnitIdByPathSpy).toHaveBeenCalled();
      expect(getAccountDetailsFromOrganizationsByEmailSpy).toHaveBeenCalled();
      expect(getAccountIdSpy).toHaveBeenCalledTimes(0);
      expect(ListParentsCommand).toHaveBeenCalledTimes(invalidInput.configuration.accounts.length);
      expect(MoveAccountCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(invalidInput.configuration.accounts.length);
    });

    test('should throw error when accounts not part of AWS Organizations', async () => {
      // Setup
      getOrganizationalUnitIdByPathSpy.mockReturnValueOnce(dryRunInput.configuration.accounts[0].destinationOu);
      getOrganizationalUnitIdByPathSpy.mockReturnValueOnce(dryRunInput.configuration.accounts[1].destinationOu);

      getAccountDetailsFromOrganizationsByEmailSpy.mockReturnValueOnce(
        MOCK_CONSTANTS.MoveAccountsBatchModule.moveAccounts[0],
      );

      getAccountDetailsFromOrganizationsByEmailSpy.mockReturnValueOnce(undefined);

      mockSend.mockImplementation(command => {
        if (command instanceof ListParentsCommand) {
          return Promise.resolve({
            Parents: [MOCK_CONSTANTS.MoveAccountModule.currentParent],
          });
        }

        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new MoveAccountsBatchModule().handler(dryRunInput);

      // Verify
      expect(response).toContain(
        `Will experience ${MODULE_EXCEPTIONS.INVALID_INPUT}: because, there are Account(s) not part of AWS Organizations, could not retrieve account details.`,
      );
      expect(getOrganizationRootIdSpy).toHaveBeenCalled();
      expect(getOrganizationAccountsSpy).toHaveBeenCalled();
      expect(getOrganizationalUnitIdByPathSpy).toHaveBeenCalled();
      expect(getAccountDetailsFromOrganizationsByEmailSpy).toHaveBeenCalled();
      expect(getAccountIdSpy).toHaveBeenCalledTimes(0);
      expect(ListParentsCommand).toHaveBeenCalledTimes(dryRunInput.configuration.accounts.length - 1);
      expect(MoveAccountCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(dryRunInput.configuration.accounts.length - 1);
    });

    test('should throw error when account does not have parent OU or the account is not part of AWS Organizations', async () => {
      // Setup
      getOrganizationalUnitIdByPathSpy.mockReturnValueOnce(dryRunInput.configuration.accounts[0].destinationOu);
      getOrganizationalUnitIdByPathSpy.mockReturnValueOnce(dryRunInput.configuration.accounts[1].destinationOu);

      getAccountDetailsFromOrganizationsByEmailSpy.mockReturnValueOnce(
        MOCK_CONSTANTS.MoveAccountsBatchModule.moveAccounts[0],
      );
      getAccountDetailsFromOrganizationsByEmailSpy.mockReturnValueOnce({
        Id: undefined,
        Email: MOCK_CONSTANTS.MoveAccountsBatchModule.moveAccounts[1].Email,
      });

      mockSend.mockImplementation(command => {
        if (command instanceof ListParentsCommand) {
          return Promise.resolve({
            Parents: [MOCK_CONSTANTS.MoveAccountModule.currentParent],
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new MoveAccountsBatchModule().handler(dryRunInput);

      // Verify
      expect(response).toMatch(
        `${MODULE_EXCEPTIONS.INVALID_INPUT}: There are Account(s) without valid parent OU or the account not part of AWS Organizations.`,
      );
      expect(getOrganizationRootIdSpy).toHaveBeenCalled();
      expect(getOrganizationAccountsSpy).toHaveBeenCalled();
      expect(getOrganizationalUnitIdByPathSpy).toHaveBeenCalled();
      expect(getAccountDetailsFromOrganizationsByEmailSpy).toHaveBeenCalled();
      expect(getAccountIdSpy).toHaveBeenCalledTimes(0);
      expect(ListParentsCommand).toHaveBeenCalledTimes(dryRunInput.configuration.accounts.length - 1);
      expect(MoveAccountCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(dryRunInput.configuration.accounts.length - 1);
    });

    test('should throw error when account does not have parent OU and the account is not part of AWS Organizations', async () => {
      // Setup
      getOrganizationalUnitIdByPathSpy.mockReturnValueOnce(dryRunInput.configuration.accounts[0].destinationOu);
      getOrganizationalUnitIdByPathSpy.mockReturnValueOnce(undefined);

      getAccountDetailsFromOrganizationsByEmailSpy.mockReturnValueOnce(
        MOCK_CONSTANTS.MoveAccountsBatchModule.moveAccounts[0],
      );

      getAccountDetailsFromOrganizationsByEmailSpy.mockReturnValueOnce(undefined);

      mockSend.mockImplementation(command => {
        if (command instanceof ListParentsCommand) {
          return Promise.resolve({
            Parents: [MOCK_CONSTANTS.MoveAccountModule.currentParent],
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new MoveAccountsBatchModule().handler(dryRunInput);

      // Verify
      expect(response).toMatch(
        `${MODULE_EXCEPTIONS.INVALID_INPUT}: because, there are Account(s) for which could not retrieve destination ou and account details.`,
      );
      expect(getOrganizationRootIdSpy).toHaveBeenCalled();
      expect(getOrganizationAccountsSpy).toHaveBeenCalled();
      expect(getOrganizationalUnitIdByPathSpy).toHaveBeenCalled();
      expect(getAccountDetailsFromOrganizationsByEmailSpy).toHaveBeenCalled();
      expect(getAccountIdSpy).toHaveBeenCalledTimes(0);
      expect(ListParentsCommand).toHaveBeenCalledTimes(dryRunInput.configuration.accounts.length - 1);
      expect(MoveAccountCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(dryRunInput.configuration.accounts.length - 1);
    });
  });
});
