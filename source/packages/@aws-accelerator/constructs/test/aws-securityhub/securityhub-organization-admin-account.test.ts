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

import { SecurityHubOrganizationAdminAccount } from '../../index';

const testNamePrefix = 'Construct(SecurityHubOrganizationAdminAccount): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new SecurityHubOrganizationAdminAccount(stack, 'SecurityHubOrganizationAdminAccount', {
  adminAccountId: stack.account,
  kmsKey: new cdk.aws_kms.Key(stack, 'CustomKey', {}),
  logRetentionInDays: 3653,
});

/**
 * SecurityHubOrganizationAdminAccount construct test
 */
describe('SecurityHubOrganizationAdminAccount', () => {
  /**
   * Number of IAM role test
   */
  test(`${testNamePrefix} IAM role count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::IAM::Role', 1);
  });

  /**
   * Number of Lambda function test
   */
  test(`${testNamePrefix} Lambda function count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Lambda::Function', 1);
  });

  /**
   * Number of CustomResource test
   */
  test(`${testNamePrefix} CustomResource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::SecurityHubEnableOrganizationAdminAccount', 1);
  });

  /**
   * EnableOrganizationAdminAccount custom resource lambda function configuration test
   */
  test(`${testNamePrefix} EnableOrganizationAdminAccount custom resource lambda function configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomSecurityHubEnableOrganizationAdminAccountCustomResourceProviderHandler194C30B9: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomSecurityHubEnableOrganizationAdminAccountCustomResourceProviderRole1CBC866F'],
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
                'CustomSecurityHubEnableOrganizationAdminAccountCustomResourceProviderRole1CBC866F',
                'Arn',
              ],
            },
            Runtime: 'nodejs14.x',
            Timeout: 180,
          },
        },
      },
    });
  });

  /**
   * EnableOrganizationAdminAccount custom resource iam role test
   */
  test(`${testNamePrefix} EnableOrganizationAdminAccount custom resource iam role test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomSecurityHubEnableOrganizationAdminAccountCustomResourceProviderRole1CBC866F: {
          Type: 'AWS::IAM::Role',
          // UpdateReplacePolicy: 'Retain',
          // DeletionPolicy: 'Retain',
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
                        'organizations:DescribeOrganization',
                        'organizations:ListAccounts',
                        'organizations:ListDelegatedAdministrators',
                      ],
                      Effect: 'Allow',
                      Resource: '*',
                      Sid: 'SecurityHubEnableOrganizationAdminAccountTaskOrganizationActions',
                    },
                    {
                      Action: 'organizations:EnableAWSServiceAccess',
                      Condition: {
                        StringEquals: {
                          'organizations:ServicePrincipal': 'securityhub.amazonaws.com',
                        },
                      },
                      Effect: 'Allow',
                      Resource: '*',
                    },
                    {
                      Action: [
                        'organizations:RegisterDelegatedAdministrator',
                        'organizations:DeregisterDelegatedAdministrator',
                      ],
                      Condition: {
                        StringEquals: {
                          'organizations:ServicePrincipal': 'securityhub.amazonaws.com',
                        },
                      },
                      Effect: 'Allow',
                      Resource: {
                        'Fn::Join': [
                          '',
                          [
                            'arn:',
                            {
                              Ref: 'AWS::Partition',
                            },
                            ':organizations::*:account/o-*/*',
                          ],
                        ],
                      },
                    },
                    {
                      Action: ['iam:CreateServiceLinkedRole'],
                      Condition: {
                        StringLike: {
                          'iam:AWSServiceName': ['securityhub.amazonaws.com'],
                        },
                      },
                      Effect: 'Allow',
                      Resource: '*',
                      Sid: 'SecurityHubCreateMembersTaskIamAction',
                    },
                    {
                      Action: [
                        'securityhub:DisableOrganizationAdminAccount',
                        'securityhub:EnableOrganizationAdminAccount',
                        'securityhub:EnableSecurityHub',
                        'securityhub:ListOrganizationAdminAccounts',
                      ],
                      Effect: 'Allow',
                      Resource: '*',
                      Sid: 'SecurityHubEnableOrganizationAdminAccountTaskSecurityHubActions',
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
   * SecurityHubOrganizationAdminAccount custom resource test
   */
  test(`${testNamePrefix} SecurityHubOrganizationAdminAccount custom resource test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        SecurityHubOrganizationAdminAccount71D5E029: {
          Type: 'Custom::SecurityHubEnableOrganizationAdminAccount',
          DeletionPolicy: 'Delete',
          UpdateReplacePolicy: 'Delete',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': [
                'CustomSecurityHubEnableOrganizationAdminAccountCustomResourceProviderHandler194C30B9',
                'Arn',
              ],
            },
            adminAccountId: {
              Ref: 'AWS::AccountId',
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
