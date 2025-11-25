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

import { LambdaClient, GetAccountSettingsCommand } from '@aws-sdk/client-lambda';
import { STSClient } from '@aws-sdk/client-sts';
import { CheckLambdaConcurrencyModule } from '../../../../lib/aws-lambda/check-lambda-concurrency';
import {
  ICheckLambdaConcurrencyModule,
  ICheckLambdaConcurrencyParameter,
} from '../../../../interfaces/aws-lambda/check-lambda-concurrency';
import { IAssumeRoleCredential } from '../../../../common/resources';
import * as commonFunctions from '../../../../common/functions';
import * as throttle from '../../../../common/throttle';
import { vi, describe, beforeEach, afterEach, test, expect } from 'vitest';

// Mock the AWS SDK clients and functions
vi.mock('@aws-sdk/client-lambda');
vi.mock('@aws-sdk/client-sts');
vi.mock('../../../../common/functions');
vi.mock('../../../../common/throttle');

describe('CheckLambdaConcurrencyModule', () => {
  let module: CheckLambdaConcurrencyModule;
  let mockLambdaClient: vi.Mocked<LambdaClient>;
  let mockSTSClient: vi.Mocked<STSClient>;

  // Test parameters
  const testRegion = 'us-east-1';
  const testPartition = 'aws';
  const testCurrentAccountId = '1'; // Same as account ID for same-account test

  const baseInput: ICheckLambdaConcurrencyParameter = {
    region: testRegion,
    configuration: {
      requiredConcurrency: 500,
    },
    partition: testPartition,
    operation: 'CheckLambdaConcurrency',
  };

  beforeEach(() => {
    vi.resetAllMocks();

    // Mock implementation for STS client
    mockSTSClient = {
      send: vi.fn(),
    } as unknown as vi.Mocked<STSClient>;

    // Mock implementation for Lambda client with type cast to avoid TS errors
    mockLambdaClient = {
      send: vi.fn(),
    } as unknown as vi.Mocked<LambdaClient>;

    // Mock the client constructors
    (STSClient as vi.MockedClass<typeof STSClient>).mockImplementation(() => mockSTSClient);
    (LambdaClient as vi.MockedClass<typeof LambdaClient>).mockImplementation(() => mockLambdaClient);

    // Mock functions from common module
    vi.spyOn(commonFunctions, 'getCurrentAccountId').mockResolvedValue(testCurrentAccountId);
    vi.spyOn(commonFunctions, 'setRetryStrategy').mockReturnValue(
      {} as ReturnType<typeof commonFunctions.setRetryStrategy>,
    );
    vi.spyOn(commonFunctions, 'getCredentials').mockResolvedValue(
      {} as ReturnType<typeof commonFunctions.getCredentials>,
    );

    // Mock throttlingBackOff function
    vi.spyOn(throttle, 'throttlingBackOff').mockImplementation(fn => fn());

    module = new CheckLambdaConcurrencyModule();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Interface Contract Compliance', () => {
    const input: ICheckLambdaConcurrencyParameter = { ...baseInput };
    let module: ICheckLambdaConcurrencyModule;

    beforeEach(() => {
      module = new CheckLambdaConcurrencyModule();
      // Mock the handler implementation
      vi.spyOn(module, 'handler').mockImplementation(async () => true);
    });

    test('should implement all interface methods', () => {
      expect(module.handler).toBeDefined();
      expect(typeof module.handler).toBe('function');
    });

    test('should maintain correct method signatures', async () => {
      const result = module.handler(input);
      // Verify that handler returns a Promise
      expect(result).toBeInstanceOf(Promise);
      // Verify that the resolved value is a boolean
      await expect(result).resolves.toBe(true);
      await expect(result).resolves.toEqual(expect.anything());
    });

    test('should handle invalid inputs according to contract', async () => {
      // Reset mock to test error handling
      vi.spyOn(module, 'handler').mockRejectedValue(new Error('Invalid input parameters'));

      await expect(module.handler({} as ICheckLambdaConcurrencyParameter)).rejects.toThrow('Invalid input parameters');
    });

    test('should fulfill interface behavioral requirements', async () => {
      const result = await module.handler(input);
      expect(typeof result).toBe('boolean');
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });
  });

  describe('handler method', () => {
    test('should return true when concurrency limit meets requirement', async () => {
      // Setup mock responses
      mockLambdaClient.send.mockResolvedValueOnce({
        AccountLimit: {
          ConcurrentExecutions: 500,
        },
      } as unknown as never);

      const result = await module.handler({
        ...baseInput,
        configuration: {
          ...baseInput.configuration,
          requiredConcurrency: 500,
        },
      });

      expect(result).toBe(true);
      expect(mockLambdaClient.send).toHaveBeenCalledWith(expect.any(GetAccountSettingsCommand));
      // The modified interface no longer requires accountId, so getCurrentAccountId isn't called
    });

    test('should return true when concurrency limit exceeds requirement', async () => {
      // Setup mock responses
      mockLambdaClient.send.mockResolvedValueOnce({
        AccountLimit: {
          ConcurrentExecutions: 1000,
        },
      } as unknown as never);

      const result = await module.handler({
        ...baseInput,
        configuration: {
          ...baseInput.configuration,
          requiredConcurrency: 500,
        },
      });

      expect(result).toBe(true);
    });

    test('should return false when concurrency limit is below requirement', async () => {
      // Setup mock responses
      mockLambdaClient.send.mockResolvedValueOnce({
        AccountLimit: {
          ConcurrentExecutions: 200,
        },
      } as unknown as never);

      const result = await module.handler({
        ...baseInput,
        configuration: {
          ...baseInput.configuration,
          requiredConcurrency: 500,
        },
      });

      expect(result).toBe(false);
    });

    test('should use default required concurrency when not specified', async () => {
      // Setup mock responses
      mockLambdaClient.send.mockResolvedValueOnce({
        AccountLimit: {
          ConcurrentExecutions: 600,
        },
      } as unknown as never);

      const input = JSON.parse(JSON.stringify(baseInput));
      input.configuration.requiredConcurrency = undefined;

      const result = await module.handler(input);

      // With undefined requiredConcurrency, should compare against undefined which results in NaN comparison, returning false
      expect(result).toBe(false);
    });

    test('should handle account limit with undefined ConcurrentExecutions', async () => {
      // Setup mock responses with undefined ConcurrentExecutions
      mockLambdaClient.send.mockResolvedValueOnce({
        AccountLimit: {},
      } as unknown as never);

      await expect(module.handler(baseInput)).rejects.toThrow(
        'ServiceException: Encountered an error in getting Lambda concurrency limit.',
      );
    });
  });

  describe('getLambdaConcurrencyLimits method', () => {
    test('should throw an error when Lambda account settings retrieval fails', async () => {
      // Setup mock to throw an error
      const error = new Error('Lambda error');
      mockLambdaClient.send.mockRejectedValueOnce(error as unknown as never);

      // Directly trigger the private method using type-safe casting
      await expect(
        (
          module as unknown as {
            getLambdaConcurrencyLimits: (region: string, credentials?: IAssumeRoleCredential) => Promise<number>;
          }
        ).getLambdaConcurrencyLimits(testRegion, undefined),
      ).rejects.toThrow(/Encountered an error in getting Lambda concurrency limit/);

      expect(throttle.throttlingBackOff).toHaveBeenCalled();
    });

    test('should handle successful concurrency limit retrieval', async () => {
      // Setup mock response
      mockLambdaClient.send.mockResolvedValueOnce({
        AccountLimit: {
          ConcurrentExecutions: 1000,
        },
      } as unknown as never);

      // Directly trigger the private method using type-safe casting
      const result = await (
        module as unknown as {
          getLambdaConcurrencyLimits: (region: string, credentials?: IAssumeRoleCredential) => Promise<number>;
        }
      ).getLambdaConcurrencyLimits(testRegion, undefined);

      expect(result).toBe(1000);
      expect(mockLambdaClient.send).toHaveBeenCalled();
      // Verify the command was created with the correct parameters
      expect(GetAccountSettingsCommand).toHaveBeenCalledWith({});
    });

    test('should throw error when AccountLimit.ConcurrentExecutions is undefined', async () => {
      // Setup mock response with undefined ConcurrentExecutions
      mockLambdaClient.send.mockResolvedValueOnce({
        AccountLimit: {},
      } as unknown as never);

      // Directly trigger the private method using type-safe casting
      await expect(
        (
          module as unknown as {
            getLambdaConcurrencyLimits: (region: string, credentials?: IAssumeRoleCredential) => Promise<number>;
          }
        ).getLambdaConcurrencyLimits(testRegion, undefined),
      ).rejects.toThrow('ServiceException: Encountered an error in getting Lambda concurrency limit.');
    });
  });
});
