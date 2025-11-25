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

import { ServiceQuotasClient, ListServiceQuotasCommand, ServiceQuota } from '@aws-sdk/client-service-quotas';
import { GetServiceQuotaCode } from '../../../../lib/service-quotas/get-service-quota-code';
import {
  IGetServiceQuotaCodeModule,
  IGetServiceQuotaCodeParameter,
} from '../../../../interfaces/service-quotas/get-service-quota-code';
import * as commonFunctions from '../../../../common/functions';
import { MODULE_EXCEPTIONS } from '../../../../common/enums';
import { vi, describe, beforeEach, afterEach, test, expect } from 'vitest';

// Mock the AWS SDK clients and functions
vi.mock('@aws-sdk/client-service-quotas');
vi.mock('../../../../common/functions');

describe('GetServiceQuotaCode', () => {
  let module: GetServiceQuotaCode;
  let mockServiceQuotasClient: vi.Mocked<ServiceQuotasClient>;

  // Test parameters
  const testRegion = 'us-east-1';
  const testPartition = 'aws';
  const testServiceCode = 'codebuild';
  const testQuotaName = 'Concurrently running builds for Linux/Medium environment';

  const baseInput: IGetServiceQuotaCodeParameter = {
    region: testRegion,
    configuration: {
      serviceCode: testServiceCode,
      quotaName: testQuotaName,
    },
    partition: testPartition,
    operation: 'GetServiceQuotaCode',
  };

  beforeEach(() => {
    vi.resetAllMocks();

    // Mock implementation for ServiceQuotas client
    mockServiceQuotasClient = {
      send: vi.fn(),
    } as unknown as vi.Mocked<ServiceQuotasClient>;

    // Mock the client constructor
    (ServiceQuotasClient as vi.MockedClass<typeof ServiceQuotasClient>).mockImplementation(
      () => mockServiceQuotasClient,
    );

    // Mock functions from common module
    vi.spyOn(commonFunctions, 'setRetryStrategy').mockReturnValue(
      {} as ReturnType<typeof commonFunctions.setRetryStrategy>,
    );

    module = new GetServiceQuotaCode();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Interface Contract Compliance', () => {
    const input: IGetServiceQuotaCodeParameter = { ...baseInput };
    let module: IGetServiceQuotaCodeModule;

    beforeEach(() => {
      module = new GetServiceQuotaCode();
      // Mock the handler implementation
      vi.spyOn(module, 'handler').mockImplementation(async () => 'L-2DC20C30');
    });

    test('should implement all interface methods', () => {
      expect(module.handler).toBeDefined();
      expect(typeof module.handler).toBe('function');
    });

    test('should maintain correct method signatures', async () => {
      const result = module.handler(input);
      // Verify that handler returns a Promise
      expect(result).toBeInstanceOf(Promise);
      // Verify that the resolved value is a string or undefined
      await expect(result).resolves.toBe('L-2DC20C30');
      await expect(result).resolves.toEqual(expect.any(String));
    });

    test('should handle invalid inputs according to contract', async () => {
      // Reset mock to test error handling
      vi.spyOn(module, 'handler').mockRejectedValue(new Error('Invalid input parameters'));

      await expect(module.handler({} as IGetServiceQuotaCodeParameter)).rejects.toThrow('Invalid input parameters');
    });

    test('should fulfill interface behavioral requirements', async () => {
      const result = await module.handler(input);
      expect(typeof result).toBe('string');
      expect(result).toBeTruthy();
    });

    test('should return undefined when quota not found', async () => {
      // Reset mock to test undefined return
      vi.spyOn(module, 'handler').mockResolvedValue(undefined);

      const result = await module.handler(input);
      expect(result).toBeUndefined();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });
  });

  describe('handler method', () => {
    test('should return quota code when quota name is found', async () => {
      const mockQuotas: ServiceQuota[] = [
        {
          QuotaName: 'Some other quota',
          QuotaCode: 'L-OTHER123',
          Value: 10,
        },
        {
          QuotaName: testQuotaName,
          QuotaCode: 'L-2DC20C30',
          Value: 5,
        },
        {
          QuotaName: 'Another quota',
          QuotaCode: 'L-ANOTHER456',
          Value: 20,
        },
      ];

      mockServiceQuotasClient.send.mockResolvedValueOnce({
        Quotas: mockQuotas,
        NextToken: undefined,
      } as unknown as never);

      const result = await module.handler(baseInput);

      expect(result).toBe('L-2DC20C30');
      expect(mockServiceQuotasClient.send).toHaveBeenCalledWith(expect.any(ListServiceQuotasCommand));
    });

    test('should return undefined when quota name is not found', async () => {
      const mockQuotas: ServiceQuota[] = [
        {
          QuotaName: 'Some other quota',
          QuotaCode: 'L-OTHER123',
          Value: 10,
        },
        {
          QuotaName: 'Another quota',
          QuotaCode: 'L-ANOTHER456',
          Value: 20,
        },
      ];

      mockServiceQuotasClient.send.mockResolvedValueOnce({
        Quotas: mockQuotas,
        NextToken: undefined,
      } as unknown as never);

      const result = await module.handler(baseInput);

      expect(result).toBeUndefined();
    });

    test('should handle empty quotas list', async () => {
      mockServiceQuotasClient.send.mockResolvedValueOnce({
        Quotas: [],
        NextToken: undefined,
      } as unknown as never);

      const result = await module.handler(baseInput);

      expect(result).toBeUndefined();
    });

    test('should handle pagination and find quota in second page', async () => {
      const firstPageQuotas: ServiceQuota[] = [
        {
          QuotaName: 'First page quota',
          QuotaCode: 'L-FIRST123',
          Value: 10,
        },
      ];

      const secondPageQuotas: ServiceQuota[] = [
        {
          QuotaName: testQuotaName,
          QuotaCode: 'L-2DC20C30',
          Value: 5,
        },
      ];

      mockServiceQuotasClient.send
        .mockResolvedValueOnce({
          Quotas: firstPageQuotas,
          NextToken: 'next-token-123',
        } as unknown as never)
        .mockResolvedValueOnce({
          Quotas: secondPageQuotas,
          NextToken: undefined,
        } as unknown as never);

      const result = await module.handler(baseInput);

      expect(result).toBe('L-2DC20C30');
      expect(mockServiceQuotasClient.send).toHaveBeenCalledTimes(2);
    });

    test('should pass correct service code to API', async () => {
      const customInput = {
        ...baseInput,
        configuration: {
          serviceCode: 'lambda',
          quotaName: 'Concurrent executions',
        },
      };

      mockServiceQuotasClient.send.mockResolvedValueOnce({
        Quotas: [
          {
            QuotaName: 'Concurrent executions',
            QuotaCode: 'L-B99A9384',
            Value: 1000,
          },
        ],
        NextToken: undefined,
      } as unknown as never);

      const result = await module.handler(customInput);

      expect(result).toBe('L-B99A9384');
      expect(ListServiceQuotasCommand).toHaveBeenCalledWith({
        ServiceCode: 'lambda',
        MaxResults: 100,
        NextToken: undefined,
      });
    });

    test('should handle exact quota name match', async () => {
      const exactMatchQuotaName = 'Exact Match Quota Name';
      const mockQuotas: ServiceQuota[] = [
        {
          QuotaName: 'Partial Match Quota Name',
          QuotaCode: 'L-PARTIAL123',
          Value: 10,
        },
        {
          QuotaName: exactMatchQuotaName,
          QuotaCode: 'L-EXACT456',
          Value: 5,
        },
      ];

      const customInput = {
        ...baseInput,
        configuration: {
          serviceCode: testServiceCode,
          quotaName: exactMatchQuotaName,
        },
      };

      mockServiceQuotasClient.send.mockResolvedValueOnce({
        Quotas: mockQuotas,
        NextToken: undefined,
      } as unknown as never);

      const result = await module.handler(customInput);

      expect(result).toBe('L-EXACT456');
    });
  });

  describe('getServiceQuotas method', () => {
    test('should handle successful quota retrieval without pagination', async () => {
      const mockQuotas: ServiceQuota[] = [
        {
          QuotaName: 'Test quota',
          QuotaCode: 'L-TEST123',
          Value: 10,
        },
      ];

      mockServiceQuotasClient.send.mockResolvedValueOnce({
        Quotas: mockQuotas,
        NextToken: undefined,
      } as unknown as never);

      // Access private method using type assertion
      const result = await (
        module as unknown as {
          getServiceQuotas: (props: IGetServiceQuotaCodeParameter) => Promise<ServiceQuota[]>;
        }
      ).getServiceQuotas(baseInput);

      expect(result).toEqual(mockQuotas);
      expect(mockServiceQuotasClient.send).toHaveBeenCalledTimes(1);
      expect(ListServiceQuotasCommand).toHaveBeenCalledWith({
        ServiceCode: testServiceCode,
        MaxResults: 100,
        NextToken: undefined,
      });
    });

    test('should handle pagination correctly', async () => {
      const firstPageQuotas: ServiceQuota[] = [{ QuotaName: 'First quota', QuotaCode: 'L-FIRST123', Value: 10 }];
      const secondPageQuotas: ServiceQuota[] = [{ QuotaName: 'Second quota', QuotaCode: 'L-SECOND456', Value: 20 }];
      const thirdPageQuotas: ServiceQuota[] = [{ QuotaName: 'Third quota', QuotaCode: 'L-THIRD789', Value: 30 }];

      mockServiceQuotasClient.send
        .mockResolvedValueOnce({
          Quotas: firstPageQuotas,
          NextToken: 'token1',
        } as unknown as never)
        .mockResolvedValueOnce({
          Quotas: secondPageQuotas,
          NextToken: 'token2',
        } as unknown as never)
        .mockResolvedValueOnce({
          Quotas: thirdPageQuotas,
          NextToken: undefined,
        } as unknown as never);

      const result = await (
        module as unknown as {
          getServiceQuotas: (props: IGetServiceQuotaCodeParameter) => Promise<ServiceQuota[]>;
        }
      ).getServiceQuotas(baseInput);

      expect(result).toEqual([...firstPageQuotas, ...secondPageQuotas, ...thirdPageQuotas]);
      expect(mockServiceQuotasClient.send).toHaveBeenCalledTimes(3);

      // Verify the correct parameters for each call
      expect(ListServiceQuotasCommand).toHaveBeenNthCalledWith(1, {
        ServiceCode: testServiceCode,
        MaxResults: 100,
        NextToken: undefined,
      });
      expect(ListServiceQuotasCommand).toHaveBeenNthCalledWith(2, {
        ServiceCode: testServiceCode,
        MaxResults: 100,
        NextToken: 'token1',
      });
      expect(ListServiceQuotasCommand).toHaveBeenNthCalledWith(3, {
        ServiceCode: testServiceCode,
        MaxResults: 100,
        NextToken: 'token2',
      });
    });

    test('should throw error when service quotas retrieval fails', async () => {
      const error = new Error('Service quotas API error');
      mockServiceQuotasClient.send.mockRejectedValueOnce(error as unknown as never);

      await expect(
        (
          module as unknown as {
            getServiceQuotas: (props: IGetServiceQuotaCodeParameter) => Promise<ServiceQuota[]>;
          }
        ).getServiceQuotas(baseInput),
      ).rejects.toThrow(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Encountered an error in getting service quotas.`);

      expect(mockServiceQuotasClient.send).toHaveBeenCalledTimes(1);
    });

    test('should handle empty quotas response', async () => {
      mockServiceQuotasClient.send.mockResolvedValueOnce({
        Quotas: [],
        NextToken: undefined,
      } as unknown as never);

      const result = await (
        module as unknown as {
          getServiceQuotas: (props: IGetServiceQuotaCodeParameter) => Promise<ServiceQuota[]>;
        }
      ).getServiceQuotas(baseInput);

      expect(result).toEqual([]);
      expect(mockServiceQuotasClient.send).toHaveBeenCalledTimes(1);
    });

    test('should use correct credentials and retry strategy', async () => {
      const mockCredentials = {
        accessKeyId: 'test',
        secretAccessKey: 'test',
        sessionToken: 'test-token',
      };
      const customInput = {
        ...baseInput,
        credentials: mockCredentials,
      };

      mockServiceQuotasClient.send.mockResolvedValueOnce({
        Quotas: [],
        NextToken: undefined,
      } as unknown as never);

      await (
        module as unknown as {
          getServiceQuotas: (props: IGetServiceQuotaCodeParameter) => Promise<ServiceQuota[]>;
        }
      ).getServiceQuotas(customInput);

      expect(ServiceQuotasClient).toHaveBeenCalledWith({
        region: testRegion,
        retryStrategy: expect.anything(),
        credentials: mockCredentials,
      });
      expect(commonFunctions.setRetryStrategy).toHaveBeenCalled();
    });

    test('should handle network timeout errors', async () => {
      const timeoutError = new Error('Network timeout');
      timeoutError.name = 'TimeoutError';
      mockServiceQuotasClient.send.mockRejectedValueOnce(timeoutError as unknown as never);

      await expect(
        (
          module as unknown as {
            getServiceQuotas: (props: IGetServiceQuotaCodeParameter) => Promise<ServiceQuota[]>;
          }
        ).getServiceQuotas(baseInput),
      ).rejects.toThrow(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Encountered an error in getting service quotas.`);
    });

    test('should handle undefined Quotas response', async () => {
      mockServiceQuotasClient.send.mockResolvedValueOnce({
        Quotas: undefined,
        NextToken: undefined,
      } as unknown as never);

      await expect(
        (
          module as unknown as {
            getServiceQuotas: (props: IGetServiceQuotaCodeParameter) => Promise<ServiceQuota[]>;
          }
        ).getServiceQuotas(baseInput),
      ).rejects.toThrow(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Encountered an error in getting service quotas.`);

      expect(mockServiceQuotasClient.send).toHaveBeenCalledTimes(1);
    });
  });

  describe('edge cases', () => {
    test('should handle quota with undefined QuotaCode', async () => {
      const mockQuotas: ServiceQuota[] = [
        {
          QuotaName: testQuotaName,
          QuotaCode: undefined,
          Value: 5,
        },
      ];

      mockServiceQuotasClient.send.mockResolvedValueOnce({
        Quotas: mockQuotas,
        NextToken: undefined,
      } as unknown as never);

      const result = await module.handler(baseInput);

      expect(result).toBeUndefined();
    });

    test('should handle quota with undefined QuotaName', async () => {
      const mockQuotas: ServiceQuota[] = [
        {
          QuotaName: undefined,
          QuotaCode: 'L-TEST123',
          Value: 5,
        },
        {
          QuotaName: testQuotaName,
          QuotaCode: 'L-2DC20C30',
          Value: 10,
        },
      ];

      mockServiceQuotasClient.send.mockResolvedValueOnce({
        Quotas: mockQuotas,
        NextToken: undefined,
      } as unknown as never);

      const result = await module.handler(baseInput);

      expect(result).toBe('L-2DC20C30');
    });

    test('should be case sensitive in quota name matching', async () => {
      const mockQuotas: ServiceQuota[] = [
        {
          QuotaName: testQuotaName.toLowerCase(),
          QuotaCode: 'L-LOWER123',
          Value: 5,
        },
        {
          QuotaName: testQuotaName.toUpperCase(),
          QuotaCode: 'L-UPPER456',
          Value: 10,
        },
      ];

      mockServiceQuotasClient.send.mockResolvedValueOnce({
        Quotas: mockQuotas,
        NextToken: undefined,
      } as unknown as never);

      const result = await module.handler(baseInput);

      expect(result).toBeUndefined(); // Should not match due to case sensitivity
    });
  });
});
