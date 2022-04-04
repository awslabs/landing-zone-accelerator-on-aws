import * as cdk from 'aws-cdk-lib';

import { FirewallPolicyProperty, NetworkFirewallPolicy } from '../../lib/aws-networkfirewall/policy';

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
  /**
   * Number of Network Firewall Policy test
   */
  test(`${testNamePrefix} Network firewall count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::NetworkFirewall::FirewallPolicy', 1);
  });

  /**
   * Network firewall resource configuration test
   */
  test(`${testNamePrefix} Network firewall policy resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TestPolicyCC05E598: {
          Type: 'AWS::NetworkFirewall::FirewallPolicy',
          Properties: {
            FirewallPolicy: {
              StatefulEngineOptions: {
                RuleOrder: 'STRICT_ORDER',
              },
              StatefulRuleGroupReferences: [
                {
                  Priority: 123,
                  ResourceArn: 'arn:aws:network-firewall:us-east-1:222222222222:stateful-rulegroup/TestGroup',
                },
              ],
              StatelessDefaultActions: ['aws:forward_to_sfe'],
              StatelessFragmentDefaultActions: ['aws:forward_to_sfe'],
            },
            FirewallPolicyName: 'TestFirewallPolicy',
            Tags: [{ Key: 'Name', Value: 'TestFirewallPolicy' }],
          },
        },
      },
    });
  });
});
