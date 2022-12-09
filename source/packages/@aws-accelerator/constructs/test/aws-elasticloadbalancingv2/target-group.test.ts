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
import { TargetGroup } from '../../lib/aws-elasticloadbalancingv2/target-group';
import { snapShotTest } from '../snapshot-test';
import { describe } from '@jest/globals';

const testNamePrefix = 'Construct(TargetGroup): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new TargetGroup(stack, 'Test1', {
  name: 'Test',
  port: 80,
  protocol: 'HTTP',
  protocolVersion: 'HTTP1',
  type: 'instance',
  vpc: 'test',
  attributes: {
    deregistrationDelay: 123,
    stickiness: true,
    stickinessType: 'stickinessType',
    algorithm: 'algorithm',
    slowStart: 123,
    appCookieName: 'appCookieName',
    appCookieDuration: 123,
    lbCookieDuration: 123,
    connectionTermination: true,
    preserveClientIp: true,
    proxyProtocolV2: true,
  },
});

/**
 * TargetGroup construct test
 */
describe('TargetGroup', () => {
  snapShotTest(testNamePrefix, stack);
});
