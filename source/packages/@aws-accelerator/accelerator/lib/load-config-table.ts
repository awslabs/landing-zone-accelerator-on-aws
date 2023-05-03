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

export interface LoadAcceleratorConfigTableProps {
  readonly acceleratorConfigTable: cdk.aws_dynamodb.ITable;
  readonly configRepositoryName: string;
  readonly managementAccountEmail: string;
  readonly logArchiveAccountEmail: string;
  readonly auditAccountEmail: string;
  readonly configS3Bucket: string;
  readonly organizationsConfigS3Key: string;
  readonly accountConfigS3Key: string;
  readonly commitId: string;
  readonly partition: string;
  readonly managementAccountId: string;
  readonly region: string;
  readonly stackName: string;
  /**
   * Custom resource lambda log group encryption key
   */
  readonly kmsKey: cdk.aws_kms.Key;
  /**
   * Custom resource lambda log retention in days
   */
  readonly logRetentionInDays: number;
  /**
   * Boolean for single account mode (i.e. AWS Jam or Workshop)
   */
  readonly enableSingleAccountMode: boolean;
}

/**
 * Class Load Accelerator Config Table
 */
export class LoadAcceleratorConfigTable extends Construct {
  public readonly id: string;

  constructor(scope: Construct, id: string, props: LoadAcceleratorConfigTableProps) {
    super(scope, id);

    const LOAD_CONFIG_TABLE_RESOURCE_TYPE = 'Custom::LoadAcceleratorConfigTable';

    const environment: {
      [key: string]: string;
    } = {};

    if (props.enableSingleAccountMode) {
      environment['ACCELERATOR_ENABLE_SINGLE_ACCOUNT_MODE'] = 'true';
    }

    //
    // Function definition for the custom resource
    //
    const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, LOAD_CONFIG_TABLE_RESOURCE_TYPE, {
      codeDirectory: path.join(__dirname, 'lambdas/load-config-table/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_16_X,
      timeout: cdk.Duration.minutes(15),
      policyStatements: [
        {
          Sid: 'organizations',
          Effect: 'Allow',
          Action: [
            'organizations:ListAccounts',
            'organizations:ListRoots',
            'organizations:ListOrganizationalUnitsForParent',
          ],
          Resource: '*',
        },
        {
          Sid: 'configTable',
          Effect: 'Allow',
          Action: ['dynamodb:UpdateItem', 'dynamodb:PutItem'],
          Resource: [props.acceleratorConfigTable.tableArn],
        },
        {
          Sid: 'kms',
          Effect: 'Allow',
          Action: ['kms:Encrypt', 'kms:Decrypt', 'kms:GenerateDataKey*', 'kms:DescribeKey'],
          Resource: [props.acceleratorConfigTable.encryptionKey?.keyArn],
        },
        {
          Sid: 's3',
          Effect: 'Allow',
          Action: ['s3:GetObject'],
          Resource: [
            `arn:${cdk.Stack.of(this).partition}:s3:::cdk-accel-assets-${cdk.Stack.of(this).account}-${
              cdk.Stack.of(this).region
            }/*`,
          ],
        },
        {
          Sid: 'cloudFormation',
          Effect: 'Allow',
          Action: ['cloudformation:DescribeStacks'],
          Resource: [
            `arn:${props.partition}:cloudformation:${props.region}:${props.managementAccountId}:stack/${props.stackName}*`,
          ],
        },
      ],
    });

    //
    // Custom Resource definition. We want this resource to be evaluated on
    // every CloudFormation update, so we generate a new uuid to force
    // re-evaluation.
    //
    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: LOAD_CONFIG_TABLE_RESOURCE_TYPE,
      serviceToken: provider.serviceToken,
      properties: {
        configTableName: props.acceleratorConfigTable.tableName,
        configRepositoryName: props.configRepositoryName,
        managementAccountEmail: props.managementAccountEmail,
        auditAccountEmail: props.auditAccountEmail,
        logArchiveAccountEmail: props.logArchiveAccountEmail,
        configS3Bucket: props.configS3Bucket,
        organizationsConfigS3Key: props.organizationsConfigS3Key,
        accountConfigS3Key: props.accountConfigS3Key,
        commitId: props.commitId,
        partition: props.partition,
        stackName: props.stackName,
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
