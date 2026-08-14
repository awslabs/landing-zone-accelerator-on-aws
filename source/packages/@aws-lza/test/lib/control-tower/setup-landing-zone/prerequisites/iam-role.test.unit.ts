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

/**
 * The NoSuchEntityException IAM raises when a role is absent.
 */
function roleNotFound() {
  return new NoSuchEntityException({ message: 'Role does not exist', $metadata: {} });
}

/**
 * Returns the 1-based global invocation order of the first call to the given mocked command constructor.
 * vitest records this across all mocks, which lets a test constrain the sequence of calls instead of only
 * asserting that they happened.
 */
function firstCallOrder(command: unknown): number {
  const order = (command as vi.Mock).mock.invocationCallOrder;
  expect(order.length).toBeGreaterThan(0);
  return order[0];
}

/**
 * Returns the invocation order of the last call to the given mocked command constructor.
 */
function lastCallOrder(command: unknown): number {
  const order = (command as vi.Mock).mock.invocationCallOrder;
  expect(order.length).toBeGreaterThan(0);
  return order[order.length - 1];
}

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

  /**
   * Resolves every command the delete-and-recreate path issues.
   *
   * `getRoleResponses` is consumed in order, one entry per GetRole call, mirroring the sequential loop over
   * requiredControlTowerRoleNames. Once the entries are exhausted the remaining roles are reported as absent,
   * so a test only has to describe the roles it cares about. NoSuchEntityException is itself mocked and is not
   * an `instanceof Error`, so rejections are marked explicitly.
   */
  function mockIamWith(options: {
    getRoleResponses: Array<{ Role: unknown } | { reject: unknown }>;
    attachedPolicyPages?: Array<{
      AttachedPolicies: Array<{ PolicyArn: string }>;
      IsTruncated?: boolean;
      Marker?: string;
    }>;
    inlinePolicyPages?: Array<{ PolicyNames: string[]; IsTruncated?: boolean; Marker?: string }>;
    onDeleteRole?: () => Promise<unknown>;
  }) {
    const attachedPages = options.attachedPolicyPages ?? [{ AttachedPolicies: [], IsTruncated: false }];
    const inlinePages = options.inlinePolicyPages ?? [{ PolicyNames: [], IsTruncated: false }];
    let getRoleCallCount = 0;
    let attachedCallCount = 0;
    let inlineCallCount = 0;

    mockSend.mockImplementation(command => {
      if (command instanceof GetRoleCommand) {
        const response = options.getRoleResponses[getRoleCallCount++] ?? { reject: roleNotFound() };
        return 'reject' in response ? Promise.reject(response.reject) : Promise.resolve(response);
      }
      if (command instanceof ListAttachedRolePoliciesCommand) {
        const page = attachedPages[Math.min(attachedCallCount++, attachedPages.length - 1)];
        return Promise.resolve(page);
      }
      if (command instanceof ListRolePoliciesCommand) {
        const page = inlinePages[Math.min(inlineCallCount++, inlinePages.length - 1)];
        return Promise.resolve(page);
      }
      if (command instanceof DeleteRoleCommand) {
        return options.onDeleteRole ? options.onDeleteRole() : Promise.resolve(undefined);
      }
      if (
        command instanceof DetachRolePolicyCommand ||
        command instanceof DeleteRolePolicyCommand ||
        command instanceof CreateRoleCommand ||
        command instanceof PutRolePolicyCommand ||
        command instanceof AttachRolePolicyCommand
      ) {
        return Promise.resolve(undefined);
      }

      return Promise.reject(MOCK_CONSTANTS.unknownError);
    });

    (waitUntilRoleExists as vi.Mock).mockReturnValue({ state: 'SUCCESS' });
  }

  /**
   * GetRole response for a role that already exists.
   */
  function existing(roleName: string) {
    return { Role: { RoleName: roleName, Arn: `MockRoleArn/${roleName}` } };
  }

  test('should delete and re-create an existing role instead of throwing', async () => {
    // Setup - only AWSControlTowerAdmin already exists, and it carries no policies
    mockIamWith({ getRoleResponses: [existing(MOCK_CONSTANTS.existingControlTowerRole.RoleName)] });

    // Execute
    const response = await IamRole.createControlTowerRoles(
      MOCK_CONSTANTS.partition,
      MOCK_CONSTANTS.region,
      MOCK_CONSTANTS.solutionId,
      MOCK_CONSTANTS.credentials,
    );

    // Verify - the existing role is deleted and all four required roles are created
    expect(response).toBeUndefined();
    expect(DeleteRoleCommand).toHaveBeenCalledTimes(1);
    expect(DeleteRoleCommand).toHaveBeenCalledWith(
      expect.objectContaining({ RoleName: MOCK_CONSTANTS.existingControlTowerRole.RoleName }),
    );
    expect(CreateRoleCommand).toHaveBeenCalledTimes(MOCK_CONSTANTS.requiredControlTowerRoleNames.length);
  });

  test('should re-create the deleted role after deleting it', async () => {
    // Setup
    mockIamWith({ getRoleResponses: [existing(MOCK_CONSTANTS.existingControlTowerRole.RoleName)] });

    // Execute
    await IamRole.createControlTowerRoles(
      MOCK_CONSTANTS.partition,
      MOCK_CONSTANTS.region,
      MOCK_CONSTANTS.solutionId,
      MOCK_CONSTANTS.credentials,
    );

    // Verify - ordering, so a re-create can never be issued before the delete that frees the name
    expect(firstCallOrder(DeleteRoleCommand)).toBeLessThan(firstCallOrder(CreateRoleCommand));
    expect(CreateRoleCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        RoleName: MOCK_CONSTANTS.existingControlTowerRole.RoleName,
        Path: '/service-role/',
      }),
    );
    // The re-created role gets its required policies back
    expect(PutRolePolicyCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        RoleName: 'AWSControlTowerAdmin',
        PolicyName: 'AWSControlTowerAdminPolicy',
      }),
    );
    expect(AttachRolePolicyCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        RoleName: 'AWSControlTowerAdmin',
        PolicyArn: `arn:${MOCK_CONSTANTS.partition}:iam::aws:policy/service-role/AWSControlTowerServiceRolePolicy`,
      }),
    );
  });

  test('should detach managed and remove inline policies before deleting an existing role', async () => {
    // Setup - the existing role carries one managed and one inline policy
    mockIamWith({
      getRoleResponses: [existing(MOCK_CONSTANTS.existingControlTowerRole.RoleName)],
      attachedPolicyPages: [
        { AttachedPolicies: [{ PolicyArn: 'arn:aws:iam::aws:policy/MockManagedPolicy' }], IsTruncated: false },
      ],
      inlinePolicyPages: [{ PolicyNames: ['MockInlinePolicy'], IsTruncated: false }],
    });

    // Execute
    await IamRole.createControlTowerRoles(
      MOCK_CONSTANTS.partition,
      MOCK_CONSTANTS.region,
      MOCK_CONSTANTS.solutionId,
      MOCK_CONSTANTS.credentials,
    );

    // Verify - ordering, not just occurrence. IAM rejects DeleteRole while any policy is still attached, so
    // asserting only the call counts would let a reordering through.
    expect(DetachRolePolicyCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        RoleName: MOCK_CONSTANTS.existingControlTowerRole.RoleName,
        PolicyArn: 'arn:aws:iam::aws:policy/MockManagedPolicy',
      }),
    );
    expect(DeleteRolePolicyCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        RoleName: MOCK_CONSTANTS.existingControlTowerRole.RoleName,
        PolicyName: 'MockInlinePolicy',
      }),
    );
    expect(lastCallOrder(DetachRolePolicyCommand)).toBeLessThan(firstCallOrder(DeleteRoleCommand));
    expect(lastCallOrder(DeleteRolePolicyCommand)).toBeLessThan(firstCallOrder(DeleteRoleCommand));
  });

  test('should list every page of policies before removing any of them', async () => {
    // Setup - attached and inline policies both span two pages
    mockIamWith({
      getRoleResponses: [existing(MOCK_CONSTANTS.existingControlTowerRole.RoleName)],
      attachedPolicyPages: [
        {
          AttachedPolicies: [{ PolicyArn: 'arn:aws:iam::aws:policy/MockPolicyPageOne' }],
          IsTruncated: true,
          Marker: 'mockAttachedMarker',
        },
        { AttachedPolicies: [{ PolicyArn: 'arn:aws:iam::aws:policy/MockPolicyPageTwo' }], IsTruncated: false },
      ],
      inlinePolicyPages: [
        { PolicyNames: ['MockInlinePageOne'], IsTruncated: true, Marker: 'mockInlineMarker' },
        { PolicyNames: ['MockInlinePageTwo'], IsTruncated: false },
      ],
    });

    // Execute
    await IamRole.createControlTowerRoles(
      MOCK_CONSTANTS.partition,
      MOCK_CONSTANTS.region,
      MOCK_CONSTANTS.solutionId,
      MOCK_CONSTANTS.credentials,
    );

    // Verify - the second page request carries the marker from the first
    expect(ListAttachedRolePoliciesCommand).toHaveBeenCalledWith(
      expect.objectContaining({ Marker: 'mockAttachedMarker' }),
    );
    expect(ListRolePoliciesCommand).toHaveBeenCalledWith(expect.objectContaining({ Marker: 'mockInlineMarker' }));

    // Every policy from both pages is removed
    expect(DetachRolePolicyCommand).toHaveBeenCalledTimes(2);
    expect(DeleteRolePolicyCommand).toHaveBeenCalledTimes(2);

    // Pagination completes before anything is removed. Detaching mid-pagination can shift the remaining
    // entries past the marker and silently skip a policy, which then fails the delete.
    expect(lastCallOrder(ListAttachedRolePoliciesCommand)).toBeLessThan(firstCallOrder(DetachRolePolicyCommand));
    expect(lastCallOrder(ListRolePoliciesCommand)).toBeLessThan(firstCallOrder(DeleteRolePolicyCommand));
  });

  test('should recover a partially completed run where only some roles exist', async () => {
    // Setup - an earlier run created roles 0 and 2 and then failed; 1 and 3 were never created
    mockIamWith({
      getRoleResponses: [
        existing(MOCK_CONSTANTS.requiredControlTowerRoleNames[0]),
        { reject: roleNotFound() },
        existing(MOCK_CONSTANTS.requiredControlTowerRoleNames[2]),
        { reject: roleNotFound() },
      ],
    });

    // Execute
    await IamRole.createControlTowerRoles(
      MOCK_CONSTANTS.partition,
      MOCK_CONSTANTS.region,
      MOCK_CONSTANTS.solutionId,
      MOCK_CONSTANTS.credentials,
    );

    // Verify - only the two pre-existing roles are deleted, and all four end up created
    expect(GetRoleCommand).toHaveBeenCalledTimes(MOCK_CONSTANTS.requiredControlTowerRoleNames.length);
    expect(DeleteRoleCommand).toHaveBeenCalledTimes(2);
    expect(DeleteRoleCommand).toHaveBeenCalledWith(
      expect.objectContaining({ RoleName: MOCK_CONSTANTS.requiredControlTowerRoleNames[0] }),
    );
    expect(DeleteRoleCommand).toHaveBeenCalledWith(
      expect.objectContaining({ RoleName: MOCK_CONSTANTS.requiredControlTowerRoleNames[2] }),
    );
    expect(DeleteRoleCommand).not.toHaveBeenCalledWith(
      expect.objectContaining({ RoleName: MOCK_CONSTANTS.requiredControlTowerRoleNames[1] }),
    );
    expect(CreateRoleCommand).toHaveBeenCalledTimes(MOCK_CONSTANTS.requiredControlTowerRoleNames.length);
    expect(PutRolePolicyCommand).toHaveBeenCalledTimes(2);
    expect(AttachRolePolicyCommand).toHaveBeenCalledTimes(3);
  });

  test('should not attempt any deletion when none of the roles exist', async () => {
    // Setup - every role is absent
    mockIamWith({ getRoleResponses: [] });

    // Execute
    await IamRole.createControlTowerRoles(
      MOCK_CONSTANTS.partition,
      MOCK_CONSTANTS.region,
      MOCK_CONSTANTS.solutionId,
      MOCK_CONSTANTS.credentials,
    );

    // Verify - a clean account never issues a destructive call, and never even lists policies
    expect(DeleteRoleCommand).toHaveBeenCalledTimes(0);
    expect(DetachRolePolicyCommand).toHaveBeenCalledTimes(0);
    expect(DeleteRolePolicyCommand).toHaveBeenCalledTimes(0);
    expect(ListAttachedRolePoliciesCommand).toHaveBeenCalledTimes(0);
    expect(ListRolePoliciesCommand).toHaveBeenCalledTimes(0);
    expect(CreateRoleCommand).toHaveBeenCalledTimes(MOCK_CONSTANTS.requiredControlTowerRoleNames.length);
  });

  test('should surface a failure to delete an existing role and not re-create it', async () => {
    // Setup - DeleteRole fails, as it would if the role were still in use
    const deleteError = new Error(
      'DeleteConflictException: Cannot delete entity, must remove roles from instance profile first.',
    );
    mockIamWith({
      getRoleResponses: [existing(MOCK_CONSTANTS.existingControlTowerRole.RoleName)],
      onDeleteRole: () => Promise.reject(deleteError),
    });

    // Execute and Verify - the error propagates rather than being swallowed, and the loop stops
    await expect(async () => {
      await IamRole.createControlTowerRoles(
        MOCK_CONSTANTS.partition,
        MOCK_CONSTANTS.region,
        MOCK_CONSTANTS.solutionId,
        MOCK_CONSTANTS.credentials,
      );
    }).rejects.toThrow(deleteError.message);
    expect(CreateRoleCommand).toHaveBeenCalledTimes(0);
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

    // Execute and Verify - the loop stops at the first required role
    await expect(async () => {
      await IamRole.createControlTowerRoles(
        MOCK_CONSTANTS.partition,
        MOCK_CONSTANTS.region,
        MOCK_CONSTANTS.solutionId,
        MOCK_CONSTANTS.credentials,
      );
    }).rejects.toThrow(
      `AWS Control Tower Landing Zone role ${MOCK_CONSTANTS.requiredControlTowerRoleNames[0]} creation not completed!!`,
    );
    expect(CreateRoleCommand).toHaveBeenCalledTimes(1);
    expect(PutRolePolicyCommand).toHaveBeenCalledTimes(0);
    expect(AttachRolePolicyCommand).toHaveBeenCalledTimes(0);
  });

  test('should create roles when NoSuchEntityException exception occurred while checking for roles', async () => {
    // Setup
    mockSend.mockImplementation(command => {
      if (command instanceof GetRoleCommand) {
        return Promise.reject(roleNotFound());
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
