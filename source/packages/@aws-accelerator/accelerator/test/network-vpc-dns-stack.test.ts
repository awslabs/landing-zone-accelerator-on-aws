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

import {
  AccountsConfig,
  GlobalConfig,
  IamConfig,
  NetworkConfig,
  OrganizationConfig,
  SecurityConfig,
} from '@aws-accelerator/config';
import * as cdk from 'aws-cdk-lib';
import * as path from 'path';
import { AcceleratorStackNames } from '../lib/accelerator';
import { AcceleratorStage } from '../lib/accelerator-stage';
import { AcceleratorStackProps } from '../lib/stacks/accelerator-stack';
import { NetworkVpcDnsStack } from '../lib/stacks/network-vpc-dns-stack';

const testNamePrefix = 'Construct(NetworkVpcDnsStack): ';

/**
 * NetworkVpcEndpointsStack
 */
const app = new cdk.App({
  context: { 'config-dir': path.join(__dirname, 'configs/all-enabled') },
});
const configDirPath = app.node.tryGetContext('config-dir');

const props: AcceleratorStackProps = {
  configDirPath,
  accountsConfig: AccountsConfig.load(configDirPath),
  globalConfig: GlobalConfig.load(configDirPath),
  iamConfig: IamConfig.load(configDirPath),
  networkConfig: NetworkConfig.load(configDirPath),
  organizationConfig: OrganizationConfig.load(configDirPath),
  securityConfig: SecurityConfig.load(configDirPath),
  partition: 'aws',
};

/**
 * Build all related stacks
 */
const stacks = new Map<string, NetworkVpcDnsStack>();

for (const region of props.globalConfig.enabledRegions) {
  for (const account of [...props.accountsConfig.mandatoryAccounts, ...props.accountsConfig.workloadAccounts]) {
    const accountId = props.accountsConfig.getAccountId(account.name);

    stacks.set(
      `${account.name}-${region}`,
      new NetworkVpcDnsStack(app, `${AcceleratorStackNames[AcceleratorStage.NETWORK_VPC]}-${accountId}-${region}`, {
        env: {
          account: accountId,
          region,
        },
        ...props,
      }),
    );
  }
}

/**
 * NetworkVpcDnsStack construct test
 */
describe('NetworkVpcDnsStack', () => {
  /**
   * Number of SsmGetParameterValue custom resource test
   */
  test(`${testNamePrefix} SsmGetParameterValue custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stacks.get(`Management-us-east-1`)!).resourceCountIs(
      'Custom::SsmGetParameterValue',
      1,
    );
  });

  /**
   * Number of Lambda function resource test
   */
  test(`${testNamePrefix} Lambda function resource count test`, () => {
    cdk.assertions.Template.fromStack(stacks.get(`Management-us-east-1`)!).resourceCountIs('AWS::Lambda::Function', 1);
  });

  /**
   * Number of Lambda function IAM role resource test
   */
  test(`${testNamePrefix} Lambda function IAM role resource count test`, () => {
    cdk.assertions.Template.fromStack(stacks.get(`Management-us-east-1`)!).resourceCountIs('AWS::IAM::Role', 1);
  });

  /**
   * Number of SSM parameter resource test
   */
  test(`${testNamePrefix} SSM parameter custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stacks.get(`Management-us-east-1`)!).resourceCountIs('AWS::SSM::Parameter', 2);
  });

  /**
   * CustomSsmGetParameterValue resource configuration test
   */
  test(`${testNamePrefix} CustomSsmGetParameterValue resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stacks.get(`Management-us-east-1`)!).templateMatches({
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
            invokingAccountID: '111111111111',
            region: 'us-east-1',
            parameterAccountID: '222222222222',
            parameterName: '/accelerator/kms/key-arn',
          },
        },
      },
    });
  });

  /**
   * Lambda function IAM role resource configuration test
   */
  test(`${testNamePrefix} Lambda function IAM role CustomSsmGetParameterValue resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stacks.get(`Management-us-east-1`)!).templateMatches({
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
                      Sid: 'SsmGetParameterActions',
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
                              {
                                Ref: 'AWS::Partition',
                              },
                              ':iam::222222222222:role/AWSAccelerator-CrossAccount-SsmParameter-Role',
                            ],
                          ],
                        },
                      ],
                      Sid: 'StsAssumeRoleActions',
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
    cdk.assertions.Template.fromStack(stacks.get(`Management-us-east-1`)!).templateMatches({
      Resources: {
        CustomSsmGetParameterValueCustomResourceProviderHandlerAAD0E7EE: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomSsmGetParameterValueCustomResourceProviderRoleB3AFDDB2'],
          Properties: {
            Code: {
              S3Bucket: 'cdk-hnb659fds-assets-111111111111-us-east-1',
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
    cdk.assertions.Template.fromStack(stacks.get(`Management-us-east-1`)!).templateMatches({
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

  // /**
  //  * SSM parameter SsmParamStackId resource configuration test
  //  */
  // test(`${testNamePrefix} SSM parameter SsmParamStackId resource configuration test`, () => {
  //   cdk.assertions.Template.fromStack(stacks.get(`Management-us-east-1`)!).templateMatches({
  //     Resources: {
  //       SsmParamStackId521A78D3: {
  //         Type: 'AWS::SSM::Parameter',
  //         Properties: {
  //           Name: '/accelerator/AWSAccelerator-NetworkVpcDnsStack-111111111111-us-east-1/stack-id',
  //           Type: 'String',
  //           Value: {
  //             Ref: 'AWS::StackId',
  //           },
  //         },
  //       },
  //     },
  //   });
  // });
});
