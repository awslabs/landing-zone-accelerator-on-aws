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
import { CONFIG_FILE_CONTENT_TYPE, CONFIG_FILE_NAME, TesterStack } from '../lib/tester-stack';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import { pascalCase } from 'pascal-case';

const testNamePrefix = 'Construct(TesterStack): ';

/**
 * External pipeline account TesterStack
 */
const app = new cdk.App({
  context: {
    account: '333333333333',
    region: 'us-east-1',
    'management-cross-account-role': 'AWSControlTowerExecution',
    'config-dir': path.join(__dirname, 'configs'),
    qualifier: 'aws-accelerator',
    'management-account-id': '111111111111',
    'management-account-role-name': 'AcceleratorAccountAccessRole',
  },
});

const account = app.node.tryGetContext('account');
const region = app.node.tryGetContext('region');
const qualifier = app.node.tryGetContext('qualifier') ?? 'aws-accelerator';
const managementCrossAccountRoleName = app.node.tryGetContext('management-cross-account-role-name');
const configDirPath = app.node.tryGetContext('config-dir');

const configFilePath = path.join(configDirPath, CONFIG_FILE_NAME);
const configFileContent = yaml.load(fs.readFileSync(configFilePath, 'utf8')) as CONFIG_FILE_CONTENT_TYPE;

const qualifierInPascalCase = pascalCase(qualifier)
  .split('_')
  .join('-')
  .replace(/AwsAccelerator/gi, 'AWSAccelerator');

const stack = new TesterStack(app, `${qualifierInPascalCase}-TesterStack-${account}-${region}`, {
  synthesizer: new cdk.DefaultStackSynthesizer({
    generateBootstrapVersionRule: false,
  }),
  managementCrossAccountRoleName: managementCrossAccountRoleName,
  configFileContent: configFileContent,
  qualifier: qualifier,
  managementAccountId: app.node.tryGetContext('management-account-id'),
  managementAccountRoleName: app.node.tryGetContext('management-account-role-name'),
});

/**
 * ExternalPipelineAccount-TesterStack construct test
 */
describe('ExternalPipelineAccount-TesterStack', () => {
  /**
   * Number of ConfigRule resource test
   */
  test(`${testNamePrefix} ConfigRule resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Config::ConfigRule', 1);
  });

  /**
   * Number of Lambda function resource test
   */
  test(`${testNamePrefix} Lambda function resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Lambda::Function', 1);
  });

  /**
   * Number of Lambda permission resource test
   */
  test(`${testNamePrefix} Lambda permission resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Lambda::Permission', 1);
  });

  /**
   * Number of Lambda IAM role resource test
   */
  test(`${testNamePrefix} Lambda IAM role resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::IAM::Role', 1);
  });

  /**
   * Number of Lambda IAM policy resource test
   */
  test(`${testNamePrefix} Lambda IAM policy resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::IAM::Policy', 1);
  });

  /**
   * ConfigRule awsacceleratorvalidatemaintransitgatewayCustomRule resource configuration test
   */
  test(`${testNamePrefix} ConfigRule awsacceleratorvalidatemaintransitgatewayCustomRule resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        awsacceleratorvalidatemaintransitgatewayCustomRuleB70A49C4: {
          Type: 'AWS::Config::ConfigRule',
          DependsOn: [
            'awsacceleratorvalidatemaintransitgatewayFunctionCustomRulePermissionbM1jVaicvRO9SDCiAbsQcYrOlESEtMwrrF9ZQQRvd5QD9F10DC6',
            'awsacceleratorvalidatemaintransitgatewayFunction5DC44F8F',
            'awsacceleratorvalidatemaintransitgatewayFunctionServiceRoleDefaultPolicy21AEB3E1',
            'awsacceleratorvalidatemaintransitgatewayFunctionServiceRoleB1766D38',
          ],
          Properties: {
            ConfigRuleName: 'aws-accelerator-validate-main-transit-gateway',
            Description: 'Validate Main Transit Gateway',
            InputParameters: {
              awsConfigRegion: {
                Ref: 'AWS::Region',
              },
              managementAccount: {
                id: '111111111111',
                partition: {
                  Ref: 'AWS::Partition',
                },
                roleName: 'AcceleratorAccountAccessRole',
              },
              test: {
                description: 'Validate Main Transit Gateway',
                expect: 'PASS',
                name: 'validate main transit gateway',
                parameters: {
                  accountId: '333333333333',
                  amazonSideAsn: '65521',
                  autoAcceptSharingAttachments: 'enable',
                  defaultRouteTableAssociation: 'disable',
                  defaultRouteTablePropagation: 'disable',
                  dnsSupport: 'enable',
                  name: 'Main',
                  region: 'us-east-1',
                  routeTableNames: ['core', 'segregated', 'shared', 'standalone'],
                  shareTargetAccountIds: ['111111111111', '222222222222'],
                  vpnEcmpSupport: 'enable',
                },
                suite: 'network',
                testTarget: 'validateTransitGateway',
              },
            },
            MaximumExecutionFrequency: 'Six_Hours',
            Source: {
              Owner: 'CUSTOM_LAMBDA',
              SourceDetails: [
                {
                  EventSource: 'aws.config',
                  MaximumExecutionFrequency: 'Six_Hours',
                  MessageType: 'ScheduledNotification',
                },
              ],
              SourceIdentifier: {
                'Fn::GetAtt': ['awsacceleratorvalidatemaintransitgatewayFunction5DC44F8F', 'Arn'],
              },
            },
          },
        },
      },
    });
  });

  /**
   * Lambda function awsacceleratorvalidatemaintransitgatewayFunction resource configuration test
   */
  test(`${testNamePrefix} Lambda function awsacceleratorvalidatemaintransitgatewayFunction resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        awsacceleratorvalidatemaintransitgatewayFunction5DC44F8F: {
          Type: 'AWS::Lambda::Function',
          DependsOn: [
            'awsacceleratorvalidatemaintransitgatewayFunctionServiceRoleDefaultPolicy21AEB3E1',
            'awsacceleratorvalidatemaintransitgatewayFunctionServiceRoleB1766D38',
          ],
          Properties: {
            Code: {
              S3Bucket: {
                'Fn::Sub': 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
              },
            },
            Description: 'AWS Config custom rule function used for test case "validate main transit gateway"',
            Handler: 'index.handler',
            Role: {
              'Fn::GetAtt': ['awsacceleratorvalidatemaintransitgatewayFunctionServiceRoleB1766D38', 'Arn'],
            },
            Runtime: 'nodejs16.x',
          },
        },
      },
    });
  });

  /**
   * Lambda permission awsacceleratorvalidatemaintransitgatewayFunctionPermission resource configuration test
   */
  test(`${testNamePrefix} Lambda permission awsacceleratorvalidatemaintransitgatewayFunctionPermission resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        awsacceleratorvalidatemaintransitgatewayFunctionCustomRulePermissionbM1jVaicvRO9SDCiAbsQcYrOlESEtMwrrF9ZQQRvd5QD9F10DC6:
          {
            Type: 'AWS::Lambda::Permission',
            Properties: {
              Action: 'lambda:InvokeFunction',
              FunctionName: {
                'Fn::GetAtt': ['awsacceleratorvalidatemaintransitgatewayFunction5DC44F8F', 'Arn'],
              },
              Principal: 'config.amazonaws.com',
              SourceAccount: {
                Ref: 'AWS::AccountId',
              },
            },
          },
      },
    });
  });

  /**
   * IAM role awsacceleratorvalidatemaintransitgatewayFunctionServiceRole resource configuration test
   */
  test(`${testNamePrefix} IAM role awsacceleratorvalidatemaintransitgatewayFunctionServiceRole resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        awsacceleratorvalidatemaintransitgatewayFunctionServiceRoleB1766D38: {
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
                'Fn::Join': [
                  '',
                  [
                    'arn:',
                    {
                      Ref: 'AWS::Partition',
                    },
                    ':iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
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
                    ':iam::aws:policy/ReadOnlyAccess',
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
                    ':iam::aws:policy/service-role/AWSConfigRulesExecutionRole',
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
   * IAM policy awsacceleratorvalidatemaintransitgatewayFunctionServiceRoleDefaultPolicy resource configuration test
   */
  test(`${testNamePrefix} IAM policy awsacceleratorvalidatemaintransitgatewayFunctionServiceRoleDefaultPolicy resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        awsacceleratorvalidatemaintransitgatewayFunctionServiceRoleDefaultPolicy21AEB3E1: {
          Type: 'AWS::IAM::Policy',
          Properties: {
            PolicyDocument: {
              Statement: [
                {
                  Action: 'sts:AssumeRole',
                  Effect: 'Allow',
                  Resource: {
                    'Fn::Join': [
                      '',
                      [
                        'arn:',
                        {
                          Ref: 'AWS::Partition',
                        },
                        ':iam::111111111111:role/AcceleratorAccountAccessRole',
                      ],
                    ],
                  },
                  Sid: 'LambdaSTSActions',
                },
              ],
              Version: '2012-10-17',
            },
            PolicyName: 'awsacceleratorvalidatemaintransitgatewayFunctionServiceRoleDefaultPolicy21AEB3E1',
            Roles: [
              {
                Ref: 'awsacceleratorvalidatemaintransitgatewayFunctionServiceRoleB1766D38',
              },
            ],
          },
        },
      },
    });
  });
});
