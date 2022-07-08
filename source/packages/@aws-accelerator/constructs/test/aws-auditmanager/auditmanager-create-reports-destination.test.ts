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
import { AuditManagerDefaultReportsDestination } from '../../lib/aws-auditmanager/auditmanager-reports-destination';

const testNamePrefix = 'Construct(AuditManagerDefaultReportsDestination): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new AuditManagerDefaultReportsDestination(stack, 'AuditManagerDefaultReportsDestination', {
  bucket: `s3//aws-accelerator-org-auditmgr-pub-dest-${stack.account}-${stack.region}`,
  defaultReportsDestinationType: 'S3',
  kmsKey: new cdk.aws_kms.Key(stack, 'CustomKey', {}),
  logRetentionInDays: 3653,
});

/**
 * AuditManagerDefaultReportsDestination construct test
 */
describe('AuditManagerDefaultReportsDestination', () => {
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
   * Number of AuditManagerCreateDefaultReportsDestination custom resource test
   */
  test(`${testNamePrefix} AuditManagerCreateDefaultReportsDestination custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::AuditManagerCreateDefaultReportsDestination', 1);
  });

  /**
   * Lambda Function resource configuration test
   */
  test(`${testNamePrefix} Lambda Function resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomAuditManagerCreateDefaultReportsDestinationCustomResourceProviderHandler6BCBC433: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomAuditManagerCreateDefaultReportsDestinationCustomResourceProviderRoleAEE72AE5'],
          Properties: {
            Code: {
              S3Bucket: {
                'Fn::Sub': 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
              },
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': [
                'CustomAuditManagerCreateDefaultReportsDestinationCustomResourceProviderRoleAEE72AE5',
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
   * IAM role resource configuration test
   */
  test(`${testNamePrefix} IAM role resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomAuditManagerCreateDefaultReportsDestinationCustomResourceProviderRoleAEE72AE5: {
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
                      Action: ['auditmanager:UpdateSettings'],
                      Effect: 'Allow',
                      Resource: '*',
                      Sid: 'AuditManagerCreatePublishingDestinationCommandTaskAuditManagerActions',
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
   * GuardDutyCreatePublishingDestinationCommand custom resource configuration test
   */
  test(`${testNamePrefix} GuardDutyCreatePublishingDestinationCommand custom resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        AuditManagerDefaultReportsDestinationAFD20D60: {
          Type: 'Custom::AuditManagerCreateDefaultReportsDestination',
          UpdateReplacePolicy: 'Delete',
          DeletionPolicy: 'Delete',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': [
                'CustomAuditManagerCreateDefaultReportsDestinationCustomResourceProviderHandler6BCBC433',
                'Arn',
              ],
            },
            bucket: {
              'Fn::Join': [
                '',
                [
                  's3//aws-accelerator-org-auditmgr-pub-dest-',
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
            defaultReportsDestinationType: 'S3',
            kmsKeyArn: {
              'Fn::GetAtt': ['CustomKey1E6D0D07', 'Arn'],
            },
            region: {
              Ref: 'AWS::Region',
            },
          },
        },
      },
    });
  });
});
