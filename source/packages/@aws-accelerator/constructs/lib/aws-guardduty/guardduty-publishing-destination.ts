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
import { Construct } from 'constructs';

const path = require('path');

/**
 * Initialized GuardDutyPublishingDestinationProps properties
 */
export interface GuardDutyPublishingDestinationProps {
  readonly region: string;
  readonly bucketArn: string;
  readonly kmsKeyArn: string;
  readonly exportDestinationType: string;
}

/**
 * Class - GuardDutyPublishingDestination
 */
export class GuardDutyPublishingDestination extends Construct {
  public readonly id: string = '';

  constructor(scope: Construct, id: string, props: GuardDutyPublishingDestinationProps) {
    super(scope, id);

    const RESOURCE_TYPE = 'Custom::GuardDutyCreatePublishingDestinationCommand';

    const customResourceProvider = cdk.CustomResourceProvider.getOrCreateProvider(this, RESOURCE_TYPE, {
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
            'iam:CreateServiceLinkedRole',
          ],
          Resource: '*',
        },
      ],
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: RESOURCE_TYPE,
      serviceToken: customResourceProvider.serviceToken,
      properties: {
        region: props.region,
        exportDestinationType: props.exportDestinationType,
        bucketArn: props.bucketArn,
        kmsKeyArn: props.kmsKeyArn,
      },
    });

    this.id = resource.ref;
  }
}
