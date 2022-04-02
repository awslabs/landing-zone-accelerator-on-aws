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
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Lambda::Function', 7);
  });

  /**
   * Number of IAM Role resource test
   */
  test(`${testNamePrefix} IAM Role resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::IAM::Role', 8);
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
          DependsOn: ['AwsMacieUpdateExportConfigClassificationLogGroup9E15D505'],
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': [
                'CustomMaciePutClassificationExportConfigurationCustomResourceProviderHandlerC53E2FCC',
                'Arn',
              ],
            },
            bucketName: {
              'Fn::Join': [
                '',
                [
                  'aws-accelerator-org-macie-disc-repo-222222222222-',
                  {
                    Ref: 'AWS::Region',
                  },
                ],
              ],
            },
            keyPrefix: '333333333333-aws-macie-export-config',
            kmsKeyArn: {
              Ref: 'AcceleratorKeyLookupAcceleratorKmsKeyArnD1CF4C3D',
            },
            region: 'us-east-1',
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
          DependsOn: ['GuardDutyPublishingDestinationLogGroup0D6CB347'],
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': [
                'CustomGuardDutyCreatePublishingDestinationCommandCustomResourceProviderHandlerB3AE4CE8',
                'Arn',
              ],
            },
            bucketArn: {
              'Fn::Join': [
                '',
                [
                  'arn:',
                  {
                    Ref: 'AWS::Partition',
                  },
                  ':s3:::aws-accelerator-org-gduty-pub-dest-222222222222-us-east-1',
                ],
              ],
            },
            exportDestinationType: 'S3',
            kmsKeyArn: {
              Ref: 'AcceleratorKeyLookupAcceleratorKmsKeyArnD1CF4C3D',
            },
            region: 'us-east-1',
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
