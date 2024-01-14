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

import { pascalCase } from 'change-case';
import path from 'path';
import { LzaCustomResource } from '../lza-custom-resource';
/**
 * Construction properties for an S3 Bucket replication.
 */
export interface BucketPrefixProps {
  source?: {
    /**
     * Source bucket object
     *
     * Source bucket object is must when source bucket name wasn't provided
     */
    bucket?: cdk.aws_s3.IBucket;
    /**
     * Source bucket name
     *
     * Source bucket name is must when source bucket object wasn't provided
     */
    bucketName?: string;
  };
  bucketPrefixes: string[];
  /**
   * Custom resource lambda environment encryption key, when undefined default AWS managed key will be used
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
  /**
   * Prefix for nag suppression
   */
  readonly nagSuppressionPrefix?: string;
}

/**
 * Class to configure S3 bucket prefix creation
 */
export class BucketPrefix extends Construct {
  private readonly sourceBucket: cdk.aws_s3.IBucket;
  constructor(scope: Construct, id: string, props: BucketPrefixProps) {
    super(scope, id);

    if (props.source!.bucket && props.source!.bucketName) {
      throw new Error('Source bucket or source bucketName (only one property) should be defined.');
    }

    if (!props.source!.bucket && !props.source!.bucketName) {
      throw new Error('Source bucket or source bucketName property must be defined when creating bucket prefix.');
    }

    if (props.source!.bucketName) {
      this.sourceBucket = cdk.aws_s3.Bucket.fromBucketName(
        this,
        `${pascalCase(props.source!.bucketName)}`,
        props.source!.bucketName,
      );
    } else {
      this.sourceBucket = props.source!.bucket!;
    }

    const resourceName = 'S3CreateBucketPrefix';

    new LzaCustomResource(this, resourceName, {
      resource: {
        name: resourceName,
        parentId: id,
        properties: [
          { sourceBucketName: this.sourceBucket.bucketName },
          { sourceBucketKeyArn: this.sourceBucket.encryptionKey?.keyArn },
          { bucketPrefixes: props.bucketPrefixes },
        ],
        forceUpdate: true,
      },
      lambda: {
        assetPath: path.join(__dirname, 'put-bucket-prefix/dist'),
        environmentEncryptionKmsKey: props.customResourceLambdaEnvironmentEncryptionKmsKey,
        cloudWatchLogKmsKey: props.customResourceLambdaCloudWatchLogKmsKey,
        cloudWatchLogRetentionInDays: props.customResourceLambdaLogRetentionInDays,
        timeOut: cdk.Duration.minutes(5),
        roleInitialPolicy: [
          new cdk.aws_iam.PolicyStatement({
            effect: cdk.aws_iam.Effect.ALLOW,
            actions: ['s3:ListBucket', 's3:GetObject', 's3:PutObject'],
            resources: ['*'],
          }),
        ],
      },
      nagSuppressionPrefix: props.nagSuppressionPrefix,
    });
  }
}
