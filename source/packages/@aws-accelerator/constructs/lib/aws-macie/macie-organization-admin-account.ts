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
 * Initialized MacieOrganizationAdminAccount properties
 */
export interface MacieOrganizationalAdminAccountProps {
  readonly region: string;
  readonly adminAccountId: string;
}

/**
 * Aws MacieSession organizational Admin Account
 */
export class MacieOrganizationAdminAccount extends cdk.Construct {
  public readonly id: string;

  constructor(scope: cdk.Construct, id: string, props: MacieOrganizationalAdminAccountProps) {
    super(scope, id);

    const MACIE_RESOURCE_TYPE = 'Custom::MacieEnableOrganizationAdminAccount';

    const enableOrganizationAdminAccountFunction = cdk.CustomResourceProvider.getOrCreateProvider(
      this,
      MACIE_RESOURCE_TYPE,
      {
        codeDirectory: path.join(__dirname, 'enable-organization-admin-account/dist'),
        runtime: cdk.CustomResourceProviderRuntime.NODEJS_14_X,
        policyStatements: [
          {
            Sid: 'MacieEnableOrganizationAdminAccountTaskOrganizationActions',
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
                'organizations:DeregisterDelegatedAdministrator': ['macie.amazonaws.com'],
                'organizations:DescribeOrganization': ['macie.amazonaws.com'],
                'organizations:EnableAWSServiceAccess': ['macie.amazonaws.com'],
                'organizations:ListAWSServiceAccessForOrganization': ['macie.amazonaws.com'],
                'organizations:ListAccounts': ['macie.amazonaws.com'],
                'organizations:ListDelegatedAdministrators': ['macie.amazonaws.com'],
                'organizations:RegisterDelegatedAdministrator': ['macie.amazonaws.com'],
                'organizations:ServicePrincipal': ['macie.amazonaws.com'],
                'organizations:UpdateOrganizationConfiguration': ['macie.amazonaws.com'],
              },
            },
          },
          {
            Sid: 'MacieEnableOrganizationAdminAccountTaskMacieActions',
            Effect: 'Allow',
            Action: [
              'macie2:EnableOrganizationAdminAccount',
              'macie2:ListOrganizationAdminAccounts',
              'macie2:DisableOrganizationAdminAccount',
            ],
            Resource: '*',
          },
        ],
      },
    );

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: MACIE_RESOURCE_TYPE,
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
