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
import { GuardDutyDetectorConfig } from '../../lib/aws-guardduty/guardduty-detector-config';

const testNamePrefix = 'Construct(GuardDutyDetectorConfig): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new GuardDutyDetectorConfig(stack, 'GuardDutyDetectorConfig', {
  isExportConfigEnable: true,
  exportDestination: 'S3',
  exportFrequency: 'FIFTEEN_MINUTES',
  kmsKey: new cdk.aws_kms.Key(stack, 'CustomKey', {}),
  logRetentionInDays: 3653,
});

/**
 * GuardDutyDetectorConfig construct test
 */
describe('GuardDutyDetectorConfig', () => {
  /**
   * Number of IAM role resource test
   */
  test(`${testNamePrefix} IAM role resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::IAM::Role', 1);
  });

  /**
   * Number of Lambda function resource test
   */
  test(`${testNamePrefix} Lambda function resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Lambda::Function', 1);
  });

  /**
   * Number of GuardDutyUpdateDetector custom resource test
   */
  test(`${testNamePrefix} GuardDutyUpdateDetector custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::GuardDutyUpdateDetector', 1);
  });

  /**
   * Lambda Function resource configuration test
   */
  test(`${testNamePrefix} Lambda Function resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomGuardDutyUpdateDetectorCustomResourceProviderHandler78DF0FF9: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomGuardDutyUpdateDetectorCustomResourceProviderRole3014073E'],
          Properties: {
            Code: {
              S3Bucket: {
                'Fn::Sub': 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
              },
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': ['CustomGuardDutyUpdateDetectorCustomResourceProviderRole3014073E', 'Arn'],
            },
            Runtime: 'nodejs14.x',
            Timeout: 900,
          },
        },
      },
    });
  });

  /**
   * IAM role resource configuration test
   */
  test(`${testNamePrefix} IAM role resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomGuardDutyUpdateDetectorCustomResourceProviderRole3014073E: {
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
                        'guardduty:ListDetectors',
                        'guardduty:ListMembers',
                        'guardduty:UpdateDetector',
                        'guardduty:UpdateMemberDetectors',
                      ],
                      Effect: 'Allow',
                      Resource: '*',
                      Sid: 'GuardDutyUpdateDetectorTaskGuardDutyActions',
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
   * GuardDutyUpdateDetector custom resource configuration test
   */
  test(`${testNamePrefix} GuardDutyUpdateDetector custom resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        GuardDutyDetectorConfigDD64B103: {
          Type: 'Custom::GuardDutyUpdateDetector',
          DeletionPolicy: 'Delete',
          UpdateReplacePolicy: 'Delete',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomGuardDutyUpdateDetectorCustomResourceProviderHandler78DF0FF9', 'Arn'],
            },
            exportDestination: 'S3',
            exportFrequency: 'FIFTEEN_MINUTES',
            isExportConfigEnable: true,
            region: {
              Ref: 'AWS::Region',
            },
          },
        },
      },
    });
  });
});
