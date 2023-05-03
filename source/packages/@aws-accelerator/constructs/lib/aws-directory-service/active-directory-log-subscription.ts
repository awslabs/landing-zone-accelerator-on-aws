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

/**
 * Initialized ActiveDirectoryLogSubscriptionProps properties
 */
export interface ActiveDirectoryLogSubscriptionProps {
  /**
   * Managed active directory
   */
  readonly activeDirectory: cdk.aws_directoryservice.CfnMicrosoftAD;
  /**
   * Managed active directory log group name, this log group will be created for directory service log subscription
   */
  readonly activeDirectoryLogGroupName: string;
  /**
   * Managed active directory log retention days
   */
  readonly activeDirectoryLogRetentionInDays: number;
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
  readonly logRetentionInDays: number;
}

/**
  /**
  * Managed active directory log subscription class
  */
export class ActiveDirectoryLogSubscription extends Construct {
  public readonly id: string;

  constructor(scope: Construct, id: string, props: ActiveDirectoryLogSubscriptionProps) {
    super(scope, id);

    const RESOURCE_TYPE = 'Custom::ActiveDirectoryLogSubscription';

    // Create directory service log group
    const directoryServiceLogGroup = new cdk.aws_logs.LogGroup(this, `${props.activeDirectory.name}LogGroup`, {
      logGroupName: props.activeDirectoryLogGroupName,
      retention: props.activeDirectoryLogRetentionInDays,
      encryptionKey: props.cloudWatchLogsKmsKey,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Allow directory services to write to the log group
    directoryServiceLogGroup.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
        principals: [new cdk.aws_iam.ServicePrincipal('ds.amazonaws.com')],
        resources: [directoryServiceLogGroup.logGroupArn],
      }),
    );

    const providerLambda = new cdk.aws_lambda.Function(this, 'ManageActiveDirectoryLogSubscriptionFunction', {
      code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, 'create-log-subscription/dist')),
      runtime: cdk.aws_lambda.Runtime.NODEJS_16_X,
      handler: 'index.handler',
      timeout: cdk.Duration.seconds(30),
      description: 'Manage active directory log subscription handler',
      environmentEncryption: props.lambdaKmsKey,
    });

    providerLambda.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'LogSubscription',
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['ds:ListLogSubscriptions', 'ds:CreateLogSubscription', 'ds:DeleteLogSubscription'],
        resources: ['*'],
      }),
    );

    // Custom resource lambda log group
    new cdk.aws_logs.LogGroup(this, `${providerLambda.node.id}LogGroup`, {
      logGroupName: `/aws/lambda/${providerLambda.functionName}`,
      retention: props.logRetentionInDays,
      encryptionKey: props.cloudWatchLogsKmsKey,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const provider = new cdk.custom_resources.Provider(this, 'ManageActiveDirectoryLogSubscriptionProvider', {
      onEventHandler: providerLambda,
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: RESOURCE_TYPE,
      serviceToken: provider.serviceToken,
      properties: {
        directoryId: props.activeDirectory.ref,
        logGroupName: directoryServiceLogGroup.logGroupName,
      },
    });

    this.id = resource.ref;
  }
}
