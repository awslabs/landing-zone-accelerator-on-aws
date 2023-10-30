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
import { NlbTargetTypeConfig } from '@aws-accelerator/config';

const path = require('path');

export interface INLBAddresses extends cdk.IResource {
  /**
   * The IP addresses of the endpoint.
   */
  readonly ipAddresses: cdk.Reference;
}

export interface NLBAddressesProps {
  /**
   * The ip and NLB targets
   */
  readonly targets: (NlbTargetTypeConfig | string)[];
  /**
   * The role to assume to retrieve the ip addresses
   */
  readonly assumeRoleName: string;
  /**
   * The partition
   */
  readonly partition: string;
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
 * Class for FMSOrganizationAdminAccount
 */
export class NLBAddresses extends cdk.Resource implements INLBAddresses {
  public readonly ipAddresses: cdk.Reference;
  constructor(scope: Construct, id: string, props: NLBAddressesProps) {
    super(scope, id);
    const functionId = `${id}ProviderLambda`;
    const providerId = `${id}Provider`;

    const providerLambda = new cdk.aws_lambda.Function(this, functionId, {
      code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, 'nlb-ip-lookup/dist')),
      runtime: cdk.aws_lambda.Runtime.NODEJS_16_X,
      timeout: cdk.Duration.seconds(15),
      handler: 'index.handler',
    });

    providerLambda.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'StsAssumeRole',
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['sts:AssumeRole'],
        resources: [`arn:${cdk.Stack.of(this).partition}:iam::*:role/${props.assumeRoleName}`],
      }),
    );

    const provider = new cdk.custom_resources.Provider(this, providerId, {
      onEventHandler: providerLambda,
    });

    new cdk.aws_logs.LogGroup(this, `${providerLambda.node.id}LogGroup`, {
      logGroupName: `/aws/lambda/${providerLambda.functionName}`,
      retention: props.logRetentionInDays,
      encryptionKey: props.kmsKey,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const resource = new cdk.CustomResource(this, `Resource`, {
      serviceToken: provider.serviceToken,
      properties: {
        region: cdk.Stack.of(this).region,
        targets: props.targets,
        assumeRoleName: props.assumeRoleName,
        partition: cdk.Stack.of(scope).partition,
      },
    });

    this.ipAddresses = resource.getAtt('ipAddresses');

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
      `${stack.stackName}/${id}/${providerId}/framework-onEvent/ServiceRole/Resource`,
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
      `${stack.stackName}/${id}/${providerId}/framework-onEvent/ServiceRole/DefaultPolicy/Resource`,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Allows only specific policy.',
        },
      ],
    );
  }
}
