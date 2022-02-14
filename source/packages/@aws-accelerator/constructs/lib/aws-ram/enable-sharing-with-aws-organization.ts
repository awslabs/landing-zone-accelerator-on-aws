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
 * Class to initialize Policy
 */
export class EnableSharingWithAwsOrganization extends Construct {
  readonly id: string;
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const ENABLE_SHARING_WITH_AWS_ORGANIZATION_TYPE = 'Custom::EnableSharingWithAwsOrganization';

    //
    // Function definition for the custom resource
    //
    const cr = cdk.CustomResourceProvider.getOrCreateProvider(this, ENABLE_SHARING_WITH_AWS_ORGANIZATION_TYPE, {
      codeDirectory: path.join(__dirname, 'enable-sharing-with-aws-organization/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_14_X,
      policyStatements: [
        {
          Effect: 'Allow',
          Action: [
            'ram:EnableSharingWithAwsOrganization',
            'iam:CreateServiceLinkedRole',
            'organizations:EnableAWSServiceAccess',
            'organizations:ListAWSServiceAccessForOrganization',
            'organizations:DescribeOrganization',
          ],
          Resource: '*',
        },
      ],
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: ENABLE_SHARING_WITH_AWS_ORGANIZATION_TYPE,
      serviceToken: cr.serviceToken,
    });

    this.id = resource.ref;
  }
}
