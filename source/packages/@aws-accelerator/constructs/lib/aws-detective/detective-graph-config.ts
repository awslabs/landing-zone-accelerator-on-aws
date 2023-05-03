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
 * Initialized DetectiveGraphConfigProps properties
 */
export interface DetectiveGraphConfigProps {
  /**
   * Custom resource lambda log group encryption key
   */
  readonly kmsKey: cdk.aws_kms.IKey;
  /**
   * Custom resource lambda log retention in days
   */
  readonly logRetentionInDays: number;
}

/**
 /**
 * Class to Detective Graph Members
 */
export class DetectiveGraphConfig extends Construct {
  public readonly id: string;

  constructor(scope: Construct, id: string, props: DetectiveGraphConfigProps) {
    super(scope, id);

    const RESOURCE_TYPE = 'Custom::DetectiveUpdateGraph';

    const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, RESOURCE_TYPE, {
      codeDirectory: path.join(__dirname, 'update-graph-config/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_16_X,
      policyStatements: [
        {
          Sid: 'DetectiveConfigureOrganizationAdminAccountTaskOrganizationActions',
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
              'organizations:DeregisterDelegatedAdministrator': ['detective.amazonaws.com'],
              'organizations:DescribeOrganization': ['detective.amazonaws.com'],
              'organizations:EnableAWSServiceAccess': ['detective.amazonaws.com'],
              'organizations:ListAWSServiceAccessForOrganization': ['detective.amazonaws.com'],
              'organizations:ListAccounts': ['detective.amazonaws.com'],
              'organizations:ListDelegatedAdministrators': ['detective.amazonaws.com'],
              'organizations:RegisterDelegatedAdministrator': ['detective.amazonaws.com'],
              'organizations:ServicePrincipal': ['detective.amazonaws.com'],
              'organizations:UpdateOrganizationConfiguration': ['detective.amazonaws.com'],
            },
          },
        },
        {
          Sid: 'DetectiveUpdateGraphTaskDetectiveActions',
          Effect: 'Allow',
          Action: ['detective:UpdateOrganizationConfiguration', 'detective:ListGraphs', 'detective:ListMembers'],
          Resource: '*',
        },
      ],
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: RESOURCE_TYPE,
      serviceToken: provider.serviceToken,
      properties: {
        region: cdk.Stack.of(this).region,
      },
    });

    /**
     * Singleton pattern to define the log group for the singleton function
     * in the stack
     */
    const stack = cdk.Stack.of(scope);
    const logGroup =
      (stack.node.tryFindChild(`${provider.node.id}LogGroup`) as cdk.aws_logs.LogGroup) ??
      new cdk.aws_logs.LogGroup(stack, `${provider.node.id}LogGroup`, {
        logGroupName: `/aws/lambda/${(provider.node.findChild('Handler') as cdk.aws_lambda.CfnFunction).ref}`,
        retention: props.logRetentionInDays,
        encryptionKey: props.kmsKey,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      });
    resource.node.addDependency(logGroup);

    this.id = resource.ref;
  }
}
