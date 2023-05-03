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
import { v4 as uuidv4 } from 'uuid';
import { Construct } from 'constructs';
import path = require('path');

export interface DetachQuarantineScpProps {
  readonly scpPolicyId: string;
  readonly partition: string;
  readonly managementAccountId: string;
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
 * Class Detach Quarantine SCP
 */
export class DetachQuarantineScp extends Construct {
  public readonly id: string;

  constructor(scope: Construct, id: string, props: DetachQuarantineScpProps) {
    super(scope, id);

    const DETACH_QUARANTINE_SCP_RESOURCE_TYPE = 'Custom::DetachQuarantineScp';

    //
    // Function definition for the custom resource
    //
    const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, DETACH_QUARANTINE_SCP_RESOURCE_TYPE, {
      codeDirectory: path.join(__dirname, 'lambdas/detach-quarantine-scp/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_16_X,
      timeout: cdk.Duration.minutes(15),
      policyStatements: [
        {
          Sid: 'organizations',
          Effect: 'Allow',
          Action: ['organizations:ListAccounts'],
          Resource: '*',
        },
        {
          Sid: 'detach',
          Effect: 'Allow',
          Action: ['organizations:DetachPolicy'],
          Resource: [
            `arn:${props.partition}:organizations::${props.managementAccountId}:policy/o-*/service_control_policy/${props.scpPolicyId}`,
            `arn:${props.partition}:organizations::${props.managementAccountId}:account/o-*/*`,
          ],
        },
      ],
    });

    //
    // Custom Resource definition. We want this resource to be evaluated on
    // every CloudFormation update, so we generate a new uuid to force
    // re-evaluation.
    //
    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: DETACH_QUARANTINE_SCP_RESOURCE_TYPE,
      serviceToken: provider.serviceToken,
      properties: {
        scpPolicyId: props.scpPolicyId,
        uuid: uuidv4(), // Generates a new UUID to force the resource to update
      },
    });

    /**
     * Singleton pattern to define the log group for the singleton function
     * in the stack
     */
    const stack = cdk.Stack.of(scope);
    const logGroup =
      (stack.node.tryFindChild(`${provider.node.id}LogGroup`) as cdk.aws_logs.LogGroup) ??
      new cdk.aws_logs.LogGroup(stack, `${provider.node.id}LogGroup`, {
        logGroupName: `/aws/lambda/${(provider.node.findChild('Handler') as cdk.aws_lambda.CfnFunction).ref}`,
        retention: props.logRetentionInDays,
        encryptionKey: props.kmsKey,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });
    resource.node.addDependency(logGroup);

    this.id = resource.ref;
  }
}
