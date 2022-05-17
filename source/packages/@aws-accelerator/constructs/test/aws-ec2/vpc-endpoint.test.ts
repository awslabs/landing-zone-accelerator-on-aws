import * as cdk from 'aws-cdk-lib';

import { SynthUtils } from '@aws-cdk/assert';

import { SecurityGroup } from '../../lib/aws-ec2/vpc';
import { VpcEndpoint } from '../../lib/aws-ec2/vpc-endpoint';

const testNamePrefix = 'Construct(VpcEndpoint): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

const securityGroup = new SecurityGroup(stack, 'TestSecurityGroup`', {
  securityGroupName: 'TestSecurityGroup',
  description: `AWS Private Endpoint Zone`,
  vpcId: 'Test',
});

new VpcEndpoint(stack, 'VpcEndpoint', {
  vpcId: 'Test',
  vpcEndpointType: cdk.aws_ec2.VpcEndpointType.GATEWAY,
  service: 'service',
  subnets: ['Test1', 'Test2'],
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
  routeTables: ['Test1', 'Test2'],
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
   * VPC endpoint resource configuration test
   */
  test(`${testNamePrefix} VPC endpoint resource configuration test`, () => {
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
            RouteTableIds: ['Test1', 'Test2'],
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
            VpcId: 'Test',
          },
        },
      },
    });
  });
});
