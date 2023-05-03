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
import { Bucket, BucketEncryptionType, CentralLogsBucket } from '@aws-accelerator/constructs';
import { snapShotTest } from '../snapshot-test';

const testNamePrefix = 'Construct(CentralLogsBucket): ';
const organizationId = 'acceleratorOrg';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new CentralLogsBucket(stack, 'CentralLogsBucket', {
  s3BucketName: `aws-accelerator-central-logs-${stack.account}-${stack.region}`,
  serverAccessLogsBucket: new Bucket(stack, 'AccessLogsBucket', {
    encryptionType: BucketEncryptionType.SSE_S3,
    s3BucketName: `aws-accelerator-s3-access-logs-${stack.account}-${stack.region}`,
    kmsAliasName: 'alias/accelerator/s3-access-logs/s3',
    kmsDescription: 'AWS Accelerator S3 Access Logs Bucket CMK',
  }),
  kmsAliasName: 'alias/accelerator/central-logs/s3',
  kmsDescription: 'AWS Accelerator Central Logs Bucket CMK',
  principalOrgIdCondition: { 'aws:PrincipalOrgID': organizationId },
  orgPrincipals: new cdk.aws_iam.OrganizationPrincipal(organizationId),
  acceleratorPrefix: 'AWSAccelerator',
  crossAccountAccessRoleName: 'AWSAccelerator-CentralBucket-KeyArnParam-Role',
  cmkArnSsmParameterName: '/accelerator/logging/central-bucket/kms/arn',
});

/**
 * CentralLogsBucket construct test
 */
describe('CentralLogsBucket', () => {
  snapShotTest(testNamePrefix, stack);
});
