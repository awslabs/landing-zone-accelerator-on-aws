/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import { DEFAULT_LAMBDA_RUNTIME } from '@aws-accelerator/utils/lib/lambda';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import path = require('path');

/**
 * Opt-in Regions Props
 */
export interface OptInRegionsProps {
  /**
   * Custom resource lambda log group encryption key, when undefined default AWS managed key will be used
   */
  readonly kmsKey?: cdk.aws_kms.IKey;
  /**
   * Custom resource lambda log retention in days
   */
  readonly logRetentionInDays: number;
  /**
   * Custom resource lambda management account id
   */
  readonly managementAccountId: string;
  /**
   * Custom resource lambda log account ids
   */
  readonly accountIds: string[];
  /**
   * Custom resource lambda home region
   */
  readonly homeRegion: string;
  /**
   * Custom resource lambda enabled regions
   */
  readonly enabledRegions: string[];
  /**
   * Custom resource lambda global region
   */
  readonly globalRegion: string;
}

/**
 * Class Opt-in Regions
 */
export class OptInRegions extends Construct {
  readonly onEvent: cdk.aws_lambda.IFunction;
  readonly isComplete: cdk.aws_lambda.IFunction;
  readonly provider: cdk.custom_resources.Provider;
  readonly id: string;

  constructor(scope: Construct, id: string, props: OptInRegionsProps) {
    super(scope, id);

    const OPT_IN_REGIONS = 'Custom::OptInRegions';

    const AccountOperationsPolicy = new cdk.aws_iam.PolicyStatement({
      sid: 'AccountOperations',
      effect: cdk.aws_iam.Effect.ALLOW,
      actions: ['account:ListRegions', 'account:EnableRegion', 'account:GetRegionOptStatus'],
      resources: ['*'],
    });

    const serviceAccessAndTokenPolicy = new cdk.aws_iam.PolicyStatement({
      sid: 'serviceAccessAndToken',
      effect: cdk.aws_iam.Effect.ALLOW,
      actions: [
        'organizations:EnableAWSServiceAccess',
        'iam:GetAccountSummary',
        'iam:SetSecurityTokenServicePreferences',
      ],
      resources: ['*'],
    });

    this.onEvent = new cdk.aws_lambda.Function(this, 'OptInRegionsOnEvent', {
      code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, 'enable-opt-in-regions/dist')),
      runtime: DEFAULT_LAMBDA_RUNTIME,
      handler: 'index.handler',
      timeout: cdk.Duration.minutes(1),
      description: 'Opt-in Regions onEvent handler',
      environmentEncryption: props.kmsKey,
      initialPolicy: [serviceAccessAndTokenPolicy],
    });

    const onEventLogGroup = new cdk.aws_logs.LogGroup(this, `${this.onEvent.node.id}LogGroup`, {
      logGroupName: `/aws/lambda/${this.onEvent.functionName}`,
      retention: props.logRetentionInDays,
      encryptionKey: props.kmsKey,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.isComplete = new cdk.aws_lambda.Function(this, 'OptInRegionsIsComplete', {
      code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, 'enable-opt-in-regions-status/dist')),
      runtime: DEFAULT_LAMBDA_RUNTIME,
      handler: 'index.handler',
      timeout: cdk.Duration.minutes(5),
      description: 'Opt-in Regions isComplete handler',
      environmentEncryption: props.kmsKey,
      initialPolicy: [AccountOperationsPolicy],
    });

    const isCompleteLogGroup = new cdk.aws_logs.LogGroup(this, `${this.isComplete.node.id}LogGroup`, {
      logGroupName: `/aws/lambda/${this.isComplete.functionName}`,
      retention: props.logRetentionInDays,
      encryptionKey: props.kmsKey,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.provider = new cdk.custom_resources.Provider(this, 'OptInRegionsProvider', {
      onEventHandler: this.onEvent,
      isCompleteHandler: this.isComplete,
      queryInterval: cdk.Duration.seconds(120),
      totalTimeout: cdk.Duration.minutes(30),
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: OPT_IN_REGIONS,
      serviceToken: this.provider.serviceToken,
      properties: {
        props: {
          managementAccountId: props.managementAccountId,
          accountIds: props.accountIds,
          homeRegion: props.homeRegion,
          enabledRegions: props.enabledRegions,
          globalRegion: props.globalRegion,
        },
      },
    });

    // Ensure that the LogGroup is created by Cloudformation prior to Lambda execution
    resource.node.addDependency(isCompleteLogGroup);
    resource.node.addDependency(onEventLogGroup);
    this.id = resource.ref;
  }
}
