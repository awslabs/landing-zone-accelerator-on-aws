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
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { StorageClass } from '@aws-accelerator/config/lib/common-types/types';
import { BucketReplication, BucketReplicationProps } from './bucket-replication';
import { BucketPrefix, BucketPrefixProps } from './bucket-prefix';
import { Construct } from 'constructs';
import { pascalCase } from 'change-case';

export enum BucketAccessType {
  /**
   * When service need read only access to bucket and CMK
   */
  READONLY = 'readonly',
  /**
   * When service need write only access to bucket and CMK
   */
  WRITEONLY = 'writeonly',
  /**
   * When service need read write access to bucket and CMK
   */
  READWRITE = 'readwrite',
  /**
   * When service need no access like SessionManager, but the service name required for other logical changes in bucket or CMK policy
   */
  NO_ACCESS = 'no_access',
}

export enum BucketEncryptionType {
  SSE_S3 = 'sse-s3',
  SSE_KMS = 'sse-kms',
}

interface Transition {
  storageClass: StorageClass;
  transitionAfter: number;
}

export interface S3LifeCycleRule {
  abortIncompleteMultipartUploadAfter: number;
  enabled: boolean;
  expiration: number;
  expiredObjectDeleteMarker: boolean;
  id: string;
  noncurrentVersionExpiration: number;
  transitions: Transition[];
  noncurrentVersionTransitions: Transition[];
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
   * The kms key for bucket encryption.
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
  serverAccessLogsBucket?: s3.IBucket;

  /**
   *
   */
  serverAccessLogsBucketName?: string;

  /**
   *
   */
  s3LifeCycleRules?: S3LifeCycleRule[];

  /**
   * Prefix to use in the target bucket for server access logs.
   *
   * @default - name of this bucket
   */
  serverAccessLogsPrefix?: string;

  /**
   * @optional
   * A list of AWS principals and access type the bucket to grant
   * principal should be a valid AWS resource principal like for AWS Macie it
   * should be macie.amazonaws.com accessType should be any of these possible
   * values BucketAccessType.READONLY, BucketAccessType.WRITEONLY,BucketAccessType.READWRITE and BucketAccessType.NO_ACCESS
   *
   */
  awsPrincipalAccesses?: { name: string; principal: string; accessType: string }[];

  /**
   * Optional bucket replication property
   */
  replicationProps?: BucketReplicationProps;

  /**
   * Optional bucket prefix property
   */
  bucketPrefixProps?: BucketPrefixProps;
}

/**
 * Defines a Secure S3 Bucket object. By default a KMS CMK is generated and
 * associated to the bucket.
 */
export class Bucket extends Construct {
  private readonly bucket: s3.Bucket;
  /**
   * Bucket encryption type set to a default value of BucketEncryption.KMS,
   * which will be determined later based on other properties
   */
  private encryptionType: s3.BucketEncryption = s3.BucketEncryption.KMS;
  private cmk?: kms.Key;
  private serverAccessLogsPrefix: string | undefined;
  private serverAccessLogBucket: cdk.aws_s3.IBucket | undefined;
  private lifecycleRules: cdk.aws_s3.LifecycleRule[] = [];

  private readonly props: BucketProps;

  constructor(scope: Construct, id: string, props: BucketProps) {
    super(scope, id);

    this.props = props;

    //
    // Determine encryption type
    this.setEncryptionType();

    //
    // Set access log bucket properties
    this.setAccessLogBucketProperties();

    //
    // set Lifecycle rules
    this.setLifeCycleRules();

    this.bucket = new s3.Bucket(this, 'Resource', {
      encryption: this.encryptionType,
      encryptionKey: this.cmk,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      bucketName: props.s3BucketName,
      versioned: true,
      lifecycleRules: this.lifecycleRules,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
      serverAccessLogsBucket: this.serverAccessLogBucket,
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
    props.awsPrincipalAccesses?.forEach(input => {
      switch (input.accessType) {
        case BucketAccessType.READONLY:
          this.bucket.grantRead(new iam.ServicePrincipal(input.principal));
          cdk.Tags.of(this.bucket).add(`aws-cdk:auto-${input.name.toLowerCase()}-access-bucket`, 'true');
          break;
        case BucketAccessType.WRITEONLY:
          this.bucket.grantWrite(new iam.ServicePrincipal(input.principal));
          cdk.Tags.of(this.bucket).add(`aws-cdk:auto-${input.name.toLowerCase()}-access-bucket`, 'true');
          break;
        case BucketAccessType.READWRITE:
          this.bucket.grantReadWrite(new iam.ServicePrincipal(input.principal));
          cdk.Tags.of(this.bucket).add(`aws-cdk:auto-${input.name.toLowerCase()}-access-bucket`, 'true');
          break;
        default:
          throw new Error(`Invalid Access Type ${input.accessType} for ${input.principal} principal.`);
      }
    });

    // Configure replication
    if (props.replicationProps) {
      new BucketReplication(this, id + 'Replication', {
        source: { bucket: this.bucket },
        destination: {
          bucketName: props.replicationProps.destination.bucketName,
          accountId: props.replicationProps.destination.accountId,
          keyArn: props.replicationProps.destination.keyArn,
        },
        kmsKey: props.replicationProps.kmsKey,
        logRetentionInDays: props.replicationProps.logRetentionInDays,
      });
    }

    // Configure prefix creation
    if (props.bucketPrefixProps) {
      new BucketPrefix(this, id + 'Prefix', {
        source: { bucket: this.bucket },
        bucketPrefixes: props.bucketPrefixProps.bucketPrefixes,
        kmsKey: props.bucketPrefixProps.kmsKey,
        logRetentionInDays: props.bucketPrefixProps.logRetentionInDays,
      });
    }
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
    return [];
  }

  /**
   * Function to set bucket encryption type
   */
  private setEncryptionType() {
    // Determine encryption type
    if (this.props.encryptionType == BucketEncryptionType.SSE_KMS) {
      if (this.props.kmsKey) {
        this.cmk = this.props.kmsKey;
      } else {
        this.cmk = new kms.Key(this, 'Cmk', {
          enableKeyRotation: true,
          description: this.props.kmsDescription,
        });
        if (this.props.kmsAliasName) {
          this.cmk.addAlias(this.props.kmsAliasName);
        }
      }
      this.encryptionType = s3.BucketEncryption.KMS;
    } else if (this.props.encryptionType == BucketEncryptionType.SSE_S3) {
      this.encryptionType = s3.BucketEncryption.S3_MANAGED;
    }
  }

  /**
   * Set Server access log bucket property
   */
  private setAccessLogBucketProperties() {
    if (this.props.serverAccessLogsBucketName && !this.props.serverAccessLogsBucket) {
      this.serverAccessLogBucket = s3.Bucket.fromBucketName(
        this,
        `${pascalCase(this.props.serverAccessLogsBucketName)}-S3LogsBucket`,
        this.props.serverAccessLogsBucketName,
      );
    }
    if (!this.props.serverAccessLogsBucketName && this.props.serverAccessLogsBucket) {
      this.serverAccessLogBucket = this.props.serverAccessLogsBucket;
      // Get server access logs prefix
      if (!this.props.s3BucketName && !this.props.serverAccessLogsPrefix) {
        throw new Error('s3BucketName or serverAccessLogsPrefix property must be defined when using serverAccessLogs.');
      } else {
        this.serverAccessLogsPrefix = this.props.serverAccessLogsPrefix ?? this.props.s3BucketName;
      }
    }
    if (this.props.serverAccessLogsBucketName && this.props.serverAccessLogsBucket) {
      throw new Error('serverAccessLogsBucketName or serverAccessLogsBucket (only one property) should be defined.');
    }
  }

  private setLifeCycleRules() {
    if (this.props.s3LifeCycleRules) {
      for (const lifecycleRuleConfig of this.props.s3LifeCycleRules) {
        const transitions = [];
        const noncurrentVersionTransitions = [];

        for (const transition of lifecycleRuleConfig.transitions) {
          const transitionConfig = {
            storageClass: new cdk.aws_s3.StorageClass(transition.storageClass),
            transitionAfter: cdk.Duration.days(transition.transitionAfter),
          };
          transitions.push(transitionConfig);
        }

        for (const nonCurrentTransition of lifecycleRuleConfig.noncurrentVersionTransitions) {
          const noncurrentVersionTransitionsConfig = {
            storageClass: new cdk.aws_s3.StorageClass(nonCurrentTransition.storageClass),
            transitionAfter: cdk.Duration.days(nonCurrentTransition.transitionAfter),
          };
          noncurrentVersionTransitions.push(noncurrentVersionTransitionsConfig);
        }

        this.lifecycleRules.push({
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(
            lifecycleRuleConfig.abortIncompleteMultipartUploadAfter,
          ),
          enabled: lifecycleRuleConfig.enabled,
          expiration: cdk.Duration.days(lifecycleRuleConfig.expiration),
          transitions,
          noncurrentVersionTransitions,
          noncurrentVersionExpiration: cdk.Duration.days(lifecycleRuleConfig.noncurrentVersionExpiration),
          expiredObjectDeleteMarker: lifecycleRuleConfig.expiredObjectDeleteMarker,
          id: `LifecycleRule${this.props.s3BucketName}`,
        });
      }
    } else {
      this.lifecycleRules.push({
        abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
        enabled: true,
        expiration: cdk.Duration.days(1825),
        expiredObjectDeleteMarker: false,
        id: `LifecycleRule${this.props.s3BucketName}`,
        noncurrentVersionExpiration: cdk.Duration.days(1825),
        noncurrentVersionTransitions: [
          {
            storageClass: cdk.aws_s3.StorageClass.DEEP_ARCHIVE,
            transitionAfter: cdk.Duration.days(366),
          },
        ],
        transitions: [
          {
            storageClass: cdk.aws_s3.StorageClass.DEEP_ARCHIVE,
            transitionAfter: cdk.Duration.days(365),
          },
        ],
      });
    }
  }
}
