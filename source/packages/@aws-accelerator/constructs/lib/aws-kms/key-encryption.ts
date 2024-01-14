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
import { Construct } from 'constructs';
import * as path from 'path';
import * as fs from 'fs';
import { LzaCustomResource } from '../lza-custom-resource';
/**
 * Initialized KmsEncryptionProps properties
 */
export interface KmsEncryptionProps {
  /**
   * Sets the key policy on the specified KMS key arn
   */
  readonly kmsArn: string;
  /**
   * JSON document policy file paths.
   */
  readonly policyFilePaths: string[];
  /**
   * Organization Id
   */
  readonly organizationId?: string;
  /**
   * Custom resource lambda environment encryption key, when undefined default AWS managed key will be used
   */
  readonly customResourceLambdaEnvironmentEncryptionKmsKey?: cdk.aws_kms.IKey;
  /**
   * Custom resource lambda log group encryption key, when undefined default AWS managed key will be used
   */
  readonly customResourceLambdaCloudWatchLogKmsKey?: cdk.aws_kms.IKey;
  /**
   * Custom resource lambda log retention in days
   */
  readonly customResourceLambdaLogRetentionInDays: number;
}

/**
 * Class for KmsEncryption
 */
export class KmsEncryption extends Construct {
  private assetPath: string;
  constructor(scope: Construct, id: string, props: KmsEncryptionProps) {
    super(scope, id);

    const resourceName = 'KmsEncryption';
    this.assetPath = path.join(__dirname, 'put-key-policy/dist');
    const policyFolderName = 'kms-policy';
    fs.mkdirSync(path.join(this.assetPath, policyFolderName), { recursive: true });

    const policyFilePaths: string[] = [];

    for (const policyFilePath of props.policyFilePaths ?? []) {
      const policyFileName = path.parse(policyFilePath).base;
      fs.copyFileSync(policyFilePath, path.join(this.assetPath, policyFolderName, policyFileName));
      policyFilePaths.push(`${policyFolderName}/${policyFileName}`);
    }

    new LzaCustomResource(this, resourceName, {
      resource: {
        name: resourceName,
        parentId: id,
        properties: [
          { sourceAccount: cdk.Stack.of(this).account },
          { kmsArn: props.kmsArn },
          {
            policyFilePaths: policyFilePaths,
          },
          { organizationId: props.organizationId },
        ],
        forceUpdate: true,
      },
      lambda: {
        assetPath: this.assetPath,
        environmentEncryptionKmsKey: props.customResourceLambdaEnvironmentEncryptionKmsKey,
        cloudWatchLogKmsKey: props.customResourceLambdaCloudWatchLogKmsKey,
        cloudWatchLogRetentionInDays: props.customResourceLambdaLogRetentionInDays,
        timeOut: cdk.Duration.minutes(5),
        roleInitialPolicy: [
          new cdk.aws_iam.PolicyStatement({
            effect: cdk.aws_iam.Effect.ALLOW,
            actions: ['kms:PutKeyPolicy'],
            resources: [props.kmsArn],
          }),
        ],
      },
    });
  }
}
