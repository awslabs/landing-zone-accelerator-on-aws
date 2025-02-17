/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import { PolicyStatementType } from '@aws-accelerator/utils/lib/common-resources';
import { CUSTOM_RESOURCE_PROVIDER_RUNTIME } from '../../../utils/lib/lambda';

const path = require('path');

/**
 * Initialized AuditManagerOrganizationalAdminAccountProps properties
 */
export interface AuditManagerOrganizationalAdminAccountProps {
  /**
   * Management account id
   */
  readonly managementAccountId: string;
  /**
   * Admin account id
   */
  readonly adminAccountId: string;
  /**
   * Custom resource lambda log group encryption key, when undefined default AWS managed key will be used
   */
  readonly kmsKey?: cdk.aws_kms.IKey;
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
      runtime: CUSTOM_RESOURCE_PROVIDER_RUNTIME,
      policyStatements: AuditManagerOrganizationAdminAccount.getCustomResourceRolePolicyStatements(
        props.kmsKey?.keyArn,
      ),
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: RESOURCE_TYPE,
      serviceToken: provider.serviceToken,
      properties: {
        managementAccountId: props.managementAccountId,
        region: cdk.Stack.of(this).region,
        adminAccountId: props.adminAccountId,
        kmsKeyArn: props.kmsKey ? props.kmsKey.keyArn : undefined,
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

  /**
   * Function to configure custom resource IAM role permission statements
   * @param keyArn string | undefined
   * @returns statements {@link PolicyStatementType}[]
   */
  public static getCustomResourceRolePolicyStatements(keyArn?: string): PolicyStatementType[] {
    const serviceName = 'auditmanager.amazonaws.com';
    const statements: PolicyStatementType[] = [
      {
        Sid: 'OrganizationsPermissions',
        Effect: 'Allow',
        Action: [
          'organizations:DescribeOrganization',
          'organizations:EnableAWSServiceAccess',
          'organizations:ListAWSServiceAccessForOrganization',
          'organizations:RegisterDelegatedAdministrator',
        ],
        Resource: '*',
        Condition: {
          StringLikeIfExists: {
            'organizations:DescribeOrganization': [serviceName],
            'organizations:EnableAWSServiceAccess': [serviceName],
            'organizations:ListAWSServiceAccessForOrganization': [serviceName],
            'organizations:RegisterDelegatedAdministrator': [serviceName],
          },
        },
      },
      {
        Sid: 'AuditManagerIamPermission',
        Effect: 'Allow',
        Action: ['iam:CreateServiceLinkedRole'],
        Resource: ['*'],
        Condition: {
          StringLikeIfExists: {
            'iam:CreateServiceLinkedRole': [serviceName],
          },
        },
      },
      {
        Sid: 'AuditManagerPermissions',
        Effect: 'Allow',
        Action: [
          'auditmanager:DeregisterOrganizationAdminAccount',
          'auditmanager:GetAccountStatus',
          'auditmanager:GetOrganizationAdminAccount',
          'auditmanager:GetSettings',
          'auditmanager:RegisterAccount',
          'auditmanager:RegisterOrganizationAdminAccount',
          'auditmanager:UpdateSettings',
        ],
        Resource: '*',
      },
    ];

    if (keyArn) {
      statements.push({
        Sid: 'AuditManagerEnableKmsKeyGrants',
        Effect: 'Allow',
        Action: 'kms:CreateGrant',
        Resource: keyArn,
        Condition: {
          StringLike: {
            'kms:ViaService': 'auditmanager.*.amazonaws.com',
          },
          Bool: {
            'kms:GrantIsForAWSResource': 'true',
          },
        },
      });
    }

    return statements;
  }
}
