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

export interface IOrganizationalUnit extends cdk.IResource {
  readonly organizationalUnitName: string;
  readonly organizationalUnitPath: string;
  readonly organizationalUnitId: string;
  readonly organizationalUnitArn: string;
}

/**
 * Initialized OrganizationalUnit properties
 */
export interface OrganizationalUnitProps {
  readonly name: string;
  readonly path: string;
}

/**
 * Class to initialize OrganizationalUnit
 */
export class OrganizationalUnit extends cdk.Resource implements IOrganizationalUnit {
  public readonly organizationalUnitName: string;
  public readonly organizationalUnitPath: string;
  public readonly organizationalUnitId: string;
  public readonly organizationalUnitArn: string;

  constructor(scope: Construct, id: string, props: OrganizationalUnitProps) {
    super(scope, id);

    this.organizationalUnitName = props.name;
    this.organizationalUnitPath = props.path;

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
              'organizations:ListRoots',
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
        partition: cdk.Aws.PARTITION,
        ...props,
      },
    });

    this.organizationalUnitId = resource.ref;
    this.organizationalUnitArn = resource.getAttString('arn');
  }
}
