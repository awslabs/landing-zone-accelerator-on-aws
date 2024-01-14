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
import { DetectResourcePolicy } from '../../lib/data-perimeter/detect-resource-policy';
import { snapShotTest } from '../snapshot-test';

const testNamePrefix = 'Construct(DetectResourcePolicy): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();
const configDirPath = `${__dirname}/../../../accelerator/test/configs/all-enabled`;

new DetectResourcePolicy(stack, 'DetectResourcePolicy', {
  acceleratorPrefix: 'AWSAccelerator',
  configDirPath: `${__dirname}/../../../accelerator/test/configs/snapshot-only`,
  homeRegion: 'us-west-2',
  kmsKeyCloudWatch: new cdk.aws_kms.Key(stack, 'CustomCloudWatchKey', {}),
  kmsKeyLambda: new cdk.aws_kms.Key(stack, 'CustomLambdaKey', {}),
  logRetentionInDays: 365,
  rbpFilePaths: [
    {
      name: 'S3',
      path: 'resource-policies/s3.json',
      tempPath: `${configDirPath}/resource-policies/s3.json`,
    },
    {
      name: 'IAM',
      path: 'resource-policies/iam.json',
      tempPath: `${configDirPath}/resource-policies/iam.json`,
    },
    {
      name: 'KMS',
      path: 'resource-policies/kms.json',
      tempPath: `${configDirPath}/resource-policies/kms.json`,
    },
  ],
});

/**
 * RevertScpChanges construct test
 */
describe('RevertScpChanges', () => {
  snapShotTest(testNamePrefix, stack);
});
