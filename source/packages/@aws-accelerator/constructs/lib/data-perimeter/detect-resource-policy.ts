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
import * as path from 'path';

import { copyPoliciesToDeploymentPackage } from '../common-functions';

/**
 * Detect Resource Policy
 * This construct creates a Lambda function which is triggered by AWS Config Rule and
 * detect if a resource policy is compliant to the resource policy template by comparing
 * statements in resource policy.
 */
export interface DetectResourcePolicyProps {
  /**
   * Prefix for accelerator resources
   */
  readonly acceleratorPrefix: string;
  /**
   * Configuration directory path
   */
  readonly configDirPath: string;
  /**
   * Accelerator home region
   */
  readonly homeRegion: string;
  /**
   * Lambda log group encryption key, when undefined default AWS managed key will be used
   */
  readonly kmsKeyCloudWatch?: cdk.aws_kms.IKey;
  /**
   * Lambda environment variable encryption key, when undefined default AWS managed key will be used
   */
  readonly kmsKeyLambda?: cdk.aws_kms.IKey;
  /**
   * Lambda log retention in days
   */
  readonly logRetentionInDays: number;
  /**
   * Resource base policy File Paths
   */
  readonly rbpFilePaths: { name: string; path: string; tempPath: string }[];
  /**
   * Input parameters as lambda environment variable
   */
  readonly inputParameters?: { [key: string]: string };
}

export class DetectResourcePolicy extends Construct {
  lambdaFunction: cdk.aws_lambda.Function;

  constructor(scope: Construct, id: string, props: DetectResourcePolicyProps) {
    super(scope, id);

    const deploymentPackagePath = path.join(__dirname, 'lambda-handler/dist');
    copyPoliciesToDeploymentPackage(props.rbpFilePaths, deploymentPackagePath, cdk.Stack.of(this).account);

    const LAMBDA_TIMEOUT_IN_MINUTES = 1;

    this.lambdaFunction = new cdk.aws_lambda.Function(this, 'DetectResourcePolicyFunction', {
      code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, 'lambda-handler/dist')),
      runtime: cdk.aws_lambda.Runtime.NODEJS_18_X,
      handler: 'detect-resource-policy.handler',
      description: 'Lambda function to detect non-compliant resource policy',
      timeout: cdk.Duration.minutes(LAMBDA_TIMEOUT_IN_MINUTES),
      environment: {
        ...props.inputParameters,
        ACCELERATOR_PREFIX: props.acceleratorPrefix,
        AWS_PARTITION: cdk.Aws.PARTITION,
        HOME_REGION: props.homeRegion,
      },
      environmentEncryption: props.kmsKeyLambda,
    });

    const stack = cdk.Stack.of(this);
    this.lambdaFunction.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: [
          'secretsmanager:GetResourcePolicy',
          'lex:DescribeResourcePolicy',
          'apigateway:GET',
          'lambda:GetPolicy',
          'backup:GetBackupVaultAccessPolicy',
          'codeartifact:GetRepositoryPermissionsPolicy',
          'events:DescribeEventBus',
          'acm-pca:GetPolicy',
        ],
        resources: [
          `arn:${stack.partition}:secretsmanager:${stack.region}:${stack.account}:*`, // "arn:aws:s3:::*"
          `arn:${stack.partition}:lex:${stack.region}:${stack.account}:*`,
          `arn:${stack.partition}:apigateway:${stack.region}::*`, // Policy doesn't allow account ID in apigateway ARN
          `arn:${stack.partition}:lambda:${stack.region}:${stack.account}:*`,
          `arn:${stack.partition}:backup:${stack.region}:${stack.account}:*`,
          `arn:${stack.partition}:codeartifact:${stack.region}:${stack.account}:*`,
          `arn:${stack.partition}:events:${stack.region}:${stack.account}:*`,
          `arn:${stack.partition}:acm-pca:${stack.region}:${stack.account}:*`,
        ],
      }),
    );

    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
    NagSuppressions.addResourceSuppressions(this.lambdaFunction.role!, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'AWS Custom resource provider framework-role created by cdk.',
      },
    ]);

    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions
    NagSuppressions.addResourceSuppressions(
      this.lambdaFunction.role!,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Allows only specific policy.',
        },
      ],
      true,
    );

    new cdk.aws_logs.LogGroup(this, `${this.lambdaFunction.node.id}LogGroup`, {
      logGroupName: `/aws/lambda/${this.lambdaFunction.functionName}`,
      retention: props.logRetentionInDays,
      encryptionKey: props.kmsKeyCloudWatch,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
  }
}
