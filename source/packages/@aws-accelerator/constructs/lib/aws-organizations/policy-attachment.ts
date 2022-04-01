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
import { v4 as uuidv4 } from 'uuid';
import { PolicyType } from './policy';
import { Construct } from 'constructs';

const path = require('path');

/**
 * Initialized Policy properties
 */
export interface PolicyAttachmentProps {
  readonly policyId: string;
  readonly targetId?: string;
  readonly type: PolicyType;
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
 * Class to attach a Policy to an Organization Unit or Account
 */
export class PolicyAttachment extends Construct {
  public readonly id: string;
  public readonly policyId: string;
  public readonly targetId: string | undefined;
  public readonly type: PolicyType;

  static isLogGroupConfigured = false;

  constructor(scope: Construct, id: string, props: PolicyAttachmentProps) {
    super(scope, id);

    this.policyId = props.policyId;
    this.targetId = props.targetId;
    this.type = props.type;

    //
    // Function definition for the custom resource
    //
    const customResourceProvider = cdk.CustomResourceProvider.getOrCreateProvider(
      this,
      'Custom::OrganizationsAttachPolicy',
      {
        codeDirectory: path.join(__dirname, 'attach-policy/dist'),
        runtime: cdk.CustomResourceProviderRuntime.NODEJS_14_X,
        policyStatements: [
          {
            Effect: 'Allow',
            Action: ['organizations:AttachPolicy', 'organizations:DetachPolicy', 'organizations:ListPoliciesForTarget'],
            Resource: '*',
          },
        ],
      },
    );

    //
    // Custom Resource definition. We want this resource to be evaluated on
    // every CloudFormation update, so we generate a new uuid to force
    // re-evaluation.
    //
    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: 'Custom::AttachPolicy',
      serviceToken: customResourceProvider.serviceToken,
      properties: {
        partition: cdk.Aws.PARTITION,
        uuid: uuidv4(),
        policyId: props.policyId,
        targetId: props.targetId,
        type: props.type,
      },
    });

    /**
     * Pre-Creating log group to enable encryption and log retention.
     * Below construct needs to be static
     * isLogGroupConfigured flag used to make sure log group construct synthesize only once in the stack
     */
    if (!PolicyAttachment.isLogGroupConfigured) {
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
      PolicyAttachment.isLogGroupConfigured = true;
    }

    this.id = resource.ref;
  }
}
