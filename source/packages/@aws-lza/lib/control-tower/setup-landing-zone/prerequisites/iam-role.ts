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
import path from 'path';

import {
  AttachRolePolicyCommand,
  IAMClient,
  CreateRoleCommand,
  PutRolePolicyCommand,
  waitUntilRoleExists,
  GetRoleCommand,
  NoSuchEntityException,
  ListRolePoliciesCommand,
  DeleteRolePolicyCommand,
  ListAttachedRolePoliciesCommand,
  UpdateAssumeRolePolicyCommand,
  type Role,
} from '@aws-sdk/client-iam';

import { setRetryStrategy } from '../../../../common/functions';
import { createLogger } from '../../../../common/logger';
import { AssumeRoleCredentialType } from '../../../../common/resources';
import { throttlingBackOff } from '../../../../common/throttle';
import { MODULE_EXCEPTIONS } from '../../../../common/enums';

/**
 * IamRole abstract class to create AWS Control Tower Landing Zone IAM roles.
 *
 * @remarks
 * If the following IAM roles do not exist, they will be created. If a role is already present, it is reused: its
 * trust policy and the policies AWS Control Tower Landing Zone requires are re-applied onto the existing role. This
 * keeps the step idempotent, so a run that failed after the roles were created can be retried without manual
 * cleanup. The roles are never deleted, so tags, permissions boundary, role ARN and any policies an operator
 * attached deliberately are preserved.
 *
 * - AWSControlTowerAdmin
 * - AWSControlTowerCloudTrailRole
 * - AWSControlTowerStackSetRole
 * - AWSControlTowerConfigAggregatorRoleForOrganizations
 *
 * Please review the [document](https://docs.aws.amazon.com/controltower/latest/userguide/lz-api-prereques.html) for more information.
 */
export abstract class IamRole {
  private static logger = createLogger([path.parse(path.basename(__filename)).name]);

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
   * Path AWS Control Tower Landing Zone service roles are created under
   */
  private static readonly controlTowerRolePath = '/service-role/';

  /**
   * Function to get the given role, or undefined when it does not exist
   * @param client {@link IAMClient}
   * @param roleName string
   * @returns role {@link Role} | undefined
   */
  private static async getRole(client: IAMClient, roleName: string): Promise<Role | undefined> {
    try {
      const response = await throttlingBackOff(() =>
        client.send(
          new GetRoleCommand({
            RoleName: roleName,
          }),
        ),
      );

      if (!response.Role) {
        throw new Error(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: GetRoleCommand did not return Role object`);
      }

      if (response.Role.RoleName === roleName) {
        return response.Role;
      }
      return undefined;
    } catch (e: unknown) {
      if (e instanceof NoSuchEntityException) {
        return undefined;
      }
      throw e;
    }
  }

  /**
   * Function to check if given role exists
   * @param client {@link IAMClient}
   * @param roleName string
   * @returns status boolean
   */
  private static async roleExists(client: IAMClient, roleName: string): Promise<boolean> {
    return (await IamRole.getRole(client, roleName)) !== undefined;
  }

  /**
   * Function to build the trust policy document for an AWS Control Tower Landing Zone service role.
   *
   * @remarks
   * Shared by role creation and by trust policy reconciliation of an existing role so that both paths always
   * produce an identical document.
   * @param assumeRolePrincipal string
   * @returns policyDocument string
   */
  private static getAssumeRolePolicyDocument(assumeRolePrincipal: string): string {
    return `{"Version": "2012-10-17", "Statement": [{"Effect": "Allow", "Principal": {"Service": [ "${assumeRolePrincipal}"]}, "Action": "sts:AssumeRole"}]}`;
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
          Path: IamRole.controlTowerRolePath,
          AssumeRolePolicyDocument: IamRole.getAssumeRolePolicyDocument(assumeRolePrincipal),
        }),
      ),
    );
    const waiterState = await waitUntilRoleExists({ client, maxWaitTime: 300 }, { RoleName: roleName });
    if (waiterState.state !== 'SUCCESS') {
      throw new Error(`AWS Control Tower Landing Zone role ${roleName} creation not completed!!`);
    }
  }

  /**
   * Function to make sure the given AWS Control Tower Landing Zone role exists with the required trust policy.
   *
   * @remarks
   * When the role is absent it is created. When it is already present it is reused and only its trust policy is
   * re-applied, which makes this step safe to retry after a partially completed run. The role is deliberately not
   * deleted and re-created: deleting it would discard tags, permissions boundary, description, max session duration
   * and any policy an operator attached on purpose, and a failure between the delete and the create would leave the
   * account with no role at all.
   *
   * A role that already exists under a path other than {@link IamRole.controlTowerRolePath} is reported instead of
   * being moved, because moving it changes the role ARN and would break anything still referencing it.
   * @param client {@link IAMClient}
   * @param roleName string
   * @param assumeRolePrincipal string
   */
  private static async ensureRole(client: IAMClient, roleName: string, assumeRolePrincipal: string): Promise<void> {
    const existingRole = await IamRole.getRole(client, roleName);

    if (!existingRole) {
      await IamRole.createRole(client, roleName, assumeRolePrincipal);
      return;
    }

    if (existingRole.Path !== IamRole.controlTowerRolePath) {
      throw new Error(
        `${MODULE_EXCEPTIONS.INVALID_INPUT}: Existing AWS Control Tower Landing Zone role ${roleName} is under path "${existingRole.Path}" but AWS Control Tower Landing Zone requires path "${IamRole.controlTowerRolePath}". Delete or rename the existing role and retry, the solution will not move it because that changes the role ARN.`,
      );
    }

    IamRole.logger.info(
      `Existing AWS Control Tower Landing Zone role ${roleName} found, reusing it and re-applying its trust policy.`,
    );
    await throttlingBackOff(() =>
      client.send(
        new UpdateAssumeRolePolicyCommand({
          RoleName: roleName,
          PolicyDocument: IamRole.getAssumeRolePolicyDocument(assumeRolePrincipal),
        }),
      ),
    );
  }

  /**
   * Function to create or reconcile the given AWS Control Tower Landing Zone IAM role and set policy according to
   * AWS Control Tower Landing Zone requirement.
   *
   * @remarks
   * Safe to run against a role that already exists. `PutRolePolicy` replaces an inline policy of the same name and
   * `AttachRolePolicy` succeeds when the managed policy is already attached, so the policy calls below are
   * idempotent and need no prior read.
   * @param client {@link IAMClient}
   * @param partition string
   * @param roleName string
   */
  private static async createControlTowerRole(client: IAMClient, partition: string, roleName: string): Promise<void> {
    switch (roleName) {
      case 'AWSControlTowerAdmin':
        await IamRole.ensureRole(client, roleName, 'controltower.amazonaws.com');
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
        await IamRole.ensureRole(client, roleName, 'cloudtrail.amazonaws.com');
        await throttlingBackOff(() =>
          client.send(
            new AttachRolePolicyCommand({
              RoleName: roleName,
              PolicyArn: `arn:${partition}:iam::aws:policy/service-role/AWSControlTowerCloudTrailRolePolicy`,
            }),
          ),
        );
        break;
      case 'AWSControlTowerStackSetRole':
        await IamRole.ensureRole(client, roleName, 'cloudformation.amazonaws.com');
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
        await IamRole.ensureRole(client, roleName, 'config.amazonaws.com');
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

    IamRole.logger.info(`AWS Control Tower Landing Zone role ${roleName} configured successfully.`);
  }

  /**
   * Function to update AWSControlTowerCloudTrailRole by replacing inline policies with managed policy
   * @param partition string
   * @param region string
   * @param solutionId string | undefined
   * @param credentials {@link IAssumeRoleCredential} | undefined
   */
  public static async updateCloudTrailRolePolicy(
    partition: string,
    region: string,
    solutionId?: string,
    credentials?: AssumeRoleCredentialType,
  ): Promise<void> {
    const roleName = 'AWSControlTowerCloudTrailRole';
    const managedPolicyArn = `arn:${partition}:iam::aws:policy/service-role/AWSControlTowerCloudTrailRolePolicy`;

    const client: IAMClient = new IAMClient({
      region: region,
      customUserAgent: solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: credentials,
    });

    IamRole.logger.info(`Checking if role ${roleName} exists and needs policy update.`);

    // Check if role exists
    const roleExists = await IamRole.roleExists(client, roleName);
    if (!roleExists) {
      const message = `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Role ${roleName} does not exist, skipping policy update.`;
      IamRole.logger.warn(message);
      throw new Error(message);
    }

    // Check if managed policy is already attached
    const attachedPoliciesResponse = await throttlingBackOff(() =>
      client.send(
        new ListAttachedRolePoliciesCommand({
          RoleName: roleName,
        }),
      ),
    );

    const hasManagedPolicy = attachedPoliciesResponse.AttachedPolicies?.some(
      policy => policy.PolicyArn === managedPolicyArn,
    );

    if (hasManagedPolicy) {
      IamRole.logger.info(`Role ${roleName} already has the managed policy attached.`);
      return;
    }

    // List and delete all inline policies
    const inlinePoliciesResponse = await throttlingBackOff(() =>
      client.send(
        new ListRolePoliciesCommand({
          RoleName: roleName,
        }),
      ),
    );

    if (inlinePoliciesResponse.PolicyNames && inlinePoliciesResponse.PolicyNames.length > 0) {
      IamRole.logger.info(
        `Found ${inlinePoliciesResponse.PolicyNames.length} inline policy(ies) on role ${roleName}, removing them.`,
      );

      for (const policyName of inlinePoliciesResponse.PolicyNames) {
        await throttlingBackOff(() =>
          client.send(
            new DeleteRolePolicyCommand({
              RoleName: roleName,
              PolicyName: policyName,
            }),
          ),
        );
        IamRole.logger.info(`Deleted inline policy ${policyName} from role ${roleName}.`);
      }
    }

    // Attach the managed policy
    await throttlingBackOff(() =>
      client.send(
        new AttachRolePolicyCommand({
          RoleName: roleName,
          PolicyArn: managedPolicyArn,
        }),
      ),
    );

    IamRole.logger.info(`Successfully attached managed policy ${managedPolicyArn} to role ${roleName}.`);
  }

  /**
   * Function to create AWS Control Tower Landing Zone roles
   *
   * @remarks
   * Idempotent. Roles that are missing are created and roles that already exist are reconciled in place, so a run
   * that failed after this step can be retried without deleting the roles by hand.
   * @param partition string
   * @param region string
   * @param solutionId string | undefined
   * @param credentials {@link IAssumeRoleCredential} | undefined
   */
  public static async createControlTowerRoles(
    partition: string,
    region: string,
    solutionId?: string,
    credentials?: AssumeRoleCredentialType,
  ): Promise<void> {
    const client: IAMClient = new IAMClient({
      region: region,
      customUserAgent: solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: credentials,
    });

    for (const roleName of IamRole.requiredControlTowerRoleNames) {
      await IamRole.createControlTowerRole(client, partition, roleName);
    }
  }
}
