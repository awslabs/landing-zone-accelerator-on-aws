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
import { NfwRuleGroupRuleConfig } from '@aws-accelerator/config';
import { NetworkFirewallRuleGroup } from '../../lib/aws-networkfirewall/rule-group';
import { snapShotTest } from '../snapshot-test';
import { describe } from '@jest/globals';

const testNamePrefix = 'Construct(NetworkFirewallPolicy): ';

//Initialize stack for resource configuration test
const stack = new cdk.Stack();

const ruleGroup: NfwRuleGroupRuleConfig = {
  rulesSource: {
    statefulRules: [
      {
        action: 'PASS',
        header: {
          destination: '10.0.0.0/16',
          destinationPort: 'ANY',
          direction: 'FORWARD',
          protocol: 'IP',
          source: '10.1.0.0/16',
          sourcePort: 'ANY',
        },
        ruleOptions: [
          {
            keyword: 'sid',
            settings: ['100'],
          },
        ],
      },
    ],
    rulesSourceList: undefined,
    statelessRulesAndCustomActions: undefined,
    rulesString: undefined,
    rulesFile: '../../accelerator/test/configs/all-enabled/firewall-rules/rules.txt',
  },
  ruleVariables: undefined,
  statefulRuleOptions: 'STRICT_ORDER',
};

new NetworkFirewallRuleGroup(stack, 'TestGroup', {
  name: 'TestGroup',
  capacity: 100,
  type: 'STATEFUL',
  ruleGroup: ruleGroup,
  tags: [],
});

/**
 * Network Firewall construct test
 */
describe('Network Firewall Rule Group', () => {
  snapShotTest(testNamePrefix, stack);
});

const statelessRule: NfwRuleGroupRuleConfig = {
  rulesSource: {
    statelessRulesAndCustomActions: {
      statelessRules: [
        {
          priority: 100,
          ruleDefinition: {
            actions: ['aws:pass'],
            matchAttributes: {
              protocols: undefined,
              tcpFlags: undefined,
              sources: ['10.1.0.0/16'],
              sourcePorts: [
                {
                  fromPort: 1024,
                  toPort: 65535,
                },
              ],
              destinations: ['10.0.0.0/16'],
              destinationPorts: [
                {
                  fromPort: 22,
                  toPort: 22,
                },
              ],
            },
          },
        },
      ],
      customActions: [
        {
          actionDefinition: {
            publishMetricAction: {
              dimensions: ['CustomValue'],
            },
          },
          actionName: 'CustomAction',
        },
      ],
    },
    rulesSourceList: undefined,
    statefulRules: undefined,
    rulesString: undefined,
    rulesFile: '../../accelerator/test/configs/all-enabled/firewall-rules/rules.txt',
  },

  ruleVariables: {
    ipSets: {
      name: 'HOME_NET',
      definition: ['10.0.0.0/16'],
    },
    portSets: {
      name: 'HOME_NET',
      definition: ['80', '443'],
    },
  },

  statefulRuleOptions: 'STRICT_ORDER',
};

new NetworkFirewallRuleGroup(stack, 'TestGroupStateless', {
  name: 'TestGroupStateless',
  capacity: 100,
  type: 'STATELESS',
  ruleGroup: statelessRule,
  tags: [{ key: 'someKey', value: 'someValue' }],
});
/*
 * Network Firewall construct test
 */
describe('Network Firewall Rule Group Stateless', () => {
  snapShotTest(testNamePrefix, stack);
});
