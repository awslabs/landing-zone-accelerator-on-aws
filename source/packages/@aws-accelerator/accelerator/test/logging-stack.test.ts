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
import { AcceleratorStage } from '../lib/accelerator-stage';
import { describe, test } from 'vitest';
import { snapShotTest } from './snapshot-test';
import { Create } from './accelerator-test-helpers';

const testNamePrefix = 'Construct(LoggingStack): ';

describe('LoggingStack', () => {
  snapShotTest(testNamePrefix, Create.stackProvider(`LogArchive-us-east-1`, AcceleratorStage.LOGGING));
});

describe('LoggingStackOuTargets', () => {
  snapShotTest(
    'Construct(LoggingStackOuTargets): ',
    Create.stackProvider(`LogArchive-us-east-1`, [
      AcceleratorStage.LOGGING,
      'aws',
      'us-east-1',
      'all-enabled-ou-targets',
    ]),
  );
});

describe('LoggingStack', () => {
  snapShotTest(
    testNamePrefix,
    Create.stackProvider(`LogArchive-us-west-2`, [AcceleratorStage.LOGGING, 'aws', 'us-west-2']),
  );
});

describe('LoggingStackDelegatedAdmin', () => {
  snapShotTest(
    'Construct(LoggingStacKDelegatedAdmin): ',
    Create.stackProvider(`LogArchive-us-west-2`, [
      AcceleratorStage.LOGGING,
      'aws',
      'us-west-2',
      'all-enabled-delegated-admin',
    ]),
  );
});

describe('LoggingStack VPC flow logs bucket policy (#3604)', () => {
  // The VPC Flow Logs service auto-attaches an AWSLogDeliveryWrite (s3:PutObject) statement to the
  // destination bucket on each flow log creation via a read-modify-write of the bucket policy. When
  // multiple VPCs in the same account+region target this bucket, those concurrent PutBucketPolicy
  // calls race and silently drop per-VPC path prefixes (#3604). LZA must therefore grant the write
  // itself, account-wide, so delivery no longer depends on the service's per-VPC statement.
  test('grants delivery.logs.amazonaws.com account-wide PutObject to prevent the per-VPC race', () => {
    const stack = Create.stack(`LogArchive-us-west-2`, [AcceleratorStage.LOGGING, 'aws', 'us-west-2']) as cdk.Stack;

    Template.fromStack(stack).hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Sid: 'Allow write access for VPC flow log delivery service principal',
            Effect: 'Allow',
            Action: 's3:PutObject',
            Principal: { Service: 'delivery.logs.amazonaws.com' },
            // Account-scoped resource (`${bucketArn}/*`) — no per-VPC enumeration, so no lost-update race.
            Resource: {
              'Fn::Join': [
                '',
                [{ 'Fn::GetAtt': [Match.stringLikeRegexp('AcceleratorVpcFlowLogsBucket.*'), 'Arn'] }, '/*'],
              ],
            },
            Condition: Match.objectLike({
              StringEquals: {
                'aws:SourceAccount': stack.account,
                's3:x-amz-acl': 'bucket-owner-full-control',
              },
            }),
          }),
        ]),
      },
    });
  });
});
