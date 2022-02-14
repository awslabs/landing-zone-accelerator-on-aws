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

export interface IAccount extends cdk.IResource {
  readonly accountId: string;
  readonly assumeRoleName: string;
}

/**
 * Account properties
 */
export interface AccountProps {
  readonly accountId: string;
  readonly assumeRoleName: string;
}

/**
 * Class to initialize an Organizations Account
 */
export class Account extends cdk.Resource implements IAccount {
  public readonly accountId: string;
  public readonly assumeRoleName: string;

  constructor(scope: Construct, id: string, props: AccountProps) {
    super(scope, id);

    this.accountId = props.accountId;
    this.assumeRoleName = props.assumeRoleName;

    const ENROLL_ACCOUNT_TYPE = 'Custom::InviteAccountToOrganization';

    const cr = cdk.CustomResourceProvider.getOrCreateProvider(this, ENROLL_ACCOUNT_TYPE, {
      codeDirectory: path.join(__dirname, 'invite-account-to-organization/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_14_X,
      policyStatements: [
        {
          Effect: 'Allow',
          Action: [
            'organizations:AcceptHandshake',
            'organizations:ListAccounts',
            'organizations:InviteAccountToOrganization',
            'organizations:MoveAccount',
            'sts:AssumeRole',
          ],
          Resource: '*',
        },
      ],
    });

    new cdk.CustomResource(this, 'Resource', {
      resourceType: ENROLL_ACCOUNT_TYPE,
      serviceToken: cr.serviceToken,
      properties: {
        accountId: props.accountId,
        partition: cdk.Aws.PARTITION,
        roleArn: cdk.Stack.of(this).formatArn({
          service: 'iam',
          region: '',
          account: props.accountId,
          resource: 'role',
          arnFormat: cdk.ArnFormat.SLASH_RESOURCE_NAME,
          resourceName: props.assumeRoleName,
        }),
      },
    });
  }
}
