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

export enum SsmParameterType {
  GET = 'GET',
  PUT = 'PUT',
}
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
    /**
     * Optional value to put when when using SsmParameterType.PUT
     */
    value?: string;
  };
  readonly invokingAccountID: string;

  /**
   * The type of SSM parameter operation
   */
  readonly type: SsmParameterType;
}

/**
 * SsmParameter class - to get ssm parameter value from other account
 */
export class SsmParameter extends Construct {
  public readonly parameterName: string;
  public readonly value: string = '';

  constructor(scope: Construct, id: string, props: SsmParameterProps) {
    super(scope, id);

    this.parameterName = props.parameter.name;
    const assumeRoleArn = `arn:${props.partition}:iam::${props.parameter.accountId}:role/${props.parameter.roleName}`;

    let RESOURCE_TYPE: string;
    let codeDir: string;
    let desc: string;
    let logicalId: string;
    const policyStatements: cdk.aws_iam.PolicyStatement[] = [];

    if (props.type === SsmParameterType.GET) {
      RESOURCE_TYPE = 'Custom::SsmGetParameterValue';
      codeDir = 'get-param-value/dist';
      desc = `Custom resource provider to get ssm parameter ${props.parameter.name} value`;
      logicalId = 'SsmGetParameterValueFunction';

      // Push policy statement
      policyStatements.push(
        new cdk.aws_iam.PolicyStatement({
          sid: 'SsmGetParameterActions',
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['ssm:GetParameters', 'ssm:GetParameter', 'ssm:DescribeParameters'],
          resources: ['*'],
        }),
      );
    } else if (props.type === SsmParameterType.PUT) {
      // Check if parameter value is included in props
      if (!props.parameter.value) {
        throw new Error('parameter.value property required when type is set to PUT');
      }

      RESOURCE_TYPE = 'Custom::SsmPutParameterValue';
      codeDir = 'put-param-value/dist';
      desc = `Custom resource provider to put ssm parameter ${props.parameter.name} value`;
      logicalId = 'SsmPutParameterValueFunction';

      // Push policy statement
      policyStatements.push(
        new cdk.aws_iam.PolicyStatement({
          sid: 'SsmPutParameterActions',
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['ssm:DeleteParameter', 'ssm:PutParameter'],
          resources: ['*'],
        }),
      );

      this.value = props.parameter.value;
    } else {
      throw new Error(`SSM parameter type ${props.type} is invalid`);
    }

    policyStatements.push(
      new cdk.aws_iam.PolicyStatement({
        sid: 'StsAssumeRoleActions',
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['sts:AssumeRole'],
        resources: [assumeRoleArn],
      }),
    );

    // Create custom resource
    const customResourceLambdaFunction = new cdk.aws_lambda.Function(this, logicalId, {
      code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, codeDir)),
      runtime: cdk.aws_lambda.Runtime.NODEJS_14_X,
      handler: 'index.handler',
      description: desc,
    });

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
        parameterValue: props.parameter.value,
        assumeRoleArn: assumeRoleArn,
        invokingAccountID: props.invokingAccountID,
      },
    });

    if (props.type === SsmParameterType.GET) {
      this.value = resource.ref;
    }
  }
}
