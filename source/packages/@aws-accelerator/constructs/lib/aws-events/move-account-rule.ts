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
import * as path from 'path';
import { SsmParameterLookup } from '../aws-ssm/ssm-parameter-lookup';

/**
 * MoveAccountRuleProps
 */

export interface MoveAccountRuleProps {
  /**
   * Global region
   */
  readonly globalRegion: string;
  /**
   * Home region
   */
  readonly homeRegion: string;
  /**
   * Move account role name
   */
  readonly moveAccountRoleName: string;
  /**
   * Commit id
   */
  readonly commitId: string;
  /**
   * Accelerator Prefix
   */
  readonly acceleratorPrefix: string;
  /**
   * Accelerator SSM parameter name where config table name can be found
   */
  readonly configTableNameParameterName: string;
  /**
   * Accelerator SSM parameter name where config table arn can be found
   */
  readonly configTableArnParameterName: string;
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
 * Class to configure CloudWatch event to moves an account from its current source ou to destination ou.
 */
export class MoveAccountRule extends Construct {
  constructor(scope: Construct, id: string, props: MoveAccountRuleProps) {
    super(scope, id);

    let configTableName: string | undefined;
    let configTableArn: string | undefined;

    if (props.homeRegion === props.globalRegion) {
      configTableName = cdk.aws_ssm.StringParameter.valueForStringParameter(this, props.configTableNameParameterName);
      configTableArn = cdk.aws_ssm.StringParameter.valueForStringParameter(this, props.configTableArnParameterName);
    } else {
      configTableName = new SsmParameterLookup(this, 'AcceleratorConfigTableNameLookup', {
        name: props.configTableNameParameterName,
        accountId: cdk.Stack.of(this).account,
        parameterRegion: props.homeRegion,
        roleName: props.moveAccountRoleName,
        kmsKey: props.kmsKey,
        logRetentionInDays: props.logRetentionInDays,
        acceleratorPrefix: props.acceleratorPrefix,
      }).value;
      configTableArn = new SsmParameterLookup(this, 'AcceleratorConfigTableArnLookup', {
        name: props.configTableArnParameterName,
        accountId: cdk.Stack.of(this).account,
        parameterRegion: props.homeRegion,
        roleName: props.moveAccountRoleName,
        kmsKey: props.kmsKey,
        logRetentionInDays: props.logRetentionInDays,
        acceleratorPrefix: props.acceleratorPrefix,
      }).value;
    }

    // resources for control tower lifecycle events
    const moveAccountTargetFunction = new cdk.aws_lambda.Function(this, 'MoveAccountTargetFunction', {
      code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, 'move-account/dist')),
      runtime: cdk.aws_lambda.Runtime.NODEJS_16_X,
      handler: 'index.handler',
      description: 'Lambda function to process Organizations MoveAccount event from CloudTrail',
      timeout: cdk.Duration.minutes(5),
      environment: {
        HOME_REGION: props.homeRegion,
        GLOBAL_REGION: props.globalRegion,
        CONFIG_TABLE_NAME: configTableName,
        COMMIT_ID: props.commitId,
        STACK_PREFIX: props.acceleratorPrefix,
      },
    });

    moveAccountTargetFunction.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'dynamodbConfigTable',
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['dynamodb:Query'],
        resources: [configTableArn],
      }),
    );

    moveAccountTargetFunction.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'organizations',
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: [
          'organizations:MoveAccount',
          'organizations:ListParents',
          'organizations:DescribeOrganizationalUnit',
          'organizations:ListRoots',
        ],
        resources: ['*'],
      }),
    );

    new cdk.aws_logs.LogGroup(this, `${moveAccountTargetFunction.node.id}LogGroup`, {
      logGroupName: `/aws/lambda/${moveAccountTargetFunction.functionName}`,
      retention: props.logRetentionInDays,
      encryptionKey: props.kmsKey,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const moveAccountRule = new cdk.aws_events.Rule(this, 'MoveAccountRule', {
      description: 'CloudWatch Events rule to monitor for Organizations MoveAccount events',
      eventPattern: {
        source: ['aws.organizations'],
        detailType: ['AWS API Call via CloudTrail'],
        detail: {
          eventName: ['MoveAccount'],
          eventSource: ['organizations.amazonaws.com'],
        },
      },
    });

    moveAccountRule.addTarget(
      new cdk.aws_events_targets.LambdaFunction(moveAccountTargetFunction, { retryAttempts: 3 }),
    );
  }
}
