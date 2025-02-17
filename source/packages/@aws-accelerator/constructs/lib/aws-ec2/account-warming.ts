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

import { DEFAULT_LAMBDA_RUNTIME } from '@aws-accelerator/utils/lib/lambda';
import * as cdk from 'aws-cdk-lib';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import path = require('path');

export interface WarmAccountProps {
  readonly cloudwatchKmsKey?: cdk.aws_kms.IKey;
  readonly logRetentionInDays: number;
  readonly ssmPrefix: string;
}

export class WarmAccount extends Construct {
  readonly onEvent: cdk.aws_lambda.IFunction;
  readonly isComplete: cdk.aws_lambda.IFunction;
  readonly provider: cdk.custom_resources.Provider;
  readonly id: string;

  constructor(scope: Construct, id: string, props: WarmAccountProps) {
    super(scope, id);

    const WARM_ACCOUNT = 'Custom::WarmAccount';

    const ec2Policy = new cdk.aws_iam.PolicyStatement({
      sid: 'ec2',
      effect: cdk.aws_iam.Effect.ALLOW,
      actions: ['ec2:DescribeVpcs', 'ec2:DescribeInstances', 'ec2:DescribeSubnets'],
      resources: ['*'],
    });

    const ec2DeletePolicy = new cdk.aws_iam.PolicyStatement({
      sid: 'ec2Delete',
      effect: cdk.aws_iam.Effect.ALLOW,
      actions: ['ec2:DeleteVpc', 'ec2:DeleteSubnet', 'ec2:TerminateInstances'],
      resources: ['*'],
      conditions: {
        StringEquals: {
          'aws:ResourceTag/Name': 'accelerator-warm',
        },
      },
    });

    const ec2RunPolicy = new cdk.aws_iam.PolicyStatement({
      sid: 'ec2Run',
      effect: cdk.aws_iam.Effect.ALLOW,
      actions: ['ec2:RunInstances'],
      resources: [
        `arn:${cdk.Stack.of(this).partition}:ec2:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:subnet/*`,
        `arn:${cdk.Stack.of(this).partition}:ec2:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:instance/*`,
        `arn:${cdk.Stack.of(this).partition}:ec2:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:volume/*`,
        `arn:${cdk.Stack.of(this).partition}:ec2:${cdk.Stack.of(this).region}:${
          cdk.Stack.of(this).account
        }:security-group/*`,
        `arn:${cdk.Stack.of(this).partition}:ec2:${cdk.Stack.of(this).region}::image/*`,
        `arn:${cdk.Stack.of(this).partition}:ec2:${cdk.Stack.of(this).region}::snapshot/*`,
        `arn:${cdk.Stack.of(this).partition}:ec2:${cdk.Stack.of(this).region}:${
          cdk.Stack.of(this).account
        }:network-interface/*`,
      ],
    });

    const ec2CreateTags = new cdk.aws_iam.PolicyStatement({
      sid: 'ec2CreateTags',
      effect: cdk.aws_iam.Effect.ALLOW,
      actions: ['ec2:CreateTags'],
      resources: [
        `arn:${cdk.Stack.of(this).partition}:ec2:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:instance/*`,
        `arn:${cdk.Stack.of(this).partition}:ec2:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:volume/*`,
      ],
      conditions: {
        StringEquals: {
          'ec2:CreateAction': 'RunInstances',
        },
      },
    });

    const ec2CreateVpcTags = new cdk.aws_iam.PolicyStatement({
      sid: 'ec2CreateVpcTags',
      effect: cdk.aws_iam.Effect.ALLOW,
      actions: ['ec2:CreateTags'],
      resources: [
        `arn:${cdk.Stack.of(this).partition}:ec2:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:vpc/*`,
      ],
      conditions: {
        StringEquals: {
          'ec2:CreateAction': 'CreateVpc',
        },
      },
    });

    const ec2CreateSubnetTags = new cdk.aws_iam.PolicyStatement({
      sid: 'ec2CreateSubnetTags',
      effect: cdk.aws_iam.Effect.ALLOW,
      actions: ['ec2:CreateTags'],
      resources: [
        `arn:${cdk.Stack.of(this).partition}:ec2:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:subnet/*`,
      ],
      conditions: {
        StringEquals: {
          'ec2:CreateAction': 'CreateSubnet',
        },
      },
    });

    const ec2CreationPolicy = new cdk.aws_iam.PolicyStatement({
      sid: 'vpccreation',
      effect: cdk.aws_iam.Effect.ALLOW,
      actions: ['ec2:CreateVpc', 'ec2:CreateSubnet'],
      resources: ['*'],
    });

    const ssmPolicy = new cdk.aws_iam.PolicyStatement({
      sid: 'ssm',
      effect: cdk.aws_iam.Effect.ALLOW,
      actions: ['ssm:GetParameter', 'ssm:PutParameter', 'ssm:DeleteParameter'],
      resources: [
        `arn:${cdk.Stack.of(this).partition}:ssm:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:parameter${
          props.ssmPrefix
        }/account/pre-warmed`,
      ],
    });

    const ssmAmiPolicy = new cdk.aws_iam.PolicyStatement({
      sid: 'ssmami',
      effect: cdk.aws_iam.Effect.ALLOW,
      actions: ['ssm:GetParameter'],
      resources: [
        `arn:${cdk.Stack.of(this).partition}:ssm:${
          cdk.Stack.of(this).region
        }::parameter/aws/service/ami-amazon-linux-latest/amzn2-ami-hvm-x86_64-gp2`,
      ],
    });

    this.onEvent = new cdk.aws_lambda.Function(this, 'WarmAccountFunction', {
      code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, 'account-warming/dist')),
      runtime: DEFAULT_LAMBDA_RUNTIME,
      handler: 'index.handler',
      timeout: cdk.Duration.minutes(5),
      description: 'Account warming onEvent handler',
      initialPolicy: [
        ec2Policy,
        ec2DeletePolicy,
        ec2CreationPolicy,
        ec2RunPolicy,
        ec2CreateTags,
        ec2CreateVpcTags,
        ec2CreateSubnetTags,
        ssmPolicy,
        ssmAmiPolicy,
      ],
    });

    const onEventLogGroup = new cdk.aws_logs.LogGroup(this, `${this.onEvent.node.id}LogGroup`, {
      logGroupName: `/aws/lambda/${this.onEvent.functionName}`,
      retention: props.logRetentionInDays,
      encryptionKey: props.cloudwatchKmsKey,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.isComplete = new cdk.aws_lambda.Function(this, 'WarmAccountStatusFunction', {
      code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, 'account-warming-status/dist')),
      runtime: DEFAULT_LAMBDA_RUNTIME,
      handler: 'index.handler',
      timeout: cdk.Duration.minutes(5),
      description: 'Account warming isComplete handler',
      initialPolicy: [ec2Policy, ec2DeletePolicy, ssmPolicy],
    });

    const isCompleteLogGroup = new cdk.aws_logs.LogGroup(this, `${this.isComplete.node.id}LogGroup`, {
      logGroupName: `/aws/lambda/${this.isComplete.functionName}`,
      retention: props.logRetentionInDays,
      encryptionKey: props.cloudwatchKmsKey,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    const waiterStateMachineLogGroup = new cdk.aws_logs.LogGroup(this, `${this.onEvent.node.id}WaiterLogGroup`, {
      logGroupName: `/aws/vendedlogs/states/waiter-state-machine/${this.onEvent.node.id}`,
      retention: props.logRetentionInDays,
      encryptionKey: props.cloudwatchKmsKey,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.provider = new cdk.custom_resources.Provider(this, 'WarmAccountProvider', {
      onEventHandler: this.onEvent,
      isCompleteHandler: this.isComplete,
      queryInterval: cdk.Duration.minutes(2),
      totalTimeout: cdk.Duration.hours(1),
      waiterStateMachineLogOptions: {
        destination: waiterStateMachineLogGroup,
        includeExecutionData: true,
        level: cdk.aws_stepfunctions.LogLevel.ERROR, // error is the default level that CDK auto-creates
      },
    });

    const resource = new cdk.CustomResource(this, 'WarmAccountResource', {
      resourceType: WARM_ACCOUNT,
      serviceToken: this.provider.serviceToken,
      properties: {
        ssmPrefix: props.ssmPrefix,
      },
    });

    NagSuppressions.addResourceSuppressions(
      this.isComplete,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'Custom resource lambda require access to other services',
        },
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Policy is limited to certain tag properties',
        },
      ],
      true,
    );

    NagSuppressions.addResourceSuppressions(
      this.onEvent,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'Custom resource lambda require access to other services',
        },
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Policy is limited to certain tag properties',
        },
      ],
      true,
    );

    NagSuppressions.addResourceSuppressions(
      this.provider,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'CDK Generated Role',
        },
        {
          id: 'AwsSolutions-IAM5',
          reason: 'CDK Generated Policy',
        },
        {
          id: 'AwsSolutions-SF1',
          reason: 'CDK Generated StateMachine',
        },
        {
          id: 'AwsSolutions-SF2',
          reason: 'CDK Generated StateMachine',
        },
      ],
      true,
    );
    // Ensure that the LogGroup is created by Cloudformation prior to Lambda execution
    resource.node.addDependency(isCompleteLogGroup);
    resource.node.addDependency(onEventLogGroup);
    resource.node.addDependency(waiterStateMachineLogGroup);
    this.id = resource.ref;
  }
}
