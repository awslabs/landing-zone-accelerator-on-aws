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

const path = require('path');

/**
 * Initialized SecurityHubMembersProps properties
 */
export interface SecurityHubMembersProps {
  readonly region: string;
}

/**
 /**
 * Class - SecurityHubMembers
 */
export class SecurityHubMembers extends cdk.Construct {
  public readonly id: string;

  constructor(scope: cdk.Construct, id: string, props: SecurityHubMembersProps) {
    super(scope, id);

    const CREATE_MEMBERS_RESOURCE_TYPE = 'Custom::SecurityHubCreateMembers';

    const addMembersFunction = cdk.CustomResourceProvider.getOrCreateProvider(this, CREATE_MEMBERS_RESOURCE_TYPE, {
      codeDirectory: path.join(__dirname, 'create-members/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_14_X,
      policyStatements: [
        {
          Sid: 'SecurityHubCreateMembersTaskOrganizationAction',
          Effect: 'Allow',
          Action: ['organizations:ListAccounts'],
          Resource: '*',
          Condition: {
            StringLikeIfExists: {
              'organizations:ListAccounts': ['securityhub.amazonaws.com'],
            },
          },
        },
        {
          Sid: 'SecurityHubCreateMembersTaskSecurityHubActions',
          Effect: 'Allow',
          Action: [
            'securityhub:CreateMembers',
            'securityhub:DeleteMembers',
            'securityhub:DisassociateMembers',
            'securityhub:EnableSecurityHub',
            'securityhub:ListMembers',
            'securityhub:UpdateOrganizationConfiguration',
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
        uuid: uuidv4(), // Generates a new UUID to force the resource to update
      },
    });

    this.id = resource.ref;
  }
}
