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
import { PrefixListRoute } from '../../lib/aws-ec2/prefix-list-route';
import { snapShotTest } from '../snapshot-test';

const testNamePrefix = 'Construct(PrefixListRoute): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new PrefixListRoute(stack, 'TestPrefixListRoute', {
  destinationPrefixListId: 'pl-test',
  logGroupKmsKey: new cdk.aws_kms.Key(stack, 'TestKms', {}),
  logRetentionInDays: 3653,
  routeTableId: 'Test',
  transitGatewayId: 'tgw-test',
});

/**
 * Prefix list route construct test
 */
describe('PrefixListRoute', () => {
  snapShotTest(testNamePrefix, stack);
});
