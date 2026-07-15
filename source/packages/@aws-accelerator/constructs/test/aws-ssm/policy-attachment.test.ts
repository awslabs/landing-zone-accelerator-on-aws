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
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, test } from 'vitest';
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

  const template = Template.fromStack(stack);

  // DescribeLogGroups must be its own statement scoped to '*', since the action
  // has no resource type in IAM and only authorizes when Resource is '*'.
  test('DescribeLogGroups is split into its own statement scoped to *', () => {
    template.hasResourceProperties('AWS::IAM::ManagedPolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Sid: 'CloudWatchLogsDescribe',
            Action: 'logs:DescribeLogGroups',
            Resource: '*',
          }),
        ]),
      },
    });
  });

  // The scoped write statement keeps the stream actions but must not carry DescribeLogGroups.
  test('CloudWatchLogs write statement does not include DescribeLogGroups', () => {
    template.hasResourceProperties('AWS::IAM::ManagedPolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Sid: 'CloudWatchLogs',
            Action: ['logs:CreateLogStream', 'logs:PutLogEvents', 'logs:DescribeLogStreams'],
          }),
        ]),
      },
    });
  });

  // Session key encryption requires GenerateDataKey for principals that start sessions.
  test('SessionManagerSessionKey statement grants kms:GenerateDataKey', () => {
    template.hasResourceProperties('AWS::IAM::ManagedPolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Sid: 'SessionManagerSessionKey',
            Action: ['kms:Decrypt', 'kms:GenerateDataKey', 'kms:DescribeKey'],
          }),
        ]),
      },
    });
  });
});
