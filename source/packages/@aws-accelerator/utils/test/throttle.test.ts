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
import { describe, expect, test } from 'vitest';
import { isThrottlingError } from '../lib/throttle';

describe('isThrottlingError', () => {
  test('returns true when the SDK marks the error retryable', () => {
    expect(isThrottlingError({ retryable: true })).toBe(true);
  });

  test('returns true for generic throttling errors', () => {
    expect(isThrottlingError({ name: 'ThrottlingException' })).toBe(true);
    expect(isThrottlingError({ name: 'TooManyRequestsException' })).toBe(true);
    expect(isThrottlingError({ code: 'ThrottlingException' })).toBe(true);
  });

  test('returns false for non-retryable errors', () => {
    expect(isThrottlingError({ name: 'AccessDeniedException' })).toBe(false);
    expect(isThrottlingError({ name: 'ResourceAlreadyExistsException' })).toBe(false);
    expect(isThrottlingError({ name: 'QuotaExceededException' })).toBe(false);
    expect(isThrottlingError({ code: 'QuotaExceededException' })).toBe(false);
    expect(isThrottlingError({ retryable: false })).toBe(false);
    expect(isThrottlingError({})).toBe(false);
  });
});
