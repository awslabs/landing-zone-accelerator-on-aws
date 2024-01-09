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
import * as path from 'path';
import * as fs from 'fs';
import { LzaCustomResource } from '../lza-custom-resource';
import {
  AcceleratorImportedBucketType,
  AwsPrincipalAccessesType,
  PrincipalOrgIdConditionType,
} from '@aws-accelerator/utils';

/**
 * Initialized BucketPolicyProps properties
 */
export interface BucketPolicyProps {
  /**
   * Type of the bucket
   */
  readonly bucketType: AcceleratorImportedBucketType;
  /**
   * Flag indicating is accelerator generated polices should be applied to imported bucket
   */
  readonly applyAcceleratorManagedPolicy: boolean;
  /**
   * The name of the bucket which will be validated
   */
  readonly bucket: cdk.aws_s3.IBucket;
  /**
   * JSON document bucket policy file paths.
   */
  readonly bucketPolicyFilePaths: string[];
  /**
   * The name of the bucket which will be validated
   */
  readonly principalOrgIdCondition?: PrincipalOrgIdConditionType;
  /**
   * The name of the bucket which will be validated
   */
  readonly awsPrincipalAccesses?: AwsPrincipalAccessesType[];
  /**
   * Organization Id
   */
  readonly organizationId?: string;
  /**
   * ELB account Id
   */
  readonly elbAccountId?: string;
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
  /**
   * Accelerator Prefix Firewall Roles
   */
  readonly firewallRoles?: string[];
}

/**
 * Class for BucketPolicy
 */
export class BucketPolicy extends Construct {
  public bucketKmsArn: string;
  private assetPath: string;
  constructor(scope: Construct, id: string, props: BucketPolicyProps) {
    super(scope, id);

    const resourceName = 'BucketPolicy';
    this.assetPath = path.join(__dirname, 'put-bucket-policy/dist');
    const policyFolderName = 'bucket-policy';
    fs.mkdirSync(path.join(this.assetPath, policyFolderName), { recursive: true });

    const bucketPolicyFilePaths: string[] = [];

    for (const bucketPolicyFilePath of props.bucketPolicyFilePaths ?? []) {
      const policyFileName = path.parse(bucketPolicyFilePath).base;
      fs.copyFileSync(bucketPolicyFilePath, path.join(this.assetPath, policyFolderName, policyFileName));
      bucketPolicyFilePaths.push(`${policyFolderName}/${policyFileName}`);
    }

    const lzaCustomResource = new LzaCustomResource(this, resourceName, {
      resource: {
        name: resourceName,
        parentId: id,
        properties: [
          { sourceAccount: cdk.Stack.of(this).account },
          { bucketType: props.bucketType },
          { bucketName: props.bucket.bucketName },
          { bucketArn: props.bucket.bucketArn },
          { applyAcceleratorManagedPolicy: props.applyAcceleratorManagedPolicy },
          {
            bucketPolicyFilePaths: bucketPolicyFilePaths,
          },
          { awsPrincipalAccesses: props.awsPrincipalAccesses },
          { principalOrgIdCondition: props.principalOrgIdCondition },
          { organizationId: props.organizationId },
          { elbAccountId: props.elbAccountId },
          { firewallRoles: props.firewallRoles },
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
            actions: ['s3:PutBucketPolicy'],
            resources: [props.bucket.bucketArn],
          }),
        ],
      },
    });

    this.bucketKmsArn = lzaCustomResource.resource.getAtt('bucketKmsArn').toString();
  }
}
