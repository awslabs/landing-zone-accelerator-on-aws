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
import { MacieSession } from '../../index';

const testNamePrefix = 'Construct(MacieSession): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new MacieSession(stack, 'MacieSession', {
  isSensitiveSh: true,
  findingPublishingFrequency: 'FIFTEEN_MINUTES',
  logRetentionInDays: 3653,
  kmsKey: new cdk.aws_kms.Key(stack, 'Key', {}),
});
/**
 * MacieSession construct test
 */
describe('MacieSession', () => {
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
   * Number of MacieEnableMacie custom resource test
   */
  test(`${testNamePrefix} MacieEnableMacie custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::MacieEnableMacie', 1);
  });

  /**
   * Lambda Function resource configuration test
   */
  test(`${testNamePrefix} Lambda Function resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomMacieEnableMacieCustomResourceProviderHandler1B3444A0: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomMacieEnableMacieCustomResourceProviderRole2B29C97C'],
          Properties: {
            Code: {
              S3Bucket: {
                'Fn::Sub': 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
              },
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': ['CustomMacieEnableMacieCustomResourceProviderRole2B29C97C', 'Arn'],
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
        CustomMacieEnableMacieCustomResourceProviderRole2B29C97C: {
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
                        'macie2:DisableMacie',
                        'macie2:EnableMacie',
                        'macie2:GetMacieSession',
                        'macie2:PutFindingsPublicationConfiguration',
                        'macie2:UpdateMacieSession',
                      ],
                      Effect: 'Allow',
                      Resource: '*',
                      Sid: 'MacieEnableMacieTaskMacieActions',
                    },
                    {
                      Action: ['iam:CreateServiceLinkedRole'],
                      Condition: {
                        StringLikeIfExists: {
                          'iam:CreateServiceLinkedRole': ['macie.amazonaws.com'],
                        },
                      },
                      Effect: 'Allow',
                      Resource: '*',
                      Sid: 'MacieEnableMacieTaskIamAction',
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
   * MacieEnableMacie custom resource configuration test
   */
  test(`${testNamePrefix} MacieEnableMacie custom resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        MacieSession011BCE74: {
          Type: 'Custom::MacieEnableMacie',
          DeletionPolicy: 'Delete',
          UpdateReplacePolicy: 'Delete',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomMacieEnableMacieCustomResourceProviderHandler1B3444A0', 'Arn'],
            },
            findingPublishingFrequency: 'FIFTEEN_MINUTES',
            isSensitiveSh: true,
            region: {
              Ref: 'AWS::Region',
            },
          },
        },
      },
    });
  });
});
