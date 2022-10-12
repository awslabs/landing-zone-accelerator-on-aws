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

export interface ValidateEnvironmentConfigProps {
  readonly acceleratorConfigTable: cdk.aws_dynamodb.ITable;
  readonly newOrgAccountsTable: cdk.aws_dynamodb.ITable;
  readonly newCTAccountsTable: cdk.aws_dynamodb.ITable;
  readonly controlTowerEnabled: boolean;
  readonly commitId: string;
  readonly stackName: string;
  readonly region: string;
  readonly managementAccountId: string;
  readonly partition: string;
  readonly driftDetectionParameter: cdk.aws_ssm.IParameter;
  readonly driftDetectionMessageParameter: cdk.aws_ssm.IParameter;
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

    const VALIDATE_ENVIRONMENT_RESOURCE_TYPE = 'Custom::ValidateEnvironmentConfig';

    //
    // Function definition for the custom resource
    //
    const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, VALIDATE_ENVIRONMENT_RESOURCE_TYPE, {
      codeDirectory: path.join(__dirname, 'lambdas/validate-environment/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_14_X,
      timeout: cdk.Duration.minutes(10),
      policyStatements: [
        {
          Sid: 'organizations',
          Effect: 'Allow',
          Action: [
            'organizations:ListAccounts',
            'servicecatalog:SearchProvisionedProducts',
            'organizations:ListChildren',
            'organizations:ListPoliciesForTarget',
          ],
          Resource: '*',
        },
        {
          Sid: 'dynamodb',
          Effect: 'Allow',
          Action: ['dynamodb:PutItem'],
          Resource: [props.newOrgAccountsTable.tableArn, props.newCTAccountsTable?.tableArn],
        },
        {
          Sid: 'dynamodbConfigTable',
          Effect: 'Allow',
          Action: ['dynamodb:Query', 'dynamodb:UpdateItem'],
          Resource: [props.acceleratorConfigTable.tableArn],
        },
        {
          Sid: 'kms',
          Effect: 'Allow',
          Action: ['kms:Encrypt', 'kms:Decrypt', 'kms:GenerateDataKey*', 'kms:DescribeKey'],
          Resource: [props.newOrgAccountsTable.encryptionKey?.keyArn, props.newCTAccountsTable.encryptionKey?.keyArn],
        },
        {
          Sid: 'cloudformation',
          Effect: 'Allow',
          Action: ['cloudformation:DescribeStacks'],
          Resource: [
            `arn:${props.partition}:cloudformation:${props.region}:${props.managementAccountId}:stack/${props.stackName}*`,
          ],
        },
        {
          Sid: 'sms',
          Effect: 'Allow',
          Action: ['ssm:GetParameter'],
          Resource: [props.driftDetectionParameter.parameterArn, props.driftDetectionMessageParameter.parameterArn],
        },
      ],
    });

    //
    // Custom Resource definition. We want this resource to be evaluated on
    // every CloudFormation update, so we generate a new uuid to force
    // re-evaluation.
    //
    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: VALIDATE_ENVIRONMENT_RESOURCE_TYPE,
      serviceToken: provider.serviceToken,
      properties: {
        configTableName: props.acceleratorConfigTable.tableName,
        newOrgAccountsTableName: props.newOrgAccountsTable.tableName,
        newCTAccountsTableName: props.newCTAccountsTable?.tableName || '',
        controlTowerEnabled: props.controlTowerEnabled,
        commitId: props.commitId,
        stackName: props.stackName,
        driftDetectionParameterName: props.driftDetectionParameter.parameterName,
        driftDetectionMessageParameterName: props.driftDetectionMessageParameter.parameterName,
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

    this.id = resource.ref;
  }
}
