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
import { ValidateBucket } from '@aws-accelerator/constructs';
import { snapShotTest } from '../snapshot-test';

let testNamePrefix = 'Construct(ValidateBucketKmsEncryption): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new ValidateBucket(stack, 'ValidateBucketKmsEncryption', {
  bucket: new cdk.aws_s3.Bucket(stack, 'BucketKmsEncryption'),
  validationCheckList: ['encryption'],
  encryptionType: 'kms',
  customResourceLambdaCloudWatchLogKmsKey: new cdk.aws_kms.Key(stack, 'CloudWatchKeyKmsEncryption', {}),
  customResourceLambdaEnvironmentEncryptionKmsKey: new cdk.aws_kms.Key(stack, 'LambdaKeyKmsEncryption', {}),
  customResourceLambdaLogRetentionInDays: 365,
});

/**
 * ValidateBucketKmsEncryption construct test
 */
describe('ValidateBucketKmsEncryption', () => {
  snapShotTest(testNamePrefix, stack);
});

testNamePrefix = 'Construct(ValidateBucketS3Encryption): ';

new ValidateBucket(stack, 'ValidateBucketS3Encryption', {
  bucket: new cdk.aws_s3.Bucket(stack, 'BucketS3Encryption'),
  validationCheckList: ['encryption'],
  encryptionType: 'kms',
  customResourceLambdaCloudWatchLogKmsKey: new cdk.aws_kms.Key(stack, 'CloudWatchKeyS3Encryption', {}),
  customResourceLambdaEnvironmentEncryptionKmsKey: new cdk.aws_kms.Key(stack, 'LambdaKeyS3Encryption', {}),
  customResourceLambdaLogRetentionInDays: 365,
});

/**
 * ValidateBucketS3Encryption construct test
 */
describe('ValidateBucketS3Encryption', () => {
  snapShotTest(testNamePrefix, stack);
});
