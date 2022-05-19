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
  /**
   * DNS firewall rule group count test
   */
  test(`${testNamePrefix} DNS firewall rule group count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Route53Resolver::FirewallRuleGroup', 1);
  });

  /**
   * DNS firewall rule group association count test
   */
  test(`${testNamePrefix} DNS firewall rule group association count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Route53Resolver::FirewallRuleGroupAssociation', 1);
  });

  /**
   * DNS firewall rule group configuration test
   */
  test(`${testNamePrefix} DNS firewall rule group resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TestRuleGroup43F9213A: {
          Type: 'AWS::Route53Resolver::FirewallRuleGroup',
          Properties: {
            FirewallRules: [
              {
                Action: 'BLOCK',
                BlockResponse: 'NXDOMAIN',
                FirewallDomainListId: 'TestDomainList',
                Priority: 101,
              },
            ],
            Tags: [
              {
                Key: 'Name',
                Value: 'TestRuleGroup',
              },
            ],
          },
        },
      },
    });
  });

  /**
   * DNS firewall rule group association configuration test
   */
  test(`${testNamePrefix} DNS firewall rule group association resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TestRuleGroupAssoc48F4678D: {
          Type: 'AWS::Route53Resolver::FirewallRuleGroupAssociation',
          Properties: {
            FirewallRuleGroupId: {
              Ref: 'TestRuleGroup43F9213A',
            },
            Priority: 101,
            VpcId: 'TestVpc',
          },
        },
      },
    });
  });
});
