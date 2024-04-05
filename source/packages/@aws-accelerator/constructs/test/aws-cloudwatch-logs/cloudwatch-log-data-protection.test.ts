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
import { CloudWatchLogDataProtection } from '../../lib/aws-cloudwatch-logs/cloudwatch-log-data-protection';
import { snapShotTest } from '../snapshot-test';
import { describe } from '@jest/globals';

const testNamePrefix = 'Construct(CloudWatchLogDataProtection): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new CloudWatchLogDataProtection(stack, 'CloudWatchLogDataProtection', {
  centralLogBucketName: 'aws-accelerator-central-logs',
  identifierNames: ['AwsSecretKey', 'OpenSshPrivateKey', 'PgpPrivateKey', 'PkcsPrivateKey', 'PuttyPrivateKey'],
  overrideExisting: true,
  customResourceLambdaEnvironmentEncryptionKmsKey: new cdk.aws_kms.Key(stack, 'LambdaKey', {}),
  customResourceLambdaCloudWatchLogKmsKey: new cdk.aws_kms.Key(stack, 'CloudWatchLogKey', {}),
  customResourceLambdaLogRetentionInDays: 365,
});

/**
 * CloudWatchLogDataProtection construct test
 */
describe('CloudWatchLogDataProtection', () => {
  snapShotTest(testNamePrefix, stack);
});
