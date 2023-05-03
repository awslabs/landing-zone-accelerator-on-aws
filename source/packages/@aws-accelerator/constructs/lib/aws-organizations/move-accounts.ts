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

export interface MoveAccountsProps {
  /**
   * Global region
   */
  readonly globalRegion: string;
  /**
   * Config Table
   */
  readonly configTable: cdk.aws_dynamodb.ITable;
  /**
   * Config commit Id
   */
  readonly commitId: string;
  /**
   * Management Account Id
   */
  readonly managementAccountId: string;
  /**
   * Custom resource lambda key to encrypt environment variables
   */
  readonly lambdaKmsKey: cdk.aws_kms.IKey;
  /**
   * Custom resource lambda log group encryption key
   */
  readonly cloudWatchLogsKmsKey: cdk.aws_kms.IKey;
  /**
   * Custom resource lambda log retention in days
   */
  readonly cloudWatchLogRetentionInDays: number;
  /**
   * Control Tower enabled flag
   */
  readonly controlTower: boolean;
}

/**
 * Class to initialize Organization
 */
export class MoveAccounts extends Construct {
  public readonly id: string;

  public constructor(scope: Construct, id: string, props: MoveAccountsProps) {
    super(scope, id);

    if (props.controlTower) {
      this.id = 'NoOpMoveAccountsFunction';
      return;
    }

    const providerLambda = new cdk.aws_lambda.Function(this, 'MoveAccountsFunction', {
      code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, 'move-account/dist')),
      runtime: cdk.aws_lambda.Runtime.NODEJS_16_X,
      handler: 'index.handler',
      timeout: cdk.Duration.seconds(150),
      description: 'Moves accounts to conform account config',
      environmentEncryption: props.lambdaKmsKey,
    });

    providerLambda.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'OrganizationsAccess',
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: [
          'organizations:ListAccountsForParent',
          'organizations:ListRoots',
          'organizations:ListAccountsForParent',
          'organizations:ListOrganizationalUnitsForParent',
          'organizations:MoveAccount',
        ],
        resources: ['*'],
      }),
    );

    providerLambda.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'DynamodbTableAccess',
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['dynamodb:Query'],
        resources: [props.configTable.tableArn],
      }),
    );

    providerLambda.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'CloudformationAccess',
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['cloudformation:DescribeStacks'],
        resources: [
          `arn:${cdk.Stack.of(this).partition}:cloudformation:${cdk.Stack.of(this).region}:${
            props.managementAccountId
          }:stack/${cdk.Stack.of(this).stackName}*`,
        ],
      }),
    );

    // Custom resource lambda log group
    new cdk.aws_logs.LogGroup(this, `${providerLambda.node.id}LogGroup`, {
      logGroupName: `/aws/lambda/${providerLambda.functionName}`,
      retention: props.cloudWatchLogRetentionInDays,
      encryptionKey: props.cloudWatchLogsKmsKey,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const provider = new cdk.custom_resources.Provider(this, 'MoveAccountsProvider', {
      onEventHandler: providerLambda,
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: 'Custom::MoveAccounts',
      serviceToken: provider.serviceToken,
      properties: {
        globalRegion: props.globalRegion,
        configTableName: props.configTable.tableName,
        commitId: props.commitId,
        stackName: cdk.Stack.of(this).stackName,
        uuid: uuidv4(), // Generates a new UUID to force the resource to update
      },
    });

    this.id = resource.ref;
  }
}
