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
  createAndRetrieveOrganizationalUnit,
  createOrganizationalUnit,
  getOrganizationalUnitsDetail,
  inviteAccountsBatchToOrganization,
  inviteAccountToOrganization,
  manageAccountAlias,
  managePolicy,
  moveAccount,
  moveAccountsBatch,
} from '../../executors/accelerator-aws-organizations';
import { CreateOrganizationalUnitModule } from '../../lib/aws-organizations/create-organizational-unit/index';
import { MOCK_CONSTANTS } from '../mocked-resources';
import { InviteAccountToOrganizationModule } from '../../lib/aws-organizations/invite-account-to-organization';
import { MoveAccountModule } from '../../lib/aws-organizations/move-account';
import { InviteAccountsBatchToOrganizationModule } from '../../lib/aws-organizations/invite-accounts-batch-to-organization';
import { MoveAccountsBatchModule } from '../../lib/aws-organizations/move-accounts-batch';
import { GetOrganizationalUnitsDetailModule } from '../../lib/aws-organizations/get-organizational-units-detail';
import { ManageAccountAlias } from '../../lib/aws-organizations/manage-account-alias/index';
import { ManagePolicy } from '../../lib/aws-organizations/manage-policy/index';
import { PolicyType } from '@aws-sdk/client-organizations';
import { OperationFlag } from '../../interfaces/aws-organizations/manage-policy';

// Mock dependencies
vi.mock('../../lib/aws-organizations/create-organizational-unit/index');
vi.mock('../../lib/aws-organizations/invite-account-to-organization/index');
vi.mock('../../lib/aws-organizations/invite-accounts-batch-to-organization/index');
vi.mock('../../lib/aws-organizations/move-account/index');
vi.mock('../../lib/aws-organizations/move-accounts-batch/index');
vi.mock('../../lib/aws-organizations/get-organizational-units-detail/index');
vi.mock('../../lib/aws-organizations/manage-account-alias/index');
vi.mock('../../lib/aws-organizations/manage-policy/index');

describe('AWSOrganizationsExecutor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createOrganizationalUnit', () => {
    test('should successfully create organizational unit', async () => {
      // Setup
      const mockHandler = vi.fn().mockResolvedValue('SUCCESS');

      (CreateOrganizationalUnitModule as unknown as vi.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      // Execute
      const result = await createOrganizationalUnit({
        ...MOCK_CONSTANTS.runnerParameters,
        configuration: MOCK_CONSTANTS.validCreateOuConfiguration,
      });

      // Verify
      expect(result).toBe('SUCCESS');
      expect(mockHandler).toHaveBeenCalledWith({
        ...MOCK_CONSTANTS.runnerParameters,
        configuration: MOCK_CONSTANTS.validCreateOuConfiguration,
      });
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    test('should throw error when create ou fails', async () => {
      // Setup

      const errorMessage = 'Creation failed';
      const mockHandler = vi.fn().mockRejectedValue(new Error(errorMessage));

      (CreateOrganizationalUnitModule as unknown as vi.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      // Execute && Verify
      await expect(
        createOrganizationalUnit({
          ...MOCK_CONSTANTS.runnerParameters,
          configuration: MOCK_CONSTANTS.validCreateOuConfiguration,
        }),
      ).rejects.toThrow(errorMessage);

      expect(mockHandler).toHaveBeenCalledWith({
        ...MOCK_CONSTANTS.runnerParameters,
        configuration: MOCK_CONSTANTS.validCreateOuConfiguration,
      });
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('createAndRetrieveOrganizationalUnit', () => {
    test('should successfully create organizational unit', async () => {
      // Setup
      const mockHandler = vi.fn().mockResolvedValue('SUCCESS');

      (CreateOrganizationalUnitModule as unknown as vi.Mock).mockImplementation(() => ({
        handler: mockHandler,
        createdOrganizationalUnit: MOCK_CONSTANTS.newOrganizationalUnit,
      }));

      // Execute
      const result = await createAndRetrieveOrganizationalUnit({
        ...MOCK_CONSTANTS.runnerParameters,
        configuration: MOCK_CONSTANTS.validCreateOuConfiguration,
      });

      // Verify
      expect(result).toBe(MOCK_CONSTANTS.newOrganizationalUnit);
      expect(mockHandler).toHaveBeenCalledWith({
        ...MOCK_CONSTANTS.runnerParameters,
        configuration: MOCK_CONSTANTS.validCreateOuConfiguration,
      });
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    test('should throw error when create ou fails', async () => {
      // Setup
      const errorMessage = 'Creation failed';
      const mockHandler = vi.fn().mockRejectedValue(new Error(errorMessage));

      (CreateOrganizationalUnitModule as unknown as vi.Mock).mockImplementation(() => ({
        handler: mockHandler,
        createdOrganizationalUnit: undefined,
      }));

      // Execute & Verify
      await expect(
        createAndRetrieveOrganizationalUnit({
          ...MOCK_CONSTANTS.runnerParameters,
          configuration: MOCK_CONSTANTS.validCreateOuConfiguration,
        }),
      ).rejects.toThrow(errorMessage);

      expect(mockHandler).toHaveBeenCalledWith({
        ...MOCK_CONSTANTS.runnerParameters,
        configuration: MOCK_CONSTANTS.validCreateOuConfiguration,
      });
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('inviteAccountToOrganization', () => {
    const input = {
      ...MOCK_CONSTANTS.runnerParameters,
      configuration: MOCK_CONSTANTS.InviteAccountToOrganizationModule.configuration,
    };
    test('should successfully invite organizational unit', async () => {
      // Setup
      const mockHandler = vi.fn().mockResolvedValue('SUCCESS');

      (InviteAccountToOrganizationModule as unknown as vi.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      // Execute
      const result = await inviteAccountToOrganization(input);

      // Verify
      expect(result).toBe('SUCCESS');
      expect(mockHandler).toHaveBeenCalledWith(input);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    test('should throw error when invite ou fails', async () => {
      // Setup

      const errorMessage = 'Creation failed';
      const mockHandler = vi.fn().mockRejectedValue(new Error(errorMessage));

      (InviteAccountToOrganizationModule as unknown as vi.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      // Execute && Verify
      await expect(inviteAccountToOrganization(input)).rejects.toThrow(errorMessage);

      expect(mockHandler).toHaveBeenCalledWith(input);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('moveAccount', () => {
    const input = {
      ...MOCK_CONSTANTS.runnerParameters,
      configuration: MOCK_CONSTANTS.MoveAccountModule.configuration,
    };
    test('should successfully move organizational unit', async () => {
      // Setup
      const mockHandler = vi.fn().mockResolvedValue('SUCCESS');

      (MoveAccountModule as vi.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      // Execute
      const result = await moveAccount(input);

      // Verify
      expect(result).toBe('SUCCESS');
      expect(mockHandler).toHaveBeenCalledWith(input);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    test('should throw error when move ou fails', async () => {
      // Setup

      const errorMessage = 'Creation failed';
      const mockHandler = vi.fn().mockRejectedValue(new Error(errorMessage));

      (MoveAccountModule as vi.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      // Execute && Verify
      await expect(moveAccount(input)).rejects.toThrow(errorMessage);

      expect(mockHandler).toHaveBeenCalledWith(input);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('inviteAccountsBatchToOrganization', () => {
    const input = {
      ...MOCK_CONSTANTS.runnerParameters,
      configuration: { accounts: MOCK_CONSTANTS.InviteAccountsBatchToOrganizationModule.configuration },
    };
    test('should successfully invite organizational units', async () => {
      // Setup
      const mockHandler = vi.fn().mockResolvedValue('SUCCESS');

      (InviteAccountsBatchToOrganizationModule as unknown as vi.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      // Execute
      const result = await inviteAccountsBatchToOrganization(input);

      // Verify
      expect(result).toBe('SUCCESS');
      expect(mockHandler).toHaveBeenCalledWith(input);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    test('should throw error when invite ou fails', async () => {
      // Setup

      const errorMessage = 'Creation failed';
      const mockHandler = vi.fn().mockRejectedValue(new Error(errorMessage));

      (InviteAccountsBatchToOrganizationModule as unknown as vi.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      // Execute && Verify
      await expect(inviteAccountsBatchToOrganization(input)).rejects.toThrow(errorMessage);

      expect(mockHandler).toHaveBeenCalledWith(input);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('moveAccountsBatch', () => {
    const input = {
      ...MOCK_CONSTANTS.runnerParameters,
      configuration: { accounts: MOCK_CONSTANTS.MoveAccountsBatchModule.configuration },
    };
    test('should successfully move organizational unit', async () => {
      // Setup
      const mockHandler = vi.fn().mockResolvedValue('SUCCESS');

      (MoveAccountsBatchModule as unknown as vi.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      // Execute
      const result = await moveAccountsBatch(input);

      // Verify
      expect(result).toBe('SUCCESS');
      expect(mockHandler).toHaveBeenCalledWith(input);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    test('should throw error when move ou fails', async () => {
      // Setup

      const errorMessage = 'Creation failed';
      const mockHandler = vi.fn().mockRejectedValue(new Error(errorMessage));

      (MoveAccountsBatchModule as unknown as vi.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      // Execute && Verify
      await expect(moveAccountsBatch(input)).rejects.toThrow(errorMessage);

      expect(mockHandler).toHaveBeenCalledWith(input);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('getOrganizationalUnitsDetail', () => {
    const input = {
      ...MOCK_CONSTANTS.runnerParameters,
      configuration: {
        enableControlTower: true,
      },
    };
    test('should successfully execute the module', async () => {
      // Setup
      const mockHandler = vi.fn().mockResolvedValue('SUCCESS');

      (GetOrganizationalUnitsDetailModule as unknown as vi.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      // Execute
      const result = await getOrganizationalUnitsDetail(input);

      // Verify
      expect(result).toBe('SUCCESS');
      expect(mockHandler).toHaveBeenCalledWith(input);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    test('should throw error when module fails', async () => {
      // Setup

      const errorMessage = 'Module failed';
      const mockHandler = vi.fn().mockRejectedValue(new Error(errorMessage));

      (GetOrganizationalUnitsDetailModule as unknown as vi.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      // Execute && Verify
      await expect(getOrganizationalUnitsDetail(input)).rejects.toThrow(errorMessage);

      expect(mockHandler).toHaveBeenCalledWith(input);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('manageAccountAlias', () => {
    const input = {
      ...MOCK_CONSTANTS.runnerParameters,
      configuration: {
        alias: 'mock-account-alias',
      },
    };
    test('should successfully manage account alias', async () => {
      // Setup
      const mockHandler = vi.fn().mockResolvedValue('SUCCESS');

      (ManageAccountAlias as vi.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      // Execute
      const result = await manageAccountAlias(input);

      // Verify
      expect(result).toEqual('SUCCESS');
      expect(mockHandler).toHaveBeenCalledWith(input);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    test('should throw error when manage account alias fails', async () => {
      // Setup
      const errorMessage = 'Manage account alias failed';
      const mockHandler = vi.fn().mockRejectedValue(new Error(errorMessage));

      (ManageAccountAlias as vi.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      // Execute && Verify
      await expect(manageAccountAlias(input)).rejects.toThrow(errorMessage);

      expect(mockHandler).toHaveBeenCalledWith(input);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('managePolicy', () => {
    const input = {
      ...MOCK_CONSTANTS.runnerParameters,
      configuration: {
        name: 'mock-policy',
        type: PolicyType.SERVICE_CONTROL_POLICY,
        operationFlag: OperationFlag.UPSERT,
        content: JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Action: '*',
              Resource: '*',
            },
          ],
        }),
      },
    };

    test('should successfully manage policy', async () => {
      // Setup
      const mockHandler = vi.fn().mockResolvedValue('SUCCESS');

      (ManagePolicy as vi.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      // Execute
      const result = await managePolicy(input);

      // Verify
      expect(result).toEqual('SUCCESS');
      expect(mockHandler).toHaveBeenCalledWith(input);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    test('should throw error when manage policy fails', async () => {
      // Setup
      const errorMessage = 'Manage policy failed';
      const mockHandler = vi.fn().mockRejectedValue(new Error(errorMessage));

      (ManagePolicy as vi.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      // Execute && Verify
      await expect(managePolicy(input)).rejects.toThrow(errorMessage);

      expect(mockHandler).toHaveBeenCalledWith(input);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('Uncaught Exception Handler', () => {
    let originalProcessOn: typeof process.on;
    let processOnCallback: NodeJS.UncaughtExceptionListener;

    beforeEach(() => {
      originalProcessOn = process.on;

      process.on = vi.fn((event: string, listener: NodeJS.UncaughtExceptionListener) => {
        if (event === 'uncaughtException') {
          processOnCallback = listener;
        }
        return process;
      }) as unknown as typeof process.on;

      vi.resetModules();
    });

    afterEach(() => {
      process.on = originalProcessOn;
    });

    test('should register uncaughtException handler', async () => {
      await import('../../executors/accelerator-aws-organizations');

      expect(process.on).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
    });

    test('should rethrow the error when uncaughtException occurs', async () => {
      await import('../../executors/accelerator-aws-organizations');

      const testError = new Error('Test uncaught exception');
      const origin = 'uncaughtException';

      expect(processOnCallback).toBeDefined();

      expect(() => {
        processOnCallback(testError, origin);
      }).toThrow(testError);
    });
  });
});
