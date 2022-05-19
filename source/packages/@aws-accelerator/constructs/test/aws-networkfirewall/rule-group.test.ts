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
  /**
   * Number of Network Firewall Policy test
   */
  test(`${testNamePrefix} Network firewall rule group count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::NetworkFirewall::RuleGroup', 1);
  });

  /**
   * Network firewall resource configuration test
   */
  test(`${testNamePrefix} Network firewall policy resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TestGroupAF88660E: {
          Type: 'AWS::NetworkFirewall::RuleGroup',
          Properties: {
            Capacity: 100,
            RuleGroup: {
              RulesSource: {
                StatefulRules: [
                  {
                    Action: 'PASS',
                    Header: {
                      Destination: '10.0.0.0/16',
                      DestinationPort: 'ANY',
                      Direction: 'FORWARD',
                      Protocol: 'IP',
                      Source: '10.1.0.0/16',
                      SourcePort: 'ANY',
                    },
                    RuleOptions: [
                      {
                        Keyword: 'sid',
                        Settings: ['100'],
                      },
                    ],
                  },
                ],
              },
              StatefulRuleOptions: {
                RuleOrder: 'STRICT_ORDER',
              },
            },
            RuleGroupName: 'TestGroup',
            Tags: [
              {
                Key: 'Name',
                Value: 'TestGroup',
              },
            ],
            Type: 'STATEFUL',
          },
        },
      },
    });
  });
});
