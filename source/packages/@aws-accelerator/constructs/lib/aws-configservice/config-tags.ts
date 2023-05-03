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
import { Tag } from '@aws-sdk/client-config-service';

const path = require('path');

export interface ConfigServiceTagsProps {
  readonly partition: string;
  readonly accountId: string;
  readonly resourceArn: string;
  readonly tags: Tag[];
  /**
   * Custom resource lambda log group encryption key
   */
  readonly kmsKey: cdk.aws_kms.IKey;
  /**
   * Custom resource lambda log retention in days
   */
  readonly logRetentionInDays: number;
}

/**
 * Class to tag/untag configservice resources
 */
export class ConfigServiceTags extends Construct {
  readonly id: string;

  constructor(scope: Construct, id: string, props: ConfigServiceTagsProps) {
    super(scope, id);

    const CONFIGSERVICE_TAGS = 'Custom::ConfigServiceTags';

    //
    // Function definition for the custom resource
    //
    const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, CONFIGSERVICE_TAGS, {
      codeDirectory: path.join(__dirname, 'update-tags/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_16_X,
      policyStatements: [
        {
          Effect: 'Allow',
          Action: ['config:TagResource', 'config:UntagResource'],
          Resource: `arn:${props.partition}:config:*:${props.accountId}:config-rule/*`,
        },
      ],
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: CONFIGSERVICE_TAGS,
      serviceToken: provider.serviceToken,
      properties: {
        resourceArn: props.resourceArn,
        tags: props.tags,
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
