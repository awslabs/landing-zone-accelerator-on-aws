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
import { RouteTable } from '../../lib/aws-ec2/route-table';
import { Vpc } from '../../lib/aws-ec2/vpc';
import { snapShotTest } from '../snapshot-test';

const testNamePrefix = 'Construct(RouteTable): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

const vpc = new Vpc(stack, 'TestVpc', {
  name: 'Test',
  ipv4CidrBlock: '10.0.0.0/16',
  internetGateway: true,
  enableDnsHostnames: false,
  enableDnsSupport: true,
  instanceTenancy: 'default',
});

new RouteTable(stack, 'RouteTable', {
  name: 'TestRouteTable',
  vpc: vpc,
  tags: [{ key: 'Test-Key', value: 'Test-Value' }],
});

/**
 * RouteTable construct test
 */
describe('RouteTable', () => {
  snapShotTest(testNamePrefix, stack);
});
