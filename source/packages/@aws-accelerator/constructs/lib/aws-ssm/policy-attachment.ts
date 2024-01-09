/**
 *  Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import { RoleSetConfig } from '@aws-accelerator/config';
import { AcceleratorStack } from '../../../accelerator/lib/stacks/accelerator-stack';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

/**
 * Construction properties Session Manager Policy
 */
export interface SsmSessionManagerPolicyProps {
  readonly s3BucketName?: string;
  readonly s3BucketKeyArn?: string;
  readonly sendToS3: boolean;
  readonly sendToCloudWatchLogs: boolean;
  readonly homeRegion: string;
  readonly roleSets?: RoleSetConfig[];
  readonly attachPolicyToIamRoles?: string[];
  readonly region: string;
  readonly enabledRegions: string[];
  readonly cloudWatchLogGroupList: string[] | undefined;
  readonly sessionManagerCloudWatchLogGroupList: string[] | undefined;
  readonly s3BucketList: string[] | undefined;
  readonly prefixes: { accelerator: string; ssmLog: string };
  readonly ssmKeyDetails: { alias: string; description: string };
}

export class SsmSessionManagerPolicy extends Construct {
  constructor(scope: Construct, id: string, props: SsmSessionManagerPolicyProps) {
    super(scope, id);

    //IAM Policy Document
    const sessionManagerRegionalEC2PolicyDocument = new cdk.aws_iam.PolicyDocument({
      statements: [
        new cdk.aws_iam.PolicyStatement({
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: [
            'ssmmessages:CreateControlChannel',
            'ssmmessages:CreateDataChannel',
            'ssmmessages:OpenControlChannel',
            'ssmmessages:OpenDataChannel',
            'ssm:UpdateInstanceInformation',
          ],
          resources: ['*'],
        }),
      ],
    });

    const sessionManagerEC2Policy = new cdk.aws_iam.ManagedPolicy(this, `SessionManagerPolicy`, {
      statements: [
        new cdk.aws_iam.PolicyStatement({
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: [
            'ssmmessages:CreateControlChannel',
            'ssmmessages:CreateDataChannel',
            'ssmmessages:OpenControlChannel',
            'ssmmessages:OpenDataChannel',
            'ssm:UpdateInstanceInformation',
          ],
          resources: ['*'],
        }),
      ],
    });

    const sessionManagerEC2ManagedPolicy = new cdk.aws_iam.ManagedPolicy(this, 'SessionManagerEC2Policy', {
      document: sessionManagerRegionalEC2PolicyDocument,
      managedPolicyName: `${props.prefixes.accelerator}-SessionManagerLogging`,
    });

    // Create an EC2 role that can be used for Session Manager
    const sessionManagerEC2Role = new cdk.aws_iam.Role(this, 'SessionManagerEC2Role', {
      assumedBy: new cdk.aws_iam.ServicePrincipal(`ec2.${cdk.Stack.of(this).urlSuffix}`),
      description: 'IAM Role for an EC2 configured for Session Manager Logging',
      managedPolicies: [sessionManagerEC2ManagedPolicy],
      roleName: `${props.prefixes.accelerator}-SessionManagerEC2Role`,
    });

    // Create an EC2 instance profile
    new cdk.aws_iam.CfnInstanceProfile(this, 'SessionManagerEC2InstanceProfile', {
      roles: [sessionManagerEC2Role.roleName],
      instanceProfileName: `${props.prefixes.accelerator}-SessionManagerEc2Role`,
    });

    if (props.sendToCloudWatchLogs) {
      sessionManagerEC2Policy.addStatements(
        new cdk.aws_iam.PolicyStatement({
          sid: 'CloudWatchDescribe',
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['logs:DescribeLogGroups'],
          resources: props.sessionManagerCloudWatchLogGroupList,
        }),
        new cdk.aws_iam.PolicyStatement({
          sid: 'CloudWatchLogs',
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['logs:CreateLogStream', 'logs:PutLogEvents', 'logs:DescribeLogStreams', 'logs:DescribeLogGroups'],
          resources: props.cloudWatchLogGroupList,
        }),
      );
      sessionManagerRegionalEC2PolicyDocument.addStatements(
        new cdk.aws_iam.PolicyStatement({
          sid: 'CloudWatchDescribe',
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['logs:DescribeLogGroups'],
          resources: props.sessionManagerCloudWatchLogGroupList,
        }),
        new cdk.aws_iam.PolicyStatement({
          sid: 'CloudWatchLogs',
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['logs:CreateLogStream', 'logs:PutLogEvents', 'logs:DescribeLogStreams', 'logs:DescribeLogGroups'],
          resources: props.cloudWatchLogGroupList,
        }),
      );
    }

    if (props.sendToS3) {
      if (!props.s3BucketKeyArn || !props.s3BucketName) {
        throw new Error('Bucket Key Arn and Bucket Name must be provided');
      } else {
        // Build Session Manager EC2 IAM Policy Document to allow writing to S3 Central Logs Bucket
        sessionManagerEC2Policy.addStatements(
          new cdk.aws_iam.PolicyStatement({
            sid: 'S3CentralLogs',
            effect: cdk.aws_iam.Effect.ALLOW,
            actions: ['s3:PutObject', 's3:PutObjectAcl'],
            resources: props.s3BucketList,
          }),
          new cdk.aws_iam.PolicyStatement({
            sid: 'S3CentralLogsEncryptionConfig',
            effect: cdk.aws_iam.Effect.ALLOW,
            actions: ['s3:GetEncryptionConfiguration'],
            resources: [`arn:${cdk.Stack.of(this).partition}:s3:::${props.s3BucketName}`],
          }),
          new cdk.aws_iam.PolicyStatement({
            sid: 'S3CentralLogsEncryption',
            effect: cdk.aws_iam.Effect.ALLOW,
            actions: ['kms:Decrypt', 'kms:GenerateDataKey'],
            resources: [props.s3BucketKeyArn],
          }),
        );
        sessionManagerRegionalEC2PolicyDocument.addStatements(
          new cdk.aws_iam.PolicyStatement({
            sid: 'S3CentralLogs',
            effect: cdk.aws_iam.Effect.ALLOW,
            actions: ['s3:PutObject', 's3:PutObjectAcl'],
            resources: props.s3BucketList,
          }),
          new cdk.aws_iam.PolicyStatement({
            sid: 'S3CentralLogsEncryptionConfig',
            effect: cdk.aws_iam.Effect.ALLOW,
            actions: ['s3:GetEncryptionConfiguration'],
            resources: [`arn:${cdk.Stack.of(this).partition}:s3:::${props.s3BucketName}`],
          }),
          new cdk.aws_iam.PolicyStatement({
            sid: 'S3CentralLogsEncryption',
            effect: cdk.aws_iam.Effect.ALLOW,
            actions: ['kms:Decrypt', 'kms:GenerateDataKey'],
            resources: [props.s3BucketKeyArn],
          }),
        );
      }
    }

    //Build Session Manager EC2 IAM Policy Document to allow kms action for session key
    sessionManagerEC2Policy.addStatements(
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['kms:Decrypt'],
        resources: [
          `arn:${cdk.Stack.of(this).partition}:kms:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:key/*`,
        ],
        conditions: {
          'ForAllValues:StringLike': {
            'kms:ResourceAliases': [props.ssmKeyDetails.alias],
          },
        },
      }),
    );

    sessionManagerRegionalEC2PolicyDocument.addStatements(
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['kms:Decrypt'],
        resources: [
          `arn:${cdk.Stack.of(this).partition}:kms:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:key/*`,
        ],
        conditions: {
          'ForAllValues:StringLike': {
            'kms:ResourceAliases': [props.ssmKeyDetails.alias],
          },
        },
      }),
    );

    // Attach policies to configured roles
    for (const iamRoleName of props.attachPolicyToIamRoles ?? []) {
      if (this.isRoleInAccount(iamRoleName, props.roleSets ?? [], props.homeRegion)) {
        const role = cdk.aws_iam.Role.fromRoleArn(
          this,
          `AcceleratorSessionManager-${iamRoleName}`,
          `arn:${cdk.Stack.of(this).partition}:iam::${cdk.Stack.of(this).account}:role/${iamRoleName}`,
        );
        sessionManagerEC2ManagedPolicy.attachToRole(role);
      }
    }
  }

  isRoleInAccount(roleName: string, roleSets: RoleSetConfig[], homeRegion: string): boolean {
    if (!roleSets) {
      return false;
    }

    const stack: AcceleratorStack = cdk.Stack.of(this) as AcceleratorStack;

    const roleExists =
      roleSets?.filter(roleSet => {
        const roleNames = roleSet.roles.map(role => role.name);

        return (
          stack.isIncluded(roleSet.deploymentTargets) &&
          roleNames.includes(roleName) &&
          cdk.Stack.of(this).region === homeRegion
        );
      }) ?? [];

    return roleExists.length > 0;
  }
}
