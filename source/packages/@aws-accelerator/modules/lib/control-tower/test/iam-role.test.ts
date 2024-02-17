import { describe, beforeEach, expect, test } from '@jest/globals';

import { IamRole } from '../prerequisites/iam-role';
import {
  IAMClient,
  GetRoleCommand,
  PutRolePolicyCommand,
  AttachRolePolicyCommand,
  CreateRoleCommand,
  NoSuchEntityException,
} from '@aws-sdk/client-iam';

import {
  AWSControlTowerAdmin,
  AWSControlTowerRolePolicyDocument,
  AcceleratorMockClient,
  ExistingRoleFoundError,
  MockInternalError,
  Partition,
  Region,
  SolutionId,
} from './utils/test-resources';

const client = AcceleratorMockClient(IAMClient);

describe('Success', () => {
  beforeEach(() => {
    client.reset();
  });

  test('Success - Create Role', async () => {
    client.on(GetRoleCommand, {}).resolves({
      Role: undefined,
    });

    client
      .on(CreateRoleCommand, {
        RoleName: AWSControlTowerAdmin.RoleName,
        Path: AWSControlTowerAdmin.Path,
        AssumeRolePolicyDocument: AWSControlTowerRolePolicyDocument,
      })
      .resolves({ $metadata: { httpStatusCode: 200 } });

    client
      .on(PutRolePolicyCommand, {
        RoleName: AWSControlTowerAdmin.RoleName,
        PolicyName: `${AWSControlTowerAdmin}Policy`,
        PolicyDocument: AWSControlTowerRolePolicyDocument,
      })
      .resolves({ $metadata: { httpStatusCode: 200 } });

    client
      .on(AttachRolePolicyCommand, {
        RoleName: AWSControlTowerAdmin.RoleName,
        PolicyArn: `${AWSControlTowerAdmin}Arn`,
      })
      .resolves({});

    expect(await IamRole.createControlTowerRoles(Partition, Region, SolutionId)).toBeUndefined();
  });
});

describe('Failure', () => {
  beforeEach(() => {
    client.reset();
  });
  test('NoSuchEntityException', async () => {
    client
      .on(GetRoleCommand)
      .rejectsOnce(
        new NoSuchEntityException({
          $metadata: {},
          message: '',
        }),
      )
      .resolves({
        Role: undefined,
      });

    client
      .on(CreateRoleCommand, {
        RoleName: AWSControlTowerAdmin.RoleName,
        Path: AWSControlTowerAdmin.Path,
        AssumeRolePolicyDocument: AWSControlTowerRolePolicyDocument,
      })
      .resolves({ $metadata: { httpStatusCode: 200 } });

    client
      .on(PutRolePolicyCommand, {
        RoleName: AWSControlTowerAdmin.RoleName,
        PolicyName: `${AWSControlTowerAdmin}Policy`,
        PolicyDocument: AWSControlTowerRolePolicyDocument,
      })
      .resolves({ $metadata: { httpStatusCode: 200 } });

    client
      .on(AttachRolePolicyCommand, {
        RoleName: AWSControlTowerAdmin.RoleName,
        PolicyArn: `${AWSControlTowerAdmin}Arn`,
      })
      .resolves({});

    expect(await IamRole.createControlTowerRoles(Partition, Region, SolutionId)).toBeUndefined();
  });

  test('Existing Role found', async () => {
    client.on(GetRoleCommand, {}).resolves({
      Role: AWSControlTowerAdmin,
    });

    await expect(IamRole.createControlTowerRoles(Partition, Region, SolutionId)).rejects.toThrow(
      ExistingRoleFoundError([AWSControlTowerAdmin.RoleName]),
    );
  });

  test('Get role internal error', async () => {
    client.on(GetRoleCommand).rejectsOnce(MockInternalError).resolves({
      Role: undefined,
    });

    await expect(IamRole.createControlTowerRoles(Partition, Region, SolutionId)).rejects.toThrow(MockInternalError);
  });
});
