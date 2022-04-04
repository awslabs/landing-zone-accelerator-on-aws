import * as cdk from 'aws-cdk-lib';

import { NetworkFirewall } from '../../lib/aws-networkfirewall/firewall';

const testNamePrefix = 'Construct(NetworkFirewall): ';

//Initialize stack for resource configuration test
const stack = new cdk.Stack();

const firewallPolicyArn = 'arn:aws:network-firewall:us-east-1:222222222222:firewall-policy/TestPolicy';

new NetworkFirewall(stack, 'TestFirewall', {
  firewallPolicyArn: firewallPolicyArn,
  name: 'TestFirewall',
  subnets: ['Test-Subnet-1', 'Test-Subnet-2'],
  vpcId: 'TestVpc',
  tags: [],
});

/**
 * Network Firewall construct test
 */
describe('Network Firewall', () => {
  /**
   * Number of Network Firewalls test
   */
  test(`${testNamePrefix} Network firewall count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::NetworkFirewall::Firewall', 1);
  });

  /**
   * Network firewall resource configuration test
   */
  test(`${testNamePrefix} Network firewall resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TestFirewallE26FCA5C: {
          Type: 'AWS::NetworkFirewall::Firewall',
          Properties: {
            FirewallName: 'TestFirewall',
            FirewallPolicyArn: 'arn:aws:network-firewall:us-east-1:222222222222:firewall-policy/TestPolicy',
            SubnetMappings: [
              {
                SubnetId: 'Test-Subnet-1',
              },
              {
                SubnetId: 'Test-Subnet-2',
              },
            ],
            VpcId: 'TestVpc',
            Tags: [
              {
                Key: 'Name',
                Value: 'TestFirewall',
              },
            ],
          },
        },
      },
    });
  });
});
