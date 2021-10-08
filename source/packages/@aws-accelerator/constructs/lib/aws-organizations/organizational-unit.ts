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
 * Initialized OrganizationalUnit properties
 */
export interface OrganizationalUnitProps {
  readonly name: string;
  readonly parentId: string;
}

/**
 * Class to initialize OrganizationalUnit
 */
export class OrganizationalUnit extends cdk.Construct {
  public readonly id: string;
  public readonly name: string;
  public readonly parentId: string;

  constructor(scope: cdk.Construct, id: string, props: OrganizationalUnitProps) {
    super(scope, id);

    this.name = props.name;
    this.parentId = props.parentId;

    const createOrganizationalUnitFunction = cdk.CustomResourceProvider.getOrCreateProvider(
      this,
      'Custom::OrganizationsCreateOrganizationalUnit',
      {
        codeDirectory: path.join(__dirname, 'create-organizational-unit/dist'),
        runtime: cdk.CustomResourceProviderRuntime.NODEJS_14_X,
        policyStatements: [
          {
            Effect: 'Allow',
            Action: [
              'organizations:CreateOrganizationalUnit',
              'organizations:ListOrganizationalUnitsForParent',
              'organizations:UpdateOrganizationalUnit',
            ],
            Resource: '*',
          },
        ],
      },
    );

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: 'Custom::CreateOrganizationalUnit',
      serviceToken: createOrganizationalUnitFunction.serviceToken,
      properties: {
        uuid: uuidv4(), // Generates a new UUID to force the resource to update
        ...props,
      },
    });

    this.id = resource.ref;
  }
}
