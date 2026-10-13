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

// Mock the AWS SDK clients
vi.mock('@aws-sdk/client-identitystore');
vi.mock('@aws-sdk/client-sso-admin');
vi.mock('@aws-accelerator/utils/lib/throttle', () => ({
  throttlingBackOff: vi.fn(fn => fn()),
}));
vi.mock('@aws-accelerator/utils/lib/common-functions', () => ({
  setRetryStrategy: vi.fn(() => ({})),
}));

// Replace setTimeout with immediate resolution to avoid real delays in tests
vi.spyOn(global, 'setTimeout').mockImplementation((fn: TimerHandler) => {
  if (typeof fn === 'function') fn();
  return 0 as unknown as NodeJS.Timeout;
});

describe('Build Identity Center Assignments - Principal ID Lookup', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockIdentityStoreClient: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockSSOAdminClient: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockIdentityStoreClient = {
      send: vi.fn(),
    };

    // Default mock: Create returns IN_PROGRESS, then Describe returns SUCCEEDED
    mockSSOAdminClient = {
      send: vi
        .fn()
        .mockResolvedValueOnce({
          AccountAssignmentCreationStatus: {
            RequestId: 'test-request-id',
            Status: 'IN_PROGRESS',
          },
        })
        .mockResolvedValueOnce({
          AccountAssignmentCreationStatus: {
            RequestId: 'test-request-id',
            Status: 'SUCCEEDED',
          },
        })
        // Extra calls for multi-principal tests: second Create + Describe
        .mockResolvedValueOnce({
          AccountAssignmentCreationStatus: {
            RequestId: 'test-request-id-2',
            Status: 'IN_PROGRESS',
          },
        })
        .mockResolvedValueOnce({
          AccountAssignmentCreationStatus: {
            RequestId: 'test-request-id-2',
            Status: 'SUCCEEDED',
          },
        }),
    };

    vi.mocked(IdentitystoreClient).mockImplementation(function () {
      return mockIdentityStoreClient;
    });
    vi.mocked(SSOAdminClient).mockImplementation(function () {
      return mockSSOAdminClient;
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

  it('should use GetUserIdCommand with correct parameters for user lookup', async () => {
    // Mock GetUserIdCommand response
    mockIdentityStoreClient.send.mockResolvedValueOnce({
      UserId: 'user-123456789',
      IdentityStoreId: 'd-906751796e',
    });

    // Import and call the handler after mocks are set up
    const { handler } = await import('../../lib/aws-identity-center/build-identity-center-assignments/index');

    const mockEvent = {
      RequestType: 'Create',
      ResponseURL: 'https://example.com',
      StackId: 'test-stack',
      RequestId: 'test-request',
      LogicalResourceId: 'test-resource',
      ResourceType: 'Custom::IdentityCenterAssignments',
      ResourceProperties: {
        instanceArn: 'arn:aws:sso:::instance/ssoins-123456789210',
        identityStoreId: 'd-906751796e',
        principals: [{ name: 'test-user', type: 'USER' }],
        permissionSetArn: 'arn:aws:sso:::permissionSet/ssoins-1111111111111111/ps-1111111111111111',
        accountIds: ['111111111111'],
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const result = await handler(mockEvent);

    expect(result?.Status).toBe('SUCCESS');
    expect(mockIdentityStoreClient.send).toHaveBeenCalledTimes(1);
  });

  it('should use GetGroupIdCommand with correct parameters for group lookup', async () => {
    // Mock GetGroupIdCommand response
    mockIdentityStoreClient.send.mockResolvedValueOnce({
      GroupId: 'group-123456789',
      IdentityStoreId: 'd-906751796e',
    });

    const { handler } = await import('../../lib/aws-identity-center/build-identity-center-assignments/index.ts');

    const mockEvent = {
      RequestType: 'Create',
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const result = await handler(mockEvent);

    expect(result?.Status).toBe('SUCCESS');
    expect(mockIdentityStoreClient.send).toHaveBeenCalledTimes(1);
  });

  it('should handle both user and group lookups successfully', async () => {
    // Mock responses for both user and group
    mockIdentityStoreClient.send
      .mockResolvedValueOnce({ UserId: 'user-123456789' })
      .mockResolvedValueOnce({ GroupId: 'group-123456789' });

    const { handler } = await import('../../lib/aws-identity-center/build-identity-center-assignments/index.ts');

    const mockEvent = {
      RequestType: 'Create',
      ResponseURL: 'https://example.com',
      StackId: 'test-stack',
      RequestId: 'test-request',
      LogicalResourceId: 'test-resource',
      ResourceType: 'Custom::IdentityCenterAssignments',
      ResourceProperties: {
        instanceArn: 'arn:aws:sso:::instance/ssoins-123456789210',
        identityStoreId: 'd-906751796e',
        principals: [
          { name: 'test-user', type: 'USER' },
          { name: 'test-group', type: 'GROUP' },
        ],
        permissionSetArn: 'arn:aws:sso:::permissionSet/ssoins-1111111111111111/ps-1111111111111111',
        accountIds: ['111111111111'],
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const result = await handler(mockEvent);

    expect(result?.Status).toBe('SUCCESS');
    expect(mockIdentityStoreClient.send).toHaveBeenCalledTimes(2);
  });

  it('should return FAILED status when user lookup fails', async () => {
    mockIdentityStoreClient.send.mockRejectedValueOnce(new Error('ResourceNotFoundException'));

    const { handler } = await import('../../lib/aws-identity-center/build-identity-center-assignments/index.ts');

    const mockEvent = {
      RequestType: 'Create',
      ResponseURL: 'https://example.com',
      StackId: 'test-stack',
      RequestId: 'test-request',
      LogicalResourceId: 'test-resource',
      ResourceType: 'Custom::IdentityCenterAssignments',
      ResourceProperties: {
        instanceArn: 'arn:aws:sso:::instance/ssoins-123456789210',
        identityStoreId: 'd-906751796e',
        principals: [{ name: 'nonexistent-user', type: 'USER' }],
        permissionSetArn: 'arn:aws:sso:::permissionSet/ssoins-1111111111111111/ps-1111111111111111',
        accountIds: ['111111111111'],
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const result = await handler(mockEvent);

    expect(result?.Status).toBe('FAILED');
    expect(result?.Reason).toContain("User 'nonexistent-user' not found in Identity Store 'd-906751796e'");
  });

  it('should return FAILED status when group lookup fails', async () => {
    mockIdentityStoreClient.send.mockRejectedValueOnce(new Error('ResourceNotFoundException'));

    const { handler } = await import('../../lib/aws-identity-center/build-identity-center-assignments/index.ts');

    const mockEvent = {
      RequestType: 'Create',
      ResponseURL: 'https://example.com',
      StackId: 'test-stack',
      RequestId: 'test-request',
      LogicalResourceId: 'test-resource',
      ResourceType: 'Custom::IdentityCenterAssignments',
      ResourceProperties: {
        instanceArn: 'arn:aws:sso:::instance/ssoins-123456789210',
        identityStoreId: 'd-906751796e',
        principals: [{ name: 'nonexistent-group', type: 'GROUP' }],
        permissionSetArn: 'arn:aws:sso:::permissionSet/ssoins-1111111111111111/ps-1111111111111111',
        accountIds: ['111111111111'],
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const result = await handler(mockEvent);

    expect(result?.Status).toBe('FAILED');
    expect(result?.Reason).toContain("Group 'nonexistent-group' not found in Identity Store 'd-906751796e'");
  });

  it('should return FAILED status for Update operations when principal lookup fails', async () => {
    mockIdentityStoreClient.send.mockRejectedValueOnce(new Error('ResourceNotFoundException'));

    const { handler } = await import('../../lib/aws-identity-center/build-identity-center-assignments/index.ts');

    const mockEvent = {
      RequestType: 'Update',
      ResponseURL: 'https://example.com',
      StackId: 'test-stack',
      RequestId: 'test-request',
      LogicalResourceId: 'test-resource',
      ResourceType: 'Custom::IdentityCenterAssignments',
      ResourceProperties: {
        instanceArn: 'arn:aws:sso:::instance/ssoins-123456789210',
        identityStoreId: 'd-906751796e',
        principals: [{ name: 'invalid-user', type: 'USER' }],
        permissionSetArn: 'arn:aws:sso:::permissionSet/ssoins-1111111111111111/ps-1111111111111111',
        accountIds: ['111111111111'],
      },
      OldResourceProperties: {
        accountIds: ['222222222222'],
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const result = await handler(mockEvent);

    expect(result?.Status).toBe('FAILED');
    expect(result?.Reason).toContain("User 'invalid-user' not found in Identity Store 'd-906751796e'");
  });
});

describe('Build Identity Center Assignments - Assignment Status Polling', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockIdentityStoreClient: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockSSOAdminClient: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockIdentityStoreClient = {
      send: vi.fn().mockResolvedValue({ GroupId: 'group-123456789' }),
    };

    vi.mocked(IdentitystoreClient).mockImplementation(function () {
      return mockIdentityStoreClient;
    });
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

  it('should poll DescribeAccountAssignmentCreationStatus after creating an assignment', async () => {
    mockSSOAdminClient = {
      send: vi
        .fn()
        // CreateAccountAssignmentCommand
        .mockResolvedValueOnce({
          AccountAssignmentCreationStatus: {
            RequestId: 'create-req-1',
            Status: 'IN_PROGRESS',
          },
        })
        // DescribeAccountAssignmentCreationStatusCommand - SUCCEEDED
        .mockResolvedValueOnce({
          AccountAssignmentCreationStatus: {
            RequestId: 'create-req-1',
            Status: 'SUCCEEDED',
          },
        }),
    };
    vi.mocked(SSOAdminClient).mockImplementation(function () {
      return mockSSOAdminClient;
    });
    vi.mocked(CreateAccountAssignmentCommand).mockImplementation(function (input) {
      return { input };
    });
    vi.mocked(DescribeAccountAssignmentCreationStatusCommand).mockImplementation(function (input) {
      return { input };
    });

    const { handler } = await import('../../lib/aws-identity-center/build-identity-center-assignments/index.ts');
    const result = await handler(createEvent('Create'));

    expect(result?.Status).toBe('SUCCESS');
    // Should have called send twice: once for Create, once for Describe
    expect(mockSSOAdminClient.send).toHaveBeenCalledTimes(2);
  });

  it('should return FAILED when async creation fails', async () => {
    mockSSOAdminClient = {
      send: vi
        .fn()
        .mockResolvedValueOnce({
          AccountAssignmentCreationStatus: {
            RequestId: 'create-req-fail',
            Status: 'IN_PROGRESS',
          },
        })
        .mockResolvedValueOnce({
          AccountAssignmentCreationStatus: {
            RequestId: 'create-req-fail',
            Status: 'FAILED',
            FailureReason: 'The security token included in the request is invalid.',
          },
        }),
    };
    vi.mocked(SSOAdminClient).mockImplementation(function () {
      return mockSSOAdminClient;
    });
    vi.mocked(CreateAccountAssignmentCommand).mockImplementation(function (input) {
      return { input };
    });
    vi.mocked(DescribeAccountAssignmentCreationStatusCommand).mockImplementation(function (input) {
      return { input };
    });

    const { handler } = await import('../../lib/aws-identity-center/build-identity-center-assignments/index.ts');
    const result = await handler(createEvent('Create'));

    expect(result?.Status).toBe('FAILED');
    expect(result?.Reason).toContain('The security token included in the request is invalid.');
  });

  it('should poll multiple times when status remains IN_PROGRESS', async () => {
    mockSSOAdminClient = {
      send: vi
        .fn()
        .mockResolvedValueOnce({
          AccountAssignmentCreationStatus: {
            RequestId: 'create-req-poll',
            Status: 'IN_PROGRESS',
          },
        })
        // First poll - still IN_PROGRESS
        .mockResolvedValueOnce({
          AccountAssignmentCreationStatus: {
            RequestId: 'create-req-poll',
            Status: 'IN_PROGRESS',
          },
        })
        // Second poll - SUCCEEDED
        .mockResolvedValueOnce({
          AccountAssignmentCreationStatus: {
            RequestId: 'create-req-poll',
            Status: 'SUCCEEDED',
          },
        }),
    };
    vi.mocked(SSOAdminClient).mockImplementation(function () {
      return mockSSOAdminClient;
    });
    vi.mocked(CreateAccountAssignmentCommand).mockImplementation(function (input) {
      return { input };
    });
    vi.mocked(DescribeAccountAssignmentCreationStatusCommand).mockImplementation(function (input) {
      return { input };
    });

    const { handler } = await import('../../lib/aws-identity-center/build-identity-center-assignments/index.ts');
    const result = await handler(createEvent('Create'));

    expect(result?.Status).toBe('SUCCESS');
    // 1 Create + 2 Describe polls
    expect(mockSSOAdminClient.send).toHaveBeenCalledTimes(3);
  });

  it('should poll DescribeAccountAssignmentDeletionStatus after deleting an assignment', async () => {
    mockSSOAdminClient = {
      send: vi
        .fn()
        .mockResolvedValueOnce({
          AccountAssignmentDeletionStatus: {
            RequestId: 'delete-req-1',
            Status: 'IN_PROGRESS',
          },
        })
        .mockResolvedValueOnce({
          AccountAssignmentDeletionStatus: {
            RequestId: 'delete-req-1',
            Status: 'SUCCEEDED',
          },
        }),
    };
    vi.mocked(SSOAdminClient).mockImplementation(function () {
      return mockSSOAdminClient;
    });
    vi.mocked(DeleteAccountAssignmentCommand).mockImplementation(function (input) {
      return { input };
    });
    vi.mocked(DescribeAccountAssignmentDeletionStatusCommand).mockImplementation(function (input) {
      return { input };
    });

    const { handler } = await import('../../lib/aws-identity-center/build-identity-center-assignments/index.ts');
    const result = await handler(createEvent('Delete'));

    expect(result?.Status).toBe('SUCCESS');
    expect(mockSSOAdminClient.send).toHaveBeenCalledTimes(2);
  });

  it('should return FAILED when async deletion fails', async () => {
    mockSSOAdminClient = {
      send: vi
        .fn()
        .mockResolvedValueOnce({
          AccountAssignmentDeletionStatus: {
            RequestId: 'delete-req-fail',
            Status: 'IN_PROGRESS',
          },
        })
        .mockResolvedValueOnce({
          AccountAssignmentDeletionStatus: {
            RequestId: 'delete-req-fail',
            Status: 'FAILED',
            FailureReason: 'Assignment does not exist.',
          },
        }),
    };
    vi.mocked(SSOAdminClient).mockImplementation(function () {
      return mockSSOAdminClient;
    });
    vi.mocked(DeleteAccountAssignmentCommand).mockImplementation(function (input) {
      return { input };
    });
    vi.mocked(DescribeAccountAssignmentDeletionStatusCommand).mockImplementation(function (input) {
      return { input };
    });

    const { handler } = await import('../../lib/aws-identity-center/build-identity-center-assignments/index.ts');
    const result = await handler(createEvent('Delete'));

    expect(result?.Status).toBe('FAILED');
    expect(result?.Reason).toContain('Assignment does not exist.');
  });

  it('should delete the old permission set assignment when permissionSetArn changes on Update', async () => {
    mockSSOAdminClient = {
      send: vi
        .fn()
        // CreateAccountAssignmentCommand for the new permission set
        .mockResolvedValueOnce({
          AccountAssignmentCreationStatus: {
            RequestId: 'create-req-1',
            Status: 'SUCCEEDED',
          },
        })
        // DeleteAccountAssignmentCommand for the old permission set, on the same account
        .mockResolvedValueOnce({
          AccountAssignmentDeletionStatus: {
            RequestId: 'delete-req-1',
            Status: 'SUCCEEDED',
          },
        }),
    };
    vi.mocked(SSOAdminClient).mockImplementation(function () {
      return mockSSOAdminClient;
    });
    vi.mocked(CreateAccountAssignmentCommand).mockImplementation(function (input) {
      return { input };
    });
    vi.mocked(DeleteAccountAssignmentCommand).mockImplementation(function (input) {
      return { input };
    });

    const { handler } = await import('../../lib/aws-identity-center/build-identity-center-assignments/index.ts');

    const event = createEvent('Update', {
      ResourceProperties: {
        instanceArn: 'arn:aws:sso:::instance/ssoins-123456789210',
        identityStoreId: 'd-906751796e',
        principals: [{ name: 'test-group', type: 'GROUP' }],
        permissionSetArn: 'arn:aws:sso:::permissionSet/ssoins-1111111111111111/ps-new',
        accountIds: ['111111111111'],
      },
      OldResourceProperties: {
        accountIds: ['111111111111'],
        permissionSetArn: 'arn:aws:sso:::permissionSet/ssoins-1111111111111111/ps-old',
      },
    });

    const result = await handler(event);

    expect(result?.Status).toBe('SUCCESS');
    expect(CreateAccountAssignmentCommand).toHaveBeenCalledWith(
      expect.objectContaining({ PermissionSetArn: 'arn:aws:sso:::permissionSet/ssoins-1111111111111111/ps-new' }),
    );
    // The account list is unchanged, so without this fix no delete would ever be issued and
    // the old permission set's assignment would be left orphaned in Identity Center.
    expect(DeleteAccountAssignmentCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        PermissionSetArn: 'arn:aws:sso:::permissionSet/ssoins-1111111111111111/ps-old',
        TargetId: '111111111111',
      }),
    );
  });
});
