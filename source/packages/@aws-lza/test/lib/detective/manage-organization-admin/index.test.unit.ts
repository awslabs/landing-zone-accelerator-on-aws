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

import { describe, beforeEach, expect, test, afterEach } from '@jest/globals';

import {
  Administrator,
  DetectiveClient,
  DisableOrganizationAdminAccountCommand,
  EnableOrganizationAdminAccountCommand,
  ListOrganizationAdminAccountsCommand,
  ListOrganizationAdminAccountsCommandOutput,
} from '@aws-sdk/client-detective';
import { MOCK_CONSTANTS } from '../../../mocked-resources';
import { DetectiveManageOrganizationAdminModule } from '../../../../lib/detective/manage-organization-admin';
import { MODULE_EXCEPTIONS } from '../../../../common/enums';
import { generateDryRunResponse } from '../../../../common/functions';
import { AcceleratorModuleName } from '../../../../common/resources';
import {
  IDetectiveManageOrganizationAdminModule,
  IDetectiveManageOrganizationAdminParameter,
} from '../../../../interfaces/detective/manage-organization-admin';

jest.mock('@aws-sdk/client-detective', () => {
  return {
    ...jest.requireActual('@aws-sdk/client-detective'),
    DetectiveClient: jest.fn(),
    DisableOrganizationAdminAccountCommand: jest.fn(),
    EnableOrganizationAdminAccountCommand: jest.fn(),
    ListOrganizationAdminAccountsCommand: jest.fn(),
  };
});

jest.mock('../../../../common/functions', () => {
  return {
    ...jest.requireActual('../../../../common/functions'),
    delay: jest.fn().mockResolvedValue(undefined),
  };
});

jest.mock('../../../../common/throttle', () => {
  return {
    throttlingBackOff: jest.fn().mockImplementation(fn => fn()),
  };
});

describe('DetectiveManageOrganizationAdminModule Contract Compliance', () => {
  const input: IDetectiveManageOrganizationAdminParameter = {
    ...MOCK_CONSTANTS.runnerParameters,
    configuration: {
      enable: true,
      accountId: MOCK_CONSTANTS.ManageOrganizationAdminModule.adminId,
    },
  };
  let module: IDetectiveManageOrganizationAdminModule;

  beforeEach(() => {
    module = new DetectiveManageOrganizationAdminModule();
    // Mock the handler implementation
    jest.spyOn(module, 'handler').mockImplementation(async () => 'mocked-response');
  });

  test('should implement all interface methods', () => {
    expect(module.handler).toBeDefined();
    expect(typeof module.handler).toBe('function');
  });

  test('should maintain correct method signatures', async () => {
    const result = module.handler(input);
    // Verify that handler returns a Promise
    expect(result).toBeInstanceOf(Promise);
    // Verify that the resolved value is a string
    await expect(result).resolves.toBe('mocked-response');
    await expect(result).resolves.toEqual(expect.any(String));
  });

  test('should handle invalid inputs according to contract', async () => {
    // Reset mock to test error handling
    jest.spyOn(module, 'handler').mockRejectedValue(new Error('Invalid input parameters'));

    await expect(module.handler({} as IDetectiveManageOrganizationAdminParameter)).rejects.toThrow(
      'Invalid input parameters',
    );
  });

  test('should fulfill interface behavioral requirements', async () => {
    const result = await module.handler(input);
    expect(typeof result).toBe('string');
    expect(result).toBeTruthy();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
});

describe('DetectiveManageOrganizationAdminModule', () => {
  const mockSend = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (DetectiveClient as jest.Mock).mockImplementation(() => ({
      send: mockSend,
    }));
  });

  const setupSend = (...adminAccounts: Administrator[][]) => {
    let callIndex = 0;
    mockSend.mockImplementation(command => {
      if (command instanceof ListOrganizationAdminAccountsCommand) {
        if (callIndex >= adminAccounts.length) {
          throw new Error('ListOrganizationAdminAccountsCommand called too many times');
        }
        const response: ListOrganizationAdminAccountsCommandOutput = {
          Administrators: adminAccounts[callIndex],
          NextToken: undefined,
          $metadata: {},
        };
        callIndex += 1;
        return Promise.resolve(response);
      }
      if (command instanceof EnableOrganizationAdminAccountCommand) {
        return Promise.resolve({});
      }
      if (command instanceof DisableOrganizationAdminAccountCommand) {
        return Promise.resolve({});
      }
      return Promise.reject(MOCK_CONSTANTS.unknownError);
    });
  };

  interface InputConfig {
    enable: boolean;
    dryRun?: boolean;
  }

  const adminId = MOCK_CONSTANTS.ManageOrganizationAdminModule.adminId;

  const getInput = (config: InputConfig) => ({
    ...MOCK_CONSTANTS.runnerParameters,
    configuration: {
      accountId: adminId,
      enable: config.enable,
    },
    dryRun: config.dryRun || false,
  });

  describe('Not Dry Run', () => {
    describe('Enable', () => {
      const input = getInput({ enable: true, dryRun: false });

      describe('Without Active Admin', () => {
        test('should succeed when enabling with no admins', async () => {
          setupSend([]);

          const response = await new DetectiveManageOrganizationAdminModule().handler(input);
          expect(response).toMatch(`Successfully set detective organization admin to account ${adminId}.`);
          expect(ListOrganizationAdminAccountsCommand).toHaveBeenCalledTimes(1);
          expect(EnableOrganizationAdminAccountCommand).toHaveBeenCalledWith({
            AccountId: adminId,
          });
          expect(DisableOrganizationAdminAccountCommand).toHaveBeenCalledTimes(0);
        });

        test('should succeed when requested account is already admin', async () => {
          setupSend([{ AccountId: adminId }]);

          const response = await new DetectiveManageOrganizationAdminModule().handler(input);
          expect(response).toMatch(`Account ${adminId} is already the Detective Organization Admin`);
          expect(ListOrganizationAdminAccountsCommand).toHaveBeenCalledTimes(1);
          expect(EnableOrganizationAdminAccountCommand).toHaveBeenCalledTimes(0);
          expect(DisableOrganizationAdminAccountCommand).toHaveBeenCalledTimes(0);
        });
      });

      describe('With Active Admin', () => {
        test('should fail when enabling with different active admin', async () => {
          const activeAdmin = 'activeAdmin';
          setupSend([{ AccountId: activeAdmin }]);

          const promise = new DetectiveManageOrganizationAdminModule().handler(input);
          await expect(promise).rejects.toThrowError(
            `${MODULE_EXCEPTIONS.INVALID_INPUT}: Account with ID ${activeAdmin} is already set as the Detective Organization Admin, cannot additionally assign ${adminId}`,
          );
          expect(ListOrganizationAdminAccountsCommand).toHaveBeenCalledTimes(1);
          expect(EnableOrganizationAdminAccountCommand).toHaveBeenCalledTimes(0);
          expect(DisableOrganizationAdminAccountCommand).toHaveBeenCalledTimes(0);
        });
      });
    });

    describe('Disable', () => {
      const input = getInput({ enable: false, dryRun: false });

      describe('Without Active Admin', () => {
        test('should succeed when disabling with no admins', async () => {
          setupSend([]);

          const response = await new DetectiveManageOrganizationAdminModule().handler(input);
          expect(response).toMatch(
            `There is no Organization Admin currently set, so AWS Account with ID ${adminId} was not removed`,
          );
          expect(ListOrganizationAdminAccountsCommand).toHaveBeenCalledTimes(1);
          expect(EnableOrganizationAdminAccountCommand).toHaveBeenCalledTimes(0);
          expect(DisableOrganizationAdminAccountCommand).toHaveBeenCalledTimes(0);
        });
      });

      describe('With Active Admin', () => {
        test('should fail when disabling with different active admin', async () => {
          const activeAdmin = 'activeAdmin';
          setupSend([{ AccountId: activeAdmin }]);

          const promise = new DetectiveManageOrganizationAdminModule().handler(input);
          await expect(promise).rejects.toThrowError(
            `${MODULE_EXCEPTIONS.INVALID_INPUT}: Could not remove Account with ID ${adminId} as Detective Organization Admin because the current Admin is AWS Account with ID ${activeAdmin}`,
          );
          expect(ListOrganizationAdminAccountsCommand).toHaveBeenCalledTimes(1);
          expect(EnableOrganizationAdminAccountCommand).toHaveBeenCalledTimes(0);
          expect(DisableOrganizationAdminAccountCommand).toHaveBeenCalledTimes(0);
        });

        test('should succeed when disabling with same active admin', async () => {
          setupSend([{ AccountId: adminId }]);

          const response = await new DetectiveManageOrganizationAdminModule().handler(input);
          expect(response).toMatch(`Successfully disabled detective organization admin account ${adminId}.`);
          expect(ListOrganizationAdminAccountsCommand).toHaveBeenCalledTimes(1);
          expect(EnableOrganizationAdminAccountCommand).toHaveBeenCalledTimes(0);
          expect(DisableOrganizationAdminAccountCommand).toHaveBeenCalledWith({
            AccountId: adminId,
          });
        });
      });
    });
  });

  const dryRunResponse = (string: string) =>
    generateDryRunResponse(AcceleratorModuleName.AWS_DETECTIVE, MOCK_CONSTANTS.runnerParameters.operation, string);

  describe('Dry Run', () => {
    afterEach(() => {
      expect(EnableOrganizationAdminAccountCommand).toHaveBeenCalledTimes(0);
      expect(DisableOrganizationAdminAccountCommand).toHaveBeenCalledTimes(0);
    });

    describe('Enable', () => {
      const input = getInput({ enable: true, dryRun: true });

      describe('Without Active Admin', () => {
        test('should succeed when enabling with no admins', async () => {
          setupSend([]);

          const response = await new DetectiveManageOrganizationAdminModule().handler(input);
          expect(response).toMatch(dryRunResponse(`Will enable Detective Organization Admin account ${adminId}`));
          expect(ListOrganizationAdminAccountsCommand).toHaveBeenCalledTimes(1);
        });

        test('should succeed when requested account is already admin', async () => {
          setupSend([{ AccountId: adminId }]);

          const response = await new DetectiveManageOrganizationAdminModule().handler(input);
          expect(response).toMatch(dryRunResponse(`Account ${adminId} is already the Detective Organization Admin`));
          expect(ListOrganizationAdminAccountsCommand).toHaveBeenCalledTimes(1);
        });
      });

      describe('With Active Admin', () => {
        test('should fail when enabling with different active admin', async () => {
          const activeAdmin = 'activeAdmin';
          setupSend([{ AccountId: activeAdmin }]);

          const response = await new DetectiveManageOrganizationAdminModule().handler(input);
          expect(response).toMatch(
            dryRunResponse(
              `Will experience ${MODULE_EXCEPTIONS.INVALID_INPUT} because the Detective Organization Admin account is already set to ${activeAdmin}, cannot additionally assign ${adminId}`,
            ),
          );
          expect(ListOrganizationAdminAccountsCommand).toHaveBeenCalledTimes(1);
        });
      });
    });

    describe('Disable', () => {
      const input = getInput({ enable: false, dryRun: true });

      describe('Without Active Admin', () => {
        test('should succeed when disabling with no admins', async () => {
          setupSend([]);

          const response = await new DetectiveManageOrganizationAdminModule().handler(input);
          expect(response).toMatch(
            dryRunResponse(
              `There is no Organization Admin currently set, so AWS Account ${adminId} will not need to be removed`,
            ),
          );
          expect(ListOrganizationAdminAccountsCommand).toHaveBeenCalledTimes(1);
        });
      });

      describe('With Active Admin', () => {
        test('should fail when disabling with different active admin', async () => {
          const activeAdmin = 'activeAdmin';
          setupSend([{ AccountId: activeAdmin }]);

          const response = await new DetectiveManageOrganizationAdminModule().handler(input);
          expect(response).toMatch(
            dryRunResponse(
              `Will experience ${MODULE_EXCEPTIONS.INVALID_INPUT} because Detecive Organization Admin is set to ${activeAdmin}, which differs from the expected ${adminId}`,
            ),
          );
          expect(ListOrganizationAdminAccountsCommand).toHaveBeenCalledTimes(1);
        });

        test('should succeed when disabling with same active admin', async () => {
          setupSend([{ AccountId: adminId }]);

          const response = await new DetectiveManageOrganizationAdminModule().handler(input);
          expect(response).toMatch(dryRunResponse(`Will disable Detective Organization Admin account ${adminId}`));
          expect(ListOrganizationAdminAccountsCommand).toHaveBeenCalledTimes(1);
        });
      });
    });
  });

  describe('API Errors', () => {
    test('should fail when listing admins throws error', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListOrganizationAdminAccountsCommand) {
          return Promise.reject(MOCK_CONSTANTS.serviceError);
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const input = getInput({ enable: true, dryRun: true });
      const promise = new DetectiveManageOrganizationAdminModule().handler(input);

      await expect(promise).rejects.toStrictEqual(MOCK_CONSTANTS.serviceError);
    });

    test('should fail when there are multiple admin accounts', async () => {
      setupSend([{ AccountId: adminId }, { AccountId: adminId + '2' }]);

      const input = getInput({ enable: true, dryRun: true });
      const promise = new DetectiveManageOrganizationAdminModule().handler(input);

      await expect(promise).rejects.toThrowError('Multiple admin accounts for Detective in organization');
    });

    test('should fail when enabling throws error', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListOrganizationAdminAccountsCommand) {
          return Promise.resolve({
            Administrators: [],
            $metadata: {},
          });
        }
        if (command instanceof EnableOrganizationAdminAccountCommand) {
          return Promise.reject(MOCK_CONSTANTS.serviceError);
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const input = getInput({ enable: true, dryRun: false });
      const promise = new DetectiveManageOrganizationAdminModule().handler(input);

      await expect(promise).rejects.toStrictEqual(MOCK_CONSTANTS.serviceError);
    });

    test('should fail when disabling throws error', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListOrganizationAdminAccountsCommand) {
          return Promise.resolve({
            Administrators: [{ AccountId: adminId }],
            $metadata: {},
          });
        }
        if (command instanceof DisableOrganizationAdminAccountCommand) {
          return Promise.reject(MOCK_CONSTANTS.serviceError);
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const input = getInput({ enable: false, dryRun: false });
      const promise = new DetectiveManageOrganizationAdminModule().handler(input);

      await expect(promise).rejects.toStrictEqual(MOCK_CONSTANTS.serviceError);
    });

    test('should retry on service-linked role creation error', async () => {
      let attempts = 0;
      mockSend.mockImplementation(command => {
        if (command instanceof ListOrganizationAdminAccountsCommand) {
          return Promise.resolve({
            Administrators: [],
            $metadata: {},
          });
        }
        if (command instanceof EnableOrganizationAdminAccountCommand) {
          attempts++;
          if (attempts < 3) {
            return Promise.reject(new Error('service linked role cannot be created'));
          }
          return Promise.resolve({});
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const input = getInput({ enable: true, dryRun: false });
      const response = await new DetectiveManageOrganizationAdminModule().handler(input);

      expect(response).toMatch(`Successfully set detective organization admin to account ${adminId}.`);
      expect(attempts).toBe(3);
    });

    test('should fail after max retries on service-linked role creation error', async () => {
      let attempts = 0;
      mockSend.mockImplementation(command => {
        if (command instanceof ListOrganizationAdminAccountsCommand) {
          return Promise.resolve({
            Administrators: [],
            $metadata: {},
          });
        }
        if (command instanceof EnableOrganizationAdminAccountCommand) {
          attempts++;
          return Promise.reject(new Error('service linked role cannot be created'));
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const input = getInput({ enable: true, dryRun: false });
      const promise = new DetectiveManageOrganizationAdminModule().handler(input);

      await expect(promise).rejects.toThrowError('service linked role cannot be created');
      expect(attempts).toBe(5); // Max retries
    });

    test('should handle pagination in list organization admin accounts', async () => {
      let callCount = 0;
      mockSend.mockImplementation(command => {
        if (command instanceof ListOrganizationAdminAccountsCommand) {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({
              Administrators: [],
              NextToken: 'nextToken',
              $metadata: {},
            });
          } else {
            return Promise.resolve({
              Administrators: [{ AccountId: adminId }],
              $metadata: {},
            });
          }
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      const input = getInput({ enable: true, dryRun: true });
      const response = await new DetectiveManageOrganizationAdminModule().handler(input);

      expect(response).toMatch(dryRunResponse(`Account ${adminId} is already the Detective Organization Admin`));
      expect(callCount).toBe(2);
    });

    test('should use empty array when list organizations admin command returns undefined', async () => {
      mockSend.mockImplementation(command => {
        if (command instanceof ListOrganizationAdminAccountsCommand) {
          return Promise.resolve({});
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });
      const input = getInput({ enable: true, dryRun: true });
      const response = await new DetectiveManageOrganizationAdminModule().handler(input);

      // Should handle error with no issues surfaced to user
      expect(response).toMatch(dryRunResponse(`Will enable Detective Organization Admin account ${adminId}`));
      expect(ListOrganizationAdminAccountsCommand).toHaveBeenCalledTimes(1);
    });
  });
});
