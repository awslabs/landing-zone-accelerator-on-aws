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

/**
 * Initialized EbsVolumeEncryptionProps properties
 */
export interface EbsVolumeEncryptionProps {
  /**
   * Ebs encryption key
   */
  readonly ebsEncryptionKmsKey: cdk.aws_kms.IKey;
  /**
   * Custom resource lambda log group encryption key
   */
  readonly logGroupKmsKey: cdk.aws_kms.Key;
  /**
   * Custom resource lambda log retention in days
   */
  readonly logRetentionInDays: number;
}

/**
 * Class to Enable Default EBS Volume Encryption
 */
export class EbsDefaultEncryption extends Construct {
  public readonly id: string;

  constructor(scope: Construct, id: string, props: EbsVolumeEncryptionProps) {
    super(scope, id);

    const EBS_ENCRYPTION_TYPE = 'Custom::EbsDefaultVolumeEncryption';

    const iamPolicy = [
      {
        Sid: 'EC2',
        Effect: 'Allow',
        Action: [
          'ec2:DisableEbsEncryptionByDefault',
          'ec2:EnableEbsEncryptionByDefault',
          'ec2:ModifyEbsDefaultKmsKeyId',
          'ec2:ResetEbsDefaultKmsKeyId',
        ],
        Resource: '*',
      },
      {
        Sid: 'KMS',
        Effect: 'Allow',
        Action: ['kms:DescribeKey'],
        Resource: props.ebsEncryptionKmsKey.keyArn,
      },
    ];

    const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, EBS_ENCRYPTION_TYPE, {
      codeDirectory: path.join(__dirname, 'ebs-default-encryption/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_16_X,
      policyStatements: iamPolicy,
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: EBS_ENCRYPTION_TYPE,
      serviceToken: provider.serviceToken,
      properties: {
        kmsKeyId: props.ebsEncryptionKmsKey?.keyId,
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
        encryptionKey: props.logGroupKmsKey,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });
    resource.node.addDependency(logGroup);

    this.id = resource.ref;
  }
}
