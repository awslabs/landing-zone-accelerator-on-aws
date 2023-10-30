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
 * Control create accounts
 */
export interface CreateControlTowerAccountsProps {
  readonly table: cdk.aws_dynamodb.ITable;
  readonly portfolioId: string;
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
 * Class Create Accounts when Control Tower Enabled
 */
export class CreateControlTowerAccounts extends Construct {
  readonly onEvent: cdk.aws_lambda.IFunction;
  readonly isComplete: cdk.aws_lambda.IFunction;
  readonly provider: cdk.custom_resources.Provider;
  readonly id: string;

  constructor(scope: Construct, id: string, props: CreateControlTowerAccountsProps) {
    super(scope, id);

    const CREATE_CONTROL_TOWER_ACCOUNTS = 'Custom::CreateControlTowerAccounts';

    this.onEvent = new cdk.aws_lambda.Function(this, 'CreateControlTowerAccount', {
      code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, 'create-accounts/dist')),
      runtime: cdk.aws_lambda.Runtime.NODEJS_16_X,
      handler: 'index.handler',
      timeout: cdk.Duration.minutes(1),
      description: 'Create Control Tower Account onEvent handler',
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
      actions: ['dynamodb:Scan', 'dynamodb:GetItem', 'dynamodb:DeleteItem'],
      resources: [props.table.tableArn],
    });
    const ddbKmsPolicy = new cdk.aws_iam.PolicyStatement({
      sid: 'KMS',
      effect: cdk.aws_iam.Effect.ALLOW,
      actions: ['kms:Encrypt', 'kms:Decrypt', 'kms:GenerateDataKey*', 'kms:DescribeKey'],
      resources: [props.table.encryptionKey?.keyArn as string],
    });
    const scPolicy = new cdk.aws_iam.PolicyStatement({
      sid: 'ServiceCatalog',
      effect: cdk.aws_iam.Effect.ALLOW,
      actions: [
        'servicecatalog:SearchProvisionedProducts',
        'servicecatalog:ProvisionProduct',
        'servicecatalog:DescribeProduct',
        'servicecatalog:ListProvisioningArtifacts',
        'servicecatalog:DescribeProvisionedProduct',
      ],
      resources: ['*'],
    });
    const ctPolicy = new cdk.aws_iam.PolicyStatement({
      sid: 'ControlTower',
      effect: cdk.aws_iam.Effect.ALLOW,
      actions: [
        'controltower:CreateManagedAccount',
        'controltower:SetupLandingZone',
        'controltower:EnableGuardrail',
        'controltower:Describe*',
        'controltower:Get*',
        'controltower:List*',
      ],
      resources: ['*'],
    });
    const ssoPolicy = new cdk.aws_iam.PolicyStatement({
      sid: 'SSO',
      effect: cdk.aws_iam.Effect.ALLOW,
      actions: [
        'sso-directory:DescribeDirectory',
        'sso-directory:CreateUser',
        'sso-directory:SearchUsers',
        'sso-directory:SearchGroups',
        'sso:ListDirectoryAssociations',
        'sso:DescribeRegisteredRegions',
        'sso:ListProfileAssociations',
        'sso:AssociateProfile',
        'sso:GetProfile',
        'sso:CreateProfile',
        'sso:UpdateProfile',
        'sso:GetTrust',
        'sso:CreateTrust',
        'sso:UpdateTrust',
        'sso:GetApplicationInstance',
        'sso:CreateApplicationInstance',
        'sso:ListPermissionSets',
        'sso:GetSSOStatus',
      ],
      resources: ['*'],
    });
    this.isComplete = new cdk.aws_lambda.Function(this, 'CreateControlTowerAccountStatus', {
      code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, 'create-accounts-status/dist')),
      runtime: cdk.aws_lambda.Runtime.NODEJS_16_X,
      handler: 'index.handler',
      timeout: cdk.Duration.minutes(5),
      description: 'Create Control Tower Account isComplete handler',
      environment: { NewAccountsTableName: props.table.tableName },
      initialPolicy: [ddbPolicy, ddbKmsPolicy, ctPolicy, ssoPolicy],
      environmentEncryption: props.kmsKey,
    });
    new cdk.aws_logs.LogGroup(this, `${this.isComplete.node.id}LogGroup`, {
      logGroupName: `/aws/lambda/${this.isComplete.functionName}`,
      retention: props.logRetentionInDays,
      encryptionKey: props.kmsKey,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.isComplete.role?.addManagedPolicy(
      cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AWSServiceCatalogEndUserFullAccess'),
    );
    this.isComplete.addToRolePolicy(scPolicy);

    new cdk.aws_servicecatalog.CfnPortfolioPrincipalAssociation(this, 'LambdaPrincipalAssociation', {
      portfolioId: props.portfolioId,
      principalArn: this.isComplete.role?.roleArn ?? '',
      principalType: 'IAM',
    });

    this.provider = new cdk.custom_resources.Provider(this, 'CreateControlTowerAcccountsProvider', {
      onEventHandler: this.onEvent,
      isCompleteHandler: this.isComplete,
      queryInterval: cdk.Duration.seconds(30),
      totalTimeout: cdk.Duration.hours(4),
    });

    //
    // Custom Resource definition. We want this resource to be evaluated on
    // every CloudFormation update, so we generate a new uuid to force
    // re-evaluation.
    //
    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: CREATE_CONTROL_TOWER_ACCOUNTS,
      serviceToken: this.provider.serviceToken,
      properties: {
        uuid: uuidv4(),
      },
    });

    this.id = resource.ref;
  }
}
