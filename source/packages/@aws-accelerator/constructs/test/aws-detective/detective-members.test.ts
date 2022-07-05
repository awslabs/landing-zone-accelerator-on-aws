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

import { DetectiveMembers } from '../../lib/aws-detective/detective-members';

const testNamePrefix = 'Construct(DetectiveMembers): ';
// import { SynthUtils } from '@aws-cdk/assert';

/**
 * Snapshot test
 */
// test(`${testNamePrefix} Snapshot Test`, () => {
//   expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
// });

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new DetectiveMembers(stack, 'DetectiveMembers', {
  kmsKey: new cdk.aws_kms.Key(stack, 'CustomKey', {}),
  logRetentionInDays: 3653,
});

/**
 * DetectiveMembers construct test
 */
describe('DetectiveMembers', () => {
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
   * Number of DetectiveCreateMembers custom resource test
   */
  test(`${testNamePrefix} DetectiveCreateMembers custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::DetectiveCreateMembers', 1);
  });

  /**
   * Lambda Function resource configuration test
   */
  test(`${testNamePrefix} Lambda Function resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomDetectiveCreateMembersCustomResourceProviderHandler0A0D060D: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomDetectiveCreateMembersCustomResourceProviderRole90BCDD0D'],
          Properties: {
            Code: {
              S3Bucket: {
                'Fn::Sub': 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
              },
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': ['CustomDetectiveCreateMembersCustomResourceProviderRole90BCDD0D', 'Arn'],
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
        CustomDetectiveCreateMembersCustomResourceProviderRole90BCDD0D: {
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
                        'detective:ListOrganizationAdminAccounts',
                        'detective:UpdateOrganizationConfiguration',
                        'detective:CreateMembers',
                        'detective:DeleteMembers',
                        'detective:DisassociateMembership',
                        'detective:ListMembers',
                        'detective:ListGraphs',
                      ],
                      Effect: 'Allow',
                      Resource: '*',
                      Sid: 'DetectiveCreateMembersTaskDetectiveActions',
                    },
                    {
                      Action: ['iam:CreateServiceLinkedRole'],
                      Effect: 'Allow',
                      Resource: ['*'],
                      Sid: 'ServiceLinkedRoleDetective',
                    },
                    {
                      Action: ['organizations:ListAccounts'],
                      Effect: 'Allow',
                      Resource: ['*'],
                      Sid: 'OrganisationsListDetective',
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
   * DetectiveCreateMembers custom resource configuration test
   */
  test(`${testNamePrefix} DetectiveCreateMembers custom resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        DetectiveMembers42A16137: {
          Type: 'Custom::DetectiveCreateMembers',
          DeletionPolicy: 'Delete',
          UpdateReplacePolicy: 'Delete',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomDetectiveCreateMembersCustomResourceProviderHandler0A0D060D', 'Arn'],
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
