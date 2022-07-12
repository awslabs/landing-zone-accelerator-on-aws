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

import { GuardDutyOrganizationAdminAccount } from '../../lib/aws-guardduty/guardduty-organization-admin-account';

const testNamePrefix = 'Construct(GuardDutyOrganizationAdminAccount): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new GuardDutyOrganizationAdminAccount(stack, 'GuardDutyOrganizationAdminAccount', {
  adminAccountId: stack.account,
  kmsKey: new cdk.aws_kms.Key(stack, 'CustomKey', {}),
  logRetentionInDays: 3653,
});

/**
 * GuardDutyOrganizationAdminAccount construct test
 */
describe('GuardDutyOrganizationAdminAccount', () => {
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
   * Number of GuardDutyEnableOrganizationAdminAccount custom resource test
   */
  test(`${testNamePrefix} GuardDutyEnableOrganizationAdminAccount custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::GuardDutyEnableOrganizationAdminAccount', 1);
  });

  /**
   * Lambda Function resource configuration test
   */
  test(`${testNamePrefix} Lambda Function resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomGuardDutyEnableOrganizationAdminAccountCustomResourceProviderHandler1EC01026: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomGuardDutyEnableOrganizationAdminAccountCustomResourceProviderRole30371E09'],
          Properties: {
            Code: {
              S3Bucket: {
                'Fn::Sub': 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
              },
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': ['CustomGuardDutyEnableOrganizationAdminAccountCustomResourceProviderRole30371E09', 'Arn'],
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
        CustomGuardDutyEnableOrganizationAdminAccountCustomResourceProviderRole30371E09: {
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
                          'organizations:DeregisterDelegatedAdministrator': ['guardduty.amazonaws.com'],
                          'organizations:DescribeOrganization': ['guardduty.amazonaws.com'],
                          'organizations:EnableAWSServiceAccess': ['guardduty.amazonaws.com'],
                          'organizations:ListAWSServiceAccessForOrganization': ['guardduty.amazonaws.com'],
                          'organizations:ListAccounts': ['guardduty.amazonaws.com'],
                          'organizations:ListDelegatedAdministrators': ['guardduty.amazonaws.com'],
                          'organizations:RegisterDelegatedAdministrator': ['guardduty.amazonaws.com'],
                          'organizations:ServicePrincipal': ['guardduty.amazonaws.com'],
                          'organizations:UpdateOrganizationConfiguration': ['guardduty.amazonaws.com'],
                        },
                      },
                      Effect: 'Allow',
                      Resource: '*',
                      Sid: 'GuardDutyEnableOrganizationAdminAccountTaskOrganizationActions',
                    },
                    {
                      Action: [
                        'GuardDuty:EnableOrganizationAdminAccount',
                        'GuardDuty:ListOrganizationAdminAccounts',
                        'guardduty:DisableOrganizationAdminAccount',
                      ],
                      Effect: 'Allow',
                      Resource: '*',
                      Sid: 'GuardDutyEnableOrganizationAdminAccountTaskGuardDutyActions',
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
   * GuardDutyEnableOrganizationAdminAccount custom resource configuration test
   */
  test(`${testNamePrefix} GuardDutyEnableOrganizationAdminAccount custom resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        GuardDutyOrganizationAdminAccount457DB4F1: {
          Type: 'Custom::GuardDutyEnableOrganizationAdminAccount',
          DeletionPolicy: 'Delete',
          UpdateReplacePolicy: 'Delete',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': [
                'CustomGuardDutyEnableOrganizationAdminAccountCustomResourceProviderHandler1EC01026',
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
