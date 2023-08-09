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
import { BucketEncryption } from '@aws-accelerator/constructs';
import { snapShotTest } from '../snapshot-test';

const testNamePrefix = 'Construct(ValidateBucketKmsEncryption): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new BucketEncryption(stack, 'ValidateBucketKmsEncryption', {
  bucket: new cdk.aws_s3.Bucket(stack, 'Bucket'),
  kmsKey: new cdk.aws_kms.Key(stack, 'BucketKey', {}),
  customResourceLambdaCloudWatchLogKmsKey: new cdk.aws_kms.Key(stack, 'CloudWatchKeyKmsEncryption', {}),
  customResourceLambdaEnvironmentEncryptionKmsKey: new cdk.aws_kms.Key(stack, 'LambdaKeyKmsEncryption', {}),
  customResourceLambdaLogRetentionInDays: 365,
});

/**
 * BucketEncryption construct test
 */
describe('BucketEncryption', () => {
  snapShotTest(testNamePrefix, stack);
});
