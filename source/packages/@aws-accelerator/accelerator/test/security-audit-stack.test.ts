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
import { SecurityAuditStack } from '../lib/stacks/security-audit-stack';
import {
  ACCOUNT_CONFIG,
  GLOBAL_CONFIG,
  IAM_CONFIG,
  NETWORK_CONFIG,
  ORGANIZATION_CONFIG,
  SECURITY_CONFIG,
} from './configs/test-config';

const testNamePrefix = 'Construct(SecurityAuditStack): ';

/**
 * SecurityAuditStack
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

const stack = new SecurityAuditStack(
  app,
  `${AcceleratorStackNames[AcceleratorStage.SECURITY_AUDIT]}-${env.account}-${env.region}`,
  props,
);

/**
 * SecurityAuditStack construct test
 */
describe('SecurityAuditStack', () => {
  /**
   * Number of S3 bucket resource test
   */
  test(`${testNamePrefix} S3 bucket resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::S3::Bucket', 3);
  });

  /**
   * Number of S3 bucket policy resource test
   */
  test(`${testNamePrefix} S3 bucket policy resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::S3::BucketPolicy', 3);
  });

  /**
   * Number of Lambda function resource test
   */
  test(`${testNamePrefix} Lambda function resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Lambda::Function', 10);
  });

  /**
   * Number of IAM role resource test
   */
  test(`${testNamePrefix} IAM role resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::IAM::Role', 10);
  });

  /**
   * Number of SNS topic resource test
   */
  test(`${testNamePrefix} SNS topic resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::SNS::Topic', 3);
  });

  /**
   * Number of SNS topic policy resource test
   */
  test(`${testNamePrefix} SNS topic policy resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::SNS::TopicPolicy', 3);
  });

  /**
   * Number of SNS subscription resource test
   */
  test(`${testNamePrefix} SNS subscription resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::SNS::Subscription', 4);
  });

  /**
   * Number of GuardDutyUpdateDetector custom resource test
   */
  test(`${testNamePrefix} GuardDutyUpdateDetector custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::GuardDutyUpdateDetector', 1);
  });

  /**
   * Number of GuardDutyCreateMembers custom resource test
   */
  test(`${testNamePrefix} GuardDutyCreateMembers custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::GuardDutyCreateMembers', 1);
  });

  /**
   * Number of DetectiveCreateMembers custom resource test
   */
  test(`${testNamePrefix} DetectiveCreateMembers custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::DetectiveCreateMembers', 1);
  });

  /**
   * Number of DetectiveUpdateGraph custom resource test
   */
  test(`${testNamePrefix} DetectiveUpdateGraph custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::DetectiveUpdateGraph', 1);
  });

  /**
   * Number of DetectiveUpdateGraph custom resource test
   */
  test(`${testNamePrefix} DetectiveUpdateGraph custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::DetectiveUpdateGraph', 1);
  });

  /**
   * Number of AuditManagerDefaultReportsDestination custom resource test
   */
  test(`${testNamePrefix} AuditManagerCreateDefaultReportsDestination custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::AuditManagerCreateDefaultReportsDestination', 1);
  });

  /**
   * Number of MacieCreateMember custom resource test
   */
  test(`${testNamePrefix} MacieCreateMember custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::MacieCreateMember', 1);
  });

  /**
   * Number of MacieCreateMember custom resource test
   */
  test(`${testNamePrefix} MacieCreateMember custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::MacieCreateMember', 1);
  });

  /**
   * Number of DescribeOrganization custom resource test
   */
  test(`${testNamePrefix} DescribeOrganization custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::DescribeOrganization', 1);
  });

  /**
   * Number of SecurityHubCreateMembers custom resource test
   */
  test(`${testNamePrefix} SecurityHubCreateMembers custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::SecurityHubCreateMembers', 1);
  });

  /**
   * AccessAnalyzer Analyzer resource configuration test
   */
  test(`${testNamePrefix} AccessAnalyzer Analyzer resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        AccessAnalyzer: {
          Type: 'AWS::AccessAnalyzer::Analyzer',
          Properties: {
            Type: 'ORGANIZATION',
          },
        },
      },
    });
  });

  /**
   * CustomGuardDutyCreateMembersCustomResourceProviderHandler resource configuration test
   */
  test(`${testNamePrefix} CustomGuardDutyCreateMembersCustomResourceProviderHandler resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomGuardDutyCreateMembersCustomResourceProviderHandler0A16C673: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomGuardDutyCreateMembersCustomResourceProviderRole2D82020E'],
          Properties: {
            Code: {
              S3Bucket: 'cdk-hnb659fds-assets-333333333333-us-east-1',
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': ['CustomGuardDutyCreateMembersCustomResourceProviderRole2D82020E', 'Arn'],
            },
            Runtime: 'nodejs14.x',
            Timeout: 900,
          },
        },
      },
    });
  });

  /**
   * CustomGuardDutyCreateMembersCustomResourceProviderRole resource configuration test
   */
  // test(`${testNamePrefix} CustomGuardDutyCreateMembersCustomResourceProviderRole resource configuration test`, () => {
  //   cdk.assertions.Template.fromStack(stack).templateMatches({
  //     Resources: {
  //       CustomGuardDutyCreateMembersCustomResourceProviderRole2D82020E: {
  //         Type: 'AWS::IAM::Role',
  //         Properties: {
  //           AssumeRolePolicyDocument: {
  //             Statement: [
  //               {
  //                 Action: 'sts:AssumeRole',
  //                 Effect: 'Allow',
  //                 Principal: {
  //                   Service: 'lambda.amazonaws.com',
  //                 },
  //               },
  //             ],
  //             Version: '2012-10-17',
  //           },
  //           ManagedPolicyArns: [
  //             {
  //               'Fn::Sub': 'arn:${AWS::Partition}:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
  //             },
  //           ],
  //           Policies: [
  //             {
  //               PolicyDocument: {
  //                 Statement: [
  //                   {
  //                     Action: ['organizations:ListAccounts'],
  //                     Condition: {
  //                       StringLikeIfExists: {
  //                         'organizations:ListAccounts': ['guardduty.amazonaws.com'],
  //                       },
  //                     },
  //                     Effect: 'Allow',
  //                     Resource: '*',
  //                     Sid: 'GuardDutyCreateMembersTaskOrganizationAction',
  //                   },
  //                   {
  //                     Action: [
  //                       'guardDuty:ListDetectors',
  //                       'guardDuty:ListOrganizationAdminAccounts',
  //                       'guardDuty:UpdateOrganizationConfiguration',
  //                       'guardduty:CreateMembers',
  //                       'guardduty:DeleteMembers',
  //                       'guardduty:DisassociateMembers',
  //                       'guardduty:ListDetectors',
  //                       'guardduty:ListMembers',
  //                     ],
  //                     Effect: 'Allow',
  //                     Resource: '*',
  //                     Sid: 'GuardDutyCreateMembersTaskGuardDutyActions',
  //                   },
  //                 ],
  //                 Version: '2012-10-17',
  //               },
  //               PolicyName: 'Inline',
  //             },
  //           ],
  //         },
  //       },
  //     },
  //   });
  // });

  /**
   * CustomGuardDutyUpdateDetectorCustomResourceProviderHandler resource configuration test
   */
  test(`${testNamePrefix} CustomGuardDutyUpdateDetectorCustomResourceProviderHandler resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomGuardDutyUpdateDetectorCustomResourceProviderHandler78DF0FF9: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomGuardDutyUpdateDetectorCustomResourceProviderRole3014073E'],
          Properties: {
            Code: {
              S3Bucket: 'cdk-hnb659fds-assets-333333333333-us-east-1',
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': ['CustomGuardDutyUpdateDetectorCustomResourceProviderRole3014073E', 'Arn'],
            },
            Runtime: 'nodejs14.x',
            Timeout: 900,
          },
        },
      },
    });
  });

  /**
   * CustomGuardDutyUpdateDetectorCustomResourceProviderRole resource configuration test
   */
  test(`${testNamePrefix} CustomGuardDutyUpdateDetectorCustomResourceProviderRole resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomGuardDutyUpdateDetectorCustomResourceProviderRole3014073E: {
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
                        'guardduty:ListDetectors',
                        'guardduty:ListMembers',
                        'guardduty:UpdateDetector',
                        'guardduty:UpdateMemberDetectors',
                      ],
                      Effect: 'Allow',
                      Resource: '*',
                      Sid: 'GuardDutyUpdateDetectorTaskGuardDutyActions',
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
   * AuditManagerCreateDefaultReportsDestinationCustomResourceProviderHandler resource configuration test
   */
  test(`${testNamePrefix} AuditManagerCreateDefaultReportsDestinationCustomResourceProviderHandler resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomAuditManagerCreateDefaultReportsDestinationCustomResourceProviderHandler6BCBC433: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomAuditManagerCreateDefaultReportsDestinationCustomResourceProviderRoleAEE72AE5'],
          Properties: {
            Code: {
              S3Bucket: 'cdk-hnb659fds-assets-333333333333-us-east-1',
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': [
                'CustomAuditManagerCreateDefaultReportsDestinationCustomResourceProviderRoleAEE72AE5',
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
   * AuditManagerCreateDefaultReportsDestinationCustomResourceProviderRole resource configuration test
   */
  test(`${testNamePrefix} AuditManagerCreateDefaultReportsDestinationCustomResourceProviderRole resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomAuditManagerCreateDefaultReportsDestinationCustomResourceProviderRoleAEE72AE5: {
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
                      Action: ['auditmanager:UpdateSettings'],
                      Effect: 'Allow',
                      Resource: '*',
                      Sid: 'AuditManagerCreatePublishingDestinationCommandTaskAuditManagerActions',
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
   * CustomDetectiveCreateMembersCustomResourceProviderHandler resource configuration test
   */
  test(`${testNamePrefix} CustomDetectiveCreateMembersCustomResourceProviderHandler resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomDetectiveCreateMembersCustomResourceProviderHandler0A0D060D: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomDetectiveCreateMembersCustomResourceProviderRole90BCDD0D'],
          Properties: {
            Code: {
              S3Bucket: 'cdk-hnb659fds-assets-333333333333-us-east-1',
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': ['CustomDetectiveCreateMembersCustomResourceProviderRole90BCDD0D', 'Arn'],
            },
            Runtime: 'nodejs14.x',
            Timeout: 900,
          },
        },
      },
    });
  });

  /**
   * CustomDetectiveUpdateGraphCustomResourceProviderHandler resource configuration test
   */
  test(`${testNamePrefix} CustomDetectiveUpdateGraphCustomResourceProviderHandler resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomDetectiveUpdateGraphCustomResourceProviderHandlerD4473EC1: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomDetectiveUpdateGraphCustomResourceProviderRole54CD7295'],
          Properties: {
            Code: {
              S3Bucket: 'cdk-hnb659fds-assets-333333333333-us-east-1',
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': ['CustomDetectiveUpdateGraphCustomResourceProviderRole54CD7295', 'Arn'],
            },
            Runtime: 'nodejs14.x',
            Timeout: 900,
          },
        },
      },
    });
  });

  /**
   * CustomDetectiveCreateMembersCustomResourceProviderRole resource configuration test
   */
  test(`${testNamePrefix} CustomDetectiveCreateMembersCustomResourceProviderRole resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomDetectiveCreateMembersCustomResourceProviderRole90BCDD0D: {
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
                        'detective:ListOrganizationAdminAccounts',
                        'detective:UpdateOrganizationConfiguration',
                        'detective:CreateMembers',
                        'detective:DeleteMembers',
                        'detective:DisassociateMembership',
                        'detective:ListMembers',
                        'detective:ListGraphs',
                      ],
                      Effect: 'Allow',
                      Resource: '*',
                      Sid: 'DetectiveCreateMembersTaskDetectiveActions',
                    },
                    {
                      Action: ['iam:CreateServiceLinkedRole'],
                      Effect: 'Allow',
                      Resource: ['*'],
                      Sid: 'ServiceLinkedRoleDetective',
                    },
                    {
                      Action: ['organizations:ListAccounts'],
                      Effect: 'Allow',
                      Resource: ['*'],
                      Sid: 'OrganisationsListDetective',
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
   * CustomDetectiveUpdateGraphCustomResourceProviderRole resource configuration test
   */
  test(`${testNamePrefix} CustomDetectiveUpdateGraphCustomResourceProviderRole resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomDetectiveUpdateGraphCustomResourceProviderRole54CD7295: {
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
                      Effect: 'Allow',
                      Resource: '*',
                      Sid: 'DetectiveConfigureOrganizationAdminAccountTaskOrganizationActions',
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
                    },
                    {
                      Action: [
                        'detective:UpdateOrganizationConfiguration',
                        'detective:ListGraphs',
                        'detective:ListMembers',
                      ],
                      Effect: 'Allow',
                      Resource: '*',
                      Sid: 'DetectiveUpdateGraphTaskDetectiveActions',
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
   * CustomDetectiveCreateMembersCustomResourceProviderHandler resource configuration test
   */
  test(`${testNamePrefix} CustomDetectiveCreateMembersCustomResourceProviderHandler resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomDetectiveCreateMembersCustomResourceProviderHandler0A0D060D: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomDetectiveCreateMembersCustomResourceProviderRole90BCDD0D'],
          Properties: {
            Code: {
              S3Bucket: 'cdk-hnb659fds-assets-333333333333-us-east-1',
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': ['CustomDetectiveCreateMembersCustomResourceProviderRole90BCDD0D', 'Arn'],
            },
            Runtime: 'nodejs14.x',
            Timeout: 900,
          },
        },
      },
    });
  });

  /**
   * CustomDetectiveUpdateGraphCustomResourceProviderHandler resource configuration test
   */
  test(`${testNamePrefix} CustomDetectiveUpdateGraphCustomResourceProviderHandler resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomDetectiveUpdateGraphCustomResourceProviderHandlerD4473EC1: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomDetectiveUpdateGraphCustomResourceProviderRole54CD7295'],
          Properties: {
            Code: {
              S3Bucket: 'cdk-hnb659fds-assets-333333333333-us-east-1',
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': ['CustomDetectiveUpdateGraphCustomResourceProviderRole54CD7295', 'Arn'],
            },
            Runtime: 'nodejs14.x',
            Timeout: 900,
          },
        },
      },
    });
  });

  /**
   * CustomDetectiveCreateMembersCustomResourceProviderRole resource configuration test
   */
  test(`${testNamePrefix} CustomDetectiveCreateMembersCustomResourceProviderRole resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomDetectiveCreateMembersCustomResourceProviderRole90BCDD0D: {
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
                        'detective:ListOrganizationAdminAccounts',
                        'detective:UpdateOrganizationConfiguration',
                        'detective:CreateMembers',
                        'detective:DeleteMembers',
                        'detective:DisassociateMembership',
                        'detective:ListMembers',
                        'detective:ListGraphs',
                      ],
                      Effect: 'Allow',
                      Resource: '*',
                      Sid: 'DetectiveCreateMembersTaskDetectiveActions',
                    },
                    {
                      Action: ['iam:CreateServiceLinkedRole'],
                      Effect: 'Allow',
                      Resource: ['*'],
                      Sid: 'ServiceLinkedRoleDetective',
                    },
                    {
                      Action: ['organizations:ListAccounts'],
                      Effect: 'Allow',
                      Resource: ['*'],
                      Sid: 'OrganisationsListDetective',
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
   * CustomDetectiveUpdateGraphCustomResourceProviderRole resource configuration test
   */
  test(`${testNamePrefix} CustomDetectiveUpdateGraphCustomResourceProviderRole resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomDetectiveUpdateGraphCustomResourceProviderRole54CD7295: {
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
                      Effect: 'Allow',
                      Resource: '*',
                      Sid: 'DetectiveConfigureOrganizationAdminAccountTaskOrganizationActions',
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
                    },
                    {
                      Action: [
                        'detective:UpdateOrganizationConfiguration',
                        'detective:ListGraphs',
                        'detective:ListMembers',
                      ],
                      Effect: 'Allow',
                      Resource: '*',
                      Sid: 'DetectiveUpdateGraphTaskDetectiveActions',
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
   * CustomMacieCreateMemberCustomResourceProviderHandler resource configuration test
   */
  test(`${testNamePrefix} CustomMacieCreateMemberCustomResourceProviderHandler resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomMacieCreateMemberCustomResourceProviderHandler913F75DB: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomMacieCreateMemberCustomResourceProviderRole3E8977EE'],
          Properties: {
            Code: {
              S3Bucket: 'cdk-hnb659fds-assets-333333333333-us-east-1',
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': ['CustomMacieCreateMemberCustomResourceProviderRole3E8977EE', 'Arn'],
            },
            Runtime: 'nodejs14.x',
            Timeout: 900,
          },
        },
      },
    });
  });

  /**
   * CustomMacieCreateMemberCustomResourceProviderRole resource configuration test
   */
  test(`${testNamePrefix} CustomMacieCreateMemberCustomResourceProviderRole resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomMacieCreateMemberCustomResourceProviderRole3E8977EE: {
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
                      Action: ['organizations:ListAccounts'],
                      Condition: {
                        StringLikeIfExists: {
                          'organizations:ListAccounts': ['macie.amazonaws.com'],
                        },
                      },
                      Effect: 'Allow',
                      Resource: '*',
                      Sid: 'MacieCreateMemberTaskOrganizationAction',
                    },
                    {
                      Action: [
                        'macie2:CreateMember',
                        'macie2:DeleteMember',
                        'macie2:DescribeOrganizationConfiguration',
                        'macie2:DisassociateMember',
                        'macie2:EnableMacie',
                        'macie2:GetMacieSession',
                        'macie2:ListMembers',
                        'macie2:UpdateOrganizationConfiguration',
                      ],
                      Effect: 'Allow',
                      Resource: '*',
                      Sid: 'MacieCreateMemberTaskMacieActions',
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
   * CustomOrganizationsDescribeOrganizationCustomResourceProviderHandler resource configuration test
   */
  test(`${testNamePrefix} CustomOrganizationsDescribeOrganizationCustomResourceProviderHandler resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomOrganizationsDescribeOrganizationCustomResourceProviderHandler4C6F49D1: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomOrganizationsDescribeOrganizationCustomResourceProviderRole775854D5'],
          Properties: {
            Code: {
              S3Bucket: 'cdk-hnb659fds-assets-333333333333-us-east-1',
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': ['CustomOrganizationsDescribeOrganizationCustomResourceProviderRole775854D5', 'Arn'],
            },
            Runtime: 'nodejs14.x',
            Timeout: 900,
          },
        },
      },
    });
  });

  /**
   * CustomOrganizationsDescribeOrganizationCustomResourceProviderRole resource configuration test
   */
  test(`${testNamePrefix} CustomOrganizationsDescribeOrganizationCustomResourceProviderRole resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomOrganizationsDescribeOrganizationCustomResourceProviderRole775854D5: {
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
                      Action: ['organizations:DescribeOrganization'],
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
   * CustomSecurityHubCreateMembersCustomResourceProviderHandler resource configuration test
   */
  test(`${testNamePrefix} CustomSecurityHubCreateMembersCustomResourceProviderHandler resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomSecurityHubCreateMembersCustomResourceProviderHandler31D82BF3: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomSecurityHubCreateMembersCustomResourceProviderRoleFD355CB6'],
          Properties: {
            Code: {
              S3Bucket: 'cdk-hnb659fds-assets-333333333333-us-east-1',
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': ['CustomSecurityHubCreateMembersCustomResourceProviderRoleFD355CB6', 'Arn'],
            },
            Runtime: 'nodejs14.x',
            Timeout: 900,
          },
        },
      },
    });
  });

  /**
   * CustomSecurityHubCreateMembersCustomResourceProviderRole resource configuration test
   */
  test(`${testNamePrefix} CustomSecurityHubCreateMembersCustomResourceProviderRole resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomSecurityHubCreateMembersCustomResourceProviderRoleFD355CB6: {
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
                      Action: ['organizations:ListAccounts'],
                      Condition: {
                        StringLikeIfExists: {
                          'organizations:ListAccounts': ['securityhub.amazonaws.com'],
                        },
                      },
                      Effect: 'Allow',
                      Resource: '*',
                      Sid: 'SecurityHubCreateMembersTaskOrganizationAction',
                    },
                    {
                      Action: [
                        'securityhub:CreateMembers',
                        'securityhub:DeleteMembers',
                        'securityhub:DisassociateMembers',
                        'securityhub:EnableSecurityHub',
                        'securityhub:ListMembers',
                        'securityhub:UpdateOrganizationConfiguration',
                      ],
                      Effect: 'Allow',
                      Resource: '*',
                      Sid: 'SecurityHubCreateMembersTaskSecurityHubActions',
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
   * GuardDutyDetectorConfig resource configuration test
   */
  test(`${testNamePrefix} GuardDutyDetectorConfig resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        GuardDutyDetectorConfigDD64B103: {
          Type: 'Custom::GuardDutyUpdateDetector',
          UpdateReplacePolicy: 'Delete',
          DeletionPolicy: 'Delete',
          DependsOn: [
            'CustomGuardDutyUpdateDetectorCustomResourceProviderLogGroup0E4B1900',
            'GuardDutyMembersD34CA003',
          ],
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomGuardDutyUpdateDetectorCustomResourceProviderHandler78DF0FF9', 'Arn'],
            },
            exportDestination: 's3',
            exportFrequency: 'FIFTEEN_MINUTES',
            isExportConfigEnable: true,
            region: 'us-east-1',
          },
        },
      },
    });
  });

  /**
   * GuardDutyMembers resource configuration test
   */
  test(`${testNamePrefix} GuardDutyMembers resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        GuardDutyMembersD34CA003: {
          Type: 'Custom::GuardDutyCreateMembers',
          UpdateReplacePolicy: 'Delete',
          DeletionPolicy: 'Delete',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomGuardDutyCreateMembersCustomResourceProviderHandler0A16C673', 'Arn'],
            },
            enableS3Protection: true,
            region: 'us-east-1',
          },
        },
      },
    });
  });

  /**
   * AuditManagerDefaultReportsDestination resource configuration test
   */
  test(`${testNamePrefix} AuditManagerDefaultReportsDestination resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        AuditManagerDefaultReportsDestinationAFD20D60: {
          Type: 'Custom::AuditManagerCreateDefaultReportsDestination',
          UpdateReplacePolicy: 'Delete',
          DeletionPolicy: 'Delete',
          DependsOn: ['CustomAuditManagerCreateDefaultReportsDestinationCustomResourceProviderLogGroupF5AC3566'],
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': [
                'CustomAuditManagerCreateDefaultReportsDestinationCustomResourceProviderHandler6BCBC433',
                'Arn',
              ],
            },
            defaultReportsDestinationType: 'S3',
            kmsKeyArn: { Ref: 'AcceleratorKeyLookup0C18DA36' },
            bucket: { 'Fn::Join': ['', ['s3://', { Ref: 'AuditManagerPublishingDestinationBucket74974FCF' }]] },
            region: 'us-east-1',
          },
        },
      },
    });
  });

  /**
   * DetectiveMembers resource configuration test
   */
  test(`${testNamePrefix} DetectiveMembers resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        DetectiveMembers42A16137: {
          Type: 'Custom::DetectiveCreateMembers',
          UpdateReplacePolicy: 'Delete',
          DeletionPolicy: 'Delete',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomDetectiveCreateMembersCustomResourceProviderHandler0A0D060D', 'Arn'],
            },
            region: 'us-east-1',
          },
        },
      },
    });
  });

  /**
   * DetectiveGraphConfig resource configuration test
   */
  test(`${testNamePrefix} DetectiveGraphConfig resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        DetectiveGraphConfig248C4B9F: {
          Type: 'Custom::DetectiveUpdateGraph',
          UpdateReplacePolicy: 'Delete',
          DeletionPolicy: 'Delete',
          DependsOn: ['CustomDetectiveUpdateGraphCustomResourceProviderLogGroupDF150426', 'DetectiveMembers42A16137'],
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomDetectiveUpdateGraphCustomResourceProviderHandlerD4473EC1', 'Arn'],
            },
            region: 'us-east-1',
          },
        },
      },
    });
  });

  /**
   * HighSnsTopic resource configuration test
   */
  test(`${testNamePrefix} HighSnsTopic resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        HighSnsTopicF69104E5: {
          Type: 'AWS::SNS::Topic',
          Properties: {
            DisplayName: 'AWS Accelerator - High Notifications',
            KmsMasterKeyId: {
              Ref: 'AcceleratorKeyLookup0C18DA36',
            },
            TopicName: 'aws-accelerator-HighNotifications',
          },
        },
      },
    });
  });

  /**
   * HighSnsTopicPolicy resource configuration test
   */
  test(`${testNamePrefix} HighSnsTopicPolicy resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        HighSnsTopicPolicy59BE4137: {
          Type: 'AWS::SNS::TopicPolicy',
          Properties: {
            PolicyDocument: {
              Statement: [
                {
                  Action: 'sns:Publish',
                  Effect: 'Allow',
                  Principal: {
                    Service: 'cloudwatch.amazonaws.com',
                  },
                  Resource: {
                    Ref: 'HighSnsTopicF69104E5',
                  },
                  Sid: '0',
                },
                {
                  Action: 'sns:Publish',
                  Effect: 'Allow',
                  Principal: {
                    Service: 'lambda.amazonaws.com',
                  },
                  Resource: {
                    Ref: 'HighSnsTopicF69104E5',
                  },
                  Sid: '1',
                },
                {
                  Action: 'sns:Publish',
                  Condition: {
                    StringEquals: {
                      'aws:PrincipalOrgID': {
                        Ref: 'Organization29A5FC3F',
                      },
                    },
                  },
                  Effect: 'Allow',
                  Principal: {
                    AWS: '*',
                  },
                  Resource: {
                    Ref: 'HighSnsTopicF69104E5',
                  },
                  Sid: '2',
                },
                {
                  Action: ['sns:ListSubscriptionsByTopic', 'sns:ListTagsForResource', 'sns:GetTopicAttributes'],
                  Condition: {
                    StringEquals: {
                      'aws:PrincipalOrgID': {
                        Ref: 'Organization29A5FC3F',
                      },
                    },
                  },
                  Effect: 'Allow',
                  Principal: {
                    AWS: '*',
                  },
                  Resource: {
                    Ref: 'HighSnsTopicF69104E5',
                  },
                  Sid: 'Allow Organization list topic',
                },
              ],
              Version: '2012-10-17',
            },
            Topics: [
              {
                Ref: 'HighSnsTopicF69104E5',
              },
            ],
          },
        },
      },
    });
  });

  /**
   * HighSnsTopichighalertamazoncom resource configuration test
   */
  test(`${testNamePrefix} HighSnsTopichighalertamazoncom resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        HighSnsTopichighalertamazoncom829BEACE: {
          Type: 'AWS::SNS::Subscription',
          Properties: {
            Endpoint: 'highalert@amazon.com',
            Protocol: 'email',
            TopicArn: {
              Ref: 'HighSnsTopicF69104E5',
            },
          },
        },
      },
    });
  });

  /**
   * LowSnsTopic resource configuration test
   */
  test(`${testNamePrefix} LowSnsTopic resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        LowSnsTopic53AD0F18: {
          Type: 'AWS::SNS::Topic',
          Properties: {
            DisplayName: 'AWS Accelerator - Low Notifications',
            KmsMasterKeyId: {
              Ref: 'AcceleratorKeyLookup0C18DA36',
            },
            TopicName: 'aws-accelerator-LowNotifications',
          },
        },
      },
    });
  });

  /**
   * LowSnsTopicPolicy resource configuration test
   */
  test(`${testNamePrefix} LowSnsTopicPolicy resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        LowSnsTopicPolicy0C1FEB12: {
          Type: 'AWS::SNS::TopicPolicy',
          Properties: {
            PolicyDocument: {
              Statement: [
                {
                  Action: 'sns:Publish',
                  Effect: 'Allow',
                  Principal: {
                    Service: 'cloudwatch.amazonaws.com',
                  },
                  Resource: {
                    Ref: 'LowSnsTopic53AD0F18',
                  },
                  Sid: '0',
                },
                {
                  Action: 'sns:Publish',
                  Effect: 'Allow',
                  Principal: {
                    Service: 'lambda.amazonaws.com',
                  },
                  Resource: {
                    Ref: 'LowSnsTopic53AD0F18',
                  },
                  Sid: '1',
                },
                {
                  Action: 'sns:Publish',
                  Condition: {
                    StringEquals: {
                      'aws:PrincipalOrgID': {
                        Ref: 'Organization29A5FC3F',
                      },
                    },
                  },
                  Effect: 'Allow',
                  Principal: {
                    AWS: '*',
                  },
                  Resource: {
                    Ref: 'LowSnsTopic53AD0F18',
                  },
                  Sid: '2',
                },
                {
                  Action: ['sns:ListSubscriptionsByTopic', 'sns:ListTagsForResource', 'sns:GetTopicAttributes'],
                  Condition: {
                    StringEquals: {
                      'aws:PrincipalOrgID': {
                        Ref: 'Organization29A5FC3F',
                      },
                    },
                  },
                  Effect: 'Allow',
                  Principal: {
                    AWS: '*',
                  },
                  Resource: {
                    Ref: 'LowSnsTopic53AD0F18',
                  },
                  Sid: 'Allow Organization list topic',
                },
              ],
              Version: '2012-10-17',
            },
            Topics: [
              {
                Ref: 'LowSnsTopic53AD0F18',
              },
            ],
          },
        },
      },
    });
  });

  /**
   * LowSnsTopiclowalertamazoncom resource configuration test
   */
  test(`${testNamePrefix} LowSnsTopiclowalertamazoncom resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        LowSnsTopiclowalertamazoncom68C4704C: {
          Type: 'AWS::SNS::Subscription',
          Properties: {
            Endpoint: 'lowalert@amazon.com',
            Protocol: 'email',
            TopicArn: {
              Ref: 'LowSnsTopic53AD0F18',
            },
          },
        },
      },
    });
  });

  /**
   * MacieMembers resource configuration test
   */
  test(`${testNamePrefix} MacieMembers resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        MacieMembers1B6840B4: {
          Type: 'Custom::MacieCreateMember',
          UpdateReplacePolicy: 'Delete',
          DeletionPolicy: 'Delete',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomMacieCreateMemberCustomResourceProviderHandler913F75DB', 'Arn'],
            },
            adminAccountId: '333333333333',
            region: 'us-east-1',
          },
        },
      },
    });
  });

  /**
   * MediumSnsTopic resource configuration test
   */
  test(`${testNamePrefix} MediumSnsTopic resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        MediumSnsTopic267CAB5B: {
          Type: 'AWS::SNS::Topic',
          Properties: {
            DisplayName: 'AWS Accelerator - Medium Notifications',
            KmsMasterKeyId: {
              Ref: 'AcceleratorKeyLookup0C18DA36',
            },
            TopicName: 'aws-accelerator-MediumNotifications',
          },
        },
      },
    });
  });

  /**
   * MediumSnsTopicPolicy resource configuration test
   */
  test(`${testNamePrefix} MediumSnsTopicPolicy resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        MediumSnsTopicPolicy0B54F62B: {
          Type: 'AWS::SNS::TopicPolicy',
          Properties: {
            PolicyDocument: {
              Statement: [
                {
                  Action: 'sns:Publish',
                  Effect: 'Allow',
                  Principal: {
                    Service: 'cloudwatch.amazonaws.com',
                  },
                  Resource: {
                    Ref: 'MediumSnsTopic267CAB5B',
                  },
                  Sid: '0',
                },
                {
                  Action: 'sns:Publish',
                  Effect: 'Allow',
                  Principal: {
                    Service: 'lambda.amazonaws.com',
                  },
                  Resource: {
                    Ref: 'MediumSnsTopic267CAB5B',
                  },
                  Sid: '1',
                },
                {
                  Action: 'sns:Publish',
                  Condition: {
                    StringEquals: {
                      'aws:PrincipalOrgID': {
                        Ref: 'Organization29A5FC3F',
                      },
                    },
                  },
                  Effect: 'Allow',
                  Principal: {
                    AWS: '*',
                  },
                  Resource: {
                    Ref: 'MediumSnsTopic267CAB5B',
                  },
                  Sid: '2',
                },
                {
                  Action: ['sns:ListSubscriptionsByTopic', 'sns:ListTagsForResource', 'sns:GetTopicAttributes'],
                  Condition: {
                    StringEquals: {
                      'aws:PrincipalOrgID': {
                        Ref: 'Organization29A5FC3F',
                      },
                    },
                  },
                  Effect: 'Allow',
                  Principal: {
                    AWS: '*',
                  },
                  Resource: {
                    Ref: 'MediumSnsTopic267CAB5B',
                  },
                  Sid: 'Allow Organization list topic',
                },
              ],
              Version: '2012-10-17',
            },
            Topics: [
              {
                Ref: 'MediumSnsTopic267CAB5B',
              },
            ],
          },
        },
      },
    });
  });

  /**
   * MediumSnsTopicmidalertamazoncom resource configuration test
   */
  test(`${testNamePrefix} MediumSnsTopicmidalertamazoncom resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        MediumSnsTopicmidalertamazoncom73D2DD2D: {
          Type: 'AWS::SNS::Subscription',
          Properties: {
            Endpoint: 'midalert@amazon.com',
            Protocol: 'email',
            TopicArn: {
              Ref: 'MediumSnsTopic267CAB5B',
            },
          },
        },
      },
    });
  });

  /**
   * Organization custom resource configuration test
   */
  test(`${testNamePrefix} Organization custom resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        Organization29A5FC3F: {
          Type: 'Custom::DescribeOrganization',
          UpdateReplacePolicy: 'Delete',
          DeletionPolicy: 'Delete',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomOrganizationsDescribeOrganizationCustomResourceProviderHandler4C6F49D1', 'Arn'],
            },
          },
        },
      },
    });
  });

  /**
   * SecurityHubMembers resource configuration test
   */
  test(`${testNamePrefix} SecurityHubMembers resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        SecurityHubMembers2A2B77C4: {
          Type: 'Custom::SecurityHubCreateMembers',
          UpdateReplacePolicy: 'Delete',
          DeletionPolicy: 'Delete',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomSecurityHubCreateMembersCustomResourceProviderHandler31D82BF3', 'Arn'],
            },
            region: 'us-east-1',
          },
        },
      },
    });
  });

  /**
   * AwsMacieExportConfigBucket resource configuration test
   */
  test(`${testNamePrefix} AwsMacieExportConfigBucket resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        AwsMacieExportConfigBucket83E4FE4E: {
          Type: 'AWS::S3::Bucket',
          UpdateReplacePolicy: 'Retain',
          DeletionPolicy: 'Retain',
          Properties: {
            BucketEncryption: {
              ServerSideEncryptionConfiguration: [
                {
                  ServerSideEncryptionByDefault: {
                    KMSMasterKeyID: {
                      Ref: 'AcceleratorKeyLookup0C18DA36',
                    },
                    SSEAlgorithm: 'aws:kms',
                  },
                },
              ],
            },
            BucketName: {
              'Fn::Join': [
                '',
                [
                  'aws-accelerator-org-macie-disc-repo-',
                  {
                    Ref: 'AWS::AccountId',
                  },
                  '-',
                  {
                    Ref: 'AWS::Region',
                  },
                ],
              ],
            },
            OwnershipControls: {
              Rules: [
                {
                  ObjectOwnership: 'BucketOwnerPreferred',
                },
              ],
            },
            PublicAccessBlockConfiguration: {
              BlockPublicAcls: true,
              BlockPublicPolicy: true,
              IgnorePublicAcls: true,
              RestrictPublicBuckets: true,
            },
            Tags: [
              {
                Key: 'aws-cdk:auto-macie-access-bucket',
                Value: 'true',
              },
            ],
            VersioningConfiguration: {
              Status: 'Enabled',
            },
          },
        },
      },
    });
  });

  /**
   * GuardDutyPublishingDestinationBucket resource configuration test
   */
  test(`${testNamePrefix} GuardDutyPublishingDestinationBucket resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        GuardDutyPublishingDestinationBucket1AFF21BB: {
          Type: 'AWS::S3::Bucket',
          UpdateReplacePolicy: 'Retain',
          DeletionPolicy: 'Retain',
          Metadata: {
            cdk_nag: {
              rules_to_suppress: [
                {
                  id: 'AwsSolutions-S1',
                  reason:
                    'GuardDutyPublishingDestinationBucket has server access logs disabled till the task for access logging completed.',
                },
              ],
            },
          },
          Properties: {
            BucketEncryption: {
              ServerSideEncryptionConfiguration: [
                {
                  ServerSideEncryptionByDefault: {
                    KMSMasterKeyID: {
                      Ref: 'AcceleratorKeyLookup0C18DA36',
                    },
                    SSEAlgorithm: 'aws:kms',
                  },
                },
              ],
            },
            BucketName: {
              'Fn::Join': [
                '',
                [
                  'aws-accelerator-org-gduty-pub-dest-',
                  {
                    Ref: 'AWS::AccountId',
                  },
                  '-',
                  {
                    Ref: 'AWS::Region',
                  },
                ],
              ],
            },
            OwnershipControls: {
              Rules: [
                {
                  ObjectOwnership: 'BucketOwnerPreferred',
                },
              ],
            },
            PublicAccessBlockConfiguration: {
              BlockPublicAcls: true,
              BlockPublicPolicy: true,
              IgnorePublicAcls: true,
              RestrictPublicBuckets: true,
            },
            Tags: [
              {
                Key: 'aws-cdk:auto-guardduty-access-bucket',
                Value: 'true',
              },
            ],
            VersioningConfiguration: {
              Status: 'Enabled',
            },
          },
        },
      },
    });
  });

  /**
   * GuardDutyPublishingDestinationBucketPolicy resource configuration test
   */
  test(`${testNamePrefix} GuardDutyPublishingDestinationBucketPolicy resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        GuardDutyPublishingDestinationBucketPolicyAEFA499A: {
          Type: 'AWS::S3::BucketPolicy',
          Properties: {
            Bucket: {
              Ref: 'GuardDutyPublishingDestinationBucket1AFF21BB',
            },
            PolicyDocument: {
              Statement: [
                {
                  Action: 's3:*',
                  Condition: {
                    Bool: {
                      'aws:SecureTransport': 'false',
                    },
                  },
                  Effect: 'Deny',
                  Principal: {
                    AWS: '*',
                  },
                  Resource: [
                    {
                      'Fn::GetAtt': ['GuardDutyPublishingDestinationBucket1AFF21BB', 'Arn'],
                    },
                    {
                      'Fn::Join': [
                        '',
                        [
                          {
                            'Fn::GetAtt': ['GuardDutyPublishingDestinationBucket1AFF21BB', 'Arn'],
                          },
                          '/*',
                        ],
                      ],
                    },
                  ],
                  Sid: 'deny-insecure-connections',
                },
                {
                  Action: [
                    's3:GetObject*',
                    's3:GetBucket*',
                    's3:List*',
                    's3:DeleteObject*',
                    's3:PutObject',
                    's3:PutObjectLegalHold',
                    's3:PutObjectRetention',
                    's3:PutObjectTagging',
                    's3:PutObjectVersionTagging',
                    's3:Abort*',
                  ],
                  Effect: 'Allow',
                  Principal: {
                    Service: 'guardduty.amazonaws.com',
                  },
                  Resource: [
                    {
                      'Fn::GetAtt': ['GuardDutyPublishingDestinationBucket1AFF21BB', 'Arn'],
                    },
                    {
                      'Fn::Join': [
                        '',
                        [
                          {
                            'Fn::GetAtt': ['GuardDutyPublishingDestinationBucket1AFF21BB', 'Arn'],
                          },
                          '/*',
                        ],
                      ],
                    },
                  ],
                },
                {
                  Action: ['s3:GetBucketLocation', 's3:PutObject'],
                  Condition: {
                    StringEquals: {
                      'aws:PrincipalOrgID': {
                        Ref: 'Organization29A5FC3F',
                      },
                    },
                  },
                  Effect: 'Allow',
                  Principal: {
                    AWS: '*',
                  },
                  Resource: [
                    {
                      'Fn::GetAtt': ['GuardDutyPublishingDestinationBucket1AFF21BB', 'Arn'],
                    },
                    {
                      'Fn::Join': [
                        '',
                        [
                          {
                            'Fn::GetAtt': ['GuardDutyPublishingDestinationBucket1AFF21BB', 'Arn'],
                          },
                          '/*',
                        ],
                      ],
                    },
                  ],
                  Sid: 'Allow Organization principals to use of the bucket',
                },
              ],
              Version: '2012-10-17',
            },
          },
        },
      },
    });
  });

  /**
   * AwsMacieExportConfigBucketPolicy resource configuration test
   */
  test(`${testNamePrefix} AwsMacieExportConfigBucketPolicy resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        AwsMacieExportConfigBucketPolicy2C40E2D4: {
          Type: 'AWS::S3::BucketPolicy',
          Properties: {
            Bucket: {
              Ref: 'AwsMacieExportConfigBucket83E4FE4E',
            },
            PolicyDocument: {
              Statement: [
                {
                  Action: 's3:*',
                  Condition: {
                    Bool: {
                      'aws:SecureTransport': 'false',
                    },
                  },
                  Effect: 'Deny',
                  Principal: {
                    AWS: '*',
                  },
                  Resource: [
                    {
                      'Fn::GetAtt': ['AwsMacieExportConfigBucket83E4FE4E', 'Arn'],
                    },
                    {
                      'Fn::Join': [
                        '',
                        [
                          {
                            'Fn::GetAtt': ['AwsMacieExportConfigBucket83E4FE4E', 'Arn'],
                          },
                          '/*',
                        ],
                      ],
                    },
                  ],
                  Sid: 'deny-insecure-connections',
                },
                {
                  Action: [
                    's3:GetObject*',
                    's3:GetBucket*',
                    's3:List*',
                    's3:DeleteObject*',
                    's3:PutObject',
                    's3:PutObjectLegalHold',
                    's3:PutObjectRetention',
                    's3:PutObjectTagging',
                    's3:PutObjectVersionTagging',
                    's3:Abort*',
                  ],
                  Effect: 'Allow',
                  Principal: {
                    Service: 'macie.amazonaws.com',
                  },
                  Resource: [
                    {
                      'Fn::GetAtt': ['AwsMacieExportConfigBucket83E4FE4E', 'Arn'],
                    },
                    {
                      'Fn::Join': [
                        '',
                        [
                          {
                            'Fn::GetAtt': ['AwsMacieExportConfigBucket83E4FE4E', 'Arn'],
                          },
                          '/*',
                        ],
                      ],
                    },
                  ],
                },
                {
                  Action: ['s3:GetBucketLocation', 's3:PutObject'],
                  Condition: {
                    StringEquals: {
                      'aws:PrincipalOrgID': {
                        Ref: 'Organization29A5FC3F',
                      },
                    },
                  },
                  Effect: 'Allow',
                  Principal: {
                    AWS: '*',
                  },
                  Resource: [
                    {
                      'Fn::GetAtt': ['AwsMacieExportConfigBucket83E4FE4E', 'Arn'],
                    },
                    {
                      'Fn::Join': [
                        '',
                        [
                          {
                            'Fn::GetAtt': ['AwsMacieExportConfigBucket83E4FE4E', 'Arn'],
                          },
                          '/*',
                        ],
                      ],
                    },
                  ],
                  Sid: 'Allow Organization principals to use of the bucket',
                },
              ],
              Version: '2012-10-17',
            },
          },
        },
      },
    });
  });
});
