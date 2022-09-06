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

/**
 * Construction properties for CloudWatch Destination for Kinesis Stream.
 */
export interface CloudWatchDestinationProps {
  /**
   *
   * KMS key to encrypt the Kinesis Data Stream
   */
  kinesisKmsKey: cdk.aws_kms.IKey;
  /**
   *
   * Kinesis Data Stream for CloudWatch logs
   */
  kinesisStream: cdk.aws_kinesis.IStream;
  /**
   * Organization ID to restrict the usage within specific org
   */
  orgId: string;
}
/**
 * Class to configure CloudWatch Destination on logs receiving account
 */
export class CloudWatchDestination extends Construct {
  constructor(scope: Construct, id: string, props: CloudWatchDestinationProps) {
    super(scope, id);

    //Create policy for access to Kinesis stream
    const kinesisStreamAccess = new cdk.aws_iam.PolicyDocument({
      statements: [
        new cdk.aws_iam.PolicyStatement({
          actions: ['kinesis:ListShards', 'kinesis:PutRecord', 'kinesis:PutRecords'],
          resources: [props.kinesisStream.streamArn],
        }),
      ],
    });
    const kmsKeyAccess = new cdk.aws_iam.PolicyDocument({
      statements: [
        new cdk.aws_iam.PolicyStatement({
          actions: [
            'kms:Decrypt',
            'kms:Encrypt',
            'kms:GenerateDataKey',
            'kms:ReEncryptTo',
            'kms:GenerateDataKeyWithoutPlaintext',
            'kms:GenerateDataKeyPairWithoutPlaintext',
            'kms:GenerateDataKeyPair',
            'kms:ReEncryptFrom',
          ],
          resources: [props.kinesisKmsKey.keyArn],
        }),
      ],
    });

    // Create a role for CloudWatch Logs destination
    const logsKinesisRole = new cdk.aws_iam.Role(this, 'LogsKinesisRole', {
      assumedBy: new cdk.aws_iam.ServicePrincipal(cdk.Fn.sub('logs.${AWS::Region}.amazonaws.com')),
      // this needs to be inline to ensure role is created with proper access
      // if not, CloudWatch destination creation fails with no permission to access Kinesis or KMS (generateDataKey access error)
      inlinePolicies: {
        KinesisAccess: kinesisStreamAccess,
        KmsAccess: kmsKeyAccess,
      },
    });

    const logDestinationPolicy = JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: '*',
          Action: 'logs:PutSubscriptionFilter',
          Resource: `arn:${cdk.Stack.of(this).partition}:logs:${cdk.Stack.of(this).region}:${
            cdk.Stack.of(this).account
          }:destination:AWSAcceleratorCloudWatchToS3`,
          Condition: {
            StringEquals: {
              'aws:PrincipalOrgID': [props.orgId],
            },
          },
        },
      ],
    });

    new cdk.aws_logs.CfnDestination(this, 'Resource', {
      roleArn: logsKinesisRole.roleArn,
      targetArn: props.kinesisStream.streamArn,
      destinationName: 'AWSAcceleratorCloudWatchToS3',
      destinationPolicy: logDestinationPolicy,
    });
  }
}
