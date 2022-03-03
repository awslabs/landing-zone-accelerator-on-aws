import * as cdk from 'aws-cdk-lib';
import { HostedZone, Vpc } from '../../index';
import { SynthUtils } from '@aws-cdk/assert';

const testNamePrefix = 'Construct(HostedZone): ';

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

new HostedZone(stack, `TestHostedZone`, {
  hostedZoneName,
  vpc,
});

/**
 * HostedZone construct test
 */
describe('SecurityHubMembers', () => {
  /**
   * Snapshot test
   */
  test(`${testNamePrefix} Snapshot Test`, () => {
    expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
  });

  /**
   * Number of hosted zone test
   */
  test(`${testNamePrefix} Hosted zone count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Route53::HostedZone', 1);
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

  //End of file
});
