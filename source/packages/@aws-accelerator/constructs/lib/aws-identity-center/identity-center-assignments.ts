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

import { CUSTOM_RESOURCE_PROVIDER_RUNTIME } from '@aws-accelerator/utils/lib/lambda';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

const path = require('path');

/**
 * Initialized IdentityCenterAssignmentsProps properties
 */
export interface IdentityCenterAssignmentsProps {
  /**
   * Identity Store Id
   */
  readonly identityStoreId: string;
  /**
   * Identity Center instance arn
   */
  readonly identityCenterInstanceArn: string;
  /**
   * Identity Center principals
   */
  readonly principals?: { type: string; name: string }[];
  /**
   * Identity Center principal type
   */
  readonly principalType?: string;
  /**
   * Identity Center principal id
   */
  readonly principalId?: string;
  /**
   * Identity Center permission set arn
   */
  readonly permissionSetArnValue: string;
  /**
   * Target account Ids
   */
  readonly accountIds: string[];
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
 * Class Identity Center Assignments
 */
export class IdentityCenterAssignments extends Construct {
  readonly id: string;
  constructor(scope: Construct, id: string, props: IdentityCenterAssignmentsProps) {
    super(scope, id);

    const IDENTITY_CENTER_ASSIGNMENT_TYPE = 'Custom::IdentityCenterAssignments';
    const partition = cdk.Stack.of(this).partition;

    //
    // Function definition for the custom resource
    //
    const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, IDENTITY_CENTER_ASSIGNMENT_TYPE, {
      codeDirectory: path.join(__dirname, 'build-identity-center-assignments/dist'),
      runtime: CUSTOM_RESOURCE_PROVIDER_RUNTIME,
      policyStatements: [
        {
          Effect: 'Allow',
          Action: [
            'iam:ListRoles',
            'iam:ListPolicies',
            'identitystore:ListGroups',
            'identitystore:ListUsers',
            'sso:CreateAccountAssignment',
            'sso:DeleteAccountAssignment',
            'sso:ListAccountAssignments',
          ],
          Resource: '*',
        },
        {
          Effect: 'Allow',
          Action: ['iam:GetSAMLProvider', 'iam:UpdateSAMLProvider'],
          Resource: `arn:${partition}:iam::${cdk.Stack.of(this).account}:saml-provider/AWSSSO_*_DO_NOT_DELETE`,
        },
        {
          Effect: 'Allow',
          Action: [
            'iam:AttachRolePolicy',
            'iam:CreateRole',
            'iam:DeleteRole',
            'iam:DeleteRolePolicy',
            'iam:DetachRolePolicy',
            'iam:GetRole',
            'iam:ListAttachedRolePolicies',
            'iam:ListRolePolicies',
            'iam:PutRolePolicy',
            'iam:UpdateRole',
            'iam:UpdateRoleDescription',
          ],
          Resource: `arn:${partition}:iam::*:role/aws-reserved/sso.amazonaws.com/*`,
        },
      ],
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: IDENTITY_CENTER_ASSIGNMENT_TYPE,
      serviceToken: provider.serviceToken,
      properties: {
        identityStoreId: props.identityStoreId,
        instanceArn: props.identityCenterInstanceArn,
        principals: props.principals,
        principalType: props.principalType,
        principalId: props.principalId,
        permissionSetArn: props.permissionSetArnValue,
        accountIds: props.accountIds,
      },
    });

    this.id = resource.ref;

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
