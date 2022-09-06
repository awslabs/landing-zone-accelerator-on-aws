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
import {
  ResolverFirewallRuleGroup,
  ResolverFirewallRuleGroupAssociation,
} from '../../lib/aws-route-53-resolver/firewall-rule-group';
import { snapShotTest } from '../snapshot-test';

const testNamePrefix = 'Construct(ResolverFirewallRuleGroup): ';

const ruleProps = {
  action: 'BLOCK',
  firewallDomainListId: 'TestDomainList',
  priority: 101,
  blockResponse: 'NXDOMAIN',
};

const stack = new cdk.Stack();

const ruleGroup = new ResolverFirewallRuleGroup(stack, 'TestRuleGroup', {
  firewallRules: [ruleProps],
  name: 'TestRuleGroup',
  tags: [],
});

new ResolverFirewallRuleGroupAssociation(stack, 'TestRuleGroupAssoc', {
  firewallRuleGroupId: ruleGroup.groupId,
  priority: 101,
  vpcId: 'TestVpc',
});

describe('ResolverFirewallRuleGroup', () => {
  snapShotTest(testNamePrefix, stack);
});
