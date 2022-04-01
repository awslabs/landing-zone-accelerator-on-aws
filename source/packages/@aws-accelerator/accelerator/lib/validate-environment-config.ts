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
import { Duration } from 'aws-cdk-lib';
import path = require('path');

export interface ValidateEnvironmentConfigProps {
  readonly newOrgAccountsTable: cdk.aws_dynamodb.ITable;
  readonly newCTAccountsTable: cdk.aws_dynamodb.ITable;
  readonly controlTowerEnabled: boolean;
  readonly workloadAccounts: {
    name: string;
    description: string;
    email: string;
    govAccount?: boolean;
    organizationalUnit: string;
    organizationalUnitId: string;
  }[];
  readonly mandatoryAccounts: {
    name: string;
    description: string;
    email: string;
    organizationalUnit: string;
    organizationalUnitId: string;
  }[];
  readonly existingAccounts: {
    email: string;
    accountId: string;
  }[];
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

  static isLogGroupConfigured = false;

  constructor(scope: Construct, id: string, props: ValidateEnvironmentConfigProps) {
    super(scope, id);

    const VALIDATE_ENVIRONMENT_RESOURCE_TYPE = 'Custom::ValidateEnvironmentConfig';

    //
    // Function definition for the custom resource
    //
    const customResourceProvider = cdk.CustomResourceProvider.getOrCreateProvider(
      this,
      VALIDATE_ENVIRONMENT_RESOURCE_TYPE,
      {
        codeDirectory: path.join(__dirname, 'lambdas/validate-environment/dist'),
        runtime: cdk.CustomResourceProviderRuntime.NODEJS_14_X,
        timeout: Duration.minutes(10),
        policyStatements: [
          {
            Sid: 'organizations',
            Effect: 'Allow',
            Action: ['organizations:ListAccounts', 'servicecatalog:SearchProvisionedProducts'],
            Resource: '*',
          },
          {
            Sid: 'dynamodb',
            Effect: 'Allow',
            Action: ['dynamodb:PutItem'],
            Resource: [props.newOrgAccountsTable.tableArn, props.newCTAccountsTable?.tableArn],
          },
          {
            Sid: 'kms',
            Effect: 'Allow',
            Action: ['kms:Encrypt', 'kms:Decrypt', 'kms:GenerateDataKey*', 'kms:DescribeKey'],
            Resource: [props.newOrgAccountsTable.encryptionKey?.keyArn, props.newCTAccountsTable.encryptionKey?.keyArn],
          },
        ],
      },
    );

    //
    // Custom Resource definition. We want this resource to be evaluated on
    // every CloudFormation update, so we generate a new uuid to force
    // re-evaluation.
    //
    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: VALIDATE_ENVIRONMENT_RESOURCE_TYPE,
      serviceToken: customResourceProvider.serviceToken,
      properties: {
        workloadAccounts: props.workloadAccounts,
        mandatoryAccounts: props.mandatoryAccounts,
        existingAccounts: props.existingAccounts,
        newOrgAccountsTableName: props.newOrgAccountsTable.tableName,
        newCTAccountsTableName: props.newCTAccountsTable?.tableName || '',
        controlTowerEnabled: props.controlTowerEnabled,
        uuid: uuidv4(), // Generates a new UUID to force the resource to update
      },
    });

    /**
     * Pre-Creating log group to enable encryption and log retention.
     * Below construct needs to be static
     * isLogGroupConfigured flag used to make sure log group construct synthesize only once in the stack
     */
    if (!ValidateEnvironmentConfig.isLogGroupConfigured) {
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
      ValidateEnvironmentConfig.isLogGroupConfigured = true;
    }

    this.id = resource.ref;
  }
}
