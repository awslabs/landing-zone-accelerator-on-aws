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
import { NagSuppressions } from 'cdk-nag';

/**
 * LzaLambdaProps properties
 */
export interface LzaLambdaProps {
  /**
   * A name for the function.
   * @default - AWS CloudFormation generates a unique physical ID and uses that
   * ID for the function's name.
   */
  readonly functionName?: string;
  /**
   * LZA Custom resource lambda asset folder path including the /dist folder
   */
  readonly assetPath: string;
  /**
   * Custom resource lambda environment encryption key, when undefined default AWS managed key will be used
   */
  readonly environmentEncryptionKmsKey?: cdk.aws_kms.IKey;
  /**
   * Custom resource lambda log group encryption key, when undefined default AWS managed key will be used
   */
  readonly cloudWatchLogKmsKey?: cdk.aws_kms.IKey;
  /**
   * Custom resource lambda cloudwatch log retention in days
   */
  readonly cloudWatchLogRetentionInDays: number;
  /**
   * A description of the custom resource lambda function.
   */
  readonly description?: string;
  /**
   * Custom resource lambda execution role. This is the role that will be assumed by the function upon execution.
   * @default
   * A unique role will be generated for this lambda function.
   */
  readonly role?: cdk.aws_iam.Role | cdk.aws_iam.IRole;
  /**
   * The amount of memory, in MB, that is allocated to custom resource Lambda function. Lambda uses this value to proportionally allocate the amount of CPU power.
   * @default 256
   */
  readonly memorySize?: number;
  /**
   * Custom resource lambda function execution time (in seconds) after which Lambda terminates the function.
   * @default 3 seconds
   */
  readonly timeOut?: cdk.Duration;
  /**
   * Initial policy statements to add to the created custom resource Lambda Role.
   */
  readonly roleInitialPolicy?: cdk.aws_iam.PolicyStatement[];
  /**
   * The name of the method within lambda code that custom resource lambda calls to execute the function. The format includes the file name.
   * @default 'index.handler'
   */
  readonly handler?: string;
  /**
     * Determine the removal policy of CloudWatch log group for the lambda.
    @default RemovalPolicy.Destroy
     */
  readonly cloudWatchLogRemovalPolicy?: cdk.RemovalPolicy;
  /**
   * A name value object list for lambda environment variables
   *
   * @example
   * [{ solution: 'accelerator', author: 'tsd' }]
   */
  readonly environmentVariables?: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
  }[];
  /**
   * Prefix for nag suppression
   */
  readonly nagSuppressionPrefix: string;
}

/**
 * Class for LZA Lambda Construct
 * Class to create LZA standard Lambda function used for custom resource
 */
export class LzaLambda extends Construct {
  public readonly resource: cdk.aws_lambda.IFunction;

  constructor(scope: Construct, id: string, props: LzaLambdaProps) {
    super(scope, id);

    this.resource = new cdk.aws_lambda.Function(this, 'Resource', {
      functionName: props.functionName,
      description: props.description ?? `Accelerator deployed lambda function.`,
      code: cdk.aws_lambda.Code.fromAsset(props.assetPath),
      runtime: cdk.aws_lambda.Runtime.NODEJS_16_X,
      memorySize: props.memorySize ?? 256,
      timeout: props.timeOut,
      role: props.role,
      initialPolicy: props.roleInitialPolicy,
      handler: props.handler ?? 'index.handler',
      environmentEncryption: props.environmentEncryptionKmsKey,
      environment: this.prepareLambdaEnvironments(props),
    });

    new cdk.aws_logs.LogGroup(this, `${this.resource.node.id}LogGroup`, {
      logGroupName: `/aws/lambda/${this.resource.functionName}`,
      retention: props.cloudWatchLogRetentionInDays,
      encryptionKey: props.cloudWatchLogKmsKey,
      removalPolicy: props.cloudWatchLogRemovalPolicy ?? cdk.RemovalPolicy.DESTROY,
    });

    this.addSuppression(scope, id, props.nagSuppressionPrefix);
  }

  /**
   * Function to add NagSuppressions
   * @param scope {@link Construct}
   * @param id string
   * @param nagSuppressionPrefix string
   */
  private addSuppression(scope: Construct, id: string, nagSuppressionPrefix: string) {
    const stack = cdk.Stack.of(scope);

    const prefix = `${stack.stackName}/${nagSuppressionPrefix}/${id}/Resource`;

    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
    NagSuppressions.addResourceSuppressionsByPath(stack, `${prefix}/ServiceRole/Resource`, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'AWS Lambda needs Managed policy.',
      },
    ]);
    NagSuppressions.addResourceSuppressionsByPath(stack, `${prefix}/ServiceRole/DefaultPolicy/Resource`, [
      {
        id: 'AwsSolutions-IAM5',
        reason: 'AWS Lambda needs Managed policy.',
      },
    ]);
  }

  /**
   * Function to prepare Lambda Environment variables
   * @param props {@link LzaCustomResourceProps}
   * @returns
   */
  private prepareLambdaEnvironments(props: LzaLambdaProps):
    | {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        [key: string]: any;
      }
    | undefined {
    const lambdaEnvironmentList:
      | {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          [key: string]: any;
        }[] = props.environmentVariables ?? [];

    const lambdaEnvironment: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [key: string]: any;
    } = {};

    for (const environmentVariable of lambdaEnvironmentList) {
      for (const [key, value] of Object.entries(environmentVariable)) {
        lambdaEnvironment[key] = value;
      }
    }

    return lambdaEnvironmentList.length > 0 ? lambdaEnvironment : undefined;
  }
}
