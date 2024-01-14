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
import { BucketReplication } from '@aws-accelerator/constructs';
import { snapShotTest } from '../snapshot-test';
import { describe, expect, test } from '@jest/globals';

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
  useExistingRoles: false,
  acceleratorPrefix: 'AWSAccelerator',
});

new BucketReplication(stack, 'BucketReplicationExistingIam', {
  source: {
    bucket: new cdk.aws_s3.Bucket(stack, 'SourceBucket', {
      encryption: cdk.aws_s3.BucketEncryption.KMS,
      encryptionKey: new cdk.aws_kms.Key(stack, 'SourceBucketExistingIam'),
    }),
  },
  destination: {
    bucketName: `aws-accelerator-central-logs-bucket-existing-iam`,
    accountId: cdk.Aws.ACCOUNT_ID,
    keyArn: `arn:aws:kms:us-east-1:${cdk.Aws.ACCOUNT_ID}:key/ksm-key-arn`,
  },
  kmsKey: new cdk.aws_kms.Key(stack, 'CWLKeyExistingIam', {}),
  logRetentionInDays: 3653,
  useExistingRoles: true,
  acceleratorPrefix: 'AWSAccelerator',
});
/**
 * BucketReplication construct test
 */
describe('BucketReplication', () => {
  snapShotTest(testNamePrefix, stack);
});

test('should throw an exception when source bucket name and bucket are present', () => {
  function s3SourceBucketError1() {
    new BucketReplication(stack, 'BucketReplicationSourceBucketError1', {
      source: {
        bucket: new cdk.aws_s3.Bucket(stack, 'SourceBucketError1', {}),
        bucketName: `aws-accelerator-macie-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
      },
      destination: {
        bucketName: `aws-accelerator-central-logs-bucket`,
        accountId: cdk.Aws.ACCOUNT_ID,
        keyArn: `arn:aws:kms:us-east-1:${cdk.Aws.ACCOUNT_ID}:key/ksm-key-arn`,
      },
      kmsKey: new cdk.aws_kms.Key(stack, 'CWLKeySourceBucketError1', {}),
      logRetentionInDays: 3653,
      useExistingRoles: false,
      acceleratorPrefix: 'AWSAccelerator',
    });
  }

  const errMsg = 'Source bucket or source bucketName (only one property) should be defined.';
  expect(s3SourceBucketError1).toThrow(new Error(errMsg));
});

test('should throw an exception when source bucket name and bucket are not defined', () => {
  function s3SourceBucketError2() {
    new BucketReplication(stack, 'BucketReplicationSourceBucketError2', {
      source: {
        bucket: undefined,
        bucketName: undefined,
      },
      destination: {
        bucketName: `aws-accelerator-central-logs-bucket`,
        accountId: cdk.Aws.ACCOUNT_ID,
        keyArn: `arn:aws:kms:us-east-1:${cdk.Aws.ACCOUNT_ID}:key/ksm-key-arn`,
      },
      kmsKey: new cdk.aws_kms.Key(stack, 'CWLKeySourceBucketError2', {}),
      logRetentionInDays: 3653,
      useExistingRoles: false,
      acceleratorPrefix: 'AWSAccelerator',
    });
  }

  const errMsg = 'Source bucket or source bucketName property must be defined when using bucket replication.';
  expect(s3SourceBucketError2).toThrow(new Error(errMsg));
});
