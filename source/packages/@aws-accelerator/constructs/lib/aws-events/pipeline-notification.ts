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

/**
 * Shared message template for pipeline execution notifications
 */
const NOTIFICATION_MESSAGE_LINES = [
  `Pipeline ${cdk.aws_events.EventField.fromPath('$.detail.pipeline')} has ${cdk.aws_events.EventField.fromPath('$.detail.state')}`,
  '',
  `Execution ID: ${cdk.aws_events.EventField.fromPath('$.detail.execution-id')}`,
  `Time: ${cdk.aws_events.EventField.fromPath('$.time')}`,
  `Region: ${cdk.aws_events.EventField.fromPath('$.region')}`,
  `Account: ${cdk.aws_events.EventField.fromPath('$.account')}`,
  '',
  `View pipeline: https://console.aws.amazon.com/codesuite/codepipeline/pipelines/${cdk.aws_events.EventField.fromPath('$.detail.pipeline')}/view?region=${cdk.aws_events.EventField.fromPath('$.region')}`,
  `View execution: https://console.aws.amazon.com/codesuite/codepipeline/pipelines/${cdk.aws_events.EventField.fromPath('$.detail.pipeline')}/executions/${cdk.aws_events.EventField.fromPath('$.detail.execution-id')}/timeline?region=${cdk.aws_events.EventField.fromPath('$.region')}`,
];

/**
 * Shared message template for action execution notifications (manual approvals)
 */
const ACTION_NOTIFICATION_MESSAGE_LINES = [
  `Pipeline ${cdk.aws_events.EventField.fromPath('$.detail.pipeline')} - Action ${cdk.aws_events.EventField.fromPath('$.detail.action')} has ${cdk.aws_events.EventField.fromPath('$.detail.state')}`,
  '',
  `Stage: ${cdk.aws_events.EventField.fromPath('$.detail.stage')}`,
  `Action: ${cdk.aws_events.EventField.fromPath('$.detail.action')}`,
  `Execution ID: ${cdk.aws_events.EventField.fromPath('$.detail.execution-id')}`,
  `Time: ${cdk.aws_events.EventField.fromPath('$.time')}`,
  `Region: ${cdk.aws_events.EventField.fromPath('$.region')}`,
  `Account: ${cdk.aws_events.EventField.fromPath('$.account')}`,
  '',
  `View pipeline: https://console.aws.amazon.com/codesuite/codepipeline/pipelines/${cdk.aws_events.EventField.fromPath('$.detail.pipeline')}/view?region=${cdk.aws_events.EventField.fromPath('$.region')}`,
  `View execution: https://console.aws.amazon.com/codesuite/codepipeline/pipelines/${cdk.aws_events.EventField.fromPath('$.detail.pipeline')}/executions/${cdk.aws_events.EventField.fromPath('$.detail.execution-id')}/timeline?region=${cdk.aws_events.EventField.fromPath('$.region')}`,
];

/**
 * Construction properties for PipelineNotification.
 */
export interface PipelineNotificationProps {
  /**
   * The CodePipeline to monitor
   */
  readonly pipeline: cdk.aws_codepipeline.Pipeline;

  /**
   * KMS key for SNS topic encryption
   */
  readonly kmsKey: cdk.aws_kms.IKey;

  /**
   * SNS topic name prefix
   */
  readonly topicNamePrefix: string;
}

/**
 * Class to configure EventBridge-based pipeline notifications using input transformation
 * Creates two separate SNS topics: one for status updates and one for failures
 */
export class PipelineNotification extends Construct {
  public readonly statusTopic: cdk.aws_sns.Topic;
  public readonly failureTopic: cdk.aws_sns.Topic;

  constructor(scope: Construct, id: string, props: PipelineNotificationProps) {
    super(scope, id);

    // Create SNS topic for status updates (STARTED, SUCCEEDED, RESUMED, SUPERSEDED)
    this.statusTopic = new cdk.aws_sns.Topic(this, 'StatusTopic', {
      displayName: `${props.topicNamePrefix}-pipeline-status`,
      topicName: `${props.topicNamePrefix}-pipeline-status`,
      masterKey: props.kmsKey,
    });

    // Create SNS topic for failures (FAILED, CANCELED)
    this.failureTopic = new cdk.aws_sns.Topic(this, 'FailureTopic', {
      displayName: `${props.topicNamePrefix}-pipeline-failure`,
      topicName: `${props.topicNamePrefix}-pipeline-failure`,
      masterKey: props.kmsKey,
    });

    // Create EventBridge rule for status updates
    // Maps to CodeStar notification events: STARTED, SUCCEEDED, RESUMED, SUPERSEDED, CANCELED
    const statusRule = new cdk.aws_events.Rule(this, 'StatusEventRule', {
      description: `Capture pipeline status events for ${props.pipeline.pipelineName}`,
      eventPattern: {
        source: ['aws.codepipeline'],
        detailType: ['CodePipeline Pipeline Execution State Change'],
        detail: {
          pipeline: [props.pipeline.pipelineName],
          state: ['STARTED', 'SUCCEEDED', 'RESUMED', 'SUPERSEDED', 'CANCELED'],
        },
      },
    });

    // Create EventBridge rule for failures
    // Maps to CodeStar notification event: PIPELINE_EXECUTION_FAILED
    const failureRule = new cdk.aws_events.Rule(this, 'FailureEventRule', {
      description: `Capture pipeline failure events for ${props.pipeline.pipelineName}`,
      eventPattern: {
        source: ['aws.codepipeline'],
        detailType: ['CodePipeline Pipeline Execution State Change'],
        detail: {
          pipeline: [props.pipeline.pipelineName],
          state: ['FAILED'],
        },
      },
    });

    // Create EventBridge rule for manual approval actions
    // Maps to CodeStar notification events: MANUAL_APPROVAL_NEEDED, MANUAL_APPROVAL_SUCCEEDED, MANUAL_APPROVAL_FAILED
    const approvalRule = new cdk.aws_events.Rule(this, 'ApprovalEventRule', {
      description: `Capture manual approval events for ${props.pipeline.pipelineName}`,
      eventPattern: {
        source: ['aws.codepipeline'],
        detailType: ['CodePipeline Action Execution State Change'],
        detail: {
          pipeline: [props.pipeline.pipelineName],
          type: {
            category: ['Approval'],
          },
          state: ['STARTED', 'SUCCEEDED', 'FAILED'],
        },
      },
    });

    // Add targets with input transformation using L2 construct
    statusRule.addTarget(
      new cdk.aws_events_targets.SnsTopic(this.statusTopic, {
        message: cdk.aws_events.RuleTargetInput.fromMultilineText(NOTIFICATION_MESSAGE_LINES.join('\n')),
      }),
    );

    failureRule.addTarget(
      new cdk.aws_events_targets.SnsTopic(this.failureTopic, {
        message: cdk.aws_events.RuleTargetInput.fromMultilineText(NOTIFICATION_MESSAGE_LINES.join('\n')),
      }),
    );

    approvalRule.addTarget(
      new cdk.aws_events_targets.SnsTopic(this.statusTopic, {
        message: cdk.aws_events.RuleTargetInput.fromMultilineText(ACTION_NOTIFICATION_MESSAGE_LINES.join('\n')),
      }),
    );

    // Grant EventBridge permission to publish to SNS topics
    this.statusTopic.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        principals: [new cdk.aws_iam.ServicePrincipal('events.amazonaws.com')],
        actions: ['sns:Publish'],
        resources: [this.statusTopic.topicArn],
        conditions: {
          StringEquals: {
            'aws:SourceAccount': cdk.Stack.of(this).account,
          },
        },
      }),
    );

    this.failureTopic.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        principals: [new cdk.aws_iam.ServicePrincipal('events.amazonaws.com')],
        actions: ['sns:Publish'],
        resources: [this.failureTopic.topicArn],
        conditions: {
          StringEquals: {
            'aws:SourceAccount': cdk.Stack.of(this).account,
          },
        },
      }),
    );
  }
}
