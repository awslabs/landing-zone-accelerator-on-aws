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
import { v4 as uuidv4 } from 'uuid';
import { Construct } from 'constructs';

import path = require('path');

/**
 * Organizations create accounts
 */
export interface CreateOrganizationAccountsProps {
  readonly newOrgAccountsTable: cdk.aws_dynamodb.ITable;
  readonly govCloudAccountMappingTable: cdk.aws_dynamodb.ITable | undefined;
  readonly accountRoleName: string;
  /**
   * Custom resource lambda log group encryption key
   */
  readonly kmsKey: cdk.aws_kms.Key;
  /**
   * Custom resource lambda log retention in days
   */
  readonly logRetentionInDays: number;
}

export class CreateOrganizationAccounts extends Construct {
  readonly onEvent: cdk.aws_lambda.IFunction;
  readonly isComplete: cdk.aws_lambda.IFunction;
  readonly provider: cdk.custom_resources.Provider;
  readonly id: string;

  constructor(scope: Construct, id: string, props: CreateOrganizationAccountsProps) {
    super(scope, id);

    const CREATE_ORGANIZATION_ACCOUNTS_RESOURCE_TYPE = 'Custom::CreateOrganizationAccounts';

    this.onEvent = new cdk.aws_lambda.Function(this, 'CreateOrganizationAccounts', {
      code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, 'create-accounts/dist')),
      runtime: cdk.aws_lambda.Runtime.NODEJS_16_X,
      handler: 'index.handler',
      timeout: cdk.Duration.seconds(30),
      description: 'Create Organization Accounts OnEvent handler',
      environmentEncryption: props.kmsKey,
    });
    new cdk.aws_logs.LogGroup(this, `${this.onEvent.node.id}LogGroup`, {
      logGroupName: `/aws/lambda/${this.onEvent.functionName}`,
      retention: props.logRetentionInDays,
      encryptionKey: props.kmsKey,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const ddbPolicy = new cdk.aws_iam.PolicyStatement({
      sid: 'DynamoDb',
      effect: cdk.aws_iam.Effect.ALLOW,
      actions: ['dynamodb:Scan', 'dynamodb:GetItem', 'dynamodb:DeleteItem', 'dynamodb:PutItem'],
      resources: [props.newOrgAccountsTable.tableArn],
    });
    const ddbKmsPolicy = new cdk.aws_iam.PolicyStatement({
      sid: 'KMS',
      effect: cdk.aws_iam.Effect.ALLOW,
      actions: ['kms:Encrypt', 'kms:Decrypt', 'kms:GenerateDataKey*', 'kms:DescribeKey'],
      resources: [props.newOrgAccountsTable.encryptionKey?.keyArn as string],
    });
    const orgPolicy = new cdk.aws_iam.PolicyStatement({
      sid: 'Organizations',
      effect: cdk.aws_iam.Effect.ALLOW,
      actions: [
        'organizations:CreateAccount',
        'organizations:CreateGovCloudAccount',
        'organizations:DescribeCreateAccountStatus',
        'organizations:ListRoots',
        'organizations:MoveAccount',
      ],
      resources: ['*'],
    });

    this.isComplete = new cdk.aws_lambda.Function(this, 'CreateOrganizationAccountStatus', {
      code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, 'create-accounts-status/dist')),
      runtime: cdk.aws_lambda.Runtime.NODEJS_16_X,
      handler: 'index.handler',
      timeout: cdk.Duration.minutes(5),
      description: 'Create Organization Account isComplete handler',
      environment: {
        NewOrgAccountsTableName: props.newOrgAccountsTable.tableName,
        GovCloudAccountMappingTableName: props.govCloudAccountMappingTable?.tableName || '',
        AccountRoleName: props.accountRoleName,
      },
      initialPolicy: [ddbPolicy, ddbKmsPolicy, orgPolicy],
      environmentEncryption: props.kmsKey,
    });
    new cdk.aws_logs.LogGroup(this, `${this.isComplete.node.id}LogGroup`, {
      logGroupName: `/aws/lambda/${this.isComplete.functionName}`,
      retention: props.logRetentionInDays,
      encryptionKey: props.kmsKey,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    if (props.govCloudAccountMappingTable) {
      const mappingTablePolicy = new cdk.aws_iam.PolicyStatement({
        sid: 'MappingDynamoDb',
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['dynamodb:GetItem', 'dynamodb:PutItem'],
        resources: [props.govCloudAccountMappingTable.tableArn],
      });
      const mappingTableKeyPolicy = new cdk.aws_iam.PolicyStatement({
        sid: 'MappingKMS',
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['kms:Encrypt', 'kms:Decrypt', 'kms:GenerateDataKey*', 'kms:DescribeKey'],
        resources: [props.govCloudAccountMappingTable.encryptionKey?.keyArn as string],
      });
      this.isComplete.addToRolePolicy(mappingTablePolicy);
      this.isComplete.addToRolePolicy(mappingTableKeyPolicy);
    }

    this.provider = new cdk.custom_resources.Provider(this, 'CreateOrganizationAccountsProvider', {
      onEventHandler: this.onEvent,
      isCompleteHandler: this.isComplete,
      queryInterval: cdk.Duration.seconds(15),
      totalTimeout: cdk.Duration.hours(2),
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: CREATE_ORGANIZATION_ACCOUNTS_RESOURCE_TYPE,
      serviceToken: this.provider.serviceToken,
      properties: {
        uuid: uuidv4(), // Generates a new UUID to force the resource to update
      },
    });

    this.id = resource.ref;
  }
}
