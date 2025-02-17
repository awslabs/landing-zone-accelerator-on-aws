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
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import * as path from 'path';

import { copyPoliciesToDeploymentPackage } from '../common-functions';
import { DEFAULT_LAMBDA_RUNTIME } from '@aws-accelerator/utils/lib/lambda';

/**
 * Remediate resource policy
 * This construct creates a Lambda function which will be triggered by SSM Automation and used to
 * remediate any non-compliant resource policy detected by ${stack.partition} Config Rule
 */
export interface RemediateResourcePolicyProps {
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
   * SCP File Paths
   */
  readonly rbpFilePaths: { name: string; path: string; tempPath: string }[];
  /**
   * Input parameters as lambda environment variable
   */
  readonly inputParameters?: { [key: string]: string };
}

export class RemediateResourcePolicy extends Construct {
  lambdaFunction: cdk.aws_lambda.Function;

  constructor(scope: Construct, id: string, props: RemediateResourcePolicyProps) {
    super(scope, id);

    const deploymentPackagePath = path.join(__dirname, 'lambda-handler/dist');
    copyPoliciesToDeploymentPackage(props.rbpFilePaths, deploymentPackagePath, cdk.Stack.of(this).account);

    const LAMBDA_TIMEOUT_IN_MINUTES = 1;

    this.lambdaFunction = new cdk.aws_lambda.Function(this, 'RemediateResourcePolicyFunction', {
      code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, 'lambda-handler/dist')),
      runtime: DEFAULT_LAMBDA_RUNTIME,
      handler: 'remediate-resource-policy.handler',
      description: 'Lambda function to remediate non-compliant resource based policy',
      timeout: cdk.Duration.minutes(LAMBDA_TIMEOUT_IN_MINUTES),
      environment: {
        ...props.inputParameters,
        ACCELERATOR_PREFIX: props.acceleratorPrefix,
        AWS_PARTITION: cdk.Aws.PARTITION,
        HOME_REGION: props.homeRegion,
      },
      environmentEncryption: props.kmsKeyLambda,
    });

    this.addPermissionToLambdaRole(this.lambdaFunction);

    new cdk.aws_logs.LogGroup(this, `${this.lambdaFunction.node.id}LogGroup`, {
      logGroupName: `/aws/lambda/${this.lambdaFunction.functionName}`,
      retention: props.logRetentionInDays,
      encryptionKey: props.kmsKeyCloudWatch,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
  }

  private addPermissionToLambdaRole(lambdaFunction: cdk.aws_lambda.Function) {
    const stack = cdk.Stack.of(this);
    lambdaFunction.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: [
          'iam:getRole',
          'iam:updateAssumeRolePolicy',
          's3:GetBucketPolicy',
          's3:PutBucketPolicy',
          'kms:GetKeyPolicy',
          'kms:PutKeyPolicy',
          'kms:DescribeKey',
          'secretsmanager:GetResourcePolicy',
          'secretsmanager:PutResourcePolicy',
          'secretsmanager:ValidateResourcePolicy',
          'lex:DescribeResourcePolicy',
          'lex:UpdateResourcePolicy',
          'lex:CreateResourcePolicy',
          'apigateway:UpdateRestApiPolicy',
          'apigateway:GET',
          'apigateway:PATCH',
          'ecr:GetRepositoryPolicy',
          'ecr:SetRepositoryPolicy',
          'es:ESHttpGet',
          'es:ESHttpPut',
          'es:DescribeDomainConfig',
          'es:UpdateDomainConfig',
          'sns:GetTopicAttributes',
          'sns:SetTopicAttributes',
          'sqs:GetQueueAttributes',
          'sqs:SetQueueAttributes',
          'elasticfilesystem:DescribeFileSystemPolicy',
          'elasticfilesystem:PutFileSystemPolicy',
          'codeartifact:GetDomainPermissionsPolicy',
          'codeartifact:GetRepositoryPermissionsPolicy',
          'codeartifact:PutDomainPermissionsPolicy',
          'codeartifact:PutRepositoryPermissionsPolicy',
          'events:DescribeEventBus',
          'events:PutPermission',
          'backup:GetBackupVaultAccessPolicy',
          'backup:PutBackupVaultAccessPolicy',
          'acm-pca:PutPolicy',
          'acm-pca:GetPolicy',
          'lambda:GetPolicy',
          'lambda:AddPermission',
          'lambda:RemovePermission',
        ],
        resources: [
          `arn:${stack.partition}:iam::${stack.account}:*`, // Policy doesn't allow  region in S3 arn in resource
          `arn:${stack.partition}:s3:::*`, // Policy doesn't allow account and region in S3 arn in resource
          `arn:${stack.partition}:kms:${stack.region}:${stack.account}:*`,
          `arn:${stack.partition}:secretsmanager:${stack.region}:${stack.account}:*`,
          `arn:${stack.partition}:lex:${stack.region}:${stack.account}:*`,
          `arn:${stack.partition}:apigateway:${stack.region}::*`, // Policy doesn't allow account ID in apigateway ARN
          `arn:${stack.partition}:ecr:${stack.region}:${stack.account}:*`,
          `arn:${stack.partition}:es:${stack.region}:${stack.account}:*`,
          `arn:${stack.partition}:sns:${stack.region}:${stack.account}:*`,
          `arn:${stack.partition}:sqs:${stack.region}:${stack.account}:*`,
          `arn:${stack.partition}:elasticfilesystem:${stack.region}:${stack.account}:*`,
          `arn:${stack.partition}:codeartifact:${stack.region}:${stack.account}:*`,
          `arn:${stack.partition}:lambda:${stack.region}:${stack.account}:*`,
          `arn:${stack.partition}:backup:${stack.region}:${stack.account}:*`,
          `arn:${stack.partition}:events:${stack.region}:${stack.account}:*`,
          `arn:${stack.partition}:acm-pca:${stack.region}:${stack.account}:*`,
        ],
      }),
    );
    lambdaFunction.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['config:BatchGetResourceConfig', 'config:SelectResourceConfig'],
        resources: ['*'],
      }),
    );

    // AwsSolutions-IAM4: The IAM user, lambdaFunction.addToRolePolicy, or group uses AWS managed policies
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
  }
}
