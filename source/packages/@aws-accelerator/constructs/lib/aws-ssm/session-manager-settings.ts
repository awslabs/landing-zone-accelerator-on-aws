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

import { CUSTOM_RESOURCE_PROVIDER_RUNTIME } from '@aws-accelerator/utils/lib/lambda';
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
  /**
   * Custom resource lambda log group encryption key, when undefined default AWS managed key will be used
   */
  readonly cloudWatchEncryptionKey?: cdk.aws_kms.IKey;
  readonly region: string;
  readonly rolesInAccounts?: { account: string; region: string; parametersByPath: { [key: string]: string } }[];
  /**
   * Custom resource lambda log retention in days
   */
  readonly logRetentionInDays: number;
  /**
   * Accelerator and SSM Log Prefixes
   */
  readonly prefixes: { accelerator: string; ssmLog: string };
  /**
   * Accelerator CMK Details for SSM
   */
  readonly ssmKeyDetails: { alias: string; description: string };
}

export class SsmSessionManagerSettings extends Construct {
  readonly id: string;

  constructor(scope: Construct, id: string, props: SsmSessionManagerSettingsProps) {
    super(scope, id);

    let sessionManagerLogGroupName = '';
    if (props.sendToCloudWatchLogs) {
      const logGroupName = `${props.prefixes.accelerator}-sessionmanager-logs`;
      const sessionManagerLogGroup = new cdk.aws_logs.LogGroup(this, 'SessionManagerCloudWatchLogGroup', {
        retention: props.logRetentionInDays,
        logGroupName: logGroupName,
        encryptionKey: props.cloudWatchEncryptionKey,
      });
      sessionManagerLogGroupName = sessionManagerLogGroup.logGroupName;
    }

    let sessionManagerSessionCmk: cdk.aws_kms.Key | undefined = undefined;
    sessionManagerSessionCmk = new cdk.aws_kms.Key(this, 'SessionManagerSessionKey', {
      enableKeyRotation: true,
      description: props.ssmKeyDetails.description,
      alias: props.ssmKeyDetails.alias,
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
      managedPolicyName: `${props.prefixes.accelerator}-SessionManagerUserKMS-${props.region}`,
    });

    //
    // Function definition for the custom resource
    //
    const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, 'Custom::SessionManagerLogging', {
      codeDirectory: path.join(__dirname, 'session-manager-settings/dist'),
      runtime: CUSTOM_RESOURCE_PROVIDER_RUNTIME,
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
        encryptionKey: props.cloudWatchEncryptionKey,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });
    resource.node.addDependency(logGroup);

    this.id = resource.ref;
  }
}
