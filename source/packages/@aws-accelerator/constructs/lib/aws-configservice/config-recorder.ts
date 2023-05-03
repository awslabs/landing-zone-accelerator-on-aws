/**
 *  Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
const path = require('path');

export interface ConfigServiceRecorderProps {
  /**
   * S3 Bucket Name for Delivery Channel
   */
  readonly s3BucketName: string;
  /**
   * S3 Bucket KMS Key
   */
  readonly s3BucketKmsKey: cdk.aws_kms.IKey;
  /**
   * Role for config recorder
   */
  configRecorderRoleArn: string;
  /**
   * Custom resource lambda log group encryption key
   */
  readonly cloudwatchKmsKey: cdk.aws_kms.IKey;
  /**
   * Custom resource lambda log retention in days
   */
  readonly logRetentionInDays: number;
  /**
   * Lambda environment encryption key
   */
  readonly lambdaKmsKey: cdk.aws_kms.IKey;
  /**
   * Partition
   */
  readonly partition: string;
  /**
   * Accelerator prefix
   */
  readonly acceleratorPrefix: string;
}

/**
 * Class to Create/Update/Delete Config Recorder
 */
export class ConfigServiceRecorder extends Construct {
  readonly id: string;

  constructor(scope: Construct, id: string, props: ConfigServiceRecorderProps) {
    super(scope, id);

    const CONFIGSERVICE_RECORDER = 'Custom::ConfigServiceRecorder';

    const configRecorderFunctionPolicies = new cdk.aws_iam.PolicyDocument({
      statements: [
        new cdk.aws_iam.PolicyStatement({
          sid: 'configService',
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: [
            'config:DeleteDeliveryChannel',
            'config:DescribeConfigurationRecorders',
            'config:DescribeDeliveryChannelStatus',
            'config:PutConfigurationRecorder',
            'config:PutDeliveryChannel',
            'config:StartConfigurationRecorder',
            'config:StopConfigurationRecorder',
          ],
          resources: ['*'],
        }),
        new cdk.aws_iam.PolicyStatement({
          sid: 'iam',
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['iam:PassRole'],
          resources: [props.configRecorderRoleArn],
        }),
        new cdk.aws_iam.PolicyStatement({
          sid: 'sts',
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['sts:AssumeRole'],
          resources: [props.configRecorderRoleArn],
        }),
        new cdk.aws_iam.PolicyStatement({
          sid: 's3',
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['s3:PutObject*', 's3:GetBucketACL'],
          resources: [
            `arn:${props.partition}:s3:::${props.s3BucketName}`,
            `arn:${props.partition}:s3:::${props.s3BucketName}/*`,
          ],
        }),
      ],
    });

    const lambdaRole = new cdk.aws_iam.Role(this, 'ConfigServiceRecorderFunctionRole', {
      roleName: `${props.acceleratorPrefix}-Config`,
      assumedBy: new cdk.aws_iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')],
      inlinePolicies: { configRecorder: configRecorderFunctionPolicies },
    });

    const lambdaFunction = new cdk.aws_lambda.Function(this, 'ConfigServiceRecorderFunction', {
      code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, 'config-recorder/dist')),
      runtime: cdk.aws_lambda.Runtime.NODEJS_16_X,
      handler: 'index.handler',
      timeout: cdk.Duration.minutes(5),
      description: 'Create/Update Config Recorder',
      environmentEncryption: props.lambdaKmsKey,
      role: lambdaRole,
    });

    new cdk.aws_logs.LogGroup(this, `${lambdaFunction.node.id}LogGroup`, {
      logGroupName: `/aws/lambda/${lambdaFunction.functionName}`,
      retention: props.logRetentionInDays,
      encryptionKey: props.cloudwatchKmsKey,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const provider = new cdk.custom_resources.Provider(this, 'ConfigServiceRecorderProvider', {
      onEventHandler: lambdaFunction,
    });

    const resource = new cdk.CustomResource(this, 'ConfigServiceRecorderResource', {
      resourceType: CONFIGSERVICE_RECORDER,
      serviceToken: provider.serviceToken,
      properties: {
        s3BucketName: props.s3BucketName,
        s3BucketKmsKeyArn: props.s3BucketKmsKey.keyArn,
        recorderRoleArn: props.configRecorderRoleArn,
      },
    });

    this.id = resource.ref;
  }
}
