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
import { v4 as uuidv4 } from 'uuid';

const path = require('path');

/**
 * SsmParameterLookupProps
 */
export interface SsmParameterLookupProps {
  /**
   * Name of the parameter
   */
  readonly name: string;
  /**
   * Parameter account id
   */
  readonly accountId: string;
  /**
   * Parameter region
   */
  readonly parameterRegion: string;
  /**
   * The name of the cross account role to use when accessing
   */
  readonly roleName?: string;
  /**
   * Custom resource lambda log group encryption key
   */
  readonly kmsKey?: cdk.aws_kms.IKey;
  /**
   * Custom resource lambda log retention in days
   */
  readonly logRetentionInDays?: number;
  /**
   * Accelerator Prefix
   */
  readonly acceleratorPrefix: string;
}

/**
 * SsmParameterLookup class - to get ssm parameter value from other account
 */
export class SsmParameterLookup extends Construct {
  public readonly value: string = '';

  constructor(scope: Construct, id: string, props: SsmParameterLookupProps) {
    super(scope, id);

    const RESOURCE_TYPE = 'Custom::SsmGetParameterValue';

    const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, RESOURCE_TYPE, {
      codeDirectory: path.join(__dirname, 'get-param-value/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_16_X,
      policyStatements: [
        {
          Sid: 'SsmGetParameterActions',
          Effect: cdk.aws_iam.Effect.ALLOW,
          Action: ['ssm:GetParameters', 'ssm:GetParameter', 'ssm:DescribeParameters'],
          Resource: ['*'],
        },
        {
          Sid: 'StsAssumeRoleActions',
          Effect: cdk.aws_iam.Effect.ALLOW,
          Action: ['sts:AssumeRole'],
          Resource: [`arn:${cdk.Stack.of(this).partition}:iam::*:role/${props.acceleratorPrefix}*`],
        },
      ],
    });

    const roleArn = props.roleName
      ? `arn:${cdk.Stack.of(this).partition}:iam::${props.accountId}:role/${props.roleName}`
      : '';

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: RESOURCE_TYPE,
      serviceToken: provider.serviceToken,
      properties: {
        parameterRegion: props.parameterRegion,
        invokingRegion: cdk.Stack.of(this).region,
        parameterAccountID: props.accountId,
        parameterName: props.name,
        assumeRoleArn: roleArn,
        invokingAccountID: cdk.Stack.of(this).account,
        uuid: uuidv4(),
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

    this.value = resource.ref;
  }
}
