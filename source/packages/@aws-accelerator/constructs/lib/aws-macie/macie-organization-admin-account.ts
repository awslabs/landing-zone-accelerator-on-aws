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
 * Initialized MacieOrganizationAdminAccount properties
 */
export interface MacieOrganizationalAdminAccountProps {
  /**
   * Macie admin account id
   */
  readonly adminAccountId: string;
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
 * Aws MacieSession organizational Admin Account
 */
export class MacieOrganizationAdminAccount extends Construct {
  public readonly id: string;

  constructor(scope: Construct, id: string, props: MacieOrganizationalAdminAccountProps) {
    super(scope, id);

    const MACIE_RESOURCE_TYPE = 'Custom::MacieEnableOrganizationAdminAccount';

    const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, MACIE_RESOURCE_TYPE, {
      codeDirectory: path.join(__dirname, 'enable-organization-admin-account/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_16_X,
      timeout: cdk.Duration.seconds(180),
      policyStatements: [
        {
          Sid: 'MacieEnableOrganizationAdminAccountTaskOrganizationActions',
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
              'organizations:DeregisterDelegatedAdministrator': ['macie.amazonaws.com'],
              'organizations:DescribeOrganization': ['macie.amazonaws.com'],
              'organizations:EnableAWSServiceAccess': ['macie.amazonaws.com'],
              'organizations:ListAWSServiceAccessForOrganization': ['macie.amazonaws.com'],
              'organizations:ListAccounts': ['macie.amazonaws.com'],
              'organizations:ListDelegatedAdministrators': ['macie.amazonaws.com'],
              'organizations:RegisterDelegatedAdministrator': ['macie.amazonaws.com'],
              'organizations:ServicePrincipal': ['macie.amazonaws.com'],
              'organizations:UpdateOrganizationConfiguration': ['macie.amazonaws.com'],
            },
          },
        },
        {
          Sid: 'MacieEnableOrganizationAdminAccountTaskMacieActions',
          Effect: 'Allow',
          Action: [
            'macie2:DisableOrganizationAdminAccount',
            'macie2:EnableMacie',
            'macie2:EnableOrganizationAdminAccount',
            'macie2:GetMacieSession',
            'macie2:ListOrganizationAdminAccounts',
            'macie2:DisableOrganizationAdminAccount',
            'macie2:GetMacieSession',
            'macie2:EnableMacie',
          ],
          Resource: '*',
        },
        {
          Sid: 'MacieEnableMacieTaskIamAction',
          Effect: 'Allow',
          Action: ['iam:CreateServiceLinkedRole'],
          Resource: '*',
          Condition: {
            StringLikeIfExists: {
              'iam:CreateServiceLinkedRole': ['macie.amazonaws.com'],
            },
          },
        },
      ],
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: MACIE_RESOURCE_TYPE,
      serviceToken: provider.serviceToken,
      properties: {
        region: cdk.Stack.of(this).region,
        adminAccountId: props.adminAccountId,
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
