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
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';

/**
 * Class for IdentityCenterOrganizationAdminAccount
 */
export class IdentityCenterGetInstanceId extends Construct {
  readonly provider: cdk.custom_resources.Provider;
  readonly resource: cdk.CustomResource;
  readonly instanceId: string;
  constructor(scope: Construct, id: string) {
    super(scope, id);
    const functionId = `${id}ProviderLambda`;
    const providerLambda = new cdk.aws_lambda.Function(this, functionId, {
      code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, 'get-identity-center-instance-id/dist')),
      runtime: cdk.aws_lambda.Runtime.NODEJS_16_X,
      timeout: cdk.Duration.seconds(160),
      initialPolicy: [
        new cdk.aws_iam.PolicyStatement({
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['sso:ListInstances', 'organizations:ListDelegatedAdministrators'],
          resources: ['*'],
        }),
      ],
      handler: 'index.handler',
    });

    this.provider = new cdk.custom_resources.Provider(this, 'Resource', {
      onEventHandler: providerLambda,
    });

    this.resource = new cdk.CustomResource(this, `getIdentityCenter`, {
      serviceToken: this.provider.serviceToken,
      properties: {
        partition: cdk.Stack.of(scope).partition,
        uuid: uuidv4(),
      },
    });

    const stack = cdk.Stack.of(scope);
    this.instanceId = this.resource.getAtt('identityCenterInstanceId').toString();

    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
    NagSuppressions.addResourceSuppressionsByPath(
      stack,
      `${stack.stackName}/${id}/${functionId}/ServiceRole/Resource`,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'AWS Custom resource provider framework-role created by cdk.',
        },
      ],
    );

    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions
    NagSuppressions.addResourceSuppressionsByPath(
      stack,
      `${stack.stackName}/${id}/${functionId}/ServiceRole/DefaultPolicy/Resource`,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Allows only specific policy.',
        },
      ],
    );

    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
    NagSuppressions.addResourceSuppressionsByPath(
      stack,
      `${stack.stackName}/${id}/Resource/framework-onEvent/ServiceRole/Resource`,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'AWS Custom resource provider framework-role created by cdk.',
        },
      ],
    );

    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions
    NagSuppressions.addResourceSuppressionsByPath(
      stack,
      `${stack.stackName}/${id}/Resource/framework-onEvent/ServiceRole/DefaultPolicy/Resource`,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Allows only specific policy.',
        },
      ],
    );
  }
}
