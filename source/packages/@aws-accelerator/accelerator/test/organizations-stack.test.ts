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
import * as path from 'path';

import { AcceleratorStackNames } from '../lib/accelerator';
import { AcceleratorStage } from '../lib/accelerator-stage';
import { AcceleratorStackProps } from '../lib/stacks/accelerator-stack';
import { OrganizationsStack } from '../lib/stacks/organizations-stack';
import {
  ACCOUNT_CONFIG,
  GLOBAL_CONFIG,
  IAM_CONFIG,
  NETWORK_CONFIG,
  ORGANIZATION_CONFIG,
  SECURITY_CONFIG,
} from './configs/test-config';

const testNamePrefix = 'Construct(OrganizationsStack): ';

/**
 * OrganizationsStack
 */
const app = new cdk.App({
  context: { 'config-dir': path.join(__dirname, 'configs') },
});
const configDirPath = app.node.tryGetContext('config-dir');

const env = {
  account: '333333333333',
  region: 'us-east-1',
};

const props: AcceleratorStackProps = {
  env,
  configDirPath,
  accountsConfig: ACCOUNT_CONFIG,
  globalConfig: GLOBAL_CONFIG,
  iamConfig: IAM_CONFIG,
  networkConfig: NETWORK_CONFIG,
  organizationConfig: ORGANIZATION_CONFIG,
  securityConfig: SECURITY_CONFIG,
  partition: 'aws',
};

const stack = new OrganizationsStack(
  app,
  `${AcceleratorStackNames[AcceleratorStage.ORGANIZATIONS]}-${env.account}-${env.region}`,
  props,
);

/**
 * OrganizationsStack construct test
 */
describe('OrganizationsStack', () => {
  /**
   * Number of IAM ServiceLinkedRole resource test
   */
  test(`${testNamePrefix} IAM ServiceLinkedRole resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::IAM::ServiceLinkedRole', 0);
  });

  /**
   * Number of Lambda function resource test
   */
  test(`${testNamePrefix} Lambda function resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Lambda::Function', 13);
  });

  /**
   * Number of Lambda IAM role resource test
   */
  test(`${testNamePrefix} Lambda IAM role resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::IAM::Role', 14);
  });

  /**
   * Number of EnableAwsServiceAccess custom resource test
   */
  test(`${testNamePrefix} EnableAwsServiceAccess custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::EnableAwsServiceAccess', 1);
  });

  /**
   * Number of EnableSharingWithAwsOrganization custom resource test
   */
  test(`${testNamePrefix} EnableSharingWithAwsOrganization custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::EnableSharingWithAwsOrganization', 1);
  });

  /**
   * Number of GuardDutyEnableOrganizationAdminAccount custom resource test
   */
  test(`${testNamePrefix} GuardDutyEnableOrganizationAdminAccount custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::GuardDutyEnableOrganizationAdminAccount', 1);
  });

  /**
   * Number of MacieEnableOrganizationAdminAccount custom resource test
   */
  test(`${testNamePrefix} MacieEnableOrganizationAdminAccount custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::MacieEnableOrganizationAdminAccount', 1);
  });

  /**
   * Number of OrganizationsRegisterDelegatedAdministrator custom resource test
   */
  test(`${testNamePrefix} OrganizationsRegisterDelegatedAdministrator custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::OrganizationsRegisterDelegatedAdministrator', 1);
  });

  /**
   * Number of SecurityHubEnableOrganizationAdminAccount custom resource test
   */
  test(`${testNamePrefix} SecurityHubEnableOrganizationAdminAccount custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::SecurityHubEnableOrganizationAdminAccount', 1);
  });

  /**
   * Number of IPAM org admin test
   */
  test(`${testNamePrefix} IPAM organization admin account count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::EnableIpamOrganizationAdminAccount', 1);
  });

  /**
   * IAM ServiceLinkedRole AccessAnalyzerServiceLinkedRole  resource configuration test
   */
  // test(`${testNamePrefix} IAM ServiceLinkedRole AccessAnalyzerServiceLinkedRole resource configuration test`, () => {
  //   cdk.assertions.Template.fromStack(stack).templateMatches({
  //     Resources: {
  //       AccessAnalyzerServiceLinkedRole: {
  //         Type: 'AWS::IAM::ServiceLinkedRole',
  //         Properties: {
  //           AWSServiceName: 'access-analyzer.amazonaws.com',
  //         },
  //       },
  //     },
  //   });
  // });

  /**
   * Lambda function CustomEnableSharingWithAwsOrganizationCustomResourceProviderHandler resource configuration test
   */
  test(`${testNamePrefix} Lambda function CustomEnableSharingWithAwsOrganizationCustomResourceProviderHandler resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomEnableSharingWithAwsOrganizationCustomResourceProviderHandler405D7398: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomEnableSharingWithAwsOrganizationCustomResourceProviderRole4FE5EBD7'],
          Properties: {
            Code: {
              S3Bucket: 'cdk-hnb659fds-assets-333333333333-us-east-1',
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': ['CustomEnableSharingWithAwsOrganizationCustomResourceProviderRole4FE5EBD7', 'Arn'],
            },
            Runtime: 'nodejs14.x',
            Timeout: 900,
          },
        },
      },
    });
  });

  /**
   * Lambda IAM role CustomEnableSharingWithAwsOrganizationCustomResourceProviderRole resource configuration test
   */
  test(`${testNamePrefix} Lambda IAM role CustomEnableSharingWithAwsOrganizationCustomResourceProviderRole resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomEnableSharingWithAwsOrganizationCustomResourceProviderRole4FE5EBD7: {
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
                        'ram:EnableSharingWithAwsOrganization',
                        'iam:CreateServiceLinkedRole',
                        'organizations:EnableAWSServiceAccess',
                        'organizations:ListAWSServiceAccessForOrganization',
                        'organizations:DescribeOrganization',
                      ],
                      Effect: 'Allow',
                      Resource: '*',
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
   * Lambda function CustomGuardDutyEnableOrganizationAdminAccountCustomResourceProviderHandler resource configuration test
   */
  test(`${testNamePrefix} Lambda function CustomGuardDutyEnableOrganizationAdminAccountCustomResourceProviderHandler resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomGuardDutyEnableOrganizationAdminAccountCustomResourceProviderHandler1EC01026: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomGuardDutyEnableOrganizationAdminAccountCustomResourceProviderRole30371E09'],
          Properties: {
            Code: {
              S3Bucket: 'cdk-hnb659fds-assets-333333333333-us-east-1',
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
   * Lambda IAM role CustomGuardDutyEnableOrganizationAdminAccountCustomResourceProviderRole resource configuration test
   */
  test(`${testNamePrefix} Lambda IAM role CustomGuardDutyEnableOrganizationAdminAccountCustomResourceProviderRole resource configuration test`, () => {
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
   * Lambda function CustomMacieEnableOrganizationAdminAccountCustomResourceProviderHandler resource configuration test
   */
  test(`${testNamePrefix} Lambda function CustomMacieEnableOrganizationAdminAccountCustomResourceProviderHandler resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomMacieEnableOrganizationAdminAccountCustomResourceProviderHandlerD7A9976A: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomMacieEnableOrganizationAdminAccountCustomResourceProviderRoleA386B194'],
          Properties: {
            Code: {
              S3Bucket: 'cdk-hnb659fds-assets-333333333333-us-east-1',
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
   * Lambda IAM role CustomMacieEnableOrganizationAdminAccountCustomResourceProviderRole resource configuration test
   */
  test(`${testNamePrefix} Lambda IAM role CustomMacieEnableOrganizationAdminAccountCustomResourceProviderRole resource configuration test`, () => {
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
   * Lambda function CustomOrganizationsEnableAwsServiceAccessCustomResourceProviderHandler resource configuration test
   */
  test(`${testNamePrefix} Lambda function CustomOrganizationsEnableAwsServiceAccessCustomResourceProviderHandler resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomOrganizationsEnableAwsServiceAccessCustomResourceProviderHandlerDCD56D71: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomOrganizationsEnableAwsServiceAccessCustomResourceProviderRole59F76BA2'],
          Properties: {
            Code: {
              S3Bucket: 'cdk-hnb659fds-assets-333333333333-us-east-1',
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': ['CustomOrganizationsEnableAwsServiceAccessCustomResourceProviderRole59F76BA2', 'Arn'],
            },
            Runtime: 'nodejs14.x',
            Timeout: 900,
          },
        },
      },
    });
  });

  /**
   * Lambda IAM role CustomOrganizationsEnableAwsServiceAccessCustomResourceProviderRole resource configuration test
   */
  test(`${testNamePrefix} Lambda IAM role CustomOrganizationsEnableAwsServiceAccessCustomResourceProviderRole resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomOrganizationsEnableAwsServiceAccessCustomResourceProviderRole59F76BA2: {
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
                      Action: ['organizations:DisableAWSServiceAccess', 'organizations:EnableAwsServiceAccess'],
                      Effect: 'Allow',
                      Resource: '*',
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
   * Lambda function CustomOrganizationsRegisterDelegatedAdministratorCustomResourceProviderHandler resource configuration test
   */
  test(`${testNamePrefix} Lambda function CustomOrganizationsRegisterDelegatedAdministratorCustomResourceProviderHandler resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomOrganizationsRegisterDelegatedAdministratorCustomResourceProviderHandlerFAEA655C: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomOrganizationsRegisterDelegatedAdministratorCustomResourceProviderRole4B3EAD1B'],
          Properties: {
            Code: {
              S3Bucket: 'cdk-hnb659fds-assets-333333333333-us-east-1',
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': [
                'CustomOrganizationsRegisterDelegatedAdministratorCustomResourceProviderRole4B3EAD1B',
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
   * Lambda IAM role CustomOrganizationsRegisterDelegatedAdministratorCustomResourceProviderRole resource configuration test
   */
  test(`${testNamePrefix} Lambda IAM role CustomOrganizationsRegisterDelegatedAdministratorCustomResourceProviderRole resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomOrganizationsRegisterDelegatedAdministratorCustomResourceProviderRole4B3EAD1B: {
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
                        'organizations:RegisterDelegatedAdministrator',
                      ],
                      Effect: 'Allow',
                      Resource: '*',
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
   * Lambda function CustomSecurityHubEnableOrganizationAdminAccountCustomResourceProviderHandler resource configuration test
   */
  test(`${testNamePrefix} Lambda function CustomSecurityHubEnableOrganizationAdminAccountCustomResourceProviderHandler resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomSecurityHubEnableOrganizationAdminAccountCustomResourceProviderHandler194C30B9: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomSecurityHubEnableOrganizationAdminAccountCustomResourceProviderRole1CBC866F'],
          Properties: {
            Code: {
              S3Bucket: 'cdk-hnb659fds-assets-333333333333-us-east-1',
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
   * Lambda IAM role CustomSecurityHubEnableOrganizationAdminAccountCustomResourceProviderRole resource configuration test
   */
  test(`${testNamePrefix} Lambda IAM role CustomSecurityHubEnableOrganizationAdminAccountCustomResourceProviderRole resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomSecurityHubEnableOrganizationAdminAccountCustomResourceProviderRole1CBC866F: {
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
   * Lambda Function CustomEnableIpamOrganizationAdminAccountCustomResourceProviderHandler resource configuration test
   */
  test(`${testNamePrefix} Lambda Function CustomEnableIpamOrganizationAdminAccountCustomResourceProviderHandler resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomEnableIpamOrganizationAdminAccountCustomResourceProviderHandlerA3CAFE25: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomEnableIpamOrganizationAdminAccountCustomResourceProviderRoleC4A018D1'],
          Properties: {
            Code: {
              S3Bucket: 'cdk-hnb659fds-assets-333333333333-us-east-1',
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
   * IAM role CustomEnableIpamOrganizationAdminAccountCustomResourceProviderRole resource configuration test
   */
  test(`${testNamePrefix} Lambda IAM role CustomEnableIpamOrganizationAdminAccountCustomResourceProviderRole resource configuration test`, () => {
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
   * EnableAwsServiceAccess custom resource configuration test
   */
  test(`${testNamePrefix} EnableAwsServiceAccess custom resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        EnableAccessAnalyzerAFBAAEC3: {
          Type: 'Custom::EnableAwsServiceAccess',
          UpdateReplacePolicy: 'Delete',
          DeletionPolicy: 'Delete',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomOrganizationsEnableAwsServiceAccessCustomResourceProviderHandlerDCD56D71', 'Arn'],
            },
            servicePrincipal: 'access-analyzer.amazonaws.com',
          },
        },
      },
    });
  });

  /**
   * EnableSharingWithAwsOrganization custom resource configuration test
   */
  test(`${testNamePrefix} EnableSharingWithAwsOrganization custom resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        EnableSharingWithAwsOrganization81D5714F: {
          Type: 'Custom::EnableSharingWithAwsOrganization',
          UpdateReplacePolicy: 'Delete',
          DeletionPolicy: 'Delete',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomEnableSharingWithAwsOrganizationCustomResourceProviderHandler405D7398', 'Arn'],
            },
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
        GuardDutyEnableOrganizationAdminAccount90D7393E: {
          Type: 'Custom::GuardDutyEnableOrganizationAdminAccount',
          UpdateReplacePolicy: 'Delete',
          DeletionPolicy: 'Delete',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': [
                'CustomGuardDutyEnableOrganizationAdminAccountCustomResourceProviderHandler1EC01026',
                'Arn',
              ],
            },
            adminAccountId: '222222222222',
            region: 'us-east-1',
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
          UpdateReplacePolicy: 'Delete',
          DeletionPolicy: 'Delete',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomMacieEnableOrganizationAdminAccountCustomResourceProviderHandlerD7A9976A', 'Arn'],
            },
            adminAccountId: '222222222222',
            region: 'us-east-1',
          },
        },
      },
    });
  });

  /**
   * OrganizationsRegisterDelegatedAdministrator custom resource configuration test
   */
  test(`${testNamePrefix} OrganizationsRegisterDelegatedAdministrator custom resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        RegisterDelegatedAdministratorAccessAnalyzerE0CB7BBC: {
          Type: 'Custom::OrganizationsRegisterDelegatedAdministrator',
          UpdateReplacePolicy: 'Delete',
          DeletionPolicy: 'Delete',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': [
                'CustomOrganizationsRegisterDelegatedAdministratorCustomResourceProviderHandlerFAEA655C',
                'Arn',
              ],
            },
            accountId: '222222222222',
            servicePrincipal: 'access-analyzer.amazonaws.com',
          },
        },
      },
    });
  });
  /**
   * SecurityHubEnableOrganizationAdminAccount custom resource configuration test
   */
  test(`${testNamePrefix} SecurityHubEnableOrganizationAdminAccount custom resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        SecurityHubOrganizationAdminAccount71D5E029: {
          Type: 'Custom::SecurityHubEnableOrganizationAdminAccount',
          UpdateReplacePolicy: 'Delete',
          DeletionPolicy: 'Delete',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': [
                'CustomSecurityHubEnableOrganizationAdminAccountCustomResourceProviderHandler194C30B9',
                'Arn',
              ],
            },
            adminAccountId: '222222222222',
            region: 'us-east-1',
          },
        },
      },
    });
  });

  /**
   * IPAM org admin account resource configuration test
   */
  test(`${testNamePrefix} IPAM organization admin account custom resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        IpamAdminAccountB45C9E06: {
          Type: 'Custom::EnableIpamOrganizationAdminAccount',
          DependsOn: ['CustomEnableIpamOrganizationAdminAccountCustomResourceProviderLogGroupB1C24203'],
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomEnableIpamOrganizationAdminAccountCustomResourceProviderHandlerA3CAFE25', 'Arn'],
            },
            accountId: '222222222222',
            region: 'us-east-1',
          },
        },
      },
    });
  });
});
