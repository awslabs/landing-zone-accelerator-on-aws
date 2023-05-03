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

export type cloudwatchExclusionItem = {
  account: string;
  region: string;
  excludeAll?: boolean;
  logGroupNames?: string[];
};

/**
 * Construction properties for CloudWatch Logs Creating account.
 */

export interface CloudWatchLogsCreateProps {
  /**
   *
   * Log Destination Arn to which all the logs will get forwarded to
   */
  logDestinationArn: string;
  /**
   *
   * KMS key to encrypt the Lambda environment variables
   */
  logsKmsKey: cdk.aws_kms.IKey;
  /**
   *
   * CloudWatch Retention in days from global config
   */
  logsRetentionInDaysValue: string;
  /**
   *
   * Subscription Filter Arn
   */
  subscriptionFilterRoleArn: string;
  /**
   *
   * AWS Partition where code is being executed
   */
  logArchiveAccountId: string;
  /**
   * CloudWatch Logs exclusion setting
   */
  exclusionSetting?: cloudwatchExclusionItem;
}

/**
 * Class to configure CloudWatch Destination on logs receiving account
 */
export class CloudWatchLogsSubscriptionFilter extends Construct {
  readonly id: string;
  constructor(scope: Construct, id: string, props: CloudWatchLogsCreateProps) {
    super(scope, id);

    const UPDATE_SUBSCRIPTION_FILTER = 'Custom::UpdateSubscriptionFilter';

    //
    // Function definition for the custom resource
    //
    const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, UPDATE_SUBSCRIPTION_FILTER, {
      codeDirectory: path.join(__dirname, 'update-subscription-filter/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_16_X,
      policyStatements: [
        {
          Effect: 'Allow',
          Action: [
            'logs:PutRetentionPolicy',
            'logs:AssociateKmsKey',
            'logs:DescribeLogGroups',
            'logs:DescribeSubscriptionFilters',
          ],
          Resource: [
            `arn:${cdk.Stack.of(this).partition}:logs:${cdk.Stack.of(this).region}:${
              cdk.Stack.of(this).account
            }:log-group:*`,
          ],
        },
        // 'logs:PutSubscriptionFilter',

        {
          Effect: 'Allow',
          Action: ['logs:PutSubscriptionFilter', 'logs:DeleteSubscriptionFilter'],
          Resource: [
            `arn:${cdk.Stack.of(this).partition}:logs:${cdk.Stack.of(this).region}:${
              cdk.Stack.of(this).account
            }:log-group:*`,
            `arn:${cdk.Stack.of(this).partition}:logs:${cdk.Stack.of(this).region}:${
              props.logArchiveAccountId
            }:destination:*`,
          ],
        },
      ],
    });
    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: UPDATE_SUBSCRIPTION_FILTER,
      serviceToken: provider.serviceToken,
      properties: {
        LogRetention: props.logsRetentionInDaysValue,
        LogDestination: props.logDestinationArn,
        LogSubscriptionRole: props.subscriptionFilterRoleArn,
        LogKmsKeyArn: props.logsKmsKey.keyArn,
        LogExclusion: JSON.stringify(props.exclusionSetting!),
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
        retention: parseInt(props.logsRetentionInDaysValue),
        encryptionKey: props.logsKmsKey,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });
    resource.node.addDependency(logGroup);

    this.id = resource.ref;
  }
}
