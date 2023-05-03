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

const path = require('path');

/**
 * PasswordPolicyProps properties
 */
export interface PasswordPolicyProps {
  readonly allowUsersToChangePassword: boolean;
  readonly hardExpiry: boolean;
  readonly requireUppercaseCharacters: boolean;
  readonly requireLowercaseCharacters: boolean;
  readonly requireSymbols: boolean;
  readonly requireNumbers: boolean;
  readonly minimumPasswordLength: number;
  readonly passwordReusePrevention: number;
  readonly maxPasswordAge: number;
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
 * Class to Update Account Password Policy
 */
export class PasswordPolicy extends Construct {
  public readonly id: string;

  constructor(scope: Construct, id: string, props: PasswordPolicyProps) {
    super(scope, id);

    const RESOURCE_TYPE = 'Custom::IamUpdateAccountPasswordPolicy';

    const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, RESOURCE_TYPE, {
      codeDirectory: path.join(__dirname, 'update-account-password-policy/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_16_X,
      policyStatements: [
        {
          Effect: 'Allow',
          Action: ['iam:UpdateAccountPasswordPolicy'],
          Resource: '*',
        },
      ],
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: RESOURCE_TYPE,
      serviceToken: provider.serviceToken,
      properties: {
        allowUsersToChangePassword: props.allowUsersToChangePassword,
        hardExpiry: props.hardExpiry,
        requireUppercaseCharacters: props.requireUppercaseCharacters,
        requireLowercaseCharacters: props.requireLowercaseCharacters,
        requireSymbols: props.requireSymbols,
        requireNumbers: props.requireNumbers,
        minimumPasswordLength: props.minimumPasswordLength,
        passwordReusePrevention: props.passwordReusePrevention,
        maxPasswordAge: props.maxPasswordAge,
      },
    });

    /**
     * Singleton pattern to define the log group for the singleton function
     * in the stack
     */
    const stack = cdk.Stack.of(scope);
    const logGroup =
      (stack.node.tryFindChild(`${provider.node.id}LogGroup`) as cdk.aws_logs.LogGroup) ??
      new cdk.aws_logs.LogGroup(stack, `${provider.node.id}LogGroup`, {
        logGroupName: `/aws/lambda/${(provider.node.findChild('Handler') as cdk.aws_lambda.CfnFunction).ref}`,
        retention: props.logRetentionInDays,
        encryptionKey: props.kmsKey,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });
    resource.node.addDependency(logGroup);

    this.id = resource.ref;
  }
}
