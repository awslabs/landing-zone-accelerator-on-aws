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
import { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { v4 as uuidv4 } from 'uuid';

const path = require('path');

/**
 * Account properties
 */
export interface AccountProps {
  readonly acceleratorConfigTable: ITable;
  readonly commitId: string;
  readonly assumeRoleName: string;
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
 * Class to initialize an Organizations Account
 */
export class Account extends cdk.Resource {
  constructor(scope: Construct, id: string, props: AccountProps) {
    super(scope, id);

    const ENROLL_ACCOUNT_TYPE = 'Custom::InviteAccountsToOrganization';

    const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, ENROLL_ACCOUNT_TYPE, {
      codeDirectory: path.join(__dirname, 'invite-account-to-organization/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_16_X,
      policyStatements: [
        {
          Effect: 'Allow',
          Action: [
            'organizations:AcceptHandshake',
            'organizations:ListAccounts',
            'organizations:InviteAccountToOrganization',
            'organizations:MoveAccount',
            'organizations:ListRoots',
          ],
          Resource: '*',
        },
        {
          Effect: 'Allow',
          Action: ['dynamodb:Query'],
          Resource: [props.acceleratorConfigTable.tableArn],
        },
        {
          Effect: 'Allow',
          Action: ['sts:AssumeRole'],
          Resource: [
            cdk.Stack.of(this).formatArn({
              service: 'iam',
              region: '',
              account: '*',
              resource: 'role',
              arnFormat: cdk.ArnFormat.SLASH_RESOURCE_NAME,
              resourceName: props.assumeRoleName,
            }),
          ],
        },
      ],
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: ENROLL_ACCOUNT_TYPE,
      serviceToken: provider.serviceToken,
      properties: {
        configTableName: props.acceleratorConfigTable.tableName,
        partition: cdk.Aws.PARTITION,
        commitId: props.commitId,
        assumeRoleName: props.assumeRoleName,
        uuid: uuidv4(), // Generates a new UUID to force the resource to update
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
