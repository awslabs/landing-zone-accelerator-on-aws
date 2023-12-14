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
import * as path from 'path';
import { pascalCase } from 'change-case';
import { Construct } from 'constructs';

/**
 * Construction properties for CloudWatch LogGroups.
 */

export type LogGroupRetention =
  | 1
  | 3
  | 5
  | 7
  | 14
  | 30
  | 60
  | 90
  | 120
  | 150
  | 180
  | 365
  | 400
  | 545
  | 731
  | 1096
  | 1827
  | 2192
  | 2557
  | 2922
  | 3288
  | 3653;

export interface CloudWatchLogGroupsProps {
  /**
   * Custom resource lambda log group encryption key, when undefined default AWS managed key will be used
   */
  readonly customLambdaLogKmsKey?: cdk.aws_kms.IKey;
  /**
   * How long, in days, the log contents for the Lambda function
   * will be retained.
   */
  readonly customLambdaLogRetention: number;
  /**
   * How long, in days, the log contents will be retained.
   *
   * To retain all logs, set this value to undefined.
   *
   */
  readonly logRetentionInDays: LogGroupRetention | number;
  /**
   * KMS Key Arn to encrypt CloudWatch Logs Group at rest.
   */
  readonly keyArn?: string;
  /**
   *
   * Name of the CloudWatch Logs Group
   */
  readonly logGroupName?: string;
  /**
   * For cross-account log groups, the owning account ID
   */
  readonly owningAccountId?: string;
  /**
   * For cross-region log groups, the owning region
   */
  readonly owningRegion?: string;
  /**
   * For cross-account log groups, the IAM role name to assume
   */
  readonly roleName?: string;
  /**
   *
   * Determine termination policy on CloudWatch Logs Group
   */
  readonly terminationProtected?: boolean;
}

interface ILogGroup {
  /**
   * The name of the log group
   */
  readonly logGroupName: string;
  /**
   * The ARN of the log group
   */
  readonly logGroupArn: string;
}

/**
 * Class to configure CloudWatch Log Groups
 */
export class CloudWatchLogGroups extends cdk.Resource implements ILogGroup {
  public readonly logGroupName: string;
  public readonly logGroupArn: string;

  constructor(scope: Construct, id: string, props: CloudWatchLogGroupsProps) {
    super(scope, id);
    const CLOUD_WATCH_LOG_GROUPS = 'Custom::CreateLogGroup';
    this.logGroupName = props.logGroupName ?? cdk.Names.uniqueResourceName(this, { separator: '-' });

    //
    // Function definition for the custom resource
    //
    const policyStatements = props.owningAccountId
      ? [
          {
            Effect: 'Allow',
            Action: ['sts:AssumeRole'],
            Resource: `arn:${this.stack.partition}:iam::*:role/${props.roleName}`,
          },
        ]
      : [
          {
            Effect: 'Allow',
            Action: ['logs:CreateLogGroup', 'logs:DeleteLogGroup', 'logs:PutRetentionPolicy'],
            Resource: `arn:${this.stack.partition}:logs:${props.owningRegion ?? this.stack.region}:${
              this.stack.account
            }:log-group:${this.logGroupName}:*`,
          },
          {
            Effect: 'Allow',
            Action: ['kms:DescribeKey', 'kms:ListKeys', 'logs:AssociateKmsKey', 'logs:DescribeLogGroups'],
            Resource: '*',
          },
        ];

    const provider = cdk.CustomResourceProvider.getOrCreateProvider(
      this,
      pascalCase(`${this.logGroupName}-${CLOUD_WATCH_LOG_GROUPS}`),
      {
        codeDirectory: path.join(__dirname, 'create-log-groups/dist'),
        runtime: cdk.CustomResourceProviderRuntime.NODEJS_16_X,
        policyStatements,
      },
    );

    const resource = new cdk.CustomResource(this, 'CloudWatchLogsResource', {
      resourceType: CLOUD_WATCH_LOG_GROUPS,
      serviceToken: provider.serviceToken,
      properties: {
        logGroupName: this.logGroupName,
        retention: props.logRetentionInDays,
        keyArn: props.keyArn,
        owningAccountId: props.owningAccountId,
        owningRegion: props.owningRegion,
        roleName: props.roleName,
        terminationProtected: props.terminationProtected,
      },
    });
    this.logGroupArn = resource.getAttString('LogGroupArn');

    /**
     * Singleton pattern to define the log group for the singleton function
     * in the stack
     */
    const stack = cdk.Stack.of(scope);
    const logGroup =
      (stack.node.tryFindChild(`${provider.node.id}LogGroup`) as cdk.aws_logs.LogGroup) ??
      new cdk.aws_logs.LogGroup(stack, `${provider.node.id}LogGroup`, {
        logGroupName: `/aws/lambda/${(provider.node.findChild('Handler') as cdk.aws_lambda.CfnFunction).ref}`,
        retention: props.customLambdaLogRetention,
        encryptionKey: props.customLambdaLogKmsKey,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });
    resource.node.addDependency(logGroup);
  }
}
