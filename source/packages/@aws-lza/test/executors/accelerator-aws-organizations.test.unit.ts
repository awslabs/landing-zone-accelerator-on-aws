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

import { describe, beforeEach, expect, test } from '@jest/globals';
import {
  createAndRetrieveOrganizationalUnit,
  createOrganizationalUnit,
  inviteAccountToOrganization,
  moveAccount,
} from '../../executors/accelerator-aws-organizations';
import { CreateOrganizationalUnitModule } from '../../lib/aws-organizations/create-organizational-unit/index';
import { MOCK_CONSTANTS } from '../mocked-resources';
import { InviteAccountToOrganizationModule } from '../../lib/aws-organizations/invite-account-to-organization';
import { MoveAccountModule } from '../../lib/aws-organizations/move-account';

// Mock dependencies
jest.mock('../../lib/aws-organizations/create-organizational-unit/index');
jest.mock('../../lib/aws-organizations/invite-account-to-organization/index');
jest.mock('../../lib/aws-organizations/move-account/index');

describe('AWSOrganizationsExecutor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createOrganizationalUnit', () => {
    test('should successfully create organizational unit', async () => {
      // Setup
      const mockHandler = jest.fn().mockResolvedValue('SUCCESS');

      (CreateOrganizationalUnitModule as unknown as jest.Mock).mockImplementation(() => ({
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
      const mockHandler = jest.fn().mockRejectedValue(new Error(errorMessage));

      (CreateOrganizationalUnitModule as unknown as jest.Mock).mockImplementation(() => ({
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
      const mockHandler = jest.fn().mockResolvedValue('SUCCESS');

      (CreateOrganizationalUnitModule as unknown as jest.Mock).mockImplementation(() => ({
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
      const mockHandler = jest.fn().mockRejectedValue(new Error(errorMessage));

      (CreateOrganizationalUnitModule as unknown as jest.Mock).mockImplementation(() => ({
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
      const mockHandler = jest.fn().mockResolvedValue('SUCCESS');

      (InviteAccountToOrganizationModule as unknown as jest.Mock).mockImplementation(() => ({
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
      const mockHandler = jest.fn().mockRejectedValue(new Error(errorMessage));

      (InviteAccountToOrganizationModule as unknown as jest.Mock).mockImplementation(() => ({
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
      const mockHandler = jest.fn().mockResolvedValue('SUCCESS');

      (MoveAccountModule as unknown as jest.Mock).mockImplementation(() => ({
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
      const mockHandler = jest.fn().mockRejectedValue(new Error(errorMessage));

      (MoveAccountModule as unknown as jest.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      // Execute && Verify
      await expect(moveAccount(input)).rejects.toThrow(errorMessage);

      expect(mockHandler).toHaveBeenCalledWith(input);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('Uncaught Exception Handler', () => {
    let originalProcessOn: typeof process.on;
    let processOnCallback: NodeJS.UncaughtExceptionListener;

    beforeEach(() => {
      originalProcessOn = process.on;

      process.on = jest.fn((event: string, listener: NodeJS.UncaughtExceptionListener) => {
        if (event === 'uncaughtException') {
          processOnCallback = listener;
        }
        return process;
      }) as unknown as typeof process.on;

      jest.resetModules();
    });

    afterEach(() => {
      process.on = originalProcessOn;
    });

    test('should register uncaughtException handler', () => {
      require('../../executors/accelerator-aws-organizations');

      expect(process.on).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
    });

    test('should rethrow the error when uncaughtException occurs', () => {
      require('../../executors/accelerator-aws-organizations');

      const testError = new Error('Test uncaught exception');
      const origin = 'uncaughtException';

      expect(processOnCallback).toBeDefined();

      expect(() => {
        processOnCallback(testError, origin);
      }).toThrow(testError);
    });
  });
});
