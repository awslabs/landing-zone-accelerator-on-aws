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
import { SsmSessionManagerPolicy } from '../../index';
import { snapShotTest } from '../snapshot-test';

const testNamePrefix = 'Construct(SsmSessionManagerPolicy): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new SsmSessionManagerPolicy(stack, 'SsmSessionManagerPolicy', {
  s3BucketName: 'bucketName',
  s3BucketKeyArn: 'arn',
  sendToS3: true,
  homeRegion: 'us-east-1',
  sendToCloudWatchLogs: true,
  attachPolicyToIamRoles: ['Test1', 'Test2'],
  region: 'us-east-1',
  enabledRegions: ['us-east-1', 'us-west-2'],
  prefixes: { accelerator: 'AWSAccelerator', ssmLog: 'aws-accelerator' },
  ssmKeyDetails: {
    alias: 'accelerator/sessionmanager-logs/session',
    description: 'AWS Accelerator Session Manager Session Encryption',
  },
  cloudWatchLogGroupList: [
    'arn:aws:logs:us-east-1:111111111111:log-group:*',
    'arn:aws:logs:us-west-2:111111111111:log-group:*',
  ],
  sessionManagerCloudWatchLogGroupList: [
    'arn:aws:logs:us-east-1:111111111111:log-group:aws-accelerator-sessionmanager-logs:*',
    'arn:aws:logs:us-west-2:111111111111:log-group:aws-accelerator-sessionmanager-logs:*',
  ],
  s3BucketList: [
    'arn:aws:s3:::${this.centralLogsBucketName}/session/111111111111/us-east-1/*',
    'arn:aws:s3:::${this.centralLogsBucketName}/session/111111111111/us-west-2/*',
  ],
});

/**
 * SsmSessionManagerPolicy construct test
 */
describe('SsmSessionManagerPolicy', () => {
  snapShotTest(testNamePrefix, stack);
});
