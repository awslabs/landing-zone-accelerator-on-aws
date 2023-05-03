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
   * Custom resource lambda log group encryption key
   */
  readonly customLambdaLogKmsKey: cdk.aws_kms.IKey;

  /**
   * How long, in days, the log contents for the Lambda function
   * will be retained.
   */
  readonly customLambdaLogRetention: number;

  /**
   * KMS Key Arn to encrypt CloudWatch Logs Group at rest.
   */
  readonly keyArn?: string;

  /**
   *
   * Name of the CloudWatch Logs Group
   */
  readonly logGroupName: string;

  /**
   * How long, in days, the log contents will be retained.
   *
   * To retain all logs, set this value to undefined.
   *
   */
  readonly logRetentionInDays: LogGroupRetention;

  /**
   *
   * Determine termination policy on CloudWatch Logs Group
   */
  readonly terminationProtected?: boolean;
}

/**
 * Class to configure CloudWatch Log Groups
 */
export class CloudWatchLogGroups extends cdk.Resource {
  constructor(scope: Construct, id: string, props: CloudWatchLogGroupsProps) {
    super(scope, id);
    const CLOUD_WATCH_LOG_GROUPS = 'Custom::CreateLogGroup';

    //
    // Function definition for the custom resource
    //
    const provider = cdk.CustomResourceProvider.getOrCreateProvider(
      this,
      pascalCase(`${props.logGroupName}-${CLOUD_WATCH_LOG_GROUPS}`),
      {
        codeDirectory: path.join(__dirname, 'create-log-groups/dist'),
        runtime: cdk.CustomResourceProviderRuntime.NODEJS_16_X,
        policyStatements: [
          {
            Effect: 'Allow',
            Action: ['logs:CreateLogGroup', 'logs:DeleteLogGroup', 'logs:PutRetentionPolicy'],
            Resource: `arn:${this.stack.partition}:logs:${this.stack.region}:${this.stack.account}:log-group:${props.logGroupName}:*`,
          },
          {
            Effect: 'Allow',
            Action: ['kms:DescribeKey', 'kms:ListKeys', 'logs:AssociateKmsKey', 'logs:DescribeLogGroups'],
            Resource: '*',
          },
        ],
      },
    );

    const resource = new cdk.CustomResource(this, 'CloudWatchLogsResource', {
      resourceType: CLOUD_WATCH_LOG_GROUPS,
      serviceToken: provider.serviceToken,
      properties: {
        logGroupName: props.logGroupName,
        retention: props.logRetentionInDays,
        keyArn: props.keyArn,
        terminationProtected: props.terminationProtected,
        region: this.stack.region,
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
        retention: props.customLambdaLogRetention,
        encryptionKey: props.customLambdaLogKmsKey,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });
    resource.node.addDependency(logGroup);
  }
}
