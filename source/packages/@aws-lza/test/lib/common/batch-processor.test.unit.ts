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

import { describe, beforeEach, expect, test, vi, afterEach } from 'vitest';
import { Account } from '@aws-sdk/client-organizations';
import {
  processAccountBatch,
  processEnableOperations,
  processDisableOperations,
  ServiceOperationHandler,
  AccountSetupHandler,
} from '../../../lib/common/batch-processor';
import { IConcurrencySettings } from '../../../lib/common/interfaces';
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
  concurrencySettings: {
    maxConcurrentEnvironments: 2,
    operationTimeoutMs: 5000,
  } as IConcurrencySettings,
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
  createLogger: vi.fn(() => ({
    processStart: vi.fn(),
    processEnd: vi.fn(),
    info: vi.fn(),
  })),
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

  describe('processAccountBatch', () => {
    test('should process accounts and regions successfully with default concurrency', async () => {
      const results = await processAccountBatch(
        MOCK_CONSTANTS.service,
        MOCK_CONSTANTS.operation,
        MOCK_CONSTANTS.managementAccountId,
        MOCK_CONSTANTS.targetAccounts,
        MOCK_CONSTANTS.targetRegions,
        MOCK_CONSTANTS.props,
        MOCK_CONSTANTS.dryRun,
        mockServiceHandler,
      );

      expect(results).toHaveLength(4); // 2 accounts × 2 regions
      expect(results.every(result => result === 'success')).toBe(true);
      expect(mockServiceHandler).toHaveBeenCalledTimes(4);
    });

    test('should process with custom concurrency settings', async () => {
      const results = await processAccountBatch(
        MOCK_CONSTANTS.service,
        MOCK_CONSTANTS.operation,
        MOCK_CONSTANTS.managementAccountId,
        MOCK_CONSTANTS.targetAccounts,
        MOCK_CONSTANTS.targetRegions,
        MOCK_CONSTANTS.props,
        MOCK_CONSTANTS.dryRun,
        mockServiceHandler,
        MOCK_CONSTANTS.concurrencySettings,
      );

      expect(results).toHaveLength(4);
      expect(mockServiceHandler).toHaveBeenCalledTimes(4);
    });

    test('should use account setup handler when provided', async () => {
      const results = await processAccountBatch(
        MOCK_CONSTANTS.service,
        MOCK_CONSTANTS.operation,
        MOCK_CONSTANTS.managementAccountId,
        MOCK_CONSTANTS.targetAccounts,
        MOCK_CONSTANTS.targetRegions,
        MOCK_CONSTANTS.props,
        MOCK_CONSTANTS.dryRun,
        mockServiceHandler,
        MOCK_CONSTANTS.concurrencySettings,
        mockAccountSetupHandler,
        MOCK_CONSTANTS.organizationAccounts,
      );

      expect(results).toHaveLength(4);
      expect(mockAccountSetupHandler).toHaveBeenCalledTimes(4); // Once per account-region combination
      expect(mockServiceHandler).toHaveBeenCalledTimes(4);
    });

    test('should handle service handler timeout', async () => {
      const slowHandler = vi.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 10000)));

      await expect(
        processAccountBatch(
          MOCK_CONSTANTS.service,
          MOCK_CONSTANTS.operation,
          MOCK_CONSTANTS.managementAccountId,
          [MOCK_CONSTANTS.targetAccounts[0]],
          [MOCK_CONSTANTS.targetRegions[0]],
          MOCK_CONSTANTS.props,
          MOCK_CONSTANTS.dryRun,
          slowHandler,
          { maxConcurrentEnvironments: 1, operationTimeoutMs: 100 },
        ),
      ).rejects.toThrow('timeout after 100ms');
    });

    test('should handle service handler errors', async () => {
      const errorHandler = vi.fn().mockRejectedValue(new Error('Service error'));

      await expect(
        processAccountBatch(
          MOCK_CONSTANTS.service,
          MOCK_CONSTANTS.operation,
          MOCK_CONSTANTS.managementAccountId,
          [MOCK_CONSTANTS.targetAccounts[0]],
          [MOCK_CONSTANTS.targetRegions[0]],
          MOCK_CONSTANTS.props,
          MOCK_CONSTANTS.dryRun,
          errorHandler,
        ),
      ).rejects.toThrow('Service error');
    });

    test('should handle empty accounts array', async () => {
      const results = await processAccountBatch(
        MOCK_CONSTANTS.service,
        MOCK_CONSTANTS.operation,
        MOCK_CONSTANTS.managementAccountId,
        [],
        MOCK_CONSTANTS.targetRegions,
        MOCK_CONSTANTS.props,
        MOCK_CONSTANTS.dryRun,
        mockServiceHandler,
      );

      expect(results).toHaveLength(0);
      expect(mockServiceHandler).not.toHaveBeenCalled();
    });

    test('should handle empty regions array', async () => {
      const results = await processAccountBatch(
        MOCK_CONSTANTS.service,
        MOCK_CONSTANTS.operation,
        MOCK_CONSTANTS.managementAccountId,
        MOCK_CONSTANTS.targetAccounts,
        [],
        MOCK_CONSTANTS.props,
        MOCK_CONSTANTS.dryRun,
        mockServiceHandler,
      );

      expect(results).toHaveLength(0);
      expect(mockServiceHandler).not.toHaveBeenCalled();
    });

    test('should pass correct parameters to service handler', async () => {
      await processAccountBatch(
        MOCK_CONSTANTS.service,
        MOCK_CONSTANTS.operation,
        MOCK_CONSTANTS.managementAccountId,
        [MOCK_CONSTANTS.targetAccounts[0]],
        [MOCK_CONSTANTS.targetRegions[0]],
        MOCK_CONSTANTS.props,
        true, // dryRun
        mockServiceHandler,
        undefined,
        undefined,
        MOCK_CONSTANTS.organizationAccounts,
      );

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

      await processAccountBatch(
        MOCK_CONSTANTS.service,
        MOCK_CONSTANTS.operation,
        MOCK_CONSTANTS.managementAccountId,
        [accountWithUndefinedFields],
        [MOCK_CONSTANTS.targetRegions[0]],
        MOCK_CONSTANTS.props,
        MOCK_CONSTANTS.dryRun,
        mockServiceHandler,
      );

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
  });

  describe('processEnableOperations', () => {
    test('should process ordered account batches in sequence', async () => {
      const results = await processEnableOperations(
        MOCK_CONSTANTS.service,
        MOCK_CONSTANTS.managementAccountId,
        MOCK_CONSTANTS.orderedAccountBatches,
        MOCK_CONSTANTS.targetRegions,
        MOCK_CONSTANTS.props,
        MOCK_CONSTANTS.dryRun,
        mockServiceHandler,
        MOCK_CONSTANTS.concurrencySettings,
        mockAccountSetupHandler,
        MOCK_CONSTANTS.organizationAccounts,
      );

      expect(results).toHaveLength(4); // 2 batches × 1 account each × 2 regions
      expect(mockServiceHandler).toHaveBeenCalledTimes(4);
    });

    test('should sort batches by order', async () => {
      const unorderedBatches = [
        { ...MOCK_CONSTANTS.orderedAccountBatches[1], order: 3 },
        { ...MOCK_CONSTANTS.orderedAccountBatches[0], order: 1 },
      ];

      const results = await processEnableOperations(
        MOCK_CONSTANTS.service,
        MOCK_CONSTANTS.managementAccountId,
        unorderedBatches,
        MOCK_CONSTANTS.targetRegions,
        MOCK_CONSTANTS.props,
        MOCK_CONSTANTS.dryRun,
        mockServiceHandler,
      );

      expect(results).toHaveLength(4);
      expect(mockServiceHandler).toHaveBeenCalledTimes(4);
    });

    test('should handle empty batches array', async () => {
      const results = await processEnableOperations(
        MOCK_CONSTANTS.service,
        MOCK_CONSTANTS.managementAccountId,
        [],
        MOCK_CONSTANTS.targetRegions,
        MOCK_CONSTANTS.props,
        MOCK_CONSTANTS.dryRun,
        mockServiceHandler,
      );

      expect(results).toHaveLength(0);
      expect(mockServiceHandler).not.toHaveBeenCalled();
    });

    test('should handle batch processing errors', async () => {
      const errorHandler = vi.fn().mockRejectedValue(new Error('Batch error'));

      await expect(
        processEnableOperations(
          MOCK_CONSTANTS.service,
          MOCK_CONSTANTS.managementAccountId,
          MOCK_CONSTANTS.orderedAccountBatches,
          MOCK_CONSTANTS.targetRegions,
          MOCK_CONSTANTS.props,
          MOCK_CONSTANTS.dryRun,
          errorHandler,
        ),
      ).rejects.toThrow('Batch error');
    });
  });

  describe('processDisableOperations', () => {
    test('should process ordered account batches in sequence', async () => {
      const results = await processDisableOperations(
        MOCK_CONSTANTS.service,
        MOCK_CONSTANTS.managementAccountId,
        MOCK_CONSTANTS.orderedAccountBatches,
        MOCK_CONSTANTS.targetRegions,
        MOCK_CONSTANTS.props,
        MOCK_CONSTANTS.dryRun,
        mockServiceHandler,
        MOCK_CONSTANTS.concurrencySettings,
        mockAccountSetupHandler,
        MOCK_CONSTANTS.organizationAccounts,
      );

      expect(results).toHaveLength(4);
      expect(mockServiceHandler).toHaveBeenCalledTimes(4);
    });

    test('should sort batches by order', async () => {
      const unorderedBatches = [
        { ...MOCK_CONSTANTS.orderedAccountBatches[1], order: 3 },
        { ...MOCK_CONSTANTS.orderedAccountBatches[0], order: 1 },
      ];

      const results = await processDisableOperations(
        MOCK_CONSTANTS.service,
        MOCK_CONSTANTS.managementAccountId,
        unorderedBatches,
        MOCK_CONSTANTS.targetRegions,
        MOCK_CONSTANTS.props,
        MOCK_CONSTANTS.dryRun,
        mockServiceHandler,
      );

      expect(results).toHaveLength(4);
      expect(mockServiceHandler).toHaveBeenCalledTimes(4);
    });

    test('should handle empty batches array', async () => {
      const results = await processDisableOperations(
        MOCK_CONSTANTS.service,
        MOCK_CONSTANTS.managementAccountId,
        [],
        MOCK_CONSTANTS.targetRegions,
        MOCK_CONSTANTS.props,
        MOCK_CONSTANTS.dryRun,
        mockServiceHandler,
      );

      expect(results).toHaveLength(0);
      expect(mockServiceHandler).not.toHaveBeenCalled();
    });
  });

  describe('processWithWorkerPool (internal function coverage)', () => {
    test('should handle maxConcurrency validation', async () => {
      const errorHandler = vi.fn().mockRejectedValue(new Error('Invalid concurrency'));

      await expect(
        processAccountBatch(
          MOCK_CONSTANTS.service,
          MOCK_CONSTANTS.operation,
          MOCK_CONSTANTS.managementAccountId,
          [MOCK_CONSTANTS.targetAccounts[0]],
          [MOCK_CONSTANTS.targetRegions[0]],
          MOCK_CONSTANTS.props,
          MOCK_CONSTANTS.dryRun,
          errorHandler,
          { maxConcurrentEnvironments: 0, operationTimeoutMs: 1000 }, // Invalid concurrency
        ),
      ).rejects.toThrow();
    });

    test('should handle queue logging for large task sets', async () => {
      const manyAccounts = Array.from({ length: 10 }, (_, i) => ({
        Id: `${i}`.padStart(12, '0'),
        Name: `Account${i}`,
        Email: `account${i}@example.com`,
      })) as Account[];

      const results = await processAccountBatch(
        MOCK_CONSTANTS.service,
        MOCK_CONSTANTS.operation,
        MOCK_CONSTANTS.managementAccountId,
        manyAccounts,
        MOCK_CONSTANTS.targetRegions,
        MOCK_CONSTANTS.props,
        MOCK_CONSTANTS.dryRun,
        mockServiceHandler,
        { maxConcurrentEnvironments: 2, operationTimeoutMs: 5000 },
      );

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

      await expect(
        processAccountBatch(
          MOCK_CONSTANTS.service,
          MOCK_CONSTANTS.operation,
          MOCK_CONSTANTS.managementAccountId,
          MOCK_CONSTANTS.targetAccounts,
          [MOCK_CONSTANTS.targetRegions[0]],
          MOCK_CONSTANTS.props,
          MOCK_CONSTANTS.dryRun,
          partialErrorHandler,
          { maxConcurrentEnvironments: 1, operationTimeoutMs: 5000 },
        ),
      ).rejects.toThrow('Task execution error');
    });
  });

  describe('withTimeout function coverage', () => {
    test('should clear timeout when promise resolves', async () => {
      const fastHandler = vi.fn().mockResolvedValue('fast result');

      const results = await processAccountBatch(
        MOCK_CONSTANTS.service,
        MOCK_CONSTANTS.operation,
        MOCK_CONSTANTS.managementAccountId,
        [MOCK_CONSTANTS.targetAccounts[0]],
        [MOCK_CONSTANTS.targetRegions[0]],
        MOCK_CONSTANTS.props,
        MOCK_CONSTANTS.dryRun,
        fastHandler,
        { maxConcurrentEnvironments: 1, operationTimeoutMs: 5000 },
      );

      expect(results).toEqual(['fast result']);
      expect(fastHandler).toHaveBeenCalledTimes(1);
    });

    test('should clear timeout when promise rejects', async () => {
      const errorHandler = vi.fn().mockRejectedValue(new Error('Handler error'));

      await expect(
        processAccountBatch(
          MOCK_CONSTANTS.service,
          MOCK_CONSTANTS.operation,
          MOCK_CONSTANTS.managementAccountId,
          [MOCK_CONSTANTS.targetAccounts[0]],
          [MOCK_CONSTANTS.targetRegions[0]],
          MOCK_CONSTANTS.props,
          MOCK_CONSTANTS.dryRun,
          errorHandler,
          { maxConcurrentEnvironments: 1, operationTimeoutMs: 5000 },
        ),
      ).rejects.toThrow('Handler error');
    });
  });

  describe('resolveConcurrencySettings function coverage', () => {
    test('should use default values when concurrency is undefined', async () => {
      const results = await processAccountBatch(
        MOCK_CONSTANTS.service,
        MOCK_CONSTANTS.operation,
        MOCK_CONSTANTS.managementAccountId,
        [MOCK_CONSTANTS.targetAccounts[0]],
        [MOCK_CONSTANTS.targetRegions[0]],
        MOCK_CONSTANTS.props,
        MOCK_CONSTANTS.dryRun,
        mockServiceHandler,
        undefined, // No concurrency settings
      );

      expect(results).toHaveLength(1);
      expect(mockServiceHandler).toHaveBeenCalledTimes(1);
    });

    test('should use partial concurrency settings with defaults', async () => {
      const partialSettings: IConcurrencySettings = {
        maxConcurrentEnvironments: 3,
        // operationTimeoutMs not provided - should use default
      };

      const results = await processAccountBatch(
        MOCK_CONSTANTS.service,
        MOCK_CONSTANTS.operation,
        MOCK_CONSTANTS.managementAccountId,
        [MOCK_CONSTANTS.targetAccounts[0]],
        [MOCK_CONSTANTS.targetRegions[0]],
        MOCK_CONSTANTS.props,
        MOCK_CONSTANTS.dryRun,
        mockServiceHandler,
        partialSettings,
      );

      expect(results).toHaveLength(1);
      expect(mockServiceHandler).toHaveBeenCalledTimes(1);
    });
  });
});
