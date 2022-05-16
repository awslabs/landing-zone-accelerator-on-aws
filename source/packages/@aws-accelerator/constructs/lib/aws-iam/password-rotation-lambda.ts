/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

/**
 * Initialized PasswordRotationLambdaProps properties
 */
export interface PasswordRotationLambdaProps {
  /**
   * Name of the user
   */
  readonly userName: string;
  /**
   * Custom resource lambda log group encryption key
   */
  readonly kmsKey: cdk.aws_kms.Key;
  /**
   * Custom resource lambda log retention in days
   */
  readonly logRetentionInDays: number;
}

/**
 /**
 * Class to PasswordRotationLambda
 */
export class PasswordRotationLambda extends Construct {
  constructor(scope: Construct, id: string, props: PasswordRotationLambdaProps) {
    super(scope, id);

    const lambdaFunction = new cdk.aws_lambda.Function(this, 'Resource', {
      code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, 'rotate-user-password/dist')),
      runtime: cdk.aws_lambda.Runtime.NODEJS_14_X,
      handler: 'index.handler',
      description: 'Lambda function to rotate secret',
      environment: { userName: props.userName },
    });

    lambdaFunction.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        actions: ['iam:UpdateLoginProfile'],
        resources: [`arn:${cdk.Stack.of(this).partition}:iam::${cdk.Stack.of(this).account}:user/${props.userName}`],
      }),
    );

    new cdk.aws_logs.LogGroup(this, `${lambdaFunction.node.id}LogGroup`, {
      logGroupName: `/aws/lambda/${lambdaFunction.functionName}`,
      retention: props.logRetentionInDays,
      encryptionKey: props.kmsKey,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
  }
}
