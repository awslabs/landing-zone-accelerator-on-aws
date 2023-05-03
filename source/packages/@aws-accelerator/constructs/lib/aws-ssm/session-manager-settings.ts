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

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
const path = require('path');

/**
 * Construction properties for an S3 Bucket object.
 */
export interface SsmSessionManagerSettingsProps {
  readonly s3BucketName?: string;
  readonly s3KeyPrefix?: string;
  readonly s3BucketKeyArn?: string;
  readonly sendToS3: boolean;
  readonly sendToCloudWatchLogs: boolean;
  readonly cloudWatchEncryptionEnabled: boolean;
  readonly attachPolicyToIamRoles?: string[];
  readonly cloudWatchEncryptionKey: cdk.aws_kms.IKey;
  readonly region: string;
  /**
   * Custom resource lambda log group encryption key
   */
  readonly constructLoggingKmsKey: cdk.aws_kms.IKey;
  /**
   * Custom resource lambda log retention in days
   */
  readonly logRetentionInDays: number;
  /**
   * Accelerator Prefix
   */
  readonly acceleratorPrefix: string;
}

export class SsmSessionManagerSettings extends Construct {
  readonly id: string;

  constructor(scope: Construct, id: string, props: SsmSessionManagerSettingsProps) {
    super(scope, id);

    // Regional policy document
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

    const sessionManagerRegionEC2Policy = new cdk.aws_iam.Policy(this, `SessionPolicy${props.region}`, {
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

    let sessionManagerLogGroupName = '';
    if (props.sendToCloudWatchLogs) {
      // Per region CloudWatch Logs
      const logGroupName = 'aws-accelerator-sessionmanager-logs';
      const sessionManagerLogGroup = new cdk.aws_logs.LogGroup(this, 'SessionManagerCloudWatchLogGroup', {
        retention: props.logRetentionInDays,
        logGroupName: logGroupName,
        encryptionKey: props.cloudWatchEncryptionKey,
      });
      sessionManagerLogGroupName = sessionManagerLogGroup.logGroupName;

      // Build Session Manager EC2 IAM Policy Document to allow writing to CW logs
      sessionManagerRegionalEC2PolicyDocument.addStatements(
        new cdk.aws_iam.PolicyStatement({
          sid: 'CloudWatchDescribe',
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['logs:DescribeLogGroups'],
          resources: [
            `arn:${cdk.Stack.of(this).partition}:logs:${props.region}:${cdk.Stack.of(this).account}:log-group:*`,
          ],
        }),
        new cdk.aws_iam.PolicyStatement({
          sid: 'CloudWatchLogs',
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['logs:CreateLogStream', 'logs:PutLogEvents', 'logs:DescribeLogStreams', 'logs:DescribeLogGroups'],
          resources: [
            `arn:${cdk.Stack.of(this).partition}:logs:${props.region}:${
              cdk.Stack.of(this).account
            }:log-group:${logGroupName}:*`,
          ],
        }),
      );

      sessionManagerRegionEC2Policy.addStatements(
        new cdk.aws_iam.PolicyStatement({
          sid: 'CloudWatchDescribe',
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['logs:DescribeLogGroups'],
          resources: [
            `arn:${cdk.Stack.of(this).partition}:logs:${props.region}:${cdk.Stack.of(this).account}:log-group:*`,
          ],
        }),
        new cdk.aws_iam.PolicyStatement({
          sid: 'CloudWatchLogs',
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['logs:CreateLogStream', 'logs:PutLogEvents', 'logs:DescribeLogStreams', 'logs:DescribeLogGroups'],
          resources: [
            `arn:${cdk.Stack.of(this).partition}:logs:${props.region}:${
              cdk.Stack.of(this).account
            }:log-group:${logGroupName}:*`,
          ],
        }),
      );
    }

    if (props.sendToS3) {
      if (!props.s3BucketKeyArn || !props.s3BucketName) {
        throw new Error('Bucket Key Arn and Bucket Name must be provided');
      } else {
        // Build Session Manager EC2 IAM Policy Document to allow writing to S3
        // Central Logs Bucket
        sessionManagerRegionalEC2PolicyDocument.addStatements(
          new cdk.aws_iam.PolicyStatement({
            sid: 'S3CentralLogs',
            effect: cdk.aws_iam.Effect.ALLOW,
            actions: ['s3:PutObject', 's3:PutObjectAcl'],
            resources: [
              `arn:${cdk.Stack.of(this).partition}:s3:::${props.s3BucketName}/${
                props.s3KeyPrefix ? props.s3KeyPrefix + '/*' : '*'
              }`,
            ],
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

        sessionManagerRegionEC2Policy.addStatements(
          new cdk.aws_iam.PolicyStatement({
            sid: 'S3CentralLogs',
            effect: cdk.aws_iam.Effect.ALLOW,
            actions: ['s3:PutObject', 's3:PutObjectAcl'],
            resources: [
              `arn:${cdk.Stack.of(this).partition}:s3:::${props.s3BucketName}/${
                props.s3KeyPrefix ? props.s3KeyPrefix + '/*' : '*'
              }`,
            ],
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

    let sessionManagerSessionCmk: cdk.aws_kms.Key | undefined = undefined;
    sessionManagerSessionCmk = new cdk.aws_kms.Key(this, 'SessionManagerSessionKey', {
      enableKeyRotation: true,
      description: 'AWS Accelerator Session Manager Session Encryption',
    });

    sessionManagerSessionCmk.addAlias('accelerator/sessionmanager-logs/session');

    //Build Session Manager EC2 IAM Policy Document to allow kms action for session key
    sessionManagerRegionalEC2PolicyDocument.addStatements(
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['kms:Decrypt'],
        resources: [sessionManagerSessionCmk.keyArn],
      }),
    );

    sessionManagerRegionEC2Policy.addStatements(
      new cdk.aws_iam.PolicyStatement({
        sid: 'sessionKey',
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['kms:Decrypt'],
        resources: [sessionManagerSessionCmk.keyArn],
      }),
    );

    const sessionManagerRegionalEC2ManagedPolicy = new cdk.aws_iam.ManagedPolicy(this, 'SessionManagerEC2Policy', {
      document: sessionManagerRegionalEC2PolicyDocument,
      managedPolicyName: `${props.acceleratorPrefix}-SessionManagerLogging-${props.region}`,
    });

    // Attach policies to configured roles
    for (const iamRoleName of props.attachPolicyToIamRoles ?? []) {
      const role = cdk.aws_iam.Role.fromRoleArn(
        this,
        `AcceleratorSessionManager-${iamRoleName}`,
        `arn:${cdk.Stack.of(this).partition}:iam::${cdk.Stack.of(this).account}:role/${iamRoleName}`,
        { defaultPolicyName: `Region${props.region}` },
      );
      role.attachInlinePolicy(sessionManagerRegionEC2Policy);
    }

    // Create an EC2 role that can be used for Session Manager
    const sessionManagerEC2Role = new cdk.aws_iam.Role(this, 'SessionManagerEC2Role', {
      assumedBy: new cdk.aws_iam.ServicePrincipal(`ec2.${cdk.Stack.of(this).urlSuffix}`),
      description: 'IAM Role for an EC2 configured for Session Manager Logging',
      managedPolicies: [sessionManagerRegionalEC2ManagedPolicy],
      roleName: `${props.acceleratorPrefix}-SessionManagerEC2Role-${props.region}`,
    });

    // Create an EC2 instance profile
    new cdk.aws_iam.CfnInstanceProfile(this, 'SessionManagerEC2InstanceProfile', {
      roles: [sessionManagerEC2Role.roleName],
      instanceProfileName: `${props.acceleratorPrefix}-SessionManagerEc2Role-${props.region}`,
    });

    const sessionManagerUserPolicyDocument = new cdk.aws_iam.PolicyDocument({
      statements: [
        new cdk.aws_iam.PolicyStatement({
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['kms:Decrypt', 'kms:GenerateDataKey'],
          resources: [sessionManagerSessionCmk.keyArn],
        }),
      ],
    });

    // Create an IAM Policy for users to be able to use Session Manager with KMS encryption
    new cdk.aws_iam.ManagedPolicy(this, 'SessionManagerUserKMSPolicy', {
      document: sessionManagerUserPolicyDocument,
      managedPolicyName: `${props.acceleratorPrefix}-SessionManagerUserKMS-${props.region}`,
    });

    //
    // Function definition for the custom resource
    //
    const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, 'Custom::SessionManagerLogging', {
      codeDirectory: path.join(__dirname, 'session-manager-settings/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_16_X,
      policyStatements: [
        {
          Effect: 'Allow',
          Action: ['ssm:DescribeDocument', 'ssm:CreateDocument', 'ssm:UpdateDocument'],
          Resource: '*',
        },
      ],
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: 'Custom::SsmSessionManagerSettings',
      serviceToken: provider.serviceToken,
      properties: {
        s3BucketName: props.s3BucketName,
        s3KeyPrefix: props.s3KeyPrefix,
        s3EncryptionEnabled: props.sendToS3, //set to true if sending to S3
        cloudWatchLogGroupName: sessionManagerLogGroupName,
        cloudWatchEncryptionEnabled: props.cloudWatchEncryptionEnabled,
        kmsKeyId: sessionManagerSessionCmk.keyId,
      },
    });

    /**
     * Singleton pattern to define the log group for the singleton function
     * in the stack
     */
    const stack = cdk.Stack.of(scope);
    const logGroup =
      (stack.node.tryFindChild(`${provider.node.id}LogGroup`) as cdk.aws_logs.LogGroup) ??
      new cdk.aws_logs.LogGroup(stack, `${provider.node.id}LogGroup`, {
        logGroupName: `/aws/lambda/${(provider.node.findChild('Handler') as cdk.aws_lambda.CfnFunction).ref}`,
        retention: props.logRetentionInDays,
        encryptionKey: props.constructLoggingKmsKey,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });
    resource.node.addDependency(logGroup);

    this.id = resource.ref;
  }
}
