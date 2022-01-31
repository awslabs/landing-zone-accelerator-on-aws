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
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

/**
 * ValidateOrganizationAccountsProps
 */
export interface ValidateOrganizationAccountsProps {
  readonly table: cdk.aws_dynamodb.ITable;
  readonly accounts: { name: string; description: string; email: string; organizationalUnit: string }[];
}

/**
 * ValidateOrganizationAccounts Class
 */
export class ValidateOrganizationAccounts extends Construct {
  public readonly id: string = '';

  constructor(scope: Construct, id: string, props: ValidateOrganizationAccountsProps) {
    super(scope, id);

    const RESOURCE_TYPE = 'Custom::OrganizationsValidateAccounts';

    const customResourceProvider = cdk.CustomResourceProvider.getOrCreateProvider(this, RESOURCE_TYPE, {
      codeDirectory: path.join(__dirname, 'validate-accounts/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_14_X,
      policyStatements: [
        {
          Sid: 'OrganizationsTaskActions',
          Effect: 'Allow',
          Action: ['organizations:ListAccounts'],
          Resource: '*',
        },
        {
          Sid: 'DynamoDBTaskActions',
          Effect: 'Allow',
          Action: ['dynamodb:PutItem'],
          Resource: props.table.tableArn,
        },
        {
          Sid: 'KmsTaskActions',
          Effect: 'Allow',
          Action: ['kms:Encrypt', 'kms:Decrypt', 'kms:GenerateDataKey*', 'kms:DescribeKey'],
          Resource: props.table.encryptionKey!.keyArn,
        },
      ],
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: RESOURCE_TYPE,
      serviceToken: customResourceProvider.serviceToken,
      properties: {
        tableName: props.table.tableName,
        accounts: props.accounts,
        uuid: uuidv4(), // Generates a new UUID to force the resource to update
      },
    });

    this.id = resource.ref;
  }
}
