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
import { AuditManagerOrganizationAdminAccount } from '../../lib/aws-auditmanager/auditmanager-organization-admin-account';

const testNamePrefix = 'Construct(AuditManagerOrganizationAdminAccount): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new AuditManagerOrganizationAdminAccount(stack, 'AuditManagerOrganizationAdminAccount', {
  adminAccountId: stack.account,
  kmsKey: new cdk.aws_kms.Key(stack, 'CustomKey', {}),
  logRetentionInDays: 3653,
});

/**
 * AuditManagerOrganizationAdminAccount construct test
 */
describe('AuditManagerOrganizationAdminAccount', () => {
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
  test(`${testNamePrefix} AuditManagerEnableOrganizationAdminAccount custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::AuditManagerEnableOrganizationAdminAccount', 1);
  });

  /**
   * Lambda Function resource configuration test
   */
  test(`${testNamePrefix} Lambda Function resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomAuditManagerEnableOrganizationAdminAccountCustomResourceProviderHandlerCA9379D9: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomAuditManagerEnableOrganizationAdminAccountCustomResourceProviderRoleF4A6BEA4'],
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
                'CustomAuditManagerEnableOrganizationAdminAccountCustomResourceProviderRoleF4A6BEA4',
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
        CustomAuditManagerEnableOrganizationAdminAccountCustomResourceProviderRoleF4A6BEA4: {
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
                      ],
                      Condition: {
                        StringLikeIfExists: {
                          'organizations:DeregisterDelegatedAdministrator': ['auditmanager.amazonaws.com'],
                          'organizations:DescribeOrganization': ['auditmanager.amazonaws.com'],
                          'organizations:EnableAWSServiceAccess': ['auditmanager.amazonaws.com'],
                          'organizations:ListAWSServiceAccessForOrganization': ['auditmanager.amazonaws.com'],
                          'organizations:ListAccounts': ['auditmanager.amazonaws.com'],
                          'organizations:ListDelegatedAdministrators': ['auditmanager.amazonaws.com'],
                          'organizations:RegisterDelegatedAdministrator': ['auditmanager.amazonaws.com'],
                        },
                      },
                      Effect: 'Allow',
                      Resource: '*',
                      Sid: 'AuditManagerEnableOrganizationAdminAccountTaskOrganizationActions',
                    },
                    {
                      Action: [
                        'auditmanager:RegisterAccount',
                        'auditmanager:DeregisterAccount',
                        'auditmanager:RegisterOrganizationAdminAccount',
                        'auditmanager:DeregisterOrganizationAdminAccount',
                        'auditmanager:getOrganizationAdminAccount',
                      ],
                      Effect: 'Allow',
                      Resource: '*',
                      Sid: 'AuditManagerEnableOrganizationAdminAccountTaskDetectiveActions',
                    },
                    {
                      Action: 'kms:CreateGrant',
                      Condition: {
                        Bool: {
                          'kms:GrantIsForAWSResource': 'true',
                        },
                        StringLike: {
                          'kms:ViaService': 'auditmanager.*.amazonaws.com',
                        },
                      },
                      Effect: 'Allow',
                      Resource: {
                        'Fn::GetAtt': ['CustomKey1E6D0D07', 'Arn'],
                      },
                      Sid: 'AuditManagerEnableKmsKeyGrants',
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
   * GuardDutyEnableOrganizationAdminAccount custom resource configuration test
   */
  test(`${testNamePrefix} GuardDutyEnableOrganizationAdminAccount custom resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        AuditManagerOrganizationAdminAccount34B8BA90: {
          Type: 'Custom::AuditManagerEnableOrganizationAdminAccount',
          DependsOn: ['CustomAuditManagerEnableOrganizationAdminAccountCustomResourceProviderLogGroup858CB16C'],
          DeletionPolicy: 'Delete',
          UpdateReplacePolicy: 'Delete',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': [
                'CustomAuditManagerEnableOrganizationAdminAccountCustomResourceProviderHandlerCA9379D9',
                'Arn',
              ],
            },
            adminAccountId: {
              Ref: 'AWS::AccountId',
            },
            region: {
              Ref: 'AWS::Region',
            },
            kmsKeyArn: {
              'Fn::GetAtt': ['CustomKey1E6D0D07', 'Arn'],
            },
          },
        },
      },
    });
  });
});
