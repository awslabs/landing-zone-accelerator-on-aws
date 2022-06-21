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
import { Account } from '../../index';

//import { SynthUtils } from '@aws-cdk/assert';

const testNamePrefix = 'Construct(Account): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new Account(stack, 'Account', {
  acceleratorConfigTable: new cdk.aws_dynamodb.Table(stack, 'ConfigTable', {
    partitionKey: { name: 'dataType', type: cdk.aws_dynamodb.AttributeType.STRING },
  }),
  commitId: 'abcd123456789',
  assumeRoleName: 'AWSControlTowerExecution',
  kmsKey: new cdk.aws_kms.Key(stack, 'CustomKey', {}),
  logRetentionInDays: 3653,
});

/**
 * Account construct test
 */
describe('Account', () => {
  // test(`${testNamePrefix} Snapshot Test`, () => {
  //   expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
  // });
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
   * Number of InviteAccountToOrganization custom resource test
   */
  test(`${testNamePrefix} InviteAccountsToOrganization custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::InviteAccountsToOrganization', 1);
  });

  /**
   * InviteAccountToOrganization custom resource configuration test
   */
  test(`${testNamePrefix} InviteAccountsToOrganization custom resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        Account0D856946: {
          Type: 'Custom::InviteAccountsToOrganization',
          UpdateReplacePolicy: 'Delete',
          DeletionPolicy: 'Delete',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomInviteAccountsToOrganizationCustomResourceProviderHandlerC9A5BAC1', 'Arn'],
            },
            commitId: 'abcd123456789',
            configTableName: {
              Ref: 'ConfigTable5CD72349',
            },
            partition: {
              Ref: 'AWS::Partition',
            },
            assumeRoleName: 'AWSControlTowerExecution',
          },
        },
      },
    });
  });

  /**
   * Lambda Function resource configuration test
   */
  test(`${testNamePrefix} Lambda Function resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomInviteAccountsToOrganizationCustomResourceProviderHandlerC9A5BAC1: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomInviteAccountsToOrganizationCustomResourceProviderRole88663193'],
          Properties: {
            Code: {
              S3Bucket: {
                'Fn::Sub': 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
              },
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': ['CustomInviteAccountsToOrganizationCustomResourceProviderRole88663193', 'Arn'],
            },
            Runtime: 'nodejs14.x',
            Timeout: 900,
          },
        },
      },
    });
  });

  /**
   * Lambda Function resource configuration test
   */
  test(`${testNamePrefix} Lambda Function resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomInviteAccountsToOrganizationCustomResourceProviderRole88663193: {
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
                        'organizations:AcceptHandshake',
                        'organizations:ListAccounts',
                        'organizations:InviteAccountToOrganization',
                        'organizations:MoveAccount',
                        'organizations:ListRoots',
                      ],
                      Effect: 'Allow',
                      Resource: '*',
                    },
                    {
                      Action: ['dynamodb:Query'],
                      Effect: 'Allow',
                      Resource: [
                        {
                          'Fn::GetAtt': ['ConfigTable5CD72349', 'Arn'],
                        },
                      ],
                    },
                    {
                      Action: ['sts:AssumeRole'],
                      Effect: 'Allow',
                      Resource: [
                        {
                          'Fn::Join': [
                            '',
                            ['arn:', { Ref: 'AWS::Partition' }, ':iam::*:role/AWSControlTowerExecution'],
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
});
