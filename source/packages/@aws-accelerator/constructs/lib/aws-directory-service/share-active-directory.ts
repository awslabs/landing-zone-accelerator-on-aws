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
 * Initialized ShareActiveDirectoryProps properties
 */
export interface ShareActiveDirectoryProps {
  /**
   * Managed active directory id
   */
  readonly directoryId: string;
  /**
   * Managed active directory share account ids
   */
  readonly sharedTargetAccountIds: string[];
  /**
   * Accepter account access role name. Custom resource will assume this role to approve share request
   */
  readonly accountAccessRoleName: string;
  /**
   * Custom resource lambda key
   */
  readonly lambdaKey: cdk.aws_kms.IKey;
  /**
   * Custom resource CloudWatch log group encryption key
   */
  readonly cloudwatchKey: cdk.aws_kms.IKey;
  /**
   * Custom resource CloudWatch log retention in days
   */
  readonly cloudwatchLogRetentionInDays: number;
}

/**
 * Managed active directory share class.
 */
export class ShareActiveDirectory extends Construct {
  public readonly id: string;
  constructor(scope: Construct, id: string, props: ShareActiveDirectoryProps) {
    super(scope, id);

    const providerLambda = new cdk.aws_lambda.Function(this, 'ShareManageActiveDirectoryFunction', {
      code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, 'share-directory/dist')),
      runtime: cdk.aws_lambda.Runtime.NODEJS_16_X,
      handler: 'index.handler',
      timeout: cdk.Duration.minutes(15),
      description: 'Share Manage active directory handler',
      environmentEncryption: props.lambdaKey,
    });

    providerLambda.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'DirectoryServices',
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['ds:ShareDirectory', 'ds:UnshareDirectory', 'ds:DescribeSharedDirectories'],
        resources: ['*'],
      }),
    );

    providerLambda.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'StsAssumeRoleActions',
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['sts:AssumeRole'],
        resources: [`arn:${cdk.Stack.of(this).partition}:iam::*:role/${props.accountAccessRoleName}`],
      }),
    );

    // Custom resource lambda log group
    new cdk.aws_logs.LogGroup(this, `${providerLambda.node.id}LogGroup`, {
      logGroupName: `/aws/lambda/${providerLambda.functionName}`,
      retention: props.cloudwatchLogRetentionInDays,
      encryptionKey: props.cloudwatchKey,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const provider = new cdk.custom_resources.Provider(this, 'ShareManageActiveDirectoryProvider', {
      onEventHandler: providerLambda,
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: 'Custom::ShareActiveDirectory',
      serviceToken: provider.serviceToken,
      properties: {
        partition: cdk.Stack.of(this).partition,
        region: cdk.Stack.of(this).region,
        madAccountId: cdk.Stack.of(this).account,
        directoryId: props.directoryId,
        shareTargetAccountIds: props.sharedTargetAccountIds,
        assumeRoleName: props.accountAccessRoleName,
        uuid: uuidv4(), // Generates a new UUID to force the resource to update
      },
    });

    this.id = resource.ref;
  }
}
