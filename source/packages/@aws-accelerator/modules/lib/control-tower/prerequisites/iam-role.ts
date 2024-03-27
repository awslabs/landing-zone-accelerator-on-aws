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

import {
  AttachRolePolicyCommand,
  IAMClient,
  CreateRoleCommand,
  PutRolePolicyCommand,
  waitUntilRoleExists,
  GetRoleCommand,
  NoSuchEntityException,
} from '@aws-sdk/client-iam';

import path from 'path';
import * as winston from 'winston';

import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import { createLogger } from '@aws-accelerator/utils/lib/logger';
import { setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';
import { AssumeRoleCredentialType } from '../../../common/resources';

/**
 * IamRole abstract class to create AWS Control Tower Landing Zone IAM roles.
 *
 * @remarks
 * If the following IAM roles do not exist, they will be created. If these are roles are present, solution will delete these roles and re-create as per AWS Control Tower Landing Zone requirement.
 *
 * - AWSControlTowerAdmin
 * - AWSControlTowerCloudTrailRole
 * - AWSControlTowerStackSetRole
 * - AWSControlTowerConfigAggregatorRoleForOrganizations
 *
 * Please review the [document](https://docs.aws.amazon.com/controltower/latest/userguide/lz-api-prereques.html) for more information.
 */
export abstract class IamRole {
  private static logger: winston.Logger = createLogger([path.parse(path.basename(__filename)).name]);

  /**
   * List of required AWS Control Tower Landing Zone service roles
   */
  private static requiredControlTowerRoleNames = [
    'AWSControlTowerAdmin',
    'AWSControlTowerCloudTrailRole',
    'AWSControlTowerStackSetRole',
    'AWSControlTowerConfigAggregatorRoleForOrganizations',
  ];

  /**
   * Function to check if given role exists
   * @param client {@link IAMClient}
   * @param roleName string
   * @returns status boolean
   */
  private static async isRoleExists(client: IAMClient, roleName: string): Promise<boolean> {
    try {
      const response = await throttlingBackOff(() =>
        client.send(
          new GetRoleCommand({
            RoleName: roleName,
          }),
        ),
      );

      if (response.Role?.RoleName === roleName) {
        return true;
      }
      return false;
    } catch (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      e: any
    ) {
      if (e instanceof NoSuchEntityException) {
        return false;
      }
      throw e;
    }
  }

  /**
   * Function to check if AWS Control Tower Landing Zone roles exists
   * @param client {@link IAMClient}
   */
  private static async areControlTowerRoleExists(client: IAMClient): Promise<{ status: boolean; message: string[] }> {
    const roleNames: string[] = [];

    for (const roleName of IamRole.requiredControlTowerRoleNames) {
      if (await IamRole.isRoleExists(client, roleName)) {
        roleNames.push(roleName);
      }
    }

    if (roleNames.length > 0) {
      return { status: true, message: roleNames };
    }

    return { status: false, message: [] };
  }

  /**
   * Function to create IAM Role
   * @param client {@link IAMClient}
   * @param roleName string
   * @param assumeRolePrincipal string
   */
  private static async createRole(client: IAMClient, roleName: string, assumeRolePrincipal: string): Promise<void> {
    IamRole.logger.info(`Creating AWS Control Tower Landing Zone role ${roleName}.`);
    await throttlingBackOff(() =>
      client.send(
        new CreateRoleCommand({
          RoleName: roleName,
          Path: '/service-role/',
          AssumeRolePolicyDocument: `{"Version": "2012-10-17", "Statement": [{"Effect": "Allow", "Principal": {"Service": [ "${assumeRolePrincipal}"]}, "Action": "sts:AssumeRole"}]}`,
        }),
      ),
    );
    const waiterState = await waitUntilRoleExists({ client, maxWaitTime: 300 }, { RoleName: roleName });
    if (waiterState.state !== 'SUCCESS') {
      throw new Error(`AWS Control Tower Landing Zone role ${roleName} creation not completed!!`);
    }
  }

  /**
   * Function to create given AWS Control Tower Landing Zone IAM role and set policy according to AWS Control Tower Landing Zone requirement.
   * @param client {@link IAMClient}
   * @param partition string
   * @param roleName string
   */
  private static async createControlTowerRole(client: IAMClient, partition: string, roleName: string): Promise<void> {
    switch (roleName) {
      case 'AWSControlTowerAdmin':
        await IamRole.createRole(client, roleName, 'controltower.amazonaws.com');
        await throttlingBackOff(() =>
          client.send(
            new PutRolePolicyCommand({
              RoleName: roleName,
              PolicyName: 'AWSControlTowerAdminPolicy',
              PolicyDocument:
                '{"Version": "2012-10-17","Statement": [{"Action": "ec2:DescribeAvailabilityZones","Resource": "*","Effect": "Allow"}]}',
            }),
          ),
        );
        await throttlingBackOff(() =>
          client.send(
            new AttachRolePolicyCommand({
              RoleName: roleName,
              PolicyArn: `arn:${partition}:iam::aws:policy/service-role/AWSControlTowerServiceRolePolicy`,
            }),
          ),
        );
        break;
      case 'AWSControlTowerCloudTrailRole':
        await IamRole.createRole(client, roleName, 'cloudtrail.amazonaws.com');
        await throttlingBackOff(() =>
          client.send(
            new PutRolePolicyCommand({
              RoleName: roleName,
              PolicyName: 'AWSControlTowerCloudTrailRolePolicy',
              PolicyDocument: `{"Version": "2012-10-17","Statement": [{"Action": "logs:CreateLogStream","Resource": "arn:${partition}:logs:*:*:log-group:aws-controltower/CloudTrailLogs:*","Effect": "Allow"},{"Action": "logs:PutLogEvents","Resource": "arn:${partition}:logs:*:*:log-group:aws-controltower/CloudTrailLogs:*","Effect": "Allow"}]}`,
            }),
          ),
        );
        break;
      case 'AWSControlTowerStackSetRole':
        await IamRole.createRole(client, roleName, 'cloudformation.amazonaws.com');
        await throttlingBackOff(() =>
          client.send(
            new PutRolePolicyCommand({
              RoleName: roleName,
              PolicyName: 'AWSControlTowerStackSetRolePolicy',
              PolicyDocument: `{"Version": "2012-10-17","Statement": [{"Action": ["sts:AssumeRole"],"Resource": ["arn:${partition}:iam::*:role/AWSControlTowerExecution"],"Effect": "Allow"}]}`,
            }),
          ),
        );
        break;
      case 'AWSControlTowerConfigAggregatorRoleForOrganizations':
        await IamRole.createRole(client, roleName, 'config.amazonaws.com');
        await throttlingBackOff(() =>
          client.send(
            new AttachRolePolicyCommand({
              RoleName: roleName,
              PolicyArn: `arn:${partition}:iam::aws:policy/service-role/AWSConfigRoleForOrganizations`,
            }),
          ),
        );
        break;
    }

    IamRole.logger.info(`AWS Control Tower Landing Zone role ${roleName} created successfully.`);
  }

  /**
   * Function to create AWS Control Tower Landing Zone roles
   * @param partition string
   * @param region string
   * @param solutionId string
   * @param managementAccountCredentials {@link AssumeRoleCredentialType} | undefined
   */
  public static async createControlTowerRoles(
    partition: string,
    region: string,
    solutionId: string,
    managementAccountCredentials?: AssumeRoleCredentialType,
  ): Promise<void> {
    const client: IAMClient = new IAMClient({
      region: region,
      customUserAgent: solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: managementAccountCredentials,
    });

    const existingRoles = await IamRole.areControlTowerRoleExists(client);

    if (existingRoles.status && existingRoles.message.length > 0) {
      throw new Error(
        `There are existing AWS Control Tower Landing Zone roles "${existingRoles.message.join(
          ',',
        )}", the solution cannot deploy AWS Control Tower Landing Zone`,
      );
    }

    for (const roleName of IamRole.requiredControlTowerRoleNames) {
      await IamRole.createControlTowerRole(client, partition, roleName);
    }
  }
}
