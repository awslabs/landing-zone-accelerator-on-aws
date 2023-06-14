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
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';

import * as fs from 'fs';
import * as path from 'path';

/**
 * Organizations Revert Scp Changes
 * This construct creates a Lambda function and eventbridge rule to trigger on
 * service control policy (scp) changes as well as attach and detach actions. Upon
 * receiving an event, the Lambda function will evaluate the change and revert to the
 * state defined by the organization-config file.
 */
export interface RevertScpChangesProps {
  /**
   * Configuration directory path
   */
  readonly configDirPath: string;
  /**
   * Accelerator home region
   */
  readonly homeRegion: string;
  /**
   * Lambda log group encryption key
   */
  readonly kmsKeyCloudWatch: cdk.aws_kms.Key;
  /**
   * Lambda environment variable encryption key
   */
  readonly kmsKeyLambda: cdk.aws_kms.Key;
  /**
   * Lambda log retention in days
   */
  readonly logRetentionInDays: number;
  /**
   * Accelerator SNS topic name Prefix
   */
  readonly acceleratorTopicNamePrefix: string;
  /**
   * SNS Topic Name to publish notifications to
   */
  readonly snsTopicName: string | undefined;
  /**
   * SCP File Paths
   */
  readonly scpFilePaths: { name: string; path: string; tempPath: string }[];
}

export class RevertScpChanges extends Construct {
  constructor(scope: Construct, id: string, props: RevertScpChangesProps) {
    super(scope, id);

    this.copyPoliciesToDeploymentPackage(props.scpFilePaths);
    this.copyConfigsToDeploymentPackage(['accounts-config.yaml', 'organization-config.yaml'], props.configDirPath);

    const LAMBDA_TIMEOUT_IN_MINUTES = 1;
    let snsTopicArn = '';

    const kmsEncryptMessage = new cdk.aws_iam.PolicyStatement({
      sid: 'kmsEncryptMessage',
      effect: cdk.aws_iam.Effect.ALLOW,
      actions: ['kms:Encrypt', 'kms:GenerateDataKey'],
      resources: ['*'],
    });

    const orgPolicyUpdate = new cdk.aws_iam.PolicyStatement({
      sid: 'OrgPolicyUpdate',
      effect: cdk.aws_iam.Effect.ALLOW,
      actions: [
        'organizations:AttachPolicy',
        'organizations:DetachPolicy',
        'organizations:DescribePolicy',
        'organizations:ListAccounts',
        'organizations:ListRoots',
        'organizations:ListOrganizationalUnitsForParent',
        'organizations:UpdatePolicy',
      ],
      resources: ['*'],
    });

    const revertScpChangesPolicyList = [kmsEncryptMessage, orgPolicyUpdate];

    if (props.snsTopicName) {
      snsTopicArn = `arn:${cdk.Stack.of(this).partition}:sns:${props.homeRegion}:${cdk.Stack.of(this).account}:${
        props.acceleratorTopicNamePrefix
      }-${props.snsTopicName}`;
      revertScpChangesPolicyList.push(
        new cdk.aws_iam.PolicyStatement({
          sid: 'snsPublishMessage',
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['sns:Publish'],
          resources: [snsTopicArn],
        }),
      );
    }

    const revertScpChangesFunction = new cdk.aws_lambda.Function(this, 'RevertScpChangesFunction', {
      code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, 'revert-scp-changes/dist')),
      runtime: cdk.aws_lambda.Runtime.NODEJS_16_X,
      handler: 'index.handler',
      description: 'Lambda function to revert changes made to LZA-controlled service control policies',
      timeout: cdk.Duration.minutes(LAMBDA_TIMEOUT_IN_MINUTES),
      environment: {
        AWS_PARTITION: cdk.Aws.PARTITION,
        HOME_REGION: props.homeRegion,
        SNS_TOPIC_ARN: snsTopicArn ?? '',
      },
      environmentEncryption: props.kmsKeyLambda,
      initialPolicy: revertScpChangesPolicyList,
    });

    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
    NagSuppressions.addResourceSuppressions(revertScpChangesFunction.role!, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'AWS Custom resource provider framework-role created by cdk.',
      },
    ]);

    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions
    NagSuppressions.addResourceSuppressions(
      revertScpChangesFunction.role!,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Allows only specific policy.',
        },
      ],
      true,
    );

    const modifyScpRule = new cdk.aws_events.Rule(this, 'ModifyScpRule', {
      eventPattern: {
        source: ['aws.organizations'],
        detailType: ['AWS API Call via CloudTrail'],
        detail: {
          eventSource: ['organizations.amazonaws.com'],
          eventName: ['AttachPolicy', 'DetachPolicy', 'UpdatePolicy'],
        },
      },
      description: 'Rule to notify when an LZA-managed SCP is modified or detached.',
    });

    modifyScpRule.addTarget(
      new cdk.aws_events_targets.LambdaFunction(revertScpChangesFunction, {
        maxEventAge: cdk.Duration.hours(4),
        retryAttempts: 2,
      }),
    );

    new cdk.aws_logs.LogGroup(this, `${revertScpChangesFunction.node.id}LogGroup`, {
      logGroupName: `/aws/lambda/${revertScpChangesFunction.functionName}`,
      retention: props.logRetentionInDays,
      encryptionKey: props.kmsKeyCloudWatch,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
  }

  // Copies Service Control Policy files to the Lambda directory for packaging
  private copyPoliciesToDeploymentPackage(filePaths: { name: string; path: string; tempPath: string }[]) {
    const deploymentPackagePath = path.join(__dirname, 'revert-scp-changes/dist');

    // Make policy folder
    fs.mkdirSync(path.join(deploymentPackagePath, 'policies'), { recursive: true });

    for (const policyFilePath of filePaths) {
      // Create subdirectories if they don't exist
      fs.mkdirSync(path.dirname(path.join(deploymentPackagePath, 'policies', policyFilePath.path)), {
        recursive: true,
      });
      //copy from generated temp path to original policy path
      fs.copyFileSync(
        path.join(policyFilePath.tempPath),
        path.join(deploymentPackagePath, 'policies', policyFilePath.path),
      );
    }
  }

  // Copies a list of files from the configuration directory to the Lambda deployment package
  private copyConfigsToDeploymentPackage(fileNames: string[], configDirPath: string) {
    const deploymentPackagePath = path.join(__dirname, 'revert-scp-changes/dist');

    // Make config folder
    fs.mkdirSync(path.join(deploymentPackagePath, 'config'), { recursive: true });

    for (const fileName of fileNames) {
      fs.copyFileSync(path.join(configDirPath, fileName), path.join(deploymentPackagePath, 'config', fileName));
    }
  }
}
