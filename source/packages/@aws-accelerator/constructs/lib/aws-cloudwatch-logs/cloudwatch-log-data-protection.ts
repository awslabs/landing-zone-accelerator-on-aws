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
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { LzaCustomResource } from '../lza-custom-resource';
import * as path from 'path';

/**
 * Construction properties for CloudWatch CloudWatchLogDataProtection.
 */
export interface CloudWatchLogDataProtectionProps {
  /**
   *
   * Central logs bucket name
   */
  centralLogBucketName: string;
  /**
   *
   * Data protection identifier names
   */
  identifierNames: string[];
  /**
   * Indicates whether existing CloudWatch Log data protection policy configuration can be overwritten.
   */
  overrideExisting: boolean;
  /**
   * Custom resource lambda log group encryption key, when undefined default AWS managed key will be used
   */
  readonly customResourceLambdaEnvironmentEncryptionKmsKey?: cdk.aws_kms.IKey;
  /**
   * Custom resource lambda log group encryption key, when undefined default AWS managed key will be used
   */
  readonly customResourceLambdaCloudWatchLogKmsKey?: cdk.aws_kms.IKey;
  /**
   * Custom resource lambda log retention in days
   */
  readonly customResourceLambdaLogRetentionInDays: number;
}
/**
 * Class to configure CloudWatch log data protection
 */
export class CloudWatchLogDataProtection extends Construct {
  constructor(scope: Construct, id: string, props: CloudWatchLogDataProtectionProps) {
    super(scope, id);

    const resourceName = 'CloudWatchDataProtection';

    new LzaCustomResource(this, resourceName, {
      resource: {
        name: resourceName,
        parentId: id,
        properties: [
          {
            centralLogBucketName: props.centralLogBucketName,
            identifierNames: props.identifierNames,
            partition: cdk.Stack.of(this).partition,
            overrideExisting: props.overrideExisting,
          },
        ],
      },
      lambda: {
        assetPath: path.join(__dirname, 'put-account-policy/dist'),
        environmentEncryptionKmsKey: props.customResourceLambdaEnvironmentEncryptionKmsKey,
        cloudWatchLogKmsKey: props.customResourceLambdaCloudWatchLogKmsKey,
        cloudWatchLogRetentionInDays: props.customResourceLambdaLogRetentionInDays,
        timeOut: cdk.Duration.minutes(15),
        roleInitialPolicy: [
          new cdk.aws_iam.PolicyStatement({
            sid: 'CloudWatchAccess',
            effect: cdk.aws_iam.Effect.ALLOW,
            actions: [
              'logs:DeleteAccountPolicy',
              'logs:DescribeAccountPolicies',
              'logs:PutAccountPolicy',
              'logs:PutDataProtectionPolicy',
              'logs:DeleteDataProtectionPolicy',
              'logs:CreateLogDelivery',
            ],
            resources: ['*'],
          }),
          new cdk.aws_iam.PolicyStatement({
            sid: 'S3Access',
            effect: cdk.aws_iam.Effect.ALLOW,
            actions: ['s3:GetBucketPolicy', 's3:PutBucketPolicy'],
            resources: [`arn:${cdk.Stack.of(this).partition}:s3:::${props.centralLogBucketName}`],
          }),
        ],
      },
    });
  }
}
