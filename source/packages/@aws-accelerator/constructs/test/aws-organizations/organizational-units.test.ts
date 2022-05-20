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
import { OrganizationalUnits } from '../../index';
//import { SynthUtils } from '@aws-cdk/assert';

const testNamePrefix = 'Construct(OrganizationalUnit): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new OrganizationalUnits(stack, 'OrganizationalUnits', {
  acceleratorConfigTable: new cdk.aws_dynamodb.Table(stack, 'ConfigTable', {
    partitionKey: { name: 'dataType', type: cdk.aws_dynamodb.AttributeType.STRING },
  }),
  commitId: 'bda32a39',
  controlTowerEnabled: true,
  organizationsEnabled: true,
  kmsKey: new cdk.aws_kms.Key(stack, 'CustomKey', {}),
  logRetentionInDays: 365,
});

/**
 * OrganizationalUnit construct test
 */
describe('OrganizationalUnits', () => {
  //   test(`${testNamePrefix} Snapshot Test`, () => {
  //    expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
  //   });

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
   * Number of CreateOrganizationalUnit custom resource test
   */
  test(`${testNamePrefix} CreateOrganizationalUnits custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::CreateOrganizationalUnits', 1);
  });

  /**
   * Lambda Function resource configuration test
   */
  test(`${testNamePrefix} Lambda Function resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomOrganizationsCreateOrganizationalUnitsCustomResourceProviderHandler4596F0BC: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomOrganizationsCreateOrganizationalUnitsCustomResourceProviderRole4B8B81B0'],
          Properties: {
            Code: {
              S3Bucket: {
                'Fn::Sub': 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
              },
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': ['CustomOrganizationsCreateOrganizationalUnitsCustomResourceProviderRole4B8B81B0', 'Arn'],
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
        CustomOrganizationsCreateOrganizationalUnitsCustomResourceProviderRole4B8B81B0: {
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
                        'organizations:CreateOrganizationalUnit',
                        'organizations:ListOrganizationalUnitsForParent',
                        'organizations:ListRoots',
                        'organizations:UpdateOrganizationalUnit',
                      ],
                      Effect: 'Allow',
                      Resource: '*',
                      Sid: 'organizations',
                    },
                    {
                      Action: ['dynamodb:UpdateItem', 'dynamodb:Query'],
                      Effect: 'Allow',
                      Resource: [
                        {
                          'Fn::GetAtt': ['ConfigTable5CD72349', 'Arn'],
                        },
                      ],
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
   * CreateOrganizationalUnit custom resource configuration test
   */
  test(`${testNamePrefix} CreateOrganizationalUnits custom resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        OrganizationalUnits30245726: {
          Type: 'Custom::CreateOrganizationalUnits',
          DeletionPolicy: 'Delete',
          UpdateReplacePolicy: 'Delete',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': [
                'CustomOrganizationsCreateOrganizationalUnitsCustomResourceProviderHandler4596F0BC',
                'Arn',
              ],
            },
            configTableName: { Ref: 'ConfigTable5CD72349' },
            partition: { Ref: 'AWS::Partition' },
          },
        },
      },
    });
  });
});
