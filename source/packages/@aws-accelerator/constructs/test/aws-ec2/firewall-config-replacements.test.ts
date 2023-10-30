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
import { FirewallConfigReplacements } from '../../lib/aws-ec2/firewall-config-replacements';
import { snapShotTest } from '../snapshot-test';

const testNamePrefix = 'Construct(FirewallConfigReplacements): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

// Create mock keys and role for custom resource
const cloudWatchKey = new cdk.aws_kms.Key(stack, 'CloudWatchKey');
const lambdaKey = new cdk.aws_kms.Key(stack, 'LambdaKey');
const role = new cdk.aws_iam.Role(stack, 'Role', {
  assumedBy: new cdk.aws_iam.ServicePrincipal('lambda.amazonaws.com'),
});

// Create resource
new FirewallConfigReplacements(stack, 'ConfigReplacements', {
  cloudWatchLogKey: cloudWatchKey,
  cloudWatchLogRetentionInDays: 3653,
  environmentEncryptionKey: lambdaKey,
  properties: [{ test: 'test' }],
  role,
});

describe('FirewallConfigReplacements', () => {
  snapShotTest(testNamePrefix, stack);
});
