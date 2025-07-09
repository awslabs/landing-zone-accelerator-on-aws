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
import { configureRootUserManagment } from '../../executors/accelerator-aws-iam';
import { RootUserManagementModule } from '../../lib/aws-iam/root-user-management';
import { IRootUserManagementHandlerParameter } from '../../interfaces/aws-iam/root-user-management';
import { MOCK_CONSTANTS } from '../mocked-resources';

// Mock dependencies
jest.mock('../../lib/aws-iam/root-user-management/index');

describe('configureRootUserManagement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  const input: IRootUserManagementHandlerParameter = {
    configuration: { enabled: true, credentials: true, session: true },
    ...MOCK_CONSTANTS.runnerParameters,
  };

  test('error rethrows exception', async () => {
    const errorMessage = 'Configure Root User Management Error';
    const mockHandler = jest.fn().mockRejectedValue(new Error(errorMessage));

    (RootUserManagementModule as unknown as jest.Mock).mockImplementation(() => ({
      handler: mockHandler,
    }));

    await expect(configureRootUserManagment(input)).rejects.toThrow(errorMessage);
  });

  test('success returns value', async () => {
    const resultMessage = 'Module success message';
    const mockHandler = jest.fn().mockReturnValue(resultMessage);

    (RootUserManagementModule as unknown as jest.Mock).mockImplementation(() => ({
      handler: mockHandler,
    }));

    // Execute
    const result = await configureRootUserManagment(input);

    // Verify
    expect(result).toBe(resultMessage);
    expect(mockHandler).toHaveBeenCalledWith(input);
    expect(mockHandler).toHaveBeenCalledTimes(1);
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
      require('../../executors/accelerator-aws-iam');

      expect(process.on).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
    });

    test('should rethrow the error when uncaughtException occurs', () => {
      require('../../executors/accelerator-aws-iam');

      const testError = new Error('Test uncaught exception');
      const origin = 'uncaughtException';

      expect(processOnCallback).toBeDefined();

      expect(() => {
        processOnCallback(testError, origin);
      }).toThrow(testError);
    });
  });
});
