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

const testNamePrefix = 'Construct(NetworkVpcDnsStack): ';

/**
 * NetworkVpcEndpointsStack
 */
const acceleratorTestStacks = new AcceleratorSynthStacks(AcceleratorStage.NETWORK_VPC_DNS, 'all-enabled', 'aws');
const stack = acceleratorTestStacks.stacks.get(`Network-us-east-1`)!;

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
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Lambda::Function', 2);
  });

  /**
   * Number of Lambda function IAM role resource test
   */
  test(`${testNamePrefix} Lambda function IAM role resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::IAM::Role', 2);
  });

  /**
   * Number of SSM parameter resource test
   */
  test(`${testNamePrefix} SSM parameter custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::SSM::Parameter', 10);
  });

  /**
   * CustomSsmGetParameterValue resource configuration test
   */
  test(`${testNamePrefix} CustomSsmGetParameterValue resource configuration test`, () => {
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
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomSsmGetParameterValueCustomResourceProviderHandlerAAD0E7EE: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomSsmGetParameterValueCustomResourceProviderRoleB3AFDDB2'],
          Properties: {
            Code: {
              S3Bucket: 'cdk-hnb659fds-assets-555555555555-us-east-1',
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
});
