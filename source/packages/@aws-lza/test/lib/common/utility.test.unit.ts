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

import { describe, beforeEach, afterEach, expect, test, vi } from 'vitest';
import {
  delay,
  waitUntil,
  setRetryStrategy,
  executeApi,
  getAcceleratorAccountType,
  validateRegionFilters,
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
      await waitUntil(predicate, 'error');
      expect(predicate).toHaveBeenCalledTimes(1);
    });

    test('should retry until predicate is true', async () => {
      const predicate = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
      const mockDelay = vi.fn().mockResolvedValue(undefined);

      const promise = waitUntil(predicate, 'error', 5, 1, mockDelay);
      await promise;

      expect(predicate).toHaveBeenCalledTimes(3);
      expect(mockDelay).toHaveBeenCalledTimes(2);
    });

    test('should throw error when retry limit exceeded', async () => {
      const predicate = vi.fn().mockResolvedValue(false);
      const mockDelay = vi.fn().mockResolvedValue(undefined);

      await expect(waitUntil(predicate, 'timeout error', 2, 1, mockDelay)).rejects.toThrow(
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
});
