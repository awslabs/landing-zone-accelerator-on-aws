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
   * Custom resource lambda log group encryption key
   */
  readonly kmsKey?: cdk.aws_kms.Key;
  /**
   * Custom resource lambda log retention in days
   */
  readonly logRetentionInDays?: number;
}

const CROSS_ACCOUNT_ACCESS_ROLE_NAME = 'AWSAccelerator-CrossAccount-SsmParameter-Role';

/**
 * SsmParameterLookup class - to get ssm parameter value from other account
 */
export class SsmParameterLookup extends Construct {
  public readonly value: string = '';

  static isLogGroupConfigured = false;

  constructor(scope: Construct, id: string, props: SsmParameterLookupProps) {
    super(scope, id);

    const RESOURCE_TYPE = 'Custom::SsmGetParameterValue';

    const roleArn = `arn:${cdk.Stack.of(this).partition}:iam::${
      props.accountId
    }:role/${CROSS_ACCOUNT_ACCESS_ROLE_NAME}`;

    const customResourceLambdaFunction = new cdk.aws_lambda.Function(this, 'SsmGetParameterValueFunction', {
      code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, 'get-param-value/dist')),
      runtime: cdk.aws_lambda.Runtime.NODEJS_14_X,
      handler: 'index.handler',
      description: `Custom resource provider to get ssm parameter ${props.name} value`,
    });

    /**
     * Pre-Creating log group to enable encryption and log retention.
     * Below construct needs to be static
     * isLogGroupConfigured flag used to make sure log group construct synthesize only once in the stack
     */
    if (!SsmParameterLookup.isLogGroupConfigured) {
      const logGroup = new cdk.aws_logs.LogGroup(this, 'LogGroup', {
        logGroupName: `/aws/lambda/${customResourceLambdaFunction.functionName}`,
        retention: props.logRetentionInDays,
        encryptionKey: props.kmsKey,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });

      logGroup.node.addDependency(customResourceLambdaFunction);

      // Enable the flag to indicate log group configured
      SsmParameterLookup.isLogGroupConfigured = true;
    }

    const policyStatements: cdk.aws_iam.PolicyStatement[] = [];

    policyStatements.push(
      new cdk.aws_iam.PolicyStatement({
        sid: 'SsmGetParameterActions',
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['ssm:GetParameters', 'ssm:GetParameter', 'ssm:DescribeParameters'],
        resources: ['*'],
      }),
      new cdk.aws_iam.PolicyStatement({
        sid: 'StsAssumeRoleActions',
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['sts:AssumeRole'],
        resources: [roleArn],
      }),
    );

    policyStatements.forEach(policyStatement => {
      customResourceLambdaFunction?.addToRolePolicy(policyStatement);
    });

    const customResourceProvider = new cdk.custom_resources.Provider(this, 'CustomResourceProvider', {
      onEventHandler: customResourceLambdaFunction,
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: RESOURCE_TYPE,
      serviceToken: customResourceProvider.serviceToken,
      properties: {
        region: cdk.Stack.of(this).region,
        parameterAccountID: props.accountId,
        parameterName: props.name,
        assumeRoleArn: roleArn,
        invokingAccountID: cdk.Stack.of(this).account,
      },
    });

    this.value = resource.ref;
  }
}
