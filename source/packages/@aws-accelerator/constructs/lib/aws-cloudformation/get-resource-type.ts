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
import { NagSuppressions } from 'cdk-nag';

const path = require('path');

/**
 * Get the ResourceType from a CloudFormation Stack by supplying
 * the logicalId
 */
export interface GetCloudFormationResourceTypeProps {
  readonly stackName: string;
  readonly logicalResourceId: string;
  readonly partition: string;
  /**
   * Custom resource lambda log group encryption key
   */
  readonly cloudwatchKmsKey: cdk.aws_kms.Key;
  /**
   * Custom resource lambda log retention in days
   */
  readonly logRetentionInDays: number;
}

export class GetCloudFormationResourceType extends Construct {
  public readonly id: string;

  constructor(scope: Construct, id: string, props: GetCloudFormationResourceTypeProps) {
    super(scope, id);

    const RESOURCE_TYPE = 'Custom::GetCloudFormationResourceType';

    const cloudformationPolicy = new cdk.aws_iam.PolicyStatement({
      sid: 'cloudformation',
      effect: cdk.aws_iam.Effect.ALLOW,
      actions: ['cloudformation:DescribeStackResource'],
      resources: [`arn:${props.partition}:cloudformation:*:${cdk.Stack.of(this).account}`],
    });

    const lambdaFunction = new cdk.aws_lambda.Function(this, 'GetCloudFormationResourceTypeFunction', {
      code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, 'get-resource-type/dist')),
      runtime: cdk.aws_lambda.Runtime.NODEJS_16_X,
      handler: 'index.handler',
      timeout: cdk.Duration.minutes(3),
      description: 'Get CloudFormation Resources from Stack by LogicalResourceId',
      initialPolicy: [cloudformationPolicy],
    });

    new cdk.aws_logs.LogGroup(this, `${lambdaFunction.node.id}LogGroup`, {
      logGroupName: `/aws/lambda/${lambdaFunction.functionName}`,
      retention: props.logRetentionInDays,
      encryptionKey: props.cloudwatchKmsKey,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const provider = new cdk.custom_resources.Provider(this, 'GetCloudFormationResourceTypeProvider', {
      onEventHandler: lambdaFunction,
    });

    const resource = new cdk.CustomResource(this, 'GetCloudFormationResourceTypeResource', {
      resourceType: RESOURCE_TYPE,
      serviceToken: provider.serviceToken,
      properties: {
        stackName: props.stackName,
        logicalResourceId: props.logicalResourceId,
      },
    });

    NagSuppressions.addResourceSuppressions(
      lambdaFunction,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'Lambda managed policy',
        },
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Lambda managed policy',
        },
      ],
      true,
    );

    NagSuppressions.addResourceSuppressions(
      provider,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'CDK generated provider',
        },
        {
          id: 'AwsSolutions-IAM5',
          reason: 'CDK generated provider',
        },
      ],
      true,
    );

    this.id = resource.ref;
  }
}
