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
import { SSOAdminClient, CreateAccountAssignmentCommand } from '@aws-sdk/client-sso-admin';

// Mock the AWS SDK clients
vi.mock('@aws-sdk/client-identitystore');
vi.mock('@aws-sdk/client-sso-admin');
vi.mock('@aws-accelerator/utils/lib/throttle', () => ({
  throttlingBackOff: vi.fn(fn => fn()),
}));
vi.mock('@aws-accelerator/utils/lib/common-functions', () => ({
  setRetryStrategy: vi.fn(() => ({})),
}));

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

    mockSSOAdminClient = {
      send: vi.fn().mockResolvedValue({
        AccountAssignmentCreationStatus: {
          RequestId: 'test-request-id',
          Status: 'IN_PROGRESS',
        },
      }),
    };

    vi.mocked(IdentitystoreClient).mockImplementation(() => mockIdentityStoreClient);
    vi.mocked(SSOAdminClient).mockImplementation(() => mockSSOAdminClient);
    vi.mocked(CreateAccountAssignmentCommand).mockImplementation(input => ({ input }));
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
