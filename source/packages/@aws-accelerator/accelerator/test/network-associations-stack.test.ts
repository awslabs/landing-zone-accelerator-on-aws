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

const testNamePrefix = 'Construct(NetworkAssociationsStack): ';

const acceleratorTestStacks = new AcceleratorSynthStacks(AcceleratorStage.NETWORK_ASSOCIATIONS, 'all-enabled', 'aws');
const stack = acceleratorTestStacks.stacks.get(`Management-us-east-1`)!;

/**
 * NetworkAssociationsStack construct test
 */
describe('NetworkAssociationsStack', () => {
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
  test(`${testNamePrefix} SSM parameter resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::SSM::Parameter', 2);
  });

  /**
   * Number of AWS Logs group resource test
   */
  test(`${testNamePrefix} AWS Logs group resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Logs::LogGroup', 1);
  });

  /**
   * Number of Custom::SsmGetParameterValue resource test
   */
  test(`${testNamePrefix} CCustom::SsmGetParameterValue resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::SsmGetParameterValue', 1);
  });

  /**
   * Lambda function CustomSsmGetParameterValueCustomResourceProviderHandler resource configuration test
   */
  test(`${testNamePrefix} Lambda function CustomSsmGetParameterValueCustomResourceProviderHandler resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomSsmGetParameterValueCustomResourceProviderHandlerAAD0E7EE: {
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
          Type: 'AWS::Lambda::Function',
        },
      },
    });
  });

  /**
   * Lambda function IAM role CustomGetTransitGatewayAttachmentCustomResourceProviderRole resource configuration test
   */
  test(`${testNamePrefix} Lambda function IAM role CustomGetTransitGatewayAttachmentCustomResourceProviderRole resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomSsmGetParameterValueCustomResourceProviderRoleB3AFDDB2: {
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
                              ':iam::*:role/AWSAccelerator*',
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
          Type: 'AWS::IAM::Role',
        },
      },
    });
  });

  /**
   * SSM parameter SsmParamAcceleratorVersion resource configuration test
   */
  test(`${testNamePrefix} SSM parameter SsmParamAcceleratorVersion resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        SsmParamAcceleratorVersionFF83282D: {
          Properties: {
            Name: '/accelerator/AWSAccelerator-NetworkAssociationsStack-111111111111-us-east-1/version',
            Type: 'String',
            Value: '1.1.0',
          },
          Type: 'AWS::SSM::Parameter',
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
          Properties: {
            Name: '/accelerator/AWSAccelerator-NetworkAssociationsStack-111111111111-us-east-1/stack-id',
            Type: 'String',
            Value: {
              Ref: 'AWS::StackId',
            },
          },
          Type: 'AWS::SSM::Parameter',
        },
      },
    });
  });

  /**
   * CustomSsmGetParameterValueCustomResourceProviderLogGroup resource configuration test
   */
  test(`${testNamePrefix} CustomSsmGetParameterValueCustomResourceProviderLogGroup resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomSsmGetParameterValueCustomResourceProviderLogGroup780D220D: {
          DeletionPolicy: 'Delete',
          Properties: {
            LogGroupName: {
              'Fn::Join': [
                '',
                [
                  '/aws/lambda/',
                  {
                    Ref: 'CustomSsmGetParameterValueCustomResourceProviderHandlerAAD0E7EE',
                  },
                ],
              ],
            },
            RetentionInDays: 3653,
          },
          Type: 'AWS::Logs::LogGroup',
          UpdateReplacePolicy: 'Delete',
        },
      },
    });
  });
  /**
   * AcceleratorKeyLookup resource configuration test
   */
  test(`${testNamePrefix} AcceleratorKeyLookup resource configuration test`, () => {
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
            invokingAccountID: '111111111111',
            invokingRegion: 'us-east-1',
            parameterAccountID: '222222222222',
            parameterName: '/accelerator/kms/key-arn',
            parameterRegion: 'us-east-1',
          },
          Type: 'Custom::SsmGetParameterValue',
          UpdateReplacePolicy: 'Delete',
        },
      },
    });
  });
});
