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
  UpdateAssumeRolePolicyCommand,
  DeleteRoleCommand,
  DetachRolePolicyCommand,
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
    UpdateAssumeRolePolicyCommand: vi.fn(),
    // Not used by the module under test. Imported here so the tests can assert that no destructive IAM call is
    // ever made against a pre-existing Control Tower role.
    DeleteRoleCommand: vi.fn(),
    DetachRolePolicyCommand: vi.fn(),
    DeleteRolePolicyCommand: vi.fn(),
    ListAttachedRolePoliciesCommand: vi.fn(),
    ListRolePoliciesCommand: vi.fn(),
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
  /**
   * Trust principal each required role is expected to be reconciled to, in the same order as
   * requiredControlTowerRoleNames.
   */
  expectedAssumeRolePrincipals: [
    'controltower.amazonaws.com',
    'cloudtrail.amazonaws.com',
    'cloudformation.amazonaws.com',
    'config.amazonaws.com',
  ],
  controlTowerRolePath: '/service-role/',
  mockRole: {
    RoleName: 'mockRoleName',
    Arn: 'MockRoleArn',
  },
  unknownError: new Error('Unknown command'),
};

/**
 * Builds the GetRole response for a pre-existing Control Tower role.
 */
function existingRole(roleName: string, path: string = MOCK_CONSTANTS.controlTowerRolePath) {
  return { RoleName: roleName, Arn: `arn:aws:iam::111111111111:role${path}${roleName}`, Path: path };
}

/**
 * The NoSuchEntityException IAM raises when a role is absent.
 */
function roleNotFound() {
  return new NoSuchEntityException({ message: 'Role does not exist', $metadata: {} });
}

/**
 * Commands that would destroy or strip a pre-existing role. None of these may ever be issued.
 */
const DESTRUCTIVE_COMMANDS = [DeleteRoleCommand, DetachRolePolicyCommand, DeleteRolePolicyCommand];

function expectNothingDestructive() {
  for (const command of DESTRUCTIVE_COMMANDS) {
    expect(command).toHaveBeenCalledTimes(0);
  }
}

/**
 * Returns the 1-based global invocation order of the first call to the given mocked command constructor.
 * vitest records this across all mocks, which lets a test constrain the sequence of calls rather than only
 * asserting that they happened.
 */
function firstCallOrder(command: unknown): number {
  const order = (command as vi.Mock).mock.invocationCallOrder;
  expect(order.length).toBeGreaterThan(0);
  return order[0];
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
   * Resolves every command the happy path issues. `getRoleResponses` is consumed in order, one entry per
   * GetRole call, which mirrors the sequential loop over requiredControlTowerRoleNames. Once the supplied
   * entries are exhausted the remaining roles are reported as absent, so a test only has to describe the
   * roles it actually cares about.
   *
   * Note that NoSuchEntityException is itself mocked, so a thrown entry cannot be detected with
   * `instanceof Error`. Rejections are marked explicitly instead.
   */
  function mockIamWith(getRoleResponses: Array<{ Role: unknown } | { reject: unknown }>) {
    let getRoleCallCount = 0;
    mockSend.mockImplementation(command => {
      if (command instanceof GetRoleCommand) {
        const response = getRoleResponses[getRoleCallCount++] ?? { reject: roleNotFound() };
        return 'reject' in response ? Promise.reject(response.reject) : Promise.resolve(response);
      }
      if (
        command instanceof CreateRoleCommand ||
        command instanceof UpdateAssumeRolePolicyCommand ||
        command instanceof PutRolePolicyCommand ||
        command instanceof AttachRolePolicyCommand
      ) {
        return Promise.resolve(undefined);
      }

      return Promise.reject(MOCK_CONSTANTS.unknownError);
    });
    (waitUntilRoleExists as vi.Mock).mockReturnValue({ state: 'SUCCESS' });
  }

  test('should reuse pre-existing roles instead of throwing or deleting them', async () => {
    // Setup - every required role already exists at the expected path, as it would after a run that
    // created the roles and then failed at a later prerequisite step.
    mockIamWith(MOCK_CONSTANTS.requiredControlTowerRoleNames.map(name => ({ Role: existingRole(name) })));

    // Execute
    const response = await IamRole.createControlTowerRoles(
      MOCK_CONSTANTS.partition,
      MOCK_CONSTANTS.region,
      MOCK_CONSTANTS.solutionId,
      MOCK_CONSTANTS.credentials,
    );

    // Verify - the step succeeds, nothing is created and nothing is destroyed
    expect(response).toBeUndefined();
    expect(CreateRoleCommand).toHaveBeenCalledTimes(0);
    expect(UpdateAssumeRolePolicyCommand).toHaveBeenCalledTimes(MOCK_CONSTANTS.requiredControlTowerRoleNames.length);
    expectNothingDestructive();
  });

  test('should re-apply the required policies onto pre-existing roles', async () => {
    // Setup
    mockIamWith(MOCK_CONSTANTS.requiredControlTowerRoleNames.map(name => ({ Role: existingRole(name) })));

    // Execute
    await IamRole.createControlTowerRoles(
      MOCK_CONSTANTS.partition,
      MOCK_CONSTANTS.region,
      MOCK_CONSTANTS.solutionId,
      MOCK_CONSTANTS.credentials,
    );

    // Verify - reconciling an existing role applies exactly the same policy set as creating it from scratch:
    // 2 inline policies (Admin, StackSet) and 3 managed policies (Admin, CloudTrail, ConfigAggregator).
    expect(PutRolePolicyCommand).toHaveBeenCalledTimes(2);
    expect(AttachRolePolicyCommand).toHaveBeenCalledTimes(3);
    expect(PutRolePolicyCommand).toHaveBeenCalledWith(
      expect.objectContaining({ RoleName: 'AWSControlTowerAdmin', PolicyName: 'AWSControlTowerAdminPolicy' }),
    );
    expect(AttachRolePolicyCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        RoleName: 'AWSControlTowerCloudTrailRole',
        PolicyArn: `arn:${MOCK_CONSTANTS.partition}:iam::aws:policy/service-role/AWSControlTowerCloudTrailRolePolicy`,
      }),
    );
  });

  test('should reconcile each pre-existing role to its required trust principal', async () => {
    // Setup
    mockIamWith(MOCK_CONSTANTS.requiredControlTowerRoleNames.map(name => ({ Role: existingRole(name) })));

    // Execute
    await IamRole.createControlTowerRoles(
      MOCK_CONSTANTS.partition,
      MOCK_CONSTANTS.region,
      MOCK_CONSTANTS.solutionId,
      MOCK_CONSTANTS.credentials,
    );

    // Verify - the trust policy written to each existing role names that role's own service principal
    MOCK_CONSTANTS.requiredControlTowerRoleNames.forEach((roleName, index) => {
      expect(UpdateAssumeRolePolicyCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          RoleName: roleName,
          PolicyDocument: expect.stringContaining(MOCK_CONSTANTS.expectedAssumeRolePrincipals[index]),
        }),
      );
    });
  });

  test('should write an identical trust policy whether the role is created or reconciled', async () => {
    // Setup - AWSControlTowerAdmin is created from scratch
    mockIamWith([{ Role: MOCK_CONSTANTS.mockRole }]);
    await IamRole.createControlTowerRoles(
      MOCK_CONSTANTS.partition,
      MOCK_CONSTANTS.region,
      MOCK_CONSTANTS.solutionId,
      MOCK_CONSTANTS.credentials,
    );
    const createdDocument = (CreateRoleCommand as vi.Mock).mock.calls[0][0].AssumeRolePolicyDocument;

    // Setup - AWSControlTowerAdmin already exists and is reconciled
    vi.clearAllMocks();
    (IAMClient as vi.Mock).mockImplementation(function () {
      return { send: mockSend };
    });
    mockIamWith([{ Role: existingRole('AWSControlTowerAdmin') }]);
    await IamRole.createControlTowerRoles(
      MOCK_CONSTANTS.partition,
      MOCK_CONSTANTS.region,
      MOCK_CONSTANTS.solutionId,
      MOCK_CONSTANTS.credentials,
    );
    const reconciledDocument = (UpdateAssumeRolePolicyCommand as vi.Mock).mock.calls[0][0].PolicyDocument;

    // Verify - both paths derive the document from the same helper, so they must not drift apart
    expect(createdDocument).toBe(reconciledDocument);
  });

  test('should recover a partially completed run where only some roles exist', async () => {
    // Setup - roles 0 and 2 were created by an earlier run that then failed; 1 and 3 were never created.
    mockIamWith([
      { Role: existingRole(MOCK_CONSTANTS.requiredControlTowerRoleNames[0]) },
      { reject: roleNotFound() },
      { Role: existingRole(MOCK_CONSTANTS.requiredControlTowerRoleNames[2]) },
      { reject: roleNotFound() },
    ]);

    // Execute
    await IamRole.createControlTowerRoles(
      MOCK_CONSTANTS.partition,
      MOCK_CONSTANTS.region,
      MOCK_CONSTANTS.solutionId,
      MOCK_CONSTANTS.credentials,
    );

    // Verify - the two missing roles are created, the two present roles are reconciled, none are destroyed
    expect(GetRoleCommand).toHaveBeenCalledTimes(MOCK_CONSTANTS.requiredControlTowerRoleNames.length);
    expect(CreateRoleCommand).toHaveBeenCalledTimes(2);
    expect(CreateRoleCommand).toHaveBeenCalledWith(
      expect.objectContaining({ RoleName: MOCK_CONSTANTS.requiredControlTowerRoleNames[1] }),
    );
    expect(UpdateAssumeRolePolicyCommand).toHaveBeenCalledTimes(2);
    expect(UpdateAssumeRolePolicyCommand).toHaveBeenCalledWith(
      expect.objectContaining({ RoleName: MOCK_CONSTANTS.requiredControlTowerRoleNames[0] }),
    );
    // Every role still ends up with its full policy set
    expect(PutRolePolicyCommand).toHaveBeenCalledTimes(2);
    expect(AttachRolePolicyCommand).toHaveBeenCalledTimes(3);
    expectNothingDestructive();
  });

  test('should reconcile the trust policy before applying the role policies', async () => {
    // Setup - a single pre-existing role, so the recorded call order is unambiguous
    mockIamWith([{ Role: existingRole('AWSControlTowerAdmin') }]);

    // Execute
    await IamRole.createControlTowerRoles(
      MOCK_CONSTANTS.partition,
      MOCK_CONSTANTS.region,
      MOCK_CONSTANTS.solutionId,
      MOCK_CONSTANTS.credentials,
    );

    // Verify - ordering, not just occurrence. The role must be reconciled and present before policies are
    // written to it, otherwise the policy calls would race the trust policy update.
    expect(firstCallOrder(GetRoleCommand)).toBeLessThan(firstCallOrder(UpdateAssumeRolePolicyCommand));
    expect(firstCallOrder(UpdateAssumeRolePolicyCommand)).toBeLessThan(firstCallOrder(PutRolePolicyCommand));
    expect(firstCallOrder(PutRolePolicyCommand)).toBeLessThan(firstCallOrder(AttachRolePolicyCommand));
  });

  test('should fail with an actionable error when an existing role is under an unexpected path', async () => {
    // Setup - a role of the right name exists, but not under /service-role/
    mockIamWith([{ Role: existingRole('AWSControlTowerAdmin', '/') }]);

    // Execute and Verify
    await expect(async () => {
      await IamRole.createControlTowerRoles(
        MOCK_CONSTANTS.partition,
        MOCK_CONSTANTS.region,
        MOCK_CONSTANTS.solutionId,
        MOCK_CONSTANTS.credentials,
      );
    }).rejects.toThrow(
      `${MODULE_EXCEPTIONS.INVALID_INPUT}: Existing AWS Control Tower Landing Zone role AWSControlTowerAdmin is under path "/"`,
    );

    // The role is left exactly as it was found: not moved, not deleted, not re-trusted
    expect(UpdateAssumeRolePolicyCommand).toHaveBeenCalledTimes(0);
    expect(CreateRoleCommand).toHaveBeenCalledTimes(0);
    expect(PutRolePolicyCommand).toHaveBeenCalledTimes(0);
    expect(AttachRolePolicyCommand).toHaveBeenCalledTimes(0);
    expectNothingDestructive();
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
        Path: MOCK_CONSTANTS.controlTowerRolePath,
        AssumeRolePolicyDocument: expect.stringContaining('sts:AssumeRole'),
      }),
    );
    expect(CreateRoleCommand).toHaveBeenCalledTimes(MOCK_CONSTANTS.requiredControlTowerRoleNames.length);
    expect(PutRolePolicyCommand).toHaveBeenCalledTimes(MOCK_CONSTANTS.requiredControlTowerRoleNames.length - 2);
    expect(AttachRolePolicyCommand).toHaveBeenCalledTimes(MOCK_CONSTANTS.requiredControlTowerRoleNames.length - 1);
    expect(UpdateAssumeRolePolicyCommand).toHaveBeenCalledTimes(0);
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
