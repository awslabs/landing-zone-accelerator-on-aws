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
import { Construct } from 'constructs';
import { v4 as uuidv4 } from 'uuid';

const path = require('path');

/**
 * Initialized OrganizationalUnit properties
 */
export interface OrganizationalUnitsProps {
  readonly acceleratorConfigTable: cdk.aws_dynamodb.Table;
  readonly commitId: string;
  readonly controlTowerEnabled: boolean;
  readonly organizationsEnabled: boolean;
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
 * Class to initialize OrganizationalUnits
 */
export class OrganizationalUnits extends Construct {
  public readonly id: string;

  constructor(scope: Construct, id: string, props: OrganizationalUnitsProps) {
    super(scope, id);

    const provider = cdk.CustomResourceProvider.getOrCreateProvider(
      this,
      'Custom::OrganizationsCreateOrganizationalUnits',
      {
        codeDirectory: path.join(__dirname, 'create-organizational-units/dist'),
        runtime: cdk.CustomResourceProviderRuntime.NODEJS_16_X,
        policyStatements: [
          {
            Sid: 'organizations',
            Effect: 'Allow',
            Action: [
              'organizations:CreateOrganizationalUnit',
              'organizations:ListOrganizationalUnitsForParent',
              'organizations:ListRoots',
              'organizations:UpdateOrganizationalUnit',
            ],
            Resource: '*',
          },
          {
            Sid: 'dynamodb',
            Effect: 'Allow',
            Action: ['dynamodb:UpdateItem', 'dynamodb:Query'],
            Resource: [props.acceleratorConfigTable.tableArn],
          },
        ],
      },
    );

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: 'Custom::CreateOrganizationalUnits',
      serviceToken: provider.serviceToken,
      properties: {
        configTableName: props.acceleratorConfigTable.tableName,
        commitId: props.commitId,
        controlTowerEnabled: props.controlTowerEnabled,
        organizationsEnabled: props.organizationsEnabled,
        partition: cdk.Aws.PARTITION,
        uuid: uuidv4(),
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
