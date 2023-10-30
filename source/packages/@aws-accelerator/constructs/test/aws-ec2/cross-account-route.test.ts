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

import { CrossAccountRoute, CrossAccountRouteFramework } from '../../lib/aws-ec2/cross-account-route';
import { snapShotTest } from '../snapshot-test';

const testNamePrefix = 'Construct(CrossAccountRoute): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

const provider = new CrossAccountRouteFramework(stack, 'Framework', {
  logGroupKmsKey: new cdk.aws_kms.Key(stack, 'Key'),
  logRetentionInDays: 3653,
  acceleratorPrefix: 'AWSAccelerator',
}).provider;

new CrossAccountRoute(stack, 'Resource', {
  ownerAccount: 'TestAccount',
  ownerRegion: 'us-east-1',
  partition: 'aws',
  provider,
  roleName: 'TestRole',
  routeTableId: 'rtb-test123',
  destination: '10.0.0.0/16',
  vpcPeeringConnectionId: 'pcx-test123',
});

/**
 * CrossAccountRoute construct test
 */
describe('CrossAccountRoute', () => {
  snapShotTest(testNamePrefix, stack);
});
