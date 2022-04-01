/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
 * Initialized GuardDutyOrganizationalAdminAccountProps properties
 */
export interface GuardDutyOrganizationalAdminAccountProps {
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
 * Class for GuardDutyOrganizationAdminAccount
 */
export class GuardDutyOrganizationAdminAccount extends Construct {
  public readonly id: string;

  static isLogGroupConfigured = false;

  constructor(scope: Construct, id: string, props: GuardDutyOrganizationalAdminAccountProps) {
    super(scope, id);

    const RESOURCE_TYPE = 'Custom::GuardDutyEnableOrganizationAdminAccount';

    const customResourceProvider = cdk.CustomResourceProvider.getOrCreateProvider(this, RESOURCE_TYPE, {
      codeDirectory: path.join(__dirname, 'enable-organization-admin-account/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_14_X,
      policyStatements: [
        {
          Sid: 'GuardDutyEnableOrganizationAdminAccountTaskOrganizationActions',
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
              'organizations:DeregisterDelegatedAdministrator': ['guardduty.amazonaws.com'],
              'organizations:DescribeOrganization': ['guardduty.amazonaws.com'],
              'organizations:EnableAWSServiceAccess': ['guardduty.amazonaws.com'],
              'organizations:ListAWSServiceAccessForOrganization': ['guardduty.amazonaws.com'],
              'organizations:ListAccounts': ['guardduty.amazonaws.com'],
              'organizations:ListDelegatedAdministrators': ['guardduty.amazonaws.com'],
              'organizations:RegisterDelegatedAdministrator': ['guardduty.amazonaws.com'],
              'organizations:ServicePrincipal': ['guardduty.amazonaws.com'],
              'organizations:UpdateOrganizationConfiguration': ['guardduty.amazonaws.com'],
            },
          },
        },
        {
          Sid: 'GuardDutyEnableOrganizationAdminAccountTaskGuardDutyActions',
          Effect: 'Allow',
          Action: [
            'GuardDuty:EnableOrganizationAdminAccount',
            'GuardDuty:ListOrganizationAdminAccounts',
            'guardduty:DisableOrganizationAdminAccount',
          ],
          Resource: '*',
        },
      ],
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: RESOURCE_TYPE,
      serviceToken: customResourceProvider.serviceToken,
      properties: {
        region: cdk.Stack.of(this).region,
        adminAccountId: props.adminAccountId,
      },
    });

    /**
     * Pre-Creating log group to enable encryption and log retention.
     * Below construct needs to be static
     * isLogGroupConfigured flag used to make sure log group construct synthesize only once in the stack
     */
    if (!GuardDutyOrganizationAdminAccount.isLogGroupConfigured) {
      const logGroup = new cdk.aws_logs.LogGroup(this, 'LogGroup', {
        logGroupName: `/aws/lambda/${
          (customResourceProvider.node.findChild('Handler') as cdk.aws_lambda.CfnFunction).ref
        }`,
        retention: props.logRetentionInDays,
        encryptionKey: props.kmsKey,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });

      resource.node.addDependency(logGroup);

      // Enable the flag to indicate log group configured
      GuardDutyOrganizationAdminAccount.isLogGroupConfigured = true;
    }

    this.id = resource.ref;
  }
}
