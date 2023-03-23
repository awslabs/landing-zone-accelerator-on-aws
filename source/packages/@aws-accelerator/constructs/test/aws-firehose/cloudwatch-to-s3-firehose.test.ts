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
import { CloudWatchToS3Firehose } from '../../lib/aws-firehose/cloudwatch-to-s3-firehose';
import { snapShotTest } from '../snapshot-test';
import { describe, expect, test } from '@jest/globals';

const testNamePrefix = 'Construct(CloudWatchToS3Firehose): ';
const stack = new cdk.Stack();

/**
 * CloudWatchDestination construct test
 */
describe('CloudWatchToS3Firehose', () => {
  //Initialize stack for snapshot test and resource configuration test

  new CloudWatchToS3Firehose(stack, 'CloudWatchToS3Firehose', {
    firehoseKmsKey: new cdk.aws_kms.Key(stack, 'CustomKey', {}),
    lambdaKey: new cdk.aws_kms.Key(stack, 'CustomLambdaKey', {}),
    kinesisStream: new cdk.aws_kinesis.Stream(stack, 'CustomStream', {}),
    kinesisKmsKey: new cdk.aws_kms.Key(stack, 'CustomKinesisKey', {}),
    bucket: new cdk.aws_s3.Bucket(stack, 'CustomBucket', {}),
    dynamicPartitioningValue: 'dynamic-partitioning/log-filters.json',
    homeRegion: 'someregion',
    configDir: `${__dirname}/../../../accelerator/test/configs/all-enabled`,
    prefixProcessingFunctionName: 'AWSAccelerator-FirehoseRecordsProcessor',
    glueDatabaseName: 'AWSAccelerator-Database',
    transformationTableName: 'aws-accelerator-firehose-transformation-table',
  });
  snapShotTest(testNamePrefix, stack);
});

describe('CloudWatchToS3FirehoseBucketName', () => {
  new CloudWatchToS3Firehose(stack, 'CloudWatchToS3FirehoseBucketName', {
    firehoseKmsKey: new cdk.aws_kms.Key(stack, 'CustomKeyBucketName', {}),
    lambdaKey: new cdk.aws_kms.Key(stack, 'CustomLambdaKeyBucketName', {}),
    kinesisStream: new cdk.aws_kinesis.Stream(stack, 'CustomStreamBucketName', {}),
    kinesisKmsKey: new cdk.aws_kms.Key(stack, 'CustomKinesisKeyBucketName', {}),
    bucketName: 'somebucket',
    dynamicPartitioningValue: 'dynamic-partitioning/log-filters.json',
    homeRegion: 'someregion',
    configDir: `${__dirname}/../../../accelerator/test/configs/all-enabled`,
    prefixProcessingFunctionName: 'AWSAccelerator-FirehoseRecordsProcessor',
    glueDatabaseName: 'AWSAccelerator-Database',
    transformationTableName: 'aws-accelerator-firehose-transformation-table',
  });
  snapShotTest(testNamePrefix, stack);
});

test('should throw an exception for bucket name and bucket are present', () => {
  function s3BucketError() {
    new CloudWatchToS3Firehose(stack, 'CloudWatchToS3FirehoseBucketError', {
      firehoseKmsKey: new cdk.aws_kms.Key(stack, 'CustomKeyBucketErrorName', {}),
      lambdaKey: new cdk.aws_kms.Key(stack, 'CustomLambdaKeyBucketErrorName', {}),
      kinesisStream: new cdk.aws_kinesis.Stream(stack, 'CustomStreamBucketErrorName', {}),
      kinesisKmsKey: new cdk.aws_kms.Key(stack, 'CustomKinesisKeyBucketErrorName', {}),
      bucketName: 'somebucket',
      bucket: new cdk.aws_s3.Bucket(stack, 'CustomBucketError', {}),
      dynamicPartitioningValue: 'dynamic-partitioning/log-filters.json',
      homeRegion: 'someregion',
      configDir: `${__dirname}/../../../accelerator/test/configs/all-enabled`,
      prefixProcessingFunctionName: 'AWSAccelerator-FirehoseRecordsProcessor',
      glueDatabaseName: 'AWSAccelerator-Database',
      transformationTableName: 'aws-accelerator-firehose-transformation-table',
    });
  }

  const errMsg =
    'Either source bucket or source bucketName property must be defined. Only one property must be defined.';
  expect(s3BucketError).toThrow(new Error(errMsg));
});
