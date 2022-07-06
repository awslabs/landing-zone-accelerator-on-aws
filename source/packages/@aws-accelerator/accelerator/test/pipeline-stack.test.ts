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

import { PipelineStack } from '../lib/stacks/pipeline-stack';

const testNamePrefix = 'Construct(PipelineStack): ';

/**
 * Pipeline Stack
 */
const app = new cdk.App();
const stack = new PipelineStack(app, 'PipelineStack', {
  sourceRepository: 'codecommit',
  sourceRepositoryOwner: 'awslabs',
  sourceRepositoryName: 'accelerator-source',
  sourceBranchName: 'main',
  enableApprovalStage: true,
  qualifier: 'aws-accelerator',
  managementAccountId: app.account,
  managementAccountRoleName: 'AcceleratorAccountAccessRole',
  managementAccountEmail: 'accelerator-root@mydomain.com',
  logArchiveAccountEmail: 'accelerator-log-archive@mydomain.com',
  auditAccountEmail: 'accelerator-audit@mydomain.com',
  partition: 'aws',
});

/**
 * PipelineStack construct test
 */
describe('PipelineStack', () => {
  /**
   * Number of CodePipeline resource test
   */
  test(`${testNamePrefix} CodePipeline resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::CodePipeline::Pipeline', 1);
  });

  /**
   * Number of CodeBuild project resource test
   */
  test(`${testNamePrefix} CodeBuild project resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::CodeBuild::Project', 2);
  });

  /**
   * Number of IAM Role resource test
   */
  test(`${testNamePrefix} IAM Role resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::IAM::Role', 6);
  });

  /**
   * Number of IAM Policy resource test
   */
  test(`${testNamePrefix} IAM Policy resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::IAM::Policy', 6);
  });

  /**
   * Number of CodeCommit Repository resource test
   */
  test(`${testNamePrefix} CodeCommit Repository resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::CodeCommit::Repository', 1);
  });

  /**
   * Number of S3 Bucket resource test
   */
  test(`${testNamePrefix} S3 Bucket resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::S3::Bucket', 1);
  });

  /**
   * Number of BucketPolicy resource test
   */
  test(`${testNamePrefix} BucketPolicy resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::S3::BucketPolicy', 1);
  });

  /**
   * Number of BucketPolicy resource test
   */
  test(`${testNamePrefix} BucketPolicy resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::S3::BucketPolicy', 1);
  });

  /**
   * CodePipeline resource configuration test
   */
  test(`${testNamePrefix} CodePipeline resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        Pipeline8E4BFAC9: {
          Type: 'AWS::CodePipeline::Pipeline',
          DependsOn: [
            'PipelineAWSServiceRoleForCodeStarNotificationsDA052A10',
            'PipelinePipelineRoleDefaultPolicy7D262A22',
            'PipelinePipelineRole6D983AD5',
          ],
          Properties: {
            ArtifactStore: {
              EncryptionKey: {
                Id: {
                  Ref: 'SsmParameterValueacceleratorawsacceleratorinstallerkmskeyarnC96584B6F00A464EAD1953AFF4B05118Parameter',
                },
                Type: 'KMS',
              },
              Location: {
                Ref: 'PipelineSecureBucketB3EEB324',
              },
              Type: 'S3',
            },
            Name: 'aws-accelerator-pipeline',
            RoleArn: {
              'Fn::GetAtt': ['PipelinePipelineRole6D983AD5', 'Arn'],
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
                      BranchName: 'main',
                      PollForSourceChanges: false,
                      RepositoryName: 'accelerator-source',
                    },
                    Name: 'Source',
                    OutputArtifacts: [
                      {
                        Name: 'Source',
                      },
                    ],
                    RoleArn: {
                      'Fn::GetAtt': ['PipelineSourceCodePipelineActionRoleBBC58FD5', 'Arn'],
                    },
                    RunOrder: 1,
                  },
                  {
                    ActionTypeId: {
                      Category: 'Source',
                      Owner: 'AWS',
                      Provider: 'CodeCommit',
                      Version: '1',
                    },
                    Configuration: {
                      BranchName: 'main',
                      PollForSourceChanges: false,
                      RepositoryName: {
                        'Fn::GetAtt': ['PipelineConfigRepositoryE5225086', 'Name'],
                      },
                    },
                    Name: 'Configuration',
                    OutputArtifacts: [
                      {
                        Name: 'Config',
                      },
                    ],
                    RoleArn: {
                      'Fn::GetAtt': ['PipelineSourceConfigurationCodePipelineActionRoleA2807B19', 'Arn'],
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
                      PrimarySource: 'Source',
                      ProjectName: {
                        Ref: 'PipelineBuildProject9D447FA8',
                      },
                    },
                    InputArtifacts: [
                      {
                        Name: 'Source',
                      },
                      {
                        Name: 'Config',
                      },
                    ],
                    Name: 'Build',
                    OutputArtifacts: [
                      {
                        Name: 'Build',
                      },
                    ],
                    RoleArn: {
                      'Fn::GetAtt': ['PipelinePipelineRole6D983AD5', 'Arn'],
                    },
                    RunOrder: 1,
                  },
                ],
                Name: 'Build',
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
                      EnvironmentVariables:
                        '[{"name":"CDK_OPTIONS","type":"PLAINTEXT","value":"deploy --stage prepare"},{"name":"CONFIG_COMMIT_ID","type":"PLAINTEXT","value":"#{Config-Vars.CommitId}"},{"name":"ACCELERATOR_STAGE","type":"PLAINTEXT","value":"prepare"}]',
                      PrimarySource: 'Build',
                      ProjectName: {
                        Ref: 'PipelineToolkitProjectBCBD6910',
                      },
                    },
                    InputArtifacts: [
                      {
                        Name: 'Build',
                      },
                      {
                        Name: 'Config',
                      },
                    ],
                    Name: 'Prepare',
                    RoleArn: {
                      'Fn::GetAtt': ['PipelinePipelineRole6D983AD5', 'Arn'],
                    },
                    RunOrder: 1,
                  },
                ],
                Name: 'Prepare',
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
                      EnvironmentVariables:
                        '[{"name":"CDK_OPTIONS","type":"PLAINTEXT","value":"deploy --stage accounts"},{"name":"CONFIG_COMMIT_ID","type":"PLAINTEXT","value":"#{Config-Vars.CommitId}"},{"name":"ACCELERATOR_STAGE","type":"PLAINTEXT","value":"accounts"}]',
                      PrimarySource: 'Build',
                      ProjectName: {
                        Ref: 'PipelineToolkitProjectBCBD6910',
                      },
                    },
                    InputArtifacts: [
                      {
                        Name: 'Build',
                      },
                      {
                        Name: 'Config',
                      },
                    ],
                    Name: 'Accounts',
                    RoleArn: {
                      'Fn::GetAtt': ['PipelinePipelineRole6D983AD5', 'Arn'],
                    },
                    RunOrder: 1,
                  },
                ],
                Name: 'Accounts',
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
                      EnvironmentVariables:
                        '[{"name":"CDK_OPTIONS","type":"PLAINTEXT","value":"bootstrap"},{"name":"CONFIG_COMMIT_ID","type":"PLAINTEXT","value":"#{Config-Vars.CommitId}"}]',
                      PrimarySource: 'Build',
                      ProjectName: {
                        Ref: 'PipelineToolkitProjectBCBD6910',
                      },
                    },
                    InputArtifacts: [
                      {
                        Name: 'Build',
                      },
                      {
                        Name: 'Config',
                      },
                    ],
                    Name: 'Bootstrap',
                    RoleArn: {
                      'Fn::GetAtt': ['PipelinePipelineRole6D983AD5', 'Arn'],
                    },
                    RunOrder: 1,
                  },
                ],
                Name: 'Bootstrap',
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
                      EnvironmentVariables:
                        '[{"name":"CDK_OPTIONS","type":"PLAINTEXT","value":"diff"},{"name":"CONFIG_COMMIT_ID","type":"PLAINTEXT","value":"#{Config-Vars.CommitId}"}]',
                      PrimarySource: 'Build',
                      ProjectName: {
                        Ref: 'PipelineToolkitProjectBCBD6910',
                      },
                    },
                    InputArtifacts: [
                      {
                        Name: 'Build',
                      },
                      {
                        Name: 'Config',
                      },
                    ],
                    Name: 'Diff',
                    RoleArn: {
                      'Fn::GetAtt': ['PipelinePipelineRole6D983AD5', 'Arn'],
                    },
                    RunOrder: 1,
                  },
                  {
                    ActionTypeId: {
                      Category: 'Approval',
                      Owner: 'AWS',
                      Provider: 'Manual',
                      Version: '1',
                    },
                    Configuration: {
                      CustomData: 'See previous stage (Diff) for changes.',
                    },
                    Name: 'Approve',
                    RoleArn: {
                      'Fn::GetAtt': ['PipelineReviewApproveCodePipelineActionRole3122ED42', 'Arn'],
                    },
                    RunOrder: 2,
                  },
                ],
                Name: 'Review',
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
                      EnvironmentVariables:
                        '[{"name":"CDK_OPTIONS","type":"PLAINTEXT","value":"deploy --stage key"},{"name":"CONFIG_COMMIT_ID","type":"PLAINTEXT","value":"#{Config-Vars.CommitId}"},{"name":"ACCELERATOR_STAGE","type":"PLAINTEXT","value":"key"}]',
                      PrimarySource: 'Build',
                      ProjectName: {
                        Ref: 'PipelineToolkitProjectBCBD6910',
                      },
                    },
                    InputArtifacts: [
                      {
                        Name: 'Build',
                      },
                      {
                        Name: 'Config',
                      },
                    ],
                    Name: 'Key',
                    RoleArn: {
                      'Fn::GetAtt': ['PipelinePipelineRole6D983AD5', 'Arn'],
                    },
                    RunOrder: 1,
                  },
                  {
                    ActionTypeId: {
                      Category: 'Build',
                      Owner: 'AWS',
                      Provider: 'CodeBuild',
                      Version: '1',
                    },
                    Configuration: {
                      EnvironmentVariables:
                        '[{"name":"CDK_OPTIONS","type":"PLAINTEXT","value":"deploy --stage logging"},{"name":"CONFIG_COMMIT_ID","type":"PLAINTEXT","value":"#{Config-Vars.CommitId}"},{"name":"ACCELERATOR_STAGE","type":"PLAINTEXT","value":"logging"}]',
                      PrimarySource: 'Build',
                      ProjectName: {
                        Ref: 'PipelineToolkitProjectBCBD6910',
                      },
                    },
                    InputArtifacts: [
                      {
                        Name: 'Build',
                      },
                      {
                        Name: 'Config',
                      },
                    ],
                    Name: 'Logging',
                    RoleArn: {
                      'Fn::GetAtt': ['PipelinePipelineRole6D983AD5', 'Arn'],
                    },
                    RunOrder: 2,
                  },
                ],
                Name: 'Logging',
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
                      EnvironmentVariables:
                        '[{"name":"CDK_OPTIONS","type":"PLAINTEXT","value":"deploy --stage organizations"},{"name":"CONFIG_COMMIT_ID","type":"PLAINTEXT","value":"#{Config-Vars.CommitId}"},{"name":"ACCELERATOR_STAGE","type":"PLAINTEXT","value":"organizations"}]',
                      PrimarySource: 'Build',
                      ProjectName: {
                        Ref: 'PipelineToolkitProjectBCBD6910',
                      },
                    },
                    InputArtifacts: [
                      {
                        Name: 'Build',
                      },
                      {
                        Name: 'Config',
                      },
                    ],
                    Name: 'Organizations',
                    RoleArn: {
                      'Fn::GetAtt': ['PipelinePipelineRole6D983AD5', 'Arn'],
                    },
                    RunOrder: 1,
                  },
                ],
                Name: 'Organization',
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
                      EnvironmentVariables:
                        '[{"name":"CDK_OPTIONS","type":"PLAINTEXT","value":"deploy --stage security-audit"},{"name":"CONFIG_COMMIT_ID","type":"PLAINTEXT","value":"#{Config-Vars.CommitId}"},{"name":"ACCELERATOR_STAGE","type":"PLAINTEXT","value":"security-audit"}]',
                      PrimarySource: 'Build',
                      ProjectName: {
                        Ref: 'PipelineToolkitProjectBCBD6910',
                      },
                    },
                    InputArtifacts: [
                      {
                        Name: 'Build',
                      },
                      {
                        Name: 'Config',
                      },
                    ],
                    Name: 'SecurityAudit',
                    RoleArn: {
                      'Fn::GetAtt': ['PipelinePipelineRole6D983AD5', 'Arn'],
                    },
                    RunOrder: 1,
                  },
                ],
                Name: 'SecurityAudit',
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
                      EnvironmentVariables:
                        '[{"name":"CDK_OPTIONS","type":"PLAINTEXT","value":"deploy --stage network-prep"},{"name":"CONFIG_COMMIT_ID","type":"PLAINTEXT","value":"#{Config-Vars.CommitId}"},{"name":"ACCELERATOR_STAGE","type":"PLAINTEXT","value":"network-prep"}]',
                      PrimarySource: 'Build',
                      ProjectName: {
                        Ref: 'PipelineToolkitProjectBCBD6910',
                      },
                    },
                    InputArtifacts: [
                      {
                        Name: 'Build',
                      },
                      {
                        Name: 'Config',
                      },
                    ],
                    Name: 'Network_Prepare',
                    RoleArn: {
                      'Fn::GetAtt': ['PipelinePipelineRole6D983AD5', 'Arn'],
                    },
                    RunOrder: 1,
                  },
                  {
                    ActionTypeId: {
                      Category: 'Build',
                      Owner: 'AWS',
                      Provider: 'CodeBuild',
                      Version: '1',
                    },
                    Configuration: {
                      EnvironmentVariables:
                        '[{"name":"CDK_OPTIONS","type":"PLAINTEXT","value":"deploy --stage security"},{"name":"CONFIG_COMMIT_ID","type":"PLAINTEXT","value":"#{Config-Vars.CommitId}"},{"name":"ACCELERATOR_STAGE","type":"PLAINTEXT","value":"security"}]',
                      PrimarySource: 'Build',
                      ProjectName: {
                        Ref: 'PipelineToolkitProjectBCBD6910',
                      },
                    },
                    InputArtifacts: [
                      {
                        Name: 'Build',
                      },
                      {
                        Name: 'Config',
                      },
                    ],
                    Name: 'Security',
                    RoleArn: {
                      'Fn::GetAtt': ['PipelinePipelineRole6D983AD5', 'Arn'],
                    },
                    RunOrder: 1,
                  },
                  {
                    ActionTypeId: {
                      Category: 'Build',
                      Owner: 'AWS',
                      Provider: 'CodeBuild',
                      Version: '1',
                    },
                    Configuration: {
                      EnvironmentVariables:
                        '[{"name":"CDK_OPTIONS","type":"PLAINTEXT","value":"deploy --stage operations"},{"name":"CONFIG_COMMIT_ID","type":"PLAINTEXT","value":"#{Config-Vars.CommitId}"},{"name":"ACCELERATOR_STAGE","type":"PLAINTEXT","value":"operations"}]',
                      PrimarySource: 'Build',
                      ProjectName: {
                        Ref: 'PipelineToolkitProjectBCBD6910',
                      },
                    },
                    InputArtifacts: [
                      {
                        Name: 'Build',
                      },
                      {
                        Name: 'Config',
                      },
                    ],
                    Name: 'Operations',
                    RoleArn: {
                      'Fn::GetAtt': ['PipelinePipelineRole6D983AD5', 'Arn'],
                    },
                    RunOrder: 1,
                  },
                  {
                    ActionTypeId: {
                      Category: 'Build',
                      Owner: 'AWS',
                      Provider: 'CodeBuild',
                      Version: '1',
                    },
                    Configuration: {
                      EnvironmentVariables:
                        '[{"name":"CDK_OPTIONS","type":"PLAINTEXT","value":"deploy --stage network-vpc"},{"name":"CONFIG_COMMIT_ID","type":"PLAINTEXT","value":"#{Config-Vars.CommitId}"},{"name":"ACCELERATOR_STAGE","type":"PLAINTEXT","value":"network-vpc"}]',
                      PrimarySource: 'Build',
                      ProjectName: {
                        Ref: 'PipelineToolkitProjectBCBD6910',
                      },
                    },
                    InputArtifacts: [
                      {
                        Name: 'Build',
                      },
                      {
                        Name: 'Config',
                      },
                    ],
                    Name: 'Network_VPCs',
                    RoleArn: {
                      'Fn::GetAtt': ['PipelinePipelineRole6D983AD5', 'Arn'],
                    },
                    RunOrder: 2,
                  },
                  {
                    ActionTypeId: {
                      Category: 'Build',
                      Owner: 'AWS',
                      Provider: 'CodeBuild',
                      Version: '1',
                    },
                    Configuration: {
                      EnvironmentVariables:
                        '[{"name":"CDK_OPTIONS","type":"PLAINTEXT","value":"deploy --stage security-resources"},{"name":"CONFIG_COMMIT_ID","type":"PLAINTEXT","value":"#{Config-Vars.CommitId}"},{"name":"ACCELERATOR_STAGE","type":"PLAINTEXT","value":"security-resources"}]',
                      PrimarySource: 'Build',
                      ProjectName: {
                        Ref: 'PipelineToolkitProjectBCBD6910',
                      },
                    },
                    InputArtifacts: [
                      {
                        Name: 'Build',
                      },
                      {
                        Name: 'Config',
                      },
                    ],
                    Name: 'Security_Resources',
                    RoleArn: {
                      'Fn::GetAtt': ['PipelinePipelineRole6D983AD5', 'Arn'],
                    },
                    RunOrder: 2,
                  },
                  {
                    ActionTypeId: {
                      Category: 'Build',
                      Owner: 'AWS',
                      Provider: 'CodeBuild',
                      Version: '1',
                    },
                    Configuration: {
                      EnvironmentVariables:
                        '[{"name":"CDK_OPTIONS","type":"PLAINTEXT","value":"deploy --stage network-associations"},{"name":"CONFIG_COMMIT_ID","type":"PLAINTEXT","value":"#{Config-Vars.CommitId}"},{"name":"ACCELERATOR_STAGE","type":"PLAINTEXT","value":"network-associations"}]',
                      PrimarySource: 'Build',
                      ProjectName: {
                        Ref: 'PipelineToolkitProjectBCBD6910',
                      },
                    },
                    InputArtifacts: [
                      {
                        Name: 'Build',
                      },
                      {
                        Name: 'Config',
                      },
                    ],
                    Name: 'Network_Associations',
                    RoleArn: {
                      'Fn::GetAtt': ['PipelinePipelineRole6D983AD5', 'Arn'],
                    },
                    RunOrder: 3,
                  },
                  {
                    ActionTypeId: {
                      Category: 'Build',
                      Owner: 'AWS',
                      Provider: 'CodeBuild',
                      Version: '1',
                    },
                    Configuration: {
                      EnvironmentVariables:
                        '[{"name":"CDK_OPTIONS","type":"PLAINTEXT","value":"deploy --stage finalize"},{"name":"CONFIG_COMMIT_ID","type":"PLAINTEXT","value":"#{Config-Vars.CommitId}"},{"name":"ACCELERATOR_STAGE","type":"PLAINTEXT","value":"finalize"}]',
                      PrimarySource: 'Build',
                      ProjectName: {
                        Ref: 'PipelineToolkitProjectBCBD6910',
                      },
                    },
                    InputArtifacts: [
                      {
                        Name: 'Build',
                      },
                      {
                        Name: 'Config',
                      },
                    ],
                    Name: 'Finalize',
                    RoleArn: {
                      'Fn::GetAtt': ['PipelinePipelineRole6D983AD5', 'Arn'],
                    },
                    RunOrder: 4,
                  },
                ],
                Name: 'Deploy',
              },
            ],
          },
        },
      },
    });
  });

  /**
   * Build stage CodeBuild project resource configuration test
   */
  test(`${testNamePrefix} Build stage CodeBuild project resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        PipelineBuildProject9D447FA8: {
          Type: 'AWS::CodeBuild::Project',
          Properties: {
            Artifacts: {
              Type: 'CODEPIPELINE',
            },
            Cache: {
              Modes: ['LOCAL_SOURCE_CACHE'],
              Type: 'LOCAL',
            },
            EncryptionKey: {
              Ref: 'SsmParameterValueacceleratorawsacceleratorinstallerkmskeyarnC96584B6F00A464EAD1953AFF4B05118Parameter',
            },
            Environment: {
              ComputeType: 'BUILD_GENERAL1_MEDIUM',
              EnvironmentVariables: [
                {
                  Name: 'NODE_OPTIONS',
                  Type: 'PLAINTEXT',
                  Value: '--max_old_space_size=4096',
                },
              ],
              Image: 'aws/codebuild/standard:5.0',
              ImagePullCredentialsType: 'CODEBUILD',
              PrivilegedMode: true,
              Type: 'LINUX_CONTAINER',
            },
            Name: 'aws-accelerator-build-project',
            ServiceRole: {
              'Fn::GetAtt': ['PipelineBuildRoleDC686070', 'Arn'],
            },
            Source: {
              BuildSpec:
                '{\n  "version": "0.2",\n  "phases": {\n    "install": {\n      "runtime-versions": {\n        "nodejs": 14\n      }\n    },\n    "build": {\n      "commands": [\n        "env",\n        "cd source",\n        "yarn install",\n        "yarn lerna link",\n        "yarn build",\n        "yarn validate-config $CODEBUILD_SRC_DIR_Config"\n      ]\n    }\n  },\n  "artifacts": {\n    "files": [\n      "**/*"\n    ],\n    "enable-symlinks": "yes"\n  }\n}',
              Type: 'CODEPIPELINE',
            },
          },
        },
      },
    });
  });

  /**
   * CodePipeline build role resource configuration test
   */
  test(`${testNamePrefix} CodePipeline build role resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        PipelineBuildRoleDC686070: {
          Type: 'AWS::IAM::Role',
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
          },
        },
      },
    });
  });

  /**
   * CodePipeline build role iam policy resource configuration test
   */
  test(`${testNamePrefix} CodePipeline build role iam policy resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        PipelineBuildRoleDefaultPolicy3DAB973E: {
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
                            Ref: 'PipelineBuildProject9D447FA8',
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
                            Ref: 'PipelineBuildProject9D447FA8',
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
                          Ref: 'PipelineBuildProject9D447FA8',
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
                    Ref: 'SsmParameterValueacceleratorawsacceleratorinstallerkmskeyarnC96584B6F00A464EAD1953AFF4B05118Parameter',
                  },
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
                  Resource: [
                    {
                      'Fn::GetAtt': ['PipelineSecureBucketB3EEB324', 'Arn'],
                    },
                    {
                      'Fn::Join': [
                        '',
                        [
                          {
                            'Fn::GetAtt': ['PipelineSecureBucketB3EEB324', 'Arn'],
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
                    Ref: 'SsmParameterValueacceleratorawsacceleratorinstallerkmskeyarnC96584B6F00A464EAD1953AFF4B05118Parameter',
                  },
                },
              ],
              Version: '2012-10-17',
            },
            PolicyName: 'PipelineBuildRoleDefaultPolicy3DAB973E',
            Roles: [
              {
                Ref: 'PipelineBuildRoleDC686070',
              },
            ],
          },
        },
      },
    });
  });

  /**
   * PipelineConfigRepository resource configuration test
   */
  test(`${testNamePrefix} PipelineConfigRepository resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        PipelineConfigRepositoryE5225086: {
          Type: 'AWS::CodeCommit::Repository',
          Properties: {
            Code: {
              BranchName: 'main',
              S3: {
                Bucket: {
                  'Fn::Sub': 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
                },
              },
            },
            RepositoryName: 'aws-accelerator-config',
          },
        },
      },
    });
  });

  /**
   * PipelinePipelineRole resource configuration test
   */
  test(`${testNamePrefix} PipelinePipelineRole resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        PipelinePipelineRole6D983AD5: {
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
   * PipelinePipelineRoleDefaultPolicy resource configuration test
   */
  test(`${testNamePrefix} PipelinePipelineRoleDefaultPolicy resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        PipelinePipelineRoleDefaultPolicy7D262A22: {
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
                      'Fn::GetAtt': ['PipelineSecureBucketB3EEB324', 'Arn'],
                    },
                    {
                      'Fn::Join': [
                        '',
                        [
                          {
                            'Fn::GetAtt': ['PipelineSecureBucketB3EEB324', 'Arn'],
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
                    Ref: 'SsmParameterValueacceleratorawsacceleratorinstallerkmskeyarnC96584B6F00A464EAD1953AFF4B05118Parameter',
                  },
                },
                {
                  Action: 'sts:AssumeRole',
                  Effect: 'Allow',
                  Resource: {
                    'Fn::GetAtt': ['PipelineSourceCodePipelineActionRoleBBC58FD5', 'Arn'],
                  },
                },
                {
                  Action: 'sts:AssumeRole',
                  Effect: 'Allow',
                  Resource: {
                    'Fn::GetAtt': ['PipelineSourceConfigurationCodePipelineActionRoleA2807B19', 'Arn'],
                  },
                },
                {
                  Action: 'sts:AssumeRole',
                  Effect: 'Allow',
                  Resource: {
                    'Fn::GetAtt': ['PipelinePipelineRole6D983AD5', 'Arn'],
                  },
                },
                {
                  Action: ['codebuild:BatchGetBuilds', 'codebuild:StartBuild', 'codebuild:StopBuild'],
                  Effect: 'Allow',
                  Resource: {
                    'Fn::GetAtt': ['PipelineBuildProject9D447FA8', 'Arn'],
                  },
                },
                {
                  Action: ['codebuild:BatchGetBuilds', 'codebuild:StartBuild', 'codebuild:StopBuild'],
                  Effect: 'Allow',
                  Resource: {
                    'Fn::GetAtt': ['PipelineToolkitProjectBCBD6910', 'Arn'],
                  },
                },
                {
                  Action: 'sts:AssumeRole',
                  Effect: 'Allow',
                  Resource: {
                    'Fn::GetAtt': ['PipelineReviewApproveCodePipelineActionRole3122ED42', 'Arn'],
                  },
                },
                {
                  Action: 'sns:Publish',
                  Effect: 'Allow',
                  Resource: {
                    Ref: 'PipelineAcceleratorStatusTopic2BD5793F',
                  },
                },
                {
                  Action: 'sns:Publish',
                  Effect: 'Allow',
                  Resource: {
                    Ref: 'PipelineAcceleratorFailedStatusTopic614002B3',
                  },
                },
              ],
              Version: '2012-10-17',
            },
            PolicyName: 'PipelinePipelineRoleDefaultPolicy7D262A22',
            Roles: [
              {
                Ref: 'PipelinePipelineRole6D983AD5',
              },
            ],
          },
        },
      },
    });
  });

  /**
   * PipelineSecureBucket resource configuration test
   */
  test(`${testNamePrefix} PipelineSecureBucket resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        PipelineSecureBucketB3EEB324: {
          Type: 'AWS::S3::Bucket',
          DeletionPolicy: 'Retain',
          UpdateReplacePolicy: 'Retain',
          Properties: {
            BucketEncryption: {
              ServerSideEncryptionConfiguration: [
                {
                  ServerSideEncryptionByDefault: {
                    KMSMasterKeyID: {
                      Ref: 'SsmParameterValueacceleratorawsacceleratorinstallerkmskeyarnC96584B6F00A464EAD1953AFF4B05118Parameter',
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
                  'aws-accelerator-pipeline-',
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
   * PipelineSecureBucketPolicy resource configuration test
   */
  test(`${testNamePrefix} PipelineSecureBucketPolicy resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        PipelineSecureBucketPolicy1BD98DDB: {
          Type: 'AWS::S3::BucketPolicy',
          Properties: {
            Bucket: {
              Ref: 'PipelineSecureBucketB3EEB324',
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
                      'Fn::GetAtt': ['PipelineSecureBucketB3EEB324', 'Arn'],
                    },
                    {
                      'Fn::Join': [
                        '',
                        [
                          {
                            'Fn::GetAtt': ['PipelineSecureBucketB3EEB324', 'Arn'],
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
   * PipelineSourceCodePipelineActionRole resource configuration test
   */
  test(`${testNamePrefix} PipelineSourceCodePipelineActionRole resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        PipelineSourceCodePipelineActionRoleBBC58FD5: {
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
   * PipelineSourceCodePipelineActionRoleDefaultPolicy resource configuration test
   */
  test(`${testNamePrefix} PipelineSourceCodePipelineActionRoleDefaultPolicy resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        PipelineSourceCodePipelineActionRoleDefaultPolicy5FD830BF: {
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
                      'Fn::GetAtt': ['PipelineSecureBucketB3EEB324', 'Arn'],
                    },
                    {
                      'Fn::Join': [
                        '',
                        [
                          {
                            'Fn::GetAtt': ['PipelineSecureBucketB3EEB324', 'Arn'],
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
                    Ref: 'SsmParameterValueacceleratorawsacceleratorinstallerkmskeyarnC96584B6F00A464EAD1953AFF4B05118Parameter',
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
                        ':accelerator-source',
                      ],
                    ],
                  },
                },
              ],
              Version: '2012-10-17',
            },
            PolicyName: 'PipelineSourceCodePipelineActionRoleDefaultPolicy5FD830BF',
            Roles: [
              {
                Ref: 'PipelineSourceCodePipelineActionRoleBBC58FD5',
              },
            ],
          },
        },
      },
    });
  });

  /**
   * PipelineSourceConfigurationCodePipelineActionRole configuration test
   */
  test(`${testNamePrefix} PipelineSourceConfigurationCodePipelineActionRole resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        PipelineSourceConfigurationCodePipelineActionRoleA2807B19: {
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
   * PipelineSourceConfigurationCodePipelineActionRoleDefaultPolicy configuration test
   */
  test(`${testNamePrefix} PipelineSourceConfigurationCodePipelineActionRoleDefaultPolicy resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        PipelineSourceConfigurationCodePipelineActionRoleDefaultPolicy5FE1A228: {
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
                      'Fn::GetAtt': ['PipelineSecureBucketB3EEB324', 'Arn'],
                    },
                    {
                      'Fn::Join': [
                        '',
                        [
                          {
                            'Fn::GetAtt': ['PipelineSecureBucketB3EEB324', 'Arn'],
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
                    Ref: 'SsmParameterValueacceleratorawsacceleratorinstallerkmskeyarnC96584B6F00A464EAD1953AFF4B05118Parameter',
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
                    'Fn::GetAtt': ['PipelineConfigRepositoryE5225086', 'Arn'],
                  },
                },
              ],
              Version: '2012-10-17',
            },
            PolicyName: 'PipelineSourceConfigurationCodePipelineActionRoleDefaultPolicy5FE1A228',
            Roles: [
              {
                Ref: 'PipelineSourceConfigurationCodePipelineActionRoleA2807B19',
              },
            ],
          },
        },
      },
    });
  });

  /**
   * PipelineToolkitProject resource configuration test
   */
  test(`${testNamePrefix} PipelineToolkitProject resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        PipelineToolkitProjectBCBD6910: {
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
                  Name: 'ACCELERATOR_QUALIFIER',
                  Type: 'PLAINTEXT',
                  Value: 'aws-accelerator',
                },
              ],
              Image: 'aws/codebuild/standard:5.0',
              ImagePullCredentialsType: 'CODEBUILD',
              PrivilegedMode: true,
              Type: 'LINUX_CONTAINER',
            },
            ServiceRole: {
              'Fn::GetAtt': ['AdminCdkToolkitRole292E163A', 'Arn'],
            },
            Source: {
              BuildSpec: {
                'Fn::Join': [
                  '',
                  [
                    '{\n  "version": "0.2",\n  "phases": {\n    "install": {\n      "runtime-versions": {\n        "nodejs": 14\n      }\n    },\n    "build": {\n      "commands": [\n        "env",\n        "cd source",\n        "cd packages/@aws-accelerator/accelerator",\n        "if [ -z \\"${ACCELERATOR_STAGE}\\" ]; then yarn run ts-node --transpile-only cdk.ts synth --require-approval never --config-dir $CODEBUILD_SRC_DIR_Config --partition ',
                    {
                      Ref: 'AWS::Partition',
                    },
                    '; fi",\n        "if [ ! -z \\"${ACCELERATOR_STAGE}\\" ]; then yarn run ts-node --transpile-only cdk.ts synth --stage $ACCELERATOR_STAGE --require-approval never --config-dir $CODEBUILD_SRC_DIR_Config --partition ',
                    {
                      Ref: 'AWS::Partition',
                    },
                    '; fi",\n        "yarn run ts-node --transpile-only cdk.ts --require-approval never $CDK_OPTIONS --config-dir $CODEBUILD_SRC_DIR_Config --partition ',
                    {
                      Ref: 'AWS::Partition',
                    },
                    ' --app cdk.out"\n      ]\n    }\n  }\n}',
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
   * PipelineToolkitRole resource configuration test
   */
  test(`${testNamePrefix} PipelineToolkitRole resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        AdminCdkToolkitRole292E163A: {
          Type: 'AWS::IAM::Role',
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
        },
      },
    });
  });
});
