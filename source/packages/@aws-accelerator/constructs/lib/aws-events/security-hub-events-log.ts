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

export interface SecurityHubEventsLogProps {
  /**
   * Accelerator Prefix
   */
  readonly acceleratorPrefix: string;
  /**
   *
   * SNS Topic Arn that notification will be delivered to
   */
  snsTopicArn?: string;
  /**
   *
   * SNS KMS Key
   */
  snsKmsKey?: cdk.aws_kms.IKey;
  /**
   *
   * Alert level
   */
  notificationLevel?: string;
  /**
   *
   * Account Lambda key for environment encryption
   */
  lambdaKey?: cdk.aws_kms.IKey;
}

/**
 * Send all Security Hub events to CloudWatch Logs
 */
export class SecurityHubEventsLog extends Construct {
  constructor(scope: Construct, id: string, props: SecurityHubEventsLogProps) {
    super(scope, id);

    const securityHubEventsRule = new cdk.aws_events.Rule(this, 'SecurityHubEventsRule', {
      description: 'Sends all Security Hub Findings to a Lambda that writes to CloudWatch Logs',
      eventPattern: {
        source: ['aws.securityhub'],
        detailType: ['Security Hub Findings - Imported'],
      },
    });

    const securityHubEventsFunction = new cdk.aws_lambda.Function(this, 'SecurityHubEventsFunction', {
      runtime: cdk.aws_lambda.Runtime.NODEJS_16_X,
      code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, 'security-hub-event-log/dist')),
      handler: 'index.handler',
      memorySize: 256,
      timeout: cdk.Duration.minutes(2),
      environmentEncryption: props.lambdaKey,
      environment: {
        SNS_TOPIC_ARN: props.snsTopicArn ?? '',
        NOTIFICATION_LEVEL: props.notificationLevel ?? '',
        ACCELERATOR_PREFIX: props.acceleratorPrefix,
      },
      initialPolicy: [
        new cdk.aws_iam.PolicyStatement({
          actions: ['logs:CreateLogGroup', 'logs:CreateLogStream'],
          resources: [
            `arn:${cdk.Stack.of(this).partition}:logs:${cdk.Stack.of(this).region}:${
              cdk.Stack.of(this).account
            }:log-group:/${props.acceleratorPrefix}*`,
          ],
        }),
        // Describe call needs access to entire region and account
        new cdk.aws_iam.PolicyStatement({
          actions: ['logs:DescribeLogGroups'],
          resources: [
            `arn:${cdk.Stack.of(this).partition}:logs:${cdk.Stack.of(this).region}:${
              cdk.Stack.of(this).account
            }:log-group:*`,
          ],
        }),
        new cdk.aws_iam.PolicyStatement({
          actions: ['logs:PutLogEvents'],
          resources: [
            `arn:${cdk.Stack.of(this).partition}:logs:${cdk.Stack.of(this).region}:${
              cdk.Stack.of(this).account
            }:log-group:/${props.acceleratorPrefix}*:log-stream:*`,
          ],
        }),
      ],
    });

    if (props.snsTopicArn) {
      securityHubEventsFunction.addToRolePolicy(
        new cdk.aws_iam.PolicyStatement({
          sid: 'sns',
          actions: ['sns:Publish'],
          resources: [props.snsTopicArn],
        }),
      );
    }

    if (props.snsKmsKey) {
      securityHubEventsFunction.addToRolePolicy(
        new cdk.aws_iam.PolicyStatement({
          sid: 'kms',
          actions: ['kms:Decrypt', 'kms:GenerateDataKey'],
          resources: [props.snsKmsKey.keyArn],
        }),
      );
    }

    // set basic trigger with 5 retries
    securityHubEventsRule.addTarget(
      new cdk.aws_events_targets.LambdaFunction(securityHubEventsFunction, { retryAttempts: 5 }),
    );
  }
}
