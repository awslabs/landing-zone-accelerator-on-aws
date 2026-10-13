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
import { describe } from 'vitest';
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
  logRetentionInDays: 3653,
  region: 'us-east-1',
  prefixes: { accelerator: 'AWSAccelerator', ssmLog: 'aws-accelerator' },
  ssmKeyDetails: {
    alias: 'accelerator/sessionmanager-logs/session',
    description: 'AWS Accelerator Session Manager Session Encryption',
  },
});

//Initialize a second stack to cover the optional session preference properties
const sessionPreferencesStack = new cdk.Stack();

new SsmSessionManagerSettings(sessionPreferencesStack, 'SsmSessionManagerSettings', {
  s3BucketName: 'bucketName',
  s3KeyPrefix: 'prefix',
  s3BucketKeyArn: 'arn',
  sendToS3: true,
  sendToCloudWatchLogs: true,
  cloudWatchEncryptionEnabled: true,
  cloudWatchEncryptionKey: new cdk.aws_kms.Key(sessionPreferencesStack, 'CwKey', {}),
  logRetentionInDays: 3653,
  region: 'us-east-1',
  prefixes: { accelerator: 'AWSAccelerator', ssmLog: 'aws-accelerator' },
  ssmKeyDetails: {
    alias: 'accelerator/sessionmanager-logs/session',
    description: 'AWS Accelerator Session Manager Session Encryption',
  },
  idleSessionTimeout: 15,
  maxSessionDuration: 60,
  cloudWatchStreamingEnabled: true,
  shellProfile: {
    linux: 'echo "This session is logged and monitored."',
    windows: 'Write-Host "This session is logged and monitored."',
  },
});

/**
 * SsmSessionManagerSettings construct test
 */
describe('SsmSessionManagerSettings', () => {
  snapShotTest(testNamePrefix, stack);
});

/**
 * SsmSessionManagerSettings construct test with session preferences configured
 */
describe('SsmSessionManagerSettingsWithSessionPreferences', () => {
  snapShotTest(`${testNamePrefix}with session preferences: `, sessionPreferencesStack);
});
