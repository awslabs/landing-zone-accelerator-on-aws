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

// import { SynthUtils } from '@aws-cdk/assert';
import { IpamOrganizationAdminAccount } from '../../lib/aws-ec2/ipam-organization-admin-account';

const testNamePrefix = 'Construct(IpamOrganizationAdminAccount): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new IpamOrganizationAdminAccount(stack, 'TestIpamOrgAdmin', {
  accountId: 'TestAccountId',
  kmsKey: new cdk.aws_kms.Key(stack, 'Key', {}),
  logRetentionInDays: 3653,
});

/**
 * IPAM organization admin account construct test
 */
describe('IpamOrganizationAdminAccount', () => {
  /**
   * Snapshot test
   */
  // test(`${testNamePrefix} Snapshot Test`, () => {
  //   expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
  // });

  /**
   * Number of Lambda function resource test
   */
  test(`${testNamePrefix} Lambda function resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Lambda::Function', 1);
  });

  /**
   * Number of IAM role resource test
   */
  test(`${testNamePrefix} IAM role resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::IAM::Role', 1);
  });

  /**
   * Number of IPAM org admin test
   */
  test(`${testNamePrefix} IPAM organization admin account count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::EnableIpamOrganizationAdminAccount', 1);
  });

  /**
   * Lambda Function resource configuration test
   */
  test(`${testNamePrefix} Lambda Function resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomEnableIpamOrganizationAdminAccountCustomResourceProviderHandlerA3CAFE25: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomEnableIpamOrganizationAdminAccountCustomResourceProviderRoleC4A018D1'],
          Properties: {
            Code: {
              S3Bucket: {
                'Fn::Sub': 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
              },
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': ['CustomEnableIpamOrganizationAdminAccountCustomResourceProviderRoleC4A018D1', 'Arn'],
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
        CustomEnableIpamOrganizationAdminAccountCustomResourceProviderRoleC4A018D1: {
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
                      Action: ['ec2:DisableIpamOrganizationAdminAccount', 'ec2:EnableIpamOrganizationAdminAccount'],
                      Effect: 'Allow',
                      Resource: '*',
                    },
                    {
                      Action: [
                        'organizations:DisableAwsServiceAccess',
                        'organizations:EnableAwsServiceAccess',
                        'organizations:DeregisterDelegatedAdministrator',
                        'organizations:RegisterDelegatedAdministrator',
                      ],
                      Effect: 'Allow',
                      Resource: '*',
                      Condition: {
                        StringLikeIfExists: {
                          'organizations:ServicePrincipal': ['ipam.amazonaws.com'],
                        },
                      },
                    },
                    {
                      Action: ['iam:CreateServiceLinkedRole', 'iam:DeleteServiceLinkedRole'],
                      Effect: 'Allow',
                      Resource: '*',
                      Condition: {
                        StringLikeIfExists: {
                          'iam:AWSServiceName': ['ipam.amazonaws.com'],
                        },
                      },
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
   * IPAM org admin account resource configuration test
   */
  test(`${testNamePrefix} IPAM organization admin account resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TestIpamOrgAdminDAAE6833: {
          Type: 'Custom::EnableIpamOrganizationAdminAccount',
          DependsOn: ['CustomEnableIpamOrganizationAdminAccountCustomResourceProviderLogGroupB1C24203'],
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomEnableIpamOrganizationAdminAccountCustomResourceProviderHandlerA3CAFE25', 'Arn'],
            },
            accountId: 'TestAccountId',
            region: { Ref: 'AWS::Region' },
          },
        },
      },
    });
  });
});
