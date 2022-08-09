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
import { GetNetworkFirewallEndpoint } from '../../lib/aws-networkfirewall/get-network-firewall-endpoint';
import { snapShotTest } from '../snapshot-test';

const testNamePrefix = 'Construct(GetNetworkFirewallEndpoint): ';

//Initialize stack for resource configuration test
const stack = new cdk.Stack();

const firewallArn = 'arn:aws:network-firewall:us-east-1:222222222222:firewall/TestFirewall';

new GetNetworkFirewallEndpoint(stack, 'TestGetEndpoint', {
  endpointAz: 'us-east-1a',
  firewallArn: firewallArn,
  kmsKey: new cdk.aws_kms.Key(stack, 'Custom', {}),
  logRetentionInDays: 3653,
  region: 'us-east-1',
});

/**
 * Get Network Firewall endpoint construct test
 */
describe('Get Network Firewall endpoint', () => {
  snapShotTest(testNamePrefix, stack);
});
