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

const testNamePrefix = 'Construct(CloudWatchToS3Firehose): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new CloudWatchToS3Firehose(stack, 'CloudWatchToS3Firehose', {
  firehoseKmsKey: new cdk.aws_kms.Key(stack, 'CustomKey', {}),
  lambdaKey: new cdk.aws_kms.Key(stack, 'CustomLambdaKey', {}),
  kinesisStream: new cdk.aws_kinesis.Stream(stack, 'CustomStream', {}),
  kinesisKmsKey: new cdk.aws_kms.Key(stack, 'CustomKinesisKey', {}),
  bucket: new cdk.aws_s3.Bucket(stack, 'CustomBucket', {}),
  dynamicPartitioningValue: '',
  homeRegion: 'someregion',
});

/**
 * CloudWatchDestination construct test
 */
describe('CloudWatchToS3Firehose', () => {
  snapShotTest(testNamePrefix, stack);
});
