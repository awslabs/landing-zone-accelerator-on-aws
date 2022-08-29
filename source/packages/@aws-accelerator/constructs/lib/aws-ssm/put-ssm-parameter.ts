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
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

/**
 * SsmParameterProps
 */
export interface SsmParameterProps {
  readonly region: string;
  readonly partition: string;
  /**
   * SSM Parameter
   */
  /**
   * Custom resource lambda log group encryption key
   */
  readonly kmsKey: cdk.aws_kms.IKey;
  /**
   * Custom resource lambda log retention in days
   */
  readonly logRetentionInDays: number;
  readonly parameter: {
    /**
     * Name of the parameter
     */
    name: string;
    /**
     * Target account id of the parameter
     */
    accountId: string;
    /**
     * Role name to assume to access the parameter in target account
     */
    roleName: string;
    /**
     * Value to put when when using SsmParameterType.PUT
     */
    value: string;
  };
  readonly invokingAccountID: string;
}

/**
 * SsmParameter class - to get ssm parameter value from other account
 */
export class PutSsmParameter extends Construct {
  public readonly parameterName: string;
  public readonly value: string = '';

  constructor(scope: Construct, id: string, props: SsmParameterProps) {
    super(scope, id);

    this.parameterName = props.parameter.name;
    this.value = props.parameter.value;
    const assumeRoleArn = `arn:${props.partition}:iam::${props.parameter.accountId}:role/${props.parameter.roleName}`;

    const policyStatements = [];
    const RESOURCE_TYPE = 'Custom::SsmPutParameterValue';
    const codeDirectory = path.join(__dirname, 'put-param-value/dist');
    const description = `Custom resource provider to put cross-account ssm parameter value`;

    // Push policy statement
    policyStatements.push({
      Sid: 'SsmPutParameterActions',
      Effect: 'Allow',
      Action: ['ssm:DeleteParameter', 'ssm:PutParameter'],
      Resource: ['*'],
    });

    policyStatements.push({
      Sid: 'StsAssumeRoleActions',
      Effect: 'Allow',
      Action: ['sts:AssumeRole'],
      Resource: [`arn:${cdk.Stack.of(this).partition}:iam::*:role/AWSAccelerator*`],
    });

    const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, RESOURCE_TYPE, {
      codeDirectory,
      description,
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_14_X,
      policyStatements,
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: RESOURCE_TYPE,
      serviceToken: provider.serviceToken,
      properties: {
        region: props.region,
        parameterAccountID: props.parameter.accountId,
        parameterName: props.parameter.name,
        parameterValue: props.parameter.value,
        assumeRoleArn: assumeRoleArn,
        invokingAccountID: props.invokingAccountID,
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
  }
}
