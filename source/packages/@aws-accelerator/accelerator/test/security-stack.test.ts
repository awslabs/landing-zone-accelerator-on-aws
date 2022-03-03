import * as cdk from 'aws-cdk-lib';
import { SecurityStack } from '../lib/stacks/security-stack';
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

const testNamePrefix = 'Construct(SecurityStack): ';

/**
 * SecurityStack
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

const stack = new SecurityStack(
  app,
  `${AcceleratorStackNames[AcceleratorStage.SECURITY]}-${env.account}-${env.region}`,
  props,
);

/**
 * SecurityStack construct test
 */
describe('SecurityStack', () => {
  /**
   * Number of ConfigRule resource test
   */
  test(`${testNamePrefix} ConfigRule resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Config::ConfigRule', 3);
  });

  /**
   * Number of MetricFilter resource test
   */
  test(`${testNamePrefix} MetricFilter resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Logs::MetricFilter', 3);
  });

  /**
   * Number of MaciePutClassificationExportConfiguration custom resource test
   */
  test(`${testNamePrefix} MaciePutClassificationExportConfiguration custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::MaciePutClassificationExportConfiguration', 1);
  });

  /**
   * Number of S3 bucket resource test
   */
  test(`${testNamePrefix} S3 bucket resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::S3::Bucket', 2);
  });

  /**
   * Number of KMS alias resource test
   */
  test(`${testNamePrefix} KMS alias resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::KMS::Alias', 2);
  });

  /**
   * Number of KMS Key resource test
   */
  test(`${testNamePrefix} KMS Key resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::KMS::Key', 2);
  });

  /**
   * Number of BucketPolicy resource test
   */
  test(`${testNamePrefix} BucketPolicy resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::S3::BucketPolicy', 2);
  });

  /**
   * Number of CloudWatch Alarm resource test
   */
  test(`${testNamePrefix} CloudWatch Alarm resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::CloudWatch::Alarm', 3);
  });

  /**
   * Number of Logs MetricFilter resource test
   */
  test(`${testNamePrefix} Logs MetricFilter resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Logs::MetricFilter', 3);
  });

  /**
   * Number of Lambda Function resource test
   */
  test(`${testNamePrefix} Lambda Function resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Lambda::Function', 4);
  });

  /**
   * Number of IAM Role resource test
   */
  test(`${testNamePrefix} IAM Role resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::IAM::Role', 5);
  });

  /**
   * Number of GuardDutyCreatePublishingDestinationCommand custom resource test
   */
  test(`${testNamePrefix} GuardDutyCreatePublishingDestinationCommand custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::GuardDutyCreatePublishingDestinationCommand', 1);
  });

  /**
   * Number of IamUpdateAccountPasswordPolicy custom resource test
   */
  test(`${testNamePrefix} IamUpdateAccountPasswordPolicy custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::IamUpdateAccountPasswordPolicy', 1);
  });

  /**
   * Number of SecurityHubBatchEnableStandards custom resource test
   */
  test(`${testNamePrefix} SecurityHubBatchEnableStandards custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::SecurityHubBatchEnableStandards', 1);
  });

  /**
   * Number of SecurityHubBatchEnableStandards custom resource test
   */
  test(`${testNamePrefix} SecurityHubBatchEnableStandards custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::SecurityHubBatchEnableStandards', 1);
  });

  /**
   * AcceleratorCloudtrailEnabled resource configuration test
   */
  test(`${testNamePrefix} AcceleratorCloudtrailEnabled resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        AcceleratorCloudtrailEnabled08B9BEEA: {
          Type: 'AWS::Config::ConfigRule',
          Properties: {
            ConfigRuleName: 'accelerator-cloudtrail-enabled',
            Scope: {
              ComplianceResourceTypes: [],
            },
            Source: {
              Owner: 'AWS',
              SourceIdentifier: 'CLOUD_TRAIL_ENABLED',
            },
          },
        },
      },
    });
  });

  /**
   * AcceleratorIamUserGroupMembershipCheck resource configuration test
   */
  test(`${testNamePrefix} AcceleratorIamUserGroupMembershipCheck resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        AcceleratorIamUserGroupMembershipCheck5D2DBD69: {
          Type: 'AWS::Config::ConfigRule',
          Properties: {
            ConfigRuleName: 'accelerator-iam-user-group-membership-check',
            Scope: {
              ComplianceResourceTypes: ['AWS::IAM::User'],
            },
            Source: {
              Owner: 'AWS',
              SourceIdentifier: 'IAM_USER_GROUP_MEMBERSHIP_CHECK',
            },
          },
        },
      },
    });
  });

  /**
   * AcceleratorSecurityhubEnabled resource configuration test
   */
  test(`${testNamePrefix} AcceleratorSecurityhubEnabled resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        AcceleratorSecurityhubEnabled25B1DE1B: {
          Type: 'AWS::Config::ConfigRule',
          Properties: {
            ConfigRuleName: 'accelerator-securityhub-enabled',
            Scope: {
              ComplianceResourceTypes: [],
            },
            Source: {
              Owner: 'AWS',
              SourceIdentifier: 'SECURITYHUB_ENABLED',
            },
          },
        },
      },
    });
  });

  /**
   * AwsMacieUpdateExportConfigClassification resource configuration test
   */
  test(`${testNamePrefix} AwsMacieUpdateExportConfigClassification resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        AwsMacieUpdateExportConfigClassification832781E3: {
          Type: 'Custom::MaciePutClassificationExportConfiguration',
          UpdateReplacePolicy: 'Delete',
          DeletionPolicy: 'Delete',
          DependsOn: ['AwsMacieUpdateExportConfigClassificationAwsMacieExportConfigBucketPolicy4176C56D'],
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': [
                'CustomMaciePutClassificationExportConfigurationCustomResourceProviderHandlerC53E2FCC',
                'Arn',
              ],
            },
            bucketName: {
              Ref: 'AwsMacieUpdateExportConfigClassificationAwsMacieExportConfigBucket2B688972',
            },
            keyPrefix: 'aws-macie-export-config',
            kmsKeyArn: {
              'Fn::GetAtt': ['AwsMacieUpdateExportConfigClassificationAwsMacieExportConfigBucketCmkDC2B180B', 'Arn'],
            },
            region: 'us-east-1',
          },
        },
      },
    });
  });

  /**
   * AwsMacieUpdateExportConfigClassificationAwsMacieExportConfigBucket resource configuration test
   */
  test(`${testNamePrefix} AwsMacieUpdateExportConfigClassificationAwsMacieExportConfigBucket resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        AwsMacieUpdateExportConfigClassificationAwsMacieExportConfigBucket2B688972: {
          Type: 'AWS::S3::Bucket',
          UpdateReplacePolicy: 'Retain',
          DeletionPolicy: 'Retain',
          Metadata: {
            cfn_nag: {
              rules_to_suppress: [
                {
                  id: 'W35',
                  reason:
                    'S3 Bucket access logging is not enabled for the accelerator security macie export config bucket.',
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
                      'Fn::GetAtt': [
                        'AwsMacieUpdateExportConfigClassificationAwsMacieExportConfigBucketCmkDC2B180B',
                        'Arn',
                      ],
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
                  'aws-accelerator-security-macie-',
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
   * AwsMacieUpdateExportConfigClassificationAwsMacieExportConfigBucketCmkAlias resource configuration test
   */
  test(`${testNamePrefix} AwsMacieUpdateExportConfigClassificationAwsMacieExportConfigBucketCmkAlias resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        AwsMacieUpdateExportConfigClassificationAwsMacieExportConfigBucketCmkAliasF1819E69: {
          Type: 'AWS::KMS::Alias',
          Properties: {
            AliasName: 'alias/accelerator/security/macie/s3',
            TargetKeyId: {
              'Fn::GetAtt': ['AwsMacieUpdateExportConfigClassificationAwsMacieExportConfigBucketCmkDC2B180B', 'Arn'],
            },
          },
        },
      },
    });
  });

  /**
   * AwsMacieUpdateExportConfigClassificationAwsMacieExportConfigBucketCmk resource configuration test
   */
  test(`${testNamePrefix} AwsMacieUpdateExportConfigClassificationAwsMacieExportConfigBucketCmk resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        AwsMacieUpdateExportConfigClassificationAwsMacieExportConfigBucketCmkDC2B180B: {
          Type: 'AWS::KMS::Key',
          UpdateReplacePolicy: 'Retain',
          DeletionPolicy: 'Retain',
          Properties: {
            Description: 'AWS Accelerator MacieSession Export Config Bucket CMK',
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
                          ':iam::333333333333:root',
                        ],
                      ],
                    },
                  },
                  Resource: '*',
                },
                {
                  Action: ['kms:Decrypt', 'kms:DescribeKey', 'kms:Encrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*'],
                  Effect: 'Allow',
                  Principal: {
                    AWS: {
                      'Fn::GetAtt': [
                        'CustomMaciePutClassificationExportConfigurationCustomResourceProviderRoleEB42D531',
                        'Arn',
                      ],
                    },
                  },
                  Resource: '*',
                },
                {
                  Action: ['kms:Decrypt', 'kms:DescribeKey', 'kms:Encrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*'],
                  Effect: 'Allow',
                  Principal: {
                    Service: 'macie.amazonaws.com',
                  },
                  Resource: '*',
                },
              ],
              Version: '2012-10-17',
            },
            Tags: [
              {
                Key: 'aws-cdk:auto-macie-access-bucket',
                Value: 'true',
              },
            ],
          },
        },
      },
    });
  });

  /**
   * AwsMacieUpdateExportConfigClassificationAwsMacieExportConfigBucketPolicy resource configuration test
   */
  test(`${testNamePrefix} AwsMacieUpdateExportConfigClassificationAwsMacieExportConfigBucketPolicy resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        AwsMacieUpdateExportConfigClassificationAwsMacieExportConfigBucketPolicy4176C56D: {
          Type: 'AWS::S3::BucketPolicy',
          Properties: {
            Bucket: {
              Ref: 'AwsMacieUpdateExportConfigClassificationAwsMacieExportConfigBucket2B688972',
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
                      'Fn::GetAtt': [
                        'AwsMacieUpdateExportConfigClassificationAwsMacieExportConfigBucket2B688972',
                        'Arn',
                      ],
                    },
                    {
                      'Fn::Join': [
                        '',
                        [
                          {
                            'Fn::GetAtt': [
                              'AwsMacieUpdateExportConfigClassificationAwsMacieExportConfigBucket2B688972',
                              'Arn',
                            ],
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
                    AWS: {
                      'Fn::GetAtt': [
                        'CustomMaciePutClassificationExportConfigurationCustomResourceProviderRoleEB42D531',
                        'Arn',
                      ],
                    },
                  },
                  Resource: [
                    {
                      'Fn::GetAtt': [
                        'AwsMacieUpdateExportConfigClassificationAwsMacieExportConfigBucket2B688972',
                        'Arn',
                      ],
                    },
                    {
                      'Fn::Join': [
                        '',
                        [
                          {
                            'Fn::GetAtt': [
                              'AwsMacieUpdateExportConfigClassificationAwsMacieExportConfigBucket2B688972',
                              'Arn',
                            ],
                          },
                          '/*',
                        ],
                      ],
                    },
                  ],
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
                      'Fn::GetAtt': [
                        'AwsMacieUpdateExportConfigClassificationAwsMacieExportConfigBucket2B688972',
                        'Arn',
                      ],
                    },
                    {
                      'Fn::Join': [
                        '',
                        [
                          {
                            'Fn::GetAtt': [
                              'AwsMacieUpdateExportConfigClassificationAwsMacieExportConfigBucket2B688972',
                              'Arn',
                            ],
                          },
                          '/*',
                        ],
                      ],
                    },
                  ],
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
   *  Cis11RootAccountUsage resource configuration test
   */
  test(`${testNamePrefix} Cis11RootAccountUsage resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        Cis11RootAccountUsage27B8A444: {
          Type: 'AWS::CloudWatch::Alarm',
          Properties: {
            AlarmActions: [
              {
                'Fn::Join': [
                  '',
                  [
                    'arn:',
                    {
                      Ref: 'AWS::Partition',
                    },
                    ':sns:us-east-1:222222222222:aws-accelerator-LowNotifications',
                  ],
                ],
              },
            ],
            AlarmDescription: 'Alarm for usage of "root" account',
            AlarmName: 'CIS-1.1-RootAccountUsage',
            ComparisonOperator: 'GreaterThanOrEqualToThreshold',
            EvaluationPeriods: 1,
            MetricName: 'RootAccountUsage',
            Namespace: 'LogMetrics',
            Period: 300,
            Statistic: 'Sum',
            Threshold: 1,
            TreatMissingData: 'notBreaching',
          },
        },
      },
    });
  });

  /**
   *  Cis31UnauthorizedApiCalls resource configuration test
   */
  test(`${testNamePrefix} Cis31UnauthorizedApiCalls resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        Cis31UnauthorizedApiCallsB850B3C7: {
          Type: 'AWS::CloudWatch::Alarm',
          Properties: {
            AlarmActions: [
              {
                'Fn::Join': [
                  '',
                  [
                    'arn:',
                    {
                      Ref: 'AWS::Partition',
                    },
                    ':sns:us-east-1:222222222222:aws-accelerator-LowNotifications',
                  ],
                ],
              },
            ],
            AlarmDescription: 'Alarm for unauthorized API calls',
            AlarmName: 'CIS-3.1-UnauthorizedAPICalls',
            ComparisonOperator: 'GreaterThanOrEqualToThreshold',
            EvaluationPeriods: 1,
            MetricName: 'UnauthorizedAPICalls',
            Namespace: 'LogMetrics',
            Period: 300,
            Statistic: 'Sum',
            Threshold: 1,
            TreatMissingData: 'notBreaching',
          },
        },
      },
    });
  });

  /**
   *  Cis32ConsoleSigninWithoutMfa resource configuration test
   */
  test(`${testNamePrefix} Cis32ConsoleSigninWithoutMfa resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        Cis32ConsoleSigninWithoutMfa8401FEDF: {
          Type: 'AWS::CloudWatch::Alarm',
          Properties: {
            AlarmActions: [
              {
                'Fn::Join': [
                  '',
                  [
                    'arn:',
                    {
                      Ref: 'AWS::Partition',
                    },
                    ':sns:us-east-1:222222222222:aws-accelerator-LowNotifications',
                  ],
                ],
              },
            ],
            AlarmDescription: 'Alarm for AWS Management Console sign-in without MFA',
            AlarmName: 'CIS-3.2-ConsoleSigninWithoutMFA',
            ComparisonOperator: 'GreaterThanOrEqualToThreshold',
            EvaluationPeriods: 1,
            MetricName: 'ConsoleSigninWithoutMFA',
            Namespace: 'LogMetrics',
            Period: 300,
            Statistic: 'Sum',
            Threshold: 1,
            TreatMissingData: 'notBreaching',
          },
        },
      },
    });
  });

  /**
   *  ConsoleSigninWithoutMfaMetricFilter resource configuration test
   */
  test(`${testNamePrefix} ConsoleSigninWithoutMfaMetricFilter resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        ConsoleSigninWithoutMfaMetricFilter85B015F7: {
          Type: 'AWS::Logs::MetricFilter',
          Properties: {
            FilterPattern: '{($.eventName="ConsoleLogin") && ($.additionalEventData.MFAUsed !="Yes")}',
            LogGroupName: 'aws-controltower/CloudTrailLogs',
            MetricTransformations: [
              {
                MetricName: 'ConsoleSigninWithoutMFA',
                MetricNamespace: 'LogMetrics',
                MetricValue: '1',
              },
            ],
          },
        },
      },
    });
  });

  /**
   *  CustomGuardDutyCreatePublishingDestinationCommandCustomResourceProviderHandler resource configuration test
   */
  test(`${testNamePrefix} CustomGuardDutyCreatePublishingDestinationCommandCustomResourceProviderHandler resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomGuardDutyCreatePublishingDestinationCommandCustomResourceProviderHandlerB3AE4CE8: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomGuardDutyCreatePublishingDestinationCommandCustomResourceProviderRoleD01DD26B'],
          Properties: {
            Code: {
              S3Bucket: 'cdk-hnb659fds-assets-333333333333-us-east-1',
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': [
                'CustomGuardDutyCreatePublishingDestinationCommandCustomResourceProviderRoleD01DD26B',
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
   *  CustomGuardDutyCreatePublishingDestinationCommandCustomResourceProviderRole resource configuration test
   */
  test(`${testNamePrefix} CustomGuardDutyCreatePublishingDestinationCommandCustomResourceProviderRole resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomGuardDutyCreatePublishingDestinationCommandCustomResourceProviderRoleD01DD26B: {
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
                        'guardDuty:CreateDetector',
                        'guardDuty:CreatePublishingDestination',
                        'guardDuty:DeletePublishingDestination',
                        'guardDuty:ListDetectors',
                        'guardDuty:ListPublishingDestinations',
                        'iam:CreateServiceLinkedRole',
                      ],
                      Effect: 'Allow',
                      Resource: '*',
                      Sid: 'GuardDutyCreatePublishingDestinationCommandTaskGuardDutyActions',
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
   *  CustomIamUpdateAccountPasswordPolicyCustomResourceProviderHandler resource configuration test
   */
  test(`${testNamePrefix} CustomIamUpdateAccountPasswordPolicyCustomResourceProviderHandler resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomIamUpdateAccountPasswordPolicyCustomResourceProviderHandler63EDC7F4: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomIamUpdateAccountPasswordPolicyCustomResourceProviderRoleC4ECAFE0'],
          Properties: {
            Code: {
              S3Bucket: 'cdk-hnb659fds-assets-333333333333-us-east-1',
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': ['CustomIamUpdateAccountPasswordPolicyCustomResourceProviderRoleC4ECAFE0', 'Arn'],
            },
            Runtime: 'nodejs14.x',
            Timeout: 900,
          },
        },
      },
    });
  });

  /**
   *  CustomIamUpdateAccountPasswordPolicyCustomResourceProviderRole resource configuration test
   */
  test(`${testNamePrefix} CustomIamUpdateAccountPasswordPolicyCustomResourceProviderRole resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomIamUpdateAccountPasswordPolicyCustomResourceProviderRoleC4ECAFE0: {
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
                      Action: ['iam:UpdateAccountPasswordPolicy'],
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
   *  CustomMaciePutClassificationExportConfigurationCustomResourceProviderHandler resource configuration test
   */
  test(`${testNamePrefix} CustomMaciePutClassificationExportConfigurationCustomResourceProviderHandler resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomMaciePutClassificationExportConfigurationCustomResourceProviderHandlerC53E2FCC: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomMaciePutClassificationExportConfigurationCustomResourceProviderRoleEB42D531'],
          Properties: {
            Code: {
              S3Bucket: 'cdk-hnb659fds-assets-333333333333-us-east-1',
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': [
                'CustomMaciePutClassificationExportConfigurationCustomResourceProviderRoleEB42D531',
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
   *  CustomMaciePutClassificationExportConfigurationCustomResourceProviderRole resource configuration test
   */
  test(`${testNamePrefix} CustomMaciePutClassificationExportConfigurationCustomResourceProviderRole resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomMaciePutClassificationExportConfigurationCustomResourceProviderRoleEB42D531: {
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
                        'macie2:EnableMacie',
                        'macie2:GetClassificationExportConfiguration',
                        'macie2:GetMacieSession',
                        'macie2:PutClassificationExportConfiguration',
                      ],
                      Effect: 'Allow',
                      Resource: '*',
                      Sid: 'MaciePutClassificationExportConfigurationTaskMacieActions',
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
   *  CustomSecurityHubBatchEnableStandardsCustomResourceProviderHandler resource configuration test
   */
  test(`${testNamePrefix} CustomSecurityHubBatchEnableStandardsCustomResourceProviderHandler resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomSecurityHubBatchEnableStandardsCustomResourceProviderHandler4BE622C1: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomSecurityHubBatchEnableStandardsCustomResourceProviderRole1ABC8ED2'],
          Properties: {
            Code: {
              S3Bucket: 'cdk-hnb659fds-assets-333333333333-us-east-1',
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': ['CustomSecurityHubBatchEnableStandardsCustomResourceProviderRole1ABC8ED2', 'Arn'],
            },
            Runtime: 'nodejs14.x',
            Timeout: 900,
          },
        },
      },
    });
  });

  /**
   *  CustomSecurityHubBatchEnableStandardsCustomResourceProviderRole resource configuration test
   */
  test(`${testNamePrefix} CustomSecurityHubBatchEnableStandardsCustomResourceProviderRole resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomSecurityHubBatchEnableStandardsCustomResourceProviderRole1ABC8ED2: {
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
                        'securityhub:BatchDisableStandards',
                        'securityhub:BatchEnableStandards',
                        'securityhub:DescribeStandards',
                        'securityhub:DescribeStandardsControls',
                        'securityhub:EnableSecurityHub',
                        'securityhub:GetEnabledStandards',
                        'securityhub:UpdateStandardsControl',
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
   *  GuardDutyPublishingDestination resource configuration test
   */
  test(`${testNamePrefix} GuardDutyPublishingDestination resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        GuardDutyPublishingDestination52AE4412: {
          Type: 'Custom::GuardDutyCreatePublishingDestinationCommand',
          UpdateReplacePolicy: 'Delete',
          DeletionPolicy: 'Delete',
          DependsOn: ['GuardDutyPublishingDestinationGuardDutyPublishingDestinationBucketPolicy7F1BD76B'],
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': [
                'CustomGuardDutyCreatePublishingDestinationCommandCustomResourceProviderHandlerB3AE4CE8',
                'Arn',
              ],
            },
            bucketArn: {
              'Fn::GetAtt': ['GuardDutyPublishingDestinationGuardDutyPublishingDestinationBucketEE284596', 'Arn'],
            },
            exportDestinationType: 'S3',
            kmsKeyArn: {
              'Fn::GetAtt': ['GuardDutyPublishingDestinationGuardDutyPublishingDestinationBucketCmk8EE18C04', 'Arn'],
            },
            region: 'us-east-1',
          },
        },
      },
    });
  });

  /**
   *  GuardDutyPublishingDestinationGuardDutyPublishingDestinationBucketCmk resource configuration test
   */
  test(`${testNamePrefix} GuardDutyPublishingDestinationGuardDutyPublishingDestinationBucketCmk resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        GuardDutyPublishingDestinationGuardDutyPublishingDestinationBucketCmk8EE18C04: {
          Type: 'AWS::KMS::Key',
          UpdateReplacePolicy: 'Retain',
          DeletionPolicy: 'Retain',
          Properties: {
            Description: 'AWS Accelerator GuardDuty Publishing Destination Bucket CMK',
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
                          ':iam::333333333333:root',
                        ],
                      ],
                    },
                  },
                  Resource: '*',
                },
                {
                  Action: ['kms:Decrypt', 'kms:DescribeKey', 'kms:Encrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*'],
                  Effect: 'Allow',
                  Principal: {
                    AWS: {
                      'Fn::GetAtt': [
                        'CustomGuardDutyCreatePublishingDestinationCommandCustomResourceProviderRoleD01DD26B',
                        'Arn',
                      ],
                    },
                  },
                  Resource: '*',
                },
                {
                  Action: ['kms:Decrypt', 'kms:DescribeKey', 'kms:Encrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*'],
                  Effect: 'Allow',
                  Principal: {
                    Service: 'guardduty.amazonaws.com',
                  },
                  Resource: '*',
                },
              ],
              Version: '2012-10-17',
            },
            Tags: [
              {
                Key: 'aws-cdk:auto-macie-access-bucket',
                Value: 'true',
              },
            ],
          },
        },
      },
    });
  });

  /**
   *  GuardDutyPublishingDestinationGuardDutyPublishingDestinationBucketCmkAlias resource configuration test
   */
  test(`${testNamePrefix} GuardDutyPublishingDestinationGuardDutyPublishingDestinationBucketCmkAlias resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        GuardDutyPublishingDestinationGuardDutyPublishingDestinationBucketCmkAlias4C7CABC6: {
          Type: 'AWS::KMS::Alias',
          Properties: {
            AliasName: 'alias/accelerator/security/guardduty/s3',
            TargetKeyId: {
              'Fn::GetAtt': ['GuardDutyPublishingDestinationGuardDutyPublishingDestinationBucketCmk8EE18C04', 'Arn'],
            },
          },
        },
      },
    });
  });

  /**
   *  GuardDutyPublishingDestinationGuardDutyPublishingDestinationBucket resource configuration test
   */
  test(`${testNamePrefix} GuardDutyPublishingDestinationGuardDutyPublishingDestinationBucket resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        GuardDutyPublishingDestinationGuardDutyPublishingDestinationBucketEE284596: {
          Type: 'AWS::S3::Bucket',
          UpdateReplacePolicy: 'Retain',
          DeletionPolicy: 'Retain',
          Metadata: {
            cfn_nag: {
              rules_to_suppress: [
                {
                  id: 'W35',
                  reason:
                    'S3 Bucket access logging is not enabled for the accelerator security guardduty publishing destination bucket.',
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
                      'Fn::GetAtt': [
                        'GuardDutyPublishingDestinationGuardDutyPublishingDestinationBucketCmk8EE18C04',
                        'Arn',
                      ],
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
                  'aws-accelerator-security-guardduty-',
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
   *  GuardDutyPublishingDestinationGuardDutyPublishingDestinationBucketPolicy resource configuration test
   */
  test(`${testNamePrefix} GuardDutyPublishingDestinationGuardDutyPublishingDestinationBucketPolicy resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        GuardDutyPublishingDestinationGuardDutyPublishingDestinationBucketPolicy7F1BD76B: {
          Type: 'AWS::S3::BucketPolicy',
          Properties: {
            Bucket: {
              Ref: 'GuardDutyPublishingDestinationGuardDutyPublishingDestinationBucketEE284596',
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
                      'Fn::GetAtt': [
                        'GuardDutyPublishingDestinationGuardDutyPublishingDestinationBucketEE284596',
                        'Arn',
                      ],
                    },
                    {
                      'Fn::Join': [
                        '',
                        [
                          {
                            'Fn::GetAtt': [
                              'GuardDutyPublishingDestinationGuardDutyPublishingDestinationBucketEE284596',
                              'Arn',
                            ],
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
                    AWS: {
                      'Fn::GetAtt': [
                        'CustomGuardDutyCreatePublishingDestinationCommandCustomResourceProviderRoleD01DD26B',
                        'Arn',
                      ],
                    },
                  },
                  Resource: [
                    {
                      'Fn::GetAtt': [
                        'GuardDutyPublishingDestinationGuardDutyPublishingDestinationBucketEE284596',
                        'Arn',
                      ],
                    },
                    {
                      'Fn::Join': [
                        '',
                        [
                          {
                            'Fn::GetAtt': [
                              'GuardDutyPublishingDestinationGuardDutyPublishingDestinationBucketEE284596',
                              'Arn',
                            ],
                          },
                          '/*',
                        ],
                      ],
                    },
                  ],
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
                      'Fn::GetAtt': [
                        'GuardDutyPublishingDestinationGuardDutyPublishingDestinationBucketEE284596',
                        'Arn',
                      ],
                    },
                    {
                      'Fn::Join': [
                        '',
                        [
                          {
                            'Fn::GetAtt': [
                              'GuardDutyPublishingDestinationGuardDutyPublishingDestinationBucketEE284596',
                              'Arn',
                            ],
                          },
                          '/*',
                        ],
                      ],
                    },
                  ],
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
   *  IamPasswordPolicy resource configuration test
   */
  test(`${testNamePrefix} IamPasswordPolicy resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        IamPasswordPolicy7117FCDB: {
          Type: 'Custom::IamUpdateAccountPasswordPolicy',
          UpdateReplacePolicy: 'Delete',
          DeletionPolicy: 'Delete',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomIamUpdateAccountPasswordPolicyCustomResourceProviderHandler63EDC7F4', 'Arn'],
            },
            allowUsersToChangePassword: true,
            hardExpiry: false,
            maxPasswordAge: 90,
            minimumPasswordLength: 14,
            passwordReusePrevention: 24,
            requireLowercaseCharacters: true,
            requireNumbers: true,
            requireSymbols: true,
            requireUppercaseCharacters: true,
          },
        },
      },
    });
  });

  /**
   *  RootAccountMetricFilter resource configuration test
   */
  test(`${testNamePrefix} RootAccountMetricFilter resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        RootAccountMetricFilter2CA28475: {
          Type: 'AWS::Logs::MetricFilter',
          Properties: {
            FilterPattern:
              '{$.userIdentity.type="Root" && $.userIdentity.invokedBy NOT EXISTS && $.eventType !="AwsServiceEvent"}',
            LogGroupName: 'aws-controltower/CloudTrailLogs',
            MetricTransformations: [
              {
                MetricName: 'RootAccount',
                MetricNamespace: 'LogMetrics',
                MetricValue: '1',
              },
            ],
          },
        },
      },
    });
  });

  /**
   *  SecurityHubStandards resource configuration test
   */
  test(`${testNamePrefix} SecurityHubStandards resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        SecurityHubStandards294083BB: {
          Type: 'Custom::SecurityHubBatchEnableStandards',
          UpdateReplacePolicy: 'Delete',
          DeletionPolicy: 'Delete',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomSecurityHubBatchEnableStandardsCustomResourceProviderHandler4BE622C1', 'Arn'],
            },
            region: 'us-east-1',
            standards: [
              {
                controlsToDisable: ['IAM.1', 'EC2.10', 'Lambda.4'],
                enable: true,
                name: 'AWS Foundational Security Best Practices v1.0.0',
              },
              {
                controlsToDisable: ['PCI.IAM.3', 'PCI.S3.3', 'PCI.EC2.3', 'PCI.Lambda.2'],
                enable: true,
                name: 'PCI DSS v3.2.1',
              },
              {
                controlsToDisable: ['CIS.1.20', 'CIS.1.22', 'CIS.2.6'],
                enable: true,
                name: 'CIS AWS Foundations Benchmark v1.2.0',
              },
            ],
          },
        },
      },
    });
  });

  /**
   *  UnauthorizedApiCallsMetricFilter resource configuration test
   */
  test(`${testNamePrefix} UnauthorizedApiCallsMetricFilter resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        UnauthorizedApiCallsMetricFilter95DF459D: {
          Type: 'AWS::Logs::MetricFilter',
          Properties: {
            FilterPattern: '{($.errorCode="*UnauthorizedOperation") || ($.errorCode="AccessDenied*")}',
            LogGroupName: 'aws-controltower/CloudTrailLogs',
            MetricTransformations: [
              {
                MetricName: 'UnauthorizedAPICalls',
                MetricNamespace: 'LogMetrics',
                MetricValue: '1',
              },
            ],
          },
        },
      },
    });
  });
});
