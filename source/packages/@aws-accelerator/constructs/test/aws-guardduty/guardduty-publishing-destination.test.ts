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
import { GuardDutyPublishingDestination } from '../../lib/aws-guardduty/guardduty-publishing-destination';

const testNamePrefix = 'Construct(GuardDutyPublishingDestination): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new GuardDutyPublishingDestination(stack, 'GuardDutyPublishingDestination', {
  bucketArn: `arn:${stack.partition}:s3:::aws-accelerator-org-gduty-pub-dest-${stack.account}-${stack.region}`,
  exportDestinationType: 'S3',
  kmsKey: new cdk.aws_kms.Key(stack, 'CustomKey', {}),
  logRetentionInDays: 3653,
});

/**
 * GuardDutyPublishingDestination construct test
 */
describe('GuardDutyPublishingDestination', () => {
  /**
   * Number of IAM role resource test
   */
  test(`${testNamePrefix} IAM role resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::IAM::Role', 1);
  });

  /**
   * Number of Lambda function resource test
   */
  test(`${testNamePrefix} Lambda function resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Lambda::Function', 1);
  });

  /**
   * Number of GuardDutyCreatePublishingDestinationCommand custom resource test
   */
  test(`${testNamePrefix} GuardDutyCreatePublishingDestinationCommand custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::GuardDutyCreatePublishingDestinationCommand', 1);
  });

  /**
   * Lambda Function resource configuration test
   */
  test(`${testNamePrefix} Lambda Function resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomGuardDutyCreatePublishingDestinationCommandCustomResourceProviderHandlerB3AE4CE8: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomGuardDutyCreatePublishingDestinationCommandCustomResourceProviderRoleD01DD26B'],
          Properties: {
            Code: {
              S3Bucket: {
                'Fn::Sub': 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
              },
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': [
                'CustomGuardDutyCreatePublishingDestinationCommandCustomResourceProviderRoleD01DD26B',
                'Arn',
              ],
            },
            Runtime: 'nodejs14.x',
            Timeout: 900,
          },
        },
      },
    });
  });

  /**
   * IAM role resource configuration test
   */
  test(`${testNamePrefix} IAM role resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomGuardDutyCreatePublishingDestinationCommandCustomResourceProviderRoleD01DD26B: {
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
                        'guardDuty:CreateDetector',
                        'guardDuty:CreatePublishingDestination',
                        'guardDuty:DeletePublishingDestination',
                        'guardDuty:ListDetectors',
                        'guardDuty:ListPublishingDestinations',
                        'iam:CreateServiceLinkedRole',
                      ],
                      Effect: 'Allow',
                      Resource: '*',
                      Sid: 'GuardDutyCreatePublishingDestinationCommandTaskGuardDutyActions',
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
   * GuardDutyCreatePublishingDestinationCommand custom resource configuration test
   */
  test(`${testNamePrefix} GuardDutyCreatePublishingDestinationCommand custom resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        GuardDutyPublishingDestination52AE4412: {
          Type: 'Custom::GuardDutyCreatePublishingDestinationCommand',
          UpdateReplacePolicy: 'Delete',
          DeletionPolicy: 'Delete',
          DependsOn: ['CustomGuardDutyCreatePublishingDestinationCommandCustomResourceProviderLogGroup118A06DB'],
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': [
                'CustomGuardDutyCreatePublishingDestinationCommandCustomResourceProviderHandlerB3AE4CE8',
                'Arn',
              ],
            },
            exportDestinationType: 'S3',
            kmsKeyArn: {
              'Fn::GetAtt': ['CustomKey1E6D0D07', 'Arn'],
            },
            region: {
              Ref: 'AWS::Region',
            },
          },
        },
      },
    });
  });
});
