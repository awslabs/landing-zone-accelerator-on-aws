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
import { Organization } from '../aws-organizations/organization';

/**
 * Initialized AcceleratorKeyProps properties
 */
export interface AcceleratorKeyProps {
  /**
   * Is organization enabled
   * @default true
   */
  readonly isOrganizationEnabled?: boolean;
  /**
   * Key alias
   * @default alias/accelerator/kms/key
   */
  readonly alias?: string;
  /**
   * Key description
   * @default AWS Accelerator Kms Key
   */
  readonly description?: string;
  /**
   * Key rotation flag
   * @default true
   */
  readonly enableKeyRotation?: boolean;
  /**
   * List of services needs key access
   */
  readonly allowedServicePrincipals?: { name: string; principal: string }[];
  /**
   * Custom resource lambda log group encryption key
   */
  readonly kmsKey?: cdk.aws_kms.Key;
  /**
   * Custom resource lambda log retention in days
   */
  readonly logRetentionInDays: number;
}

/**
 * Aws AcceleratorKey class
 */
export class AcceleratorKey extends Construct {
  readonly key: cdk.aws_kms.Key;
  constructor(scope: Construct, id: string, props: AcceleratorKeyProps) {
    super(scope, id);

    this.key = new cdk.aws_kms.Key(this, 'AcceleratorKey', {
      alias: props.alias ?? 'alias/accelerator/kms/key',
      description: props.description ?? 'AWS Accelerator Kms Key',
      enableKeyRotation: props.enableKeyRotation ?? true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    if (props.isOrganizationEnabled ?? true) {
      const organizationId = new Organization(this, 'Organization').id;
      // Allow Accelerator Role to use the encryption key
      this.key.addToResourcePolicy(
        new cdk.aws_iam.PolicyStatement({
          sid: `Allow Accelerator Role to use the encryption key`,
          principals: [new cdk.aws_iam.AnyPrincipal()],
          actions: ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:DescribeKey'],
          resources: ['*'],
          conditions: {
            StringEquals: {
              'aws:PrincipalOrgID': organizationId,
            },
            ArnLike: {
              'aws:PrincipalARN': [`arn:${cdk.Stack.of(this).partition}:iam::*:role/AWSAccelerator-*`],
            },
          },
        }),
      );
    }
    // TODO Add sharing when organization not used

    // Allow Cloudwatch logs to use the encryption key
    this.key.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: `Allow Cloudwatch logs to use the encryption key`,
        principals: [new cdk.aws_iam.ServicePrincipal(`logs.${cdk.Stack.of(this).region}.amazonaws.com`)],
        actions: ['kms:Encrypt*', 'kms:Decrypt*', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:Describe*'],
        resources: ['*'],
        conditions: {
          ArnLike: {
            'kms:EncryptionContext:aws:logs:arn': `arn:aws:logs:${cdk.Stack.of(this).region}:*:log-group:*`,
          },
        },
      }),
    );

    if (props.allowedServicePrincipals) {
      props.allowedServicePrincipals!.forEach(item => {
        this.key.addToResourcePolicy(
          new cdk.aws_iam.PolicyStatement({
            sid: `Allow ${item.name} service to use the encryption key`,
            principals: [new cdk.aws_iam.ServicePrincipal(item.principal)],
            actions: ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:DescribeKey'],
            resources: ['*'],
          }),
        );
      });
    }
  }

  public getKey(): cdk.aws_kms.Key {
    return this.key;
  }
}
