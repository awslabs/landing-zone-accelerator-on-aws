/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import { SynthUtils } from '@aws-cdk/assert';
import { InstallerStack } from '../lib/installer-stack';

// Test prefix
const testNamePrefix = 'Stack(installer): ';

//Initialize stack from management account with tester pipeline
const managementAccountStackWithTesterPipeline = new InstallerStack(
  new cdk.App(),
  'AWSAccelerator-Test-InstallerStack',
  {
    synthesizer: new cdk.DefaultStackSynthesizer({
      generateBootstrapVersionRule: false,
    }),
    useExternalPipelineAccount: false,
    enableTester: true,
    managementCrossAccountRoleName: 'AWSControlTowerExecution',
  },
);

// Initialize stack from management account without tester pipeline
const managementAccountStackWithoutTesterPipeline = new InstallerStack(
  new cdk.App(),
  'AWSAccelerator-Test-InstallerStack',
  {
    synthesizer: new cdk.DefaultStackSynthesizer({
      generateBootstrapVersionRule: false,
    }),
    useExternalPipelineAccount: false,
    enableTester: false,
  },
);

//Initialize stack from external pipeline account with tester pipeline
const externalPipelineAccountStackWithTesterPipeline = new InstallerStack(
  new cdk.App(),
  'AWSAccelerator-Test-InstallerStack',
  {
    synthesizer: new cdk.DefaultStackSynthesizer({
      generateBootstrapVersionRule: false,
    }),
    useExternalPipelineAccount: true,
    enableTester: true,
    managementCrossAccountRoleName: 'AWSControlTowerExecution',
  },
);

//Initialize stack from external pipeline account without tester pipeline
const externalPipelineAccountStackWithoutTesterPipeline = new InstallerStack(
  new cdk.App(),
  'AWSAccelerator-Test-InstallerStack',
  {
    synthesizer: new cdk.DefaultStackSynthesizer({
      generateBootstrapVersionRule: false,
    }),
    useExternalPipelineAccount: true,
    enableTester: false,
  },
);

/**
 * CentralLogsBucket construct test
 */
describe('InstallerStack', () => {
  /**
   * Snapshot test - management account stack with tester pipeline enabled
   */
  test(`${testNamePrefix} Snapshot test - management account stack with tester pipeline enabled`, () => {
    expect(SynthUtils.toCloudFormation(managementAccountStackWithTesterPipeline)).toMatchSnapshot();
  });

  /**
   * Snapshot test - management account stack without tester pipeline enabled
   */
  test(`${testNamePrefix} Snapshot test - management account stack without tester pipeline enabled`, () => {
    expect(SynthUtils.toCloudFormation(managementAccountStackWithoutTesterPipeline)).toMatchSnapshot();
  });

  /**
   * Snapshot test - external pipeline account stack with tester pipeline enabled
   */
  test(`${testNamePrefix} Snapshot test - external pipeline account stack with tester pipeline enabled`, () => {
    expect(SynthUtils.toCloudFormation(externalPipelineAccountStackWithTesterPipeline)).toMatchSnapshot();
  });

  /**
   * Snapshot test - external pipeline account stack without tester pipeline enabled
   */
  test(`${testNamePrefix} Snapshot test - external pipeline account stack without tester pipeline enabled`, () => {
    expect(SynthUtils.toCloudFormation(externalPipelineAccountStackWithoutTesterPipeline)).toMatchSnapshot();
  });

  // **************************************
  // Fine grained test cases
  // **************************************

  /**
   * Management account pipeline stack - CloudFormation interface metadata test
   */
  test(`${testNamePrefix} Management account pipeline stack - CloudFormation interface metadata test`, () => {
    cdk.assertions.Template.fromStack(managementAccountStackWithTesterPipeline).templateMatches({
      Metadata: {
        'AWS::CloudFormation::Interface': {
          ParameterGroups: [
            {
              Label: {
                default: 'Git Repository Configuration',
              },
              Parameters: ['RepositorySource', 'RepositoryName', 'RepositoryBranchName'],
            },
            {
              Label: {
                default: 'Pipeline Configuration',
              },
              Parameters: ['EnableApprovalStage', 'ApprovalStageNotifyEmailList'],
            },
            {
              Label: {
                default: 'Mandatory Accounts Configuration',
              },
              Parameters: ['ManagementAccountEmail', 'LogArchiveAccountEmail', 'AuditAccountEmail'],
            },
          ],
          ParameterLabels: {
            EnableApprovalStage: {
              default: 'Enable Approval Stage',
            },
            ApprovalStageNotifyEmailList: {
              default: 'Manual Approval Stage notification email list',
            },
            RepositoryBranchName: {
              default: 'Branch Name',
            },
            RepositoryName: {
              default: 'Repository Name',
            },
            RepositorySource: {
              default: 'Source',
            },
          },
        },
      },
    });
  });

  /**
   * External pipeline account stack - CloudFormation interface metadata test
   */
  test(`${testNamePrefix} External pipeline account stack - CloudFormation interface metadata test`, () => {
    cdk.assertions.Template.fromStack(externalPipelineAccountStackWithTesterPipeline).templateMatches({
      Metadata: {
        'AWS::CloudFormation::Interface': {
          ParameterGroups: [
            {
              Label: {
                default: 'Git Repository Configuration',
              },
              Parameters: ['RepositorySource', 'RepositoryName', 'RepositoryBranchName'],
            },
            {
              Label: {
                default: 'Pipeline Configuration',
              },
              Parameters: ['EnableApprovalStage', 'ApprovalStageNotifyEmailList'],
            },
            {
              Label: {
                default: 'Mandatory Accounts Configuration',
              },
              Parameters: ['ManagementAccountEmail', 'LogArchiveAccountEmail', 'AuditAccountEmail'],
            },
            {
              Label: {
                default: 'Target Environment Configuration',
              },
              Parameters: ['AcceleratorQualifier', 'ManagementAccountId', 'ManagementAccountRoleName'],
            },
          ],
          ParameterLabels: {
            AuditAccountEmail: {
              default: 'Audit Account Email',
            },
            EnableApprovalStage: {
              default: 'Enable Approval Stage',
            },
            ApprovalStageNotifyEmailList: {
              default: 'Manual Approval Stage notification email list',
            },
            LogArchiveAccountEmail: {
              default: 'Log Archive Account Email',
            },
            ManagementAccountEmail: {
              default: 'Management Account Email',
            },
            RepositoryBranchName: {
              default: 'Branch Name',
            },
            RepositoryName: {
              default: 'Repository Name',
            },
            RepositorySource: {
              default: 'Source',
            },
          },
        },
      },
    });
  });

  /**
   * Management account pipeline stack - Installer project iam role default policy resource test
   */
  test(`${testNamePrefix} Management account pipeline stack - Installer project iam role default policy resource test`, () => {
    cdk.assertions.Template.fromStack(managementAccountStackWithTesterPipeline).templateMatches({
      Resources: {
        InstallerRoleDefaultPolicyC01C83A5: {
          Type: 'AWS::IAM::Policy',
          Properties: {
            PolicyDocument: {
              Statement: [
                {
                  Action: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
                  Effect: 'Allow',
                  Resource: [
                    {
                      'Fn::Join': [
                        '',
                        [
                          'arn:',
                          {
                            Ref: 'AWS::Partition',
                          },
                          ':logs:',
                          {
                            Ref: 'AWS::Region',
                          },
                          ':',
                          {
                            Ref: 'AWS::AccountId',
                          },
                          ':log-group:/aws/codebuild/',
                          {
                            Ref: 'InstallerProject879FF821',
                          },
                        ],
                      ],
                    },
                    {
                      'Fn::Join': [
                        '',
                        [
                          'arn:',
                          {
                            Ref: 'AWS::Partition',
                          },
                          ':logs:',
                          {
                            Ref: 'AWS::Region',
                          },
                          ':',
                          {
                            Ref: 'AWS::AccountId',
                          },
                          ':log-group:/aws/codebuild/',
                          {
                            Ref: 'InstallerProject879FF821',
                          },
                          ':*',
                        ],
                      ],
                    },
                  ],
                },
                {
                  Action: [
                    'codebuild:CreateReportGroup',
                    'codebuild:CreateReport',
                    'codebuild:UpdateReport',
                    'codebuild:BatchPutTestCases',
                    'codebuild:BatchPutCodeCoverages',
                  ],
                  Effect: 'Allow',
                  Resource: {
                    'Fn::Join': [
                      '',
                      [
                        'arn:',
                        {
                          Ref: 'AWS::Partition',
                        },
                        ':codebuild:',
                        {
                          Ref: 'AWS::Region',
                        },
                        ':',
                        {
                          Ref: 'AWS::AccountId',
                        },
                        ':report-group/',
                        {
                          Ref: 'InstallerProject879FF821',
                        },
                        '-*',
                      ],
                    ],
                  },
                },
                {
                  Action: ['kms:Decrypt', 'kms:Encrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*'],
                  Effect: 'Allow',
                  Resource: {
                    'Fn::GetAtt': ['InstallerKey2A6A8C6D', 'Arn'],
                  },
                },
                {
                  Action: ['s3:GetObject*', 's3:GetBucket*', 's3:List*'],
                  Effect: 'Allow',
                  Resource: [
                    {
                      'Fn::GetAtt': ['SecureBucket747CD8C0', 'Arn'],
                    },
                    {
                      'Fn::Join': [
                        '',
                        [
                          {
                            'Fn::GetAtt': ['SecureBucket747CD8C0', 'Arn'],
                          },
                          '/*',
                        ],
                      ],
                    },
                  ],
                },
                {
                  Action: ['kms:Decrypt', 'kms:DescribeKey'],
                  Effect: 'Allow',
                  Resource: {
                    'Fn::GetAtt': ['InstallerKey2A6A8C6D', 'Arn'],
                  },
                },
              ],
              Version: '2012-10-17',
            },
            PolicyName: 'InstallerRoleDefaultPolicyC01C83A5',
            Roles: [
              {
                Ref: 'InstallerRole13277E70',
              },
            ],
          },
        },
      },
    });
  });

  /**
   * External pipeline account stack - Installer project iam role default policy resource test
   */
  test(`${testNamePrefix} External pipeline account stack - Installer project iam role default policy resource test`, () => {
    cdk.assertions.Template.fromStack(externalPipelineAccountStackWithTesterPipeline).templateMatches({
      Resources: {
        InstallerRoleDefaultPolicyC01C83A5: {
          Type: 'AWS::IAM::Policy',
          Properties: {
            PolicyDocument: {
              Statement: [
                {
                  Action: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
                  Effect: 'Allow',
                  Resource: [
                    {
                      'Fn::Join': [
                        '',
                        [
                          'arn:',
                          {
                            Ref: 'AWS::Partition',
                          },
                          ':logs:',
                          {
                            Ref: 'AWS::Region',
                          },
                          ':',
                          {
                            Ref: 'AWS::AccountId',
                          },
                          ':log-group:/aws/codebuild/',
                          {
                            Ref: 'InstallerProject879FF821',
                          },
                        ],
                      ],
                    },
                    {
                      'Fn::Join': [
                        '',
                        [
                          'arn:',
                          {
                            Ref: 'AWS::Partition',
                          },
                          ':logs:',
                          {
                            Ref: 'AWS::Region',
                          },
                          ':',
                          {
                            Ref: 'AWS::AccountId',
                          },
                          ':log-group:/aws/codebuild/',
                          {
                            Ref: 'InstallerProject879FF821',
                          },
                          ':*',
                        ],
                      ],
                    },
                  ],
                },
                {
                  Action: [
                    'codebuild:CreateReportGroup',
                    'codebuild:CreateReport',
                    'codebuild:UpdateReport',
                    'codebuild:BatchPutTestCases',
                    'codebuild:BatchPutCodeCoverages',
                  ],
                  Effect: 'Allow',
                  Resource: {
                    'Fn::Join': [
                      '',
                      [
                        'arn:',
                        {
                          Ref: 'AWS::Partition',
                        },
                        ':codebuild:',
                        {
                          Ref: 'AWS::Region',
                        },
                        ':',
                        {
                          Ref: 'AWS::AccountId',
                        },
                        ':report-group/',
                        {
                          Ref: 'InstallerProject879FF821',
                        },
                        '-*',
                      ],
                    ],
                  },
                },
                {
                  Action: ['kms:Decrypt', 'kms:Encrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*'],
                  Effect: 'Allow',
                  Resource: {
                    'Fn::GetAtt': ['InstallerKey2A6A8C6D', 'Arn'],
                  },
                },
                {
                  Action: ['s3:GetObject*', 's3:GetBucket*', 's3:List*'],
                  Effect: 'Allow',
                  Resource: [
                    {
                      'Fn::GetAtt': ['SecureBucket747CD8C0', 'Arn'],
                    },
                    {
                      'Fn::Join': [
                        '',
                        [
                          {
                            'Fn::GetAtt': ['SecureBucket747CD8C0', 'Arn'],
                          },
                          '/*',
                        ],
                      ],
                    },
                  ],
                },
                {
                  Action: ['kms:Decrypt', 'kms:DescribeKey'],
                  Effect: 'Allow',
                  Resource: {
                    'Fn::GetAtt': ['InstallerKey2A6A8C6D', 'Arn'],
                  },
                },
              ],
              Version: '2012-10-17',
            },
            PolicyName: 'InstallerRoleDefaultPolicyC01C83A5',
            Roles: [
              {
                Ref: 'InstallerRole13277E70',
              },
            ],
          },
        },
      },
    });
  });

  /**
   * Management account pipeline stack - Installer project iam role resource test
   */
  test(`${testNamePrefix} Management account pipeline stack - Installer project iam role resource test`, () => {
    cdk.assertions.Template.fromStack(managementAccountStackWithTesterPipeline).templateMatches({
      Resources: {
        InstallerRole13277E70: {
          Properties: {
            AssumeRolePolicyDocument: {
              Statement: [
                {
                  Action: 'sts:AssumeRole',
                  Effect: 'Allow',
                  Principal: {
                    Service: 'codebuild.amazonaws.com',
                  },
                },
              ],
              Version: '2012-10-17',
            },
            ManagedPolicyArns: [
              {
                'Fn::Join': [
                  '',
                  [
                    'arn:',
                    {
                      Ref: 'AWS::Partition',
                    },
                    ':iam::aws:policy/AdministratorAccess',
                  ],
                ],
              },
            ],
          },
          Type: 'AWS::IAM::Role',
        },
      },
    });
  });

  /**
   * External pipeline account stack - Installer project iam role resource test
   */
  test(`${testNamePrefix} External pipeline account stack - Installer project iam role resource test`, () => {
    cdk.assertions.Template.fromStack(externalPipelineAccountStackWithTesterPipeline).templateMatches({
      Resources: {
        InstallerRole13277E70: {
          Properties: {
            AssumeRolePolicyDocument: {
              Statement: [
                {
                  Action: 'sts:AssumeRole',
                  Effect: 'Allow',
                  Principal: {
                    Service: 'codebuild.amazonaws.com',
                  },
                },
              ],
              Version: '2012-10-17',
            },
            ManagedPolicyArns: [
              {
                'Fn::Join': [
                  '',
                  [
                    'arn:',
                    {
                      Ref: 'AWS::Partition',
                    },
                    ':iam::aws:policy/AdministratorAccess',
                  ],
                ],
              },
            ],
          },
          Type: 'AWS::IAM::Role',
        },
      },
    });
  });

  /**
   * Management account pipeline stack with tester pipeline - Installer project resource test
   */
  test(`${testNamePrefix} Management account pipeline stack with tester pipeline - Installer project resource test`, () => {
    cdk.assertions.Template.fromStack(managementAccountStackWithTesterPipeline).templateMatches({
      Resources: {
        InstallerProject879FF821: {
          Type: 'AWS::CodeBuild::Project',
          Properties: {
            Artifacts: {
              Type: 'CODEPIPELINE',
            },
            EncryptionKey: {
              'Fn::GetAtt': ['InstallerKey2A6A8C6D', 'Arn'],
            },
            Environment: {
              ComputeType: 'BUILD_GENERAL1_MEDIUM',
              EnvironmentVariables: [
                {
                  Name: 'NODE_OPTIONS',
                  Type: 'PLAINTEXT',
                  Value: '--max_old_space_size=4096',
                },
                {
                  Name: 'CDK_NEW_BOOTSTRAP',
                  Type: 'PLAINTEXT',
                  Value: '1',
                },
                {
                  Name: 'ACCELERATOR_REPOSITORY_NAME',
                  Type: 'PLAINTEXT',
                  Value: {
                    Ref: 'RepositoryName',
                  },
                },
                {
                  Name: 'ACCELERATOR_REPOSITORY_BRANCH_NAME',
                  Type: 'PLAINTEXT',
                  Value: {
                    Ref: 'RepositoryBranchName',
                  },
                },
                {
                  Name: 'ACCELERATOR_ENABLE_APPROVAL_STAGE',
                  Type: 'PLAINTEXT',
                  Value: {
                    Ref: 'EnableApprovalStage',
                  },
                },
                {
                  Name: 'APPROVAL_STAGE_NOTIFY_EMAIL_LIST',
                  Type: 'PLAINTEXT',
                  Value: {
                    'Fn::Join': [
                      ',',
                      {
                        Ref: 'ApprovalStageNotifyEmailList',
                      },
                    ],
                  },
                },
                {
                  Name: 'MANAGEMENT_ACCOUNT_EMAIL',
                  Type: 'PLAINTEXT',
                  Value: {
                    Ref: 'ManagementAccountEmail',
                  },
                },
                {
                  Name: 'LOG_ARCHIVE_ACCOUNT_EMAIL',
                  Type: 'PLAINTEXT',
                  Value: {
                    Ref: 'LogArchiveAccountEmail',
                  },
                },
                {
                  Name: 'AUDIT_ACCOUNT_EMAIL',
                  Type: 'PLAINTEXT',
                  Value: {
                    Ref: 'AuditAccountEmail',
                  },
                },
                {
                  Name: 'ENABLE_TESTER',
                  Type: 'PLAINTEXT',
                  Value: 'true',
                },
                {
                  Name: 'MANAGEMENT_CROSS_ACCOUNT_ROLE_NAME',
                  Type: 'PLAINTEXT',
                  Value: 'AWSControlTowerExecution',
                },
              ],
              Image: 'aws/codebuild/standard:5.0',
              ImagePullCredentialsType: 'CODEBUILD',
              PrivilegedMode: true,
              Type: 'LINUX_CONTAINER',
            },
            Name: 'AWSAccelerator-InstallerProject',
            ServiceRole: {
              'Fn::GetAtt': ['InstallerRole13277E70', 'Arn'],
            },
            Source: {
              BuildSpec: {
                'Fn::Join': [
                  '',
                  [
                    'version: "0.2"\nphases:\n  install:\n    runtime-versions:\n      nodejs: 14\n  pre_build:\n    commands:\n      - ENABLE_EXTERNAL_PIPELINE_ACCOUNT="no"\n      - if [ ! -z "$MANAGEMENT_ACCOUNT_ID" ] && [ ! -z "$MANAGEMENT_ACCOUNT_ROLE_NAME" ]; then ENABLE_EXTERNAL_PIPELINE_ACCOUNT="yes"; fi\n  build:\n    commands:\n      - cd source\n      - yarn install\n      - yarn lerna link\n      - yarn build\n      - cd packages/@aws-accelerator/installer\n      - yarn run cdk bootstrap --toolkitStackName AWSAccelerator-CDKToolkit aws://',
                    {
                      Ref: 'AWS::AccountId',
                    },
                    '/',
                    {
                      Ref: 'AWS::Region',
                    },
                    ' --qualifier accel\n      - |-\n        if [ $ENABLE_EXTERNAL_PIPELINE_ACCOUNT = "yes" ]; then\n                          export $(printf "AWS_ACCESS_KEY_ID=%s AWS_SECRET_ACCESS_KEY=%s AWS_SESSION_TOKEN=%s" $(aws sts assume-role --role-arn arn:',
                    {
                      Ref: 'AWS::Partition',
                    },
                    ':iam::"$MANAGEMENT_ACCOUNT_ID":role/"$MANAGEMENT_ACCOUNT_ROLE_NAME" --role-session-name acceleratorAssumeRoleSession --query "Credentials.[AccessKeyId,SecretAccessKey,SessionToken]" --output text));  \n                          yarn run cdk bootstrap --toolkitStackName AWSAccelerator-CDKToolkit aws://$MANAGEMENT_ACCOUNT_ID/',
                    {
                      Ref: 'AWS::Region',
                    },
                    ' --qualifier accel;\n                          unset AWS_ACCESS_KEY_ID;\n                          unset AWS_SECRET_ACCESS_KEY;\n                          unset AWS_SESSION_TOKEN;                  \n                       fi\n      - cd ../accelerator\n      - yarn run ts-node --transpile-only cdk.ts deploy --require-approval never --stage pipeline --account ',
                    {
                      Ref: 'AWS::AccountId',
                    },
                    ' --region ',
                    {
                      Ref: 'AWS::Region',
                    },
                    '\n      - if [ "$ENABLE_TESTER" = "true" ]; then yarn run ts-node --transpile-only cdk.ts deploy --require-approval never --stage tester-pipeline --account ',
                    {
                      Ref: 'AWS::AccountId',
                    },
                    ' --region ',
                    {
                      Ref: 'AWS::Region',
                    },
                    '; fi\n',
                  ],
                ],
              },
              Type: 'CODEPIPELINE',
            },
          },
        },
      },
    });
  });

  /**
   * External pipeline account stack with tester pipeline - Installer project resource test
   */
  test(`${testNamePrefix} External pipeline account stack with tester pipeline - Installer project resource test`, () => {
    cdk.assertions.Template.fromStack(externalPipelineAccountStackWithTesterPipeline).templateMatches({
      Resources: {
        InstallerProject879FF821: {
          Type: 'AWS::CodeBuild::Project',
          Properties: {
            Artifacts: {
              Type: 'CODEPIPELINE',
            },
            EncryptionKey: {
              'Fn::GetAtt': ['InstallerKey2A6A8C6D', 'Arn'],
            },
            Environment: {
              ComputeType: 'BUILD_GENERAL1_MEDIUM',
              EnvironmentVariables: [
                {
                  Name: 'NODE_OPTIONS',
                  Type: 'PLAINTEXT',
                  Value: '--max_old_space_size=4096',
                },
                {
                  Name: 'CDK_NEW_BOOTSTRAP',
                  Type: 'PLAINTEXT',
                  Value: '1',
                },
                {
                  Name: 'ACCELERATOR_REPOSITORY_NAME',
                  Type: 'PLAINTEXT',
                  Value: {
                    Ref: 'RepositoryName',
                  },
                },
                {
                  Name: 'ACCELERATOR_REPOSITORY_BRANCH_NAME',
                  Type: 'PLAINTEXT',
                  Value: {
                    Ref: 'RepositoryBranchName',
                  },
                },
                {
                  Name: 'ACCELERATOR_ENABLE_APPROVAL_STAGE',
                  Type: 'PLAINTEXT',
                  Value: {
                    Ref: 'EnableApprovalStage',
                  },
                },
                {
                  Name: 'APPROVAL_STAGE_NOTIFY_EMAIL_LIST',
                  Type: 'PLAINTEXT',
                  Value: {
                    'Fn::Join': [
                      ',',
                      {
                        Ref: 'ApprovalStageNotifyEmailList',
                      },
                    ],
                  },
                },
                {
                  Name: 'MANAGEMENT_ACCOUNT_EMAIL',
                  Type: 'PLAINTEXT',
                  Value: {
                    Ref: 'ManagementAccountEmail',
                  },
                },
                {
                  Name: 'LOG_ARCHIVE_ACCOUNT_EMAIL',
                  Type: 'PLAINTEXT',
                  Value: {
                    Ref: 'LogArchiveAccountEmail',
                  },
                },
                {
                  Name: 'AUDIT_ACCOUNT_EMAIL',
                  Type: 'PLAINTEXT',
                  Value: {
                    Ref: 'AuditAccountEmail',
                  },
                },
                {
                  Name: 'MANAGEMENT_ACCOUNT_ID',
                  Type: 'PLAINTEXT',
                  Value: {
                    Ref: 'ManagementAccountId',
                  },
                },
                {
                  Name: 'MANAGEMENT_ACCOUNT_ROLE_NAME',
                  Type: 'PLAINTEXT',
                  Value: {
                    Ref: 'ManagementAccountRoleName',
                  },
                },
                {
                  Name: 'ACCELERATOR_QUALIFIER',
                  Type: 'PLAINTEXT',
                  Value: {
                    Ref: 'AcceleratorQualifier',
                  },
                },
                {
                  Name: 'ENABLE_TESTER',
                  Type: 'PLAINTEXT',
                  Value: 'true',
                },
                {
                  Name: 'MANAGEMENT_CROSS_ACCOUNT_ROLE_NAME',
                  Type: 'PLAINTEXT',
                  Value: 'AWSControlTowerExecution',
                },
              ],
              Image: 'aws/codebuild/standard:5.0',
              ImagePullCredentialsType: 'CODEBUILD',
              PrivilegedMode: true,
              Type: 'LINUX_CONTAINER',
            },
            Name: {
              'Fn::Join': [
                '',
                [
                  {
                    Ref: 'AcceleratorQualifier',
                  },
                  '-installer-project',
                ],
              ],
            },
            ServiceRole: {
              'Fn::GetAtt': ['InstallerRole13277E70', 'Arn'],
            },
            Source: {
              BuildSpec: {
                'Fn::Join': [
                  '',
                  [
                    'version: "0.2"\nphases:\n  install:\n    runtime-versions:\n      nodejs: 14\n  pre_build:\n    commands:\n      - ENABLE_EXTERNAL_PIPELINE_ACCOUNT="no"\n      - if [ ! -z "$MANAGEMENT_ACCOUNT_ID" ] && [ ! -z "$MANAGEMENT_ACCOUNT_ROLE_NAME" ]; then ENABLE_EXTERNAL_PIPELINE_ACCOUNT="yes"; fi\n  build:\n    commands:\n      - cd source\n      - yarn install\n      - yarn lerna link\n      - yarn build\n      - cd packages/@aws-accelerator/installer\n      - yarn run cdk bootstrap --toolkitStackName AWSAccelerator-CDKToolkit aws://',
                    {
                      Ref: 'AWS::AccountId',
                    },
                    '/',
                    {
                      Ref: 'AWS::Region',
                    },
                    ' --qualifier accel\n      - |-\n        if [ $ENABLE_EXTERNAL_PIPELINE_ACCOUNT = "yes" ]; then\n                          export $(printf "AWS_ACCESS_KEY_ID=%s AWS_SECRET_ACCESS_KEY=%s AWS_SESSION_TOKEN=%s" $(aws sts assume-role --role-arn arn:',
                    {
                      Ref: 'AWS::Partition',
                    },
                    ':iam::"$MANAGEMENT_ACCOUNT_ID":role/"$MANAGEMENT_ACCOUNT_ROLE_NAME" --role-session-name acceleratorAssumeRoleSession --query "Credentials.[AccessKeyId,SecretAccessKey,SessionToken]" --output text));  \n                          yarn run cdk bootstrap --toolkitStackName AWSAccelerator-CDKToolkit aws://$MANAGEMENT_ACCOUNT_ID/',
                    {
                      Ref: 'AWS::Region',
                    },
                    ' --qualifier accel;\n                          unset AWS_ACCESS_KEY_ID;\n                          unset AWS_SECRET_ACCESS_KEY;\n                          unset AWS_SESSION_TOKEN;                  \n                       fi\n      - cd ../accelerator\n      - yarn run ts-node --transpile-only cdk.ts deploy --require-approval never --stage pipeline --account ',
                    {
                      Ref: 'AWS::AccountId',
                    },
                    ' --region ',
                    {
                      Ref: 'AWS::Region',
                    },
                    '\n      - if [ "$ENABLE_TESTER" = "true" ]; then yarn run ts-node --transpile-only cdk.ts deploy --require-approval never --stage tester-pipeline --account ',
                    {
                      Ref: 'AWS::AccountId',
                    },
                    ' --region ',
                    {
                      Ref: 'AWS::Region',
                    },
                    '; fi\n',
                  ],
                ],
              },
              Type: 'CODEPIPELINE',
            },
          },
        },
      },
    });
  });

  /**
   * Management account pipeline stack without tester pipeline - Installer project resource test
   */
  test(`${testNamePrefix} Management account pipeline stack without tester pipeline - Installer project resource test`, () => {
    cdk.assertions.Template.fromStack(managementAccountStackWithoutTesterPipeline).templateMatches({
      Resources: {
        InstallerProject879FF821: {
          Type: 'AWS::CodeBuild::Project',
          Properties: {
            Artifacts: {
              Type: 'CODEPIPELINE',
            },
            EncryptionKey: {
              'Fn::GetAtt': ['InstallerKey2A6A8C6D', 'Arn'],
            },
            Environment: {
              ComputeType: 'BUILD_GENERAL1_MEDIUM',
              EnvironmentVariables: [
                {
                  Name: 'NODE_OPTIONS',
                  Type: 'PLAINTEXT',
                  Value: '--max_old_space_size=4096',
                },
                {
                  Name: 'CDK_NEW_BOOTSTRAP',
                  Type: 'PLAINTEXT',
                  Value: '1',
                },
                {
                  Name: 'ACCELERATOR_REPOSITORY_NAME',
                  Type: 'PLAINTEXT',
                  Value: {
                    Ref: 'RepositoryName',
                  },
                },
                {
                  Name: 'ACCELERATOR_REPOSITORY_BRANCH_NAME',
                  Type: 'PLAINTEXT',
                  Value: {
                    Ref: 'RepositoryBranchName',
                  },
                },
                {
                  Name: 'ACCELERATOR_ENABLE_APPROVAL_STAGE',
                  Type: 'PLAINTEXT',
                  Value: {
                    Ref: 'EnableApprovalStage',
                  },
                },
                {
                  Name: 'APPROVAL_STAGE_NOTIFY_EMAIL_LIST',
                  Type: 'PLAINTEXT',
                  Value: {
                    'Fn::Join': [
                      ',',
                      {
                        Ref: 'ApprovalStageNotifyEmailList',
                      },
                    ],
                  },
                },
                {
                  Name: 'MANAGEMENT_ACCOUNT_EMAIL',
                  Type: 'PLAINTEXT',
                  Value: {
                    Ref: 'ManagementAccountEmail',
                  },
                },
                {
                  Name: 'LOG_ARCHIVE_ACCOUNT_EMAIL',
                  Type: 'PLAINTEXT',
                  Value: {
                    Ref: 'LogArchiveAccountEmail',
                  },
                },
                {
                  Name: 'AUDIT_ACCOUNT_EMAIL',
                  Type: 'PLAINTEXT',
                  Value: {
                    Ref: 'AuditAccountEmail',
                  },
                },
              ],
              Image: 'aws/codebuild/standard:5.0',
              ImagePullCredentialsType: 'CODEBUILD',
              PrivilegedMode: true,
              Type: 'LINUX_CONTAINER',
            },
            Name: 'AWSAccelerator-InstallerProject',
            ServiceRole: {
              'Fn::GetAtt': ['InstallerRole13277E70', 'Arn'],
            },
            Source: {
              BuildSpec: {
                'Fn::Join': [
                  '',
                  [
                    'version: "0.2"\nphases:\n  install:\n    runtime-versions:\n      nodejs: 14\n  pre_build:\n    commands:\n      - ENABLE_EXTERNAL_PIPELINE_ACCOUNT="no"\n      - if [ ! -z "$MANAGEMENT_ACCOUNT_ID" ] && [ ! -z "$MANAGEMENT_ACCOUNT_ROLE_NAME" ]; then ENABLE_EXTERNAL_PIPELINE_ACCOUNT="yes"; fi\n  build:\n    commands:\n      - cd source\n      - yarn install\n      - yarn lerna link\n      - yarn build\n      - cd packages/@aws-accelerator/installer\n      - yarn run cdk bootstrap --toolkitStackName AWSAccelerator-CDKToolkit aws://',
                    {
                      Ref: 'AWS::AccountId',
                    },
                    '/',
                    {
                      Ref: 'AWS::Region',
                    },
                    ' --qualifier accel\n      - |-\n        if [ $ENABLE_EXTERNAL_PIPELINE_ACCOUNT = "yes" ]; then\n                          export $(printf "AWS_ACCESS_KEY_ID=%s AWS_SECRET_ACCESS_KEY=%s AWS_SESSION_TOKEN=%s" $(aws sts assume-role --role-arn arn:',
                    {
                      Ref: 'AWS::Partition',
                    },
                    ':iam::"$MANAGEMENT_ACCOUNT_ID":role/"$MANAGEMENT_ACCOUNT_ROLE_NAME" --role-session-name acceleratorAssumeRoleSession --query "Credentials.[AccessKeyId,SecretAccessKey,SessionToken]" --output text));  \n                          yarn run cdk bootstrap --toolkitStackName AWSAccelerator-CDKToolkit aws://$MANAGEMENT_ACCOUNT_ID/',
                    {
                      Ref: 'AWS::Region',
                    },
                    ' --qualifier accel;\n                          unset AWS_ACCESS_KEY_ID;\n                          unset AWS_SECRET_ACCESS_KEY;\n                          unset AWS_SESSION_TOKEN;                  \n                       fi\n      - cd ../accelerator\n      - yarn run ts-node --transpile-only cdk.ts deploy --require-approval never --stage pipeline --account ',
                    {
                      Ref: 'AWS::AccountId',
                    },
                    ' --region ',
                    {
                      Ref: 'AWS::Region',
                    },
                    '\n      - if [ "$ENABLE_TESTER" = "true" ]; then yarn run ts-node --transpile-only cdk.ts deploy --require-approval never --stage tester-pipeline --account ',
                    {
                      Ref: 'AWS::AccountId',
                    },
                    ' --region ',
                    {
                      Ref: 'AWS::Region',
                    },
                    '; fi\n',
                  ],
                ],
              },
              Type: 'CODEPIPELINE',
            },
          },
        },
      },
    });
  });

  /**
   * External pipeline account stack without tester pipeline - Installer project resource test
   */
  test(`${testNamePrefix} External pipeline account stack without tester pipeline - Installer project resource test`, () => {
    cdk.assertions.Template.fromStack(externalPipelineAccountStackWithoutTesterPipeline).templateMatches({
      Resources: {
        InstallerProject879FF821: {
          Type: 'AWS::CodeBuild::Project',
          Properties: {
            Artifacts: {
              Type: 'CODEPIPELINE',
            },
            Cache: {
              Type: 'NO_CACHE',
            },
            EncryptionKey: {
              'Fn::GetAtt': ['InstallerKey2A6A8C6D', 'Arn'],
            },
            Environment: {
              ComputeType: 'BUILD_GENERAL1_MEDIUM',
              EnvironmentVariables: [
                {
                  Name: 'NODE_OPTIONS',
                  Type: 'PLAINTEXT',
                  Value: '--max_old_space_size=4096',
                },
                {
                  Name: 'CDK_NEW_BOOTSTRAP',
                  Type: 'PLAINTEXT',
                  Value: '1',
                },
                {
                  Name: 'ACCELERATOR_REPOSITORY_NAME',
                  Type: 'PLAINTEXT',
                  Value: {
                    Ref: 'RepositoryName',
                  },
                },
                {
                  Name: 'ACCELERATOR_REPOSITORY_BRANCH_NAME',
                  Type: 'PLAINTEXT',
                  Value: {
                    Ref: 'RepositoryBranchName',
                  },
                },
                {
                  Name: 'ACCELERATOR_ENABLE_APPROVAL_STAGE',
                  Type: 'PLAINTEXT',
                  Value: {
                    Ref: 'EnableApprovalStage',
                  },
                },
                {
                  Name: 'APPROVAL_STAGE_NOTIFY_EMAIL_LIST',
                  Type: 'PLAINTEXT',
                  Value: {
                    'Fn::Join': [
                      ',',
                      {
                        Ref: 'ApprovalStageNotifyEmailList',
                      },
                    ],
                  },
                },
                {
                  Name: 'MANAGEMENT_ACCOUNT_EMAIL',
                  Type: 'PLAINTEXT',
                  Value: {
                    Ref: 'ManagementAccountEmail',
                  },
                },
                {
                  Name: 'LOG_ARCHIVE_ACCOUNT_EMAIL',
                  Type: 'PLAINTEXT',
                  Value: {
                    Ref: 'LogArchiveAccountEmail',
                  },
                },
                {
                  Name: 'AUDIT_ACCOUNT_EMAIL',
                  Type: 'PLAINTEXT',
                  Value: {
                    Ref: 'AuditAccountEmail',
                  },
                },
                {
                  Name: 'MANAGEMENT_ACCOUNT_ID',
                  Type: 'PLAINTEXT',
                  Value: {
                    Ref: 'ManagementAccountId',
                  },
                },
                {
                  Name: 'MANAGEMENT_ACCOUNT_ROLE_NAME',
                  Type: 'PLAINTEXT',
                  Value: {
                    Ref: 'ManagementAccountRoleName',
                  },
                },
                {
                  Name: 'ACCELERATOR_QUALIFIER',
                  Type: 'PLAINTEXT',
                  Value: {
                    Ref: 'AcceleratorQualifier',
                  },
                },
              ],
              Image: 'aws/codebuild/standard:5.0',
              ImagePullCredentialsType: 'CODEBUILD',
              PrivilegedMode: true,
              Type: 'LINUX_CONTAINER',
            },
            Name: {
              'Fn::Join': [
                '',
                [
                  {
                    Ref: 'AcceleratorQualifier',
                  },
                  '-installer-project',
                ],
              ],
            },
            ServiceRole: {
              'Fn::GetAtt': ['InstallerRole13277E70', 'Arn'],
            },
            Source: {
              BuildSpec: {
                'Fn::Join': [
                  '',
                  [
                    'version: "0.2"\nphases:\n  install:\n    runtime-versions:\n      nodejs: 14\n  pre_build:\n    commands:\n      - ENABLE_EXTERNAL_PIPELINE_ACCOUNT="no"\n      - if [ ! -z "$MANAGEMENT_ACCOUNT_ID" ] && [ ! -z "$MANAGEMENT_ACCOUNT_ROLE_NAME" ]; then ENABLE_EXTERNAL_PIPELINE_ACCOUNT="yes"; fi\n  build:\n    commands:\n      - cd source\n      - yarn install\n      - yarn lerna link\n      - yarn build\n      - cd packages/@aws-accelerator/installer\n      - yarn run cdk bootstrap --toolkitStackName AWSAccelerator-CDKToolkit aws://',
                    {
                      Ref: 'AWS::AccountId',
                    },
                    '/',
                    {
                      Ref: 'AWS::Region',
                    },
                    ' --qualifier accel\n      - |-\n        if [ $ENABLE_EXTERNAL_PIPELINE_ACCOUNT = "yes" ]; then\n                          export $(printf "AWS_ACCESS_KEY_ID=%s AWS_SECRET_ACCESS_KEY=%s AWS_SESSION_TOKEN=%s" $(aws sts assume-role --role-arn arn:',
                    {
                      Ref: 'AWS::Partition',
                    },
                    ':iam::"$MANAGEMENT_ACCOUNT_ID":role/"$MANAGEMENT_ACCOUNT_ROLE_NAME" --role-session-name acceleratorAssumeRoleSession --query "Credentials.[AccessKeyId,SecretAccessKey,SessionToken]" --output text));  \n                          yarn run cdk bootstrap --toolkitStackName AWSAccelerator-CDKToolkit aws://$MANAGEMENT_ACCOUNT_ID/',
                    {
                      Ref: 'AWS::Region',
                    },
                    ' --qualifier accel;\n                          unset AWS_ACCESS_KEY_ID;\n                          unset AWS_SECRET_ACCESS_KEY;\n                          unset AWS_SESSION_TOKEN;                  \n                       fi\n      - cd ../accelerator\n      - yarn run ts-node --transpile-only cdk.ts deploy --require-approval never --stage pipeline --account ',
                    {
                      Ref: 'AWS::AccountId',
                    },
                    ' --region ',
                    {
                      Ref: 'AWS::Region',
                    },
                    '\n      - if [ "$ENABLE_TESTER" = "true" ]; then yarn run ts-node --transpile-only cdk.ts deploy --require-approval never --stage tester-pipeline --account ',
                    {
                      Ref: 'AWS::AccountId',
                    },
                    ' --region ',
                    {
                      Ref: 'AWS::Region',
                    },
                    '; fi\n',
                  ],
                ],
              },
              Type: 'CODEPIPELINE',
            },
          },
        },
      },
    });
  });

  /**
   * Management account pipeline stack - CodePipeline iam role default policy resource test
   */
  test(`${testNamePrefix} Management account pipeline stack - CodePipeline iam role default policy resource test`, () => {
    cdk.assertions.Template.fromStack(managementAccountStackWithTesterPipeline).templateMatches({
      Resources: {
        PipelineRoleDefaultPolicy77A82A74: {
          Type: 'AWS::IAM::Policy',
          Metadata: {
            cfn_nag: {
              rules_to_suppress: [
                {
                  id: 'W76',
                  reason: 'This policy is generated by CDK which can cause a high SPCM score.',
                },
              ],
            },
          },
          Properties: {
            PolicyDocument: {
              Statement: [
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
                  Resource: [
                    {
                      'Fn::GetAtt': ['SecureBucket747CD8C0', 'Arn'],
                    },
                    {
                      'Fn::Join': [
                        '',
                        [
                          {
                            'Fn::GetAtt': ['SecureBucket747CD8C0', 'Arn'],
                          },
                          '/*',
                        ],
                      ],
                    },
                  ],
                },
                {
                  Action: ['kms:Decrypt', 'kms:DescribeKey', 'kms:Encrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*'],
                  Effect: 'Allow',
                  Resource: {
                    'Fn::GetAtt': ['InstallerKey2A6A8C6D', 'Arn'],
                  },
                },
                {
                  Action: 'sts:AssumeRole',
                  Effect: 'Allow',
                  Resource: {
                    'Fn::GetAtt': ['PipelineSourceCodePipelineActionRoleC6F9E7F5', 'Arn'],
                  },
                },
                {
                  Action: 'sts:AssumeRole',
                  Effect: 'Allow',
                  Resource: {
                    'Fn::GetAtt': ['PipelineRoleDCFDBB91', 'Arn'],
                  },
                },
                {
                  Action: ['codebuild:BatchGetBuilds', 'codebuild:StartBuild', 'codebuild:StopBuild'],
                  Effect: 'Allow',
                  Resource: {
                    'Fn::GetAtt': ['InstallerProject879FF821', 'Arn'],
                  },
                },
              ],
              Version: '2012-10-17',
            },
            PolicyName: 'PipelineRoleDefaultPolicy77A82A74',
            Roles: [
              {
                Ref: 'PipelineRoleDCFDBB91',
              },
            ],
          },
        },
      },
    });
  });

  /**
   * External pipeline account stack - CodePipeline iam role default policy resource test
   */
  test(`${testNamePrefix} External pipeline account stack - CodePipeline iam role default policy resource test`, () => {
    cdk.assertions.Template.fromStack(externalPipelineAccountStackWithTesterPipeline).templateMatches({
      Resources: {
        PipelineRoleDefaultPolicy77A82A74: {
          Type: 'AWS::IAM::Policy',
          Metadata: {
            cfn_nag: {
              rules_to_suppress: [
                {
                  id: 'W76',
                  reason: 'This policy is generated by CDK which can cause a high SPCM score.',
                },
              ],
            },
          },
          Properties: {
            PolicyDocument: {
              Statement: [
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
                  Resource: [
                    {
                      'Fn::GetAtt': ['SecureBucket747CD8C0', 'Arn'],
                    },
                    {
                      'Fn::Join': [
                        '',
                        [
                          {
                            'Fn::GetAtt': ['SecureBucket747CD8C0', 'Arn'],
                          },
                          '/*',
                        ],
                      ],
                    },
                  ],
                },
                {
                  Action: ['kms:Decrypt', 'kms:DescribeKey', 'kms:Encrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*'],
                  Effect: 'Allow',
                  Resource: {
                    'Fn::GetAtt': ['InstallerKey2A6A8C6D', 'Arn'],
                  },
                },
                {
                  Action: 'sts:AssumeRole',
                  Effect: 'Allow',
                  Resource: {
                    'Fn::GetAtt': ['PipelineSourceCodePipelineActionRoleC6F9E7F5', 'Arn'],
                  },
                },
                {
                  Action: 'sts:AssumeRole',
                  Effect: 'Allow',
                  Resource: {
                    'Fn::GetAtt': ['PipelineRoleDCFDBB91', 'Arn'],
                  },
                },
                {
                  Action: ['codebuild:BatchGetBuilds', 'codebuild:StartBuild', 'codebuild:StopBuild'],
                  Effect: 'Allow',
                  Resource: {
                    'Fn::GetAtt': ['InstallerProject879FF821', 'Arn'],
                  },
                },
              ],
              Version: '2012-10-17',
            },
            PolicyName: 'PipelineRoleDefaultPolicy77A82A74',
            Roles: [
              {
                Ref: 'PipelineRoleDCFDBB91',
              },
            ],
          },
        },
      },
    });
  });

  /**
   * Management account pipeline stack - CodePipeline bucket KMS key resource test
   */
  test(`${testNamePrefix} Management account pipeline stack - CodePipeline bucket KMS key resource test`, () => {
    cdk.assertions.Template.fromStack(managementAccountStackWithTesterPipeline).templateMatches({
      Resources: {
        InstallerKey2A6A8C6D: {
          Type: 'AWS::KMS::Key',
          UpdateReplacePolicy: 'Retain',
          DeletionPolicy: 'Retain',
          Properties: {
            Description: 'AWS Accelerator Management Account Kms Key',
            EnableKeyRotation: true,
            KeyPolicy: {
              Statement: [
                {
                  Action: 'kms:*',
                  Effect: 'Allow',
                  Principal: {
                    AWS: {
                      'Fn::Join': [
                        '',
                        [
                          'arn:',
                          {
                            Ref: 'AWS::Partition',
                          },
                          ':iam::',
                          {
                            Ref: 'AWS::AccountId',
                          },
                          ':root',
                        ],
                      ],
                    },
                  },
                  Resource: '*',
                },
                {
                  Action: ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:DescribeKey'],
                  Condition: {
                    ArnLike: {
                      'aws:PrincipalARN': [
                        {
                          'Fn::Join': [
                            '',
                            [
                              'arn:',
                              {
                                Ref: 'AWS::Partition',
                              },
                              ':iam::',
                              {
                                Ref: 'AWS::AccountId',
                              },
                              ':role/AWSAccelerator-*',
                            ],
                          ],
                        },
                      ],
                    },
                  },
                  Effect: 'Allow',
                  Principal: {
                    AWS: '*',
                  },
                  Resource: '*',
                  Sid: 'Allow Accelerator Role to use the encryption key',
                },
                {
                  Action: ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:DescribeKey'],
                  Effect: 'Allow',
                  Principal: {
                    Service: 'sns.amazonaws.com',
                  },
                  Resource: '*',
                  Sid: 'Allow Sns service to use the encryption key',
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
   * External pipeline account stack - CodePipeline bucket KMS key resource test
   */
  test(`${testNamePrefix} External pipeline account stack - CodePipeline bucket KMS key resource test`, () => {
    cdk.assertions.Template.fromStack(externalPipelineAccountStackWithTesterPipeline).templateMatches({
      Resources: {
        InstallerKey2A6A8C6D: {
          Type: 'AWS::KMS::Key',
          UpdateReplacePolicy: 'Retain',
          DeletionPolicy: 'Retain',
          Properties: {
            Description: 'AWS Accelerator Management Account Kms Key',
            EnableKeyRotation: true,
            KeyPolicy: {
              Statement: [
                {
                  Action: 'kms:*',
                  Effect: 'Allow',
                  Principal: {
                    AWS: {
                      'Fn::Join': [
                        '',
                        [
                          'arn:',
                          {
                            Ref: 'AWS::Partition',
                          },
                          ':iam::',
                          {
                            Ref: 'AWS::AccountId',
                          },
                          ':root',
                        ],
                      ],
                    },
                  },
                  Resource: '*',
                },
                {
                  Action: ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:DescribeKey'],
                  Condition: {
                    ArnLike: {
                      'aws:PrincipalARN': [
                        {
                          'Fn::Join': [
                            '',
                            [
                              'arn:',
                              {
                                Ref: 'AWS::Partition',
                              },
                              ':iam::',
                              {
                                Ref: 'AWS::AccountId',
                              },
                              ':role/',
                              {
                                Ref: 'AcceleratorQualifier',
                              },
                              '-*',
                            ],
                          ],
                        },
                      ],
                    },
                  },
                  Effect: 'Allow',
                  Principal: {
                    AWS: '*',
                  },
                  Resource: '*',
                  Sid: 'Allow Accelerator Role to use the encryption key',
                },
                {
                  Action: ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:DescribeKey'],
                  Effect: 'Allow',
                  Principal: {
                    Service: 'sns.amazonaws.com',
                  },
                  Resource: '*',
                  Sid: 'Allow Sns service to use the encryption key',
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
   * Management account pipeline stack - CodePipeline bucket policy resource test
   */
  test(`${testNamePrefix} Management account pipeline stack - CodePipeline bucket policy resource test`, () => {
    cdk.assertions.Template.fromStack(managementAccountStackWithTesterPipeline).templateMatches({
      Resources: {
        SecureBucketPolicy6374AC61: {
          Type: 'AWS::S3::BucketPolicy',
          Properties: {
            Bucket: {
              Ref: 'SecureBucket747CD8C0',
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
                      'Fn::GetAtt': ['SecureBucket747CD8C0', 'Arn'],
                    },
                    {
                      'Fn::Join': [
                        '',
                        [
                          {
                            'Fn::GetAtt': ['SecureBucket747CD8C0', 'Arn'],
                          },
                          '/*',
                        ],
                      ],
                    },
                  ],
                  Sid: 'deny-insecure-connections',
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
   * Management account pipeline stack - CodePipeline bucket policy resource test
   */
  test(`${testNamePrefix} Management account pipeline stack - CodePipeline bucket policy resource test`, () => {
    cdk.assertions.Template.fromStack(managementAccountStackWithTesterPipeline).templateMatches({
      Resources: {
        SecureBucketPolicy6374AC61: {
          Type: 'AWS::S3::BucketPolicy',
          Properties: {
            Bucket: {
              Ref: 'SecureBucket747CD8C0',
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
                      'Fn::GetAtt': ['SecureBucket747CD8C0', 'Arn'],
                    },
                    {
                      'Fn::Join': [
                        '',
                        [
                          {
                            'Fn::GetAtt': ['SecureBucket747CD8C0', 'Arn'],
                          },
                          '/*',
                        ],
                      ],
                    },
                  ],
                  Sid: 'deny-insecure-connections',
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
   * External pipeline account stack - CodePipeline bucket policy resource test
   */
  test(`${testNamePrefix} External pipeline account stack - CodePipeline bucket policy resource test`, () => {
    cdk.assertions.Template.fromStack(externalPipelineAccountStackWithTesterPipeline).templateMatches({
      Resources: {
        SecureBucketPolicy6374AC61: {
          Type: 'AWS::S3::BucketPolicy',
          Properties: {
            Bucket: {
              Ref: 'SecureBucket747CD8C0',
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
                      'Fn::GetAtt': ['SecureBucket747CD8C0', 'Arn'],
                    },
                    {
                      'Fn::Join': [
                        '',
                        [
                          {
                            'Fn::GetAtt': ['SecureBucket747CD8C0', 'Arn'],
                          },
                          '/*',
                        ],
                      ],
                    },
                  ],
                  Sid: 'deny-insecure-connections',
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
   * Management account pipeline stack - CodePipeline bucket resource test
   */
  test(`${testNamePrefix} Management account pipeline stack - CodePipeline bucket resource test`, () => {
    cdk.assertions.Template.fromStack(managementAccountStackWithTesterPipeline).templateMatches({
      Resources: {
        SecureBucket747CD8C0: {
          Type: 'AWS::S3::Bucket',
          UpdateReplacePolicy: 'Retain',
          DeletionPolicy: 'Retain',
          Metadata: {
            cfn_nag: {
              rules_to_suppress: [
                {
                  id: 'W35',
                  reason: 'S3 Bucket access logging is not enabled for the pipeline artifacts bucket.',
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
                      'Fn::GetAtt': ['InstallerKey2A6A8C6D', 'Arn'],
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
                  'aws-accelerator-installer-',
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
            VersioningConfiguration: {
              Status: 'Enabled',
            },
          },
        },
      },
    });
  });

  /**
   * External pipeline account stack - CodePipeline bucket resource test
   */
  test(`${testNamePrefix} External pipeline account stack - CodePipeline bucket resource test`, () => {
    cdk.assertions.Template.fromStack(externalPipelineAccountStackWithTesterPipeline).templateMatches({
      Resources: {
        SecureBucket747CD8C0: {
          Type: 'AWS::S3::Bucket',
          UpdateReplacePolicy: 'Retain',
          DeletionPolicy: 'Retain',
          Metadata: {
            cfn_nag: {
              rules_to_suppress: [
                {
                  id: 'W35',
                  reason: 'S3 Bucket access logging is not enabled for the pipeline artifacts bucket.',
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
                      'Fn::GetAtt': ['InstallerKey2A6A8C6D', 'Arn'],
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
                  {
                    Ref: 'AcceleratorQualifier',
                  },
                  '-installer-',
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
            VersioningConfiguration: {
              Status: 'Enabled',
            },
          },
        },
      },
    });
  });

  /**
   * Management account pipeline stack - CodePipeline action iam role default policy resource test
   */
  test(`${testNamePrefix} Management account pipeline stack - CodePipeline action iam role default policy resource test`, () => {
    cdk.assertions.Template.fromStack(managementAccountStackWithTesterPipeline).templateMatches({
      Resources: {
        PipelineSourceCodePipelineActionRoleDefaultPolicy2D565925: {
          Type: 'AWS::IAM::Policy',
          Properties: {
            PolicyDocument: {
              Statement: [
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
                  Resource: [
                    {
                      'Fn::GetAtt': ['SecureBucket747CD8C0', 'Arn'],
                    },
                    {
                      'Fn::Join': [
                        '',
                        [
                          {
                            'Fn::GetAtt': ['SecureBucket747CD8C0', 'Arn'],
                          },
                          '/*',
                        ],
                      ],
                    },
                  ],
                },
                {
                  Action: ['kms:Decrypt', 'kms:DescribeKey', 'kms:Encrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*'],
                  Effect: 'Allow',
                  Resource: {
                    'Fn::GetAtt': ['InstallerKey2A6A8C6D', 'Arn'],
                  },
                },
                {
                  Action: [
                    'codecommit:GetBranch',
                    'codecommit:GetCommit',
                    'codecommit:UploadArchive',
                    'codecommit:GetUploadArchiveStatus',
                    'codecommit:CancelUploadArchive',
                  ],
                  Effect: 'Allow',
                  Resource: {
                    'Fn::Join': [
                      '',
                      [
                        'arn:',
                        {
                          Ref: 'AWS::Partition',
                        },
                        ':codecommit:',
                        {
                          Ref: 'AWS::Region',
                        },
                        ':',
                        {
                          Ref: 'AWS::AccountId',
                        },
                        ':',
                        {
                          Ref: 'RepositoryName',
                        },
                      ],
                    ],
                  },
                },
              ],
              Version: '2012-10-17',
            },
            PolicyName: 'PipelineSourceCodePipelineActionRoleDefaultPolicy2D565925',
            Roles: [
              {
                Ref: 'PipelineSourceCodePipelineActionRoleC6F9E7F5',
              },
            ],
          },
        },
      },
    });
  });

  /**
   * External pipeline account stack - CodePipeline action iam role default policy resource test
   */
  test(`${testNamePrefix} External pipeline account stack - CodePipeline action iam role default policy resource test`, () => {
    cdk.assertions.Template.fromStack(externalPipelineAccountStackWithTesterPipeline).templateMatches({
      Resources: {
        PipelineSourceCodePipelineActionRoleDefaultPolicy2D565925: {
          Type: 'AWS::IAM::Policy',
          Properties: {
            PolicyDocument: {
              Statement: [
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
                  Resource: [
                    {
                      'Fn::GetAtt': ['SecureBucket747CD8C0', 'Arn'],
                    },
                    {
                      'Fn::Join': [
                        '',
                        [
                          {
                            'Fn::GetAtt': ['SecureBucket747CD8C0', 'Arn'],
                          },
                          '/*',
                        ],
                      ],
                    },
                  ],
                },
                {
                  Action: ['kms:Decrypt', 'kms:DescribeKey', 'kms:Encrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*'],
                  Effect: 'Allow',
                  Resource: {
                    'Fn::GetAtt': ['InstallerKey2A6A8C6D', 'Arn'],
                  },
                },
                {
                  Action: [
                    'codecommit:GetBranch',
                    'codecommit:GetCommit',
                    'codecommit:UploadArchive',
                    'codecommit:GetUploadArchiveStatus',
                    'codecommit:CancelUploadArchive',
                  ],
                  Effect: 'Allow',
                  Resource: {
                    'Fn::Join': [
                      '',
                      [
                        'arn:',
                        {
                          Ref: 'AWS::Partition',
                        },
                        ':codecommit:',
                        {
                          Ref: 'AWS::Region',
                        },
                        ':',
                        {
                          Ref: 'AWS::AccountId',
                        },
                        ':',
                        {
                          Ref: 'RepositoryName',
                        },
                      ],
                    ],
                  },
                },
              ],
              Version: '2012-10-17',
            },
            PolicyName: 'PipelineSourceCodePipelineActionRoleDefaultPolicy2D565925',
            Roles: [
              {
                Ref: 'PipelineSourceCodePipelineActionRoleC6F9E7F5',
              },
            ],
          },
        },
      },
    });
  });

  /**
   * Management account pipeline stack - CodePipeline action iam role resource test
   */
  test(`${testNamePrefix} Management account pipeline stack - CodePipeline action iam role resource test`, () => {
    cdk.assertions.Template.fromStack(managementAccountStackWithTesterPipeline).templateMatches({
      Resources: {
        PipelineSourceCodePipelineActionRoleC6F9E7F5: {
          Type: 'AWS::IAM::Role',
          Properties: {
            AssumeRolePolicyDocument: {
              Statement: [
                {
                  Action: 'sts:AssumeRole',
                  Effect: 'Allow',
                  Principal: {
                    AWS: {
                      'Fn::Join': [
                        '',
                        [
                          'arn:',
                          {
                            Ref: 'AWS::Partition',
                          },
                          ':iam::',
                          {
                            Ref: 'AWS::AccountId',
                          },
                          ':root',
                        ],
                      ],
                    },
                  },
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
   * External pipeline account stack - CodePipeline action iam role resource test
   */
  test(`${testNamePrefix} External pipeline account stack - CodePipeline action iam role resource test`, () => {
    cdk.assertions.Template.fromStack(externalPipelineAccountStackWithTesterPipeline).templateMatches({
      Resources: {
        PipelineSourceCodePipelineActionRoleC6F9E7F5: {
          Type: 'AWS::IAM::Role',
          Properties: {
            AssumeRolePolicyDocument: {
              Statement: [
                {
                  Action: 'sts:AssumeRole',
                  Effect: 'Allow',
                  Principal: {
                    AWS: {
                      'Fn::Join': [
                        '',
                        [
                          'arn:',
                          {
                            Ref: 'AWS::Partition',
                          },
                          ':iam::',
                          {
                            Ref: 'AWS::AccountId',
                          },
                          ':root',
                        ],
                      ],
                    },
                  },
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
   * Management account pipeline stack - CodePipeline iam role resource test
   */
  test(`${testNamePrefix} Management account pipeline stack - CodePipeline iam role resource test`, () => {
    cdk.assertions.Template.fromStack(managementAccountStackWithTesterPipeline).templateMatches({
      Resources: {
        PipelineRoleDCFDBB91: {
          Type: 'AWS::IAM::Role',
          Properties: {
            AssumeRolePolicyDocument: {
              Statement: [
                {
                  Action: 'sts:AssumeRole',
                  Effect: 'Allow',
                  Principal: {
                    Service: 'codepipeline.amazonaws.com',
                  },
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
   * External pipeline account stack - CodePipeline iam role resource test
   */
  test(`${testNamePrefix} External pipeline account stack - CodePipeline iam role resource test`, () => {
    cdk.assertions.Template.fromStack(externalPipelineAccountStackWithTesterPipeline).templateMatches({
      Resources: {
        PipelineRoleDCFDBB91: {
          Type: 'AWS::IAM::Role',
          Properties: {
            AssumeRolePolicyDocument: {
              Statement: [
                {
                  Action: 'sts:AssumeRole',
                  Effect: 'Allow',
                  Principal: {
                    Service: 'codepipeline.amazonaws.com',
                  },
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
   * Management account pipeline stack - CodePipeline resource test
   */
  test(`${testNamePrefix} Management account pipeline stack - CodePipeline resource test`, () => {
    cdk.assertions.Template.fromStack(managementAccountStackWithTesterPipeline).templateMatches({
      Resources: {
        PipelineC660917D: {
          Type: 'AWS::CodePipeline::Pipeline',
          DependsOn: ['PipelineRoleDefaultPolicy77A82A74', 'PipelineRoleDCFDBB91'],
          Properties: {
            ArtifactStore: {
              EncryptionKey: {
                Id: {
                  'Fn::GetAtt': ['InstallerKey2A6A8C6D', 'Arn'],
                },
                Type: 'KMS',
              },
              Location: {
                Ref: 'SecureBucket747CD8C0',
              },
              Type: 'S3',
            },
            Name: 'AWSAccelerator-Installer',
            RoleArn: {
              'Fn::GetAtt': ['PipelineRoleDCFDBB91', 'Arn'],
            },
            Stages: [
              {
                Actions: [
                  {
                    ActionTypeId: {
                      Category: 'Source',
                      Owner: 'AWS',
                      Provider: 'CodeCommit',
                      Version: '1',
                    },
                    Configuration: {
                      BranchName: {
                        Ref: 'RepositoryBranchName',
                      },
                      PollForSourceChanges: false,
                      RepositoryName: {
                        Ref: 'RepositoryName',
                      },
                    },
                    Name: 'Source',
                    OutputArtifacts: [
                      {
                        Name: 'Source',
                      },
                    ],
                    RoleArn: {
                      'Fn::GetAtt': ['PipelineSourceCodePipelineActionRoleC6F9E7F5', 'Arn'],
                    },
                    RunOrder: 1,
                  },
                ],
                Name: 'Source',
              },
              {
                Actions: [
                  {
                    ActionTypeId: {
                      Category: 'Build',
                      Owner: 'AWS',
                      Provider: 'CodeBuild',
                      Version: '1',
                    },
                    Configuration: {
                      ProjectName: {
                        Ref: 'InstallerProject879FF821',
                      },
                    },
                    InputArtifacts: [
                      {
                        Name: 'Source',
                      },
                    ],
                    Name: 'Install',
                    RoleArn: {
                      'Fn::GetAtt': ['PipelineRoleDCFDBB91', 'Arn'],
                    },
                    RunOrder: 1,
                  },
                ],
                Name: 'Install',
              },
            ],
          },
        },
      },
    });
  });

  /**
   * External pipeline account stack - CodePipeline resource test
   */
  test(`${testNamePrefix} External pipeline account stack - CodePipeline resource test`, () => {
    cdk.assertions.Template.fromStack(externalPipelineAccountStackWithTesterPipeline).templateMatches({
      Resources: {
        PipelineC660917D: {
          Type: 'AWS::CodePipeline::Pipeline',
          DependsOn: ['PipelineRoleDefaultPolicy77A82A74', 'PipelineRoleDCFDBB91'],
          Properties: {
            ArtifactStore: {
              EncryptionKey: {
                Id: {
                  'Fn::GetAtt': ['InstallerKey2A6A8C6D', 'Arn'],
                },
                Type: 'KMS',
              },
              Location: {
                Ref: 'SecureBucket747CD8C0',
              },
              Type: 'S3',
            },
            Name: {
              'Fn::Join': [
                '',
                [
                  {
                    Ref: 'AcceleratorQualifier',
                  },
                  '-installer',
                ],
              ],
            },
            RestartExecutionOnUpdate: true,
            RoleArn: {
              'Fn::GetAtt': ['PipelineRoleDCFDBB91', 'Arn'],
            },
            Stages: [
              {
                Actions: [
                  {
                    ActionTypeId: {
                      Category: 'Source',
                      Owner: 'AWS',
                      Provider: 'CodeCommit',
                      Version: '1',
                    },
                    Configuration: {
                      BranchName: {
                        Ref: 'RepositoryBranchName',
                      },
                      PollForSourceChanges: false,
                      RepositoryName: {
                        Ref: 'RepositoryName',
                      },
                    },
                    Name: 'Source',
                    OutputArtifacts: [
                      {
                        Name: 'Source',
                      },
                    ],
                    RoleArn: {
                      'Fn::GetAtt': ['PipelineSourceCodePipelineActionRoleC6F9E7F5', 'Arn'],
                    },
                    RunOrder: 1,
                  },
                ],
                Name: 'Source',
              },
              {
                Actions: [
                  {
                    ActionTypeId: {
                      Category: 'Build',
                      Owner: 'AWS',
                      Provider: 'CodeBuild',
                      Version: '1',
                    },
                    Configuration: {
                      ProjectName: {
                        Ref: 'InstallerProject879FF821',
                      },
                    },
                    InputArtifacts: [
                      {
                        Name: 'Source',
                      },
                    ],
                    Name: 'Install',
                    RoleArn: {
                      'Fn::GetAtt': ['PipelineRoleDCFDBB91', 'Arn'],
                    },
                    RunOrder: 1,
                  },
                ],
                Name: 'Install',
              },
            ],
          },
        },
      },
    });
  });

  /**
   * External pipeline account SSM parameter SsmParamAcceleratorVersion resource test
   */
  test(`${testNamePrefix} External pipeline account SSM parameter SsmParamAcceleratorVersion resource test`, () => {
    cdk.assertions.Template.fromStack(externalPipelineAccountStackWithTesterPipeline).templateMatches({
      Resources: {
        SsmParamAcceleratorVersionFF83282D: {
          Type: 'AWS::SSM::Parameter',
          Properties: {
            Name: {
              'Fn::Join': [
                '',
                [
                  '/accelerator/',
                  {
                    Ref: 'AcceleratorQualifier',
                  },
                  '/AWSAccelerator-Test-InstallerStack/version',
                ],
              ],
            },
            Type: 'String',
          },
        },
      },
    });
  });

  /**
   * External pipeline account SSM parameter SsmParamStackId resource test
   */
  test(`${testNamePrefix} External pipeline account SSM parameter SsmParamStackId resource test`, () => {
    cdk.assertions.Template.fromStack(externalPipelineAccountStackWithoutTesterPipeline).templateMatches({
      Resources: {
        SsmParamStackId521A78D3: {
          Type: 'AWS::SSM::Parameter',
          Properties: {
            Name: {
              'Fn::Join': [
                '',
                [
                  '/accelerator/',
                  {
                    Ref: 'AcceleratorQualifier',
                  },
                  '/AWSAccelerator-Test-InstallerStack/stack-id',
                ],
              ],
            },
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
   * External pipeline account SSM parameter SsmParamAcceleratorVersion resource test
   */
  test(`${testNamePrefix} External pipeline account SSM parameter SsmParamAcceleratorVersion resource test`, () => {
    cdk.assertions.Template.fromStack(managementAccountStackWithTesterPipeline).templateMatches({
      Resources: {
        SsmParamAcceleratorVersionFF83282D: {
          Type: 'AWS::SSM::Parameter',
          Properties: {
            Name: '/accelerator/AWSAccelerator-Test-InstallerStack/version',
            Type: 'String',
          },
        },
      },
    });
  });

  /**
   * Management account pipeline account SSM parameter SsmParamStackId resource test
   */
  test(`${testNamePrefix} External pipeline account SSM parameter SsmParamStackId resource test`, () => {
    cdk.assertions.Template.fromStack(managementAccountStackWithoutTesterPipeline).templateMatches({
      Resources: {
        SsmParamStackId521A78D3: {
          Type: 'AWS::SSM::Parameter',
          Properties: {
            Name: '/accelerator/AWSAccelerator-Test-InstallerStack/stack-id',
            Type: 'String',
            Value: {
              Ref: 'AWS::StackId',
            },
          },
        },
      },
    });
  });
});
