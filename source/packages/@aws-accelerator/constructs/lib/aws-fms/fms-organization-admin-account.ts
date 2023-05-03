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

const path = require('path');

/**
 * Initialized FMSOrganizationalAdminAccountProps properties
 */
export interface FMSOrganizationalAdminAccountProps {
  /**
   * Assume Role Name for deregistering FMS Admin
   */
  readonly assumeRole: string;
  /**
   * Admin account id
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
 * Class for FMSOrganizationAdminAccount
 */
export class FMSOrganizationAdminAccount extends Construct {
  readonly provider: cdk.custom_resources.Provider;
  readonly resource: cdk.Resource;
  constructor(scope: Construct, id: string, props: FMSOrganizationalAdminAccountProps) {
    super(scope, id);
    const functionId = `${id}ProviderLambda`;
    const providerLambda = new cdk.aws_lambda.Function(this, functionId, {
      code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, 'enable-organization-admin-account/dist')),
      runtime: cdk.aws_lambda.Runtime.NODEJS_16_X,
      timeout: cdk.Duration.seconds(180),
      initialPolicy: [
        new cdk.aws_iam.PolicyStatement({
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: [
            'fms:AssociateAdminAccount',
            'fms:DisassociateAdminAccount',
            'fms:GetAdminAccount',
            'organizations:DescribeAccount',
            'organizations:DescribeOrganization',
            'organizations:DescribeOrganizationalUnit',
            'organizations:DeregisterDelegatedAdministrator',
            'organizations:DisableAWSServiceAccess',
            'organizations:EnableAwsServiceAccess',
            'organizations:ListAccounts',
            'organizations:ListAWSServiceAccessForOrganization',
            'organizations:ListChildren',
            'organizations:ListDelegatedAdministrators',
            'organizations:ListDelegatedServicesForAccount',
            'organizations:ListOrganizationalUnitsForParent',
            'organizations:ListParents',
            'organizations:ListRoots',
            'organizations:RegisterDelegatedAdministrator',
          ],
          resources: ['*'],
        }),
        new cdk.aws_iam.PolicyStatement({
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['sts:AssumeRole'],
          resources: [`arn:${cdk.Stack.of(this).partition}:iam::${props.adminAccountId}:role/${props.assumeRole}`],
        }),
      ],
      handler: 'index.handler',
    });

    this.provider = new cdk.custom_resources.Provider(this, 'Resource', {
      onEventHandler: providerLambda,
    });

    this.resource = new cdk.CustomResource(this, `fmsAdmin${props.adminAccountId}`, {
      serviceToken: this.provider.serviceToken,
      properties: {
        adminAccountId: props.adminAccountId,
        assumeRoleName: props.assumeRole,
        partition: cdk.Stack.of(scope).partition,
        region: cdk.Stack.of(this).region,
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
