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

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  delay,
  executeApi,
  getAcceleratorAccountType,
  processInBatches,
  setRetryStrategy,
  validateRegionFilters,
  waitUntil,
} from '../../../lib/common/utility';

vi.mock('@aws-sdk/util-retry', () => ({
  ConfiguredRetryStrategy: vi.fn(),
}));

vi.mock('../../../lib/common/types', () => ({
  MODULE_EXCEPTIONS: {
    SERVICE_EXCEPTION: 'ServiceException',
    INVALID_INPUT: 'InvalidInput',
  },
}));

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  processStart: vi.fn(),
  processEnd: vi.fn(),
  dryRun: vi.fn(),
  commandExecution: vi.fn(),
  commandSuccess: vi.fn(),
};

describe('utility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('delay', () => {
    test('should delay for specified minutes', async () => {
      const promise = delay(2);
      vi.advanceTimersByTime(120000);
      await expect(promise).resolves.toBeUndefined();
    });
  });

  describe('waitUntil', () => {
    test('should return when predicate is true', async () => {
      const predicate = vi.fn().mockResolvedValue(true);
      await waitUntil(predicate, 'error', mockLogger, 'test-prefix');
      expect(predicate).toHaveBeenCalledTimes(1);
    });

    test('should retry until predicate is true', async () => {
      const predicate = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      const mockDelay = vi.fn().mockResolvedValue(undefined);

      const promise = waitUntil(predicate, 'error', mockLogger, 'test-prefix', 5, 1, mockDelay);
      await promise;

      expect(predicate).toHaveBeenCalledTimes(3);
      expect(mockDelay).toHaveBeenCalledTimes(2);
    });

    test('should throw error when retry limit exceeded', async () => {
      const predicate = vi.fn().mockResolvedValue(false);
      const mockDelay = vi.fn().mockResolvedValue(undefined);

      await expect(waitUntil(predicate, 'timeout error', mockLogger, 'test-prefix', 2, 1, mockDelay)).rejects.toThrow(
        'ServiceException: timeout error',
      );

      expect(predicate).toHaveBeenCalledTimes(3);
      expect(mockDelay).toHaveBeenCalledTimes(2);
    });
  });

  describe('setRetryStrategy', () => {
    let mockConfiguredRetryStrategy: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      const utilRetry = await import('@aws-sdk/util-retry');
      mockConfiguredRetryStrategy = vi.mocked(utilRetry.ConfiguredRetryStrategy);
    });

    test('should create ConfiguredRetryStrategy with default attempts', () => {
      setRetryStrategy();
      expect(mockConfiguredRetryStrategy).toHaveBeenCalledWith(800, expect.any(Function));
    });

    test('should use environment variable for max attempts', () => {
      process.env['ACCELERATOR_SDK_MAX_ATTEMPTS'] = '500';
      setRetryStrategy();
      expect(mockConfiguredRetryStrategy).toHaveBeenCalledWith(500, expect.any(Function));
      delete process.env['ACCELERATOR_SDK_MAX_ATTEMPTS'];
    });

    test('should calculate delay correctly', () => {
      setRetryStrategy();
      const delayFn = mockConfiguredRetryStrategy.mock.calls[0][1];
      expect(delayFn(1)).toBe(1100);
      expect(delayFn(5)).toBe(5100);
    });
  });

  describe('executeApi', () => {
    test('should execute API call successfully', async () => {
      const apiCall = vi.fn().mockResolvedValue('success');
      const result = await executeApi('TestCommand', { param: 'value' }, apiCall, mockLogger, 'test');

      expect(result).toBe('success');
      expect(mockLogger.info).toHaveBeenCalledWith('Executing TestCommand with arguments: {"param":"value"}', 'test');
      expect(mockLogger.info).toHaveBeenCalledWith('Successfully executed TestCommand', 'test');
    });

    test('should log error and rethrow on failure', async () => {
      const error = new Error('API failed');
      error.name = 'TestError';
      const apiCall = vi.fn().mockRejectedValue(error);

      await expect(executeApi('TestCommand', {}, apiCall, mockLogger, 'test')).rejects.toThrow('API failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        '[API EXCEPTION]: TestCommand failed with TestError: API failed',
        'test',
      );
    });

    test('should log warning for expected exceptions', async () => {
      class ExpectedException extends Error {}
      const error = new ExpectedException('Expected error');
      const apiCall = vi.fn().mockRejectedValue(error);

      await expect(executeApi('TestCommand', {}, apiCall, mockLogger, 'test', [ExpectedException])).rejects.toThrow(
        'Expected error',
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[API EXCEPTION]: TestCommand failed with Error: Expected error',
        'test',
      );
    });

    test('should handle non-Error objects', async () => {
      const apiCall = vi.fn().mockRejectedValue('string error');

      await expect(executeApi('TestCommand', {}, apiCall, mockLogger, 'test')).rejects.toBe('string error');

      expect(mockLogger.error).toHaveBeenCalledWith(
        '[API EXCEPTION]: TestCommand failed with UnknownError: Unknown error',
        'test',
      );
    });
  });

  describe('getAcceleratorAccountType', () => {
    test('should return management for management account', () => {
      expect(getAcceleratorAccountType('123', '123', '456')).toBe('management');
    });

    test('should return delegatedAdmin for delegated admin account', () => {
      expect(getAcceleratorAccountType('456', '123', '456')).toBe('delegatedAdmin');
    });

    test('should return workload for other accounts', () => {
      expect(getAcceleratorAccountType('789', '123', '456')).toBe('workload');
    });
  });

  describe('validateRegionFilters', () => {
    test('should return early when no region filters provided', () => {
      expect(() => validateRegionFilters(true, mockLogger, 'test')).not.toThrow();
    });

    test('should throw error when disabledRegions specified with disabled service', () => {
      const regionFilters = { disabledRegions: ['us-east-1'] };

      expect(() => validateRegionFilters(false, mockLogger, 'test', regionFilters)).toThrow(
        'InvalidInput: disabledRegions cannot be specified when service is disabled',
      );

      expect(mockLogger.error).toHaveBeenCalled();
    });

    test('should allow disabledRegions when service is enabled', () => {
      const regionFilters = { disabledRegions: ['us-east-1'] };
      expect(() => validateRegionFilters(true, mockLogger, 'test', regionFilters)).not.toThrow();
    });

    test('should throw error when regions overlap between disabled and ignored', () => {
      const regionFilters = {
        disabledRegions: ['us-east-1', 'us-west-2'],
        ignoredRegions: ['us-west-2', 'eu-west-1'],
      };

      expect(() => validateRegionFilters(true, mockLogger, 'test', regionFilters)).toThrow(
        'InvalidInput: Regions cannot be both disabled and ignored. Overlapping regions: us-west-2',
      );

      expect(mockLogger.error).toHaveBeenCalled();
    });

    test('should allow non-overlapping disabled and ignored regions', () => {
      const regionFilters = {
        disabledRegions: ['us-east-1'],
        ignoredRegions: ['eu-west-1'],
      };
      expect(() => validateRegionFilters(true, mockLogger, 'test', regionFilters)).not.toThrow();
    });

    test('should handle empty arrays', () => {
      const regionFilters = {
        disabledRegions: [],
        ignoredRegions: [],
      };
      expect(() => validateRegionFilters(false, mockLogger, 'test', regionFilters)).not.toThrow();
    });
  });

  describe('processInBatches', () => {
    beforeEach(() => {
      vi.useRealTimers();
    });

    test('should process all items successfully', async () => {
      const processed: number[] = [];
      const handler = vi.fn(async (item: number) => {
        processed.push(item);
      });

      await processInBatches([1, 2, 3], 2, handler, mockLogger, 'test');

      expect(handler).toHaveBeenCalledTimes(3);
      expect(processed).toEqual(expect.arrayContaining([1, 2, 3]));
    });

    test('should process items in batches of specified size', async () => {
      const batchTracker: number[][] = [];
      let currentBatch: number[] = [];

      const handler = vi.fn(async (item: number) => {
        currentBatch.push(item);
      });

      // Override mockLogger.info to detect batch boundaries
      mockLogger.info.mockImplementation((msg: string) => {
        if (msg.startsWith('Processing batch')) {
          if (currentBatch.length > 0) {
            batchTracker.push([...currentBatch]);
            currentBatch = [];
          }
        }
      });

      await processInBatches([1, 2, 3, 4, 5], 2, handler, mockLogger, 'test');
      // Push the last batch
      if (currentBatch.length > 0) {
        batchTracker.push([...currentBatch]);
      }

      expect(batchTracker.length).toBe(3); // batches: [1,2], [3,4], [5]
      expect(handler).toHaveBeenCalledTimes(5);
    });

    test('should handle empty items array', async () => {
      const handler = vi.fn(async () => {
        /* no-op */
      });

      await processInBatches([], 10, handler, mockLogger, 'test');

      expect(handler).not.toHaveBeenCalled();
    });

    test('should collect errors and throw aggregated error', async () => {
      const handler = vi.fn(async (item: number) => {
        if (item === 2 || item === 4) {
          throw new Error(`Failed for item ${item}`);
        }
      });

      await expect(processInBatches([1, 2, 3, 4, 5], 10, handler, mockLogger, 'test')).rejects.toThrow(
        '2 of 5 batch operations failed',
      );

      expect(handler).toHaveBeenCalledTimes(5);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Batch item 1 failed: Failed for item 2'),
        'test',
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Batch item 3 failed: Failed for item 4'),
        'test',
      );
    });

    test('should continue processing remaining batches after batch errors', async () => {
      const processed: number[] = [];
      const handler = vi.fn(async (item: number) => {
        if (item === 1) {
          throw new Error('First item failed');
        }
        processed.push(item);
      });

      await expect(processInBatches([1, 2, 3, 4], 2, handler, mockLogger, 'test')).rejects.toThrow(
        '1 of 4 batch operations failed',
      );

      // Items 2, 3, 4 should still be processed despite item 1 failing
      expect(processed).toEqual(expect.arrayContaining([2, 3, 4]));
    });

    test('should handle non-Error rejection values', async () => {
      const handler = vi.fn(async (item: number) => {
        if (item === 1) {
          throw 'string error';
        }
      });

      await expect(processInBatches([1, 2], 10, handler, mockLogger, 'test')).rejects.toThrow(
        '1 of 2 batch operations failed: string error',
      );
    });

    test('should run items within a batch concurrently', async () => {
      const startTimes: number[] = [];
      const handler = vi.fn(async () => {
        startTimes.push(Date.now());
        await new Promise<void>(resolve => setTimeout(resolve, 50));
      });

      await processInBatches([1, 2, 3], 3, handler, mockLogger, 'test');

      // All 3 items should start at roughly the same time (within 20ms)
      const maxDiff = Math.max(...startTimes) - Math.min(...startTimes);
      expect(maxDiff).toBeLessThan(20);
    });

    test('should log batch progress', async () => {
      const handler = vi.fn(async () => {
        /* no-op */
      });

      await processInBatches([1, 2, 3, 4, 5], 2, handler, mockLogger, 'test');

      expect(mockLogger.info).toHaveBeenCalledWith('Processing batch 1 of 3 (2 items)', 'test');
      expect(mockLogger.info).toHaveBeenCalledWith('Processing batch 2 of 3 (2 items)', 'test');
      expect(mockLogger.info).toHaveBeenCalledWith('Processing batch 3 of 3 (1 items)', 'test');
    });

    test('should handle batch size larger than items count', async () => {
      const handler = vi.fn(async () => {
        /* no-op */
      });

      await processInBatches([1, 2], 100, handler, mockLogger, 'test');

      expect(handler).toHaveBeenCalledTimes(2);
      expect(mockLogger.info).toHaveBeenCalledWith('Processing batch 1 of 1 (2 items)', 'test');
    });

    test('should wait between batches without delaying after the final batch', async () => {
      vi.useFakeTimers();
      const started: number[] = [];
      const handler = vi.fn(async (item: number) => {
        started.push(item);
      });

      const resultPromise = processInBatches([1, 2, 3, 4, 5], 2, handler, mockLogger, 'test', 1000);
      await vi.advanceTimersByTimeAsync(0);
      expect(started).toEqual([1, 2]);

      await vi.advanceTimersByTimeAsync(999);
      expect(started).toEqual([1, 2]);

      await vi.advanceTimersByTimeAsync(1);
      expect(started).toEqual([1, 2, 3, 4]);

      await vi.advanceTimersByTimeAsync(1000);
      await resultPromise;

      expect(started).toEqual([1, 2, 3, 4, 5]);
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
