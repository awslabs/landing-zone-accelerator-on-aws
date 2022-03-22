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
