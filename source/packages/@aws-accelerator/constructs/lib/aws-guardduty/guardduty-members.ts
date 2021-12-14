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
 * Initialized GuardDutyMembersProps properties
 */
export interface GuardDutyMembersProps {
  readonly region: string;
  readonly enableS3Protection: boolean;
}

/**
 /**
 * Class to GuardDuty Members
 */
export class GuardDutyMembers extends Construct {
  public readonly id: string;

  constructor(scope: Construct, id: string, props: GuardDutyMembersProps) {
    super(scope, id);

    const CREATE_MEMBERS_RESOURCE_TYPE = 'Custom::GuardDutyCreateMembers';

    const addMembersFunction = cdk.CustomResourceProvider.getOrCreateProvider(this, CREATE_MEMBERS_RESOURCE_TYPE, {
      codeDirectory: path.join(__dirname, 'create-members/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_14_X,
      policyStatements: [
        {
          Sid: 'GuardDutyCreateMembersTaskOrganizationAction',
          Effect: 'Allow',
          Action: ['organizations:ListAccounts'],
          Resource: '*',
          Condition: {
            StringLikeIfExists: {
              'organizations:ListAccounts': ['guardduty.amazonaws.com'],
            },
          },
        },
        {
          Sid: 'GuardDutyCreateMembersTaskGuardDutyActions',
          Effect: 'Allow',
          Action: [
            'guardDuty:ListDetectors',
            'guardDuty:ListOrganizationAdminAccounts',
            'guardDuty:UpdateOrganizationConfiguration',
            'guardduty:CreateMembers',
            'guardduty:DeleteMembers',
            'guardduty:DisassociateMembers',
            'guardduty:ListDetectors',
            'guardduty:ListMembers',
          ],
          Resource: '*',
        },
      ],
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: CREATE_MEMBERS_RESOURCE_TYPE,
      serviceToken: addMembersFunction.serviceToken,
      properties: {
        region: props.region,
        enableS3Protection: props.enableS3Protection,
        uuid: uuidv4(), // Generates a new UUID to force the resource to update
      },
    });

    this.id = resource.ref;
  }
}
