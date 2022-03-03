import * as cdk from 'aws-cdk-lib';
import { SynthUtils } from '@aws-cdk/assert';
import { Vpc } from '../../lib/aws-ec2/vpc';

const testNamePrefix = 'Construct(Vpc): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new Vpc(stack, 'TestVpc', {
  name: 'Main',
  ipv4CidrBlock: '10.0.0.0/16',
  internetGateway: true,
  enableDnsHostnames: false,
  enableDnsSupport: true,
  instanceTenancy: 'default',
});

/**
 * Vpc construct test
 */
describe('Vpc', () => {
  /**
   * Snapshot test
   */
  test(`${testNamePrefix} Snapshot Test`, () => {
    expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
  });

  /**
   * Number of VPC test
   */
  test(`${testNamePrefix} VPC count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::EC2::VPC', 1);
  });

  /**
   * Number of InternetGateway test
   */
  test(`${testNamePrefix} InternetGateway count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::EC2::InternetGateway', 1);
  });

  /**
   * Number of VPCGatewayAttachment test
   */
  test(`${testNamePrefix} VPCGatewayAttachment count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::EC2::VPCGatewayAttachment', 1);
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
                Value: 'Main',
              },
            ],
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
