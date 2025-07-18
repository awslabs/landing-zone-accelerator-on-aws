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

import { MacieManageOrganizationAdminModule } from '../../lib/macie/manage-organization-admin';
import { Modules } from '../../lib/cli/modules';
import { manageOrganizationAdmin } from '../../executors/accelerator-macie';

const MOCK_CONSTANTS = {
  input: {
    operation: Object.keys(Modules.MACIE.commands)[0],
    partition: 'aws',
    region: 'us-east-1',
    configuration: {
      enable: true,
      accountId: '111111111111',
    },
  },
};

// Mock dependencies
jest.mock('../../lib/macie/manage-organization-admin/index');

describe('MacieExecutors', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('manageOrganizationAdmin', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('should successfully set organization admin', async () => {
      const mockHandler = jest.fn().mockResolvedValue('SUCCESS');
      (MacieManageOrganizationAdminModule as jest.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      const result = await manageOrganizationAdmin(MOCK_CONSTANTS.input);

      expect(result).toBe('SUCCESS');
      expect(mockHandler).toHaveBeenCalledWith(MOCK_CONSTANTS.input);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    test('should throw error when setup fails', async () => {
      const errorMessage = 'failed';
      const mockHandler = jest.fn().mockRejectedValue(new Error(errorMessage));
      (MacieManageOrganizationAdminModule as jest.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      await expect(manageOrganizationAdmin(MOCK_CONSTANTS.input)).rejects.toThrow(errorMessage);

      expect(mockHandler).toHaveBeenCalledWith(MOCK_CONSTANTS.input);
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
      require('../../executors/accelerator-macie');

      expect(process.on).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
    });

    test('should rethrow the error when uncaughtException occurs', () => {
      require('../../executors/accelerator-macie');

      const testError = new Error('Test uncaught exception');
      const origin = 'uncaughtException';

      expect(processOnCallback).toBeDefined();

      expect(() => {
        processOnCallback(testError, origin);
      }).toThrow(testError);
    });
  });
});
