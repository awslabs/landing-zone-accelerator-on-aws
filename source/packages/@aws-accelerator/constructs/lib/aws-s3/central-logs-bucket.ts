/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
// import * as s3 from '@aws-cdk/aws-s3';
// import * as ssm from '@aws-cdk/aws-ssm';
import * as compliant_constructs from '@aws-compliant-constructs/compliant-constructs';

export interface CentralLogsBucketProps {
  s3BucketName: string;
  kmsAliasName: string;
  kmsDescription: string;
  serverAccessLogsBucket: compliant_constructs.SecureS3Bucket;
  organizationId: string;
}

/**
 * Class to initialize Policy
 */
export class CentralLogsBucket extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: CentralLogsBucketProps) {
    super(scope, id);

    // Create Central Logs Bucket
    const bucket = new compliant_constructs.SecureS3Bucket(this, 'Resource', {
      s3BucketName: props.s3BucketName,
      kmsAliasName: props.kmsAliasName,
      kmsDescription: props.kmsDescription,
      serverAccessLogsBucket: props.serverAccessLogsBucket.getS3Bucket(),
    });

    bucket.getKey().addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'Enable IAM User Permissions',
        principals: [new iam.AccountRootPrincipal()],
        actions: ['kms:*'],
        resources: ['*'],
      }),
    );

    bucket.getS3Bucket().encryptionKey?.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'Allow AWS services to use the encryption key',
        actions: ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:DescribeKey'],
        principals: [
          new iam.ServicePrincipal('ds.amazonaws.com'),
          new iam.ServicePrincipal('delivery.logs.amazonaws.com'),
        ],
        resources: ['*'],
      }),
    );

    //
    // Replicate From
    //
    bucket.getS3Bucket().addToResourcePolicy(
      new iam.PolicyStatement({
        actions: [
          's3:GetBucketVersioning',
          's3:GetObjectVersionTagging',
          's3:ObjectOwnerOverrideToBucketOwner',
          's3:PutBucketVersioning',
          's3:ReplicateDelete',
          's3:ReplicateObject',
          's3:ReplicateTags',
          's3:List*',
        ],
        principals: [new iam.AnyPrincipal()],
        resources: [bucket.getS3Bucket().bucketArn, bucket.getS3Bucket().arnForObjects('*')],
        conditions: {
          StringEquals: {
            'aws:PrincipalOrgID': props.organizationId,
          },
          ArnLike: {
            'aws:PrincipalARN': [`arn:${cdk.Stack.of(this).partition}:iam::*:role/AWSAccelerator-*`],
          },
        },
      }),
    );

    // Allow the whole organization access to the destination encryption key
    // The replication role ARN cannot be used here as it would be a cross-account reference
    bucket.getS3Bucket().encryptionKey?.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'Enable cross account encrypt access for S3 Cross Region Replication',
        actions: ['kms:Encrypt'],
        principals: [new iam.AnyPrincipal()],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'aws:PrincipalOrgID': props.organizationId,
          },
        },
      }),
    );

    bucket.getS3Bucket().addToResourcePolicy(
      new iam.PolicyStatement({
        principals: [new iam.AnyPrincipal()],
        actions: ['s3:GetEncryptionConfiguration', 's3:PutObject'],
        resources: [bucket.getS3Bucket().bucketArn, bucket.getS3Bucket().arnForObjects('*')],
        conditions: {
          StringEquals: {
            'aws:PrincipalOrgID': props.organizationId,
          },
        },
      }),
    );

    // Allow Kinesis access bucket
    bucket.getS3Bucket().addToResourcePolicy(
      new iam.PolicyStatement({
        principals: [new iam.AnyPrincipal()],
        actions: [
          's3:AbortMultipartUpload',
          's3:GetBucketLocation',
          's3:GetObject',
          's3:ListBucket',
          's3:ListBucketMultipartUploads',
          's3:PutObject',
          's3:PutObjectAcl',
        ],
        resources: [bucket.getS3Bucket().bucketArn, bucket.getS3Bucket().arnForObjects('*')],
        conditions: {
          StringEquals: {
            'aws:PrincipalOrgID': props.organizationId,
          },
          ArnLike: {
            'aws:PrincipalARN': `arn:${cdk.Stack.of(this).partition}:iam::*:role/AWSAccelerator-Kinesis-*`,
          },
        },
      }),
    );

    bucket.getS3Bucket().addToResourcePolicy(
      new iam.PolicyStatement({
        principals: [
          new iam.ServicePrincipal('delivery.logs.amazonaws.com'),
          new iam.ServicePrincipal('cloudtrail.amazonaws.com'),
          new iam.ServicePrincipal('config.amazonaws.com'),
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
      new iam.PolicyStatement({
        principals: [
          new iam.ServicePrincipal('delivery.logs.amazonaws.com'),
          new iam.ServicePrincipal('cloudtrail.amazonaws.com'),
          new iam.ServicePrincipal('config.amazonaws.com'),
        ],
        actions: ['s3:GetBucketAcl', 's3:ListBucket'],
        resources: [bucket.getS3Bucket().bucketArn],
      }),
    );

    // Permission to allow checking existence of AWSConfig bucket
    bucket.getS3Bucket().addToResourcePolicy(
      new iam.PolicyStatement({
        principals: [new iam.ServicePrincipal('config.amazonaws.com')],
        actions: ['s3:ListBucket'],
        resources: [bucket.getS3Bucket().bucketArn],
      }),
    );

    // Allow cross account encrypt access for logArchive bucket
    bucket.getS3Bucket().encryptionKey?.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'Enable cross account encrypt access for S3 Cross Region Replication',
        actions: ['kms:Encrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:DescribeKey'],
        principals: [new iam.AnyPrincipal()],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'aws:PrincipalOrgID': props.organizationId,
          },
        },
      }),
    );

    // Allow only https requests
    bucket.getS3Bucket().addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ['s3:*'],
        resources: [bucket.getS3Bucket().bucketArn, bucket.getS3Bucket().arnForObjects('*')],
        principals: [new iam.AnyPrincipal()],
        conditions: {
          Bool: {
            'aws:SecureTransport': 'false',
          },
        },
        effect: iam.Effect.DENY,
      }),
    );

    bucket.getS3Bucket().encryptionKey?.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'Allow CloudTrail to encrypt and describe logs',
        actions: ['kms:GenerateDataKey*', 'kms:DescribeKey'],
        principals: [new iam.ServicePrincipal('cloudtrail.amazonaws.com')],
        resources: ['*'],
      }),
    );
  }
}
