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
import { StorageClass } from '@aws-accelerator/config/lib/common-types/types';
import { Bucket, BucketEncryptionType } from '@aws-accelerator/constructs';

interface Transition {
  storageClass: StorageClass;
  transitionAfter: number;
}

interface CentralLogBucketLifecycleRule {
  abortIncompleteMultipartUploadAfter: number;
  enabled: boolean;
  expiration: number;
  expiredObjectDeleteMarker: boolean;
  id: string;
  noncurrentVersionExpiration: number;
  transitions: Transition[];
  noncurrentVersionTransitions: Transition[];
}

export interface CentralLogsBucketProps {
  s3BucketName: string;
  kmsAliasName: string;
  kmsDescription: string;
  serverAccessLogsBucket: Bucket;
  organizationId?: string;
  lifecycleRules?: CentralLogBucketLifecycleRule[];
}

/**
 * Class to initialize Policy
 */
export class CentralLogsBucket extends Construct {
  constructor(scope: Construct, id: string, props: CentralLogsBucketProps) {
    super(scope, id);

    // Create Central Logs Bucket
    const bucket = new Bucket(this, 'Resource', {
      encryptionType: BucketEncryptionType.SSE_KMS,
      s3BucketName: props.s3BucketName,
      kmsAliasName: props.kmsAliasName,
      kmsDescription: props.kmsDescription,
      serverAccessLogsBucket: props.serverAccessLogsBucket.getS3Bucket(),
      //lifecycleRules: props.lifecycleRules,
    });

    bucket.getKey().addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'Enable IAM User Permissions',
        principals: [new cdk.aws_iam.AccountRootPrincipal()],
        actions: ['kms:*'],
        resources: ['*'],
      }),
    );

    bucket.getS3Bucket().addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        principals: [
          new cdk.aws_iam.ServicePrincipal('cloudtrail.amazonaws.com'),
          new cdk.aws_iam.ServicePrincipal('config.amazonaws.com'),
          new cdk.aws_iam.ServicePrincipal('delivery.logs.amazonaws.com'),
        ],
        actions: ['s3:PutObject'],
        resources: [bucket.getS3Bucket().arnForObjects('*')],
        conditions: {
          StringEquals: {
            's3:x-amz-acl': 'bucket-owner-full-control',
          },
        },
      }),
    );

    bucket.getS3Bucket().addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        principals: [
          new cdk.aws_iam.ServicePrincipal('cloudtrail.amazonaws.com'),
          new cdk.aws_iam.ServicePrincipal('config.amazonaws.com'),
          new cdk.aws_iam.ServicePrincipal('delivery.logs.amazonaws.com'),
        ],
        actions: ['s3:GetBucketAcl', 's3:ListBucket'],
        resources: [bucket.getS3Bucket().bucketArn],
      }),
    );

    bucket.getS3Bucket().encryptionKey?.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'Allow S3 use of the key',
        actions: [
          'kms:Decrypt',
          'kms:DescribeKey',
          'kms:Encrypt',
          'kms:GenerateDataKey',
          'kms:GenerateDataKeyWithoutPlaintext',
          'kms:GenerateRandom',
          'kms:GetKeyPolicy',
          'kms:GetKeyRotationStatus',
          'kms:ListAliases',
          'kms:ListGrants',
          'kms:ListKeyPolicies',
          'kms:ListKeys',
          'kms:ListResourceTags',
          'kms:ListRetirableGrants',
          'kms:ReEncryptFrom',
          'kms:ReEncryptTo',
        ],
        principals: [new cdk.aws_iam.ServicePrincipal('s3.amazonaws.com')],
        resources: ['*'],
      }),
    );

    bucket.getS3Bucket().encryptionKey?.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'Allow AWS Services to encrypt and describe logs',
        actions: [
          'kms:Decrypt',
          'kms:DescribeKey',
          'kms:Encrypt',
          'kms:GenerateDataKey',
          'kms:GenerateDataKeyPair',
          'kms:GenerateDataKeyPairWithoutPlaintext',
          'kms:GenerateDataKeyWithoutPlaintext',
          'kms:ReEncryptFrom',
          'kms:ReEncryptTo',
        ],
        principals: [
          new cdk.aws_iam.ServicePrincipal('config.amazonaws.com'),
          new cdk.aws_iam.ServicePrincipal('cloudtrail.amazonaws.com'),
          new cdk.aws_iam.ServicePrincipal('delivery.logs.amazonaws.com'),
        ],
        resources: ['*'],
      }),
    );
    if (props.organizationId !== undefined) {
      bucket.getS3Bucket().encryptionKey?.addToResourcePolicy(
        new cdk.aws_iam.PolicyStatement({
          sid: 'Allow Organization use of the key',
          actions: [
            'kms:Decrypt',
            'kms:DescribeKey',
            'kms:Encrypt',
            'kms:GenerateDataKey',
            'kms:GenerateDataKeyPair',
            'kms:GenerateDataKeyPairWithoutPlaintext',
            'kms:GenerateDataKeyWithoutPlaintext',
            'kms:ReEncryptFrom',
            'kms:ReEncryptTo',
          ],
          principals: [new cdk.aws_iam.AnyPrincipal()],
          resources: ['*'],
          conditions: {
            StringEquals: {
              'aws:PrincipalOrgID': props.organizationId,
            },
          },
        }),
      );

      const centralLogBucketKmsKeyArnSsmParameter = new cdk.aws_ssm.StringParameter(
        this,
        'SsmParamCentralAccountBucketKMSArn',
        {
          parameterName: '/accelerator/logging/central-bucket/kms/arn',
          stringValue: bucket.getKey().keyArn,
        },
      );

      // SSM parameter access IAM Role for
      new cdk.aws_iam.Role(this, 'CrossAccountCentralBucketKMSArnSsmParamAccessRole', {
        roleName: `AWSAccelerator-CentralBucketKMSArnSsmParam-${cdk.Stack.of(this).region}`,
        assumedBy: new cdk.aws_iam.OrganizationPrincipal(props.organizationId),
        inlinePolicies: {
          default: new cdk.aws_iam.PolicyDocument({
            statements: [
              new cdk.aws_iam.PolicyStatement({
                effect: cdk.aws_iam.Effect.ALLOW,
                actions: ['ssm:GetParameters', 'ssm:GetParameter'],
                resources: [centralLogBucketKmsKeyArnSsmParameter.parameterArn],
              }),
              new cdk.aws_iam.PolicyStatement({
                effect: cdk.aws_iam.Effect.ALLOW,
                actions: ['ssm:DescribeParameters'],
                resources: ['*'],
              }),
            ],
          }),
        },
      });
    }
  }
}
