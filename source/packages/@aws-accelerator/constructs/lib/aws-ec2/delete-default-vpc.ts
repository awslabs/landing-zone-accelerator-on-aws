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
 * Initialized DeleteDefaultVpcProps properties
 */
export interface DeleteDefaultVpcProps {
  /**
   * Custom resource lambda log group encryption key
   */
  readonly kmsKey: cdk.aws_kms.Key;
  /**
   * Custom resource lambda log retention in days
   */
  readonly logRetentionInDays: number;
}

/**
 * Class Delete the Default VPC
 */
export class DeleteDefaultVpc extends Construct {
  readonly id: string;
  static isLogGroupConfigured = false;
  constructor(scope: Construct, id: string, props: DeleteDefaultVpcProps) {
    super(scope, id);

    const DELETE_DEFAULT_VPC_TYPE = 'Custom::DeleteDefaultVpc';

    //
    // Function definition for the custom resource
    //
    const customResourceProvider = cdk.CustomResourceProvider.getOrCreateProvider(this, DELETE_DEFAULT_VPC_TYPE, {
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

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: DELETE_DEFAULT_VPC_TYPE,
      serviceToken: customResourceProvider.serviceToken,
    });

    /**
     * Pre-Creating log group to enable encryption and log retention.
     * Below construct needs to be static
     * isLogGroupConfigured flag used to make sure log group construct synthesize only once in the stack
     */
    if (!DeleteDefaultVpc.isLogGroupConfigured) {
      const logGroup = new cdk.aws_logs.LogGroup(this, 'LogGroup', {
        logGroupName: `/aws/lambda/${
          (customResourceProvider.node.findChild('Handler') as cdk.aws_lambda.CfnFunction).ref
        }`,
        retention: props.logRetentionInDays,
        encryptionKey: props.kmsKey,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });

      resource.node.addDependency(logGroup);

      // Enable the flag to indicate log group configured
      DeleteDefaultVpc.isLogGroupConfigured = true;
    }

    this.id = resource.ref;
  }
}
