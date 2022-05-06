import * as cdk from 'aws-cdk-lib';
import { SsmSessionManagerSettings } from '../../index';

const testNamePrefix = 'Construct(SsmSessionManagerSettings): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new SsmSessionManagerSettings(stack, 'SsmSessionManagerSettings', {
  s3BucketName: 'bucketName',
  s3KeyPrefix: 'prefix',
  s3BucketKeyArn: 'arn',
  sendToS3: true,
  sendToCloudWatchLogs: true,
  cloudWatchEncryptionEnabled: true,
  kmsKey: new cdk.aws_kms.Key(stack, 'Key', {}),
  logRetentionInDays: 3653,
});

/**
 * SsmSessionManagerSettings construct test
 */
describe('SsmSessionManagerSettings', () => {
  /**
   * Number of Lambda Function test
   */
  test(`${testNamePrefix} Lambda Function count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Lambda::Function', 1);
  });

  /**
   * Number of IAM Role test
   */
  test(`${testNamePrefix} IAM Role count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::IAM::Role', 2);
  });

  /**
   * Number of IAM Instance Profile
   */
  test(`${testNamePrefix} IAM Instance Profile count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::IAM::InstanceProfile', 1);
  });

  /**
   * Number of IAM Managed Policy
   */
  test(`${testNamePrefix} IAM Managed Policy count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::IAM::ManagedPolicy', 2);
  });

  /**
   * Number of KMS Key test
   */
  test(`${testNamePrefix} KMS Key count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::KMS::Key', 3);
  });

  /**
   * Number of KMS Alias test
   */
  test(`${testNamePrefix} KMS Alias count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::KMS::Alias', 2);
  });

  /**
   * Number of Log Groups test
   */
  test(`${testNamePrefix} Log Group count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Logs::LogGroup', 2);
  });

  test(`${testNamePrefix} KMS Alias config test`, () => {
    cdk.assertions.Template.fromStack(stack).hasResourceProperties('AWS::KMS::Alias', {
      AliasName: 'alias/accelerator/session-manager-logging/cloud-watch-logs',
    });
  });

  test(`${testNamePrefix} KMS Alias config test`, () => {
    cdk.assertions.Template.fromStack(stack).hasResourceProperties('AWS::KMS::Alias', {
      AliasName: 'alias/accelerator/session-manager-logging/session',
    });
  });

  /**
   * Number of Custom resource SsmSessionManagerSettings test
   */
  test(`${testNamePrefix} Custom resource SsmSessionManagerSettings count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::SsmSessionManagerSettings', 1);
  });

  /**
   * Custom resource provider framework lambda function configuration test
   */
  test(`${testNamePrefix} Custom resource provider framework lambda function configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomSessionManagerLoggingCustomResourceProviderHandler4FE51699: {
          DependsOn: ['CustomSessionManagerLoggingCustomResourceProviderRole1D8EE686'],
          Properties: {
            Code: {
              S3Bucket: {
                'Fn::Sub': 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
              },
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': ['CustomSessionManagerLoggingCustomResourceProviderRole1D8EE686', 'Arn'],
            },
            Runtime: 'nodejs14.x',
            Timeout: 900,
          },
          Type: 'AWS::Lambda::Function',
        },
      },
    });
  });

  /**
   * Custom resource provider framework lambda function configuration test
   */
  test(`${testNamePrefix} Custom resource provider framework lambda function configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomSessionManagerLoggingCustomResourceProviderRole1D8EE686: {
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
                      Action: ['ssm:DescribeDocument', 'ssm:CreateDocument', 'ssm:UpdateDocument'],
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
          Type: 'AWS::IAM::Role',
        },
      },
    });
  });

  /**
   * Custom resource provider framework lambda function configuration test
   */
  test(`${testNamePrefix} Custom resource provider framework lambda function configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        SsmSessionManagerSettings24721AC9: {
          DeletionPolicy: 'Delete',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomSessionManagerLoggingCustomResourceProviderHandler4FE51699', 'Arn'],
            },
            cloudWatchEncryptionEnabled: true,
            cloudWatchLogGroupName: {
              Ref: 'SsmSessionManagerSettingssessionManagerLogGroupEA6AC1BB',
            },
            kmsKeyId: {
              Ref: 'SsmSessionManagerSettingsSessionManagerSessionCmk0B840C26',
            },
            s3BucketName: 'bucketName',
            s3EncryptionEnabled: true,
            s3KeyPrefix: 'prefix',
          },
          Type: 'Custom::SsmSessionManagerSettings',
          UpdateReplacePolicy: 'Delete',
        },
      },
    });
  });

  /**
   * Custom resource provider framework lambda function configuration test
   */
  test(`${testNamePrefix} Custom resource provider framework lambda function configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        SsmSessionManagerSettingsSessionManagerEC2InstanceProfile36B87210: {
          Properties: {
            InstanceProfileName: {
              'Fn::Join': [
                '',
                [
                  'SessionManagerEc2Role-',
                  {
                    Ref: 'AWS::Region',
                  },
                ],
              ],
            },
            Roles: [
              {
                Ref: 'SsmSessionManagerSettingsSessionManagerEC2Role83702F06',
              },
            ],
          },
          Type: 'AWS::IAM::InstanceProfile',
        },
      },
    });
  });

  /**
   * Custom resource provider framework lambda function configuration test
   */
  test(`${testNamePrefix} Custom resource provider framework lambda function configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        SsmSessionManagerSettingsSessionManagerEC2Policy8ED295CA: {
          Properties: {
            Description: '',
            ManagedPolicyName: {
              'Fn::Join': [
                '',
                [
                  'SessionManagerLogging-',
                  {
                    Ref: 'AWS::Region',
                  },
                ],
              ],
            },
            Path: '/',
            PolicyDocument: {
              Statement: [
                {
                  Action: [
                    'ssmmessages:CreateControlChannel',
                    'ssmmessages:CreateDataChannel',
                    'ssmmessages:OpenControlChannel',
                    'ssmmessages:OpenDataChannel',
                    'ssm:UpdateInstanceInformation',
                  ],
                  Effect: 'Allow',
                  Resource: '*',
                },
                {
                  Action: 'logs:DescribeLogGroups',
                  Effect: 'Allow',
                  Resource: {
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
                        ':log-group:*',
                      ],
                    ],
                  },
                },
                {
                  Action: ['logs:CreateLogStream', 'logs:PutLogEvents', 'logs:DescribeLogStreams'],
                  Effect: 'Allow',
                  Resource: {
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
                        ':log-group:aws-accelerator-session-manager-logs:*',
                      ],
                    ],
                  },
                },
                {
                  Action: ['s3:PutObject', 's3:PutObjectAcl'],
                  Effect: 'Allow',
                  Resource: {
                    'Fn::Join': [
                      '',
                      [
                        'arn:',
                        {
                          Ref: 'AWS::Partition',
                        },
                        ':s3:::bucketName/prefix/*',
                      ],
                    ],
                  },
                },
                {
                  Action: 's3:GetEncryptionConfiguration',
                  Effect: 'Allow',
                  Resource: {
                    'Fn::Join': [
                      '',
                      [
                        'arn:',
                        {
                          Ref: 'AWS::Partition',
                        },
                        ':s3:::bucketName',
                      ],
                    ],
                  },
                },
                {
                  Action: ['kms:Decrypt', 'kms:GenerateDataKey'],
                  Effect: 'Allow',
                  Resource: 'arn',
                },
                {
                  Action: 'kms:Decrypt',
                  Effect: 'Allow',
                  Resource: {
                    'Fn::GetAtt': ['SsmSessionManagerSettingsSessionManagerSessionCmk0B840C26', 'Arn'],
                  },
                },
              ],
              Version: '2012-10-17',
            },
          },
          Type: 'AWS::IAM::ManagedPolicy',
        },
      },
    });
  });

  /**
   * Custom resource provider framework lambda function configuration test
   */
  test(`${testNamePrefix} Custom resource provider framework lambda function configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        SsmSessionManagerSettingsSessionManagerEC2Role83702F06: {
          Properties: {
            AssumeRolePolicyDocument: {
              Statement: [
                {
                  Action: 'sts:AssumeRole',
                  Effect: 'Allow',
                  Principal: {
                    Service: {
                      'Fn::Join': [
                        '',
                        [
                          'ec2.',
                          {
                            Ref: 'AWS::URLSuffix',
                          },
                        ],
                      ],
                    },
                  },
                },
              ],
              Version: '2012-10-17',
            },
            Description: 'IAM Role for an EC2 configured for Session Manager Logging',
            ManagedPolicyArns: [
              {
                Ref: 'SsmSessionManagerSettingsSessionManagerEC2Policy8ED295CA',
              },
            ],
            RoleName: {
              'Fn::Join': [
                '',
                [
                  'SessionManagerEC2Role-',
                  {
                    Ref: 'AWS::Region',
                  },
                ],
              ],
            },
          },
          Type: 'AWS::IAM::Role',
        },
      },
    });
  });

  /**
   * Custom resource provider framework lambda function configuration test
   */
  test(`${testNamePrefix} Custom resource provider framework lambda function configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        SsmSessionManagerSettingsSessionManagerLogsCmkAlias739EF1F2: {
          Properties: {
            AliasName: 'alias/accelerator/session-manager-logging/cloud-watch-logs',
            TargetKeyId: {
              'Fn::GetAtt': ['SsmSessionManagerSettingsSessionManagerLogsCmk796F4752', 'Arn'],
            },
          },
          Type: 'AWS::KMS::Alias',
        },
      },
    });
  });

  /**
   * Custom resource provider framework lambda function configuration test
   */
  test(`${testNamePrefix} Custom resource provider framework lambda function configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        SsmSessionManagerSettingsSessionManagerLogsCmk796F4752: {
          DeletionPolicy: 'Retain',
          Properties: {
            Description: 'AWS Accelerator Cloud Watch Logs CMK for Session Manager Logs',
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
                  Sid: 'Enable IAM User Permissions',
                },
                {
                  Action: ['kms:Encrypt*', 'kms:Decrypt*', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:Describe*'],
                  Condition: {
                    ArnLike: {
                      'kms:EncryptionContext:aws:logs:arn': {
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
                            ':*',
                          ],
                        ],
                      },
                    },
                  },
                  Effect: 'Allow',
                  Principal: {
                    Service: {
                      'Fn::Join': [
                        '',
                        [
                          'logs.',
                          {
                            Ref: 'AWS::Region',
                          },
                          '.amazonaws.com',
                        ],
                      ],
                    },
                  },
                  Resource: '*',
                  Sid: 'Allow Cloud Watch Logs access',
                },
              ],
              Version: '2012-10-17',
            },
          },
          Type: 'AWS::KMS::Key',
          UpdateReplacePolicy: 'Retain',
        },
      },
    });
  });

  /**
   * Custom resource provider framework lambda function configuration test
   */
  test(`${testNamePrefix} Custom resource provider framework lambda function configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        SsmSessionManagerSettingsSessionManagerSessionCmkAliasC8D340F2: {
          Properties: {
            AliasName: 'alias/accelerator/session-manager-logging/session',
            TargetKeyId: {
              'Fn::GetAtt': ['SsmSessionManagerSettingsSessionManagerSessionCmk0B840C26', 'Arn'],
            },
          },
          Type: 'AWS::KMS::Alias',
        },
      },
    });
  });

  /**
   * Custom resource provider framework lambda function configuration test
   */
  test(`${testNamePrefix} Custom resource provider framework lambda function configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        SsmSessionManagerSettingsSessionManagerSessionCmk0B840C26: {
          DeletionPolicy: 'Retain',
          Properties: {
            Description: 'AWS Accelerator Cloud Watch Logs CMK for Session Manager Logs',
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
                  Sid: 'Enable IAM User Permissions',
                },
                {
                  Action: ['kms:Encrypt*', 'kms:Decrypt*', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:Describe*'],
                  Condition: {
                    ArnLike: {
                      'kms:EncryptionContext:aws:logs:arn': {
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
                            ':*',
                          ],
                        ],
                      },
                    },
                  },
                  Effect: 'Allow',
                  Principal: {
                    Service: {
                      'Fn::Join': [
                        '',
                        [
                          'logs.',
                          {
                            Ref: 'AWS::Region',
                          },
                          '.amazonaws.com',
                        ],
                      ],
                    },
                  },
                  Resource: '*',
                  Sid: 'Allow Cloud Watch Logs access',
                },
              ],
              Version: '2012-10-17',
            },
          },
          Type: 'AWS::KMS::Key',
          UpdateReplacePolicy: 'Retain',
        },
      },
    });
  });

  /**
   * Custom resource provider framework lambda function configuration test
   */
  test(`${testNamePrefix} Custom resource provider framework lambda function configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        SsmSessionManagerSettingsSessionManagerUserKMSPolicyFB96BB42: {
          Properties: {
            Description: '',
            ManagedPolicyName: {
              'Fn::Join': [
                '',
                [
                  'SessionManagerUserKMSPolicy-',
                  {
                    Ref: 'AWS::Region',
                  },
                ],
              ],
            },
            Path: '/',
            PolicyDocument: {
              Statement: [
                {
                  Action: ['kms:Decrypt', 'kms:GenerateDataKey'],
                  Effect: 'Allow',
                  Resource: {
                    'Fn::GetAtt': ['SsmSessionManagerSettingsSessionManagerSessionCmk0B840C26', 'Arn'],
                  },
                },
              ],
              Version: '2012-10-17',
            },
          },
          Type: 'AWS::IAM::ManagedPolicy',
        },
      },
    });
  });

  /**
   * Custom resource provider framework lambda function configuration test
   */
  test(`${testNamePrefix} Custom resource provider framework lambda function configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        SsmSessionManagerSettingssessionManagerLogGroupEA6AC1BB: {
          DeletionPolicy: 'Retain',
          Properties: {
            KmsKeyId: {
              'Fn::GetAtt': ['SsmSessionManagerSettingsSessionManagerLogsCmk796F4752', 'Arn'],
            },
            LogGroupName: 'aws-accelerator-session-manager-logs',
            RetentionInDays: 3653,
          },
          Type: 'AWS::Logs::LogGroup',
          UpdateReplacePolicy: 'Retain',
        },
      },
    });
  });
});
