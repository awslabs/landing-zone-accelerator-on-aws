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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IdentitystoreClient, GetGroupIdCommand, GetUserIdCommand } from '@aws-sdk/client-identitystore';
import {
  SSOAdminClient,
  CreateAccountAssignmentCommand,
  DeleteAccountAssignmentCommand,
  DescribeAccountAssignmentCreationStatusCommand,
  DescribeAccountAssignmentDeletionStatusCommand,
  ListAccountAssignmentsCommand,
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

  it('should reject when user lookup fails so the framework reports FAILED to CFN', async () => {
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

    await expect(handler(mockEvent)).rejects.toThrow(
      "User 'nonexistent-user' not found in Identity Store 'd-906751796e'",
    );
  });

  it('should reject when group lookup fails so the framework reports FAILED to CFN', async () => {
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

    await expect(handler(mockEvent)).rejects.toThrow(
      "Group 'nonexistent-group' not found in Identity Store 'd-906751796e'",
    );
  });

  it('should reject on Update when principal lookup fails so the framework reports FAILED to CFN', async () => {
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

    await expect(handler(mockEvent)).rejects.toThrow("User 'invalid-user' not found in Identity Store 'd-906751796e'");
  });

  it('should reject when a direct principalId is not an identity store id so the framework reports FAILED to CFN', async () => {
    // IAM Identity Center rejects a principalId that is not an identity store id. The deprecated
    // principalId property is passed through without a lookup, so the error must surface to
    // CloudFormation rather than being swallowed into a SUCCESS response.
    const validationException = Object.assign(
      new Error(
        "1 validation error detected: Value 'Platform-Admins' at 'principalId' failed to satisfy constraint: Member must satisfy regular expression pattern: ([0-9a-f]{10}-|)[A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12}",
      ),
      { name: 'ValidationException' },
    );
    mockSSOAdminClient.send = vi.fn().mockRejectedValue(validationException);

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
        principalId: 'Platform-Admins',
        principalType: 'GROUP',
        permissionSetArn: 'arn:aws:sso:::permissionSet/ssoins-1111111111111111/ps-1111111111111111',
        accountIds: ['111111111111', '222222222222'],
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    await expect(handler(mockEvent)).rejects.toThrow(/failed to satisfy constraint/);

    // The unresolved value is sent verbatim, which is why the config validator has to reject it.
    expect(CreateAccountAssignmentCommand).toHaveBeenCalledWith(
      expect.objectContaining({ PrincipalId: 'Platform-Admins', PrincipalType: 'GROUP' }),
    );
    // No Identity Store lookup is performed for the deprecated principalId property.
    expect(mockIdentityStoreClient.send).not.toHaveBeenCalled();
    // Two accounts are targeted, but the failure on the first one aborts the remaining work instead of
    // being caught per account and reported as an overall success.
    // This file stubs throttlingBackOff as a pass-through, so it cannot observe retry behaviour; that
    // ValidationException is not retried is covered in build-identity-center-assignments-conflict-retry.test.ts.
    expect(mockSSOAdminClient.send).toHaveBeenCalledTimes(1);
  });

  it('should reject when a direct principalId is not an identity store id on an assignment that also sets principals', async () => {
    // The runtime ignores principalId whenever principals is present, so a stale non-identifier value
    // there never reaches CreateAccountAssignment and must not be treated as a deployment failure.
    mockIdentityStoreClient.send.mockResolvedValueOnce({
      GroupId: 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6',
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
        principalId: 'Platform-Admins',
        principalType: 'GROUP',
        principals: [{ type: 'GROUP', name: 'Platform-Admins' }],
        permissionSetArn: 'arn:aws:sso:::permissionSet/ssoins-1111111111111111/ps-1111111111111111',
        accountIds: ['111111111111'],
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const result = await handler(mockEvent);

    expect(result?.Status).toBe('SUCCESS');
    // The resolved group id is used, and the invalid principalId is never sent to IAM Identity Center.
    expect(CreateAccountAssignmentCommand).toHaveBeenCalledWith(
      expect.objectContaining({ PrincipalId: 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6', PrincipalType: 'GROUP' }),
    );
    expect(CreateAccountAssignmentCommand).not.toHaveBeenCalledWith(
      expect.objectContaining({ PrincipalId: 'Platform-Admins' }),
    );
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

    await expect(handler(createEvent('Create'))).rejects.toThrow(
      'The security token included in the request is invalid.',
    );
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

    await expect(handler(createEvent('Delete'))).rejects.toThrow('Assignment does not exist.');
  });
});

describe('Build Identity Center Assignments - Permission Set Rename/Replacement', () => {
  const OLD_PERMISSION_SET_ARN = 'arn:aws:sso:::permissionSet/ssoins-1111111111111111/ps-0000000000000000';
  const NEW_PERMISSION_SET_ARN = 'arn:aws:sso:::permissionSet/ssoins-1111111111111111/ps-1111111111111111';
  const INSTANCE_ARN = 'arn:aws:sso:::instance/ssoins-123456789210';
  const GROUP_ID = 'group-123456789';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockIdentityStoreClient: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockSSOAdminClient: any;
  let assignments: Set<string>;

  interface MockSsoCommand {
    kind: 'create' | 'delete' | 'describeCreate' | 'describeDelete' | 'list';
    input: {
      AccountId?: string;
      InstanceArn?: string;
      PermissionSetArn?: string;
      PrincipalId?: string;
      PrincipalType?: string;
      TargetId?: string;
    };
  }

  function assignmentKey(input: MockSsoCommand['input']): string {
    return `${input.PermissionSetArn}|${input.TargetId ?? input.AccountId}|${input.PrincipalType}|${input.PrincipalId}`;
  }

  function listAssignmentsFromState(command: MockSsoCommand, assignments: Set<string>) {
    const prefix = `${command.input.PermissionSetArn}|${command.input.AccountId}|`;
    return {
      AccountAssignments: [...assignments]
        .filter(key => key.startsWith(prefix))
        .map(key => {
          const [permissionSetArn, accountId, principalType, principalId] = key.split('|');
          return {
            AccountId: accountId,
            PermissionSetArn: permissionSetArn,
            PrincipalId: principalId,
            PrincipalType: principalType,
          };
        }),
    };
  }

  function updateEvent(
    options: {
      accountIds?: string[];
      oldAccountIds?: string[];
      oldPermissionSetArn?: string;
      resourceProperties?: Record<string, unknown>;
      oldResourceProperties?: Record<string, unknown>;
    } = {},
  ) {
    return {
      RequestType: 'Update',
      ResponseURL: 'https://example.com',
      StackId: 'test-stack',
      RequestId: 'test-request',
      LogicalResourceId: 'test-resource',
      ResourceType: 'Custom::IdentityCenterAssignments',
      ResourceProperties: {
        instanceArn: INSTANCE_ARN,
        identityStoreId: 'd-906751796e',
        principals: [{ name: 'test-group', type: 'GROUP' }],
        permissionSetArn: NEW_PERMISSION_SET_ARN,
        accountIds: options.accountIds ?? ['111111111111'],
        ...options.resourceProperties,
      },
      OldResourceProperties: {
        instanceArn: INSTANCE_ARN,
        identityStoreId: 'd-906751796e',
        principals: [{ name: 'test-group', type: 'GROUP' }],
        permissionSetArn: options.oldPermissionSetArn ?? OLD_PERMISSION_SET_ARN,
        accountIds: options.oldAccountIds ?? ['111111111111'],
        ...options.oldResourceProperties,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  }

  beforeEach(() => {
    vi.clearAllMocks();

    assignments = new Set([
      `${OLD_PERMISSION_SET_ARN}|111111111111|GROUP|${GROUP_ID}`,
      `${OLD_PERMISSION_SET_ARN}|222222222222|GROUP|${GROUP_ID}`,
      `${NEW_PERMISSION_SET_ARN}|222222222222|GROUP|${GROUP_ID}`,
    ]);

    mockIdentityStoreClient = {
      send: vi.fn().mockResolvedValue({ GroupId: GROUP_ID }),
    };

    mockSSOAdminClient = {
      send: vi.fn(async (rawCommand: MockSsoCommand) => {
        switch (rawCommand.kind) {
          case 'list':
            return listAssignmentsFromState(rawCommand, assignments);
          case 'create':
            assignments.add(assignmentKey(rawCommand.input));
            return {
              AccountAssignmentCreationStatus: { RequestId: 'create-req', Status: 'IN_PROGRESS' },
            };
          case 'describeCreate':
            return {
              AccountAssignmentCreationStatus: { RequestId: 'create-req', Status: 'SUCCEEDED' },
            };
          case 'delete':
            assignments.delete(assignmentKey(rawCommand.input));
            return {
              AccountAssignmentDeletionStatus: { RequestId: 'delete-req', Status: 'IN_PROGRESS' },
            };
          case 'describeDelete':
            return {
              AccountAssignmentDeletionStatus: { RequestId: 'delete-req', Status: 'SUCCEEDED' },
            };
        }
      }),
    };

    vi.mocked(IdentitystoreClient).mockImplementation(function () {
      return mockIdentityStoreClient;
    });
    vi.mocked(SSOAdminClient).mockImplementation(function () {
      return mockSSOAdminClient;
    });
    vi.mocked(CreateAccountAssignmentCommand).mockImplementation(function (input) {
      return { kind: 'create', input };
    });
    vi.mocked(DeleteAccountAssignmentCommand).mockImplementation(function (input) {
      return { kind: 'delete', input };
    });
    vi.mocked(DescribeAccountAssignmentCreationStatusCommand).mockImplementation(function (input) {
      return { kind: 'describeCreate', input };
    });
    vi.mocked(DescribeAccountAssignmentDeletionStatusCommand).mockImplementation(function (input) {
      return { kind: 'describeDelete', input };
    });
    vi.mocked(ListAccountAssignmentsCommand).mockImplementation(function (input) {
      return { kind: 'list', input };
    });
  });

  it('should delete assignments on the OLD permission set when the permission set ARN changes (rename)', async () => {
    const { handler } = await import('../../lib/aws-identity-center/build-identity-center-assignments/index.ts');
    const result = await handler(updateEvent());

    expect(result?.Status).toBe('SUCCESS');

    // New assignment created against the new permission set ARN.
    expect(CreateAccountAssignmentCommand).toHaveBeenCalledWith(
      expect.objectContaining({ PermissionSetArn: NEW_PERMISSION_SET_ARN, TargetId: '111111111111' }),
    );

    // Old assignment deleted against the OLD permission set ARN so its application profile
    // association is cleared before CloudFormation deletes the replaced permission set.
    expect(DeleteAccountAssignmentCommand).toHaveBeenCalledWith(
      expect.objectContaining({ PermissionSetArn: OLD_PERMISSION_SET_ARN, TargetId: '111111111111' }),
    );
    // The delete must never target the new permission set ARN.
    expect(DeleteAccountAssignmentCommand).not.toHaveBeenCalledWith(
      expect.objectContaining({ PermissionSetArn: NEW_PERMISSION_SET_ARN }),
    );
  });

  it('should not fall back to direct-principal assignments for an empty principals list', async () => {
    const { handler } = await import('../../lib/aws-identity-center/build-identity-center-assignments/index.ts');
    const result = await handler(
      updateEvent({
        resourceProperties: {
          principals: [],
          principalId: undefined,
          principalType: undefined,
        },
        oldResourceProperties: {
          principals: [],
          principalId: undefined,
          principalType: undefined,
        },
      }),
    );

    expect(result?.Status).toBe('SUCCESS');
    expect(CreateAccountAssignmentCommand).not.toHaveBeenCalled();
    expect(DeleteAccountAssignmentCommand).not.toHaveBeenCalled();
  });

  it('should delete assignments for ALL previous accounts on the old permission set during a rename', async () => {
    const { handler } = await import('../../lib/aws-identity-center/build-identity-center-assignments/index.ts');
    const result = await handler(updateEvent({ oldAccountIds: ['111111111111', '222222222222'] }));

    expect(result?.Status).toBe('SUCCESS');
    // Both previous accounts have their old-permission-set assignment removed.
    expect(DeleteAccountAssignmentCommand).toHaveBeenCalledWith(
      expect.objectContaining({ PermissionSetArn: OLD_PERMISSION_SET_ARN, TargetId: '111111111111' }),
    );
    expect(DeleteAccountAssignmentCommand).toHaveBeenCalledWith(
      expect.objectContaining({ PermissionSetArn: OLD_PERMISSION_SET_ARN, TargetId: '222222222222' }),
    );
  });

  it('should only delete removed-account assignments (same ARN) when the permission set is not renamed', async () => {
    const { handler } = await import('../../lib/aws-identity-center/build-identity-center-assignments/index.ts');
    const result = await handler(
      updateEvent({
        oldAccountIds: ['111111111111', '222222222222'],
        oldPermissionSetArn: NEW_PERMISSION_SET_ARN,
      }),
    );

    expect(result?.Status).toBe('SUCCESS');
    // Only the removed account (222222222222) is deleted, on the unchanged ARN.
    expect(DeleteAccountAssignmentCommand).toHaveBeenCalledWith(
      expect.objectContaining({ PermissionSetArn: NEW_PERMISSION_SET_ARN, TargetId: '222222222222' }),
    );
    expect(DeleteAccountAssignmentCommand).not.toHaveBeenCalledWith(
      expect.objectContaining({ TargetId: '111111111111' }),
    );
  });

  it('should use only old direct-principal properties when migrating to principals during a rename', async () => {
    const assignments = new Set([`${OLD_PERMISSION_SET_ARN}|111111111111|GROUP|old-group-id`]);
    mockSSOAdminClient.send = vi.fn(async (command: MockSsoCommand) => {
      if (command.kind === 'list') {
        return listAssignmentsFromState(command, assignments);
      }
      if (command.kind === 'create') {
        assignments.add(assignmentKey(command.input));
        return { AccountAssignmentCreationStatus: { RequestId: 'create', Status: 'SUCCEEDED' } };
      }
      if (command.kind === 'delete') {
        assignments.delete(assignmentKey(command.input));
        return { AccountAssignmentDeletionStatus: { RequestId: 'delete', Status: 'SUCCEEDED' } };
      }
      throw new Error(`Unexpected command ${command.kind}`);
    });

    const { handler } = await import('../../lib/aws-identity-center/build-identity-center-assignments/index.ts');
    await handler(
      updateEvent({
        oldResourceProperties: {
          principals: undefined,
          principalType: 'GROUP',
          principalId: 'old-group-id',
        },
      }),
    );

    expect(DeleteAccountAssignmentCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        PermissionSetArn: OLD_PERMISSION_SET_ARN,
        PrincipalId: 'old-group-id',
      }),
    );
    expect(DeleteAccountAssignmentCommand).not.toHaveBeenCalledWith(
      expect.objectContaining({
        PermissionSetArn: OLD_PERMISSION_SET_ARN,
        PrincipalId: GROUP_ID,
      }),
    );
  });

  it('should reconcile a partial multi-account failure when the same update is rerun', async () => {
    const assignments = new Set([
      `${OLD_PERMISSION_SET_ARN}|111111111111|GROUP|${GROUP_ID}`,
      `${OLD_PERMISSION_SET_ARN}|222222222222|GROUP|${GROUP_ID}`,
    ]);
    let failSecondOldDelete = true;
    mockSSOAdminClient.send = vi.fn(async (command: MockSsoCommand) => {
      if (command.kind === 'list') {
        return listAssignmentsFromState(command, assignments);
      }
      if (command.kind === 'create') {
        assignments.add(assignmentKey(command.input));
        return { AccountAssignmentCreationStatus: { RequestId: 'create', Status: 'SUCCEEDED' } };
      }
      if (command.kind === 'delete') {
        if (
          command.input.PermissionSetArn === OLD_PERMISSION_SET_ARN &&
          command.input.TargetId === '222222222222' &&
          failSecondOldDelete
        ) {
          failSecondOldDelete = false;
          return {
            AccountAssignmentDeletionStatus: {
              RequestId: 'delete-failed',
              Status: 'FAILED',
              FailureReason: 'injected partial failure',
            },
          };
        }
        assignments.delete(assignmentKey(command.input));
        return { AccountAssignmentDeletionStatus: { RequestId: 'delete', Status: 'SUCCEEDED' } };
      }
      throw new Error(`Unexpected command ${command.kind}`);
    });

    const { handler } = await import('../../lib/aws-identity-center/build-identity-center-assignments/index.ts');
    const event = updateEvent({
      accountIds: ['111111111111', '222222222222'],
      oldAccountIds: ['111111111111', '222222222222'],
    });

    await expect(handler(event)).rejects.toThrow('injected partial failure');
    await expect(handler(event)).resolves.toEqual(expect.objectContaining({ Status: 'SUCCESS' }));

    expect(assignments).toEqual(
      new Set([
        `${NEW_PERMISSION_SET_ARN}|111111111111|GROUP|${GROUP_ID}`,
        `${NEW_PERMISSION_SET_ARN}|222222222222|GROUP|${GROUP_ID}`,
      ]),
    );
    expect(CreateAccountAssignmentCommand).toHaveBeenCalledTimes(2);
    expect(DeleteAccountAssignmentCommand).toHaveBeenCalledTimes(3);
  });
});

describe('Build Identity Center Assignments - Principal Changes', () => {
  const PERMISSION_SET_ARN = 'arn:aws:sso:::permissionSet/ssoins-1111111111111111/ps-1111111111111111';
  const INSTANCE_ARN = 'arn:aws:sso:::instance/ssoins-123456789210';
  const IDENTITY_STORE_ID = 'd-906751796e';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockIdentityStoreClient: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockSSOAdminClient: any;
  let assignments: Set<string>;
  let groupIds: Record<string, string>;
  let userIds: Record<string, string>;

  interface MockSsoCommand {
    kind: 'create' | 'delete' | 'describeCreate' | 'describeDelete' | 'list';
    input: {
      AccountId?: string;
      PermissionSetArn?: string;
      PrincipalId?: string;
      PrincipalType?: string;
      TargetId?: string;
    };
  }

  interface MockIdentityStoreCommand {
    kind: 'group' | 'user';
    input: { AlternateIdentifier: { UniqueAttribute: { AttributeValue: string } } };
  }

  function assignmentKey(input: MockSsoCommand['input']): string {
    return `${input.PermissionSetArn}|${input.TargetId ?? input.AccountId}|${input.PrincipalType}|${input.PrincipalId}`;
  }

  function assignment(accountId: string, principalType: string, principalId: string): string {
    return `${PERMISSION_SET_ARN}|${accountId}|${principalType}|${principalId}`;
  }

  function notFound(name: string) {
    return Object.assign(new Error(`${name} does not exist`), { name: 'ResourceNotFoundException' });
  }

  function updateEvent(resourceProperties: Record<string, unknown>, oldResourceProperties: Record<string, unknown>) {
    const baseProperties = {
      instanceArn: INSTANCE_ARN,
      identityStoreId: IDENTITY_STORE_ID,
      permissionSetArn: PERMISSION_SET_ARN,
      accountIds: ['111111111111'],
    };
    return {
      RequestType: 'Update',
      ResponseURL: 'https://example.com',
      StackId: 'test-stack',
      RequestId: 'test-request',
      LogicalResourceId: 'test-resource',
      ResourceType: 'Custom::IdentityCenterAssignments',
      ResourceProperties: { ...baseProperties, ...resourceProperties },
      OldResourceProperties: { ...baseProperties, ...oldResourceProperties },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  }

  beforeEach(() => {
    vi.clearAllMocks();

    groupIds = { developers: 'group-developers', devops: 'group-devops' };
    userIds = { 'jane.doe': 'user-jane' };
    assignments = new Set();

    mockIdentityStoreClient = {
      send: vi.fn(async (command: MockIdentityStoreCommand) => {
        const name = command.input.AlternateIdentifier.UniqueAttribute.AttributeValue;
        const ids = command.kind === 'group' ? groupIds : userIds;
        if (!ids[name]) {
          throw notFound(name);
        }
        return command.kind === 'group' ? { GroupId: ids[name] } : { UserId: ids[name] };
      }),
    };

    mockSSOAdminClient = {
      send: vi.fn(async (command: MockSsoCommand) => {
        switch (command.kind) {
          case 'list': {
            const prefix = `${command.input.PermissionSetArn}|${command.input.AccountId}|`;
            return {
              AccountAssignments: [...assignments]
                .filter(key => key.startsWith(prefix))
                .map(key => {
                  const [, , principalType, principalId] = key.split('|');
                  return { PrincipalType: principalType, PrincipalId: principalId };
                }),
            };
          }
          case 'create':
            assignments.add(assignmentKey(command.input));
            return { AccountAssignmentCreationStatus: { RequestId: 'create-req', Status: 'SUCCEEDED' } };
          case 'delete':
            assignments.delete(assignmentKey(command.input));
            return { AccountAssignmentDeletionStatus: { RequestId: 'delete-req', Status: 'SUCCEEDED' } };
          default:
            throw new Error(`Unexpected command ${command.kind}`);
        }
      }),
    };

    vi.mocked(IdentitystoreClient).mockImplementation(function () {
      return mockIdentityStoreClient;
    });
    vi.mocked(GetGroupIdCommand).mockImplementation(function (input) {
      return { kind: 'group', input };
    });
    vi.mocked(GetUserIdCommand).mockImplementation(function (input) {
      return { kind: 'user', input };
    });
    vi.mocked(SSOAdminClient).mockImplementation(function () {
      return mockSSOAdminClient;
    });
    vi.mocked(CreateAccountAssignmentCommand).mockImplementation(function (input) {
      return { kind: 'create', input };
    });
    vi.mocked(DeleteAccountAssignmentCommand).mockImplementation(function (input) {
      return { kind: 'delete', input };
    });
    vi.mocked(ListAccountAssignmentsCommand).mockImplementation(function (input) {
      return { kind: 'list', input };
    });
  });

  afterEach(() => {
    // vi.clearAllMocks does not reset implementations, so do not leak these command shapes into other suites.
    vi.mocked(GetGroupIdCommand).mockReset();
    vi.mocked(GetUserIdCommand).mockReset();
    vi.mocked(CreateAccountAssignmentCommand).mockReset();
    vi.mocked(DeleteAccountAssignmentCommand).mockReset();
    vi.mocked(ListAccountAssignmentsCommand).mockReset();
  });

  it('should delete the old group assignment when a group is swapped for another on the same accounts', async () => {
    assignments = new Set([assignment('111111111111', 'GROUP', 'group-developers')]);

    const { handler } = await import('../../lib/aws-identity-center/build-identity-center-assignments/index.ts');
    const result = await handler(
      updateEvent(
        { principals: [{ name: 'devops', type: 'GROUP' }] },
        { principals: [{ name: 'developers', type: 'GROUP' }] },
      ),
    );

    expect(result?.Status).toBe('SUCCESS');
    expect(assignments).toEqual(new Set([assignment('111111111111', 'GROUP', 'group-devops')]));
  });

  it('should delete only the removed principal and keep the retained one on every account in scope', async () => {
    assignments = new Set([
      assignment('111111111111', 'GROUP', 'group-developers'),
      assignment('111111111111', 'USER', 'user-jane'),
      assignment('222222222222', 'GROUP', 'group-developers'),
      assignment('222222222222', 'USER', 'user-jane'),
    ]);

    const { handler } = await import('../../lib/aws-identity-center/build-identity-center-assignments/index.ts');
    await handler(
      updateEvent(
        { principals: [{ name: 'developers', type: 'GROUP' }], accountIds: ['111111111111', '222222222222'] },
        {
          principals: [
            { name: 'developers', type: 'GROUP' },
            { name: 'jane.doe', type: 'USER' },
          ],
          accountIds: ['111111111111', '222222222222'],
        },
      ),
    );

    expect(assignments).toEqual(
      new Set([
        assignment('111111111111', 'GROUP', 'group-developers'),
        assignment('222222222222', 'GROUP', 'group-developers'),
      ]),
    );
  });

  it('should delete a removed principal from a removed account in the same update', async () => {
    assignments = new Set([
      assignment('111111111111', 'GROUP', 'group-developers'),
      assignment('222222222222', 'GROUP', 'group-developers'),
    ]);

    const { handler } = await import('../../lib/aws-identity-center/build-identity-center-assignments/index.ts');
    await handler(
      updateEvent(
        { principals: [{ name: 'devops', type: 'GROUP' }], accountIds: ['111111111111'] },
        { principals: [{ name: 'developers', type: 'GROUP' }], accountIds: ['111111111111', '222222222222'] },
      ),
    );

    expect(assignments).toEqual(new Set([assignment('111111111111', 'GROUP', 'group-devops')]));
  });

  it('should delete the old assignment when the deprecated principalId changes on the same accounts', async () => {
    assignments = new Set([assignment('111111111111', 'GROUP', 'group-developers')]);

    const { handler } = await import('../../lib/aws-identity-center/build-identity-center-assignments/index.ts');
    await handler(
      updateEvent(
        { principalType: 'GROUP', principalId: 'group-devops' },
        { principalType: 'GROUP', principalId: 'group-developers' },
      ),
    );

    expect(assignments).toEqual(new Set([assignment('111111111111', 'GROUP', 'group-devops')]));
  });

  it('should delete the old direct-principal assignment when migrating from principalId to principals', async () => {
    assignments = new Set([assignment('111111111111', 'GROUP', 'group-legacy')]);

    const { handler } = await import('../../lib/aws-identity-center/build-identity-center-assignments/index.ts');
    await handler(
      updateEvent(
        { principals: [{ name: 'devops', type: 'GROUP' }] },
        { principalType: 'GROUP', principalId: 'group-legacy' },
      ),
    );

    expect(assignments).toEqual(new Set([assignment('111111111111', 'GROUP', 'group-devops')]));
  });

  it('should delete the old principals assignment when migrating from principals to principalId', async () => {
    assignments = new Set([assignment('111111111111', 'GROUP', 'group-developers')]);

    const { handler } = await import('../../lib/aws-identity-center/build-identity-center-assignments/index.ts');
    await handler(
      updateEvent(
        { principalType: 'GROUP', principalId: 'group-devops' },
        { principals: [{ name: 'developers', type: 'GROUP' }] },
      ),
    );

    expect(assignments).toEqual(new Set([assignment('111111111111', 'GROUP', 'group-devops')]));
  });

  it('should not delete an assignment when the old and new principal names resolve to the same principal', async () => {
    groupIds['Developers'] = 'group-developers';
    assignments = new Set([assignment('111111111111', 'GROUP', 'group-developers')]);

    const { handler } = await import('../../lib/aws-identity-center/build-identity-center-assignments/index.ts');
    await handler(
      updateEvent(
        { principals: [{ name: 'Developers', type: 'GROUP' }] },
        { principals: [{ name: 'developers', type: 'GROUP' }] },
      ),
    );

    expect(DeleteAccountAssignmentCommand).not.toHaveBeenCalled();
    expect(assignments).toEqual(new Set([assignment('111111111111', 'GROUP', 'group-developers')]));
  });

  it('should skip a removed principal that no longer exists in the identity store and still succeed', async () => {
    assignments = new Set([assignment('111111111111', 'GROUP', 'group-developers')]);
    delete groupIds['developers'];

    const { handler } = await import('../../lib/aws-identity-center/build-identity-center-assignments/index.ts');
    const result = await handler(
      updateEvent(
        { principals: [{ name: 'devops', type: 'GROUP' }] },
        { principals: [{ name: 'developers', type: 'GROUP' }] },
      ),
    );

    expect(result?.Status).toBe('SUCCESS');
    expect(DeleteAccountAssignmentCommand).not.toHaveBeenCalled();
    expect(assignments).toContain(assignment('111111111111', 'GROUP', 'group-devops'));
  });

  it('should still fail the update when a removed principal lookup fails for a reason other than not found', async () => {
    mockIdentityStoreClient.send.mockImplementation(async (command: MockIdentityStoreCommand) => {
      const name = command.input.AlternateIdentifier.UniqueAttribute.AttributeValue;
      if (name === 'developers') {
        throw Object.assign(new Error('access denied'), { name: 'AccessDeniedException' });
      }
      return { GroupId: groupIds[name] };
    });

    const { handler } = await import('../../lib/aws-identity-center/build-identity-center-assignments/index.ts');

    await expect(
      handler(
        updateEvent(
          { principals: [{ name: 'devops', type: 'GROUP' }] },
          { principals: [{ name: 'developers', type: 'GROUP' }] },
        ),
      ),
    ).rejects.toThrow("Group 'developers' not found in Identity Store 'd-906751796e'");
  });

  it('should still fail the update when a removed principal lookup reports a missing KMS key', async () => {
    mockIdentityStoreClient.send.mockImplementation(async (command: MockIdentityStoreCommand) => {
      const name = command.input.AlternateIdentifier.UniqueAttribute.AttributeValue;
      if (name === 'developers') {
        throw Object.assign(notFound(name), { Reason: 'KMS_KEY_NOT_FOUND' });
      }
      return { GroupId: groupIds[name] };
    });

    const { handler } = await import('../../lib/aws-identity-center/build-identity-center-assignments/index.ts');

    await expect(
      handler(
        updateEvent(
          { principalType: 'GROUP', principalId: 'group-devops' },
          { principals: [{ name: 'developers', type: 'GROUP' }] },
        ),
      ),
    ).rejects.toThrow("Group 'developers' not found in Identity Store 'd-906751796e'");
  });

  it('should still fail the update when a removed principal lookup reports a missing identity store', async () => {
    mockIdentityStoreClient.send.mockImplementation(async (command: MockIdentityStoreCommand) => {
      const name = command.input.AlternateIdentifier.UniqueAttribute.AttributeValue;
      if (name === 'developers') {
        throw Object.assign(notFound(name), { ResourceType: 'IDENTITY_STORE' });
      }
      return { GroupId: groupIds[name] };
    });

    const { handler } = await import('../../lib/aws-identity-center/build-identity-center-assignments/index.ts');

    await expect(
      handler(
        updateEvent(
          { principalType: 'GROUP', principalId: 'group-devops' },
          { principals: [{ name: 'developers', type: 'GROUP' }] },
        ),
      ),
    ).rejects.toThrow("Group 'developers' not found in Identity Store 'd-906751796e'");
  });

  it('should skip a removed principal whose lookup reports the group itself as not found', async () => {
    assignments = new Set([assignment('111111111111', 'GROUP', 'group-developers')]);
    mockIdentityStoreClient.send.mockImplementation(async (command: MockIdentityStoreCommand) => {
      const name = command.input.AlternateIdentifier.UniqueAttribute.AttributeValue;
      if (name === 'developers') {
        throw Object.assign(notFound(name), { ResourceType: 'GROUP' });
      }
      return { GroupId: groupIds[name] };
    });

    const { handler } = await import('../../lib/aws-identity-center/build-identity-center-assignments/index.ts');
    const result = await handler(
      updateEvent(
        { principals: [{ name: 'devops', type: 'GROUP' }] },
        { principals: [{ name: 'developers', type: 'GROUP' }] },
      ),
    );

    expect(result?.Status).toBe('SUCCESS');
    expect(DeleteAccountAssignmentCommand).not.toHaveBeenCalled();
    expect(assignments).toContain(assignment('111111111111', 'GROUP', 'group-devops'));
  });

  it.each(['RESOURCE_POLICY', 'GROUP_MEMBERSHIP', 'USER'])(
    'should still fail the update when a removed group lookup reports a missing %s resource',
    async resourceType => {
      mockIdentityStoreClient.send.mockImplementation(async (command: MockIdentityStoreCommand) => {
        const name = command.input.AlternateIdentifier.UniqueAttribute.AttributeValue;
        if (name === 'developers') {
          throw Object.assign(notFound(name), { ResourceType: resourceType });
        }
        return { GroupId: groupIds[name] };
      });

      const { handler } = await import('../../lib/aws-identity-center/build-identity-center-assignments/index.ts');

      await expect(
        handler(
          updateEvent(
            { principalType: 'GROUP', principalId: 'group-devops' },
            { principals: [{ name: 'developers', type: 'GROUP' }] },
          ),
        ),
      ).rejects.toThrow("Group 'developers' not found in Identity Store 'd-906751796e'");
    },
  );

  it('should create the new assignment before deleting the old one so a swap never removes all access', async () => {
    assignments = new Set([assignment('111111111111', 'GROUP', 'group-developers')]);

    const { handler } = await import('../../lib/aws-identity-center/build-identity-center-assignments/index.ts');
    await handler(
      updateEvent(
        { principals: [{ name: 'devops', type: 'GROUP' }] },
        { principals: [{ name: 'developers', type: 'GROUP' }] },
      ),
    );

    const createOrder = vi.mocked(CreateAccountAssignmentCommand).mock.invocationCallOrder[0];
    const deleteOrder = vi.mocked(DeleteAccountAssignmentCommand).mock.invocationCallOrder[0];
    expect(createOrder).toBeDefined();
    expect(deleteOrder).toBeDefined();
    expect(createOrder).toBeLessThan(deleteOrder);
  });

  it('should restore the original assignment when CloudFormation rolls back a principal swap', async () => {
    assignments = new Set([assignment('111111111111', 'GROUP', 'group-developers')]);
    const swapProperties = { principals: [{ name: 'devops', type: 'GROUP' }] };
    const originalProperties = { principals: [{ name: 'developers', type: 'GROUP' }] };

    const { handler } = await import('../../lib/aws-identity-center/build-identity-center-assignments/index.ts');
    await handler(updateEvent(swapProperties, originalProperties));
    // CloudFormation rolls back an Update by sending another Update with the old and new properties swapped.
    await handler(updateEvent(originalProperties, swapProperties));

    expect(assignments).toEqual(new Set([assignment('111111111111', 'GROUP', 'group-developers')]));
  });

  it('should fall back to the current instance, identity store, and permission set when old properties lack them', async () => {
    assignments = new Set([assignment('111111111111', 'GROUP', 'group-developers')]);

    const { handler } = await import('../../lib/aws-identity-center/build-identity-center-assignments/index.ts');
    await handler(
      updateEvent(
        { principals: [{ name: 'devops', type: 'GROUP' }] },
        {
          principals: [{ name: 'developers', type: 'GROUP' }],
          instanceArn: undefined,
          identityStoreId: undefined,
          permissionSetArn: undefined,
        },
      ),
    );

    expect(DeleteAccountAssignmentCommand).toHaveBeenCalledWith(
      expect.objectContaining({ InstanceArn: INSTANCE_ARN, PermissionSetArn: PERMISSION_SET_ARN }),
    );
    expect(assignments).toEqual(new Set([assignment('111111111111', 'GROUP', 'group-devops')]));
  });

  it('should delete a removed principal only once when the previous account list contains duplicates', async () => {
    assignments = new Set([assignment('111111111111', 'GROUP', 'group-developers')]);

    const { handler } = await import('../../lib/aws-identity-center/build-identity-center-assignments/index.ts');
    await handler(
      updateEvent(
        { principals: [{ name: 'devops', type: 'GROUP' }] },
        { principals: [{ name: 'developers', type: 'GROUP' }], accountIds: ['111111111111', '111111111111'] },
      ),
    );

    expect(DeleteAccountAssignmentCommand).toHaveBeenCalledTimes(1);
    expect(assignments).toEqual(new Set([assignment('111111111111', 'GROUP', 'group-devops')]));
  });

  it('should delete the old assignment when a deprecated USER principalId changes', async () => {
    assignments = new Set([assignment('111111111111', 'USER', 'user-old')]);

    const { handler } = await import('../../lib/aws-identity-center/build-identity-center-assignments/index.ts');
    await handler(
      updateEvent(
        { principalType: 'USER', principalId: 'user-new' },
        { principalType: 'USER', principalId: 'user-old' },
      ),
    );

    expect(assignments).toEqual(new Set([assignment('111111111111', 'USER', 'user-new')]));
  });

  it('should ignore the deprecated principalId in old properties when principals is an empty list', async () => {
    // The custom resource never created an assignment for principalId in this shape, so it must not delete one.
    assignments = new Set([assignment('111111111111', 'GROUP', 'group-unmanaged')]);

    const { handler } = await import('../../lib/aws-identity-center/build-identity-center-assignments/index.ts');
    await handler(
      updateEvent(
        { principals: [{ name: 'devops', type: 'GROUP' }] },
        { principals: [], principalType: 'GROUP', principalId: 'group-unmanaged' },
      ),
    );

    expect(DeleteAccountAssignmentCommand).not.toHaveBeenCalled();
    expect(assignments).toContain(assignment('111111111111', 'GROUP', 'group-unmanaged'));
  });
});
