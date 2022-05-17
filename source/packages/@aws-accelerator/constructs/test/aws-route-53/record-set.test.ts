import * as cdk from 'aws-cdk-lib';

import { SynthUtils } from '@aws-cdk/assert';

import { HostedZone, RecordSet, SecurityGroup, VpcEndpoint } from '../../index';

const testNamePrefix = 'Construct(RecordSet): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();
const hostedZoneName = HostedZone.getHostedZoneNameForService('s3-global.accesspoint', stack.region);

const hostedZone = new HostedZone(stack, `TestHostedZone`, {
  hostedZoneName,
  vpcId: 'Test',
});

const securityGroup = new SecurityGroup(stack, 'TestSecurityGroup`', {
  securityGroupName: 'TestSecurityGroup',
  description: `AWS Private Endpoint Zone`,
  vpcId: 'Test',
  tags: [],
});

// Create the interface endpoint
const endpoint = new VpcEndpoint(stack, `TestVpcEndpoint`, {
  vpcId: 'Test',
  vpcEndpointType: cdk.aws_ec2.VpcEndpointType.INTERFACE,
  service: 'ec2',
  subnets: ['Test1', 'Test2'],
  securityGroups: [securityGroup],
  privateDnsEnabled: false,
  policyDocument: new cdk.aws_iam.PolicyDocument({
    statements: [
      new cdk.aws_iam.PolicyStatement({
        sid: 'AccessToTrustedPrincipalsAndResources',
        actions: ['*'],
        effect: cdk.aws_iam.Effect.ALLOW,
        resources: ['*'],
        principals: [new cdk.aws_iam.AnyPrincipal()],
        conditions: {
          StringEquals: {
            'aws:PrincipalOrgID': ['organizationId'],
          },
        },
      }),
    ],
  }),
});

new RecordSet(stack, `TestRecordSet`, {
  type: 'A',
  name: hostedZoneName,
  hostedZone: hostedZone,
  dnsName: endpoint.dnsName,
  hostedZoneId: endpoint.hostedZoneId,
});

/**
 * RecordSet construct test
 */
describe('RecordSet', () => {
  /**
   * Snapshot test
   */
  test(`${testNamePrefix} Snapshot Test`, () => {
    expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
  });

  /**
   * Number of HostedZone test
   */
  test(`${testNamePrefix} Hosted zone resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Route53::HostedZone', 1);
  });

  /**
   * Number of RecordSet test
   */
  test(`${testNamePrefix} RecordSet resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Route53::RecordSet', 1);
  });

  /**
   * Number of SecurityGroup test
   */
  test(`${testNamePrefix} SecurityGroup resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::EC2::SecurityGroup', 1);
  });

  /**
   * Number of VPCEndpoint test
   */
  test(`${testNamePrefix} VPCEndpoint resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::EC2::VPCEndpoint', 1);
  });

  /**
   * HostedZone resource configuration test
   */
  test(`${testNamePrefix} HostedZone resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TestHostedZone68F306E4: {
          Type: 'AWS::Route53::HostedZone',
          Properties: {
            Name: {
              'Fn::Join': [
                '',
                [
                  's3-global.accesspoint.',
                  {
                    Ref: 'AWS::Region',
                  },
                  '.amazonaws.com',
                ],
              ],
            },
            VPCs: [
              {
                VPCId: 'Test',
                VPCRegion: {
                  Ref: 'AWS::Region',
                },
              },
            ],
          },
        },
      },
    });
  });

  /**
   * RecordSet resource configuration test
   */
  test(`${testNamePrefix} RecordSet resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TestRecordSetED81F5C1: {
          Type: 'AWS::Route53::RecordSet',
          Properties: {
            AliasTarget: {
              DNSName: {
                'Fn::Select': [
                  1,
                  {
                    'Fn::Split': [
                      ':',
                      {
                        'Fn::Select': [
                          0,
                          {
                            'Fn::GetAtt': ['TestVpcEndpointF7CADE71', 'DnsEntries'],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              HostedZoneId: {
                'Fn::Select': [
                  0,
                  {
                    'Fn::Split': [
                      ':',
                      {
                        'Fn::Select': [
                          0,
                          {
                            'Fn::GetAtt': ['TestVpcEndpointF7CADE71', 'DnsEntries'],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            },
            HostedZoneId: {
              Ref: 'TestHostedZone68F306E4',
            },
            Name: {
              'Fn::Join': [
                '',
                [
                  's3-global.accesspoint.',
                  {
                    Ref: 'AWS::Region',
                  },
                  '.amazonaws.com',
                ],
              ],
            },
            Type: 'A',
          },
        },
      },
    });
  });

  /**
   * SecurityGroup resource configuration test
   */
  test(`${testNamePrefix} SecurityGroup resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TestSecurityGroupDA4B5F83: {
          Type: 'AWS::EC2::SecurityGroup',
          Properties: {
            GroupDescription: 'AWS Private Endpoint Zone',
            GroupName: 'TestSecurityGroup',
            Tags: [
              {
                Key: 'Name',
                Value: 'TestSecurityGroup',
              },
            ],
            VpcId: 'Test',
          },
        },
      },
    });
  });

  /**
   * VPCEndpoint resource configuration test
   */
  test(`${testNamePrefix} VPCEndpoint resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TestVpcEndpointF7CADE71: {
          Type: 'AWS::EC2::VPCEndpoint',
          Properties: {
            PolicyDocument: {
              Statement: [
                {
                  Action: '*',
                  Condition: {
                    StringEquals: {
                      'aws:PrincipalOrgID': ['organizationId'],
                    },
                  },
                  Effect: 'Allow',
                  Principal: {
                    AWS: '*',
                  },
                  Resource: '*',
                  Sid: 'AccessToTrustedPrincipalsAndResources',
                },
              ],
              Version: '2012-10-17',
            },
            PrivateDnsEnabled: false,
            SecurityGroupIds: [
              {
                Ref: 'TestSecurityGroupDA4B5F83',
              },
            ],
            ServiceName: {
              'Fn::Join': [
                '',
                [
                  'com.amazonaws.',
                  {
                    Ref: 'AWS::Region',
                  },
                  '.ec2',
                ],
              ],
            },
            SubnetIds: ['Test1', 'Test2'],
            VpcEndpointType: 'Interface',
            VpcId: 'Test',
          },
        },
      },
    });
  });
});
