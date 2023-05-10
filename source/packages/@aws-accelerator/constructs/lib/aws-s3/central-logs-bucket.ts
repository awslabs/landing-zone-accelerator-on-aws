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
import { Bucket, BucketEncryptionType } from '@aws-accelerator/constructs';
import { BucketAccessType, S3LifeCycleRule } from './bucket';
import { BucketPrefixProps } from './bucket-prefix';

export interface CentralLogsBucketProps {
  s3BucketName: string;
  kmsAliasName: string;
  kmsDescription: string;
  principalOrgIdCondition: { [key: string]: string | string[] };
  orgPrincipals: cdk.aws_iam.IPrincipal;
  serverAccessLogsBucket: Bucket;
  s3LifeCycleRules?: S3LifeCycleRule[];
  /**
   * @optional
   * A list of AWS principals and access type the bucket to grant
   * principal should be a valid AWS resource principal like for AWS MacieSession it
   * should be macie.amazonaws.com accessType should be any of these possible
   * values BucketAccessType.READONLY, BucketAccessType.WRITEONLY, & and
   * BucketAccessType.READWRITE
   */
  awsPrincipalAccesses?: { name: string; principal: string; accessType: string }[];
  bucketPrefixProps?: BucketPrefixProps;
  /**
   * Accelerator Prefix
   */
  readonly acceleratorPrefix: string;
  /**
   * Accelerator central log bucket cross account ssm parameter access role name
   */
  readonly crossAccountAccessRoleName: string;
  /**
   * Accelerator central log bucket cmk arn ssm parameter name
   */
  readonly cmkArnSsmParameterName: string;
}

/**
 * Class to initialize Policy
 */
export class CentralLogsBucket extends Construct {
  private readonly bucket: Bucket;

  constructor(scope: Construct, id: string, props: CentralLogsBucketProps) {
    super(scope, id);

    const awsPrincipalAccesses = props.awsPrincipalAccesses ?? [];

    // Create Central Logs Bucket
    this.bucket = new Bucket(this, 'Resource', {
      encryptionType: BucketEncryptionType.SSE_KMS,
      s3BucketName: props.s3BucketName,
      kmsAliasName: props.kmsAliasName,
      kmsDescription: props.kmsDescription,
      serverAccessLogsBucket: props.serverAccessLogsBucket.getS3Bucket(),
      s3LifeCycleRules: props.s3LifeCycleRules,
      awsPrincipalAccesses: awsPrincipalAccesses.filter(item => item.accessType !== BucketAccessType.NO_ACCESS),
      bucketPrefixProps: props.bucketPrefixProps,
    });

    this.bucket.getKey().addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'Enable IAM User Permissions',
        principals: [new cdk.aws_iam.AccountRootPrincipal()],
        actions: ['kms:*'],
        resources: ['*'],
      }),
    );

    this.bucket.getS3Bucket().addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        principals: [
          new cdk.aws_iam.ServicePrincipal('cloudtrail.amazonaws.com'),
          new cdk.aws_iam.ServicePrincipal('config.amazonaws.com'),
          new cdk.aws_iam.ServicePrincipal('delivery.logs.amazonaws.com'),
          new cdk.aws_iam.ServicePrincipal('ssm.amazonaws.com'),
        ],
        actions: ['s3:PutObject'],
        resources: [this.bucket.getS3Bucket().arnForObjects('*')],
        conditions: {
          StringEquals: {
            's3:x-amz-acl': 'bucket-owner-full-control',
          },
        },
      }),
    );

    this.bucket.getS3Bucket().addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        principals: [
          new cdk.aws_iam.ServicePrincipal('cloudtrail.amazonaws.com'),
          new cdk.aws_iam.ServicePrincipal('config.amazonaws.com'),
          new cdk.aws_iam.ServicePrincipal('delivery.logs.amazonaws.com'),
        ],
        actions: ['s3:GetBucketAcl', 's3:ListBucket'],
        resources: [this.bucket.getS3Bucket().bucketArn],
      }),
    );

    this.bucket.getS3Bucket().encryptionKey?.addToResourcePolicy(
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

    this.bucket.getS3Bucket().encryptionKey?.addToResourcePolicy(
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
          new cdk.aws_iam.ServicePrincipal('ssm.amazonaws.com'),
        ],
        resources: ['*'],
      }),
    );

    // Allow bucket encryption key for given aws principals
    awsPrincipalAccesses
      .filter(item => item.accessType !== BucketAccessType.NO_ACCESS)
      .forEach(item => {
        this.bucket.getS3Bucket().encryptionKey?.addToResourcePolicy(
          new cdk.aws_iam.PolicyStatement({
            sid: `Allow ${item.name} service to use the encryption key`,
            principals: [new cdk.aws_iam.ServicePrincipal(item.principal)],
            actions: ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:DescribeKey'],
            resources: ['*'],
          }),
        );
      });

    props.awsPrincipalAccesses?.forEach(item => {
      if (item.name === 'SessionManager') {
        this.bucket.getS3Bucket().addToResourcePolicy(
          new cdk.aws_iam.PolicyStatement({
            sid: 'Allow Organization principals to put objects',
            effect: cdk.aws_iam.Effect.ALLOW,
            actions: ['s3:PutObjectAcl', 's3:PutObject'],
            principals: [new cdk.aws_iam.AnyPrincipal()],
            resources: [`${this.bucket.getS3Bucket().bucketArn}/*`],
            conditions: {
              StringEquals: {
                ...props.principalOrgIdCondition,
              },
            },
          }),
        );

        this.bucket.getS3Bucket().addToResourcePolicy(
          new cdk.aws_iam.PolicyStatement({
            sid: 'Allow Organization principals to get encryption context and acl',
            effect: cdk.aws_iam.Effect.ALLOW,
            actions: ['s3:GetEncryptionConfiguration', 's3:GetBucketAcl'],
            principals: [new cdk.aws_iam.AnyPrincipal()],
            resources: [`${this.bucket.getS3Bucket().bucketArn}`],
            conditions: {
              StringEquals: {
                ...props.principalOrgIdCondition,
              },
            },
          }),
        );
      }
    });

    // Grant organization principals to use the bucket
    this.bucket.getS3Bucket().addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'Allow Organization principals to use the bucket',
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['s3:GetBucketLocation', 's3:GetBucketAcl', 's3:PutObject', 's3:GetObject', 's3:ListBucket'],
        principals: [new cdk.aws_iam.AnyPrincipal()],
        resources: [this.bucket.getS3Bucket().bucketArn, `${this.bucket.getS3Bucket().bucketArn}/*`],
        conditions: {
          StringEquals: {
            ...props.principalOrgIdCondition,
          },
        },
      }),
    );

    // Allow bucket to be used by other buckets in organization for replication
    this.bucket.getS3Bucket().addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'Allow Organization use of the bucket for replication',
        actions: [
          's3:List*',
          's3:GetBucketVersioning',
          's3:PutBucketVersioning',
          's3:ReplicateDelete',
          's3:ReplicateObject',
          's3:ObjectOwnerOverrideToBucketOwner',
        ],
        principals: [new cdk.aws_iam.AnyPrincipal()],
        resources: [this.bucket.getS3Bucket().bucketArn, this.bucket.getS3Bucket().arnForObjects('*')],
        conditions: {
          StringEquals: {
            ...props.principalOrgIdCondition,
          },
        },
      }),
    );

    this.bucket.getS3Bucket().encryptionKey?.addToResourcePolicy(
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
          'kms:ListAliases',
        ],
        principals: [new cdk.aws_iam.AnyPrincipal()],
        resources: ['*'],
        conditions: {
          StringEquals: {
            ...props.principalOrgIdCondition,
          },
        },
      }),
    );

    const centralLogBucketKmsKeyArnSsmParameter = new cdk.aws_ssm.StringParameter(
      this,
      'SsmParamCentralAccountBucketKMSArn',
      {
        parameterName: props.cmkArnSsmParameterName,
        stringValue: this.bucket.getKey().keyArn,
      },
    );

    // SSM parameter access IAM Role for
    new cdk.aws_iam.Role(this, 'CrossAccountCentralBucketKMSArnSsmParamAccessRole', {
      roleName: props.crossAccountAccessRoleName,
      assumedBy: props.orgPrincipals,
      inlinePolicies: {
        default: new cdk.aws_iam.PolicyDocument({
          statements: [
            new cdk.aws_iam.PolicyStatement({
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: ['ssm:GetParameters', 'ssm:GetParameter'],
              resources: [centralLogBucketKmsKeyArnSsmParameter.parameterArn],
              conditions: {
                ArnLike: {
                  'aws:PrincipalARN': [`arn:${cdk.Stack.of(this).partition}:iam::*:role/${props.acceleratorPrefix}-*`],
                },
              },
            }),
            new cdk.aws_iam.PolicyStatement({
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: ['ssm:DescribeParameters'],
              resources: ['*'],
              conditions: {
                ArnLike: {
                  'aws:PrincipalARN': [`arn:${cdk.Stack.of(this).partition}:iam::*:role/${props.acceleratorPrefix}-*`],
                },
              },
            }),
          ],
        }),
      },
    });
  }

  public getS3Bucket(): Bucket {
    return this.bucket;
  }
}
