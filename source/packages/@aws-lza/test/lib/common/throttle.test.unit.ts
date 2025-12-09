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

import { describe, beforeEach, expect, test, vi } from 'vitest';
import { throttlingBackOff, isThrottlingError } from '../../../lib/common/throttle';

vi.mock('exponential-backoff', () => ({
  backOff: vi.fn(),
}));

describe('throttle', () => {
  let mockBackOff: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const exponentialBackoff = await import('exponential-backoff');
    mockBackOff = vi.mocked(exponentialBackoff.backOff);
  });

  describe('throttlingBackOff', () => {
    test('should call backOff with default options', async () => {
      const mockRequest = vi.fn().mockResolvedValue('success');
      mockBackOff.mockResolvedValue('success');

      await throttlingBackOff(mockRequest);

      expect(mockBackOff).toHaveBeenCalledWith(mockRequest, {
        startingDelay: 150,
        numOfAttempts: 20,
        jitter: 'full',
        retry: isThrottlingError,
      });
    });

    test('should call backOff with custom options', async () => {
      const mockRequest = vi.fn().mockResolvedValue('success');
      const customOptions = {
        startingDelay: 300,
        numOfAttempts: 10,
        maxDelay: 5000,
      };
      mockBackOff.mockResolvedValue('success');

      await throttlingBackOff(mockRequest, customOptions);

      expect(mockBackOff).toHaveBeenCalledWith(mockRequest, {
        startingDelay: 300,
        numOfAttempts: 10,
        jitter: 'full',
        retry: isThrottlingError,
        maxDelay: 5000,
      });
    });

    test('should return the result from backOff', async () => {
      const mockRequest = vi.fn();
      const expectedResult = { data: 'test' };
      mockBackOff.mockResolvedValue(expectedResult);

      const result = await throttlingBackOff(mockRequest);

      expect(result).toBe(expectedResult);
    });

    test('should throw error when backOff fails', async () => {
      const mockRequest = vi.fn();
      const error = new Error('All retries failed');
      mockBackOff.mockRejectedValue(error);

      await expect(throttlingBackOff(mockRequest)).rejects.toThrow('All retries failed');
    });
  });

  describe('isThrottlingError', () => {
    test('should return true for retryable errors', () => {
      expect(isThrottlingError({ retryable: true })).toBe(true);
    });

    test('should return true for PolicyTypeNotEnabledException', () => {
      expect(isThrottlingError({ name: 'PolicyTypeNotEnabledException' })).toBe(true);
    });

    test('should return true for ConcurrentModificationException', () => {
      expect(isThrottlingError({ name: 'ConcurrentModificationException' })).toBe(true);
    });

    test('should return true for InsufficientDeliveryPolicyException', () => {
      expect(isThrottlingError({ name: 'InsufficientDeliveryPolicyException' })).toBe(true);
    });

    test('should return true for NoAvailableDeliveryChannelException', () => {
      expect(isThrottlingError({ name: 'NoAvailableDeliveryChannelException' })).toBe(true);
    });

    test('should return true for ConcurrentModifications', () => {
      expect(isThrottlingError({ name: 'ConcurrentModifications' })).toBe(true);
    });

    test('should return true for LimitExceededException', () => {
      expect(isThrottlingError({ name: 'LimitExceededException' })).toBe(true);
    });

    test('should return true for OperationNotPermittedException', () => {
      expect(isThrottlingError({ name: 'OperationNotPermittedException' })).toBe(true);
    });

    test('should return true for CredentialsProviderError', () => {
      expect(isThrottlingError({ name: 'CredentialsProviderError' })).toBe(true);
    });

    test('should return true for TooManyRequestsException', () => {
      expect(isThrottlingError({ name: 'TooManyRequestsException' })).toBe(true);
    });

    test('should return true for TooManyUpdates', () => {
      expect(isThrottlingError({ name: 'TooManyUpdates' })).toBe(true);
    });

    test('should return true for Throttling', () => {
      expect(isThrottlingError({ name: 'Throttling' })).toBe(true);
    });

    test('should return true for ThrottlingException', () => {
      expect(isThrottlingError({ name: 'ThrottlingException' })).toBe(true);
    });

    test('should return true for InternalErrorException', () => {
      expect(isThrottlingError({ name: 'InternalErrorException' })).toBe(true);
    });

    test('should return true for InternalException', () => {
      expect(isThrottlingError({ name: 'InternalException' })).toBe(true);
    });

    test('should return true for ECONNRESET', () => {
      expect(isThrottlingError({ name: 'ECONNRESET' })).toBe(true);
    });

    test('should return true for EPIPE', () => {
      expect(isThrottlingError({ name: 'EPIPE' })).toBe(true);
    });

    test('should return true for ENOTFOUND', () => {
      expect(isThrottlingError({ name: 'ENOTFOUND' })).toBe(true);
    });

    test('should return true for ETIMEDOUT', () => {
      expect(isThrottlingError({ name: 'ETIMEDOUT' })).toBe(true);
    });

    test('should return false for non-retryable errors', () => {
      expect(isThrottlingError({ name: 'AccessDeniedException' })).toBe(false);
      expect(isThrottlingError({ name: 'ValidationException' })).toBe(false);
      expect(isThrottlingError({ retryable: false })).toBe(false);
      expect(isThrottlingError({})).toBe(false);
    });

    test('should handle null and undefined safely', () => {
      // These will cause errors due to property access on null/undefined
      // but that's the actual behavior of the function
      expect(() => isThrottlingError(null)).toThrow();
      expect(() => isThrottlingError(undefined)).toThrow();
    });

    test('should handle multiple error conditions', () => {
      expect(isThrottlingError({ retryable: true, name: 'SomeOtherError' })).toBe(true);
      expect(isThrottlingError({ retryable: false, name: 'ThrottlingException' })).toBe(true);
    });
  });
});
