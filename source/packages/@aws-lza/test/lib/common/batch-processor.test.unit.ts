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

import { Account } from '@aws-sdk/client-organizations';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  AccountSetupHandler,
  BatchProcessorConfig,
  OrderedBatchProcessorConfig,
  processAccountBatch,
  processDisableOperations,
  processEnableOperations,
  processWithWorkerPool,
  ServiceOperationHandler,
} from '../../../lib/common/batch-processor';
import { IRequiredBatchOperationSettings } from '../../../lib/common/interfaces';
import { OrderedAccountListType } from '../../../lib/common/types';

// Mock constants
const MOCK_CONSTANTS = {
  managementAccountId: '123456789012',
  targetAccounts: [
    { Id: '111111111111', Name: 'Account1', Email: 'account1@example.com' },
    { Id: '222222222222', Name: 'Account2', Email: 'account2@example.com' },
  ] as Account[],
  targetRegions: ['us-east-1', 'us-west-2'],
  service: 'TestService',
  operation: 'TestOperation',
  props: { testProp: 'testValue' },
  dryRun: false,
  batchOperationSettings: {
    maxConcurrentEnvironments: 2,
    operationTimeoutMs: 5000,
  } as IRequiredBatchOperationSettings,
  orderedAccountBatches: [
    {
      name: 'Management' as const,
      order: 1,
      accounts: [{ Id: '111111111111', Name: 'Management', Email: 'mgmt@example.com' }] as Account[],
    },
    {
      name: 'DelegatedAdmin' as const,
      order: 2,
      accounts: [{ Id: '222222222222', Name: 'DelegatedAdmin', Email: 'admin@example.com' }] as Account[],
    },
  ] as OrderedAccountListType[],
  organizationAccounts: [
    { Id: '111111111111', Name: 'Account1', Email: 'account1@example.com' },
    { Id: '222222222222', Name: 'Account2', Email: 'account2@example.com' },
    { Id: '333333333333', Name: 'Account3', Email: 'account3@example.com' },
  ] as Account[],
};

// Mock logger
vi.mock('../../../lib/common/logger', () => ({
  createLogger: vi.fn(function () {
    return {
      processStart: vi.fn(),
      processEnd: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
  }),
}));

describe('batch-processor', () => {
  let mockServiceHandler: ServiceOperationHandler<{ testProp: string }, string>;
  let mockAccountSetupHandler: AccountSetupHandler<{ testProp: string }>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServiceHandler = vi.fn().mockResolvedValue('success');
    mockAccountSetupHandler = vi.fn().mockResolvedValue({ modifiedProp: 'modified' });
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('processWithWorkerPool', () => {
    test('should preserve input order when tasks complete out of order', async () => {
      const taskFactories = [
        () => new Promise<string>(resolve => setTimeout(() => resolve('first'), 30)),
        () => new Promise<string>(resolve => setTimeout(() => resolve('second'), 5)),
        () => new Promise<string>(resolve => setTimeout(() => resolve('third'), 15)),
      ];

      await expect(processWithWorkerPool(taskFactories, 3)).resolves.toEqual(['first', 'second', 'third']);
    });

    test('should not exceed max concurrency', async () => {
      let activeTasks = 0;
      let maxActiveTasks = 0;
      const taskFactories = Array.from({ length: 6 }, (_, index) => async () => {
        activeTasks++;
        maxActiveTasks = Math.max(maxActiveTasks, activeTasks);
        await new Promise(resolve => setTimeout(resolve, 10));
        activeTasks--;
        return index;
      });

      await expect(processWithWorkerPool(taskFactories, 2)).resolves.toEqual([0, 1, 2, 3, 4, 5]);
      expect(maxActiveTasks).toBe(2);
    });

    test('should return an empty result for no tasks', async () => {
      await expect(processWithWorkerPool([], 1)).resolves.toEqual([]);
    });

    test.each([0, -1])('should reject invalid max concurrency %s', async maxConcurrency => {
      await expect(processWithWorkerPool([async () => 'unused'], maxConcurrency)).rejects.toThrow(
        'maxConcurrency must be greater than 0',
      );
    });

    test('should propagate task rejection', async () => {
      const operationError = new Error('operation failed');

      await expect(
        processWithWorkerPool(
          [
            async () => {
              throw operationError;
            },
          ],
          1,
        ),
      ).rejects.toBe(operationError);
    });
  });

  describe('processAccountBatch', () => {
    test('should process accounts and regions successfully with default concurrency', async () => {
      const config: BatchProcessorConfig<{ testProp: string }, string> = {
        service: MOCK_CONSTANTS.service,
        managementAccountId: MOCK_CONSTANTS.managementAccountId,
        targetRegions: MOCK_CONSTANTS.targetRegions,
        props: MOCK_CONSTANTS.props,
        dryRun: MOCK_CONSTANTS.dryRun,
        serviceHandler: mockServiceHandler,
        batchOperationSettings: MOCK_CONSTANTS.batchOperationSettings,
      };

      const results = await processAccountBatch(MOCK_CONSTANTS.operation, MOCK_CONSTANTS.targetAccounts, config);

      expect(results).toHaveLength(4); // 2 accounts × 2 regions
      expect(results.every(result => result === 'success')).toBe(true);
      expect(mockServiceHandler).toHaveBeenCalledTimes(4);
    });

    test('should process with custom concurrency settings', async () => {
      const config: BatchProcessorConfig<{ testProp: string }, string> = {
        service: MOCK_CONSTANTS.service,
        managementAccountId: MOCK_CONSTANTS.managementAccountId,
        targetRegions: MOCK_CONSTANTS.targetRegions,
        props: MOCK_CONSTANTS.props,
        dryRun: MOCK_CONSTANTS.dryRun,
        serviceHandler: mockServiceHandler,
        batchOperationSettings: MOCK_CONSTANTS.batchOperationSettings,
      };

      const results = await processAccountBatch(MOCK_CONSTANTS.operation, MOCK_CONSTANTS.targetAccounts, config);

      expect(results).toHaveLength(4);
      expect(mockServiceHandler).toHaveBeenCalledTimes(4);
    });

    test('should use account setup handler when provided', async () => {
      const config: BatchProcessorConfig<{ testProp: string }, string> = {
        service: MOCK_CONSTANTS.service,
        managementAccountId: MOCK_CONSTANTS.managementAccountId,
        targetRegions: MOCK_CONSTANTS.targetRegions,
        props: MOCK_CONSTANTS.props,
        dryRun: MOCK_CONSTANTS.dryRun,
        serviceHandler: mockServiceHandler,
        batchOperationSettings: MOCK_CONSTANTS.batchOperationSettings,
        accountSetupHandler: mockAccountSetupHandler,
        organizationAccounts: MOCK_CONSTANTS.organizationAccounts,
      };

      const results = await processAccountBatch(MOCK_CONSTANTS.operation, MOCK_CONSTANTS.targetAccounts, config);

      expect(results).toHaveLength(4);
      expect(mockAccountSetupHandler).toHaveBeenCalledTimes(2); // Once per account, reused across regions
      expect(mockServiceHandler).toHaveBeenCalledTimes(4);
    });

    test('should handle service handler timeout', async () => {
      const slowHandler = vi.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 10000)));

      const config: BatchProcessorConfig<{ testProp: string }, string> = {
        service: MOCK_CONSTANTS.service,
        managementAccountId: MOCK_CONSTANTS.managementAccountId,
        targetRegions: [MOCK_CONSTANTS.targetRegions[0]],
        props: MOCK_CONSTANTS.props,
        dryRun: MOCK_CONSTANTS.dryRun,
        serviceHandler: slowHandler,
        batchOperationSettings: { maxConcurrentEnvironments: 1, operationTimeoutMs: 100 },
      };

      const results = await processAccountBatch(MOCK_CONSTANTS.operation, [MOCK_CONSTANTS.targetAccounts[0]], config);

      // Should return error object instead of throwing
      expect(results).toHaveLength(1);
      const errorResult = results[0] as {
        region: string;
        accountId: string;
        accountName: string;
        errorName: string;
        errorMessage: string;
      };
      expect(errorResult.region).toBe('us-east-1');
      expect(errorResult.errorMessage).toContain('timeout after 100ms');
    });

    test('should handle service handler errors', async () => {
      const errorHandler = vi.fn().mockRejectedValue(new Error('Service error'));

      const config: BatchProcessorConfig<{ testProp: string }, string> = {
        service: MOCK_CONSTANTS.service,
        managementAccountId: MOCK_CONSTANTS.managementAccountId,
        targetRegions: [MOCK_CONSTANTS.targetRegions[0]],
        props: MOCK_CONSTANTS.props,
        dryRun: MOCK_CONSTANTS.dryRun,
        serviceHandler: errorHandler,
        batchOperationSettings: MOCK_CONSTANTS.batchOperationSettings,
      };

      const results = await processAccountBatch(MOCK_CONSTANTS.operation, [MOCK_CONSTANTS.targetAccounts[0]], config);

      // Should return error object instead of throwing
      expect(results).toHaveLength(1);
      const errorResult = results[0] as {
        region: string;
        accountId: string;
        accountName: string;
        errorName: string;
        errorMessage: string;
      };
      expect(errorResult.region).toBe('us-east-1');
      expect(errorResult.errorMessage).toBe('Service error');
    });

    test('should handle empty accounts array', async () => {
      const config: BatchProcessorConfig<{ testProp: string }, string> = {
        service: MOCK_CONSTANTS.service,
        managementAccountId: MOCK_CONSTANTS.managementAccountId,
        targetRegions: MOCK_CONSTANTS.targetRegions,
        props: MOCK_CONSTANTS.props,
        dryRun: MOCK_CONSTANTS.dryRun,
        serviceHandler: mockServiceHandler,
        batchOperationSettings: MOCK_CONSTANTS.batchOperationSettings,
      };

      const results = await processAccountBatch(MOCK_CONSTANTS.operation, [], config);

      expect(results).toHaveLength(0);
      expect(mockServiceHandler).not.toHaveBeenCalled();
    });

    test('should handle empty regions array', async () => {
      const config: BatchProcessorConfig<{ testProp: string }, string> = {
        service: MOCK_CONSTANTS.service,
        managementAccountId: MOCK_CONSTANTS.managementAccountId,
        targetRegions: [],
        props: MOCK_CONSTANTS.props,
        dryRun: MOCK_CONSTANTS.dryRun,
        serviceHandler: mockServiceHandler,
        batchOperationSettings: MOCK_CONSTANTS.batchOperationSettings,
      };

      const results = await processAccountBatch(MOCK_CONSTANTS.operation, MOCK_CONSTANTS.targetAccounts, config);

      expect(results).toHaveLength(0);
      expect(mockServiceHandler).not.toHaveBeenCalled();
    });

    test('should pass correct parameters to service handler', async () => {
      const config: BatchProcessorConfig<{ testProp: string }, string> = {
        service: MOCK_CONSTANTS.service,
        managementAccountId: MOCK_CONSTANTS.managementAccountId,
        targetRegions: [MOCK_CONSTANTS.targetRegions[0]],
        props: MOCK_CONSTANTS.props,
        dryRun: true, // dryRun
        serviceHandler: mockServiceHandler,
        batchOperationSettings: MOCK_CONSTANTS.batchOperationSettings,
        organizationAccounts: MOCK_CONSTANTS.organizationAccounts,
      };

      await processAccountBatch(MOCK_CONSTANTS.operation, [MOCK_CONSTANTS.targetAccounts[0]], config);

      expect(mockServiceHandler).toHaveBeenCalledWith(
        MOCK_CONSTANTS.managementAccountId,
        MOCK_CONSTANTS.targetAccounts[0],
        MOCK_CONSTANTS.targetRegions[0],
        true, // dryRun
        'Account1:111111111111:us-east-1', // logPrefix
        MOCK_CONSTANTS.props,
        MOCK_CONSTANTS.organizationAccounts,
      );
    });

    test('should handle accounts with undefined Name and Id', async () => {
      const accountWithUndefinedFields = { Id: undefined, Name: undefined } as Account;

      const config: BatchProcessorConfig<{ testProp: string }, string> = {
        service: MOCK_CONSTANTS.service,
        managementAccountId: MOCK_CONSTANTS.managementAccountId,
        targetRegions: [MOCK_CONSTANTS.targetRegions[0]],
        props: MOCK_CONSTANTS.props,
        dryRun: MOCK_CONSTANTS.dryRun,
        serviceHandler: mockServiceHandler,
        batchOperationSettings: MOCK_CONSTANTS.batchOperationSettings,
      };

      await processAccountBatch(MOCK_CONSTANTS.operation, [accountWithUndefinedFields], config);

      expect(mockServiceHandler).toHaveBeenCalledWith(
        MOCK_CONSTANTS.managementAccountId,
        accountWithUndefinedFields,
        MOCK_CONSTANTS.targetRegions[0],
        MOCK_CONSTANTS.dryRun,
        'Unknown:Unknown:us-east-1', // logPrefix with Unknown values
        MOCK_CONSTANTS.props,
        undefined,
      );
    });

    test('should convert handler errors to IRegionOperationError objects', async () => {
      const errorHandler = vi.fn().mockRejectedValue(new Error('Service operation failed'));

      const config: BatchProcessorConfig<{ testProp: string }, string> = {
        service: MOCK_CONSTANTS.service,
        managementAccountId: MOCK_CONSTANTS.managementAccountId,
        targetRegions: [MOCK_CONSTANTS.targetRegions[0]],
        props: MOCK_CONSTANTS.props,
        dryRun: MOCK_CONSTANTS.dryRun,
        serviceHandler: errorHandler,
        batchOperationSettings: MOCK_CONSTANTS.batchOperationSettings,
      };

      const results = await processAccountBatch(MOCK_CONSTANTS.operation, [MOCK_CONSTANTS.targetAccounts[0]], config);

      expect(results).toHaveLength(1);
      const errorResult = results[0] as {
        region: string;
        accountId: string;
        accountName: string;
        errorName: string;
        errorMessage: string;
      };

      expect(errorResult.region).toBe('us-east-1');
      expect(errorResult.accountId).toBe('111111111111');
      expect(errorResult.accountName).toBe('Account1');
      expect(errorResult.errorName).toBe('Error');
      expect(errorResult.errorMessage).toBe('Service operation failed');
    });

    test('should handle non-Error exceptions and convert to IRegionOperationError', async () => {
      const errorHandler = vi.fn().mockRejectedValue('String error message');

      const config: BatchProcessorConfig<{ testProp: string }, string> = {
        service: MOCK_CONSTANTS.service,
        managementAccountId: MOCK_CONSTANTS.managementAccountId,
        targetRegions: [MOCK_CONSTANTS.targetRegions[0]],
        props: MOCK_CONSTANTS.props,
        dryRun: MOCK_CONSTANTS.dryRun,
        serviceHandler: errorHandler,
        batchOperationSettings: MOCK_CONSTANTS.batchOperationSettings,
      };

      const results = await processAccountBatch(MOCK_CONSTANTS.operation, [MOCK_CONSTANTS.targetAccounts[0]], config);

      expect(results).toHaveLength(1);
      const errorResult = results[0] as {
        region: string;
        accountId: string;
        accountName: string;
        errorName: string;
        errorMessage: string;
      };

      expect(errorResult.region).toBe('us-east-1');
      expect(errorResult.accountId).toBe('111111111111');
      expect(errorResult.accountName).toBe('Account1');
      expect(errorResult.errorName).toBe('UnknownError');
      expect(errorResult.errorMessage).toBe('String error message');
    });

    test('should return mix of success results and error objects', async () => {
      let callCount = 0;
      const mixedHandler = vi.fn().mockImplementation(() => {
        callCount++;
        // Fail first call, succeed second
        if (callCount === 1) {
          return Promise.reject(new Error('First call failed'));
        }
        return Promise.resolve('success');
      });

      const config: BatchProcessorConfig<{ testProp: string }, string> = {
        service: MOCK_CONSTANTS.service,
        managementAccountId: MOCK_CONSTANTS.managementAccountId,
        targetRegions: MOCK_CONSTANTS.targetRegions,
        props: MOCK_CONSTANTS.props,
        dryRun: MOCK_CONSTANTS.dryRun,
        serviceHandler: mixedHandler,
        batchOperationSettings: MOCK_CONSTANTS.batchOperationSettings,
      };

      const results = await processAccountBatch(MOCK_CONSTANTS.operation, [MOCK_CONSTANTS.targetAccounts[0]], config);

      expect(results).toHaveLength(2);

      // First result should be an error
      const firstResult = results[0] as {
        region: string;
        accountId: string;
        accountName: string;
        errorName: string;
        errorMessage: string;
      };
      expect(firstResult.region).toBe('us-east-1');
      expect(firstResult.errorMessage).toBe('First call failed');

      // Second result should be success
      expect(results[1]).toBe('success');
    });

    test('should handle errors with undefined account Name and Id', async () => {
      const errorHandler = vi.fn().mockRejectedValue(new Error('Operation failed'));
      const accountWithUndefinedFields = { Id: undefined, Name: undefined } as Account;

      const config: BatchProcessorConfig<{ testProp: string }, string> = {
        service: MOCK_CONSTANTS.service,
        managementAccountId: MOCK_CONSTANTS.managementAccountId,
        targetRegions: [MOCK_CONSTANTS.targetRegions[0]],
        props: MOCK_CONSTANTS.props,
        dryRun: MOCK_CONSTANTS.dryRun,
        serviceHandler: errorHandler,
        batchOperationSettings: MOCK_CONSTANTS.batchOperationSettings,
      };

      const results = await processAccountBatch(MOCK_CONSTANTS.operation, [accountWithUndefinedFields], config);

      expect(results).toHaveLength(1);
      const errorResult = results[0] as {
        region: string;
        accountId: string;
        accountName: string;
        errorName: string;
        errorMessage: string;
      };

      expect(errorResult.accountId).toBe('Unknown');
      expect(errorResult.accountName).toBe('Unknown');
      expect(errorResult.region).toBe('us-east-1');
    });
  });

  describe('processEnableOperations', () => {
    test('should process ordered account batches in sequence', async () => {
      const config: OrderedBatchProcessorConfig<{ testProp: string }, string> = {
        service: MOCK_CONSTANTS.service,
        managementAccountId: MOCK_CONSTANTS.managementAccountId,
        orderedTargetAccounts: MOCK_CONSTANTS.orderedAccountBatches,
        targetRegions: MOCK_CONSTANTS.targetRegions,
        props: MOCK_CONSTANTS.props,
        dryRun: MOCK_CONSTANTS.dryRun,
        serviceHandler: mockServiceHandler,
        batchOperationSettings: MOCK_CONSTANTS.batchOperationSettings,
        accountSetupHandler: mockAccountSetupHandler,
        organizationAccounts: MOCK_CONSTANTS.organizationAccounts,
      };

      const results = await processEnableOperations(config);

      expect(results).toHaveLength(4); // 2 batches × 1 account each × 2 regions
      expect(mockServiceHandler).toHaveBeenCalledTimes(4);
    });

    test('should sort batches by order', async () => {
      const unorderedBatches = [
        { ...MOCK_CONSTANTS.orderedAccountBatches[1], order: 3 },
        { ...MOCK_CONSTANTS.orderedAccountBatches[0], order: 1 },
      ];

      const config: OrderedBatchProcessorConfig<{ testProp: string }, string> = {
        service: MOCK_CONSTANTS.service,
        managementAccountId: MOCK_CONSTANTS.managementAccountId,
        orderedTargetAccounts: unorderedBatches,
        targetRegions: MOCK_CONSTANTS.targetRegions,
        props: MOCK_CONSTANTS.props,
        dryRun: MOCK_CONSTANTS.dryRun,
        serviceHandler: mockServiceHandler,
        batchOperationSettings: MOCK_CONSTANTS.batchOperationSettings,
      };

      const results = await processEnableOperations(config);

      expect(results).toHaveLength(4);
      expect(mockServiceHandler).toHaveBeenCalledTimes(4);
    });

    test('should handle empty batches array', async () => {
      const config: OrderedBatchProcessorConfig<{ testProp: string }, string> = {
        service: MOCK_CONSTANTS.service,
        managementAccountId: MOCK_CONSTANTS.managementAccountId,
        orderedTargetAccounts: [],
        targetRegions: MOCK_CONSTANTS.targetRegions,
        props: MOCK_CONSTANTS.props,
        dryRun: MOCK_CONSTANTS.dryRun,
        serviceHandler: mockServiceHandler,
        batchOperationSettings: MOCK_CONSTANTS.batchOperationSettings,
      };

      const results = await processEnableOperations(config);

      expect(results).toHaveLength(0);
      expect(mockServiceHandler).not.toHaveBeenCalled();
    });

    test('should handle batch processing errors', async () => {
      const errorHandler = vi.fn().mockRejectedValue(new Error('Batch error'));

      const config: OrderedBatchProcessorConfig<{ testProp: string }, string> = {
        service: MOCK_CONSTANTS.service,
        managementAccountId: MOCK_CONSTANTS.managementAccountId,
        orderedTargetAccounts: MOCK_CONSTANTS.orderedAccountBatches,
        targetRegions: MOCK_CONSTANTS.targetRegions,
        props: MOCK_CONSTANTS.props,
        dryRun: MOCK_CONSTANTS.dryRun,
        serviceHandler: errorHandler,
        batchOperationSettings: MOCK_CONSTANTS.batchOperationSettings,
      };

      const results = await processEnableOperations(config);

      // Should return error objects instead of throwing
      // First batch: 2 regions fail
      // Second batch: skipped because all regions failed in first batch
      expect(results).toHaveLength(2);
      // All results should be errors
      const errorResults = results.filter(
        r => r !== null && typeof r === 'object' && 'errorName' in r && 'region' in r,
      );
      expect(errorResults).toHaveLength(2);
    });

    test('should track failed regions and skip them in subsequent batches', async () => {
      let callCount = 0;
      const partialErrorHandler = vi.fn().mockImplementation((_managementAccountId, _account, region) => {
        callCount++;
        // Fail us-east-1 in first batch
        if (callCount <= 1 && region === 'us-east-1') {
          return Promise.reject(new Error('Region failure'));
        }
        return Promise.resolve('success');
      });

      const config: OrderedBatchProcessorConfig<{ testProp: string }, string> = {
        service: MOCK_CONSTANTS.service,
        managementAccountId: MOCK_CONSTANTS.managementAccountId,
        orderedTargetAccounts: MOCK_CONSTANTS.orderedAccountBatches,
        targetRegions: MOCK_CONSTANTS.targetRegions,
        props: MOCK_CONSTANTS.props,
        dryRun: MOCK_CONSTANTS.dryRun,
        serviceHandler: partialErrorHandler,
        batchOperationSettings: MOCK_CONSTANTS.batchOperationSettings,
      };

      const results = await processEnableOperations(config);

      // Should have 4 results total: 2 from first batch (1 error, 1 success), 1 from second batch (us-west-2 only)
      expect(results).toHaveLength(3);

      // Check that we have one error result
      const errorResults = results.filter(
        r => r !== null && typeof r === 'object' && 'errorName' in r && 'region' in r,
      );
      expect(errorResults).toHaveLength(1);

      // Verify the error is for us-east-1
      const error = errorResults[0] as { region: string; errorName: string; errorMessage: string };
      expect(error.region).toBe('us-east-1');

      // Handler should be called 3 times: 2 in first batch, 1 in second batch (us-west-2 only)
      expect(partialErrorHandler).toHaveBeenCalledTimes(3);
    });

    test('should skip batch when all regions have failed', async () => {
      const errorHandler = vi.fn().mockImplementation(() => {
        // Fail all regions in first batch
        return Promise.reject(new Error('All regions failed'));
      });

      const config: OrderedBatchProcessorConfig<{ testProp: string }, string> = {
        service: MOCK_CONSTANTS.service,
        managementAccountId: MOCK_CONSTANTS.managementAccountId,
        orderedTargetAccounts: MOCK_CONSTANTS.orderedAccountBatches,
        targetRegions: MOCK_CONSTANTS.targetRegions,
        props: MOCK_CONSTANTS.props,
        dryRun: MOCK_CONSTANTS.dryRun,
        serviceHandler: errorHandler,
        batchOperationSettings: MOCK_CONSTANTS.batchOperationSettings,
      };

      const results = await processEnableOperations(config);

      // Should have 2 error results from first batch only (both regions failed)
      expect(results).toHaveLength(2);

      // All results should be errors
      const errorResults = results.filter(
        r => r !== null && typeof r === 'object' && 'errorName' in r && 'region' in r,
      );
      expect(errorResults).toHaveLength(2);

      // Handler should only be called for first batch (2 times)
      expect(errorHandler).toHaveBeenCalledTimes(2);
    });

    test('should continue processing available regions when some fail', async () => {
      let callCount = 0;
      const mixedHandler = vi.fn().mockImplementation((_managementAccountId, _account, region) => {
        callCount++;
        // Fail us-east-1 in first batch only
        if (callCount === 1 && region === 'us-east-1') {
          return Promise.reject(new Error('First region failed'));
        }
        return Promise.resolve('success');
      });

      const config: OrderedBatchProcessorConfig<{ testProp: string }, string> = {
        service: MOCK_CONSTANTS.service,
        managementAccountId: MOCK_CONSTANTS.managementAccountId,
        orderedTargetAccounts: MOCK_CONSTANTS.orderedAccountBatches,
        targetRegions: MOCK_CONSTANTS.targetRegions,
        props: MOCK_CONSTANTS.props,
        dryRun: MOCK_CONSTANTS.dryRun,
        serviceHandler: mixedHandler,
        batchOperationSettings: MOCK_CONSTANTS.batchOperationSettings,
      };

      const results = await processEnableOperations(config);

      // Should have 3 results: 2 from first batch (1 error, 1 success), 1 from second batch (us-west-2 only)
      expect(results).toHaveLength(3);

      // Check success count
      const successResults = results.filter(r => r === 'success');
      expect(successResults).toHaveLength(2);

      // Check error count
      const errorResults = results.filter(
        r => r !== null && typeof r === 'object' && 'errorName' in r && 'region' in r,
      );
      expect(errorResults).toHaveLength(1);
    });
  });

  describe('processDisableOperations', () => {
    test('should process ordered account batches in sequence', async () => {
      const config: OrderedBatchProcessorConfig<{ testProp: string }, string> = {
        service: MOCK_CONSTANTS.service,
        managementAccountId: MOCK_CONSTANTS.managementAccountId,
        orderedTargetAccounts: MOCK_CONSTANTS.orderedAccountBatches,
        targetRegions: MOCK_CONSTANTS.targetRegions,
        props: MOCK_CONSTANTS.props,
        dryRun: MOCK_CONSTANTS.dryRun,
        serviceHandler: mockServiceHandler,
        batchOperationSettings: MOCK_CONSTANTS.batchOperationSettings,
        accountSetupHandler: mockAccountSetupHandler,
        organizationAccounts: MOCK_CONSTANTS.organizationAccounts,
      };

      const results = await processDisableOperations(config);

      expect(results).toHaveLength(4);
      expect(mockServiceHandler).toHaveBeenCalledTimes(4);
    });

    test('should sort batches by order', async () => {
      const unorderedBatches = [
        { ...MOCK_CONSTANTS.orderedAccountBatches[1], order: 3 },
        { ...MOCK_CONSTANTS.orderedAccountBatches[0], order: 1 },
      ];

      const config: OrderedBatchProcessorConfig<{ testProp: string }, string> = {
        service: MOCK_CONSTANTS.service,
        managementAccountId: MOCK_CONSTANTS.managementAccountId,
        orderedTargetAccounts: unorderedBatches,
        targetRegions: MOCK_CONSTANTS.targetRegions,
        props: MOCK_CONSTANTS.props,
        dryRun: MOCK_CONSTANTS.dryRun,
        serviceHandler: mockServiceHandler,
        batchOperationSettings: MOCK_CONSTANTS.batchOperationSettings,
      };

      const results = await processDisableOperations(config);

      expect(results).toHaveLength(4);
      expect(mockServiceHandler).toHaveBeenCalledTimes(4);
    });

    test('should handle empty batches array', async () => {
      const config: OrderedBatchProcessorConfig<{ testProp: string }, string> = {
        service: MOCK_CONSTANTS.service,
        managementAccountId: MOCK_CONSTANTS.managementAccountId,
        orderedTargetAccounts: [],
        targetRegions: MOCK_CONSTANTS.targetRegions,
        props: MOCK_CONSTANTS.props,
        dryRun: MOCK_CONSTANTS.dryRun,
        serviceHandler: mockServiceHandler,
        batchOperationSettings: MOCK_CONSTANTS.batchOperationSettings,
      };

      const results = await processDisableOperations(config);

      expect(results).toHaveLength(0);
      expect(mockServiceHandler).not.toHaveBeenCalled();
    });

    test('should track failed regions and skip them in subsequent batches', async () => {
      const failedRegions = new Set<string>();
      const partialErrorHandler = vi.fn().mockImplementation((_managementAccountId, account, region) => {
        // Fail us-west-2 only in first batch (Management account)
        if (account.Name === 'Management' && region === 'us-west-2') {
          failedRegions.add(region);
          return Promise.reject(new Error('Region failure'));
        }
        return Promise.resolve('success');
      });

      const config: OrderedBatchProcessorConfig<{ testProp: string }, string> = {
        service: MOCK_CONSTANTS.service,
        managementAccountId: MOCK_CONSTANTS.managementAccountId,
        orderedTargetAccounts: MOCK_CONSTANTS.orderedAccountBatches,
        targetRegions: MOCK_CONSTANTS.targetRegions,
        props: MOCK_CONSTANTS.props,
        dryRun: MOCK_CONSTANTS.dryRun,
        serviceHandler: partialErrorHandler,
        batchOperationSettings: MOCK_CONSTANTS.batchOperationSettings,
      };

      const results = await processDisableOperations(config);

      // First batch (Management): 2 regions (us-east-1 success, us-west-2 error)
      // Second batch (DelegatedAdmin): 1 region (us-east-1 only, us-west-2 skipped)
      // Total: 3 results
      expect(results).toHaveLength(3);

      // Check that we have one error result
      const errorResults = results.filter(
        r => r !== null && typeof r === 'object' && 'errorName' in r && 'region' in r,
      );
      expect(errorResults).toHaveLength(1);

      // Verify the error is for us-west-2
      const error = errorResults[0] as { region: string; errorName: string; errorMessage: string };
      expect(error.region).toBe('us-west-2');

      // Handler should be called 3 times: 2 in first batch, 1 in second batch (us-east-1 only)
      expect(partialErrorHandler).toHaveBeenCalledTimes(3);
    });

    test('should skip batch when all regions have failed', async () => {
      const errorHandler = vi.fn().mockImplementation(() => {
        // Fail all regions in first batch
        return Promise.reject(new Error('All regions failed'));
      });

      const config: OrderedBatchProcessorConfig<{ testProp: string }, string> = {
        service: MOCK_CONSTANTS.service,
        managementAccountId: MOCK_CONSTANTS.managementAccountId,
        orderedTargetAccounts: MOCK_CONSTANTS.orderedAccountBatches,
        targetRegions: MOCK_CONSTANTS.targetRegions,
        props: MOCK_CONSTANTS.props,
        dryRun: MOCK_CONSTANTS.dryRun,
        serviceHandler: errorHandler,
        batchOperationSettings: MOCK_CONSTANTS.batchOperationSettings,
      };

      const results = await processDisableOperations(config);

      // Should have 2 error results from first batch only (both regions failed)
      expect(results).toHaveLength(2);

      // All results should be errors
      const errorResults = results.filter(
        r => r !== null && typeof r === 'object' && 'errorName' in r && 'region' in r,
      );
      expect(errorResults).toHaveLength(2);

      // Handler should only be called for first batch (2 times)
      expect(errorHandler).toHaveBeenCalledTimes(2);
    });

    test('should continue processing available regions when some fail', async () => {
      const mixedHandler = vi.fn().mockImplementation((_managementAccountId, account, region) => {
        // Fail us-west-2 in first batch (Management account) only
        if (account.Name === 'Management' && region === 'us-west-2') {
          return Promise.reject(new Error('First region failed'));
        }
        return Promise.resolve('success');
      });

      const config: OrderedBatchProcessorConfig<{ testProp: string }, string> = {
        service: MOCK_CONSTANTS.service,
        managementAccountId: MOCK_CONSTANTS.managementAccountId,
        orderedTargetAccounts: MOCK_CONSTANTS.orderedAccountBatches,
        targetRegions: MOCK_CONSTANTS.targetRegions,
        props: MOCK_CONSTANTS.props,
        dryRun: MOCK_CONSTANTS.dryRun,
        serviceHandler: mixedHandler,
        batchOperationSettings: MOCK_CONSTANTS.batchOperationSettings,
      };

      const results = await processDisableOperations(config);

      // First batch (Management): 2 regions (us-east-1 success, us-west-2 error)
      // Second batch (DelegatedAdmin): 1 region (us-east-1 only, us-west-2 skipped)
      // Total: 3 results
      expect(results).toHaveLength(3);

      // Check success count
      const successResults = results.filter(r => r === 'success');
      expect(successResults).toHaveLength(2);

      // Check error count
      const errorResults = results.filter(
        r => r !== null && typeof r === 'object' && 'errorName' in r && 'region' in r,
      );
      expect(errorResults).toHaveLength(1);
    });
  });

  describe('processWithWorkerPool (internal function coverage)', () => {
    test('should handle maxConcurrency validation', async () => {
      const errorHandler = vi.fn().mockRejectedValue(new Error('Invalid concurrency'));

      const config: BatchProcessorConfig<{ testProp: string }, string> = {
        service: MOCK_CONSTANTS.service,
        managementAccountId: MOCK_CONSTANTS.managementAccountId,
        targetRegions: [MOCK_CONSTANTS.targetRegions[0]],
        props: MOCK_CONSTANTS.props,
        dryRun: MOCK_CONSTANTS.dryRun,
        serviceHandler: errorHandler,
        batchOperationSettings: { maxConcurrentEnvironments: 0, operationTimeoutMs: 1000 }, // Invalid concurrency
      };

      await expect(
        processAccountBatch(MOCK_CONSTANTS.operation, [MOCK_CONSTANTS.targetAccounts[0]], config),
      ).rejects.toThrow();
    });

    test('should handle queue logging for large task sets', async () => {
      const manyAccounts = Array.from({ length: 10 }, (_, i) => ({
        Id: `${i}`.padStart(12, '0'),
        Name: `Account${i}`,
        Email: `account${i}@example.com`,
      })) as Account[];

      const config: BatchProcessorConfig<{ testProp: string }, string> = {
        service: MOCK_CONSTANTS.service,
        managementAccountId: MOCK_CONSTANTS.managementAccountId,
        targetRegions: MOCK_CONSTANTS.targetRegions,
        props: MOCK_CONSTANTS.props,
        dryRun: MOCK_CONSTANTS.dryRun,
        serviceHandler: mockServiceHandler,
        batchOperationSettings: { maxConcurrentEnvironments: 2, operationTimeoutMs: 5000 },
      };

      const results = await processAccountBatch(MOCK_CONSTANTS.operation, manyAccounts, config);

      expect(results).toHaveLength(20); // 10 accounts × 2 regions
      expect(mockServiceHandler).toHaveBeenCalledTimes(20);
    });

    test('should handle task execution errors in worker pool', async () => {
      let callCount = 0;
      const partialErrorHandler = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          throw new Error('Task execution error');
        }
        return Promise.resolve('success');
      });

      const config: BatchProcessorConfig<{ testProp: string }, string> = {
        service: MOCK_CONSTANTS.service,
        managementAccountId: MOCK_CONSTANTS.managementAccountId,
        targetRegions: [MOCK_CONSTANTS.targetRegions[0]],
        props: MOCK_CONSTANTS.props,
        dryRun: MOCK_CONSTANTS.dryRun,
        serviceHandler: partialErrorHandler,
        batchOperationSettings: { maxConcurrentEnvironments: 1, operationTimeoutMs: 5000 },
      };

      const results = await processAccountBatch(MOCK_CONSTANTS.operation, MOCK_CONSTANTS.targetAccounts, config);

      // Should return mix of success and error results
      expect(results).toHaveLength(2);
      const successResults = results.filter(r => r === 'success');
      expect(successResults).toHaveLength(1);
      const errorResults = results.filter(
        r => r !== null && typeof r === 'object' && 'errorName' in r && 'region' in r,
      );
      expect(errorResults).toHaveLength(1);
    });

    test('should handle promise rejection errors in worker pool', async () => {
      let callCount = 0;
      const rejectionHandler = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          // Return a rejected promise instead of throwing synchronously
          return Promise.reject(new Error('Promise rejection error'));
        }
        return Promise.resolve('success');
      });

      const config: BatchProcessorConfig<{ testProp: string }, string> = {
        service: MOCK_CONSTANTS.service,
        managementAccountId: MOCK_CONSTANTS.managementAccountId,
        targetRegions: [MOCK_CONSTANTS.targetRegions[0]],
        props: MOCK_CONSTANTS.props,
        dryRun: MOCK_CONSTANTS.dryRun,
        serviceHandler: rejectionHandler,
        batchOperationSettings: { maxConcurrentEnvironments: 1, operationTimeoutMs: 5000 },
      };

      const results = await processAccountBatch(MOCK_CONSTANTS.operation, MOCK_CONSTANTS.targetAccounts, config);

      // Should return mix of success and error results
      expect(results).toHaveLength(2);
      const successResults = results.filter(r => r === 'success');
      expect(successResults).toHaveLength(1);
      const errorResults = results.filter(
        r => r !== null && typeof r === 'object' && 'errorName' in r && 'region' in r,
      );
      expect(errorResults).toHaveLength(1);
      const errorResult = errorResults[0] as {
        region: string;
        accountId: string;
        accountName: string;
        errorName: string;
        errorMessage: string;
      };
      expect(errorResult.errorMessage).toBe('Promise rejection error');
    });
  });

  describe('withTimeout function coverage', () => {
    test('should clear timeout when promise resolves', async () => {
      const fastHandler = vi.fn().mockResolvedValue('fast result');

      const config: BatchProcessorConfig<{ testProp: string }, string> = {
        service: MOCK_CONSTANTS.service,
        managementAccountId: MOCK_CONSTANTS.managementAccountId,
        targetRegions: [MOCK_CONSTANTS.targetRegions[0]],
        props: MOCK_CONSTANTS.props,
        dryRun: MOCK_CONSTANTS.dryRun,
        serviceHandler: fastHandler,
        batchOperationSettings: { maxConcurrentEnvironments: 1, operationTimeoutMs: 5000 },
      };

      const results = await processAccountBatch(MOCK_CONSTANTS.operation, [MOCK_CONSTANTS.targetAccounts[0]], config);

      expect(results).toEqual(['fast result']);
      expect(fastHandler).toHaveBeenCalledTimes(1);
    });

    test('should clear timeout when promise rejects', async () => {
      const errorHandler = vi.fn().mockRejectedValue(new Error('Handler error'));

      const config: BatchProcessorConfig<{ testProp: string }, string> = {
        service: MOCK_CONSTANTS.service,
        managementAccountId: MOCK_CONSTANTS.managementAccountId,
        targetRegions: [MOCK_CONSTANTS.targetRegions[0]],
        props: MOCK_CONSTANTS.props,
        dryRun: MOCK_CONSTANTS.dryRun,
        serviceHandler: errorHandler,
        batchOperationSettings: { maxConcurrentEnvironments: 1, operationTimeoutMs: 5000 },
      };

      const results = await processAccountBatch(MOCK_CONSTANTS.operation, [MOCK_CONSTANTS.targetAccounts[0]], config);

      // Should return error object instead of throwing
      expect(results).toHaveLength(1);
      const errorResult = results[0] as {
        region: string;
        accountId: string;
        accountName: string;
        errorName: string;
        errorMessage: string;
      };
      expect(errorResult.errorMessage).toBe('Handler error');
    });
  });

  describe('resolveBatchOperationSettings function coverage', () => {
    test('should use default values when batchOperationSettings is undefined', async () => {
      // This test should now expect an error since batchOperationSettings is required
      const config: BatchProcessorConfig<{ testProp: string }, string> = {
        service: MOCK_CONSTANTS.service,
        managementAccountId: MOCK_CONSTANTS.managementAccountId,
        targetRegions: [MOCK_CONSTANTS.targetRegions[0]],
        props: MOCK_CONSTANTS.props,
        dryRun: MOCK_CONSTANTS.dryRun,
        serviceHandler: mockServiceHandler,
        batchOperationSettings: undefined as unknown as IRequiredBatchOperationSettings, // This should cause a runtime error
      };

      await expect(
        processAccountBatch(MOCK_CONSTANTS.operation, [MOCK_CONSTANTS.targetAccounts[0]], config),
      ).rejects.toThrow("Cannot read properties of undefined (reading 'maxConcurrentEnvironments')");
    });

    test('should use partial concurrency settings with defaults', async () => {
      const partialSettings: IRequiredBatchOperationSettings = {
        maxConcurrentEnvironments: 3,
        operationTimeoutMs: 5000, // operationTimeoutMs is required in IRequiredBatchOperationSettings
      };

      const config: BatchProcessorConfig<{ testProp: string }, string> = {
        service: MOCK_CONSTANTS.service,
        managementAccountId: MOCK_CONSTANTS.managementAccountId,
        targetRegions: [MOCK_CONSTANTS.targetRegions[0]],
        props: MOCK_CONSTANTS.props,
        dryRun: MOCK_CONSTANTS.dryRun,
        serviceHandler: mockServiceHandler,
        batchOperationSettings: partialSettings,
      };

      const results = await processAccountBatch(MOCK_CONSTANTS.operation, [MOCK_CONSTANTS.targetAccounts[0]], config);

      expect(results).toHaveLength(1);
      expect(mockServiceHandler).toHaveBeenCalledTimes(1);
    });
  });
});
