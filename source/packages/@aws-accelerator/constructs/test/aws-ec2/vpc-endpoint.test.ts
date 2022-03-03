import * as cdk from 'aws-cdk-lib';
import { SynthUtils } from '@aws-cdk/assert';
import { VpcEndpoint } from '../../lib/aws-ec2/vpc-endpoint';
import { SecurityGroup, Subnet, Vpc } from '../../lib/aws-ec2/vpc';
import { RouteTable } from '../../lib/aws-ec2/route-table';

const testNamePrefix = 'Construct(VpcEndpoint): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

const vpc = new Vpc(stack, 'TestVpc', {
  name: 'Main',
  ipv4CidrBlock: '10.0.0.0/16',
  internetGateway: true,
  enableDnsHostnames: false,
  enableDnsSupport: true,
  instanceTenancy: 'default',
});

const securityGroup = new SecurityGroup(stack, 'TestSecurityGroup`', {
  securityGroupName: 'TestSecurityGroup',
  description: `AWS Private Endpoint Zone`,
  vpc,
});

const routeTable = new RouteTable(stack, 'TestRouteTable', {
  name: 'Network-Endpoints-Default',
  vpc,
});

const subnet = new Subnet(stack, 'TestSubnet', {
  name: 'Network-Endpoints-A',
  availabilityZone: `${stack.region}a`,
  ipv4CidrBlock: '10.1.0.0/24',
  mapPublicIpOnLaunch: true,
  routeTable,
  vpc,
});

new VpcEndpoint(stack, 'VpcEndpoint', {
  vpc: vpc,
  vpcEndpointType: cdk.aws_ec2.VpcEndpointType.GATEWAY,
  service: 'service',
  subnets: [subnet],
  securityGroups: [securityGroup],
  privateDnsEnabled: true,
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
  routeTables: [routeTable],
});

/**
 * VpcEndpoint construct test
 */
describe('VpcEndpoint', () => {
  /**
   * Snapshot test
   */
  test(`${testNamePrefix} Snapshot Test`, () => {
    expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
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
   * Number of VPCEndpoint test
   */
  test(`${testNamePrefix} VPCEndpoint resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::EC2::VPCEndpoint', 1);
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
        VpcEndpoint80208C18: {
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
            RouteTableIds: [
              {
                Ref: 'TestRouteTableD3D1979F',
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
                  '.service',
                ],
              ],
            },
            VpcId: {
              Ref: 'TestVpcE77CE678',
            },
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
        VpcEndpoint80208C18: {
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
            RouteTableIds: [
              {
                Ref: 'TestRouteTableD3D1979F',
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
                  '.service',
                ],
              ],
            },
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
