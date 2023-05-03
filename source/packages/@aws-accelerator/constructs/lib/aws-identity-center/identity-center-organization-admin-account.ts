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
import { NagSuppressions } from 'cdk-nag';
import * as path from 'path';
import { IdentityCenterPermissionSetConfig } from '@aws-accelerator/config';

/**
 * Initialized IdentityCenterOrganizationalAdminAccountProps properties
 */
export interface IdentityCenterOrganizationalAdminAccountProps {
  /**
   * Delegated Admin Account Id
   */
  readonly adminAccountId: string;
  /**
   * List of LZA Managed Permission Sets from IAM Config
   */
  readonly lzaManagedPermissionSets: IdentityCenterPermissionSetConfig[];
  /**
   * List of LZA Managed Assignments from IAM Config
   */
  readonly lzaManagedAssignments: { [x: string]: string[] }[];
}

/**
 * Class for IdentityCenterOrganizationAdminAccount
 */
export class IdentityCenterOrganizationAdminAccount extends Construct {
  readonly provider: cdk.custom_resources.Provider;
  readonly resource: cdk.Resource;
  constructor(scope: Construct, id: string, props: IdentityCenterOrganizationalAdminAccountProps) {
    super(scope, id);
    const functionId = `${id}ProviderLambda`;
    const providerLambda = new cdk.aws_lambda.Function(this, functionId, {
      code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, 'enable-organization-admin-account/dist')),
      runtime: cdk.aws_lambda.Runtime.NODEJS_16_X,
      timeout: cdk.Duration.seconds(160),
      initialPolicy: [
        new cdk.aws_iam.PolicyStatement({
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: [
            'organizations:ListDelegatedAdministrators',
            'organizations:RegisterDelegatedAdministrator',
            'organizations:DeregisterDelegatedAdministrator',
            'organizations:EnableAwsServiceAccess',
            'organizations:DisableAWSServiceAccess',
            'organizations:DescribeAccount',
            'organizations:DescribeOrganization',
            'organizations:DescribeOrganizationalUnit',
            'organizations:ListAccounts',
            'organizations:ListAWSServiceAccessForOrganization',
            'sso:ListInstances',
            'sso:ListPermissionSets',
            'sso:ListAccountAssignments',
            'sso:DescribePermissionSet',
          ],
          resources: ['*'],
        }),
      ],
      handler: 'index.handler',
    });

    this.provider = new cdk.custom_resources.Provider(this, 'Resource', {
      onEventHandler: providerLambda,
    });

    // Adding UUID, we need to force this to run every time in case there is problems with Deregistering.
    this.resource = new cdk.CustomResource(this, `identityCenterAdmin`, {
      serviceToken: this.provider.serviceToken,
      properties: {
        adminAccountId: props.adminAccountId,
        partition: cdk.Stack.of(scope).partition,
        lzaManagedPermissionSets: props.lzaManagedPermissionSets,
        lzaManagedAssignments: props.lzaManagedAssignments,
      },
    });

    const stack = cdk.Stack.of(scope);

    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
    NagSuppressions.addResourceSuppressionsByPath(
      stack,
      `${stack.stackName}/${id}/${functionId}/ServiceRole/Resource`,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'AWS Custom resource provider framework-role created by cdk.',
        },
      ],
    );

    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions
    NagSuppressions.addResourceSuppressionsByPath(
      stack,
      `${stack.stackName}/${id}/${functionId}/ServiceRole/DefaultPolicy/Resource`,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Allows only specific policy.',
        },
      ],
    );

    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
    NagSuppressions.addResourceSuppressionsByPath(
      stack,
      `${stack.stackName}/${id}/Resource/framework-onEvent/ServiceRole/Resource`,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'AWS Custom resource provider framework-role created by cdk.',
        },
      ],
    );

    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions
    NagSuppressions.addResourceSuppressionsByPath(
      stack,
      `${stack.stackName}/${id}/Resource/framework-onEvent/ServiceRole/DefaultPolicy/Resource`,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Allows only specific policy.',
        },
      ],
    );
  }
}
