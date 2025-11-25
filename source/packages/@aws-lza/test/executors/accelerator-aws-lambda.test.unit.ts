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

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { CheckLambdaConcurrencyModule } from '../../lib/aws-lambda/check-lambda-concurrency';
import { ICheckLambdaConcurrencyParameter } from '../../interfaces/aws-lambda/check-lambda-concurrency';

// Mock modules
vi.mock('../../lib/aws-lambda/check-lambda-concurrency');
vi.mock('../../common/logger', () => ({
  createLogger: vi.fn(() => ({
    error: vi.fn(),
  })),
}));

const mockHandler = vi.fn();

describe('accelerator-aws-lambda.ts', () => {
  const testInput: ICheckLambdaConcurrencyParameter = {
    configuration: {
      requiredConcurrency: 1000,
    },
    partition: 'aws',
    region: 'us-east-1',
    operation: 'CheckLambdaConcurrency',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mocks
    (CheckLambdaConcurrencyModule as vi.Mock).mockImplementation(() => ({
      handler: mockHandler,
    }));
  });

  describe('uncaughtException handler', () => {
    test('should rethrow uncaught exceptions', async () => {
      // Store the original process.on
      const originalProcessOn = process.on;
      // Create a mock for process.on
      const mockProcessOn = vi.fn();
      process.on = mockProcessOn;

      try {
        // Re-import the module to trigger the process.on call
        await import('../../executors/accelerator-aws-lambda');

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

  describe('checkLambdaConcurrency', () => {
    test('should call the handler method of CheckLambdaConcurrencyModule and return its result', async () => {
      const { checkLambdaConcurrency } = await import('../../executors/accelerator-aws-lambda');
      mockHandler.mockResolvedValue(true);

      const result = await checkLambdaConcurrency(testInput);

      expect(result).toBe(true);
      expect(CheckLambdaConcurrencyModule).toHaveBeenCalledTimes(1);
      expect(mockHandler).toHaveBeenCalledWith(testInput);
    });

    test('should return false when the handler returns false', async () => {
      const { checkLambdaConcurrency } = await import('../../executors/accelerator-aws-lambda');
      mockHandler.mockResolvedValue(false);

      const result = await checkLambdaConcurrency(testInput);

      expect(result).toBe(false);
    });

    test('should log and re-throw error when an exception occurs', async () => {
      const { checkLambdaConcurrency } = await import('../../executors/accelerator-aws-lambda');
      const testError = new Error('Test error');
      mockHandler.mockRejectedValue(testError);

      await expect(checkLambdaConcurrency(testInput)).rejects.toThrow(testError);
    });
  });
});
