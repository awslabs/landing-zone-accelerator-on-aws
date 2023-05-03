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

export type accountItem = {
  accountId: string;
  name: string;
};
export type orgItem = {
  id: string;
  name: string;
};
type validateScpItem = {
  orgEntity: string;
  orgEntityType: string;
  orgEntityId: string;
  appliedScpName: string[];
};
export interface ValidateScpCountProps {
  organizationUnits: orgItem[];
  accounts: accountItem[];
  scps: validateScpItem[];
  /**
   * Custom resource lambda log group encryption key
   */
  readonly kmsKey: cdk.aws_kms.Key;
  /**
   * Custom resource lambda log retention in days
   */
  readonly logRetentionInDays: number;
}

export class ValidateScpCount extends cdk.Resource {
  constructor(scope: Construct, id: string, props: ValidateScpCountProps) {
    super(scope, id);

    const VALIDATE_SCP_COUNT = 'Custom::ValidateScpCount';

    const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, VALIDATE_SCP_COUNT, {
      codeDirectory: path.join(__dirname, 'list-policy-for-target/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_16_X,
      policyStatements: [
        {
          Effect: 'Allow',
          Action: [
            'organizations:DescribeOrganization',
            'organizations:ListRoots',
            'organizations:ListPoliciesForTarget',
            'organizations:ListTargetsForPolicy',
            'organizations:DescribePolicy',
            'organizations:DescribeAccount',
            'organizations:ListPolicies',
            'organizations:ListAccountsForParent',
            'organizations:ListAccounts',
            'organizations:DescribeOrganizationalUnit',
            'organizations:ListParents',
            'organizations:ListOrganizationalUnitsForParent',
          ],
          Resource: '*',
        },
      ],
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: VALIDATE_SCP_COUNT,
      serviceToken: provider.serviceToken,
      properties: {
        organizationUnits: props.organizationUnits,
        accounts: props.accounts,
        scps: props.scps,
        partition: cdk.Stack.of(this).partition,
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
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });
    resource.node.addDependency(logGroup);
  }
}
