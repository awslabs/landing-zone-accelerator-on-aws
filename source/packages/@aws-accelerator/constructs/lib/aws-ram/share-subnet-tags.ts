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

const path = require('path');

export interface ShareSubnetTagsProps {
  readonly vpcTags?: cdk.CfnTag[];
  readonly subnetTags: cdk.CfnTag[];
  readonly sharedSubnetId: string;
  readonly owningAccountId: string;
  /**
   * Friendly name for the shared vpc
   */
  readonly vpcName: string;
  /**
   * Friendly name for the shared subnet
   */
  readonly subnetName: string;
  /**
   * Custom resource lambda log group encryption key
   */
  readonly resourceLoggingKmsKey: cdk.aws_kms.IKey;
  /**
   * Custom resource lambda log retention in days
   */
  readonly logRetentionInDays: number;
  /**
   * Accelerator SSM parameter Prefix
   */
  readonly acceleratorSsmParamPrefix: string;
}

/**
 * Class to initialize Policy
 */
export class ShareSubnetTags extends Construct {
  readonly id: string;

  constructor(scope: Construct, id: string, props: ShareSubnetTagsProps) {
    super(scope, id);

    const SHARE_SUBNET_TAGS_TYPE = 'Custom::ShareSubnetTags';

    //
    // Function definition for the custom resource
    //
    const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, SHARE_SUBNET_TAGS_TYPE, {
      codeDirectory: path.join(__dirname, 'share-subnet-tags/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_16_X,
      policyStatements: [
        {
          Effect: 'Allow',
          Action: ['ec2:DeleteTags', 'ec2:CreateTags'],
          Resource: [
            `arn:${cdk.Aws.PARTITION}:ec2:${cdk.Aws.REGION}:*:subnet/*`,
            `arn:${cdk.Aws.PARTITION}:ec2:${cdk.Aws.REGION}:*:vpc/*`,
          ],
        },
        {
          Effect: 'Allow',
          Action: ['ec2:DescribeTags', 'ec2:DescribeVpcs', 'ec2:DescribeSubnets'],
          Resource: '*',
        },
        {
          Effect: 'Allow',
          Action: ['ssm:GetParameter', 'ssm:PutParameter', 'ssm:DeleteParameter'],
          Resource: '*',
        },
      ],
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      properties: {
        vpcTags: props.vpcTags,
        subnetTags: props.subnetTags,
        sharedSubnetId: props.sharedSubnetId,
        sharedSubnetName: props.subnetName,
        vpcName: props.vpcName,
        acceleratorSsmParamPrefix: props.acceleratorSsmParamPrefix,
      },
      resourceType: SHARE_SUBNET_TAGS_TYPE,
      serviceToken: provider.serviceToken,
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
        encryptionKey: props.resourceLoggingKmsKey,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });
    resource.node.addDependency(logGroup);

    this.id = resource.ref;
  }
}
