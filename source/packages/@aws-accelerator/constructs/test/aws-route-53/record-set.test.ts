import * as cdk from 'aws-cdk-lib';
import { HostedZone, RecordSet, Vpc, VpcEndpoint, Subnet, RouteTable, SecurityGroup } from '../../index';
import { SynthUtils } from '@aws-cdk/assert';

const testNamePrefix = 'Construct(RecordSet): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();
const hostedZoneName = HostedZone.getHostedZoneNameForService('s3-global.accesspoint', stack.region);

const vpc = new Vpc(stack, 'TestVpc', {
  name: 'Test',
  ipv4CidrBlock: '10.0.0.0/16',
  internetGateway: true,
  enableDnsHostnames: false,
  enableDnsSupport: true,
  instanceTenancy: 'default',
});

const hostedZone = new HostedZone(stack, `TestHostedZone`, {
  hostedZoneName,
  vpc,
});

const routeTable = new RouteTable(stack, 'TestRouteTable', {
  name: 'Network-Endpoints-Default',
  vpc,
  tags: [],
});

const subnet = new Subnet(stack, 'TestSubnet', {
  name: 'Network-Endpoints-A',
  availabilityZone: `${stack.region}a`,
  ipv4CidrBlock: '10.1.0.0/24',
  mapPublicIpOnLaunch: true,
  routeTable,
  vpc,
  tags: [],
});

const securityGroup = new SecurityGroup(stack, 'TestSecurityGroup`', {
  securityGroupName: 'TestSecurityGroup',
  description: `AWS Private Endpoint Zone`,
  vpc,
  tags: [],
});

// Create the interface endpoint
const endpoint = new VpcEndpoint(stack, `TestVpcEndpoint`, {
  vpc,
  vpcEndpointType: cdk.aws_ec2.VpcEndpointType.INTERFACE,
  service: 'ec2',
  subnets: [subnet],
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
   * Number of RouteTable test
   */
  test(`${testNamePrefix} RouteTable resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::EC2::RouteTable', 1);
  });

  /**
   * Number of SecurityGroup test
   */
  test(`${testNamePrefix} SecurityGroup resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::EC2::SecurityGroup', 1);
  });

  /**
   * Number of Subnet test
   */
  test(`${testNamePrefix} SecurityGroup resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::EC2::Subnet', 1);
  });

  /**
   * Number of SubnetRouteTableAssociation test
   */
  test(`${testNamePrefix} SubnetRouteTableAssociation resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::EC2::SubnetRouteTableAssociation', 1);
  });

  /**
   * Number of VPC test
   */
  test(`${testNamePrefix} VPC resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::EC2::VPC', 1);
  });

  /**
   * Number of VPCEndpoint test
   */
  test(`${testNamePrefix} VPCEndpoint resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::EC2::VPCEndpoint', 1);
  });

  /**
   * Number of InternetGateway test
   */
  test(`${testNamePrefix} InternetGateway resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::EC2::InternetGateway', 1);
  });

  /**
   * Number of VPCGatewayAttachment test
   */
  test(`${testNamePrefix} VPCGatewayAttachment resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::EC2::VPCGatewayAttachment', 1);
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
                VPCId: {
                  Ref: 'TestVpcE77CE678',
                },
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
   * RouteTable resource configuration test
   */
  test(`${testNamePrefix} RouteTable resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TestRouteTableD3D1979F: {
          Type: 'AWS::EC2::RouteTable',
          Properties: {
            Tags: [
              {
                Key: 'Name',
                Value: 'Network-Endpoints-Default',
              },
            ],
            VpcId: {
              Ref: 'TestVpcE77CE678',
            },
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
            VpcId: {
              Ref: 'TestVpcE77CE678',
            },
          },
        },
      },
    });
  });

  /**
   * Subnet resource configuration test
   */
  test(`${testNamePrefix} Subnet resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TestSubnet7ABA0E56: {
          Type: 'AWS::EC2::Subnet',
          Properties: {
            AvailabilityZone: {
              'Fn::Join': [
                '',
                [
                  {
                    Ref: 'AWS::Region',
                  },
                  'a',
                ],
              ],
            },
            CidrBlock: '10.1.0.0/24',
            MapPublicIpOnLaunch: true,
            Tags: [
              {
                Key: 'Name',
                Value: 'Network-Endpoints-A',
              },
            ],
            VpcId: {
              Ref: 'TestVpcE77CE678',
            },
          },
        },
      },
    });
  });

  /**
   * SubnetRouteTableAssociation resource configuration test
   */
  test(`${testNamePrefix} SubnetRouteTableAssociation resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TestSubnetRouteTableAssociationFE267B30: {
          Type: 'AWS::EC2::SubnetRouteTableAssociation',
          Properties: {
            RouteTableId: {
              Ref: 'TestRouteTableD3D1979F',
            },
            SubnetId: {
              Ref: 'TestSubnet7ABA0E56',
            },
          },
        },
      },
    });
  });

  /**
   * VPC resource configuration test
   */
  test(`${testNamePrefix} VPC resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TestVpcE77CE678: {
          Type: 'AWS::EC2::VPC',
          Properties: {
            CidrBlock: '10.0.0.0/16',
            EnableDnsHostnames: false,
            EnableDnsSupport: true,
            InstanceTenancy: 'default',
            Tags: [
              {
                Key: 'Name',
                Value: 'Test',
              },
            ],
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
            SubnetIds: [
              {
                Ref: 'TestSubnet7ABA0E56',
              },
            ],
            VpcEndpointType: 'Interface',
            VpcId: {
              Ref: 'TestVpcE77CE678',
            },
          },
        },
      },
    });
  });

  /**
   * InternetGateway resource configuration test
   */
  test(`${testNamePrefix} InternetGateway resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TestVpcInternetGateway01360C82: {
          Type: 'AWS::EC2::InternetGateway',
        },
      },
    });
  });

  /**
   * VPCGatewayAttachment resource configuration test
   */
  test(`${testNamePrefix} VPCGatewayAttachment resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TestVpcInternetGatewayAttachment60E451D5: {
          Type: 'AWS::EC2::VPCGatewayAttachment',
          Properties: {
            InternetGatewayId: {
              Ref: 'TestVpcInternetGateway01360C82',
            },
            VpcId: {
              Ref: 'TestVpcE77CE678',
            },
          },
        },
      },
    });
  });
});
