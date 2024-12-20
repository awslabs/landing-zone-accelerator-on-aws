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
import { AcceleratorKeyType, AcceleratorStack, AcceleratorStackProps } from '../stacks/accelerator-stack';
export class KmsKeyResource {
  private stack: AcceleratorStack;

  readonly props: AcceleratorStackProps;
  readonly cloudwatchKey: cdk.aws_kms.IKey | undefined;
  readonly lambdaKey: cdk.aws_kms.IKey | undefined;

  constructor(stack: AcceleratorStack, props: AcceleratorStackProps) {
    this.stack = stack;
    this.props = props;

    //
    // Get or create cloudwatch key
    //
    this.cloudwatchKey = this.createOrGetCloudWatchKey(props);

    //
    // Get or create lambda key
    //
    this.lambdaKey = this.createOrGetLambdaKey(props);
  }

  /**
   * Function to create or get cloudwatch key
   * @param props {@link AccountsStackProps}
   * @returns cdk.aws_kms.IKey
   *
   * @remarks
   * Use existing management account CloudWatch log key if in the home region otherwise create new kms key.
   * CloudWatch key was created in management account region by prepare stack.
   */
  private createOrGetCloudWatchKey(props: AcceleratorStackProps): cdk.aws_kms.IKey | undefined {
    if (!this.stack.isCloudWatchLogsGroupCMKEnabled) {
      return undefined;
    }
    if (props.globalConfig.homeRegion == cdk.Stack.of(this.stack).region) {
      return this.stack.getAcceleratorKey(AcceleratorKeyType.CLOUDWATCH_KEY);
    } else {
      const key = new cdk.aws_kms.Key(this.stack, 'AcceleratorCloudWatchKey', {
        alias: this.stack.acceleratorResourceNames.customerManagedKeys.cloudWatchLog.alias,
        description: this.stack.acceleratorResourceNames.customerManagedKeys.cloudWatchLog.description,
        enableKeyRotation: true,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      });

      // Allow Cloudwatch logs to use the encryption key
      key.addToResourcePolicy(
        new cdk.aws_iam.PolicyStatement({
          sid: `Allow Cloudwatch logs to use the encryption key`,
          principals: [new cdk.aws_iam.ServicePrincipal(`logs.${cdk.Stack.of(this.stack).region}.amazonaws.com`)],
          actions: ['kms:Encrypt*', 'kms:Decrypt*', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:Describe*'],
          resources: ['*'],
          conditions: {
            ArnLike: {
              'kms:EncryptionContext:aws:logs:arn': `arn:${cdk.Stack.of(this.stack).partition}:logs:${
                cdk.Stack.of(this.stack).region
              }:${cdk.Stack.of(this.stack).account}:log-group:*`,
            },
          },
        }),
      );

      this.stack.addSsmParameter({
        logicalId: 'AcceleratorCloudWatchKmsArnParameter',
        parameterName: this.stack.acceleratorResourceNames.parameters.cloudWatchLogCmkArn,
        stringValue: key.keyArn,
      });

      return key;
    }
  }

  /**
   * Function to create or get lambda key
   * @param props {@link AccountsStackProps}
   * @returns cdk.aws_kms.IKey | undefined
   *
   * @remarks
   * Use existing management account Lambda log key if in the home region otherwise create new kms key.
   * Lambda key was created in management account region by prepare stack.
   */
  private createOrGetLambdaKey(props: AcceleratorStackProps): cdk.aws_kms.IKey | undefined {
    if (!this.stack.isLambdaCMKEnabled) {
      return undefined;
    }
    if (props.globalConfig.homeRegion == cdk.Stack.of(this.stack).region) {
      return this.stack.getAcceleratorKey(AcceleratorKeyType.LAMBDA_KEY);
    } else {
      // Create KMS Key for Lambda environment variable encryption
      const key = new cdk.aws_kms.Key(this.stack, 'AcceleratorLambdaKey', {
        alias: this.stack.acceleratorResourceNames.customerManagedKeys.lambda.alias,
        description: this.stack.acceleratorResourceNames.customerManagedKeys.lambda.description,
        enableKeyRotation: true,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      });

      this.stack.addSsmParameter({
        logicalId: 'AcceleratorLambdaKmsArnParameter',
        parameterName: this.stack.acceleratorResourceNames.parameters.lambdaCmkArn,
        stringValue: key.keyArn,
      });

      return key;
    }
  }
}
