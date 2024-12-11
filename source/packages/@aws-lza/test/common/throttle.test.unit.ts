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

import { describe, expect, test } from '@jest/globals';

import { throttlingBackOff, isThrottlingError } from '../../common/throttle';

describe('throttle', () => {
  describe('isThrottlingError', () => {
    test('should return true for SDKv2 throttling errors', () => {
      const errors = [
        { retryable: true },
        { code: 'ConcurrentModificationException' },
        { code: 'ThrottlingException' },
        { code: 'TooManyRequestsException' },
        { code: 'InternalErrorException' },
        { code: 'ECONNRESET' },
      ];

      errors.forEach(error => {
        expect(isThrottlingError(error)).toBe(true);
      });
    });

    test('should return true for SDKv3 throttling errors', () => {
      const errors = [
        { name: 'ThrottlingException' },
        { name: 'TooManyRequestsException' },
        { name: 'ConcurrentModificationException' },
        { name: 'InternalErrorException' },
        { name: 'ECONNRESET' },
      ];

      errors.forEach(error => {
        expect(isThrottlingError(error)).toBe(true);
      });
    });

    test('should return false for non-throttling errors', () => {
      const errors = [{ code: 'ValidationError' }, { name: 'ValidationError' }, { message: 'Generic error' }, {}];

      errors.forEach(error => {
        expect(isThrottlingError(error)).toBe(false);
      });
    });
  });

  describe('throttlingBackOff', () => {
    test('should retry on throttling errors', async () => {
      const mockRequest = jest.fn();
      mockRequest.mockRejectedValueOnce({ code: 'ThrottlingException' }).mockResolvedValueOnce('success');

      const result = await throttlingBackOff(mockRequest, { numOfAttempts: 2 });

      expect(result).toBe('success');
      expect(mockRequest).toHaveBeenCalledTimes(2);
    });

    test('should throw error after max attempts', async () => {
      const mockRequest = jest.fn();
      mockRequest.mockRejectedValue({ code: 'ThrottlingException' });

      await expect(throttlingBackOff(mockRequest, { numOfAttempts: 2 })).rejects.toEqual({
        code: 'ThrottlingException',
      });

      expect(mockRequest).toHaveBeenCalledTimes(2);
    });

    test('should succeed on first try if no error', async () => {
      const mockRequest = jest.fn().mockResolvedValue('success');

      const result = await throttlingBackOff(mockRequest);

      expect(result).toBe('success');
      expect(mockRequest).toHaveBeenCalledTimes(1);
    });
  });
});
