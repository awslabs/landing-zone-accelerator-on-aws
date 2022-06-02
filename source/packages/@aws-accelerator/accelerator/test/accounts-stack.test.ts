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
import { AccountsStack } from '../lib/stacks/accounts-stack';
import { AcceleratorStackNames } from '../lib/accelerator';
import { AcceleratorStage } from '../lib/accelerator-stage';
import {
  ACCOUNT_CONFIG,
  GLOBAL_CONFIG,
  IAM_CONFIG,
  NETWORK_CONFIG,
  ORGANIZATION_CONFIG,
  SECURITY_CONFIG,
} from './configs/test-config';
import * as path from 'path';
import { AcceleratorStackProps } from '../lib/stacks/accelerator-stack';

//import { SynthUtils } from '@aws-cdk/assert';

const testNamePrefix = 'Construct(AccountsStack): ';

/**
 * AccountsStack
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

const stack = new AccountsStack(
  app,
  `${AcceleratorStackNames[AcceleratorStage.ACCOUNTS]}-${env.account}-${env.region}`,
  props,
);

/**
 * AccountsStack construct test
 */

describe('AccountsStack', () => {
  // test(`${testNamePrefix} Snapshot Test`, () => {
  //   expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
  // });

  /**
   * Number of AttachPolicy custom resource test
   */
  test(`${testNamePrefix} AttachPolicy custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::AttachPolicy', 2);
  });

  /**
   * Number of SSM parameters resource test
   */
  test(`${testNamePrefix} SSM parameters resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::SSM::Parameter', 3);
  });

  /**
   * Number of InviteAccountToOrganization custom resource test
   */
  test(`${testNamePrefix} InviteAccountToOrganization custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::InviteAccountToOrganization', 3);
  });

  /**
   * Number of Lambda Function resource test
   */
  test(`${testNamePrefix} Lambda Function resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Lambda::Function', 5);
  });

  /**
   * Number of IAM role resource test
   */
  test(`${testNamePrefix} IAM role resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::IAM::Role', 5);
  });

  /**
   * Number of CreatePolicy custom resource test
   */
  test(`${testNamePrefix} CreatePolicy custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::CreatePolicy', 2);
  });

  /**
   * Number of EnablePolicyType custom resource test
   */
  test(`${testNamePrefix} EnablePolicyType custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::EnablePolicyType', 1);
  });

  /**
   * AttachDenyDeleteVpcFlowLogsManagement custom resource configuration test
   */
  test(`${testNamePrefix} AttachDenyDeleteVpcFlowLogsManagement resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        AttachDenyDeleteVpcFlowLogsManagementEF9C9CA8: {
          Type: 'Custom::AttachPolicy',
          UpdateReplacePolicy: 'Delete',
          DeletionPolicy: 'Delete',
          DependsOn: [
            'CustomOrganizationsAttachPolicyCustomResourceProviderLogGroup03FEC039',
            'ManagementOrganizationAccount93F8866A',
          ],
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomOrganizationsAttachPolicyCustomResourceProviderHandlerB3233202', 'Arn'],
            },
            policyId: {
              Ref: 'DenyDeleteVpcFlowLogsD2E9D6EC',
            },
            targetId: '333333333333',
            type: 'SERVICE_CONTROL_POLICY',
          },
        },
      },
    });
  });

  /**
   * AttachDenyDeleteVpcFlowLogsSecurity custom resource configuration test
   */
  test(`${testNamePrefix} AttachDenyDeleteVpcFlowLogsSecurity resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        AttachDenyDeleteVpcFlowLogsSecurity37915A30: {
          Type: 'Custom::AttachPolicy',
          UpdateReplacePolicy: 'Delete',
          DeletionPolicy: 'Delete',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomOrganizationsAttachPolicyCustomResourceProviderHandlerB3233202', 'Arn'],
            },
            partition: {
              Ref: 'AWS::Partition',
            },
            policyId: {
              Ref: 'DenyDeleteVpcFlowLogsD2E9D6EC',
            },
            targetId: 'Security-id',
            type: 'SERVICE_CONTROL_POLICY',
          },
        },
      },
    });
  });

  /**
   * AuditOrganizationAccount custom resource configuration test
   */
  test(`${testNamePrefix} AuditOrganizationAccount custom resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        AuditOrganizationAccount11304D9B: {
          Type: 'Custom::InviteAccountToOrganization',
          UpdateReplacePolicy: 'Delete',
          DeletionPolicy: 'Delete',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomInviteAccountToOrganizationCustomResourceProviderHandlerAEB26818', 'Arn'],
            },
            accountId: '222222222222',
            roleArn: {
              'Fn::Join': [
                '',
                [
                  'arn:',
                  {
                    Ref: 'AWS::Partition',
                  },
                  ':iam::222222222222:role/AWSControlTowerExecution',
                ],
              ],
            },
          },
        },
      },
    });
  });

  /**
   * CustomEnablePolicyTypeCustomResourceProviderHandler lambda function resource configuration test
   */
  test(`${testNamePrefix} CustomEnablePolicyTypeCustomResourceProviderHandler lambda function resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomEnablePolicyTypeCustomResourceProviderHandlerC244F9E1: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomEnablePolicyTypeCustomResourceProviderRoleAE71B2CA'],
          Properties: {
            Code: {
              S3Bucket: 'cdk-hnb659fds-assets-333333333333-us-east-1',
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': ['CustomEnablePolicyTypeCustomResourceProviderRoleAE71B2CA', 'Arn'],
            },
            Runtime: 'nodejs14.x',
            Timeout: 900,
          },
        },
      },
    });
  });

  /**
   * CustomEnablePolicyTypeCustomResourceProviderRole resource configuration test
   */
  test(`${testNamePrefix} CustomEnablePolicyTypeCustomResourceProviderRole resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomEnablePolicyTypeCustomResourceProviderRoleAE71B2CA: {
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
                        'organizations:DisablePolicyType',
                        'organizations:EnablePolicyType',
                        'organizations:ListRoots',
                        'organizations:ListPoliciesForTarget',
                        'organizations:ListTargetsForPolicy',
                        'organizations:DescribeEffectivePolicy',
                        'organizations:DescribePolicy',
                        'organizations:DisableAWSServiceAccess',
                        'organizations:DetachPolicy',
                        'organizations:DeletePolicy',
                        'organizations:DescribeAccount',
                        'organizations:ListAWSServiceAccessForOrganization',
                        'organizations:ListPolicies',
                        'organizations:ListAccountsForParent',
                        'organizations:ListAccounts',
                        'organizations:EnableAWSServiceAccess',
                        'organizations:ListCreateAccountStatus',
                        'organizations:UpdatePolicy',
                        'organizations:DescribeOrganizationalUnit',
                        'organizations:AttachPolicy',
                        'organizations:ListParents',
                        'organizations:ListOrganizationalUnitsForParent',
                        'organizations:CreatePolicy',
                        'organizations:DescribeCreateAccountStatus',
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
   * CustomInviteAccountToOrganizationCustomResourceProviderHandler lambda function resource configuration test
   */
  test(`${testNamePrefix} CustomInviteAccountToOrganizationCustomResourceProviderHandler lambda function resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomInviteAccountToOrganizationCustomResourceProviderHandlerAEB26818: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomInviteAccountToOrganizationCustomResourceProviderRole0F64F419'],
          Properties: {
            Code: {
              S3Bucket: 'cdk-hnb659fds-assets-333333333333-us-east-1',
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': ['CustomInviteAccountToOrganizationCustomResourceProviderRole0F64F419', 'Arn'],
            },
            Runtime: 'nodejs14.x',
            Timeout: 900,
          },
        },
      },
    });
  });

  /**
   * CustomInviteAccountToOrganizationCustomResourceProviderRole resource configuration test
   */
  test(`${testNamePrefix} CustomInviteAccountToOrganizationCustomResourceProviderRole resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomInviteAccountToOrganizationCustomResourceProviderRole0F64F419: {
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
                        'sts:AssumeRole',
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
   * CustomOrganizationsAttachPolicyCustomResourceProviderHandler lambda function resource configuration test
   */
  test(`${testNamePrefix} CustomOrganizationsAttachPolicyCustomResourceProviderHandler lambda function resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomOrganizationsAttachPolicyCustomResourceProviderHandlerB3233202: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomOrganizationsAttachPolicyCustomResourceProviderRole051E00A6'],
          Properties: {
            Code: {
              S3Bucket: 'cdk-hnb659fds-assets-333333333333-us-east-1',
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': ['CustomOrganizationsAttachPolicyCustomResourceProviderRole051E00A6', 'Arn'],
            },
            Runtime: 'nodejs14.x',
            Timeout: 900,
          },
        },
      },
    });
  });

  /**
   * CustomOrganizationsAttachPolicyCustomResourceProviderRole resource configuration test
   */
  test(`${testNamePrefix} CustomOrganizationsAttachPolicyCustomResourceProviderRole resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomOrganizationsAttachPolicyCustomResourceProviderRole051E00A6: {
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
                        'organizations:AttachPolicy',
                        'organizations:DetachPolicy',
                        'organizations:ListPoliciesForTarget',
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
   * CustomOrganizationsCreatePolicyCustomResourceProviderHandler lambda function resource configuration test
   */
  test(`${testNamePrefix} CustomOrganizationsCreatePolicyCustomResourceProviderHandler lambda function resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomOrganizationsCreatePolicyCustomResourceProviderHandler7A188619: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomOrganizationsCreatePolicyCustomResourceProviderRoleBA0ADB43'],
          Properties: {
            Code: {
              S3Bucket: 'cdk-hnb659fds-assets-333333333333-us-east-1',
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': ['CustomOrganizationsCreatePolicyCustomResourceProviderRoleBA0ADB43', 'Arn'],
            },
            Runtime: 'nodejs14.x',
            Timeout: 900,
          },
        },
      },
    });
  });

  /**
   * CustomOrganizationsCreatePolicyCustomResourceProviderRole resource configuration test
   */
  test(`${testNamePrefix} CustomOrganizationsCreatePolicyCustomResourceProviderRole resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomOrganizationsCreatePolicyCustomResourceProviderRoleBA0ADB43: {
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
                        'organizations:CreatePolicy',
                        'organizations:ListPolicies',
                        'organizations:UpdatePolicy',
                      ],
                      Effect: 'Allow',
                      Resource: '*',
                    },
                    {
                      Action: ['s3:GetObject'],
                      Effect: 'Allow',
                      Resource: {
                        'Fn::Join': [
                          '',
                          [
                            'arn:',
                            {
                              Ref: 'AWS::Partition',
                            },
                            ':s3:::cdk-hnb659fds-assets-333333333333-us-east-1/*',
                          ],
                        ],
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
   * DenyDeleteVpcFlowLogs custom resource configuration test
   */
  test(`${testNamePrefix} DenyDeleteVpcFlowLogs custom resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        DenyDeleteVpcFlowLogsD2E9D6EC: {
          Type: 'Custom::CreatePolicy',
          UpdateReplacePolicy: 'Delete',
          DeletionPolicy: 'Delete',
          DependsOn: [
            'CustomOrganizationsCreatePolicyCustomResourceProviderLogGroup019B74A9',
            'enablePolicyTypeScpB4BC96BE',
          ],
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomOrganizationsCreatePolicyCustomResourceProviderHandler7A188619', 'Arn'],
            },
            bucket: 'cdk-hnb659fds-assets-333333333333-us-east-1',
            name: 'DenyDeleteVpcFlowLogs',
            type: 'SERVICE_CONTROL_POLICY',
          },
        },
      },
    });
  });

  /**
   * LogArchiveOrganizationAccount custom resource configuration test
   */
  test(`${testNamePrefix} LogArchiveOrganizationAccount custom resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        LogArchiveOrganizationAccount09183FEA: {
          Type: 'Custom::InviteAccountToOrganization',
          UpdateReplacePolicy: 'Delete',
          DeletionPolicy: 'Delete',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomInviteAccountToOrganizationCustomResourceProviderHandlerAEB26818', 'Arn'],
            },
            accountId: '111111111111',
            roleArn: {
              'Fn::Join': [
                '',
                [
                  'arn:',
                  {
                    Ref: 'AWS::Partition',
                  },
                  ':iam::111111111111:role/AWSControlTowerExecution',
                ],
              ],
            },
          },
        },
      },
    });
  });

  /**
   * ManagementOrganizationAccount custom resource configuration test
   */
  test(`${testNamePrefix} ManagementOrganizationAccount custom resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        ManagementOrganizationAccount93F8866A: {
          Type: 'Custom::InviteAccountToOrganization',
          UpdateReplacePolicy: 'Delete',
          DeletionPolicy: 'Delete',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomInviteAccountToOrganizationCustomResourceProviderHandlerAEB26818', 'Arn'],
            },
            accountId: '333333333333',
            roleArn: {
              'Fn::Join': [
                '',
                [
                  'arn:',
                  {
                    Ref: 'AWS::Partition',
                  },
                  ':iam::333333333333:role/AWSControlTowerExecution',
                ],
              ],
            },
          },
        },
      },
    });
  });

  /**
   * SSM parameter SsmParamAcceleratorVersion resource configuration test
   */
  test(`${testNamePrefix} SSM parameter SsmParamAcceleratorVersion resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        SsmParamAcceleratorVersionFF83282D: {
          Type: 'AWS::SSM::Parameter',
          Properties: {
            Name: '/accelerator/AWSAccelerator-AccountsStack-333333333333-us-east-1/version',
            Type: 'String',
            Value: '1.0.1',
          },
        },
      },
    });
  });

  /**
   * SSM parameter SsmParamStackId resource configuration test
   */
  test(`${testNamePrefix} SSM parameter SsmParamStackId resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        SsmParamStackId521A78D3: {
          Type: 'AWS::SSM::Parameter',
          Properties: {
            Name: '/accelerator/AWSAccelerator-AccountsStack-333333333333-us-east-1/stack-id',
            Type: 'String',
            Value: {
              Ref: 'AWS::StackId',
            },
          },
        },
      },
    });
  });

  /**
   * EnablePolicyType custom resource configuration test
   */
  test(`${testNamePrefix} EnablePolicyType custom resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        enablePolicyTypeScpB4BC96BE: {
          Type: 'Custom::EnablePolicyType',
          UpdateReplacePolicy: 'Delete',
          DeletionPolicy: 'Delete',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomEnablePolicyTypeCustomResourceProviderHandlerC244F9E1', 'Arn'],
            },
            policyType: 'SERVICE_CONTROL_POLICY',
          },
        },
      },
    });
  });
});
