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
              Parameters: ['RepositorySource', 'RepositoryOwner', 'RepositoryName', 'RepositoryBranchName'],
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
            RepositoryOwner: {
              default: 'Repository Owner',
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
              Parameters: ['RepositorySource', 'RepositoryOwner', 'RepositoryName', 'RepositoryBranchName'],
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
            RepositoryOwner: {
              default: 'Repository Owner',
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
   * Management account pipeline stack - Installer project iam role resource test
   */
  test(`${testNamePrefix} Management account pipeline stack - Installer project iam role resource test`, () => {
    cdk.assertions.Template.fromStack(managementAccountStackWithTesterPipeline).templateMatches({
      Resources: {
        InstallerAdminRole7DEE4AC8: {
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
        InstallerAdminRole7DEE4AC8: {
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
                  Name: 'ACCELERATOR_REPOSITORY_SOURCE',
                  Type: 'PLAINTEXT',
                  Value: {
                    Ref: 'RepositorySource',
                  },
                },
                {
                  Name: 'ACCELERATOR_REPOSITORY_OWNER',
                  Type: 'PLAINTEXT',
                  Value: {
                    Ref: 'RepositoryOwner',
                  },
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
            ServiceRole: {
              'Fn::GetAtt': ['InstallerAdminRole7DEE4AC8', 'Arn'],
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
                    ' --qualifier accel\n      - yarn run cdk bootstrap --toolkitStackName AWSAccelerator-CDKToolkit aws://',
                    {
                      Ref: 'AWS::AccountId',
                    },
                    '/',
                    {
                      'Fn::FindInMap': [
                        'GlobalRegionMap',
                        {
                          Ref: 'AWS::Partition',
                        },
                        'regionName',
                      ],
                    },
                    ' --qualifier accel\n      - |-\n        if [ $ENABLE_EXTERNAL_PIPELINE_ACCOUNT = "yes" ]; then\n                          export $(printf "AWS_ACCESS_KEY_ID=%s AWS_SECRET_ACCESS_KEY=%s AWS_SESSION_TOKEN=%s" $(aws sts assume-role --role-arn arn:',
                    {
                      Ref: 'AWS::Partition',
                    },
                    ':iam::"$MANAGEMENT_ACCOUNT_ID":role/"$MANAGEMENT_ACCOUNT_ROLE_NAME" --role-session-name acceleratorAssumeRoleSession --query "Credentials.[AccessKeyId,SecretAccessKey,SessionToken]" --output text));\n                          yarn run cdk bootstrap --toolkitStackName AWSAccelerator-CDKToolkit aws://$MANAGEMENT_ACCOUNT_ID/',
                    {
                      Ref: 'AWS::Region',
                    },
                    ' --qualifier accel;\n                          yarn run cdk bootstrap --toolkitStackName AWSAccelerator-CDKToolkit aws://$MANAGEMENT_ACCOUNT_ID/',
                    {
                      'Fn::FindInMap': [
                        'GlobalRegionMap',
                        {
                          Ref: 'AWS::Partition',
                        },
                        'regionName',
                      ],
                    },
                    ' --qualifier accel;\n                          unset AWS_ACCESS_KEY_ID;\n                          unset AWS_SECRET_ACCESS_KEY;\n                          unset AWS_SESSION_TOKEN;\n                       fi\n      - cd ../accelerator\n      - yarn run ts-node --transpile-only cdk.ts deploy --require-approval never --stage pipeline --account ',
                    {
                      Ref: 'AWS::AccountId',
                    },
                    ' --region ',
                    {
                      Ref: 'AWS::Region',
                    },
                    ' --partition ',
                    {
                      Ref: 'AWS::Partition',
                    },
                    '\n      - if [ "$ENABLE_TESTER" = "true" ]; then yarn run ts-node --transpile-only cdk.ts deploy --require-approval never --stage tester-pipeline --account ',
                    {
                      Ref: 'AWS::AccountId',
                    },
                    ' --region ',
                    {
                      Ref: 'AWS::Region',
                    },
                    '; fi\n  post_build:\n    commands:\n      - aws codepipeline start-pipeline-execution --name AWSAccelerator-Pipeline\n',
                  ],
                ],
              },
              Type: 'CODEPIPELINE',
            },
            Cache: {
              Type: 'NO_CACHE',
            },
            EncryptionKey: {
              'Fn::GetAtt': ['InstallerKey2A6A8C6D', 'Arn'],
            },
            Name: 'AWSAccelerator-InstallerProject',
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
                  Name: 'ACCELERATOR_REPOSITORY_SOURCE',
                  Type: 'PLAINTEXT',
                  Value: {
                    Ref: 'RepositorySource',
                  },
                },
                {
                  Name: 'ACCELERATOR_REPOSITORY_OWNER',
                  Type: 'PLAINTEXT',
                  Value: {
                    Ref: 'RepositoryOwner',
                  },
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
            ServiceRole: {
              'Fn::GetAtt': ['InstallerAdminRole7DEE4AC8', 'Arn'],
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
                    ' --qualifier accel\n      - yarn run cdk bootstrap --toolkitStackName AWSAccelerator-CDKToolkit aws://',
                    {
                      Ref: 'AWS::AccountId',
                    },
                    '/',
                    {
                      'Fn::FindInMap': [
                        'GlobalRegionMap',
                        {
                          Ref: 'AWS::Partition',
                        },
                        'regionName',
                      ],
                    },
                    ' --qualifier accel\n      - |-\n        if [ $ENABLE_EXTERNAL_PIPELINE_ACCOUNT = "yes" ]; then\n                          export $(printf "AWS_ACCESS_KEY_ID=%s AWS_SECRET_ACCESS_KEY=%s AWS_SESSION_TOKEN=%s" $(aws sts assume-role --role-arn arn:',
                    {
                      Ref: 'AWS::Partition',
                    },
                    ':iam::"$MANAGEMENT_ACCOUNT_ID":role/"$MANAGEMENT_ACCOUNT_ROLE_NAME" --role-session-name acceleratorAssumeRoleSession --query "Credentials.[AccessKeyId,SecretAccessKey,SessionToken]" --output text));\n                          yarn run cdk bootstrap --toolkitStackName AWSAccelerator-CDKToolkit aws://$MANAGEMENT_ACCOUNT_ID/',
                    {
                      Ref: 'AWS::Region',
                    },
                    ' --qualifier accel;\n                          yarn run cdk bootstrap --toolkitStackName AWSAccelerator-CDKToolkit aws://$MANAGEMENT_ACCOUNT_ID/',
                    {
                      'Fn::FindInMap': [
                        'GlobalRegionMap',
                        {
                          Ref: 'AWS::Partition',
                        },
                        'regionName',
                      ],
                    },
                    ' --qualifier accel;\n                          unset AWS_ACCESS_KEY_ID;\n                          unset AWS_SECRET_ACCESS_KEY;\n                          unset AWS_SESSION_TOKEN;\n                       fi\n      - cd ../accelerator\n      - yarn run ts-node --transpile-only cdk.ts deploy --require-approval never --stage pipeline --account ',
                    {
                      Ref: 'AWS::AccountId',
                    },
                    ' --region ',
                    {
                      Ref: 'AWS::Region',
                    },
                    ' --partition ',
                    {
                      Ref: 'AWS::Partition',
                    },
                    '\n      - if [ "$ENABLE_TESTER" = "true" ]; then yarn run ts-node --transpile-only cdk.ts deploy --require-approval never --stage tester-pipeline --account ',
                    {
                      Ref: 'AWS::AccountId',
                    },
                    ' --region ',
                    {
                      Ref: 'AWS::Region',
                    },
                    '; fi\n  post_build:\n    commands:\n      - aws codepipeline start-pipeline-execution --name ',
                    {
                      Ref: 'AcceleratorQualifier',
                    },
                    '-pipeline\n',
                  ],
                ],
              },
              Type: 'CODEPIPELINE',
            },
            Cache: {
              Type: 'NO_CACHE',
            },
            EncryptionKey: {
              'Fn::GetAtt': ['InstallerKey2A6A8C6D', 'Arn'],
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
                  Name: 'ACCELERATOR_REPOSITORY_SOURCE',
                  Type: 'PLAINTEXT',
                  Value: {
                    Ref: 'RepositorySource',
                  },
                },
                {
                  Name: 'ACCELERATOR_REPOSITORY_OWNER',
                  Type: 'PLAINTEXT',
                  Value: {
                    Ref: 'RepositoryOwner',
                  },
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
              'Fn::GetAtt': ['InstallerAdminRole7DEE4AC8', 'Arn'],
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
                    ' --qualifier accel\n      - yarn run cdk bootstrap --toolkitStackName AWSAccelerator-CDKToolkit aws://',
                    {
                      Ref: 'AWS::AccountId',
                    },
                    '/',
                    {
                      'Fn::FindInMap': [
                        'GlobalRegionMap',
                        {
                          Ref: 'AWS::Partition',
                        },
                        'regionName',
                      ],
                    },
                    ' --qualifier accel\n      - |-\n        if [ $ENABLE_EXTERNAL_PIPELINE_ACCOUNT = "yes" ]; then\n                          export $(printf "AWS_ACCESS_KEY_ID=%s AWS_SECRET_ACCESS_KEY=%s AWS_SESSION_TOKEN=%s" $(aws sts assume-role --role-arn arn:',
                    {
                      Ref: 'AWS::Partition',
                    },
                    ':iam::"$MANAGEMENT_ACCOUNT_ID":role/"$MANAGEMENT_ACCOUNT_ROLE_NAME" --role-session-name acceleratorAssumeRoleSession --query "Credentials.[AccessKeyId,SecretAccessKey,SessionToken]" --output text));\n                          yarn run cdk bootstrap --toolkitStackName AWSAccelerator-CDKToolkit aws://$MANAGEMENT_ACCOUNT_ID/',
                    {
                      Ref: 'AWS::Region',
                    },
                    ' --qualifier accel;\n                          yarn run cdk bootstrap --toolkitStackName AWSAccelerator-CDKToolkit aws://$MANAGEMENT_ACCOUNT_ID/',
                    {
                      'Fn::FindInMap': [
                        'GlobalRegionMap',
                        {
                          Ref: 'AWS::Partition',
                        },
                        'regionName',
                      ],
                    },
                    ' --qualifier accel;\n                          unset AWS_ACCESS_KEY_ID;\n                          unset AWS_SECRET_ACCESS_KEY;\n                          unset AWS_SESSION_TOKEN;\n                       fi\n      - cd ../accelerator\n      - yarn run ts-node --transpile-only cdk.ts deploy --require-approval never --stage pipeline --account ',
                    {
                      Ref: 'AWS::AccountId',
                    },
                    ' --region ',
                    {
                      Ref: 'AWS::Region',
                    },
                    ' --partition ',
                    {
                      Ref: 'AWS::Partition',
                    },
                    '\n      - if [ "$ENABLE_TESTER" = "true" ]; then yarn run ts-node --transpile-only cdk.ts deploy --require-approval never --stage tester-pipeline --account ',
                    {
                      Ref: 'AWS::AccountId',
                    },
                    ' --region ',
                    {
                      Ref: 'AWS::Region',
                    },
                    '; fi\n  post_build:\n    commands:\n      - aws codepipeline start-pipeline-execution --name AWSAccelerator-Pipeline\n',
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
                  Name: 'ACCELERATOR_REPOSITORY_SOURCE',
                  Type: 'PLAINTEXT',
                  Value: {
                    Ref: 'RepositorySource',
                  },
                },
                {
                  Name: 'ACCELERATOR_REPOSITORY_OWNER',
                  Type: 'PLAINTEXT',
                  Value: {
                    Ref: 'RepositoryOwner',
                  },
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
              'Fn::GetAtt': ['InstallerAdminRole7DEE4AC8', 'Arn'],
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
                    ' --qualifier accel\n      - yarn run cdk bootstrap --toolkitStackName AWSAccelerator-CDKToolkit aws://',
                    {
                      Ref: 'AWS::AccountId',
                    },
                    '/',
                    {
                      'Fn::FindInMap': [
                        'GlobalRegionMap',
                        {
                          Ref: 'AWS::Partition',
                        },
                        'regionName',
                      ],
                    },
                    ' --qualifier accel\n      - |-\n        if [ $ENABLE_EXTERNAL_PIPELINE_ACCOUNT = "yes" ]; then\n                          export $(printf "AWS_ACCESS_KEY_ID=%s AWS_SECRET_ACCESS_KEY=%s AWS_SESSION_TOKEN=%s" $(aws sts assume-role --role-arn arn:',
                    {
                      Ref: 'AWS::Partition',
                    },
                    ':iam::"$MANAGEMENT_ACCOUNT_ID":role/"$MANAGEMENT_ACCOUNT_ROLE_NAME" --role-session-name acceleratorAssumeRoleSession --query "Credentials.[AccessKeyId,SecretAccessKey,SessionToken]" --output text));\n                          yarn run cdk bootstrap --toolkitStackName AWSAccelerator-CDKToolkit aws://$MANAGEMENT_ACCOUNT_ID/',
                    {
                      Ref: 'AWS::Region',
                    },
                    ' --qualifier accel;\n                          yarn run cdk bootstrap --toolkitStackName AWSAccelerator-CDKToolkit aws://$MANAGEMENT_ACCOUNT_ID/',
                    {
                      'Fn::FindInMap': [
                        'GlobalRegionMap',
                        {
                          Ref: 'AWS::Partition',
                        },
                        'regionName',
                      ],
                    },
                    ' --qualifier accel;\n                          unset AWS_ACCESS_KEY_ID;\n                          unset AWS_SECRET_ACCESS_KEY;\n                          unset AWS_SESSION_TOKEN;\n                       fi\n      - cd ../accelerator\n      - yarn run ts-node --transpile-only cdk.ts deploy --require-approval never --stage pipeline --account ',
                    {
                      Ref: 'AWS::AccountId',
                    },
                    ' --region ',
                    {
                      Ref: 'AWS::Region',
                    },
                    ' --partition ',
                    {
                      Ref: 'AWS::Partition',
                    },
                    '\n      - if [ "$ENABLE_TESTER" = "true" ]; then yarn run ts-node --transpile-only cdk.ts deploy --require-approval never --stage tester-pipeline --account ',
                    {
                      Ref: 'AWS::AccountId',
                    },
                    ' --region ',
                    {
                      Ref: 'AWS::Region',
                    },
                    '; fi\n  post_build:\n    commands:\n      - aws codepipeline start-pipeline-execution --name ',
                    {
                      Ref: 'AcceleratorQualifier',
                    },
                    '-pipeline\n',
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
        CodeCommitPipelineRoleDefaultPolicyDE8B332B: {
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
                  Action: 'sts:AssumeRole',
                  Effect: 'Allow',
                  Resource: {
                    'Fn::GetAtt': ['CodeCommitPipelineSourceCodePipelineActionRoleFB176191', 'Arn'],
                  },
                },
                {
                  Action: 'sts:AssumeRole',
                  Effect: 'Allow',
                  Resource: {
                    'Fn::GetAtt': ['CodeCommitPipelineRole5C35E76C', 'Arn'],
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
            PolicyName: 'CodeCommitPipelineRoleDefaultPolicyDE8B332B',
            Roles: [
              {
                Ref: 'CodeCommitPipelineRole5C35E76C',
              },
            ],
          },
          Condition: 'UseCodeCommitCondition',
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
        CodeCommitPipelineRoleDefaultPolicyDE8B332B: {
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
                  Action: 'sts:AssumeRole',
                  Effect: 'Allow',
                  Resource: {
                    'Fn::GetAtt': ['CodeCommitPipelineSourceCodePipelineActionRoleFB176191', 'Arn'],
                  },
                },
                {
                  Action: 'sts:AssumeRole',
                  Effect: 'Allow',
                  Resource: {
                    'Fn::GetAtt': ['CodeCommitPipelineRole5C35E76C', 'Arn'],
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
            PolicyName: 'CodeCommitPipelineRoleDefaultPolicyDE8B332B',
            Roles: [
              {
                Ref: 'CodeCommitPipelineRole5C35E76C',
              },
            ],
          },
          Condition: 'UseCodeCommitCondition',
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
          DeletionPolicy: 'Retain',
          Properties: {
            Description: 'AWS Accelerator Management Account Kms Key',
            EnableKeyRotation: true,
            KeyPolicy: {
              Statement: [
                {
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
                  Action: 'kms:*',
                  Resource: '*',
                },
                {
                  Sid: 'Allow Accelerator Role to use the encryption key',
                  Effect: 'Allow',
                  Principal: {
                    AWS: '*',
                  },
                  Action: ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:DescribeKey'],
                  Resource: '*',
                  Condition: {
                    ArnLike: {
                      'aws:PrincipalARN': {
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
                    },
                  },
                },
                {
                  Sid: 'Allow SNS service to use the encryption key',
                  Effect: 'Allow',
                  Principal: {
                    Service: 'sns.amazonaws.com',
                  },
                  Action: ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:DescribeKey'],
                  Resource: '*',
                },
                {
                  'Fn::If': [
                    'IsCommercialCondition',
                    {
                      Sid: 'KMS key access to codestar-notifications',
                      Effect: 'Allow',
                      Principal: {
                        Service: 'codestar-notifications.amazonaws.com',
                      },
                      Action: ['kms:GenerateDataKey*', 'kms:Decrypt'],
                      Resource: '*',
                      Condition: {
                        StringEquals: {
                          'kms:ViaService': {
                            'Fn::Join': [
                              '',
                              [
                                'sns.',
                                {
                                  Ref: 'AWS::Region',
                                },
                                '.amazonaws.com',
                              ],
                            ],
                          },
                        },
                      },
                    },
                    {
                      Ref: 'AWS::NoValue',
                    },
                  ],
                },
              ],
            },
          },
          Type: 'AWS::KMS::Key',
          UpdateReplacePolicy: 'Retain',
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
                  Action: 'kms:*',
                  Resource: '*',
                },
                {
                  Sid: 'Allow Accelerator Role to use the encryption key',
                  Effect: 'Allow',
                  Principal: {
                    AWS: '*',
                  },
                  Action: ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:DescribeKey'],
                  Resource: '*',
                  Condition: {
                    ArnLike: {
                      'aws:PrincipalARN': {
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
                            { Ref: 'AcceleratorQualifier' },
                            '-*',
                          ],
                        ],
                      },
                    },
                  },
                },
                {
                  Sid: 'Allow SNS service to use the encryption key',
                  Effect: 'Allow',
                  Principal: {
                    Service: 'sns.amazonaws.com',
                  },
                  Action: ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:DescribeKey'],
                  Resource: '*',
                },
                {
                  'Fn::If': [
                    'IsCommercialCondition',
                    {
                      Sid: 'KMS key access to codestar-notifications',
                      Effect: 'Allow',
                      Principal: {
                        Service: 'codestar-notifications.amazonaws.com',
                      },
                      Action: ['kms:GenerateDataKey*', 'kms:Decrypt'],
                      Resource: '*',
                      Condition: {
                        StringEquals: {
                          'kms:ViaService': {
                            'Fn::Join': [
                              '',
                              [
                                'sns.',
                                {
                                  Ref: 'AWS::Region',
                                },
                                '.amazonaws.com',
                              ],
                            ],
                          },
                        },
                      },
                    },
                    {
                      Ref: 'AWS::NoValue',
                    },
                  ],
                },
              ],
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
        CodeCommitPipelineSourceCodePipelineActionRoleDefaultPolicyF71E0C0D: {
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
            PolicyName: 'CodeCommitPipelineSourceCodePipelineActionRoleDefaultPolicyF71E0C0D',
            Roles: [
              {
                Ref: 'CodeCommitPipelineSourceCodePipelineActionRoleFB176191',
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
        CodeCommitPipelineSourceCodePipelineActionRoleDefaultPolicyF71E0C0D: {
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
            PolicyName: 'CodeCommitPipelineSourceCodePipelineActionRoleDefaultPolicyF71E0C0D',
            Roles: [
              {
                Ref: 'CodeCommitPipelineSourceCodePipelineActionRoleFB176191',
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
        CodeCommitPipelineSourceCodePipelineActionRoleFB176191: {
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
        CodeCommitPipelineSourceCodePipelineActionRoleFB176191: {
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
        CodeCommitPipelineRole5C35E76C: {
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
        CodeCommitPipelineRole5C35E76C: {
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
        CodeCommitPipeline2208527B: {
          Type: 'AWS::CodePipeline::Pipeline',
          DependsOn: ['CodeCommitPipelineRoleDefaultPolicyDE8B332B', 'CodeCommitPipelineRole5C35E76C'],
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
              'Fn::GetAtt': ['CodeCommitPipelineRole5C35E76C', 'Arn'],
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
                      'Fn::GetAtt': ['CodeCommitPipelineSourceCodePipelineActionRoleFB176191', 'Arn'],
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
                      'Fn::GetAtt': ['CodeCommitPipelineRole5C35E76C', 'Arn'],
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
        CodeCommitPipeline2208527B: {
          Type: 'AWS::CodePipeline::Pipeline',
          DependsOn: ['CodeCommitPipelineRoleDefaultPolicyDE8B332B', 'CodeCommitPipelineRole5C35E76C'],
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
              'Fn::GetAtt': ['CodeCommitPipelineRole5C35E76C', 'Arn'],
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
                      'Fn::GetAtt': ['CodeCommitPipelineSourceCodePipelineActionRoleFB176191', 'Arn'],
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
                      'Fn::GetAtt': ['CodeCommitPipelineRole5C35E76C', 'Arn'],
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
