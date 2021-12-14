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
 * Initialized GuardDutyOrganizationalAdminAccountProps properties
 */
export interface GuardDutyOrganizationalAdminAccountProps {
  readonly region: string;
  readonly adminAccountId: string;
}

/**
 * Class for GuardDutyOrganizationAdminAccount
 */
export class GuardDutyOrganizationAdminAccount extends Construct {
  public readonly id: string;

  constructor(scope: Construct, id: string, props: GuardDutyOrganizationalAdminAccountProps) {
    super(scope, id);

    const ENABLE_ORGANIZATION_ADMIN_ACCOUNT_RESOURCE_TYPE = 'Custom::GuardDutyEnableOrganizationAdminAccount';

    const enableOrganizationAdminAccountFunction = cdk.CustomResourceProvider.getOrCreateProvider(
      this,
      ENABLE_ORGANIZATION_ADMIN_ACCOUNT_RESOURCE_TYPE,
      {
        codeDirectory: path.join(__dirname, 'enable-organization-admin-account/dist'),
        runtime: cdk.CustomResourceProviderRuntime.NODEJS_14_X,
        policyStatements: [
          {
            Sid: 'GuardDutyEnableOrganizationAdminAccountTaskOrganizationActions',
            Effect: 'Allow',
            Action: [
              'organizations:DeregisterDelegatedAdministrator',
              'organizations:DescribeOrganization',
              'organizations:EnableAWSServiceAccess',
              'organizations:ListAWSServiceAccessForOrganization',
              'organizations:ListAccounts',
              'organizations:ListDelegatedAdministrators',
              'organizations:RegisterDelegatedAdministrator',
              'organizations:ServicePrincipal',
              'organizations:UpdateOrganizationConfiguration',
            ],
            Resource: '*',
            Condition: {
              StringLikeIfExists: {
                'organizations:DeregisterDelegatedAdministrator': ['guardduty.amazonaws.com'],
                'organizations:DescribeOrganization': ['guardduty.amazonaws.com'],
                'organizations:EnableAWSServiceAccess': ['guardduty.amazonaws.com'],
                'organizations:ListAWSServiceAccessForOrganization': ['guardduty.amazonaws.com'],
                'organizations:ListAccounts': ['guardduty.amazonaws.com'],
                'organizations:ListDelegatedAdministrators': ['guardduty.amazonaws.com'],
                'organizations:RegisterDelegatedAdministrator': ['guardduty.amazonaws.com'],
                'organizations:ServicePrincipal': ['guardduty.amazonaws.com'],
                'organizations:UpdateOrganizationConfiguration': ['guardduty.amazonaws.com'],
              },
            },
          },
          {
            Sid: 'GuardDutyEnableOrganizationAdminAccountTaskGuardDutyActions',
            Effect: 'Allow',
            Action: [
              'GuardDuty:EnableOrganizationAdminAccount',
              'GuardDuty:ListOrganizationAdminAccounts',
              'guardduty:DisableOrganizationAdminAccount',
            ],
            Resource: '*',
          },
        ],
      },
    );

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: ENABLE_ORGANIZATION_ADMIN_ACCOUNT_RESOURCE_TYPE,
      serviceToken: enableOrganizationAdminAccountFunction.serviceToken,
      properties: {
        region: props.region,
        adminAccountId: props.adminAccountId,
        uuid: uuidv4(), // Generates a new UUID to force the resource to update
      },
    });

    this.id = resource.ref;
  }
}
