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
  organizationId?: string;
  /**
   * Partition to determine the IAM condition.
   */
  partition: string;
  /**
   * Account IDs for the IAM condition.
   */
  accountIds?: string[];
  /**
   * Accelerator Prefix defaults to 'AWSAccelerator'.
   */
  acceleratorPrefix: string;
  /**
   * Use existing IAM roles for deployment.
   */
  useExistingRoles: boolean;
}
/**
 * Class to configure CloudWatch Destination on logs receiving account
 */
export class CloudWatchDestination extends Construct {
  constructor(scope: Construct, id: string, props: CloudWatchDestinationProps) {
    super(scope, id);

    let principalOrgIdCondition: object | undefined = undefined;
    let accountPrincipals: object | cdk.aws_iam.IPrincipal;

    if (props.partition === 'aws-cn' || !props.organizationId) {
      // Only principal block with list of account id is supported.
      accountPrincipals = {
        AWS: props.accountIds,
      };
    } else {
      principalOrgIdCondition = {
        StringEquals: {
          'aws:PrincipalOrgID': props.organizationId,
        },
      };
      accountPrincipals = new cdk.aws_iam.AnyPrincipal();
    }

    const logDestinationPolicy = JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: accountPrincipals,
          Action: 'logs:PutSubscriptionFilter',
          Resource: `arn:${cdk.Stack.of(this).partition}:logs:${cdk.Stack.of(this).region}:${
            cdk.Stack.of(this).account
          }:destination:${props.acceleratorPrefix}CloudWatchToS3`,
          Condition: principalOrgIdCondition,
        },
      ],
    });

    new cdk.aws_logs.CfnDestination(this, 'Resource', {
      roleArn: this.createKinesisRole(
        props.kinesisStream.streamArn,
        props.kinesisKmsKey.keyArn,
        props.useExistingRoles,
        props.acceleratorPrefix,
      ),
      targetArn: props.kinesisStream.streamArn,
      destinationName: `${props.acceleratorPrefix}CloudWatchToS3`,
      destinationPolicy: logDestinationPolicy,
    });
  }

  private createKinesisRole(
    kinesisStreamArn: string,
    kinesisKeyArn: string,
    useExistingRoles: boolean,
    acceleratorPrefix: string,
  ) {
    if (useExistingRoles) {
      return `arn:${cdk.Stack.of(this).partition}:iam::${
        cdk.Stack.of(this).account
      }:role/${acceleratorPrefix}LogReplicationRole-${cdk.Stack.of(this).region}`;
    }
    //Create policy for access to Kinesis stream
    const kinesisStreamAccess = new cdk.aws_iam.PolicyDocument({
      statements: [
        new cdk.aws_iam.PolicyStatement({
          actions: ['kinesis:ListShards', 'kinesis:PutRecord', 'kinesis:PutRecords'],
          resources: [kinesisStreamArn],
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
          resources: [kinesisKeyArn],
        }),
      ],
    });
    // Create a role for CloudWatch Logs destination
    const logsKinesisRole = new cdk.aws_iam.Role(this, 'LogsKinesisRole', {
      assumedBy: new cdk.aws_iam.ServicePrincipal(`logs.${cdk.Stack.of(this).region}.${cdk.Stack.of(this).urlSuffix}`),
      // this needs to be inline to ensure role is created with proper access
      // if not, CloudWatch destination creation fails with no permission to access Kinesis or KMS (generateDataKey access error)
      inlinePolicies: {
        KinesisAccess: kinesisStreamAccess,
        KmsAccess: kmsKeyAccess,
      },
    });
    return logsKinesisRole.roleArn;
  }
}
