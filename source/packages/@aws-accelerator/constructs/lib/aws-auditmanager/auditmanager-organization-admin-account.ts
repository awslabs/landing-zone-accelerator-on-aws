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
 * Initialized AuditManagerOrganizationalAdminAccountProps properties
 */
export interface AuditManagerOrganizationalAdminAccountProps {
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
 * Class for AuditManagerOrganizationAdminAccount
 */
export class AuditManagerOrganizationAdminAccount extends Construct {
  public readonly id: string;

  constructor(scope: Construct, id: string, props: AuditManagerOrganizationalAdminAccountProps) {
    super(scope, id);

    const RESOURCE_TYPE = 'Custom::AuditManagerEnableOrganizationAdminAccount';

    const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, RESOURCE_TYPE, {
      codeDirectory: path.join(__dirname, 'enable-organization-admin-account/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_16_X,
      policyStatements: [
        {
          Sid: 'AuditManagerEnableOrganizationAdminAccountTaskOrganizationActions',
          Effect: 'Allow',
          Action: [
            'organizations:DeregisterDelegatedAdministrator',
            'organizations:DescribeOrganization',
            'organizations:EnableAWSServiceAccess',
            'organizations:ListAWSServiceAccessForOrganization',
            'organizations:ListAccounts',
            'organizations:ListDelegatedAdministrators',
            'organizations:RegisterDelegatedAdministrator',
          ],
          Resource: '*',
          Condition: {
            StringLikeIfExists: {
              'organizations:DeregisterDelegatedAdministrator': ['auditmanager.amazonaws.com'],
              'organizations:DescribeOrganization': ['auditmanager.amazonaws.com'],
              'organizations:EnableAWSServiceAccess': ['auditmanager.amazonaws.com'],
              'organizations:ListAWSServiceAccessForOrganization': ['auditmanager.amazonaws.com'],
              'organizations:ListAccounts': ['auditmanager.amazonaws.com'],
              'organizations:ListDelegatedAdministrators': ['auditmanager.amazonaws.com'],
              'organizations:RegisterDelegatedAdministrator': ['auditmanager.amazonaws.com'],
            },
          },
        },
        {
          Sid: 'AuditManagerEnableOrganizationAdminAccountTaskDetectiveActions',
          Effect: 'Allow',
          Action: [
            'auditmanager:RegisterAccount',
            'auditmanager:DeregisterAccount',
            'auditmanager:RegisterOrganizationAdminAccount',
            'auditmanager:DeregisterOrganizationAdminAccount',
            'auditmanager:getOrganizationAdminAccount',
          ],
          Resource: '*',
        },
        {
          Sid: 'AuditManagerEnableKmsKeyGrants',
          Effect: 'Allow',
          Action: 'kms:CreateGrant',
          Resource: props.kmsKey.keyArn,
          Condition: {
            StringLike: {
              'kms:ViaService': 'auditmanager.*.amazonaws.com',
            },
            Bool: {
              'kms:GrantIsForAWSResource': 'true',
            },
          },
        },
        {
          Sid: 'ServiceLinkedRoleDetective',
          Effect: 'Allow',
          Action: ['iam:CreateServiceLinkedRole'],
          Resource: ['*'],
        },
      ],
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: RESOURCE_TYPE,
      serviceToken: provider.serviceToken,
      properties: {
        region: cdk.Stack.of(this).region,
        adminAccountId: props.adminAccountId,
        kmsKeyArn: props.kmsKey.keyArn,
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
