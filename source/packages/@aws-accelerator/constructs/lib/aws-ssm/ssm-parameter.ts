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
 * SsmParameterProps
 */
export interface SsmParameterProps {
  readonly region: string;
  readonly partition: string;
  /**
   * SSM Parameter
   */
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
  };
  readonly invokingAccountID: string;
}

/**
 * SsmParameter class - to get ssm parameter value from other account
 */
export class SsmParameter extends Construct {
  public readonly value: string = '';

  constructor(scope: Construct, id: string, props: SsmParameterProps) {
    super(scope, id);

    const RESOURCE_TYPE = 'Custom::SsmGetParameterValue';

    const assumeRoleArn = `arn:${props.partition}:iam::${props.parameter.accountId}:role/${props.parameter.roleName}`;

    const customResourceLambdaFunction = new cdk.aws_lambda.Function(this, 'SsmGetParameterValueFunction', {
      code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, 'get-param-value/dist')),
      runtime: cdk.aws_lambda.Runtime.NODEJS_14_X,
      handler: 'index.handler',
      description: `Custom resource provider to get ssm parameter ${props.parameter.name} value`,
    });

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
        resources: [assumeRoleArn],
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
        region: props.region,
        parameterAccountID: props.parameter.accountId,
        parameterName: props.parameter.name,
        assumeRoleArn: assumeRoleArn,
        invokingAccountID: props.invokingAccountID,
      },
    });

    this.value = resource.ref;
  }
}
