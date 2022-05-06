import * as cdk from 'aws-cdk-lib';
import { TesterPipelineStack } from '../lib/stacks/tester-pipeline-stack';

const testNamePrefix = 'Construct(TesterPipelineStack): ';

/**
 * TesterPipelineStack
 */
const app = new cdk.App();
const stack = new TesterPipelineStack(app, 'TesterPipelineStack', {
  sourceRepositoryName: 'aws-platform-accelerator-source',
  sourceBranchName: 'main',
  qualifier: 'aws-accelerator',
  managementCrossAccountRoleName: 'AWSControlTowerExecution',
  managementAccountId: app.account,
  managementAccountRoleName: 'PlatformAcceleratorAccountAccessRole',
});

/**
 * TesterPipelineStack construct test
 */
describe('TesterPipelineStack', () => {
  /**
   * Number of CodePipeline resource test
   */
  test(`${testNamePrefix} CodePipeline resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::CodePipeline::Pipeline', 1);
  });

  /**
   * Number of CodeCommit Repository resource test
   */
  test(`${testNamePrefix} CodeCommit Repository resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::CodeCommit::Repository', 1);
  });

  /**
   * Number of Pipeline cloudwatch events rules resource test
   */
  test(`${testNamePrefix} Pipeline cloudwatch events rules resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Events::Rule', 1);
  });

  /**
   * Number of IAM Role resource test
   */
  test(`${testNamePrefix} IAM Role resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::IAM::Role', 5);
  });

  /**
   * Number of IAM Policy resource test
   */
  test(`${testNamePrefix} IAM Policy resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::IAM::Policy', 5);
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
   * Number of CodeBuild project resource test
   */
  test(`${testNamePrefix} CodeBuild project resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::CodeBuild::Project', 1);
  });

  /**
   * Pipeline resource configuration test
   */
  test(`${testNamePrefix} CodePipeline resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TesterPipeline69BAAE53: {
          Type: 'AWS::CodePipeline::Pipeline',
          DependsOn: ['TesterPipelinePipelineRoleDefaultPolicyFC1B0BBB', 'TesterPipelinePipelineRoleBF82DB14'],
          Properties: {
            ArtifactStore: {
              EncryptionKey: {
                Id: {
                  Ref: 'SsmParameterValueacceleratorawsacceleratorinstallerkmskeyarnC96584B6F00A464EAD1953AFF4B05118Parameter',
                },
                Type: 'KMS',
              },
              Location: {
                Ref: 'TesterPipelineSecureBucket8740FCE8',
              },
              Type: 'S3',
            },
            Name: 'aws-accelerator-tester-pipeline',
            RoleArn: {
              'Fn::GetAtt': ['TesterPipelinePipelineRoleBF82DB14', 'Arn'],
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
                      RepositoryName: 'aws-platform-accelerator-source',
                    },
                    Name: 'Source',
                    OutputArtifacts: [
                      {
                        Name: 'Source',
                      },
                    ],
                    RoleArn: {
                      'Fn::GetAtt': ['TesterPipelineSourceCodePipelineActionRole1C0E642C', 'Arn'],
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
                        'Fn::GetAtt': ['TesterPipelineConfigRepositoryC9B47F16', 'Name'],
                      },
                    },
                    Name: 'Configuration',
                    OutputArtifacts: [
                      {
                        Name: 'Config',
                      },
                    ],
                    RoleArn: {
                      'Fn::GetAtt': ['TesterPipelineSourceConfigurationCodePipelineActionRole6DD3F86D', 'Arn'],
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
                        Ref: 'TesterPipelineTesterProject3BEC9F5A',
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
                    Name: 'Deploy',
                    OutputArtifacts: [
                      {
                        Name: 'DeployOutput',
                      },
                    ],
                    RoleArn: {
                      'Fn::GetAtt': ['TesterPipelinePipelineRoleBF82DB14', 'Arn'],
                    },
                    RunOrder: 1,
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
   * Config CodeCommit repository resource configuration test
   */
  test(`${testNamePrefix} Config CodeCommit repository resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TesterPipelineConfigRepositoryC9B47F16: {
          Type: 'AWS::CodeCommit::Repository',
          DeletionPolicy: 'Retain',
          UpdateReplacePolicy: 'Retain',
          Properties: {
            Code: {
              BranchName: 'main',
              S3: {
                Bucket: {
                  'Fn::Sub': 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
                },
              },
            },
            RepositoryDescription: 'AWS Accelerator functional test configuration repository',
            RepositoryName: 'aws-accelerator-test-config',
          },
        },
      },
    });
  });

  /**
   * Config CodeCommit repository event rule configuration test
   */
  test(`${testNamePrefix} Config CodeCommit repository event rule resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TesterPipelineConfigRepositoryTesterPipelineStackTesterPipeline463CB8B6mainEventRuleB1B7F3DD: {
          Type: 'AWS::Events::Rule',
          Properties: {
            EventPattern: {
              detail: {
                event: ['referenceCreated', 'referenceUpdated'],
                referenceName: ['main'],
              },
              'detail-type': ['CodeCommit Repository State Change'],
              resources: [
                {
                  'Fn::GetAtt': ['TesterPipelineConfigRepositoryC9B47F16', 'Arn'],
                },
              ],
              source: ['aws.codecommit'],
            },
            State: 'ENABLED',
            Targets: [
              {
                Arn: {
                  'Fn::Join': [
                    '',
                    [
                      'arn:',
                      {
                        Ref: 'AWS::Partition',
                      },
                      ':codepipeline:',
                      {
                        Ref: 'AWS::Region',
                      },
                      ':',
                      {
                        Ref: 'AWS::AccountId',
                      },
                      ':',
                      {
                        Ref: 'TesterPipeline69BAAE53',
                      },
                    ],
                  ],
                },
                Id: 'Target0',
                RoleArn: {
                  'Fn::GetAtt': ['TesterPipelineEventsRoleC96AADF0', 'Arn'],
                },
              },
            ],
          },
        },
      },
    });
  });

  /**
   * CodePipeline deploy stage IAM role resource configuration test
   */
  test(`${testNamePrefix} CodePipeline deploy stage IAM role resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TesterPipelineDeployRole20D5B4C2: {
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

  /**
   * CodePipeline deploy stage IAM role default policy resource configuration test
   */
  test(`${testNamePrefix} CodePipeline deploy stage IAM role default policy resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TesterPipelineDeployRoleDefaultPolicyBB88BBD9: {
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
                            Ref: 'TesterPipelineTesterProject3BEC9F5A',
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
                            Ref: 'TesterPipelineTesterProject3BEC9F5A',
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
                          Ref: 'TesterPipelineTesterProject3BEC9F5A',
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
                      'Fn::GetAtt': ['TesterPipelineSecureBucket8740FCE8', 'Arn'],
                    },
                    {
                      'Fn::Join': [
                        '',
                        [
                          {
                            'Fn::GetAtt': ['TesterPipelineSecureBucket8740FCE8', 'Arn'],
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
            PolicyName: 'TesterPipelineDeployRoleDefaultPolicyBB88BBD9',
            Roles: [
              {
                Ref: 'TesterPipelineDeployRole20D5B4C2',
              },
            ],
          },
        },
      },
    });
  });

  /**
   * CodePipeline config repository events role resource configuration test
   */
  test(`${testNamePrefix} CodePipeline config repository events role resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TesterPipelineEventsRoleC96AADF0: {
          Type: 'AWS::IAM::Role',
          Properties: {
            AssumeRolePolicyDocument: {
              Statement: [
                {
                  Action: 'sts:AssumeRole',
                  Effect: 'Allow',
                  Principal: {
                    Service: 'events.amazonaws.com',
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
   * CodePipeline config repository events role default policy resource configuration test
   */
  test(`${testNamePrefix} CodePipeline config repository events role default policy resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TesterPipelineEventsRoleDefaultPolicy61DCBDBE: {
          Type: 'AWS::IAM::Policy',
          Properties: {
            PolicyDocument: {
              Statement: [
                {
                  Action: 'codepipeline:StartPipelineExecution',
                  Effect: 'Allow',
                  Resource: {
                    'Fn::Join': [
                      '',
                      [
                        'arn:',
                        {
                          Ref: 'AWS::Partition',
                        },
                        ':codepipeline:',
                        {
                          Ref: 'AWS::Region',
                        },
                        ':',
                        {
                          Ref: 'AWS::AccountId',
                        },
                        ':',
                        {
                          Ref: 'TesterPipeline69BAAE53',
                        },
                      ],
                    ],
                  },
                },
              ],
              Version: '2012-10-17',
            },
            PolicyName: 'TesterPipelineEventsRoleDefaultPolicy61DCBDBE',
            Roles: [
              {
                Ref: 'TesterPipelineEventsRoleC96AADF0',
              },
            ],
          },
        },
      },
    });
  });

  /**
   * CodePipeline IAM role resource configuration test
   */
  test(`${testNamePrefix} CodePipeline IAM role resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TesterPipelinePipelineRoleBF82DB14: {
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
   * CodePipeline IAM role default policy resource configuration test
   */
  test(`${testNamePrefix} CodePipeline IAM role default policy resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TesterPipelinePipelineRoleDefaultPolicyFC1B0BBB: {
          Type: 'AWS::IAM::Policy',
          Metadata: {
            cdk_nag: {
              rules_to_suppress: [
                {
                  id: 'AwsSolutions-IAM5',
                  reason: 'PipelineRole DefaultPolicy is built by cdk.',
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
                      'Fn::GetAtt': ['TesterPipelineSecureBucket8740FCE8', 'Arn'],
                    },
                    {
                      'Fn::Join': [
                        '',
                        [
                          {
                            'Fn::GetAtt': ['TesterPipelineSecureBucket8740FCE8', 'Arn'],
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
                    'Fn::GetAtt': ['TesterPipelineSourceCodePipelineActionRole1C0E642C', 'Arn'],
                  },
                },
                {
                  Action: 'sts:AssumeRole',
                  Effect: 'Allow',
                  Resource: {
                    'Fn::GetAtt': ['TesterPipelineSourceConfigurationCodePipelineActionRole6DD3F86D', 'Arn'],
                  },
                },
                {
                  Action: 'sts:AssumeRole',
                  Effect: 'Allow',
                  Resource: {
                    'Fn::GetAtt': ['TesterPipelinePipelineRoleBF82DB14', 'Arn'],
                  },
                },
                {
                  Action: ['codebuild:BatchGetBuilds', 'codebuild:StartBuild', 'codebuild:StopBuild'],
                  Effect: 'Allow',
                  Resource: {
                    'Fn::GetAtt': ['TesterPipelineTesterProject3BEC9F5A', 'Arn'],
                  },
                },
              ],
              Version: '2012-10-17',
            },
            PolicyName: 'TesterPipelinePipelineRoleDefaultPolicyFC1B0BBB',
            Roles: [
              {
                Ref: 'TesterPipelinePipelineRoleBF82DB14',
              },
            ],
          },
        },
      },
    });
  });
  /**
   * CodePipeline config S3 bucket resource configuration test
   */
  test(`${testNamePrefix} CodePipeline config S3 bucket resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TesterPipelineSecureBucket8740FCE8: {
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
                  'aws-accelerator-tester-',
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
   * CodePipeline config S3 bucket policy resource configuration test
   */
  test(`${testNamePrefix} CodePipeline config S3 bucket policy resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TesterPipelineSecureBucketPolicyD3292C3A: {
          Type: 'AWS::S3::BucketPolicy',
          Properties: {
            Bucket: {
              Ref: 'TesterPipelineSecureBucket8740FCE8',
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
                      'Fn::GetAtt': ['TesterPipelineSecureBucket8740FCE8', 'Arn'],
                    },
                    {
                      'Fn::Join': [
                        '',
                        [
                          {
                            'Fn::GetAtt': ['TesterPipelineSecureBucket8740FCE8', 'Arn'],
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
   * CodePipeline source action IAM role resource configuration test
   */
  test(`${testNamePrefix} CodePipeline source action IAM role resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TesterPipelineSourceCodePipelineActionRole1C0E642C: {
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
   * CodePipeline source action IAM role default policy resource configuration test
   */
  test(`${testNamePrefix} CodePipeline source action IAM role default policy resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TesterPipelineSourceCodePipelineActionRoleDefaultPolicy9AAA0DC1: {
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
                      'Fn::GetAtt': ['TesterPipelineSecureBucket8740FCE8', 'Arn'],
                    },
                    {
                      'Fn::Join': [
                        '',
                        [
                          {
                            'Fn::GetAtt': ['TesterPipelineSecureBucket8740FCE8', 'Arn'],
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
                        ':aws-platform-accelerator-source',
                      ],
                    ],
                  },
                },
              ],
              Version: '2012-10-17',
            },
            PolicyName: 'TesterPipelineSourceCodePipelineActionRoleDefaultPolicy9AAA0DC1',
            Roles: [
              {
                Ref: 'TesterPipelineSourceCodePipelineActionRole1C0E642C',
              },
            ],
          },
        },
      },
    });
  });

  /**
   * CodePipeline source configuration IAM role resource configuration test
   */
  test(`${testNamePrefix} CodePipeline source configuration IAM role resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TesterPipelineSourceConfigurationCodePipelineActionRole6DD3F86D: {
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
   * CodePipeline source configuration IAM role default policy resource configuration test
   */
  test(`${testNamePrefix} CodePipeline source configuration IAM role default policy resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TesterPipelineSourceConfigurationCodePipelineActionRoleDefaultPolicyCD0DC6AA: {
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
                      'Fn::GetAtt': ['TesterPipelineSecureBucket8740FCE8', 'Arn'],
                    },
                    {
                      'Fn::Join': [
                        '',
                        [
                          {
                            'Fn::GetAtt': ['TesterPipelineSecureBucket8740FCE8', 'Arn'],
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
                    'Fn::GetAtt': ['TesterPipelineConfigRepositoryC9B47F16', 'Arn'],
                  },
                },
              ],
              Version: '2012-10-17',
            },
            PolicyName: 'TesterPipelineSourceConfigurationCodePipelineActionRoleDefaultPolicyCD0DC6AA',
            Roles: [
              {
                Ref: 'TesterPipelineSourceConfigurationCodePipelineActionRole6DD3F86D',
              },
            ],
          },
        },
      },
    });
  });

  /**
   * CodePipeline tester CodeBuild project resource configuration test
   */
  test(`${testNamePrefix} CodePipeline tester CodeBuild project resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TesterPipelineTesterProject3BEC9F5A: {
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
                {
                  Name: 'ACCELERATOR_REPOSITORY_NAME',
                  Type: 'PLAINTEXT',
                  Value: 'aws-platform-accelerator-source',
                },
                {
                  Name: 'ACCELERATOR_REPOSITORY_BRANCH_NAME',
                  Type: 'PLAINTEXT',
                  Value: 'main',
                },
              ],
              Image: 'aws/codebuild/standard:5.0',
              ImagePullCredentialsType: 'CODEBUILD',
              PrivilegedMode: true,
              Type: 'LINUX_CONTAINER',
            },
            Name: 'aws-accelerator-tester-project',
            ServiceRole: {
              'Fn::GetAtt': ['TesterPipelineDeployRole20D5B4C2', 'Arn'],
            },
            Source: {
              BuildSpec: {
                'Fn::Join': [
                  '',
                  [
                    'version: "0.2"\nphases:\n  install:\n    runtime-versions:\n      nodejs: 14\n  build:\n    commands:\n      - cd source\n      - yarn install\n      - yarn lerna link\n      - yarn build\n      - cd packages/@aws-accelerator/tester\n      - env\n      - if [ ! -z "$MANAGEMENT_ACCOUNT_ID" ] && [ ! -z "$MANAGEMENT_ACCOUNT_ROLE_NAME" ]; then yarn run cdk deploy --require-approval never --context account=',
                    {
                      Ref: 'AWS::AccountId',
                    },
                    ' --context region=',
                    {
                      Ref: 'AWS::Region',
                    },
                    ' --context management-cross-account-role-name=AWSControlTowerExecution --context qualifier=aws-accelerator --context config-dir=$CODEBUILD_SRC_DIR_Config --context management-account-id=undefined --context management-account-role-name=PlatformAcceleratorAccountAccessRole; else yarn run cdk deploy --require-approval never --context account=',
                    {
                      Ref: 'AWS::AccountId',
                    },
                    ' --context region=',
                    {
                      Ref: 'AWS::Region',
                    },
                    ' --context management-cross-account-role-name=AWSControlTowerExecution --context config-dir=$CODEBUILD_SRC_DIR_Config; fi\n',
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
});
