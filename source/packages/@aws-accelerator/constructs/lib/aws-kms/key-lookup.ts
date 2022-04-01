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
import { SsmParameterLookup } from '../aws-ssm/ssm-parameter-lookup';

/**
 * Initialized KeyLookupProps properties
 */
export interface KeyLookupProps {
  /**
   * SSM parameter name where key arn is stored
   * @default /accelerator/kms/key-arn
   */
  readonly keyArnParameterName?: string;
  /**
   * Key account id
   */
  readonly accountId: string;
  /**
   * Custom resource lambda log group encryption key
   */
  readonly kmsKey?: cdk.aws_kms.Key;
  /**
   * Custom resource lambda log retention in days
   */
  readonly logRetentionInDays?: number;
}

/**
 * Aws Key class
 */
export class KeyLookup extends Construct {
  public readonly key: cdk.aws_kms.Key;

  constructor(scope: Construct, id: string, props: KeyLookupProps) {
    super(scope, id);

    let keyArn: string | undefined;
    if (cdk.Stack.of(this).account === props.accountId) {
      keyArn = cdk.aws_ssm.StringParameter.valueForStringParameter(
        this,
        props.keyArnParameterName ?? '/accelerator/kms/key-arn',
      );
    } else {
      keyArn = new SsmParameterLookup(this, 'AcceleratorKmsKeyArn', {
        name: props.keyArnParameterName ?? '/accelerator/kms/key-arn',
        accountId: props.accountId,
        kmsKey: props.kmsKey,
        logRetentionInDays: props.logRetentionInDays,
      }).value;
    }

    // Accelerator Key
    this.key = cdk.aws_kms.Key.fromKeyArn(this, 'AcceleratorKey', keyArn!) as cdk.aws_kms.Key;
  }

  public getKey(): cdk.aws_kms.Key {
    return this.key;
  }
}
