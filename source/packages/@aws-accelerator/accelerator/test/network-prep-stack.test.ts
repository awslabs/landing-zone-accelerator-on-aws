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
import { AcceleratorStage } from '../lib/accelerator-stage';
import { AcceleratorSynthStacks } from './accelerator-synth-stacks';

const testNamePrefix = 'Construct(NetworkPrepStack): ';

const acceleratorTestStacks = new AcceleratorSynthStacks(AcceleratorStage.NETWORK_PREP, 'all-enabled', 'aws');
const stack = acceleratorTestStacks.stacks.get(`Network-us-east-1`)!;

/**
 * NetworkPrepStack construct test
 */
describe('NetworkPrepStack', () => {
  /**
   * Number of TransitGatewayRouteTable resource test
   */
  test(`${testNamePrefix} TransitGatewayRouteTable resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::EC2::TransitGatewayRouteTable', 4);
  });

  /**
   * Number of TransitGateway resource test
   */
  test(`${testNamePrefix} TransitGateway resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::EC2::TransitGateway', 1);
  });

  /**
   * Number of RAM ResourceShare resource test
   */
  test(`${testNamePrefix} RAM ResourceShare resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::RAM::ResourceShare', 6);
  });

  /**
   * Number of SSM parameter resource test
   */
  test(`${testNamePrefix} SSM parameter resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::SSM::Parameter', 18);
  });

  /**
   * AcceleratorBlockGroupResolverFirewallRuleGroupShareResourceShare resource configuration test
   */
  test(`${testNamePrefix} AcceleratorBlockGroupResolverFirewallRuleGroupShareResourceShare resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        AcceleratorBlockGroupResolverFirewallRuleGroupShareResourceShare3C3E6D12: {
          Properties: {
            Name: 'accelerator-block-group_ResolverFirewallRuleGroupShare',
            Principals: ['arn:aws:organizations::111111111111:ou/o-asdf123456/ou-asdf-22222222'],
            ResourceArns: [
              {
                'Fn::GetAtt': ['AcceleratorBlockGroupRuleGroup1083FDE0', 'Arn'],
              },
            ],
          },
          Type: 'AWS::RAM::ResourceShare',
        },
      },
    });
  });

  /**
   * AcceleratorBlockGroupRuleGroup resource configuration test
   */
  test(`${testNamePrefix} AcceleratorBlockGroupRuleGroup resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        AcceleratorBlockGroupRuleGroup1083FDE0: {
          Properties: {
            FirewallRules: [
              {
                Action: 'BLOCK',
                BlockResponse: 'NXDOMAIN',
                FirewallDomainListId: {
                  'Fn::GetAtt': ['DomainList1DomainListBF84D823', 'Id'],
                },
                Priority: 100,
              },
              {
                Action: 'BLOCK',
                BlockOverrideDnsType: 'CNAME',
                BlockOverrideDomain: 'amazon.com',
                BlockOverrideTtl: 3600,
                BlockResponse: 'OVERRIDE',
                FirewallDomainListId: {
                  'Fn::GetAtt': ['DomainList1DomainListBF84D823', 'Id'],
                },
                Priority: 200,
              },
              {
                Action: 'BLOCK',
                BlockResponse: 'NODATA',
                FirewallDomainListId: {
                  Ref: 'AwsManagedDomainsBotnetCommandandControlDomainList1AA90CC1',
                },
                Priority: 300,
              },
            ],
            Tags: [
              {
                Key: 'Name',
                Value: 'accelerator-block-group',
              },
            ],
          },
          Type: 'AWS::Route53Resolver::FirewallRuleGroup',
        },
      },
    });
  });
  /**
   * AcceleratorIpamIpam resource configuration test
   */
  test(`${testNamePrefix} AcceleratorIpamIpam resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        AcceleratorIpamIpamB72C793C: {
          Properties: {
            Description: 'Accelerator IPAM',
            OperatingRegions: [
              {
                RegionName: 'us-east-1',
              },
              {
                RegionName: 'us-west-2',
              },
            ],
            Tags: [
              {
                Key: 'Name',
                Value: 'accelerator-ipam',
              },
            ],
          },
          Type: 'AWS::EC2::IPAM',
        },
      },
    });
  });
  /**
   * AcceleratorKeyLookup resource configuration test
   */
  test(`${testNamePrefix} AcceleratorKeyLookup resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        AcceleratorKeyLookup0C18DA36: {
          DeletionPolicy: 'Delete',
          DependsOn: ['CustomSsmGetParameterValueCustomResourceProviderLogGroup780D220D'],
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomSsmGetParameterValueCustomResourceProviderHandlerAAD0E7EE', 'Arn'],
            },
            assumeRoleArn: {
              'Fn::Join': [
                '',
                [
                  'arn:',
                  {
                    Ref: 'AWS::Partition',
                  },
                  ':iam::222222222222:role/AWSAccelerator-CrossAccount-SsmParameter-Role',
                ],
              ],
            },
            invokingAccountID: '555555555555',
            invokingRegion: 'us-east-1',
            parameterAccountID: '222222222222',
            parameterName: '/accelerator/kms/key-arn',
            parameterRegion: 'us-east-1',
          },
          Type: 'Custom::SsmGetParameterValue',
          UpdateReplacePolicy: 'Delete',
        },
      },
    });
  });
  /**
   * AcceleratorPolicyNetworkFirewallPolicy resource configuration test
   */
  test(`${testNamePrefix} AcceleratorPolicyNetworkFirewallPolicy resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        AcceleratorPolicyNetworkFirewallPolicyC840A0C2: {
          Properties: {
            FirewallPolicy: {
              StatefulRuleGroupReferences: [
                {
                  ResourceArn: {
                    Ref: 'AcceleratorRuleGroupNetworkFirewallRuleGroup3B409F78',
                  },
                },
                {
                  ResourceArn: {
                    Ref: 'DomainListGroupNetworkFirewallRuleGroup8FEBF91F',
                  },
                },
              ],
              StatelessDefaultActions: ['aws:forward_to_sfe'],
              StatelessFragmentDefaultActions: ['aws:forward_to_sfe'],
              StatelessRuleGroupReferences: [],
            },
            FirewallPolicyName: 'accelerator-policy',
            Tags: [
              {
                Key: 'Name',
                Value: 'accelerator-policy',
              },
            ],
          },
          Type: 'AWS::NetworkFirewall::FirewallPolicy',
        },
      },
    });
  });
  /**
   * AcceleratorPolicyNetworkFirewallPolicyShareResourceShare resource configuration test
   */
  test(`${testNamePrefix} AcceleratorPolicyNetworkFirewallPolicyShareResourceShare resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        AcceleratorPolicyNetworkFirewallPolicyShareResourceShareA8374828: {
          Properties: {
            Name: 'accelerator-policy_NetworkFirewallPolicyShare',
            Principals: ['arn:aws:organizations::111111111111:ou/o-asdf123456/ou-asdf-22222222'],
            ResourceArns: [
              {
                Ref: 'AcceleratorPolicyNetworkFirewallPolicyC840A0C2',
              },
            ],
          },
          Type: 'AWS::RAM::ResourceShare',
        },
      },
    });
  });
  /**
   * AcceleratorQueryLogsCwlQueryLogConfig resource configuration test
   */
  test(`${testNamePrefix} AcceleratorQueryLogsCwlQueryLogConfig resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        AcceleratorQueryLogsCwlQueryLogConfigE0FE97C8: {
          Properties: {
            DestinationArn: {
              'Fn::GetAtt': ['QueryLogsLogGroup9D69754D', 'Arn'],
            },
          },
          Type: 'AWS::Route53Resolver::ResolverQueryLoggingConfig',
        },
      },
    });
  });
  /**
   * AcceleratorQueryLogsCwlQueryLogConfigShareResourceShare resource configuration test
   */
  test(`${testNamePrefix} AcceleratorQueryLogsCwlQueryLogConfigShareResourceShare resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        AcceleratorQueryLogsCwlQueryLogConfigShareResourceShare584C5889: {
          Properties: {
            Name: 'accelerator-query-logs-cwl_QueryLogConfigShare',
            Principals: ['arn:aws:organizations::111111111111:ou/o-asdf123456/ou-asdf-22222222'],
            ResourceArns: [
              {
                'Fn::GetAtt': ['AcceleratorQueryLogsCwlQueryLogConfigE0FE97C8', 'Arn'],
              },
            ],
          },
          Type: 'AWS::RAM::ResourceShare',
        },
      },
    });
  });
});
