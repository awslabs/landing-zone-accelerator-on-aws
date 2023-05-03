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
import { SsmSessionManagerSettings } from '../../index';
import { snapShotTest } from '../snapshot-test';

//import { SynthUtils } from '@aws-cdk/assert';

const testNamePrefix = 'Construct(SsmSessionManagerSettings): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new SsmSessionManagerSettings(stack, 'SsmSessionManagerSettings', {
  s3BucketName: 'bucketName',
  s3KeyPrefix: 'prefix',
  s3BucketKeyArn: 'arn',
  sendToS3: true,
  sendToCloudWatchLogs: true,
  cloudWatchEncryptionEnabled: true,
  cloudWatchEncryptionKey: new cdk.aws_kms.Key(stack, 'CwKey', {}),
  constructLoggingKmsKey: new cdk.aws_kms.Key(stack, 'Key', {}),
  logRetentionInDays: 3653,
  region: 'us-east-1',
  acceleratorPrefix: 'AWSAccelerator',
});

/**
 * SsmSessionManagerSettings construct test
 */
describe('SsmSessionManagerSettings', () => {
  snapShotTest(testNamePrefix, stack);
});
