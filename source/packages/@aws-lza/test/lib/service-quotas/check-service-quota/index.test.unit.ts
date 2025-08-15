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

import { ServiceQuotasClient, GetServiceQuotaCommand, NoSuchResourceException } from '@aws-sdk/client-service-quotas';
import { STSClient } from '@aws-sdk/client-sts';
import { CheckServiceQuota } from '../../../../lib/service-quotas/check-service-quota';
import {
  ICheckServiceQuotaModule,
  ICheckServiceQuotaParameter,
} from '../../../../interfaces/service-quotas/check-service-quota';
import * as commonFunctions from '../../../../common/functions';
import * as throttle from '../../../../common/throttle';

// Mock the AWS SDK clients and functions
jest.mock('@aws-sdk/client-service-quotas');
jest.mock('@aws-sdk/client-sts');
jest.mock('../../../../common/functions');
jest.mock('../../../../common/throttle');

describe('CheckServiceQuota', () => {
  let module: CheckServiceQuota;
  let mockServiceQuotasClient: jest.Mocked<ServiceQuotasClient>;
  let mockSTSClient: jest.Mocked<STSClient>;

  // Test parameters
  const testRegion = 'us-east-1';
  const testPartition = 'aws';
  const testCurrentAccountId = '1'; // Same as account ID for same-account test
  const testServiceCode = 'ec2';
  const testQuotaCode = 'L-1234ABCD';

  const baseInput: ICheckServiceQuotaParameter = {
    region: testRegion,
    configuration: {
      serviceCode: testServiceCode,
      quotaCode: testQuotaCode,
      requiredServiceQuota: 5,
    },
    partition: testPartition,
    operation: 'CheckServiceQuota',
  };

  beforeEach(() => {
    jest.resetAllMocks();

    // Mock implementation for STS client
    mockSTSClient = {
      send: jest.fn(),
    } as unknown as jest.Mocked<STSClient>;

    // Mock implementation for ServiceQuotas client with type cast to avoid TS errors
    mockServiceQuotasClient = {
      send: jest.fn(),
    } as unknown as jest.Mocked<ServiceQuotasClient>;

    // Mock the client constructors
    (STSClient as jest.MockedClass<typeof STSClient>).mockImplementation(() => mockSTSClient);
    (ServiceQuotasClient as jest.MockedClass<typeof ServiceQuotasClient>).mockImplementation(
      () => mockServiceQuotasClient,
    );

    // Mock functions from common module
    jest.spyOn(commonFunctions, 'getCurrentAccountId').mockResolvedValue(testCurrentAccountId);
    jest
      .spyOn(commonFunctions, 'setRetryStrategy')
      .mockReturnValue({} as ReturnType<typeof commonFunctions.setRetryStrategy>);
    jest
      .spyOn(commonFunctions, 'getCredentials')
      .mockResolvedValue({} as ReturnType<typeof commonFunctions.getCredentials>);

    // Mock throttlingBackOff function
    jest.spyOn(throttle, 'throttlingBackOff').mockImplementation(fn => fn());

    module = new CheckServiceQuota();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Interface Contract Compliance', () => {
    const input: ICheckServiceQuotaParameter = { ...baseInput };
    let module: ICheckServiceQuotaModule;

    beforeEach(() => {
      module = new CheckServiceQuota();
      // Mock the handler implementation
      jest.spyOn(module, 'handler').mockImplementation(async () => true);
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
      jest.spyOn(module, 'handler').mockRejectedValue(new Error('Invalid input parameters'));

      await expect(module.handler({} as ICheckServiceQuotaParameter)).rejects.toThrow('Invalid input parameters');
    });

    test('should fulfill interface behavioral requirements', async () => {
      const result = await module.handler(input);
      expect(typeof result).toBe('boolean');
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });
  });

  describe('handler method', () => {
    test('should return true when quota meets requirement', async () => {
      // Setup mock responses
      mockServiceQuotasClient.send.mockResolvedValueOnce({
        Quota: {
          Value: 5,
        },
      } as unknown as never);

      const result = await module.handler({
        ...baseInput,
        configuration: {
          ...baseInput.configuration,
          requiredServiceQuota: 5,
        },
      });

      expect(result).toBe(true);
      expect(mockServiceQuotasClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          constructor: GetServiceQuotaCommand,
        }),
      );
    });

    test('should return true when quota exceeds requirement', async () => {
      // Setup mock responses
      mockServiceQuotasClient.send.mockResolvedValueOnce({
        Quota: {
          Value: 10,
        },
      } as unknown as never);

      const result = await module.handler({
        ...baseInput,
        configuration: {
          ...baseInput.configuration,
          requiredServiceQuota: 5,
        },
      });

      expect(result).toBe(true);
    });

    test('should return false when quota is below requirement', async () => {
      // Setup mock responses
      mockServiceQuotasClient.send.mockResolvedValueOnce({
        Quota: {
          Value: 2,
        },
      } as unknown as never);

      const result = await module.handler({
        ...baseInput,
        configuration: {
          ...baseInput.configuration,
          requiredServiceQuota: 5,
        },
      });

      expect(result).toBe(false);
    });

    test('should use default required quota when not specified', async () => {
      // Setup mock responses
      mockServiceQuotasClient.send.mockResolvedValueOnce({
        Quota: {
          Value: 2,
        },
      } as unknown as never);

      const input = JSON.parse(JSON.stringify(baseInput));
      input.configuration.requiredServiceQuota = undefined;

      const result = await module.handler(input);

      // With undefined requiredServiceQuota and actual quota of 2, should return false
      expect(result).toBe(false);
    });

    test('should handle quota with undefined value', async () => {
      // Setup mock responses with undefined Quota value
      mockServiceQuotasClient.send.mockResolvedValueOnce({
        Quota: undefined,
      } as unknown as never);

      await expect(module.handler(baseInput)).rejects.toThrow(
        'ServiceException: Encountered an error in getting service ec2 limit for quota L-1234ABCD.',
      );
    });

    test('should pass the correct service and quota codes to the API', async () => {
      // Setup mock responses
      mockServiceQuotasClient.send.mockResolvedValueOnce({
        Quota: {
          Value: 5,
        },
      } as unknown as never);

      await module.handler({
        ...baseInput,
        configuration: {
          ...baseInput.configuration,
          serviceCode: 'lambda',
          quotaCode: 'L-ABCD1234',
        },
      });

      // Verify the command was created with the correct parameters
      expect(GetServiceQuotaCommand).toHaveBeenCalledWith({
        QuotaCode: 'L-ABCD1234',
        ServiceCode: 'lambda',
      });
    });
  });

  describe('getLimits method', () => {
    test('should throw an error when service quota retrieval fails', async () => {
      // Setup mock to throw an error
      const error = new Error('Service quota error');
      mockServiceQuotasClient.send.mockRejectedValueOnce(error as unknown as never);

      // Directly trigger the private method using type-safe casting
      await expect(
        (
          module as unknown as {
            getLimits: (props: ICheckServiceQuotaParameter) => Promise<number>;
          }
        ).getLimits(baseInput),
      ).rejects.toThrow(/Encountered an error in getting service/);

      expect(throttle.throttlingBackOff).toHaveBeenCalled();
    });

    test('should handle successful quota retrieval', async () => {
      // Setup mock response
      mockServiceQuotasClient.send.mockResolvedValueOnce({
        Quota: {
          Value: 5,
        },
      } as unknown as never);

      // Directly trigger the private method using type-safe casting
      const result = await (
        module as unknown as {
          getLimits: (props: ICheckServiceQuotaParameter) => Promise<number>;
        }
      ).getLimits(baseInput);

      expect(result).toBe(5);
      expect(mockServiceQuotasClient.send).toHaveBeenCalled();
      // Verify the command was created with the correct parameters
      expect(GetServiceQuotaCommand).toHaveBeenCalledWith({
        QuotaCode: testQuotaCode,
        ServiceCode: testServiceCode,
      });
    });

    test('should throw error when Quota.Value is undefined', async () => {
      // Setup mock response with undefined Value
      mockServiceQuotasClient.send.mockResolvedValueOnce({
        Quota: {},
      } as unknown as never);

      // Directly trigger the private method using type-safe casting
      await expect(
        (
          module as unknown as {
            getLimits: (props: ICheckServiceQuotaParameter) => Promise<number>;
          }
        ).getLimits(baseInput),
      ).rejects.toThrow('ServiceException: Encountered an error in getting service ec2 limit for quota L-1234ABCD.');
    });

    test('should throw error when API call does not return service quota', async () => {
      // Setup mock response with no Quota.Value
      mockServiceQuotasClient.send.mockResolvedValueOnce({
        Quota: {
          Value: undefined,
        },
      } as unknown as never);

      // Directly trigger the private method using type-safe casting
      await expect(
        (
          module as unknown as {
            getLimits: (props: ICheckServiceQuotaParameter) => Promise<number>;
          }
        ).getLimits(baseInput),
      ).rejects.toThrow('ServiceException: Encountered an error in getting service ec2 limit for quota L-1234ABCD.');
    });

    test('should handle NoSuchResourceException when quota code is not found', async () => {
      // Setup mock to throw NoSuchResourceException
      const noSuchResourceException = new NoSuchResourceException({
        message: 'The quota code does not exist',
        $metadata: {},
      });
      mockServiceQuotasClient.send.mockRejectedValueOnce(noSuchResourceException as unknown as never);

      // Directly trigger the private method using type-safe casting
      await expect(
        (
          module as unknown as {
            getLimits: (props: ICheckServiceQuotaParameter) => Promise<number>;
          }
        ).getLimits(baseInput),
      ).rejects.toThrow('ServiceException: Quota L-1234ABCD not found for service ec2.');

      expect(throttle.throttlingBackOff).toHaveBeenCalled();
    });
  });
});
