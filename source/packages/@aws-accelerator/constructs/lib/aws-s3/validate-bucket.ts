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
import * as path from 'path';
import { LzaCustomResource } from '../lza-custom-resource';

/**
 * Initialized ValidateBucketProps properties
 */
export interface ValidateBucketProps {
  /**
   * The name of the bucket which will be validated
   */
  readonly bucket: cdk.aws_s3.IBucket;
  /**
   * Bucket validation check list
   */
  readonly validationCheckList: string[];
  /**
   * Bucket encryption type
   */
  readonly encryptionType: 'kms' | 's3';
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
}

/**
 * Class for ValidateBucket
 */
export class ValidateBucket extends Construct {
  public bucketKmsArn: string | undefined;
  constructor(scope: Construct, id: string, props: ValidateBucketProps) {
    super(scope, id);

    const resourceName = 'ValidateBucket';

    const lzaCustomResource = new LzaCustomResource(this, resourceName, {
      resource: {
        name: resourceName,
        parentId: id,
        properties: [
          { bucketName: props.bucket.bucketName },
          { validationCheckList: props.validationCheckList },
          { encryptionType: props.encryptionType },
        ],
        forceUpdate: true, // Force custom resource to execute to check if encryption changed for the bucket from last LZA deployment
      },
      lambda: {
        assetPath: path.join(__dirname, 'validate-bucket-config/dist'),
        environmentEncryptionKmsKey: props.customResourceLambdaEnvironmentEncryptionKmsKey,
        cloudWatchLogKmsKey: props.customResourceLambdaCloudWatchLogKmsKey,
        cloudWatchLogRetentionInDays: props.customResourceLambdaLogRetentionInDays,
        timeOut: cdk.Duration.minutes(5),
        roleInitialPolicy: [
          new cdk.aws_iam.PolicyStatement({
            effect: cdk.aws_iam.Effect.ALLOW,
            actions: ['s3:GetEncryptionConfiguration'],
            resources: [props.bucket.bucketArn],
          }),
        ],
      },
    });

    if (props.encryptionType === 'kms') {
      this.bucketKmsArn = lzaCustomResource.resource.getAtt('bucketKmsArn').toString();
    }
  }
}
