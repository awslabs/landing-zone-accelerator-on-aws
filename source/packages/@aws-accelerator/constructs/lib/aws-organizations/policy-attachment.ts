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

import * as cdk from 'aws-cdk-lib';
import { PolicyType } from './policy';
import { Construct } from 'constructs';
import { createHash } from 'crypto';

const path = require('path');

/**
 * Initialized Policy properties
 */
export interface PolicyAttachmentProps {
  readonly policyId: string;
  readonly targetId?: string;
  readonly type: PolicyType;
  readonly strategy?: string;
  readonly configPolicyNames: string[];
  readonly acceleratorPrefix: string;
  /**
   * Custom resource lambda log group encryption key, when undefined default AWS managed key will be used
   */
  readonly kmsKey?: cdk.aws_kms.IKey;
  /**
   * Custom resource lambda log retention in days
   */
  readonly logRetentionInDays: number;
  /**
   * Home region for the solution
   */
  readonly homeRegion: string;
}

/**
 * Class to attach a Policy to an Organization Unit or Account
 */
export class PolicyAttachment extends Construct {
  public readonly id: string;
  public readonly policyId: string;
  public readonly targetId: string | undefined;
  public readonly type: PolicyType;
  public readonly strategy?: string;

  constructor(scope: Construct, id: string, props: PolicyAttachmentProps) {
    super(scope, id);

    this.policyId = props.policyId;
    this.targetId = props.targetId;
    this.type = props.type;
    this.strategy = props.strategy;

    //
    // Function definition for the custom resource
    //
    const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, 'Custom::OrganizationsAttachPolicy', {
      codeDirectory: path.join(__dirname, 'attach-policy/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_16_X,
      policyStatements: [
        {
          Effect: 'Allow',
          Action: [
            'organizations:AttachPolicy',
            'organizations:DetachPolicy',
            'organizations:ListPoliciesForTarget',
            'organizations:ListTagsForResource',
          ],
          Resource: '*',
        },
      ],
    });

    const attachArray = [props.policyId, props.targetId ?? '', ...props.configPolicyNames].toString();
    const attachHash = createHash('md5').update(attachArray).digest('hex');

    //
    // Custom Resource definition. We want this resource to be evaluated on
    // every CloudFormation update, so we generate a new uuid to force
    // re-evaluation.
    //
    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: 'Custom::AttachPolicy',
      serviceToken: provider.serviceToken,
      properties: {
        partition: cdk.Aws.PARTITION,
        uuid: attachHash,
        policyId: props.policyId,
        targetId: props.targetId,
        type: props.type,
        strategy: props.strategy,
        configPolicyNames: props.configPolicyNames,
        policyTagKey: `${props.acceleratorPrefix}Managed`,
        homeRegion: props.homeRegion,
        region: cdk.Stack.of(this).region,
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
