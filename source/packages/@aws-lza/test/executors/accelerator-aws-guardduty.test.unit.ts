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

import { GuardDutyManageOrganizationAdminModule } from '../../lib/guardduty/manage-organization-admin';
import { manageGuardDutyAdminAccount } from '../../executors/accelerator-aws-guardduty';

const MOCK_CONSTANTS = {
  input: {
    operation: 'manage-organization-admin',
    partition: 'aws',
    region: 'us-east-1',
    configuration: {
      enable: true,
      accountId: '123456789012',
    },
    dryRun: false,
    solutionId: 'test',
  },
};

// Mock dependencies
jest.mock('../../lib/guardduty/manage-organization-admin/index');

describe('GuardDutyExecutors', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('manageGuardDutyOrganizationAdminAccount', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('should successfully set organization admin', async () => {
      const mockHandler = jest.fn().mockResolvedValue('SUCCESS');
      (GuardDutyManageOrganizationAdminModule as jest.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      const result = await manageGuardDutyAdminAccount(MOCK_CONSTANTS.input);

      expect(result).toBe('SUCCESS');
      expect(mockHandler).toHaveBeenCalledWith(MOCK_CONSTANTS.input);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    test('should successfully disable organization admin', async () => {
      const mockHandler = jest.fn().mockResolvedValue('SUCCESS');
      (GuardDutyManageOrganizationAdminModule as jest.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      const inputWithDisable = {
        ...MOCK_CONSTANTS.input,
        configuration: {
          enable: false,
          accountId: '123456789012',
        },
      };

      const result = await manageGuardDutyAdminAccount(inputWithDisable);

      expect(result).toBe('SUCCESS');
      expect(mockHandler).toHaveBeenCalledWith(inputWithDisable);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    test('should handle dry run mode', async () => {
      const mockHandler = jest.fn().mockResolvedValue('DRY_RUN_SUCCESS');
      (GuardDutyManageOrganizationAdminModule as jest.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      const inputWithDryRun = {
        ...MOCK_CONSTANTS.input,
        dryRun: true,
      };

      const result = await manageGuardDutyAdminAccount(inputWithDryRun);

      expect(result).toBe('DRY_RUN_SUCCESS');
      expect(mockHandler).toHaveBeenCalledWith(inputWithDryRun);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    test('should throw error when setup fails', async () => {
      const errorMessage = 'module failed to manage aws guardduty organization admin';
      const mockHandler = jest.fn().mockRejectedValue(new Error(errorMessage));
      (GuardDutyManageOrganizationAdminModule as jest.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      await expect(manageGuardDutyAdminAccount(MOCK_CONSTANTS.input)).rejects.toThrow(errorMessage);

      expect(mockHandler).toHaveBeenCalledWith(MOCK_CONSTANTS.input);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    test('should throw error when handler throws unknown error', async () => {
      const errorMessage = 'unknown error occurred';
      const mockHandler = jest.fn().mockRejectedValue(errorMessage);
      (GuardDutyManageOrganizationAdminModule as jest.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      await expect(manageGuardDutyAdminAccount(MOCK_CONSTANTS.input)).rejects.toBe(errorMessage);

      expect(mockHandler).toHaveBeenCalledWith(MOCK_CONSTANTS.input);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    test('should handle different partition', async () => {
      const mockHandler = jest.fn().mockResolvedValue('SUCCESS');
      (GuardDutyManageOrganizationAdminModule as jest.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      const inputWithGovCloud = {
        ...MOCK_CONSTANTS.input,
        partition: 'aws-us-gov',
      };

      const result = await manageGuardDutyAdminAccount(inputWithGovCloud);

      expect(result).toBe('SUCCESS');
      expect(mockHandler).toHaveBeenCalledWith(inputWithGovCloud);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    test('should handle different region', async () => {
      const mockHandler = jest.fn().mockResolvedValue('SUCCESS');
      (GuardDutyManageOrganizationAdminModule as jest.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      const inputWithDifferentRegion = {
        ...MOCK_CONSTANTS.input,
        region: 'us-west-2',
      };

      const result = await manageGuardDutyAdminAccount(inputWithDifferentRegion);

      expect(result).toBe('SUCCESS');
      expect(mockHandler).toHaveBeenCalledWith(inputWithDifferentRegion);
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
      require('../../executors/accelerator-aws-guardduty');

      expect(process.on).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
    });

    test('should rethrow the error when uncaughtException occurs', () => {
      require('../../executors/accelerator-aws-guardduty');

      const testError = new Error('Test uncaught exception');
      const origin = 'uncaughtException';

      expect(processOnCallback).toBeDefined();

      expect(() => {
        processOnCallback(testError, origin);
      }).toThrow(testError);
    });
  });
});
