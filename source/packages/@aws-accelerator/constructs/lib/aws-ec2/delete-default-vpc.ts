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
 * Class Delete the Default VPC
 */
export class DeleteDefaultVpc extends Construct {
  readonly id: string;
  constructor(scope: Construct, id: string) {
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
          Action: [
            'ec2:DeleteInternetGateway',
            'ec2:DetachInternetGateway',
            'ec2:DeleteNetworkAcl',
            'ec2:DeleteRoute',
            'ec2:DeleteSecurityGroup',
            'ec2:DeleteSubnet',
            'ec2:DeleteVpc',
            'ec2:DescribeInternetGateways',
            'ec2:DescribeNetworkAcls',
            'ec2:DescribeRouteTables',
            'ec2:DescribeSecurityGroups',
            'ec2:DescribeSubnets',
            'ec2:DescribeVpcs',
          ],
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
