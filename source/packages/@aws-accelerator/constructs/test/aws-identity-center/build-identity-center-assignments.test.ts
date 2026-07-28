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
