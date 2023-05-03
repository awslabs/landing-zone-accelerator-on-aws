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
 * Initialized SecurityHubMembersProps properties
 */
export interface SecurityHubMembersProps {
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
 * Class - SecurityHubMembers
 */
export class SecurityHubMembers extends Construct {
  public readonly id: string;

  constructor(scope: Construct, id: string, props: SecurityHubMembersProps) {
    super(scope, id);

    const RESOURCE_TYPE = 'Custom::SecurityHubCreateMembers';

    const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, RESOURCE_TYPE, {
      codeDirectory: path.join(__dirname, 'create-members/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_16_X,
      policyStatements: [
        {
          Sid: 'SecurityHubCreateMembersTaskOrganizationAction',
          Effect: 'Allow',
          Action: ['organizations:ListAccounts'],
          Resource: '*',
          Condition: {
            StringLikeIfExists: {
              'organizations:ListAccounts': ['securityhub.amazonaws.com'],
            },
          },
        },
        {
          Sid: 'SecurityHubCreateMembersTaskSecurityHubActions',
          Effect: 'Allow',
          Action: [
            'securityhub:CreateMembers',
            'securityhub:DeleteMembers',
            'securityhub:DisassociateMembers',
            'securityhub:EnableSecurityHub',
            'securityhub:ListMembers',
            'securityhub:UpdateOrganizationConfiguration',
          ],
          Resource: '*',
        },
      ],
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: RESOURCE_TYPE,
      serviceToken: provider.serviceToken,
      properties: {
        region: cdk.Stack.of(this).region,
        partition: cdk.Aws.PARTITION,
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

    this.id = resource.ref;
  }
}
