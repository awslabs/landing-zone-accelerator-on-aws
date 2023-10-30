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
 * Initialized GetPermissionSetRoleArn properties
 */
export interface GetPermissionSetRoleArnProps {
  /**
   * Account id where the permission set has been provisioned
   */
  readonly accountId: string;
  /**
   * Custom resource provider (single provider shared by multiple resources)
   */
  readonly serviceToken: string;
  /**
   * The name of the permission set
   */
  readonly permissionSetName?: string;
  /**
   * Custom resource lambda log group encryption key
   */
  readonly kmsKey?: cdk.aws_kms.IKey;
  /**
   * Custom resource lambda log retention in days
   */
  readonly logRetentionInDays?: number;
}

/**
 * Class for IdentityCenterGetPermissionRoleArnProvider
 */
export class IdentityCenterGetPermissionRoleArnProvider extends Construct {
  readonly provider: cdk.custom_resources.Provider;
  readonly serviceToken: string;
  constructor(scope: Construct, id: string) {
    super(scope, id);
    const functionId = `${id}ProviderLambda`;
    const providerLambda = new cdk.aws_lambda.Function(this, functionId, {
      code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, 'get-permission-set-role-arn/dist')),
      runtime: cdk.aws_lambda.Runtime.NODEJS_16_X,
      timeout: cdk.Duration.seconds(60),
      initialPolicy: [
        new cdk.aws_iam.PolicyStatement({
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['iam:ListRoles'],
          resources: ['*'],
        }),
      ],
      handler: 'index.handler',
    });

    this.provider = new cdk.custom_resources.Provider(this, 'Resource', {
      onEventHandler: providerLambda,
    });

    this.serviceToken = this.provider.serviceToken;

    const stack = cdk.Stack.of(scope);
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
/**
 * Class for IdentityCenterGetPermissionRoleArn
 */
export class IdentityCenterGetPermissionRoleArn extends Construct {
  readonly resource: cdk.CustomResource;
  readonly roleArn: string;
  constructor(scope: Construct, id: string, props: GetPermissionSetRoleArnProps) {
    super(scope, id);
    this.resource = new cdk.CustomResource(this, `getPermissionSetRoleArn`, {
      serviceToken: props.serviceToken,
      properties: {
        permissionSetName: props.permissionSetName,
        uuid: uuidv4(),
      },
    });

    this.roleArn = this.resource.getAtt('roleArn').toString();
  }
}
