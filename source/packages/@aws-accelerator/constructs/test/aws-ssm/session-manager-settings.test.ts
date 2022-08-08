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
import { SsmSessionManagerSettings } from '../../index';

//import { SynthUtils } from '@aws-cdk/assert';

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
  cloudWatchEncryptionKey: new cdk.aws_kms.Key(stack, 'CwKey', {}),
  constructLoggingKmsKey: new cdk.aws_kms.Key(stack, 'Key', {}),
  logRetentionInDays: 3653,
});

/**
 * SsmSessionManagerSettings construct test
 */
describe('SsmSessionManagerSettings', () => {
  // test(`${testNamePrefix} Snapshot Test`, () => {
  //   expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
  // });

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
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::KMS::Alias', 1);
  });

  /**
   * Number of Log Groups test
   */
  test(`${testNamePrefix} Log Group count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Logs::LogGroup', 2);
  });

  test(`${testNamePrefix} KMS Alias config test`, () => {
    cdk.assertions.Template.fromStack(stack).hasResourceProperties('AWS::KMS::Alias', {
      AliasName: 'alias/accelerator/sessionmanager-logs/session',
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
              Ref: 'SsmSessionManagerSettingsSessionManagerCloudWatchLogGroup15AB5AE0',
            },
            kmsKeyId: {
              Ref: 'SsmSessionManagerSettingsSessionManagerSessionKey23B7175C',
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

  test(`${testNamePrefix} Custom resource provider framework lambda function configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        SsmSessionManagerSettingsSessionManagerCloudWatchLogGroup15AB5AE0: {
          DeletionPolicy: 'Retain',
          Properties: {
            KmsKeyId: {
              'Fn::GetAtt': ['CwKeyC5A32F94', 'Arn'],
            },
            LogGroupName: 'aws-accelerator-sessionmanager-logs',
            RetentionInDays: 3653,
          },
          Type: 'AWS::Logs::LogGroup',
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
                  Action: [
                    'logs:CreateLogStream',
                    'logs:PutLogEvents',
                    'logs:DescribeLogStreams',
                    'logs:DescribeLogGroups',
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
                        ':logs:',
                        {
                          Ref: 'AWS::Region',
                        },
                        ':',
                        {
                          Ref: 'AWS::AccountId',
                        },
                        ':log-group:aws-accelerator-sessionmanager-logs:*',
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
                    'Fn::GetAtt': ['SsmSessionManagerSettingsSessionManagerSessionKey23B7175C', 'Arn'],
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
        SsmSessionManagerSettingsSessionManagerSessionKeyAlias59E0224E: {
          Properties: {
            AliasName: 'alias/accelerator/sessionmanager-logs/session',
            TargetKeyId: {
              'Fn::GetAtt': ['SsmSessionManagerSettingsSessionManagerSessionKey23B7175C', 'Arn'],
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
        SsmSessionManagerSettingsSessionManagerSessionKey23B7175C: {
          DeletionPolicy: 'Retain',
          Properties: {
            Description: 'AWS Accelerator Session Manager Session Encryption',
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
                    'Fn::GetAtt': ['SsmSessionManagerSettingsSessionManagerSessionKey23B7175C', 'Arn'],
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
});
