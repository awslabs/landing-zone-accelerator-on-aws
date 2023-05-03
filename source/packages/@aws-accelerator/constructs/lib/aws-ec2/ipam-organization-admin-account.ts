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
import * as path from 'path';

export interface IEnableIpamOrgAdminAccount extends cdk.IResource {
  /**
   * The account ID of the delegated administrator.
   */
  readonly accountId: string;
}

export interface EnableIpamOrgAdminAccountProps {
  /**
   * The account ID to delegate admin privileges.
   */
  readonly accountId: string;
  /**
   * Custom resource lambda log group encryption key
   */
  readonly kmsKey: cdk.aws_kms.Key;
  /**
   * Custom resource lambda log retention in days
   */
  readonly logRetentionInDays: number;
}

export class IpamOrganizationAdminAccount extends cdk.Resource implements IEnableIpamOrgAdminAccount {
  public readonly accountId: string;

  constructor(scope: Construct, id: string, props: EnableIpamOrgAdminAccountProps) {
    super(scope, id);

    this.accountId = props.accountId;

    const ENABLE_IPAM_ADMIN = 'Custom::EnableIpamOrganizationAdminAccount';

    const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, ENABLE_IPAM_ADMIN, {
      codeDirectory: path.join(__dirname, 'enable-ipam-organization-admin/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_16_X,
      policyStatements: [
        {
          Effect: 'Allow',
          Action: ['ec2:DisableIpamOrganizationAdminAccount', 'ec2:EnableIpamOrganizationAdminAccount'],
          Resource: '*',
        },
        {
          Effect: 'Allow',
          Action: [
            'organizations:DisableAwsServiceAccess',
            'organizations:EnableAwsServiceAccess',
            'organizations:DeregisterDelegatedAdministrator',
            'organizations:RegisterDelegatedAdministrator',
          ],
          Resource: '*',
          Condition: {
            StringLikeIfExists: {
              'organizations:ServicePrincipal': ['ipam.amazonaws.com'],
            },
          },
        },
        {
          Effect: 'Allow',
          Action: ['iam:CreateServiceLinkedRole', 'iam:DeleteServiceLinkedRole'],
          Resource: '*',
          Condition: {
            StringLikeIfExists: {
              'iam:AWSServiceName': ['ipam.amazonaws.com'],
            },
          },
        },
      ],
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: ENABLE_IPAM_ADMIN,
      serviceToken: provider.serviceToken,
      properties: {
        accountId: this.accountId,
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
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });
    resource.node.addDependency(logGroup);
  }
}
