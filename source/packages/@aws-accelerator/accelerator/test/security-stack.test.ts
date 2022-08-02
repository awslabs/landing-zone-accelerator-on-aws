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

import {
  AccountsConfig,
  GlobalConfig,
  IamConfig,
  NetworkConfig,
  OrganizationConfig,
  SecurityConfig,
} from '@aws-accelerator/config';
import * as cdk from 'aws-cdk-lib';
import * as path from 'path';
import { AcceleratorStackNames } from '../lib/accelerator';
import { AcceleratorStage } from '../lib/accelerator-stage';
import { AcceleratorStackProps } from '../lib/stacks/accelerator-stack';
import { SecurityStack } from '../lib/stacks/security-stack';

const testNamePrefix = 'Construct(SecurityStack): ';

/**
 * SecurityStack
 */
const app = new cdk.App({
  context: { 'config-dir': path.join(__dirname, 'configs/all-enabled') },
});
const configDirPath = app.node.tryGetContext('config-dir');

const props: AcceleratorStackProps = {
  configDirPath,
  accountsConfig: AccountsConfig.load(configDirPath),
  globalConfig: GlobalConfig.load(configDirPath),
  iamConfig: IamConfig.load(configDirPath),
  networkConfig: NetworkConfig.load(configDirPath),
  organizationConfig: OrganizationConfig.load(configDirPath),
  securityConfig: SecurityConfig.load(configDirPath),
  partition: 'aws',
};

const stacks = new Map<string, SecurityStack>();

for (const region of props.globalConfig.enabledRegions) {
  for (const account of [...props.accountsConfig.mandatoryAccounts, ...props.accountsConfig.workloadAccounts]) {
    const accountId = props.accountsConfig.getAccountId(account.name);

    stacks.set(
      `${account.name}-${region}`,
      new SecurityStack(app, `${AcceleratorStackNames[AcceleratorStage.NETWORK_VPC]}-${accountId}-${region}`, {
        env: {
          account: accountId,
          region,
        },
        ...props,
      }),
    );
  }
}

/**
 * SecurityStack construct test
 */
describe('SecurityStack', () => {
  /**
   * Snapshot test
   */
  //test(`${testNamePrefix} Snapshot Test`, () => {
  // expect(SynthUtils.toCloudFormation(stacks.get(`Management-us-east-1`)!)).toMatchSnapshot();
  //});

  /**
   * Number of MaciePutClassificationExportConfiguration custom resource test
   */
  test(`${testNamePrefix} MaciePutClassificationExportConfiguration custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stacks.get(`Management-us-east-1`)!).resourceCountIs(
      'Custom::MaciePutClassificationExportConfiguration',
      1,
    );
  });

  /**
   * Number of Lambda Function resource test
   */
  test(`${testNamePrefix} Lambda Function resource count test`, () => {
    cdk.assertions.Template.fromStack(stacks.get(`Management-us-east-1`)!).resourceCountIs('AWS::Lambda::Function', 6);
  });

  /**
   * Number of IAM Role resource test
   */
  test(`${testNamePrefix} IAM Role resource count test`, () => {
    cdk.assertions.Template.fromStack(stacks.get(`Management-us-east-1`)!).resourceCountIs('AWS::IAM::Role', 6);
  });

  /**
   * Number of GuardDutyCreatePublishingDestinationCommand custom resource test
   */
  test(`${testNamePrefix} GuardDutyCreatePublishingDestinationCommand custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stacks.get(`Management-us-east-1`)!).resourceCountIs(
      'Custom::GuardDutyCreatePublishingDestinationCommand',
      1,
    );
  });

  /**
   * Number of IamUpdateAccountPasswordPolicy custom resource test
   */
  test(`${testNamePrefix} IamUpdateAccountPasswordPolicy custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stacks.get(`Management-us-east-1`)!).resourceCountIs(
      'Custom::IamUpdateAccountPasswordPolicy',
      1,
    );
  });

  /**
   * Number of SecurityHubBatchEnableStandards custom resource test
   */
  test(`${testNamePrefix} SecurityHubBatchEnableStandards custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stacks.get(`Management-us-east-1`)!).resourceCountIs(
      'Custom::SecurityHubBatchEnableStandards',
      1,
    );
  });

  /**
   * Number of SecurityHubBatchEnableStandards custom resource test
   */
  test(`${testNamePrefix} SecurityHubBatchEnableStandards custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stacks.get(`Management-us-east-1`)!).resourceCountIs(
      'Custom::SecurityHubBatchEnableStandards',
      1,
    );
  });

  /**
   * AwsMacieUpdateExportConfigClassification resource configuration test
   */
  test(`${testNamePrefix} AwsMacieUpdateExportConfigClassification resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stacks.get(`Management-us-east-1`)!).templateMatches({
      Resources: {
        AwsMacieUpdateExportConfigClassification832781E3: {
          Type: 'Custom::MaciePutClassificationExportConfiguration',
          UpdateReplacePolicy: 'Delete',
          DeletionPolicy: 'Delete',
          DependsOn: ['CustomMaciePutClassificationExportConfigurationCustomResourceProviderLogGroup727354F4'],
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
            keyPrefix: '111111111111-aws-macie-export-config',
            kmsKeyArn: {
              Ref: 'AcceleratorKeyLookup0C18DA36',
            },
            region: 'us-east-1',
          },
        },
      },
    });
  });

  /**
   *  CustomGuardDutyCreatePublishingDestinationCommandCustomResourceProviderHandler resource configuration test
   */
  test(`${testNamePrefix} CustomGuardDutyCreatePublishingDestinationCommandCustomResourceProviderHandler resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stacks.get(`Management-us-east-1`)!).templateMatches({
      Resources: {
        CustomGuardDutyCreatePublishingDestinationCommandCustomResourceProviderHandlerB3AE4CE8: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomGuardDutyCreatePublishingDestinationCommandCustomResourceProviderRoleD01DD26B'],
          Properties: {
            Code: {
              S3Bucket: 'cdk-hnb659fds-assets-111111111111-us-east-1',
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
    cdk.assertions.Template.fromStack(stacks.get(`Management-us-east-1`)!).templateMatches({
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
    cdk.assertions.Template.fromStack(stacks.get(`Management-us-east-1`)!).templateMatches({
      Resources: {
        CustomIamUpdateAccountPasswordPolicyCustomResourceProviderHandler63EDC7F4: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomIamUpdateAccountPasswordPolicyCustomResourceProviderRoleC4ECAFE0'],
          Properties: {
            Code: {
              S3Bucket: 'cdk-hnb659fds-assets-111111111111-us-east-1',
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
    cdk.assertions.Template.fromStack(stacks.get(`Management-us-east-1`)!).templateMatches({
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
    cdk.assertions.Template.fromStack(stacks.get(`Management-us-east-1`)!).templateMatches({
      Resources: {
        CustomMaciePutClassificationExportConfigurationCustomResourceProviderHandlerC53E2FCC: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomMaciePutClassificationExportConfigurationCustomResourceProviderRoleEB42D531'],
          Properties: {
            Code: {
              S3Bucket: 'cdk-hnb659fds-assets-111111111111-us-east-1',
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
    cdk.assertions.Template.fromStack(stacks.get(`Management-us-east-1`)!).templateMatches({
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
    cdk.assertions.Template.fromStack(stacks.get(`Management-us-east-1`)!).templateMatches({
      Resources: {
        CustomSecurityHubBatchEnableStandardsCustomResourceProviderHandler4BE622C1: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomSecurityHubBatchEnableStandardsCustomResourceProviderRole1ABC8ED2'],
          Properties: {
            Code: {
              S3Bucket: 'cdk-hnb659fds-assets-111111111111-us-east-1',
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
    cdk.assertions.Template.fromStack(stacks.get(`Management-us-east-1`)!).templateMatches({
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
                    {
                      Action: ['iam:CreateServiceLinkedRole'],
                      Effect: 'Allow',
                      Resource: '*',
                      Condition: {
                        StringLike: {
                          'iam:AWSServiceName': 'securityhub.amazonaws.com',
                        },
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
   *  GuardDutyPublishingDestination resource configuration test
   */
  test(`${testNamePrefix} GuardDutyPublishingDestination resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stacks.get(`Management-us-east-1`)!).templateMatches({
      Resources: {
        GuardDutyPublishingDestination52AE4412: {
          Type: 'Custom::GuardDutyCreatePublishingDestinationCommand',
          UpdateReplacePolicy: 'Delete',
          DeletionPolicy: 'Delete',
          DependsOn: ['CustomGuardDutyCreatePublishingDestinationCommandCustomResourceProviderLogGroup118A06DB'],
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': [
                'CustomGuardDutyCreatePublishingDestinationCommandCustomResourceProviderHandlerB3AE4CE8',
                'Arn',
              ],
            },
            exportDestinationType: 'S3',
            kmsKeyArn: {
              Ref: 'AcceleratorKeyLookup0C18DA36',
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
    cdk.assertions.Template.fromStack(stacks.get(`Management-us-east-1`)!).templateMatches({
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
   *  SecurityHubStandards resource configuration test
   */
  test(`${testNamePrefix} SecurityHubStandards resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stacks.get(`Management-us-east-1`)!).templateMatches({
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
});
