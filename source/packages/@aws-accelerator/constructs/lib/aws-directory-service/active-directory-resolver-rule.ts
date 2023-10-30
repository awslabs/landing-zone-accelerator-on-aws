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

import path = require('path');

/**
 * Initialized ActiveDirectoryResolverRuleProps properties
 */
export interface ActiveDirectoryResolverRuleProps {
  readonly route53ResolverRuleName: string;
  readonly targetIps: string[];
  readonly roleName: string;
  /**
   * Custom resource lambda key to encrypt environment variables
   */
  readonly lambdaKmsKey: cdk.aws_kms.IKey;
  /**
   * Custom resource lambda log group encryption key
   */
  readonly cloudWatchLogsKmsKey: cdk.aws_kms.IKey;
  /**
   * Custom resource lambda log retention in days
   */
  readonly cloudWatchLogRetentionInDays: number;
}

/**
 * Update resolver group rule with managed active directory dns ips
 */
export class ActiveDirectoryResolverRule extends Construct {
  public readonly id: string;

  constructor(scope: Construct, id: string, props: ActiveDirectoryResolverRuleProps) {
    super(scope, id);

    const providerLambda = new cdk.aws_lambda.Function(this, 'UpdateResolverRuleFunction', {
      code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, 'update-resolver-role/dist')),
      runtime: cdk.aws_lambda.Runtime.NODEJS_16_X,
      handler: 'index.handler',
      timeout: cdk.Duration.seconds(30),
      description: 'Update resolver group rule target ips',
      environmentEncryption: props.lambdaKmsKey,
    });

    providerLambda.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'Route53resolver',
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['route53resolver:UpdateResolverRule', 'route53resolver:ListResolverRules'],
        resources: ['*'],
      }),
    );

    providerLambda.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'StsAssumeRole',
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['sts:AssumeRole'],
        resources: [`arn:${cdk.Stack.of(this).partition}:iam::*:role/${props.roleName}`],
      }),
    );

    // Custom resource lambda log group
    new cdk.aws_logs.LogGroup(this, `${providerLambda.node.id}LogGroup`, {
      logGroupName: `/aws/lambda/${providerLambda.functionName}`,
      retention: props.cloudWatchLogRetentionInDays,
      encryptionKey: props.cloudWatchLogsKmsKey,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const provider = new cdk.custom_resources.Provider(this, 'UpdateResolverRuleProvider', {
      onEventHandler: providerLambda,
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: 'Custom::UpdateResolverRule',
      serviceToken: provider.serviceToken,
      properties: {
        executingAccountId: cdk.Stack.of(this).account,
        partition: cdk.Stack.of(this).partition,
        region: cdk.Stack.of(this).region,
        roleName: props.roleName,
        route53ResolverRuleName: props.route53ResolverRuleName,
        targetIps: props.targetIps,
        uuid: uuidv4(), // Generates a new UUID to force the resource to update
      },
    });

    this.id = resource.ref;
  }
}
