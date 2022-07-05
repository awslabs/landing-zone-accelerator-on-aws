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
import { DetectiveOrganizationAdminAccount } from '../../lib/aws-detective/detective-organization-admin-account';

const testNamePrefix = 'Construct(DetectiveOrganizationAdminAccount): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new DetectiveOrganizationAdminAccount(stack, 'DetectiveOrganizationAdminAccount', {
  adminAccountId: stack.account,
  kmsKey: new cdk.aws_kms.Key(stack, 'CustomKey', {}),
  logRetentionInDays: 3653,
});

/**
 * DetectiveOrganizationAdminAccount construct test
 */
describe('DetectiveOrganizationAdminAccount', () => {
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
   * Number of DetectiveEnableOrganizationAdminAccount custom resource test
   */
  test(`${testNamePrefix} DetectiveEnableOrganizationAdminAccount custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::DetectiveEnableOrganizationAdminAccount', 1);
  });

  /**
   * Lambda Function resource configuration test
   */
  test(`${testNamePrefix} Lambda Function resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomDetectiveEnableOrganizationAdminAccountCustomResourceProviderHandlerAC80FDA1: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomDetectiveEnableOrganizationAdminAccountCustomResourceProviderRoleF6060FD6'],
          Properties: {
            Code: {
              S3Bucket: {
                'Fn::Sub': 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
              },
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': ['CustomDetectiveEnableOrganizationAdminAccountCustomResourceProviderRoleF6060FD6', 'Arn'],
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
        CustomDetectiveEnableOrganizationAdminAccountCustomResourceProviderRoleF6060FD6: {
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
                          'organizations:DeregisterDelegatedAdministrator': ['detective.amazonaws.com'],
                          'organizations:DescribeOrganization': ['detective.amazonaws.com'],
                          'organizations:EnableAWSServiceAccess': ['detective.amazonaws.com'],
                          'organizations:ListAWSServiceAccessForOrganization': ['detective.amazonaws.com'],
                          'organizations:ListAccounts': ['detective.amazonaws.com'],
                          'organizations:ListDelegatedAdministrators': ['detective.amazonaws.com'],
                          'organizations:RegisterDelegatedAdministrator': ['detective.amazonaws.com'],
                          'organizations:ServicePrincipal': ['detective.amazonaws.com'],
                          'organizations:UpdateOrganizationConfiguration': ['detective.amazonaws.com'],
                        },
                      },
                      Effect: 'Allow',
                      Resource: '*',
                      Sid: 'DetectiveEnableOrganizationAdminAccountTaskOrganizationActions',
                    },
                    {
                      Action: [
                        'detective:EnableOrganizationAdminAccount',
                        'detective:ListOrganizationAdminAccounts',
                        'detective:DisableOrganizationAdminAccount',
                        'detective:EnableOrganizationAdminAccount',
                        'detective:ListOrganizationAdminAccount',
                      ],
                      Effect: 'Allow',
                      Resource: '*',
                      Sid: 'DetectiveEnableOrganizationAdminAccountTaskDetectiveActions',
                    },
                    {
                      Action: ['iam:CreateServiceLinkedRole'],
                      Effect: 'Allow',
                      Resource: ['*'],
                      Sid: 'ServiceLinkedRoleDetective',
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
   * DetectiveEnableOrganizationAdminAccount custom resource configuration test
   */
  test(`${testNamePrefix} DetectiveEnableOrganizationAdminAccount custom resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        DetectiveOrganizationAdminAccountD12FBDDC: {
          Type: 'Custom::DetectiveEnableOrganizationAdminAccount',
          DeletionPolicy: 'Delete',
          UpdateReplacePolicy: 'Delete',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': [
                'CustomDetectiveEnableOrganizationAdminAccountCustomResourceProviderHandlerAC80FDA1',
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
