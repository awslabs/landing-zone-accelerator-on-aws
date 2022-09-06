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
import { BucketReplication } from '@aws-accelerator/constructs';
import { snapShotTest } from '../snapshot-test';

const testNamePrefix = 'Construct(BucketReplication): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new BucketReplication(stack, 'BucketReplication', {
  source: {
    bucketName: `aws-accelerator-macie-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
  },
  destination: {
    bucketName: `aws-accelerator-central-logs-bucket`,
    accountId: cdk.Aws.ACCOUNT_ID,
    keyArn: `arn:aws:kms:us-east-1:${cdk.Aws.ACCOUNT_ID}:key/ksm-key-arn`,
  },
  kmsKey: new cdk.aws_kms.Key(stack, 'CWLKey', {}),
  logRetentionInDays: 3653,
});

/**
 * BucketReplication construct test
 */
describe('BucketReplication', () => {
  snapShotTest(testNamePrefix, stack);
});
