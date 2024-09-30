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

import { IamRole } from '../../lib/control-tower/prerequisites/iam-role';
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
} from '../utils/test-resources';

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
