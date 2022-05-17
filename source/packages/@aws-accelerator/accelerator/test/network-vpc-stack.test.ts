import * as cdk from 'aws-cdk-lib';
import * as path from 'path';

import { AcceleratorStackNames } from '../lib/accelerator';
import { AcceleratorStage } from '../lib/accelerator-stage';
import { AcceleratorStackProps } from '../lib/stacks/accelerator-stack';
import { NetworkVpcStack } from '../lib/stacks/network-vpc-stack';
import {
  ACCOUNT_CONFIG,
  GLOBAL_CONFIG,
  IAM_CONFIG,
  NETWORK_CONFIG,
  ORGANIZATION_CONFIG,
  SECURITY_CONFIG,
} from './configs/test-config';

const testNamePrefix = 'Construct(NetworkVpcStack): ';

/**
 * NetworkVpcStack
 */
const app = new cdk.App({
  context: { 'config-dir': path.join(__dirname, 'configs') },
});
const configDirPath = app.node.tryGetContext('config-dir');

const env = {
  account: '333333333333',
  region: 'us-east-1',
};

const props: AcceleratorStackProps = {
  env,
  configDirPath,
  accountsConfig: ACCOUNT_CONFIG,
  globalConfig: GLOBAL_CONFIG,
  iamConfig: IAM_CONFIG,
  networkConfig: NETWORK_CONFIG,
  organizationConfig: ORGANIZATION_CONFIG,
  securityConfig: SECURITY_CONFIG,
  partition: 'aws',
};

const stack = new NetworkVpcStack(
  app,
  `${AcceleratorStackNames[AcceleratorStage.NETWORK_VPC]}-${env.account}-${env.region}`,
  props,
);

/**
 * NetworkVpcStack construct test
 */
describe('NetworkVpcStack', () => {
  /**
   * Number of Lambda function resource test
   */
  test(`${testNamePrefix} Lambda function resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Lambda::Function', 2);
  });

  /**
   * Number of Lambda function IAM role resource test
   */
  test(`${testNamePrefix} Lambda function IAM role resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::IAM::Role', 2);
  });

  /**
   * Number of DeleteDefaultVpc custom resource test
   */
  test(`${testNamePrefix} DeleteDefaultVpc custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::DeleteDefaultVpc', 1);
  });

  /**
   * Number of SSM parameter resource test
   */
  test(`${testNamePrefix} SSM parameter custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::SSM::Parameter', 3);
  });

  /**
   * Number of Prefix Lists resource test
   */
  test(`${testNamePrefix} Prefix List custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::EC2::PrefixList', 1);
  });

  /**
   * Lambda function CustomDeleteDefaultVpcCustomResourceProviderHandler resource configuration test
   */
  test(`${testNamePrefix} Lambda function CustomDeleteDefaultVpcCustomResourceProviderHandler resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomDeleteDefaultVpcCustomResourceProviderHandler87E89F35: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomDeleteDefaultVpcCustomResourceProviderRole80963EEF'],
          Properties: {
            Code: {
              S3Bucket: 'cdk-hnb659fds-assets-333333333333-us-east-1',
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': ['CustomDeleteDefaultVpcCustomResourceProviderRole80963EEF', 'Arn'],
            },
            Runtime: 'nodejs14.x',
            Timeout: 900,
          },
        },
      },
    });
  });

  /**
   * Lambda function IAM role CustomDeleteDefaultVpcCustomResourceProviderRole resource configuration test
   */
  test(`${testNamePrefix} Lambda function IAM role CustomDeleteDefaultVpcCustomResourceProviderRole resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomDeleteDefaultVpcCustomResourceProviderRole80963EEF: {
          Type: 'AWS::IAM::Role',
          Properties: {
            AssumeRolePolicyDocument: {
              Statement: [
                {
                  Action: 'sts:AssumeRole',
                  Effect: 'Allow',
                  Principal: {
                    Service: 'lambda.amazonaws.com',
                  },
                },
              ],
              Version: '2012-10-17',
            },
            ManagedPolicyArns: [
              {
                'Fn::Sub': 'arn:${AWS::Partition}:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
              },
            ],
            Policies: [
              {
                PolicyDocument: {
                  Statement: [
                    {
                      Action: [
                        'ec2:DeleteInternetGateway',
                        'ec2:DetachInternetGateway',
                        'ec2:DeleteNetworkAcl',
                        'ec2:DeleteRoute',
                        'ec2:DeleteSecurityGroup',
                        'ec2:DeleteSubnet',
                        'ec2:DeleteVpc',
                        'ec2:DescribeInternetGateways',
                        'ec2:DescribeNetworkAcls',
                        'ec2:DescribeRouteTables',
                        'ec2:DescribeSecurityGroups',
                        'ec2:DescribeSubnets',
                        'ec2:DescribeVpcs',
                      ],
                      Effect: 'Allow',
                      Resource: '*',
                    },
                  ],
                  Version: '2012-10-17',
                },
                PolicyName: 'Inline',
              },
            ],
          },
        },
      },
    });
  });

  /**
   * DeleteDefaultVpc custom resource configuration test
   */
  test(`${testNamePrefix} DeleteDefaultVpc custom resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        DeleteDefaultVpc4DBAE36C: {
          Type: 'Custom::DeleteDefaultVpc',
          UpdateReplacePolicy: 'Delete',
          DeletionPolicy: 'Delete',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomDeleteDefaultVpcCustomResourceProviderHandler87E89F35', 'Arn'],
            },
          },
        },
      },
    });
  });

  /**
   * SSM parameter SsmParamStackId resource configuration test
   */
  test(`${testNamePrefix} SSM parameter SsmParamStackId resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        SsmParamStackId521A78D3: {
          Type: 'AWS::SSM::Parameter',
          Properties: {
            Name: '/accelerator/AWSAccelerator-NetworkVpcStack-333333333333-us-east-1/stack-id',
            Type: 'String',
            Value: {
              Ref: 'AWS::StackId',
            },
          },
        },
      },
    });
  });
});
