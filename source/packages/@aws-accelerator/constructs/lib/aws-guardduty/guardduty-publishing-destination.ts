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
import { v4 as uuidv4 } from 'uuid';
import * as iam from '@aws-cdk/aws-iam';
import * as s3 from '@aws-cdk/aws-s3';
import * as compliant_constructs from '@aws-compliant-constructs/compliant-constructs';

const path = require('path');

/**
 * Initialized GuardDutyPublishingDestinationProps properties
 */
export interface GuardDutyPublishingDestinationProps {
  readonly region: string;
  readonly exportDestinationType: string;
}

/**
 * Class - GuardDutyPublishingDestination
 */
export class GuardDutyPublishingDestination extends cdk.Construct {
  public readonly id: string = '';

  constructor(scope: cdk.Construct, id: string, props: GuardDutyPublishingDestinationProps) {
    super(scope, id);

    const ENABLE_GUARDDUTY_PUBLISHING_DEST_RESOURCE_TYPE = 'Custom::GuardDutyCreatePublishingDestinationCommand';

    // Create MacieSession export config bucket
    const bucket = new compliant_constructs.SecureS3Bucket(this, 'GuardDutyPublishingDestinationBucket', {
      s3BucketName: `aws-accelerator-security-guardduty-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
      kmsAliasName: 'alias/accelerator/security/guardduty/s3',
      kmsDescription: 'AWS Accelerator GuardDuty Publishing Destination Bucket CMK',
    });

    // cfn_nag: Suppress warning related to the accelerator security macie export config S3 bucket
    const cfnBucket = bucket.node.defaultChild?.node.defaultChild as s3.CfnBucket;
    cfnBucket.cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: 'W35',
            reason:
              'S3 Bucket access logging is not enabled for the accelerator security guardduty publishing destination bucket.',
          },
        ],
      },
    };

    const guardDutyCreatePublishingDestinationCommandFunction = cdk.CustomResourceProvider.getOrCreateProvider(
      this,
      ENABLE_GUARDDUTY_PUBLISHING_DEST_RESOURCE_TYPE,
      {
        codeDirectory: path.join(__dirname, 'create-publishing-destination/dist'),
        runtime: cdk.CustomResourceProviderRuntime.NODEJS_14_X,
        policyStatements: [
          {
            Sid: 'GuardDutyCreatePublishingDestinationCommandTaskGuardDutyActions',
            Effect: 'Allow',
            Action: [
              'guardDuty:CreateDetector',
              'guardDuty:CreatePublishingDestination',
              'guardDuty:DeletePublishingDestination',
              'guardDuty:ListDetectors',
              'guardDuty:ListPublishingDestinations',
            ],
            Resource: '*',
          },
        ],
      },
    );

    // Update the bucket policy to allow the custom resource to write
    const customLambdaBucketGrant = bucket
      .getS3Bucket()
      .grantReadWrite(new iam.ArnPrincipal(guardDutyCreatePublishingDestinationCommandFunction.roleArn));

    // Update the bucket policy to allow the custom resource to write
    const guardDutyBucketGrant = bucket
      .getS3Bucket()
      .grantReadWrite(new iam.ServicePrincipal('guardduty.amazonaws.com'));

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: ENABLE_GUARDDUTY_PUBLISHING_DEST_RESOURCE_TYPE,
      serviceToken: guardDutyCreatePublishingDestinationCommandFunction.serviceToken,
      properties: {
        region: props.region,
        exportDestinationType: props.exportDestinationType,
        bucketArn: bucket.getS3Bucket().bucketArn,
        kmsKeyArn: bucket.getS3Bucket().encryptionKey!.keyArn,
        uuid: uuidv4(), // Generates a new UUID to force the resource to update
      },
    });

    // Ensure bucket policy is deleted AFTER the custom resource
    resource.node.addDependency(customLambdaBucketGrant);
    resource.node.addDependency(guardDutyBucketGrant);

    // We also tag the bucket to record the fact that it has access for macie principal.
    cdk.Tags.of(bucket).add('aws-cdk:auto-macie-access-bucket', 'true');

    this.id = resource.ref;
  }
}
