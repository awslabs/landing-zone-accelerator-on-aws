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
  AdminStatus,
  DisableOrganizationAdminAccountCommand,
  EnableMacieCommand,
  EnableOrganizationAdminAccountCommand,
  GetMacieSessionCommand,
  Macie2Client,
  MacieStatus,
  AccessDeniedException,
  paginateListOrganizationAdminAccounts,
} from '@aws-sdk/client-macie2';
import { MOCK_CONSTANTS } from '../../../mocked-resources';
import { MacieManageOrganizationAdminModule } from '../../../../lib/macie/manage-organization-admin';
import { MODULE_EXCEPTIONS } from '../../../../common/enums';
import { generateDryRunResponse } from '../../../../common/functions';
import { AcceleratorModuleName } from '../../../../common/resources';

vi.mock('@aws-sdk/client-macie2', async () => {
  const actual = await vi.importActual('@aws-sdk/client-macie2');
  return {
    ...actual,
    Macie2Client: vi.fn(),
    DisableOrganizationAdminAccountCommand: vi.fn(),
    EnableMacieCommand: vi.fn(),
    EnableOrganizationAdminAccountCommand: vi.fn(),
    GetMacieSessionCommand: vi.fn(),
    AccessDeniedException: vi.fn(),
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

describe('ManageOrganizationAdminModule', () => {
  const mockSend = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (Macie2Client as vi.Mock).mockImplementation(() => ({
      send: mockSend,
    }));
  });

  const setupSend = (macieEnabled: boolean, ...adminAccounts: AdminAccount[][][]) => {
    mockSend.mockImplementation(command => {
      if (command instanceof GetMacieSessionCommand) {
        if (macieEnabled) {
          return Promise.resolve({
            status: MacieStatus.ENABLED,
          });
        }
        return Promise.reject(new AccessDeniedException({ message: 'Macie is not enabled', $metadata: {} }));
      }
      if (command instanceof EnableOrganizationAdminAccountCommand) {
        return Promise.resolve({});
      }
      if (command instanceof DisableOrganizationAdminAccountCommand) {
        return Promise.resolve({});
      }
      if (command instanceof EnableMacieCommand) {
        if (macieEnabled) {
          return Promise.reject(new Error('Macie is already enabled'));
        }
        return Promise.resolve({});
      }
      return Promise.reject(MOCK_CONSTANTS.unknownError);
    });
    let callIndex = 0;
    (paginateListOrganizationAdminAccounts as vi.Mock).mockImplementation(() => {
      if (callIndex >= adminAccounts.length) {
        throw new Error('paginateListOrganizationAdminAccounts called too many times');
      }
      const accounts = adminAccounts[callIndex].map(accts => ({
        adminAccounts: accts,
      }));
      callIndex += 1;
      return accounts;
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
          expect(GetMacieSessionCommand).toHaveBeenCalledTimes(1);
          expect(EnableMacieCommand).toHaveBeenCalledTimes(0);
          expect(paginateListOrganizationAdminAccounts).toHaveBeenCalledTimes(2);
          expect(EnableOrganizationAdminAccountCommand).toHaveBeenCalledWith({
            adminAccountId: adminId,
          });
          expect(DisableOrganizationAdminAccountCommand).toHaveBeenCalledTimes(0);
        });

        test('should succeed when enabling with no admins', async () => {
          setupSend(true, [], [[{ accountId: adminId, status: AdminStatus.ENABLED }]]);

          const response = await new MacieManageOrganizationAdminModule().handler(input);
          expect(response).toMatch(`Successfully set Macie Organization Admin to AWS Account with ID ${adminId}`);
        });

        test('should succeed when enabling with disabled admins', async () => {
          setupSend(
            true,
            [
              [
                { accountId: 'disablingAdmin0', status: AdminStatus.DISABLING_IN_PROGRESS },
                { accountId: 'disablingAdmin1', status: AdminStatus.DISABLING_IN_PROGRESS },
              ],
            ],
            [
              [
                { accountId: 'disablingAdmin0', status: AdminStatus.DISABLING_IN_PROGRESS },
                { accountId: 'disablingAdmin1', status: AdminStatus.DISABLING_IN_PROGRESS },
              ],
              [{ accountId: adminId, status: AdminStatus.ENABLED }],
            ],
          );

          const response = await new MacieManageOrganizationAdminModule().handler(input);
          expect(response).toMatch(`Successfully set Macie Organization Admin to AWS Account with ID ${adminId}`);
        });

        test('should succeed when enabling with multiple pages of disabled admins', async () => {
          setupSend(
            true,
            [
              [{ accountId: 'disablingAdmin', status: AdminStatus.DISABLING_IN_PROGRESS }],
              [{ accountId: 'disablingAdmin2', status: AdminStatus.DISABLING_IN_PROGRESS }],
            ],
            [[{ accountId: adminId, status: AdminStatus.ENABLED }]],
          );

          const response = await new MacieManageOrganizationAdminModule().handler(input);
          expect(response).toMatch(`Successfully set Macie Organization Admin to AWS Account with ID ${adminId}`);
        });
      });

      describe('With Active Admin', () => {
        afterEach(() => {
          expect(GetMacieSessionCommand).toHaveBeenCalledTimes(1);
          expect(EnableMacieCommand).toHaveBeenCalledTimes(0);
          expect(paginateListOrganizationAdminAccounts).toHaveBeenCalledTimes(1);
          expect(EnableOrganizationAdminAccountCommand).toHaveBeenCalledTimes(0);
          expect(DisableOrganizationAdminAccountCommand).toHaveBeenCalledTimes(0);
        });

        test('should fail when enabling with active admin', async () => {
          const activeAdmin = 'activeAdmin';
          setupSend(true, [[{ accountId: activeAdmin, status: AdminStatus.ENABLED }]]);

          const promise = new MacieManageOrganizationAdminModule().handler(input);
          await expect(promise).rejects.toThrowError(
            `${MODULE_EXCEPTIONS.INVALID_INPUT}: Account with ID ${activeAdmin} is already set as the Macie Organization Admin, cannot additionally assign ${adminId}`,
          );
        });

        test('should fail when enabling with active admin on second page', async () => {
          const activeAdmin = 'activeAdmin';
          setupSend(true, [
            [{ accountId: 'disabledAdmin', status: AdminStatus.DISABLING_IN_PROGRESS }],
            [{ accountId: activeAdmin, status: AdminStatus.ENABLED }],
          ]);

          const promise = new MacieManageOrganizationAdminModule().handler(input);
          await expect(promise).rejects.toThrowError(
            `${MODULE_EXCEPTIONS.INVALID_INPUT}: Account with ID ${activeAdmin} is already set as the Macie Organization Admin, cannot additionally assign ${adminId}`,
          );
        });

        test('should succeed when requested account is already admin', async () => {
          setupSend(true, [
            [{ accountId: 'disabledAdmin', status: AdminStatus.DISABLING_IN_PROGRESS }],
            [{ accountId: adminId, status: AdminStatus.ENABLED }],
          ]);

          const response = await new MacieManageOrganizationAdminModule().handler(input);
          expect(response).toMatch(`AWS Account with ID ${adminId} is already the Macie Organization Admin`);
        });
      });
    });

    describe('Disable', () => {
      const input = getInput({ enable: false, dryRun: false });
      describe('Without Active Admin', () => {
        afterEach(() => {
          expect(GetMacieSessionCommand).toHaveBeenCalledTimes(1);
          expect(EnableMacieCommand).toHaveBeenCalledTimes(0);
          expect(paginateListOrganizationAdminAccounts).toHaveBeenCalledTimes(1);
          expect(EnableOrganizationAdminAccountCommand).toHaveBeenCalledTimes(0);
          expect(DisableOrganizationAdminAccountCommand).toHaveBeenCalledTimes(0);
        });

        test('should succeed when disabling with no admins', async () => {
          setupSend(true, []);

          const response = await new MacieManageOrganizationAdminModule().handler(input);
          expect(response).toMatch(
            `There is no Organization Admin currently set, so AWS Account with ID ${adminId} was not removed`,
          );
        });

        test('should succeed when disabling with disabled admins', async () => {
          setupSend(true, [
            [
              { accountId: 'disablingAdmin0', status: AdminStatus.DISABLING_IN_PROGRESS },
              { accountId: 'disablingAdmin1', status: AdminStatus.DISABLING_IN_PROGRESS },
            ],
          ]);

          const response = await new MacieManageOrganizationAdminModule().handler(input);
          expect(response).toMatch(
            `There is no Organization Admin currently set, so AWS Account with ID ${adminId} was not removed`,
          );
        });

        test('should succeed when disabling with multiple pages of disabled admins', async () => {
          setupSend(true, [
            [{ accountId: 'disablingAdmin', status: AdminStatus.DISABLING_IN_PROGRESS }],
            [{ accountId: 'disablingAdmin2', status: AdminStatus.DISABLING_IN_PROGRESS }],
          ]);

          const response = await new MacieManageOrganizationAdminModule().handler(input);
          expect(response).toMatch(
            `There is no Organization Admin currently set, so AWS Account with ID ${adminId} was not removed`,
          );
        });
      });

      describe('With Active Admin', () => {
        test('should fail when disabling with different active admin', async () => {
          const activeAdmin = 'activeAdmin';
          setupSend(true, [[{ accountId: activeAdmin, status: AdminStatus.ENABLED }]]);

          const promise = new MacieManageOrganizationAdminModule().handler(input);
          await expect(promise).rejects.toThrowError(
            `${MODULE_EXCEPTIONS.INVALID_INPUT}: Could not remove Account with ID ${adminId} as Macie Organization Admin because the current Admin is AWS Account with ID ${activeAdmin}`,
          );
          expect(GetMacieSessionCommand).toHaveBeenCalledTimes(1);
          expect(EnableMacieCommand).toHaveBeenCalledTimes(0);
          expect(paginateListOrganizationAdminAccounts).toHaveBeenCalledTimes(1);
          expect(EnableOrganizationAdminAccountCommand).toHaveBeenCalledTimes(0);
          expect(DisableOrganizationAdminAccountCommand).toHaveBeenCalledTimes(0);
        });

        test('should fail when disabling with diffferent active admin on second page', async () => {
          const activeAdmin = 'activeAdmin';
          setupSend(true, [
            [{ accountId: 'disabledAdmin', status: AdminStatus.DISABLING_IN_PROGRESS }],
            [{ accountId: activeAdmin, status: AdminStatus.ENABLED }],
          ]);

          const promise = new MacieManageOrganizationAdminModule().handler(input);
          await expect(promise).rejects.toThrowError(
            `${MODULE_EXCEPTIONS.INVALID_INPUT}: Could not remove Account with ID ${adminId} as Macie Organization Admin because the current Admin is AWS Account with ID ${activeAdmin}`,
          );
          expect(GetMacieSessionCommand).toHaveBeenCalledTimes(1);
          expect(EnableMacieCommand).toHaveBeenCalledTimes(0);
          expect(paginateListOrganizationAdminAccounts).toHaveBeenCalledTimes(1);
          expect(EnableOrganizationAdminAccountCommand).toHaveBeenCalledTimes(0);
          expect(DisableOrganizationAdminAccountCommand).toHaveBeenCalledTimes(0);
        });

        test('should succeed when disabling with same active admin', async () => {
          setupSend(
            true,
            [
              [{ accountId: 'disabledAdmin', status: AdminStatus.DISABLING_IN_PROGRESS }],
              [{ accountId: adminId, status: AdminStatus.ENABLED }],
            ],
            [
              [{ accountId: 'disabledAdmin', status: AdminStatus.DISABLING_IN_PROGRESS }],
              [{ accountId: adminId, status: AdminStatus.DISABLING_IN_PROGRESS }],
            ],
            [[{ accountId: 'disabledAdmin', status: AdminStatus.DISABLING_IN_PROGRESS }]],
          );

          const response = await new MacieManageOrganizationAdminModule().handler(input);
          expect(response).toMatch(`Successfully removed AWS Account with ID ${adminId} as Macie Organization Admin`);
          expect(GetMacieSessionCommand).toHaveBeenCalledTimes(1);
          expect(EnableMacieCommand).toHaveBeenCalledTimes(0);
          expect(paginateListOrganizationAdminAccounts).toHaveBeenCalledTimes(3);
          expect(EnableOrganizationAdminAccountCommand).toHaveBeenCalledTimes(0);
          expect(DisableOrganizationAdminAccountCommand).toHaveBeenCalledTimes(1);
        });
      });
    });

    describe('Macie Disabled', () => {
      test('should succeed when disabling', async () => {
        let getCallCount = 0;
        mockSend.mockImplementation(command => {
          if (command instanceof GetMacieSessionCommand) {
            if (getCallCount == 0) {
              getCallCount += 1;
              return Promise.reject(new AccessDeniedException({ message: 'Macie is not enabled', $metadata: {} }));
            }
            return Promise.resolve({
              status: MacieStatus.ENABLED,
            });
          }
          if (command instanceof EnableMacieCommand) {
            return Promise.resolve({});
          }
          return Promise.reject(MOCK_CONSTANTS.unknownError);
        });

        const input = getInput({ enable: false, dryRun: false });

        const status = await new MacieManageOrganizationAdminModule().handler(input);
        expect(status).toMatch(
          `There is no Organization Admin currently set, so AWS Account with ID ${adminId} was not removed`,
        );

        expect(GetMacieSessionCommand).toHaveBeenCalledTimes(2);
        expect(EnableMacieCommand).toHaveBeenCalledTimes(1);
        expect(paginateListOrganizationAdminAccounts).toHaveBeenCalledTimes(0);
        expect(EnableOrganizationAdminAccountCommand).toHaveBeenCalledTimes(0);
        expect(DisableOrganizationAdminAccountCommand).toHaveBeenCalledTimes(0);
      });

      test('should succeed when enabling', async () => {
        let getCallCount = 0;
        mockSend.mockImplementation(command => {
          if (command instanceof GetMacieSessionCommand) {
            if (getCallCount == 0) {
              getCallCount += 1;
              return Promise.reject(new AccessDeniedException({ message: 'Macie is not enabled', $metadata: {} }));
            }
            return Promise.resolve({
              status: MacieStatus.ENABLED,
            });
          }
          if (command instanceof EnableMacieCommand) {
            return Promise.resolve({});
          }
          if (command instanceof EnableOrganizationAdminAccountCommand) {
            return Promise.resolve({});
          }
          return Promise.reject(MOCK_CONSTANTS.unknownError);
        });
        let callIndex = 0;
        (paginateListOrganizationAdminAccounts as vi.Mock).mockImplementation(() => {
          if (callIndex == 0) {
            callIndex += 1;
            return [{}];
          }
          return [{ adminAccounts: [{ accountId: adminId, status: AdminStatus.ENABLED }] }];
        });
        const input = getInput({ enable: true, dryRun: false });

        const response = await new MacieManageOrganizationAdminModule().handler(input);
        expect(response).toMatch(`Successfully set Macie Organization Admin to AWS Account with ID ${adminId}`);
      });
    });
  });

  const dryRunResponse = (string: string) =>
    generateDryRunResponse(AcceleratorModuleName.AWS_MACIE, MOCK_CONSTANTS.runnerParameters.operation, string);

  describe('Dry Run', () => {
    afterEach(() => {
      expect(EnableMacieCommand).toHaveBeenCalledTimes(0);
      expect(EnableOrganizationAdminAccountCommand).toHaveBeenCalledTimes(0);
      expect(DisableOrganizationAdminAccountCommand).toHaveBeenCalledTimes(0);
    });

    describe('Enable', () => {
      const input = getInput({ enable: true, dryRun: true });

      describe('Without Active Admin', () => {
        test('should succeed when enabling with no admins', async () => {
          setupSend(true, []);

          const response = await new MacieManageOrganizationAdminModule().handler(input);
          expect(response).toMatch(
            dryRunResponse(`AWS Account with ID ${adminId} will be set as the Macie Organization Admin`),
          );
          expect(GetMacieSessionCommand).toHaveBeenCalledTimes(1);
          expect(paginateListOrganizationAdminAccounts).toHaveBeenCalledTimes(1);
        });

        test('should succeed when enabling with disabled admins', async () => {
          setupSend(true, [
            [
              { accountId: 'disablingAdmin0', status: AdminStatus.DISABLING_IN_PROGRESS },
              { accountId: 'disablingAdmin1', status: AdminStatus.DISABLING_IN_PROGRESS },
            ],
          ]);

          const response = await new MacieManageOrganizationAdminModule().handler(input);
          expect(response).toMatch(
            dryRunResponse(`AWS Account with ID ${adminId} will be set as the Macie Organization Admin`),
          );
          expect(GetMacieSessionCommand).toHaveBeenCalledTimes(1);
          expect(paginateListOrganizationAdminAccounts).toHaveBeenCalledTimes(1);
        });

        test('should succeed when enabling with multiple pages of disabled admins', async () => {
          setupSend(true, [
            [{ accountId: 'disablingAdmin', status: AdminStatus.DISABLING_IN_PROGRESS }],
            [{ accountId: 'disablingAdmin2', status: AdminStatus.DISABLING_IN_PROGRESS }],
          ]);

          const response = await new MacieManageOrganizationAdminModule().handler(input);
          expect(response).toMatch(
            dryRunResponse(`AWS Account with ID ${adminId} will be set as the Macie Organization Admin`),
          );
          expect(GetMacieSessionCommand).toHaveBeenCalledTimes(1);
          expect(paginateListOrganizationAdminAccounts).toHaveBeenCalledTimes(1);
        });
      });

      describe('With Active Admin', () => {
        test('should fail when enabling with active admin', async () => {
          const activeAdmin = 'activeAdmin';
          setupSend(true, [[{ accountId: activeAdmin, status: AdminStatus.ENABLED }]]);
          const input = getInput({ enable: true, dryRun: true });

          const response = await new MacieManageOrganizationAdminModule().handler(input);

          expect(response).toMatch(
            dryRunResponse(
              `Will experience ${MODULE_EXCEPTIONS.INVALID_INPUT} because the Macie Organization Administrator is already set to ${activeAdmin}, cannot additionally assign ${adminId}`,
            ),
          );
          expect(GetMacieSessionCommand).toHaveBeenCalledTimes(1);
          expect(paginateListOrganizationAdminAccounts).toHaveBeenCalledTimes(1);
        });

        test('should fail when enabling with active admin on second page', async () => {
          const activeAdmin = 'activeAdmin';
          setupSend(true, [
            [{ accountId: 'disabledAdmin', status: AdminStatus.DISABLING_IN_PROGRESS }],
            [{ accountId: activeAdmin, status: AdminStatus.ENABLED }],
          ]);

          const response = await new MacieManageOrganizationAdminModule().handler(input);
          expect(response).toMatch(
            dryRunResponse(
              `Will experience ${MODULE_EXCEPTIONS.INVALID_INPUT} because the Macie Organization Administrator is already set to ${activeAdmin}, cannot additionally assign ${adminId}`,
            ),
          );
          expect(GetMacieSessionCommand).toHaveBeenCalledTimes(1);
          expect(paginateListOrganizationAdminAccounts).toHaveBeenCalledTimes(1);
        });

        test('should succeed when requested account is already admin', async () => {
          setupSend(true, [
            [{ accountId: 'disabledAdmin', status: AdminStatus.DISABLING_IN_PROGRESS }],
            [{ accountId: adminId, status: AdminStatus.ENABLED }],
          ]);

          const response = await new MacieManageOrganizationAdminModule().handler(input);
          expect(response).toMatch(
            dryRunResponse(`AWS Account with ID ${adminId} is already the Macie Organization Administrator`),
          );
          expect(GetMacieSessionCommand).toHaveBeenCalledTimes(1);
          expect(paginateListOrganizationAdminAccounts).toHaveBeenCalledTimes(1);
        });
      });
    });

    describe('Disable', () => {
      const input = getInput({ enable: false, dryRun: true });

      describe('Without Active Admin', () => {
        test('should not fail when disabling with no admins', async () => {
          setupSend(true, []);

          const response = await new MacieManageOrganizationAdminModule().handler(input);
          expect(response).toMatch(
            dryRunResponse(
              `There is no Organization Admin currently set, so AWS Account with ID ${adminId} will not need to be removed`,
            ),
          );
          expect(GetMacieSessionCommand).toHaveBeenCalledTimes(1);
          expect(paginateListOrganizationAdminAccounts).toHaveBeenCalledTimes(1);
        });

        test('should not fail when disabling with disabled admins', async () => {
          setupSend(true, [
            [
              { accountId: 'disablingAdmin0', status: AdminStatus.DISABLING_IN_PROGRESS },
              { accountId: 'disablingAdmin1', status: AdminStatus.DISABLING_IN_PROGRESS },
            ],
          ]);

          const response = await new MacieManageOrganizationAdminModule().handler(input);
          expect(response).toMatch(
            dryRunResponse(
              `There is no Organization Admin currently set, so AWS Account with ID ${adminId} will not need to be removed`,
            ),
          );
          expect(GetMacieSessionCommand).toHaveBeenCalledTimes(1);
          expect(paginateListOrganizationAdminAccounts).toHaveBeenCalledTimes(1);
        });

        test('should not fail when disabling with multiple pages of disabled admins', async () => {
          setupSend(true, [
            [{ accountId: 'disablingAdmin', status: AdminStatus.DISABLING_IN_PROGRESS }],
            [{ accountId: 'disablingAdmin2', status: AdminStatus.DISABLING_IN_PROGRESS }],
          ]);

          const response = await new MacieManageOrganizationAdminModule().handler(input);
          expect(response).toMatch(
            dryRunResponse(
              `There is no Organization Admin currently set, so AWS Account with ID ${adminId} will not need to be removed`,
            ),
          );
          expect(GetMacieSessionCommand).toHaveBeenCalledTimes(1);
          expect(paginateListOrganizationAdminAccounts).toHaveBeenCalledTimes(1);
        });
      });

      describe('With Active Admin', () => {
        test('should fail when disabling with different active admin', async () => {
          const activeAdmin = 'activeAdmin';
          setupSend(true, [[{ accountId: activeAdmin, status: AdminStatus.ENABLED }]]);

          const response = await new MacieManageOrganizationAdminModule().handler(input);
          expect(response).toMatch(
            dryRunResponse(
              `Will experience ${MODULE_EXCEPTIONS.INVALID_INPUT} because AWS Account with ID ${activeAdmin} is currently set as the Macie Organization Admin, which differs from the expected account ${adminId}`,
            ),
          );
          expect(GetMacieSessionCommand).toHaveBeenCalledTimes(1);
          expect(paginateListOrganizationAdminAccounts).toHaveBeenCalledTimes(1);
        });

        test('should fail when disabling with diffferent active admin on second page', async () => {
          const activeAdmin = 'activeAdmin';
          setupSend(true, [
            [{ accountId: 'disabledAdmin', status: AdminStatus.DISABLING_IN_PROGRESS }],
            [{ accountId: activeAdmin, status: AdminStatus.ENABLED }],
          ]);

          const response = await new MacieManageOrganizationAdminModule().handler(input);
          expect(response).toMatch(
            dryRunResponse(
              `Will experience ${MODULE_EXCEPTIONS.INVALID_INPUT} because AWS Account with ID ${activeAdmin} is currently set as the Macie Organization Admin, which differs from the expected account ${adminId}`,
            ),
          );
          expect(GetMacieSessionCommand).toHaveBeenCalledTimes(1);
          expect(paginateListOrganizationAdminAccounts).toHaveBeenCalledTimes(1);
        });

        test('should succeed when disabling with same active admin', async () => {
          setupSend(true, [
            [{ accountId: 'disabledAdmin', status: AdminStatus.DISABLING_IN_PROGRESS }],
            [{ accountId: adminId, status: AdminStatus.ENABLED }],
          ]);

          const response = await new MacieManageOrganizationAdminModule().handler(input);
          expect(response).toMatch(
            dryRunResponse(`AWS Account with ID ${adminId} will be removed as Macie Organization Administrator`),
          );
          expect(GetMacieSessionCommand).toHaveBeenCalledTimes(1);
          expect(paginateListOrganizationAdminAccounts).toHaveBeenCalledTimes(1);
        });
      });
    });

    describe('Macie Disabled', () => {
      test('should succeed when disabling', async () => {
        setupSend(false, []);
        const input = getInput({ enable: false, dryRun: true });

        const response = await new MacieManageOrganizationAdminModule().handler(input);
        expect(response).toMatch(
          dryRunResponse(
            `Macie is not enabled, so there is no Organization Admin currently set, so AWS Account with ID ${adminId} will not need to be removed`,
          ),
        );
        expect(GetMacieSessionCommand).toHaveBeenCalledTimes(1);
        expect(paginateListOrganizationAdminAccounts).toHaveBeenCalledTimes(0);
      });

      test('should succeed when enabling', async () => {
        setupSend(false, []);
        const input = getInput({ enable: true, dryRun: true });

        const response = await new MacieManageOrganizationAdminModule().handler(input);
        expect(response).toMatch(
          dryRunResponse(`AWS Account with ID ${adminId} will be set as the Macie Organization Admin`),
        );
        expect(GetMacieSessionCommand).toHaveBeenCalledTimes(1);
        expect(paginateListOrganizationAdminAccounts).toHaveBeenCalledTimes(0);
      });
    });
  });

  describe('API Errors', () => {
    const accessDenied = new AccessDeniedException({ message: 'message', $metadata: {} });

    test('should not fail when getting macie session gets access denied exception', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof GetMacieSessionCommand) {
          return Promise.reject(accessDenied);
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });
      (paginateListOrganizationAdminAccounts as vi.Mock).mockImplementation(() => []);

      const input = getInput({ enable: true, dryRun: true });
      const response = await new MacieManageOrganizationAdminModule().handler(input);

      expect(response).toMatch(
        dryRunResponse(`AWS Account with ID ${adminId} will be set as the Macie Organization Admin`),
      );
    });

    test('should fail when getting macie session throws error', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof GetMacieSessionCommand) {
          return Promise.reject(MOCK_CONSTANTS.serviceError);
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const input = getInput({ enable: true, dryRun: true });
      const promise = new MacieManageOrganizationAdminModule().handler(input);

      await expect(promise).rejects.toStrictEqual(MOCK_CONSTANTS.serviceError);
    });

    test('should fail when listing admins throws error', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof GetMacieSessionCommand) {
          return Promise.resolve({ status: MacieStatus.ENABLED });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });
      (paginateListOrganizationAdminAccounts as vi.Mock).mockImplementation(() => {
        return [Promise.reject(MOCK_CONSTANTS.serviceError)];
      });

      const input = getInput({ enable: true, dryRun: true });
      const promise = new MacieManageOrganizationAdminModule().handler(input);

      await expect(promise).rejects.toStrictEqual(MOCK_CONSTANTS.serviceError);
    });

    test('should fail when listing admins throws service exception', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof GetMacieSessionCommand) {
          return Promise.resolve({ status: MacieStatus.ENABLED });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });
      (paginateListOrganizationAdminAccounts as vi.Mock).mockImplementation(() => {
        return [Promise.reject(accessDenied)];
      });

      const input = getInput({ enable: true, dryRun: true });
      const promise = new MacieManageOrganizationAdminModule().handler(input);

      await expect(promise).rejects.toThrowError(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Could not run ListOrganizationAdminAccountsCommand because you must be a user of the management account`,
      );
    });

    test('should fail when there are multiple admin accounts', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof GetMacieSessionCommand) {
          return Promise.resolve({ status: MacieStatus.ENABLED });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });
      (paginateListOrganizationAdminAccounts as vi.Mock).mockImplementation(() => [
        {
          adminAccounts: [
            { accountId: adminId, status: AdminStatus.ENABLED },
            { accountId: adminId + '2', status: AdminStatus.ENABLED },
          ],
        },
      ]);

      const input = getInput({ enable: true, dryRun: true });
      const promise = new MacieManageOrganizationAdminModule().handler(input);

      await expect(promise).rejects.toThrowError(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: ListOrganizationAdminAccountsCommand returned more than one enabled admin account`,
      );
    });

    test('should fail when enabling throws error', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof GetMacieSessionCommand) {
          return Promise.resolve({ status: MacieStatus.ENABLED });
        }
        if (command instanceof EnableOrganizationAdminAccountCommand) {
          return Promise.reject(MOCK_CONSTANTS.serviceError);
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });
      (paginateListOrganizationAdminAccounts as vi.Mock).mockImplementation(() => []);

      const input = getInput({ enable: true, dryRun: false });
      const promise = new MacieManageOrganizationAdminModule().handler(input);

      await expect(promise).rejects.toStrictEqual(MOCK_CONSTANTS.serviceError);
    });

    test('should fail when disabling throws error', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof GetMacieSessionCommand) {
          return Promise.resolve({ status: MacieStatus.ENABLED });
        }
        if (command instanceof DisableOrganizationAdminAccountCommand) {
          return Promise.reject(MOCK_CONSTANTS.serviceError);
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });
      (paginateListOrganizationAdminAccounts as vi.Mock).mockImplementation(() => [
        {
          adminAccounts: [{ accountId: adminId, status: AdminStatus.ENABLED }],
        },
      ]);

      const input = getInput({ enable: false, dryRun: false });
      const promise = new MacieManageOrganizationAdminModule().handler(input);

      await expect(promise).rejects.toStrictEqual(MOCK_CONSTANTS.serviceError);
    });

    test('should fail when enabling and admin never shows up', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof GetMacieSessionCommand) {
          return Promise.resolve({ status: MacieStatus.ENABLED });
        }
        if (command instanceof EnableOrganizationAdminAccountCommand) {
          return Promise.resolve({});
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });
      (paginateListOrganizationAdminAccounts as vi.Mock).mockImplementation(() => []);

      const input = getInput({ enable: true, dryRun: false });
      const promise = new MacieManageOrganizationAdminModule().handler(input);

      await expect(promise).rejects.toThrowError(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Could not get confirmation that Macie Organization admin was set to ${adminId}`,
      );
    });

    test('should fail when disabling and admin never goes away', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof GetMacieSessionCommand) {
          return Promise.resolve({ status: MacieStatus.ENABLED });
        }
        if (command instanceof DisableOrganizationAdminAccountCommand) {
          return Promise.resolve({});
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });
      let callIndex = 0;
      (paginateListOrganizationAdminAccounts as vi.Mock).mockImplementation(() => {
        if (callIndex == 0) {
          callIndex += 1;
          return [{ adminAccounts: [{ accountId: adminId, status: AdminStatus.ENABLED }] }];
        }
        return [{ adminAccounts: [{ accountId: adminId, status: AdminStatus.DISABLING_IN_PROGRESS }] }];
      });

      const input = getInput({ enable: false, dryRun: false });
      const promise = new MacieManageOrganizationAdminModule().handler(input);

      await expect(promise).rejects.toThrowError(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Could not get confirmation that ${adminId} was removed as Macie Organization Admin`,
      );
    });
  });
});
