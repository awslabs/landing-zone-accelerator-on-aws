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
 * Initialized GuardDutyPublishingDestinationProps properties
 */
export interface GuardDutyPublishingDestinationProps {
  /**
   * Export destination type
   */
  readonly exportDestinationType: string;
  /**
   * Publishing destination bucket arn
   */
  readonly bucketArn: string;
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
 * Class - GuardDutyPublishingDestination
 */
export class GuardDutyPublishingDestination extends Construct {
  public readonly id: string = '';

  static isLogGroupConfigured = false;

  constructor(scope: Construct, id: string, props: GuardDutyPublishingDestinationProps) {
    super(scope, id);

    const RESOURCE_TYPE = 'Custom::GuardDutyCreatePublishingDestinationCommand';

    const customResourceProvider = cdk.CustomResourceProvider.getOrCreateProvider(this, RESOURCE_TYPE, {
      codeDirectory: path.join(__dirname, 'create-publishing-destination/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_14_X,
      policyStatements: [
        {
          Sid: 'GuardDutyCreatePublishingDestinationCommandTaskGuardDutyActions',
          Effect: 'Allow',
          Action: [
            'guardDuty:CreateDetector',
            'guardDuty:CreatePublishingDestination',
            'guardDuty:DeletePublishingDestination',
            'guardDuty:ListDetectors',
            'guardDuty:ListPublishingDestinations',
            'iam:CreateServiceLinkedRole',
          ],
          Resource: '*',
        },
      ],
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: RESOURCE_TYPE,
      serviceToken: customResourceProvider.serviceToken,
      properties: {
        region: cdk.Stack.of(this).region,
        exportDestinationType: props.exportDestinationType,
        bucketArn: props.bucketArn,
        kmsKeyArn: props.kmsKey.keyArn,
      },
    });

    /**
     * Pre-Creating log group to enable encryption and log retention.
     * Below construct needs to be static
     * isLogGroupConfigured flag used to make sure log group construct synthesize only once in the stack
     */
    if (!GuardDutyPublishingDestination.isLogGroupConfigured) {
      const logGroup = new cdk.aws_logs.LogGroup(this, 'LogGroup', {
        logGroupName: `/aws/lambda/${
          (customResourceProvider.node.findChild('Handler') as cdk.aws_lambda.CfnFunction).ref
        }`,
        retention: props.logRetentionInDays,
        encryptionKey: props.kmsKey,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });

      resource.node.addDependency(logGroup);

      // Enable the flag to indicate log group configured
      GuardDutyPublishingDestination.isLogGroupConfigured = true;
    }

    this.id = resource.ref;
  }
}
