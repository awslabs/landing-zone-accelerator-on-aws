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
import { v4 as uuidv4 } from 'uuid';
import { Construct } from 'constructs';

const path = require('path');

/**
 * Export config destination types
 */
export enum GuardDutyExportConfigDestinationTypes {
  S3 = 's3',
}

/**
 * Initialized GuardDutyDetectorConfigProps properties
 */
export interface GuardDutyDetectorConfigProps {
  readonly region: string;
  readonly isExportConfigEnable: boolean;
  readonly exportDestination: string;
  readonly exportFrequency: string;
}

/**
 /**
 * Class to GuardDuty Detector Members
 */
export class GuardDutyDetectorConfig extends Construct {
  public readonly id: string;

  constructor(scope: Construct, id: string, props: GuardDutyDetectorConfigProps) {
    super(scope, id);

    const UPDATE_DETECTOR_RESOURCE_TYPE = 'Custom::GuardDutyUpdateDetector';

    const addMembersFunction = cdk.CustomResourceProvider.getOrCreateProvider(this, UPDATE_DETECTOR_RESOURCE_TYPE, {
      codeDirectory: path.join(__dirname, 'update-detector-config/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_14_X,
      policyStatements: [
        {
          Sid: 'GuardDutyUpdateDetectorTaskGuardDutyActions',
          Effect: 'Allow',
          Action: [
            'guardduty:ListDetectors',
            'guardduty:ListMembers',
            'guardduty:UpdateDetector',
            'guardduty:UpdateMemberDetectors',
          ],
          Resource: '*',
        },
      ],
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: UPDATE_DETECTOR_RESOURCE_TYPE,
      serviceToken: addMembersFunction.serviceToken,
      properties: {
        region: props.region,
        isExportConfigEnable: props.isExportConfigEnable,
        exportDestination: props.exportDestination,
        exportFrequency: props.exportFrequency,
        uuid: uuidv4(), // Generates a new UUID to force the resource to update
      },
    });

    this.id = resource.ref;
  }
}
