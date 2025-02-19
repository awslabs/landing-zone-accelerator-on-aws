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
import { describe, beforeEach, expect, test } from '@jest/globals';

import { IamRole } from '../../../../../lib/control-tower/setup-landing-zone/prerequisites/iam-role';

import {
  IAMClient,
  GetRoleCommand,
  CreateRoleCommand,
  PutRolePolicyCommand,
  AttachRolePolicyCommand,
  waitUntilRoleExists,
  NoSuchEntityException,
} from '@aws-sdk/client-iam';

// Mock dependencies
jest.mock('@aws-sdk/client-iam', () => {
  return {
    IAMClient: jest.fn(),
    GetRoleCommand: jest.fn(),
    CreateRoleCommand: jest.fn(),
    PutRolePolicyCommand: jest.fn(),
    AttachRolePolicyCommand: jest.fn(),
    TagRoleCommand: jest.fn(),
    NoSuchEntityException: jest.fn(),
    waitUntilRoleExists: jest.fn(),
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
  const mockSend = jest.fn();

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    (IAMClient as jest.Mock).mockImplementation(() => ({
      send: mockSend,
    }));
  });

  test('should check if roles exist and throw error if they do', async () => {
    // Setup
    mockSend.mockImplementation(command => {
      if (command instanceof GetRoleCommand) {
        return Promise.resolve({
          Role: MOCK_CONSTANTS.existingControlTowerRole,
        });
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
    }).rejects.toThrow(
      `There are existing AWS Control Tower Landing Zone roles "${MOCK_CONSTANTS.existingControlTowerRole.RoleName}", the solution cannot deploy AWS Control Tower Landing Zone`,
    );
    expect(GetRoleCommand).toHaveBeenCalledTimes(MOCK_CONSTANTS.requiredControlTowerRoleNames.length);
    expect(CreateRoleCommand).toHaveBeenCalledTimes(0);
    expect(PutRolePolicyCommand).toHaveBeenCalledTimes(0);
    expect(AttachRolePolicyCommand).toHaveBeenCalledTimes(0);
  });

  test('should handle internal error for while checking existing roles', async () => {
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
    }).rejects.toThrow(`Internal error: GetRoleCommand didn't return Role object`);
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

    (waitUntilRoleExists as jest.Mock).mockReturnValue({ state: 'SUCCESS' });

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
    expect(PutRolePolicyCommand).toHaveBeenCalledTimes(MOCK_CONSTANTS.requiredControlTowerRoleNames.length - 1);
    expect(AttachRolePolicyCommand).toHaveBeenCalledTimes(MOCK_CONSTANTS.requiredControlTowerRoleNames.length - 2);
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

    (waitUntilRoleExists as jest.Mock).mockReturnValue({ state: 'FAILURE' });

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

    (waitUntilRoleExists as jest.Mock).mockReturnValue({ state: 'SUCCESS' });

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
    expect(PutRolePolicyCommand).toHaveBeenCalledTimes(MOCK_CONSTANTS.requiredControlTowerRoleNames.length - 1);
    expect(AttachRolePolicyCommand).toHaveBeenCalledTimes(MOCK_CONSTANTS.requiredControlTowerRoleNames.length - 2);
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

    (waitUntilRoleExists as jest.Mock).mockReturnValue({ state: 'SUCCESS' });

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
