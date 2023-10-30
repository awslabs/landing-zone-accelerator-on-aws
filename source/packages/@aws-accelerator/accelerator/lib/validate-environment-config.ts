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
import { NagSuppressions } from 'cdk-nag';

export interface ValidateEnvironmentConfigProps {
  readonly acceleratorConfigTable: cdk.aws_dynamodb.ITable;
  readonly newOrgAccountsTable: cdk.aws_dynamodb.ITable;
  readonly newCTAccountsTable: cdk.aws_dynamodb.ITable;
  readonly controlTowerEnabled: boolean;
  readonly organizationsEnabled: boolean;
  readonly commitId: string;
  readonly stackName: string;
  readonly region: string;
  readonly managementAccountId: string;
  readonly partition: string;
  readonly driftDetectionParameter: cdk.aws_ssm.IParameter;
  readonly driftDetectionMessageParameter: cdk.aws_ssm.IParameter;
  readonly serviceControlPolicies: {
    name: string;
    targetType: 'ou' | 'account';
    targets: { name: string; id: string }[];
  }[];
  readonly policyTagKey: string;
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
 * Class Validate Environment Config
 */
export class ValidateEnvironmentConfig extends Construct {
  public readonly id: string;

  constructor(scope: Construct, id: string, props: ValidateEnvironmentConfigProps) {
    super(scope, id);

    const stack = cdk.Stack.of(scope);
    const VALIDATE_ENVIRONMENT_RESOURCE_TYPE = 'Custom::ValidateEnvironmentConfiguration';

    const organizationsPolicy = new cdk.aws_iam.PolicyStatement({
      effect: cdk.aws_iam.Effect.ALLOW,
      sid: 'OrganizationsLookup',
      actions: [
        'organizations:ListAccounts',
        'servicecatalog:SearchProvisionedProducts',
        'organizations:ListChildren',
        'organizations:ListPoliciesForTarget',
        'organizations:ListOrganizationalUnitsForParent',
        'organizations:ListRoots',
        'organizations:ListAccountsForParent',
        'organizations:ListParents',
        'organizations:ListPolicies',
        'organizations:ListTagsForResource',
      ],
      resources: ['*'],
    });
    const ddbPutItemPolicy = new cdk.aws_iam.PolicyStatement({
      sid: 'dynamodb',
      effect: cdk.aws_iam.Effect.ALLOW,
      actions: ['dynamodb:PutItem'],
      resources: [props.newOrgAccountsTable.tableArn, props.newCTAccountsTable?.tableArn],
    });
    const ddbConfigTablePolicy = new cdk.aws_iam.PolicyStatement({
      sid: 'dynamodbConfigTable',
      effect: cdk.aws_iam.Effect.ALLOW,
      actions: ['dynamodb:Query', 'dynamodb:UpdateItem'],
      resources: [props.acceleratorConfigTable.tableArn],
    });
    const kmsPolicy = new cdk.aws_iam.PolicyStatement({
      sid: 'kms',
      effect: cdk.aws_iam.Effect.ALLOW,
      actions: ['kms:Encrypt', 'kms:Decrypt', 'kms:GenerateDataKey*', 'kms:DescribeKey'],
      resources: [props.newOrgAccountsTable.encryptionKey!.keyArn, props.newCTAccountsTable.encryptionKey!.keyArn],
    });
    const cloudformationPolicy = new cdk.aws_iam.PolicyStatement({
      sid: 'cloudformation',
      effect: cdk.aws_iam.Effect.ALLOW,
      actions: ['cloudformation:DescribeStacks'],
      resources: [
        `arn:${props.partition}:cloudformation:${props.region}:${props.managementAccountId}:stack/${props.stackName}*`,
      ],
    });
    const ssmPolicy = new cdk.aws_iam.PolicyStatement({
      sid: 'sms',
      effect: cdk.aws_iam.Effect.ALLOW,
      actions: ['ssm:GetParameter'],
      resources: [props.driftDetectionParameter.parameterArn, props.driftDetectionMessageParameter.parameterArn],
    });

    const providerLambda = new cdk.aws_lambda.Function(this, 'ValidateEnvironmentFunction', {
      runtime: cdk.aws_lambda.Runtime.NODEJS_16_X,
      code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, './lambdas/validate-environment/dist')),
      handler: 'index.handler',
      timeout: cdk.Duration.minutes(15),
      description: 'Validate Environment Configuration',
      memorySize: 1024,
    });
    providerLambda.addToRolePolicy(organizationsPolicy);
    providerLambda.addToRolePolicy(ddbPutItemPolicy);
    providerLambda.addToRolePolicy(ddbConfigTablePolicy);
    providerLambda.addToRolePolicy(kmsPolicy);
    providerLambda.addToRolePolicy(cloudformationPolicy);
    providerLambda.addToRolePolicy(ssmPolicy);

    // Custom resource lambda log group
    new cdk.aws_logs.LogGroup(this, `${providerLambda.node.id}LogGroup`, {
      logGroupName: `/aws/lambda/${providerLambda.functionName}`,
      retention: props.logRetentionInDays,
      encryptionKey: props.kmsKey,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const provider = new cdk.custom_resources.Provider(this, VALIDATE_ENVIRONMENT_RESOURCE_TYPE, {
      onEventHandler: providerLambda,
    });

    const resource = new cdk.CustomResource(this, 'ValidateEnvironmentResource', {
      resourceType: VALIDATE_ENVIRONMENT_RESOURCE_TYPE,
      serviceToken: provider.serviceToken,
      properties: {
        configTableName: props.acceleratorConfigTable.tableName,
        newOrgAccountsTableName: props.newOrgAccountsTable.tableName,
        newCTAccountsTableName: props.newCTAccountsTable?.tableName || '',
        controlTowerEnabled: props.controlTowerEnabled,
        organizationsEnabled: props.organizationsEnabled,
        commitId: props.commitId,
        stackName: props.stackName,
        partition: props.partition,
        driftDetectionParameterName: props.driftDetectionParameter.parameterName,
        driftDetectionMessageParameterName: props.driftDetectionMessageParameter.parameterName,
        serviceControlPolicies: props.serviceControlPolicies,
        uuid: uuidv4(), // Generates a new UUID to force the resource to update
      },
    });

    NagSuppressions.addResourceSuppressionsByPath(
      stack,
      `${stack.stackName}/ValidateEnvironmentConfig/ValidateEnvironmentFunction/ServiceRole/Resource`,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'CDK created resource',
        },
      ],
    );

    NagSuppressions.addResourceSuppressionsByPath(
      stack,
      `${stack.stackName}/ValidateEnvironmentConfig/${VALIDATE_ENVIRONMENT_RESOURCE_TYPE}/framework-onEvent/ServiceRole/Resource`,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'CDK created resource',
        },
      ],
    );

    NagSuppressions.addResourceSuppressionsByPath(
      stack,
      `${stack.stackName}/ValidateEnvironmentConfig/ValidateEnvironmentFunction/ServiceRole/DefaultPolicy/Resource`,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'CDK created resource',
        },
      ],
    );

    NagSuppressions.addResourceSuppressionsByPath(
      stack,
      `${stack.stackName}/ValidateEnvironmentConfig/${VALIDATE_ENVIRONMENT_RESOURCE_TYPE}/framework-onEvent/ServiceRole/DefaultPolicy/Resource`,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Policy permissions are part cdk provider framework',
        },
      ],
    );
    this.id = resource.ref;
  }
}
