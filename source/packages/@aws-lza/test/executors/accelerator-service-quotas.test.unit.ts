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

import { CheckServiceQuota } from '../../lib/service-quotas/check-service-quota';
import { ICheckServiceQuotaParameter } from '../../interfaces/service-quotas/check-service-quota';

const mockHandler = jest.fn();
const mockError = jest.fn();

// Mock modules
jest.mock('../../lib/service-quotas/check-service-quota', () => {
  return {
    CheckServiceQuota: jest.fn().mockImplementation(() => {
      return {
        handler: mockHandler,
      };
    }),
  };
});

jest.mock('../../common/logger', () => {
  return {
    createLogger: jest.fn().mockReturnValue({
      error: mockError,
    }),
  };
});

import { checkServiceQuota } from '../../executors/accelerator-service-quotas';

describe('accelerator-service-quotas.ts', () => {
  const testInput: ICheckServiceQuotaParameter = {
    configuration: {
      serviceCode: 'codebuild',
      quotaCode: 'L-2DC20C30',
      requiredServiceQuota: 5,
    },
    partition: 'aws',
    region: 'us-east-1',
    operation: 'CheckServiceQuota',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('uncaughtException handler', () => {
    test('should rethrow uncaught exceptions', () => {
      // Store the original process.on
      const originalProcessOn = process.on;
      // Create a mock for process.on
      const mockProcessOn = jest.fn();
      process.on = mockProcessOn;

      try {
        // Re-import the module to trigger the process.on call
        jest.isolateModules(() => {
          require('../../executors/accelerator-service-quotas');
        });

        // Verify process.on was called with uncaughtException
        expect(mockProcessOn).toHaveBeenCalledWith('uncaughtException', expect.any(Function));

        // Get the handler function
        const uncaughtExceptionHandler = mockProcessOn.mock.calls[0][1];

        // Create a test error
        const testError = new Error('Test uncaught exception');

        // Verify that the handler rethrows the error
        expect(() => {
          uncaughtExceptionHandler(testError);
        }).toThrow(testError);
      } finally {
        // Restore the original process.on
        process.on = originalProcessOn;
      }
    });
  });

  describe('checkServiceQuota', () => {
    test('should call the handler method of CheckServiceQuota and return its result', async () => {
      mockHandler.mockResolvedValue(true);

      const result = await checkServiceQuota(testInput);

      expect(result).toBe(true);
      expect(CheckServiceQuota).toHaveBeenCalledTimes(1);
      expect(mockHandler).toHaveBeenCalledWith(testInput);
    });

    test('should return false when the handler returns false', async () => {
      mockHandler.mockResolvedValue(false);

      const result = await checkServiceQuota(testInput);

      expect(result).toBe(false);
    });

    test('should log and re-throw error when an exception occurs', async () => {
      const testError = new Error('Test error');
      mockHandler.mockRejectedValue(testError);

      await expect(checkServiceQuota(testInput)).rejects.toThrow(testError);
      expect(mockError).toHaveBeenCalledWith(testError);
    });
  });
});
