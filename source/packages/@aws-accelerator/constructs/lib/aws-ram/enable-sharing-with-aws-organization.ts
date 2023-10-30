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

export interface EnableSharingWithAwsOrganizationProps {
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
 * Class to initialize Policy
 */
export class EnableSharingWithAwsOrganization extends Construct {
  readonly id: string;

  constructor(scope: Construct, id: string, props: EnableSharingWithAwsOrganizationProps) {
    super(scope, id);

    const ENABLE_SHARING_WITH_AWS_ORGANIZATION_TYPE = 'Custom::EnableSharingWithAwsOrganization';

    //
    // Function definition for the custom resource
    //
    const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, ENABLE_SHARING_WITH_AWS_ORGANIZATION_TYPE, {
      codeDirectory: path.join(__dirname, 'enable-sharing-with-aws-organization/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_16_X,
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
      serviceToken: provider.serviceToken,
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
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });
    resource.node.addDependency(logGroup);

    this.id = resource.ref;
  }
}
