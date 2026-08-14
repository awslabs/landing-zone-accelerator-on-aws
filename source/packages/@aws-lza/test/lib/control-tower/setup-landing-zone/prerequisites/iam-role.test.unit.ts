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

import { IamRole } from '../../../../../lib/control-tower/setup-landing-zone/prerequisites/iam-role';

import {
  IAMClient,
  GetRoleCommand,
  CreateRoleCommand,
  PutRolePolicyCommand,
  AttachRolePolicyCommand,
  waitUntilRoleExists,
  NoSuchEntityException,
  DeleteRoleCommand,
  DetachRolePolicyCommand,
  ListAttachedRolePoliciesCommand,
  ListRolePoliciesCommand,
  DeleteRolePolicyCommand,
} from '@aws-sdk/client-iam';
import { MODULE_EXCEPTIONS } from '../../../../../common/enums';

// Mock dependencies
vi.mock('@aws-sdk/client-iam', () => {
  return {
    IAMClient: vi.fn(),
    GetRoleCommand: vi.fn(),
    CreateRoleCommand: vi.fn(),
    PutRolePolicyCommand: vi.fn(),
    AttachRolePolicyCommand: vi.fn(),
    TagRoleCommand: vi.fn(),
    NoSuchEntityException: vi.fn(),
    waitUntilRoleExists: vi.fn(),
    DeleteRoleCommand: vi.fn(),
    DetachRolePolicyCommand: vi.fn(),
    ListAttachedRolePoliciesCommand: vi.fn(),
    ListRolePoliciesCommand: vi.fn(),
    DeleteRolePolicyCommand: vi.fn(),
  };
});

const MOCK_CONSTANTS = {
  partition: 'mockPartition',
  region: 'mockRegion',
  solutionId: 'mockSolutionId',
  credentials: {
    accessKeyId: 'mockAccessKeyId',
    secretAccessKey: 'mockSecretAccessKey',
    sessionToken: 'mockSessionToken',
    expiration: new Date('2024-12-31'),
  },
  requiredControlTowerRoleNames: [
    'AWSControlTowerAdmin',
    'AWSControlTowerCloudTrailRole',
    'AWSControlTowerStackSetRole',
    'AWSControlTowerConfigAggregatorRoleForOrganizations',
  ],
  existingControlTowerRole: {
    RoleName: 'AWSControlTowerAdmin',
    Arn: 'MockRoleArn',
  },
  mockRole: {
    RoleName: 'mockRoleName',
    Arn: 'MockRoleArn',
  },
  unknownError: new Error('Unknown command'),
};

describe('IAM Role Tests', () => {
  const mockSend = vi.fn();

  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();

    (IAMClient as vi.Mock).mockImplementation(function () {
      return {
        send: mockSend,
      };
    });
  });

  test('should delete and re-create an existing role instead of throwing', async () => {
    // Setup - only AWSControlTowerAdmin is reported as existing, with no policies attached
    mockSend.mockImplementation(command => {
      if (command instanceof GetRoleCommand) {
        return Promise.resolve({
          Role: MOCK_CONSTANTS.existingControlTowerRole,
        });
      }
      if (command instanceof ListAttachedRolePoliciesCommand) {
        return Promise.resolve({ AttachedPolicies: [], IsTruncated: false });
      }
      if (command instanceof ListRolePoliciesCommand) {
        return Promise.resolve({ PolicyNames: [], IsTruncated: false });
      }
      if (command instanceof DeleteRoleCommand) {
        return Promise.resolve(undefined);
      }
      if (command instanceof CreateRoleCommand) {
        return Promise.resolve(undefined);
      }
      if (command instanceof PutRolePolicyCommand) {
        return Promise.resolve(undefined);
      }
      if (command instanceof AttachRolePolicyCommand) {
        return Promise.resolve(undefined);
      }

      return Promise.reject(MOCK_CONSTANTS.unknownError);
    });

    (waitUntilRoleExists as vi.Mock).mockReturnValue({ state: 'SUCCESS' });

    // Execute
    const response = await IamRole.createControlTowerRoles(
      MOCK_CONSTANTS.partition,
      MOCK_CONSTANTS.region,
      MOCK_CONSTANTS.solutionId,
      MOCK_CONSTANTS.credentials,
    );

    // Verify - the existing role is deleted and all required roles are created
    expect(response).toBeUndefined();
    expect(DeleteRoleCommand).toHaveBeenCalledTimes(1);
    expect(DeleteRoleCommand).toHaveBeenCalledWith(
      expect.objectContaining({ RoleName: MOCK_CONSTANTS.existingControlTowerRole.RoleName }),
    );
    expect(CreateRoleCommand).toHaveBeenCalledTimes(MOCK_CONSTANTS.requiredControlTowerRoleNames.length);
  });

  test('should detach managed and remove inline policies before deleting an existing role', async () => {
    // Setup
    mockSend.mockImplementation(command => {
      if (command instanceof GetRoleCommand) {
        return Promise.resolve({
          Role: MOCK_CONSTANTS.existingControlTowerRole,
        });
      }
      if (command instanceof ListAttachedRolePoliciesCommand) {
        return Promise.resolve({
          AttachedPolicies: [{ PolicyArn: 'arn:aws:iam::aws:policy/MockManagedPolicy' }],
          IsTruncated: false,
        });
      }
      if (command instanceof DetachRolePolicyCommand) {
        return Promise.resolve(undefined);
      }
      if (command instanceof ListRolePoliciesCommand) {
        return Promise.resolve({ PolicyNames: ['MockInlinePolicy'], IsTruncated: false });
      }
      if (command instanceof DeleteRolePolicyCommand) {
        return Promise.resolve(undefined);
      }
      if (command instanceof DeleteRoleCommand) {
        return Promise.resolve(undefined);
      }
      if (command instanceof CreateRoleCommand) {
        return Promise.resolve(undefined);
      }
      if (command instanceof PutRolePolicyCommand) {
        return Promise.resolve(undefined);
      }
      if (command instanceof AttachRolePolicyCommand) {
        return Promise.resolve(undefined);
      }

      return Promise.reject(MOCK_CONSTANTS.unknownError);
    });

    (waitUntilRoleExists as vi.Mock).mockReturnValue({ state: 'SUCCESS' });

    // Execute
    await IamRole.createControlTowerRoles(
      MOCK_CONSTANTS.partition,
      MOCK_CONSTANTS.region,
      MOCK_CONSTANTS.solutionId,
      MOCK_CONSTANTS.credentials,
    );

    // Verify - policies are removed before the role is deleted
    expect(DetachRolePolicyCommand).toHaveBeenCalledTimes(1);
    expect(DeleteRolePolicyCommand).toHaveBeenCalledTimes(1);
    expect(DeleteRoleCommand).toHaveBeenCalledTimes(1);
  });

  test('should paginate when listing attached policies of an existing role', async () => {
    // Setup - first page of attached policies is truncated
    let attachedCallCount = 0;
    mockSend.mockImplementation(command => {
      if (command instanceof GetRoleCommand) {
        return Promise.resolve({
          Role: MOCK_CONSTANTS.existingControlTowerRole,
        });
      }
      if (command instanceof ListAttachedRolePoliciesCommand) {
        attachedCallCount++;
        if (attachedCallCount === 1) {
          return Promise.resolve({
            AttachedPolicies: [{ PolicyArn: 'arn:aws:iam::aws:policy/MockPolicyPageOne' }],
            IsTruncated: true,
            Marker: 'mockMarker',
          });
        }
        return Promise.resolve({
          AttachedPolicies: [{ PolicyArn: 'arn:aws:iam::aws:policy/MockPolicyPageTwo' }],
          IsTruncated: false,
        });
      }
      if (command instanceof DetachRolePolicyCommand) {
        return Promise.resolve(undefined);
      }
      if (command instanceof ListRolePoliciesCommand) {
        return Promise.resolve({ PolicyNames: [], IsTruncated: false });
      }
      if (command instanceof DeleteRoleCommand) {
        return Promise.resolve(undefined);
      }
      if (command instanceof CreateRoleCommand) {
        return Promise.resolve(undefined);
      }
      if (command instanceof PutRolePolicyCommand) {
        return Promise.resolve(undefined);
      }
      if (command instanceof AttachRolePolicyCommand) {
        return Promise.resolve(undefined);
      }

      return Promise.reject(MOCK_CONSTANTS.unknownError);
    });

    (waitUntilRoleExists as vi.Mock).mockReturnValue({ state: 'SUCCESS' });

    // Execute
    await IamRole.createControlTowerRoles(
      MOCK_CONSTANTS.partition,
      MOCK_CONSTANTS.region,
      MOCK_CONSTANTS.solutionId,
      MOCK_CONSTANTS.credentials,
    );

    // Verify - both pages were fetched and every policy detached
    expect(attachedCallCount).toBe(2);
    expect(DetachRolePolicyCommand).toHaveBeenCalledTimes(2);
    expect(DeleteRoleCommand).toHaveBeenCalledTimes(1);
  });

  test('should handle service api exception for while checking existing roles', async () => {
    // Setup
    mockSend.mockImplementation(command => {
      if (command instanceof GetRoleCommand) {
        return Promise.resolve({ Role: undefined });
      }
      return Promise.reject(MOCK_CONSTANTS.unknownError);
    });

    // Execute and Verify
    await expect(async () => {
      await IamRole.createControlTowerRoles(
        MOCK_CONSTANTS.partition,
        MOCK_CONSTANTS.region,
        MOCK_CONSTANTS.solutionId,
        MOCK_CONSTANTS.credentials,
      );
    }).rejects.toThrow(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: GetRoleCommand did not return Role object`);
    expect(GetRoleCommand).toHaveBeenCalledTimes(1);
    expect(CreateRoleCommand).toHaveBeenCalledTimes(0);
    expect(PutRolePolicyCommand).toHaveBeenCalledTimes(0);
    expect(AttachRolePolicyCommand).toHaveBeenCalledTimes(0);
  });

  test('should create roles when they do not exist', async () => {
    // Setup
    mockSend.mockImplementation(command => {
      if (command instanceof GetRoleCommand) {
        return Promise.resolve({
          Role: MOCK_CONSTANTS.mockRole,
        });
      }
      if (command instanceof CreateRoleCommand) {
        return Promise.resolve(undefined);
      }
      if (command instanceof PutRolePolicyCommand) {
        return Promise.resolve(undefined);
      }
      if (command instanceof AttachRolePolicyCommand) {
        return Promise.resolve(undefined);
      }

      return Promise.reject(MOCK_CONSTANTS.unknownError);
    });

    (waitUntilRoleExists as vi.Mock).mockReturnValue({ state: 'SUCCESS' });

    // Execute
    const response = await IamRole.createControlTowerRoles(
      MOCK_CONSTANTS.partition,
      MOCK_CONSTANTS.region,
      MOCK_CONSTANTS.solutionId,
      MOCK_CONSTANTS.credentials,
    );

    // Verify
    expect(response).toBeUndefined();
    expect(GetRoleCommand).toHaveBeenCalledTimes(MOCK_CONSTANTS.requiredControlTowerRoleNames.length);
    expect(CreateRoleCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        RoleName: MOCK_CONSTANTS.requiredControlTowerRoleNames[0],
        AssumeRolePolicyDocument: expect.stringContaining('sts:AssumeRole'),
      }),
    );
    expect(CreateRoleCommand).toHaveBeenCalledTimes(MOCK_CONSTANTS.requiredControlTowerRoleNames.length);
    expect(PutRolePolicyCommand).toHaveBeenCalledTimes(MOCK_CONSTANTS.requiredControlTowerRoleNames.length - 2);
    expect(AttachRolePolicyCommand).toHaveBeenCalledTimes(MOCK_CONSTANTS.requiredControlTowerRoleNames.length - 1);
  });

  test('should handle role creation failure', async () => {
    // Setup
    mockSend.mockImplementation(command => {
      if (command instanceof GetRoleCommand) {
        return Promise.resolve({
          Role: MOCK_CONSTANTS.mockRole,
        });
      }
      if (command instanceof CreateRoleCommand) {
        return Promise.resolve(undefined);
      }
      if (command instanceof PutRolePolicyCommand) {
        return Promise.resolve(undefined);
      }
      if (command instanceof AttachRolePolicyCommand) {
        return Promise.resolve(undefined);
      }

      return Promise.reject(MOCK_CONSTANTS.unknownError);
    });

    (waitUntilRoleExists as vi.Mock).mockReturnValue({ state: 'FAILURE' });

    // Execute and Verify
    await expect(async () => {
      await IamRole.createControlTowerRoles(
        MOCK_CONSTANTS.partition,
        MOCK_CONSTANTS.region,
        MOCK_CONSTANTS.solutionId,
        MOCK_CONSTANTS.credentials,
      );
    }).rejects.toThrow(
      `AWS Control Tower Landing Zone role ${MOCK_CONSTANTS.existingControlTowerRole.RoleName} creation not completed!!`,
    );
    expect(CreateRoleCommand).toHaveBeenCalledTimes(1);
    expect(PutRolePolicyCommand).toHaveBeenCalledTimes(0);
    expect(AttachRolePolicyCommand).toHaveBeenCalledTimes(0);
  });

  test('should create roles when NoSuchEntityException exception occurred while checking for roles', async () => {
    // Setup
    mockSend.mockImplementation(command => {
      if (command instanceof GetRoleCommand) {
        return Promise.reject(new NoSuchEntityException({ message: 'Role does not exist', $metadata: {} }));
      }
      if (command instanceof CreateRoleCommand) {
        return Promise.resolve(undefined);
      }
      if (command instanceof PutRolePolicyCommand) {
        return Promise.resolve(undefined);
      }
      if (command instanceof AttachRolePolicyCommand) {
        return Promise.resolve(undefined);
      }

      return Promise.reject(MOCK_CONSTANTS.unknownError);
    });

    (waitUntilRoleExists as vi.Mock).mockReturnValue({ state: 'SUCCESS' });

    // Execute
    const response = await IamRole.createControlTowerRoles(
      MOCK_CONSTANTS.partition,
      MOCK_CONSTANTS.region,
      MOCK_CONSTANTS.solutionId,
      MOCK_CONSTANTS.credentials,
    );

    // Verify
    expect(response).toBeUndefined();
    expect(GetRoleCommand).toHaveBeenCalledTimes(MOCK_CONSTANTS.requiredControlTowerRoleNames.length);
    expect(CreateRoleCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        RoleName: MOCK_CONSTANTS.requiredControlTowerRoleNames[0],
        AssumeRolePolicyDocument: expect.stringContaining('sts:AssumeRole'),
      }),
    );
    expect(CreateRoleCommand).toHaveBeenCalledTimes(MOCK_CONSTANTS.requiredControlTowerRoleNames.length);
    expect(PutRolePolicyCommand).toHaveBeenCalledTimes(MOCK_CONSTANTS.requiredControlTowerRoleNames.length - 2);
    expect(AttachRolePolicyCommand).toHaveBeenCalledTimes(MOCK_CONSTANTS.requiredControlTowerRoleNames.length - 1);
  });

  test('should handle other exceptions while checking for roles', async () => {
    // Setup
    const otherErrorMessage = 'Some other error';
    mockSend.mockImplementation(command => {
      if (command instanceof GetRoleCommand) {
        return Promise.reject(new Error(otherErrorMessage));
      }
      if (command instanceof CreateRoleCommand) {
        return Promise.resolve(undefined);
      }
      if (command instanceof PutRolePolicyCommand) {
        return Promise.resolve(undefined);
      }
      if (command instanceof AttachRolePolicyCommand) {
        return Promise.resolve(undefined);
      }

      return Promise.reject(MOCK_CONSTANTS.unknownError);
    });

    (waitUntilRoleExists as vi.Mock).mockReturnValue({ state: 'SUCCESS' });

    // Execute and Verify
    await expect(async () => {
      await IamRole.createControlTowerRoles(
        MOCK_CONSTANTS.partition,
        MOCK_CONSTANTS.region,
        MOCK_CONSTANTS.solutionId,
        MOCK_CONSTANTS.credentials,
      );
    }).rejects.toThrow(otherErrorMessage);

    expect(GetRoleCommand).toHaveBeenCalledTimes(1);
    expect(CreateRoleCommand).toHaveBeenCalledTimes(0);
    expect(PutRolePolicyCommand).toHaveBeenCalledTimes(0);
    expect(AttachRolePolicyCommand).toHaveBeenCalledTimes(0);
  });
});
