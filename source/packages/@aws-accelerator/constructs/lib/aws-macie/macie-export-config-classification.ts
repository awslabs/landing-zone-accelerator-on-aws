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

import { Bucket } from '@aws-accelerator/constructs';
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { v4 as uuidv4 } from 'uuid';

const path = require('path');

/**
 * Initialized MacieExportConfigClassificationProps properties
 */
export interface MacieExportConfigClassificationProps {
  readonly region: string;
  readonly S3keyPrefix: string;
}

/**
 * Aws MacieSession export configuration classification
 */
export class MacieExportConfigClassification extends Construct {
  public readonly id: string = '';

  constructor(scope: Construct, id: string, props: MacieExportConfigClassificationProps) {
    super(scope, id);

    const MACIE_RESOURCE_TYPE = 'Custom::MaciePutClassificationExportConfiguration';

    // Create MacieSession export config bucket
    const bucket = new Bucket(this, 'AwsMacieExportConfigBucket', {
      s3BucketName: `aws-accelerator-security-macie-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
      kmsAliasName: 'alias/accelerator/security/macie/s3',
      kmsDescription: 'AWS Accelerator MacieSession Export Config Bucket CMK',
    });

    // cfn_nag: Suppress warning related to the accelerator security macie export config S3 bucket
    const cfnBucket = bucket.node.defaultChild?.node.defaultChild as s3.CfnBucket;
    cfnBucket.cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: 'W35',
            reason: 'S3 Bucket access logging is not enabled for the accelerator security macie export config bucket.',
          },
        ],
      },
    };

    const maciePutClassificationExportConfigurationFunction = cdk.CustomResourceProvider.getOrCreateProvider(
      this,
      MACIE_RESOURCE_TYPE,
      {
        codeDirectory: path.join(__dirname, 'put-export-config-classification/dist'),
        runtime: cdk.CustomResourceProviderRuntime.NODEJS_14_X,
        policyStatements: [
          {
            Sid: 'MaciePutClassificationExportConfigurationTaskMacieActions',
            Effect: 'Allow',
            Action: [
              'macie2:EnableMacie',
              'macie2:GetClassificationExportConfiguration',
              'macie2:GetMacieSession',
              'macie2:PutClassificationExportConfiguration',
            ],
            Resource: '*',
          },
        ],
      },
    );

    // Update the bucket policy to allow the custom resource to write
    const customLambdaBucketGrant = bucket
      .getS3Bucket()
      .grantReadWrite(new iam.ArnPrincipal(maciePutClassificationExportConfigurationFunction.roleArn));

    // Update the bucket policy to allow the custom resource to write
    const macieBucketGrant = bucket.getS3Bucket().grantReadWrite(new iam.ServicePrincipal('macie.amazonaws.com'));

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: MACIE_RESOURCE_TYPE,
      serviceToken: maciePutClassificationExportConfigurationFunction.serviceToken,
      properties: {
        region: props.region,
        bucketName: bucket.getS3Bucket().bucketName,
        keyPrefix: props.S3keyPrefix,
        kmsKeyArn: bucket.getS3Bucket().encryptionKey!.keyArn,
        uuid: uuidv4(), // Generates a new UUID to force the resource to update
      },
    });

    // Ensure bucket policy is deleted AFTER the custom resource
    resource.node.addDependency(customLambdaBucketGrant);
    resource.node.addDependency(macieBucketGrant);

    // We also tag the bucket to record the fact that it has access for macie principal.
    cdk.Tags.of(bucket).add('aws-cdk:auto-macie-access-bucket', 'true');

    this.id = resource.ref;
  }
}
