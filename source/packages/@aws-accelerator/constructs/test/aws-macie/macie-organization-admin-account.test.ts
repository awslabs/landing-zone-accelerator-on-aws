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

import { MacieOrganizationAdminAccount } from '../../index';

const testNamePrefix = 'Construct(MacieOrganizationAdminAccount): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new MacieOrganizationAdminAccount(stack, 'MacieOrganizationAdminAccount', {
  adminAccountId: stack.account,
  logRetentionInDays: 3653,
  kmsKey: new cdk.aws_kms.Key(stack, 'Key', {}),
});
/**
 * MacieOrganizationAdminAccount construct test
 */
describe('MacieOrganizationAdminAccount', () => {
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
   * Number of MacieEnableOrganizationAdminAccount custom resource test
   */
  test(`${testNamePrefix} MacieEnableOrganizationAdminAccount custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::MacieEnableOrganizationAdminAccount', 1);
  });

  /**
   * Lambda Function resource configuration test
   */
  test(`${testNamePrefix} Lambda Function resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomMacieEnableOrganizationAdminAccountCustomResourceProviderHandlerD7A9976A: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomMacieEnableOrganizationAdminAccountCustomResourceProviderRoleA386B194'],
          Properties: {
            Code: {
              S3Bucket: {
                'Fn::Sub': 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
              },
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': ['CustomMacieEnableOrganizationAdminAccountCustomResourceProviderRoleA386B194', 'Arn'],
            },
            Runtime: 'nodejs14.x',
            Timeout: 180,
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
        CustomMacieEnableOrganizationAdminAccountCustomResourceProviderRoleA386B194: {
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
                        'organizations:DeregisterDelegatedAdministrator',
                        'organizations:DescribeOrganization',
                        'organizations:EnableAWSServiceAccess',
                        'organizations:ListAWSServiceAccessForOrganization',
                        'organizations:ListAccounts',
                        'organizations:ListDelegatedAdministrators',
                        'organizations:RegisterDelegatedAdministrator',
                        'organizations:ServicePrincipal',
                        'organizations:UpdateOrganizationConfiguration',
                      ],
                      Condition: {
                        StringLikeIfExists: {
                          'organizations:DeregisterDelegatedAdministrator': ['macie.amazonaws.com'],
                          'organizations:DescribeOrganization': ['macie.amazonaws.com'],
                          'organizations:EnableAWSServiceAccess': ['macie.amazonaws.com'],
                          'organizations:ListAWSServiceAccessForOrganization': ['macie.amazonaws.com'],
                          'organizations:ListAccounts': ['macie.amazonaws.com'],
                          'organizations:ListDelegatedAdministrators': ['macie.amazonaws.com'],
                          'organizations:RegisterDelegatedAdministrator': ['macie.amazonaws.com'],
                          'organizations:ServicePrincipal': ['macie.amazonaws.com'],
                          'organizations:UpdateOrganizationConfiguration': ['macie.amazonaws.com'],
                        },
                      },
                      Effect: 'Allow',
                      Resource: '*',
                      Sid: 'MacieEnableOrganizationAdminAccountTaskOrganizationActions',
                    },
                    {
                      Action: [
                        'macie2:DisableOrganizationAdminAccount',
                        'macie2:EnableMacie',
                        'macie2:EnableOrganizationAdminAccount',
                        'macie2:GetMacieSession',
                        'macie2:ListOrganizationAdminAccounts',
                        'macie2:DisableOrganizationAdminAccount',
                        'macie2:GetMacieSession',
                        'macie2:EnableMacie',
                      ],
                      Effect: 'Allow',
                      Resource: '*',
                      Sid: 'MacieEnableOrganizationAdminAccountTaskMacieActions',
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
   * MacieEnableOrganizationAdminAccount custom resource configuration test
   */
  test(`${testNamePrefix} MacieEnableOrganizationAdminAccount custom resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        MacieOrganizationAdminAccount2C23317B: {
          Type: 'Custom::MacieEnableOrganizationAdminAccount',
          DeletionPolicy: 'Delete',
          UpdateReplacePolicy: 'Delete',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomMacieEnableOrganizationAdminAccountCustomResourceProviderHandlerD7A9976A', 'Arn'],
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
