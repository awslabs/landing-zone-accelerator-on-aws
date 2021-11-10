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
 * Class Delete the Default VPC
 */
export class DeleteDefaultVpc extends cdk.Construct {
  readonly id: string;
  constructor(scope: cdk.Construct, id: string) {
    super(scope, id);

    const DELETE_DEFAULT_VPC_TYPE = 'Custom::DeleteDefaultVpc';

    //
    // Function definition for the custom resource
    //
    const cr = cdk.CustomResourceProvider.getOrCreateProvider(this, DELETE_DEFAULT_VPC_TYPE, {
      codeDirectory: path.join(__dirname, 'delete-default-vpc/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_14_X,
      policyStatements: [
        {
          Effect: 'Allow',
          Action: ['s3:PutAccountPublicAccessBlock'],
          Resource: '*',
        },
      ],
    });

    //
    // Custom Resource definition. We want this resource to be evaluated on
    // every CloudFormation update, so we generate a new uuid to force
    // re-evaluation.
    //
    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: DELETE_DEFAULT_VPC_TYPE,
      serviceToken: cr.serviceToken,
      properties: {
        uuid: uuidv4(),
      },
    });

    this.id = resource.ref;
  }
}
