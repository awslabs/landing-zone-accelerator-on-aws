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
 * Initialized AwsMacieOrganizationAdminAccount properties
 */
export interface AwsMacieOrganizationalAdminAccountProps {
  readonly region: string;
  readonly adminAccountEmail: string;
}

/**
 * Aws Macie organizational Admin Account
 */
export class AwsMacieOrganizationAdminAccount extends cdk.Construct {
  public readonly id: string;

  constructor(scope: cdk.Construct, id: string, props: AwsMacieOrganizationalAdminAccountProps) {
    super(scope, id);

    const enableOrganizationAdminAccountFunction = cdk.CustomResourceProvider.getOrCreateProvider(
      this,
      'Custom::MacieEnableOrganizationAdminAccount',
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
            Action: ['macie2:EnableOrganizationAdminAccount', 'macie2:ListOrganizationAdminAccounts'],
            Resource: '*',
          },
        ],
      },
    );

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: 'Custom::EnableOrganizationAdminAccount',
      serviceToken: enableOrganizationAdminAccountFunction.serviceToken,
      properties: {
        region: props.region,
        adminAccountEmail: props.adminAccountEmail,
        uuid: uuidv4(), // Generates a new UUID to force the resource to update
      },
    });

    this.id = resource.ref;
  }
}
