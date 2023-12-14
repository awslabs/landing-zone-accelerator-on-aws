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
import path from 'path';
import { LzaCustomResource } from '../lza-custom-resource';

interface FirewallConfigReplacementProps {
  /**
   * Custom resource CloudWatch Log encryption key, when undefined default AWS managed key will be used
   */
  readonly cloudWatchLogKey?: cdk.aws_kms.IKey;
  /**
   * Custom resource CloudWatch Log retention
   */
  readonly cloudWatchLogRetentionInDays: number;
  /**
   * Custom resource environment encryption key, when undefined default AWS managed key will be used
   */
  readonly environmentEncryptionKey?: cdk.aws_kms.IKey;
  /**
   * Custom resource properties
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly properties: { [key: string]: any }[];
  /**
   * Custom resource role
   */
  readonly role: cdk.aws_iam.IRole;
}

export class FirewallConfigReplacements extends cdk.Resource {
  constructor(scope: Construct, id: string, props: FirewallConfigReplacementProps) {
    super(scope, id);

    new LzaCustomResource(this, 'Resource', {
      resource: {
        name: 'Resource',
        parentId: id,
        properties: props.properties,
      },
      lambda: {
        assetPath: path.join(__dirname, 'firewall-config-replacements/dist'),
        description: 'Firewall configuration replacement custom resource',
        environmentEncryptionKmsKey: props.environmentEncryptionKey,
        cloudWatchLogKmsKey: props.cloudWatchLogKey,
        cloudWatchLogRetentionInDays: props.cloudWatchLogRetentionInDays,
        role: props.role,
        timeOut: cdk.Duration.seconds(120),
      },
    });
  }
}
