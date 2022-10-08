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
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
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
  readonly cloudWatchEncryptionKey: cdk.aws_kms.IKey;
  /**
   * Custom resource lambda log group encryption key
   */
  readonly constructLoggingKmsKey: cdk.aws_kms.IKey;
  /**
   * Custom resource lambda log retention in days
   */
  readonly logRetentionInDays: number;
}

export class SsmSessionManagerSettings extends Construct {
  readonly id: string;

  constructor(scope: Construct, id: string, props: SsmSessionManagerSettingsProps) {
    super(scope, id);

    const sessionManagerEC2PolicyDocument = new cdk.aws_iam.PolicyDocument({
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
      const logGroupName = 'aws-accelerator-sessionmanager-logs';
      const sessionManagerLogGroup = new cdk.aws_logs.LogGroup(this, 'SessionManagerCloudWatchLogGroup', {
        retention: RetentionDays.TEN_YEARS,
        logGroupName: logGroupName,
        encryptionKey: props.cloudWatchEncryptionKey,
      });
      sessionManagerLogGroupName = sessionManagerLogGroup.logGroupName;

      //Build Session Manager EC2 IAM Policy Document to allow writing to CW logs
      sessionManagerEC2PolicyDocument.addStatements(
        new cdk.aws_iam.PolicyStatement({
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['logs:DescribeLogGroups'],
          resources: [
            `arn:${cdk.Stack.of(this).partition}:logs:${cdk.Stack.of(this).region}:${
              cdk.Stack.of(this).account
            }:log-group:*`,
          ],
        }),
        new cdk.aws_iam.PolicyStatement({
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['logs:CreateLogStream', 'logs:PutLogEvents', 'logs:DescribeLogStreams', 'logs:DescribeLogGroups'],
          resources: [
            `arn:${cdk.Stack.of(this).partition}:logs:${cdk.Stack.of(this).region}:${
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
        //Build Session Manager EC2 IAM Policy Document to allow writing to S3
        sessionManagerEC2PolicyDocument.addStatements(
          new cdk.aws_iam.PolicyStatement({
            effect: cdk.aws_iam.Effect.ALLOW,
            actions: ['s3:PutObject', 's3:PutObjectAcl'],
            resources: [
              `arn:${cdk.Stack.of(this).partition}:s3:::${props.s3BucketName}/${
                props.s3KeyPrefix ? props.s3KeyPrefix + '/*' : '*'
              }`,
            ],
          }),
          new cdk.aws_iam.PolicyStatement({
            effect: cdk.aws_iam.Effect.ALLOW,
            actions: ['s3:GetEncryptionConfiguration'],
            resources: [`arn:${cdk.Stack.of(this).partition}:s3:::${props.s3BucketName}`],
          }),
          new cdk.aws_iam.PolicyStatement({
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
      alias: 'accelerator/sessionmanager-logs/session',
    });

    //Build Session Manager EC2 IAM Policy Document to allow kms action for session key
    sessionManagerEC2PolicyDocument.addStatements(
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['kms:Decrypt'],
        resources: [sessionManagerSessionCmk.keyArn],
      }),
    );

    const sessionManagerEC2Policy = new cdk.aws_iam.ManagedPolicy(this, 'SessionManagerEC2Policy', {
      document: sessionManagerEC2PolicyDocument,
      managedPolicyName: `AWSAccelerator-SessionManagerLogging-${cdk.Stack.of(this).region}`,
    });

    //Create an EC2 role that can be used for Session Manager
    const sessionManagerEC2Role = new cdk.aws_iam.Role(this, 'SessionManagerEC2Role', {
      assumedBy: new cdk.aws_iam.ServicePrincipal(`ec2.${cdk.Stack.of(this).urlSuffix}`),
      description: 'IAM Role for an EC2 configured for Session Manager Logging',
      managedPolicies: [sessionManagerEC2Policy],
      roleName: `AWSAccelerator-SessionManagerEC2Role-${cdk.Stack.of(this).region}`,
    });

    //Create an EC2 instance profile
    new cdk.aws_iam.CfnInstanceProfile(this, 'SessionManagerEC2InstanceProfile', {
      roles: [sessionManagerEC2Role.roleName],
      instanceProfileName: `AWSAccelerator-SessionManagerEc2Role-${cdk.Stack.of(this).region}`,
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

    //Create an IAM Policy for users to be able to use Session Manager with KMS encryption
    new cdk.aws_iam.ManagedPolicy(this, 'SessionManagerUserKMSPolicy', {
      document: sessionManagerUserPolicyDocument,
      managedPolicyName: `AWSAccelerator-SessionManagerUserKMS-${cdk.Stack.of(this).region}`,
    });

    //
    // Function definition for the custom resource
    //
    const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, 'Custom::SessionManagerLogging', {
      codeDirectory: path.join(__dirname, 'session-manager-settings/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_14_X,
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
