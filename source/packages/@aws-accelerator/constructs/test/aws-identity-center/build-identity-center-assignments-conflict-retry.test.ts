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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IdentitystoreClient } from '@aws-sdk/client-identitystore';
import {
  SSOAdminClient,
  CreateAccountAssignmentCommand,
  DeleteAccountAssignmentCommand,
  DescribeAccountAssignmentCreationStatusCommand,
  DescribeAccountAssignmentDeletionStatusCommand,
} from '@aws-sdk/client-sso-admin';
import * as throttleModule from '@aws-accelerator/utils/lib/throttle';

// throttle is deliberately not mocked so the real retry logic runs.
vi.mock('@aws-sdk/client-identitystore');
vi.mock('@aws-sdk/client-sso-admin');
vi.mock('@aws-accelerator/utils/lib/common-functions', () => ({
  setRetryStrategy: vi.fn(() => ({})),
}));

// Resolve timers immediately to skip real backoff/poll delays.
const setTimeoutSpy = vi.spyOn(global, 'setTimeout').mockImplementation((fn: TimerHandler) => {
  if (typeof fn === 'function') fn();
  return 0 as unknown as NodeJS.Timeout;
});

const DEFAULT_MAX_ATTEMPTS = 12;
const DEFAULT_STARTING_DELAY_MS = 150;

const conflictError = Object.assign(new Error('There is a conflicting operation in process.'), {
  name: 'ConflictException',
});

const createEvent = (requestType: string, overrides = {}) =>
  ({
    RequestType: requestType,
    ResponseURL: 'https://example.com',
    StackId: 'test-stack',
    RequestId: 'test-request',
    LogicalResourceId: 'test-resource',
    ResourceType: 'Custom::IdentityCenterAssignments',
    ResourceProperties: {
      instanceArn: 'arn:aws:sso:::instance/ssoins-123456789210',
      identityStoreId: 'd-906751796e',
      principals: [{ name: 'test-group', type: 'GROUP' }],
      permissionSetArn: 'arn:aws:sso:::permissionSet/ssoins-1111111111111111/ps-1111111111111111',
      accountIds: ['111111111111'],
    },
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

describe('Build Identity Center Assignments - ConflictException retry', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockIdentityStoreClient: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockSSOAdminClient: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // vitest.setup.ts stubs throttlingBackOff with a pass-through spy; restore the real one.
    (throttleModule.throttlingBackOff as unknown as { mockRestore?: () => void }).mockRestore?.();

    mockIdentityStoreClient = {
      send: vi.fn().mockResolvedValue({ GroupId: 'group-123456789' }),
    };

    vi.mocked(IdentitystoreClient).mockImplementation(function () {
      return mockIdentityStoreClient;
    });
    vi.mocked(CreateAccountAssignmentCommand).mockImplementation(function (input) {
      return { input };
    });
    vi.mocked(DeleteAccountAssignmentCommand).mockImplementation(function (input) {
      return { input };
    });
    vi.mocked(DescribeAccountAssignmentCreationStatusCommand).mockImplementation(function (input) {
      return { input };
    });
    vi.mocked(DescribeAccountAssignmentDeletionStatusCommand).mockImplementation(function (input) {
      return { input };
    });
  });

  it('should retry CreateAccountAssignment when a ConflictException is thrown', async () => {
    mockSSOAdminClient = {
      send: vi
        .fn()
        // first create attempt conflicts
        .mockRejectedValueOnce(conflictError)
        // retry succeeds
        .mockResolvedValueOnce({
          AccountAssignmentCreationStatus: { RequestId: 'create-req-1', Status: 'IN_PROGRESS' },
        })
        // poll
        .mockResolvedValueOnce({
          AccountAssignmentCreationStatus: { RequestId: 'create-req-1', Status: 'SUCCEEDED' },
        }),
    };
    vi.mocked(SSOAdminClient).mockImplementation(function () {
      return mockSSOAdminClient;
    });

    const { handler } = await import('../../lib/aws-identity-center/build-identity-center-assignments/index.ts');
    const result = await handler(createEvent('Create'));

    expect(result?.Status).toBe('SUCCESS');
    // 1 failed create + 1 retried create + 1 describe poll
    expect(mockSSOAdminClient.send).toHaveBeenCalledTimes(3);
  });

  it('should retry DeleteAccountAssignment when a ConflictException is thrown', async () => {
    const sdkV2ConflictError = Object.assign(new Error('There is a conflicting operation in process.'), {
      code: 'ConflictException',
    });
    mockSSOAdminClient = {
      send: vi
        .fn()
        .mockRejectedValueOnce(sdkV2ConflictError)
        .mockResolvedValueOnce({
          AccountAssignmentDeletionStatus: { RequestId: 'delete-req-1', Status: 'IN_PROGRESS' },
        })
        .mockResolvedValueOnce({
          AccountAssignmentDeletionStatus: { RequestId: 'delete-req-1', Status: 'SUCCEEDED' },
        }),
    };
    vi.mocked(SSOAdminClient).mockImplementation(function () {
      return mockSSOAdminClient;
    });

    const { handler } = await import('../../lib/aws-identity-center/build-identity-center-assignments/index.ts');
    const result = await handler(createEvent('Delete'));

    expect(result?.Status).toBe('SUCCESS');
    expect(mockSSOAdminClient.send).toHaveBeenCalledTimes(3);
  });

  it.each([
    {
      requestType: 'Create',
      initialStatus: {
        AccountAssignmentCreationStatus: { RequestId: 'create-req-1', Status: 'IN_PROGRESS' },
      },
      finalStatus: {
        AccountAssignmentCreationStatus: { RequestId: 'create-req-1', Status: 'SUCCEEDED' },
      },
    },
    {
      requestType: 'Delete',
      initialStatus: {
        AccountAssignmentDeletionStatus: { RequestId: 'delete-req-1', Status: 'IN_PROGRESS' },
      },
      finalStatus: {
        AccountAssignmentDeletionStatus: { RequestId: 'delete-req-1', Status: 'SUCCEEDED' },
      },
    },
  ])(
    'should retry $requestType AccountAssignment when a ThrottlingException is thrown',
    async ({ requestType, initialStatus, finalStatus }) => {
      const throttlingError = Object.assign(new Error('Rate exceeded'), {
        name: 'ThrottlingException',
      });
      mockSSOAdminClient = {
        send: vi
          .fn()
          // first attempt is throttled
          .mockRejectedValueOnce(throttlingError)
          // retry succeeds
          .mockResolvedValueOnce(initialStatus)
          // poll
          .mockResolvedValueOnce(finalStatus),
      };
      vi.mocked(SSOAdminClient).mockImplementation(function () {
        return mockSSOAdminClient;
      });

      const { handler } = await import('../../lib/aws-identity-center/build-identity-center-assignments/index.ts');
      const result = await handler(createEvent(requestType));

      expect(result?.Status).toBe('SUCCESS');
      // 1 throttled attempt + 1 retried attempt + 1 describe poll
      expect(mockSSOAdminClient.send).toHaveBeenCalledTimes(3);
    },
  );

  it('should propagate ConflictException after retries are exhausted', async () => {
    mockSSOAdminClient = {
      // every attempt conflicts
      send: vi.fn().mockRejectedValue(conflictError),
    };
    vi.mocked(SSOAdminClient).mockImplementation(function () {
      return mockSSOAdminClient;
    });

    const { handler } = await import('../../lib/aws-identity-center/build-identity-center-assignments/index.ts');
    await expect(handler(createEvent('Create'))).rejects.toBe(conflictError);

    expect(mockSSOAdminClient.send).toHaveBeenCalledTimes(DEFAULT_MAX_ATTEMPTS);
    expect(setTimeoutSpy).toHaveBeenCalledTimes(DEFAULT_MAX_ATTEMPTS - 1);

    const delays = setTimeoutSpy.mock.calls.map(([, delay]) => Number(delay));
    const maximumDelays = Array.from(
      { length: DEFAULT_MAX_ATTEMPTS - 1 },
      (_, attempt) => DEFAULT_STARTING_DELAY_MS * 2 ** attempt,
    );
    delays.forEach((delay, attempt) => {
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(maximumDelays[attempt]!);
    });
    expect(delays.reduce((total, delay) => total + delay, 0)).toBeLessThanOrEqual(
      maximumDelays.reduce((total, delay) => total + delay, 0),
    );
  });

  it('should not retry non-retryable errors', async () => {
    const accessDeniedError = Object.assign(new Error('Access denied'), {
      name: 'AccessDeniedException',
    });
    mockSSOAdminClient = {
      send: vi.fn().mockRejectedValueOnce(accessDeniedError),
    };
    vi.mocked(SSOAdminClient).mockImplementation(function () {
      return mockSSOAdminClient;
    });

    const { handler } = await import('../../lib/aws-identity-center/build-identity-center-assignments/index.ts');
    await expect(handler(createEvent('Delete'))).rejects.toBe(accessDeniedError);

    // not retryable: fails fast
    expect(mockSSOAdminClient.send).toHaveBeenCalledTimes(1);
    expect(setTimeoutSpy).not.toHaveBeenCalled();
  });

  it('should not retry a ValidationException raised by an invalid principalId', async () => {
    // IAM Identity Center returns ValidationException (HTTP 400) when principalId is not an identity
    // store id. It is a syntax error, so retrying it can only burn backoff attempts.
    const validationException = Object.assign(
      new Error(
        "1 validation error detected: Value 'Platform-Admins' at 'principalId' failed to satisfy constraint: Member must satisfy regular expression pattern: ([0-9a-f]{10}-|)[A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12}",
      ),
      { name: 'ValidationException' },
    );
    mockSSOAdminClient = {
      // every attempt would fail, so a retryable classification would show up as repeated sends
      send: vi.fn().mockRejectedValue(validationException),
    };
    vi.mocked(SSOAdminClient).mockImplementation(function () {
      return mockSSOAdminClient;
    });

    const { handler } = await import('../../lib/aws-identity-center/build-identity-center-assignments/index.ts');
    await expect(
      handler(
        createEvent('Create', {
          ResourceProperties: {
            instanceArn: 'arn:aws:sso:::instance/ssoins-123456789210',
            identityStoreId: 'd-906751796e',
            principalId: 'Platform-Admins',
            principalType: 'GROUP',
            permissionSetArn: 'arn:aws:sso:::permissionSet/ssoins-1111111111111111/ps-1111111111111111',
            accountIds: ['111111111111'],
          },
        }),
      ),
    ).rejects.toBe(validationException);

    // not retryable: fails fast on the first attempt with no backoff delay
    expect(mockSSOAdminClient.send).toHaveBeenCalledTimes(1);
    expect(setTimeoutSpy).not.toHaveBeenCalled();
  });

  it.each([
    {
      requestType: 'Create',
      initialStatus: {
        AccountAssignmentCreationStatus: { RequestId: 'create-req-1', Status: 'IN_PROGRESS' },
      },
    },
    {
      requestType: 'Delete',
      initialStatus: {
        AccountAssignmentDeletionStatus: { RequestId: 'delete-req-1', Status: 'IN_PROGRESS' },
      },
    },
  ])(
    'should not retry ConflictException while polling a $requestType request',
    async ({ requestType, initialStatus }) => {
      mockSSOAdminClient = {
        send: vi.fn().mockResolvedValueOnce(initialStatus).mockRejectedValueOnce(conflictError),
      };
      vi.mocked(SSOAdminClient).mockImplementation(function () {
        return mockSSOAdminClient;
      });

      const { handler } = await import('../../lib/aws-identity-center/build-identity-center-assignments/index.ts');
      await expect(handler(createEvent(requestType))).rejects.toBe(conflictError);

      expect(mockSSOAdminClient.send).toHaveBeenCalledTimes(2);
      expect(setTimeoutSpy).not.toHaveBeenCalled();
    },
  );
});
