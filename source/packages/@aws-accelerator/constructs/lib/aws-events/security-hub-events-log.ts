/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import { LzaCustomResource } from '../lza-custom-resource';

export interface SecurityHubEventsLogProps {
  /**
   * Accelerator Prefix
   */
  readonly acceleratorPrefix: string;
  /**
   * Number of days to retain CloudWatch logs
   */
  readonly cloudWatchLogRetentionInDays: number;
  /**
   * SNS Topic Arn that notification will be delivered to
   */
  snsTopicArn?: string;
  /**
   * SNS KMS Key
   */
  snsKmsKey?: cdk.aws_kms.IKey;
  /**
   * Alert level
   */
  notificationLevel?: string;
  /**
   * Log level
   */
  logLevel?: string;
  /**
   * Account Lambda key for environment encryption
   */
  lambdaKey?: cdk.aws_kms.IKey;
  /**
   * Log Group Name
   */
  logGroupName?: string;
}

/**
 * Send all Security Hub events to CloudWatch Logs
 */
export class SecurityHubEventsLog extends Construct {
  constructor(scope: Construct, id: string, props: SecurityHubEventsLogProps) {
    super(scope, id);
    const logGroupName = props.logGroupName ?? `/${props.acceleratorPrefix}-SecurityHub`;
    const logGroupArn = `arn:${cdk.Stack.of(this).partition}:logs:${cdk.Stack.of(this).region}:${
      cdk.Stack.of(this).account
    }:log-group:/*:*`;

    // Create custom resource Lambda to create CloudWatch Logs Group target and update resource policy
    const customResource = new LzaCustomResource(this, 'SecurityHubEventsFunction', {
      resource: {
        name: 'SecurityHubEventsFunction',
        parentId: id,
        properties: [{ logGroupName: logGroupName }, { logGroupArn: logGroupArn }],
        forceUpdate: true,
      },
      lambda: {
        assetPath: path.join(__dirname, 'security-hub-event-log/dist'),
        description:
          'Creates a CloudWatch Logs Group to store SecurityHub findings and updates CW Log Group resource policy',
        timeOut: cdk.Duration.minutes(3),
        environmentEncryptionKmsKey: props.lambdaKey,
        cloudWatchLogRetentionInDays: props.cloudWatchLogRetentionInDays,
        roleInitialPolicy: [
          new cdk.aws_iam.PolicyStatement({
            actions: ['logs:CreateLogGroup', 'logs:CreateLogStream'],
            resources: [
              `arn:${cdk.Stack.of(this).partition}:logs:${cdk.Stack.of(this).region}:${
                cdk.Stack.of(this).account
              }:log-group:${logGroupName}*`,
            ],
          }),
          // Describe call needs access to entire region and account
          new cdk.aws_iam.PolicyStatement({
            actions: ['logs:DescribeLogGroups', 'logs:PutResourcePolicy'],
            resources: [
              `arn:${cdk.Stack.of(this).partition}:logs:${cdk.Stack.of(this).region}:${
                cdk.Stack.of(this).account
              }:log-group:*`,
            ],
          }),
        ],
      },
      nagSuppressionPrefix: 'SecurityHubEventsLog',
    });
    const logGroup = cdk.aws_logs.LogGroup.fromLogGroupName(this, 'ExistingShLogGroup', logGroupName);
    logGroup.node.addDependency(customResource);

    // Create EventBridge rule targeting CloudWatch Log Group
    const securityHubEventsRule = new cdk.aws_events.CfnRule(this, 'SecurityHubLogEventsRule', {
      description: 'Sends Security Hub Findings above threshold to CloudWatch Logs',
      eventPattern: this.getLogRuleEventPattern(props.logLevel),
      targets: [{ arn: logGroup.logGroupArn, id: 'CloudWatchLogTarget' }],
    });
    securityHubEventsRule.node.addDependency(customResource);

    // Create EventBridge rule targeting SNS Topic
    if (props.snsTopicArn && props.notificationLevel) {
      new cdk.aws_events.CfnRule(this, 'SecurityHubSnsEventsRule', {
        description: 'Sends Security Hub Findings above threshold to SNS',
        eventPattern: {
          source: ['aws.securityhub'],
          'detail-type': ['Security Hub Findings - Imported'],
          detail: {
            findings: {
              Severity: {
                Label: this.getSeverityLevelArray(props.notificationLevel),
              },
            },
          },
        },
        targets: [{ arn: props.snsTopicArn, id: 'SnsTarget' }],
      });
    }
  }

  private getLogRuleEventPattern(logLevel?: string) {
    if (logLevel) {
      return {
        source: ['aws.securityhub'],
        'detail-type': ['Security Hub Findings - Imported'],
        detail: {
          findings: {
            Severity: {
              Label: this.getSeverityLevelArray(logLevel),
            },
          },
        },
      };
    } else {
      return {
        source: ['aws.securityhub'],
        'detail-type': ['Security Hub Findings - Imported'],
      };
    }
  }

  private getSeverityLevelArray(level: string) {
    switch (level) {
      case 'CRITICAL':
        return ['CRITICAL'];
      case 'HIGH':
        return ['CRITICAL', 'HIGH'];
      case 'MEDIUM':
        return ['CRITICAL', 'HIGH', 'MEDIUM'];
      case 'LOW':
        return ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
      case 'INFORMATIONAL':
      default:
        return ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL'];
    }
  }
}
