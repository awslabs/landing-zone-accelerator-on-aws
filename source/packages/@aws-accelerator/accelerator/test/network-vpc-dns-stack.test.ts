import * as cdk from 'aws-cdk-lib';
import * as path from 'path';

import { AcceleratorStackNames } from '../lib/accelerator';
import { AcceleratorStage } from '../lib/accelerator-stage';
import { AcceleratorStackProps } from '../lib/stacks/accelerator-stack';
import { NetworkVpcDnsStack } from '../lib/stacks/network-vpc-dns-stack';
import {
  ACCOUNT_CONFIG,
  GLOBAL_CONFIG,
  IAM_CONFIG,
  NETWORK_CONFIG,
  ORGANIZATION_CONFIG,
  SECURITY_CONFIG,
} from './configs/test-config';

const testNamePrefix = 'Construct(NetworkVpcDnsStack): ';

/**
 * NetworkVpcEndpointsStack
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

const stack = new NetworkVpcDnsStack(
  app,
  `${AcceleratorStackNames[AcceleratorStage.NETWORK_VPC_DNS]}-${env.account}-${env.region}`,
  props,
);

/**
 * NetworkVpcDnsStack construct test
 */
describe('NetworkVpcDnsStack', () => {
  /**
   * Number of SsmGetParameterValue custom resource test
   */
  test(`${testNamePrefix} SsmGetParameterValue custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::SsmGetParameterValue', 1);
  });

  /**
   * Number of Lambda function resource test
   */
  test(`${testNamePrefix} Lambda function resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Lambda::Function', 1);
  });

  /**
   * Number of Lambda function IAM role resource test
   */
  test(`${testNamePrefix} Lambda function IAM role resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::IAM::Role', 1);
  });

  /**
   * Number of SSM parameter resource test
   */
  test(`${testNamePrefix} SSM parameter custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::SSM::Parameter', 2);
  });

  /**
   * CustomSsmGetParameterValue resource configuration test
   */
  test(`${testNamePrefix} CustomSsmGetParameterValue resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        AcceleratorKeyLookup0C18DA36: {
          Type: 'Custom::SsmGetParameterValue',
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
                  { Ref: 'AWS::Partition' },
                  ':iam::222222222222:role/AWSAccelerator-CrossAccount-SsmParameter-Role',
                ],
              ],
            },
            invokingAccountID: '333333333333',
            parameterAccountID: '222222222222',
            parameterName: '/accelerator/kms/key-arn',
            region: 'us-east-1',
          },
        },
      },
    });
  });

  /**
   * Lambda function IAM role resource configuration test
   */
  test(`${testNamePrefix} Lambda function IAM role CustomSsmGetParameterValue resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomSsmGetParameterValueCustomResourceProviderRoleB3AFDDB2: {
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
                      Action: ['ssm:GetParameters', 'ssm:GetParameter', 'ssm:DescribeParameters'],
                      Effect: 'Allow',
                      Resource: ['*'],
                    },
                    {
                      Action: ['sts:AssumeRole'],
                      Effect: 'Allow',
                      Resource: [
                        {
                          'Fn::Join': [
                            '',
                            [
                              'arn:',
                              { Ref: 'AWS::Partition' },
                              ':iam::222222222222:role/AWSAccelerator-CrossAccount-SsmParameter-Role',
                            ],
                          ],
                        },
                      ],
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
   * Lambda function resource configuration test
   */
  test(`${testNamePrefix} Lambda function resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomSsmGetParameterValueCustomResourceProviderHandlerAAD0E7EE: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomSsmGetParameterValueCustomResourceProviderRoleB3AFDDB2'],
          Properties: {
            Code: {
              S3Bucket: 'cdk-hnb659fds-assets-333333333333-us-east-1',
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': ['CustomSsmGetParameterValueCustomResourceProviderRoleB3AFDDB2', 'Arn'],
            },
            Runtime: 'nodejs14.x',
            Timeout: 900,
          },
        },
      },
    });
  });

  /**
   * CloudWatch log group resource configuration test
   */
  test(`${testNamePrefix} CloudWatch log group resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomSsmGetParameterValueCustomResourceProviderLogGroup780D220D: {
          Type: 'AWS::Logs::LogGroup',
          Properties: {
            LogGroupName: {
              'Fn::Join': [
                '',
                ['/aws/lambda/', { Ref: 'CustomSsmGetParameterValueCustomResourceProviderHandlerAAD0E7EE' }],
              ],
            },
            RetentionInDays: 3653,
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
            Name: '/accelerator/AWSAccelerator-NetworkVpcDnsStack-333333333333-us-east-1/stack-id',
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
