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
import { LzaLambda } from '../lib/lza-lambda';
import { snapShotTest } from './snapshot-test';
import { describe } from '@jest/globals';
const testNamePrefix = 'Construct(IdentityCenterGetInstanceId): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new LzaLambda(stack, 'LzaLambda', {
  functionName: 'LzaLambda',
  assetPath: `${__dirname}/../lib/aws-identitystore/get-users-groups-id/dist`,
  environmentEncryptionKmsKey: new cdk.aws_kms.Key(stack, 'LambdaKey', {}),
  cloudWatchLogKmsKey: new cdk.aws_kms.Key(stack, 'CloudWatchKey', {}),
  cloudWatchLogRetentionInDays: 365,
  description: 'LZA Lambda Function for Snapshot test',
  timeOut: cdk.Duration.minutes(5),
  roleInitialPolicy: [
    new cdk.aws_iam.PolicyStatement({
      effect: cdk.aws_iam.Effect.ALLOW,
      actions: ['identitystore:ListGroups', 'identitystore:ListUsers'],
      resources: ['*'],
    }),
  ],
  cloudWatchLogRemovalPolicy: cdk.RemovalPolicy.RETAIN,
  nagSuppressionPrefix: `testPrefix`,
  environmentVariables: [{ envKey: 'envValue' }],
});

/**
 * LzaLambda construct test
 */
describe('LzaLambda', () => {
  snapShotTest(testNamePrefix, stack);
});
