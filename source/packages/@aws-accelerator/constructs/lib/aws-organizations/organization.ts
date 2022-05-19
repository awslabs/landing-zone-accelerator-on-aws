/**
 *  Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
 * Class to initialize Organization
 */
export class Organization extends Construct {
  public readonly id: string;

  public constructor(scope: Construct, id: string) {
    super(scope, id);

    const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, 'Custom::OrganizationsDescribeOrganization', {
      codeDirectory: path.join(__dirname, 'describe-organization/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_14_X,
      policyStatements: [
        {
          Effect: 'Allow',
          Action: ['organizations:DescribeOrganization'],
          Resource: '*',
        },
      ],
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: 'Custom::DescribeOrganization',
      serviceToken: provider.serviceToken,
      properties: {
        partition: cdk.Aws.PARTITION,
      },
    });

    this.id = resource.ref;
  }
}
