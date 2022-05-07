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

import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { pascalCase } from 'change-case';

export enum BucketAccessType {
  READONLY = 'readonly',
  WRITEONLY = 'writeonly',
  READWRITE = 'readwrite',
}

export enum BucketEncryptionType {
  SSE_S3 = 'sse-s3',
  SSE_KMS = 'sse-kms',
}

/**
 * Construction properties for an S3 Bucket object.
 */
export interface BucketProps {
  /**
   * Physical name of this bucket.
   *
   * @default - Assigned by CloudFormation (recommended).
   */
  s3BucketName?: string;
  /**
   * SSE encryption type for this bucket.
   */
  encryptionType: BucketEncryptionType;
  /**
   * Policy to apply when the bucket is removed from this stack.
   *
   * @default - The bucket will be orphaned.
   */
  s3RemovalPolicy?: cdk.RemovalPolicy;
  /**
   * The ksm key for bucket encryption.
   */
  kmsKey?: kms.Key;
  /**
   * The name of the alias.
   */
  kmsAliasName?: string;
  /**
   * A description of the key.
   *
   * Use a description that helps your users decide
   * whether the key is appropriate for a particular task.
   *
   */
  kmsDescription?: string;

  /**
   *
   */
  serverAccessLogsBucket?: s3.IBucket | undefined;

  /**
   *
   */
  serverAccessLogsBucketName?: string;

  /**
   * Prefix to use in the target bucket for server access logs.
   *
   * @default - name of this bucket
   */
  serverAccessLogsPrefix?: string;

  /**
   * @optional
   * A list of AWS principals and access type the bucket to grant
   * principal should be a valid AWS resource principal like for AWS MacieSession it
   * should be macie.amazonaws.com accessType should be any of these possible
   * values BucketAccessType.READONLY, BucketAccessType.WRITEONLY, & and
   * BucketAccessType.READWRITE
   */
  awsPrincipalAccesses?: { principalAccesses: [{ principal: string; accessType: string }] };
}

/**
 * Defines a Secure S3 Bucket object. By default a KMS CMK is generated and
 * associated to the bucket.
 */
export class Bucket extends Construct {
  private readonly bucket: s3.Bucket;
  private readonly encryptionType: s3.BucketEncryption;
  private readonly cmk?: kms.Key;
  private readonly serverAccessLogsPrefix?: string;

  constructor(scope: Construct, id: string, props: BucketProps) {
    super(scope, id);

    // Determine encryption type
    if (props.encryptionType == BucketEncryptionType.SSE_KMS) {
      if (props.kmsKey) {
        this.cmk = props.kmsKey;
      } else {
        this.cmk = new kms.Key(this, 'Cmk', {
          enableKeyRotation: true,
          description: props.kmsDescription,
        });
        if (props.kmsAliasName) {
          this.cmk.addAlias(props.kmsAliasName);
        }
      }
      this.encryptionType = s3.BucketEncryption.KMS;
    } else if (props.encryptionType == BucketEncryptionType.SSE_S3) {
      this.encryptionType = s3.BucketEncryption.S3_MANAGED;
    } else {
      throw new Error(`encryptionType ${props.encryptionType} is not valid.`);
    }

    let serverAccessLogBucket: cdk.aws_s3.IBucket | undefined;

    if (props.serverAccessLogsBucketName && !props.serverAccessLogsBucket) {
      serverAccessLogBucket = s3.Bucket.fromBucketName(
        this,
        `${pascalCase(props.serverAccessLogsBucketName)}-S3LogsBucket`,
        props.serverAccessLogsBucketName,
      );
    }
    if (!props.serverAccessLogsBucketName && props.serverAccessLogsBucket) {
      serverAccessLogBucket = props.serverAccessLogsBucket;
      // Get server access logs prefix
      if (!props.s3BucketName && !props.serverAccessLogsPrefix) {
        throw new Error('s3BucketName or serverAccessLogsPrefix property must be defined when using serverAccessLogs.');
      } else {
        this.serverAccessLogsPrefix = props.serverAccessLogsPrefix ? props.s3BucketName : props.s3BucketName;
      }
    }
    if (props.serverAccessLogsBucketName && props.serverAccessLogsBucket) {
      throw new Error('serverAccessLogsBucketName or serverAccessLogsBucket (only one property) should be defined.');
    }

    this.bucket = new s3.Bucket(this, 'Resource', {
      encryption: this.encryptionType,
      encryptionKey: this.cmk,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      bucketName: props.s3BucketName,
      versioned: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
      serverAccessLogsBucket: serverAccessLogBucket,
      // Trailing slash for folder-like prefix in S3
      serverAccessLogsPrefix: this.serverAccessLogsPrefix?.concat('/'),
    });
    // Had to be removed to allow CloudTrail access
    // this.bucket.addToResourcePolicy(
    //   new iam.PolicyStatement({
    //     sid: 'deny-non-encrypted-object-uploads',
    //     effect: iam.Effect.DENY,
    //     actions: ['s3:PutObject'],
    //     resources: [this.bucket.arnForObjects('*')],
    //     principals: [new iam.AnyPrincipal()],
    //     conditions: {
    //       StringNotEquals: {
    //         's3:x-amz-server-side-encryption': 'aws:kms',
    //       },
    //     },
    //   }),
    // );
    this.bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'deny-insecure-connections',
        effect: iam.Effect.DENY,
        actions: ['s3:*'],
        resources: [this.bucket.bucketArn, this.bucket.arnForObjects('*')],
        principals: [new iam.AnyPrincipal()],
        conditions: {
          Bool: {
            'aws:SecureTransport': 'false',
          },
        },
      }),
    );

    // Add access policy for input AWS principal to the bucket
    props.awsPrincipalAccesses?.principalAccesses.forEach(input => {
      switch (input.accessType) {
        case BucketAccessType.READONLY:
          this.bucket.grantRead(new iam.ServicePrincipal(input.principal));
          break;
        case BucketAccessType.WRITEONLY:
          this.bucket.grantWrite(new iam.ServicePrincipal(input.principal));
          break;
        case BucketAccessType.READWRITE:
          this.bucket.grantReadWrite(new iam.ServicePrincipal(input.principal));
          break;
        default:
          throw new Error(`Invalid Access Type ${input.accessType} for ${input.principal} principal.`);
      }
    });
  }

  public getS3Bucket(): s3.IBucket {
    return this.bucket;
  }

  public getKey(): kms.Key {
    if (this.cmk) {
      return this.cmk;
    } else {
      throw new Error(`S3 bucket ${this.bucket.bucketName} has no associated CMK.`);
    }
  }

  protected addValidation(): string[] {
    const errors: string[] = [];

    return errors;
  }
}
