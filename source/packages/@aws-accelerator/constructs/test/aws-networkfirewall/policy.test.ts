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
import { FirewallPolicyProperty, NetworkFirewallPolicy } from '../../lib/aws-networkfirewall/policy';
import { snapShotTest } from '../snapshot-test';

const testNamePrefix = 'Construct(NetworkFirewallPolicy): ';

//Initialize stack for resource configuration test
const stack = new cdk.Stack();

const firewallPolicy: FirewallPolicyProperty = {
  statelessDefaultActions: ['aws:forward_to_sfe'],
  statelessFragmentDefaultActions: ['aws:forward_to_sfe'],
  statefulEngineOptions: 'STRICT_ORDER',
  statefulRuleGroupReferences: [
    {
      priority: 123,
      resourceArn: 'arn:aws:network-firewall:us-east-1:222222222222:stateful-rulegroup/TestGroup',
    },
  ],
};

new NetworkFirewallPolicy(stack, 'TestPolicy', {
  firewallPolicy: firewallPolicy,
  name: 'TestFirewallPolicy',
  tags: [],
});

/**
 * Network Firewall construct test
 */
describe('Network Firewall Policy', () => {
  snapShotTest(testNamePrefix, stack);
});
