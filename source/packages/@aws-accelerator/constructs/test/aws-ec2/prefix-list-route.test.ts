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

// import { SynthUtils } from '@aws-cdk/assert';
import { PrefixListRoute } from '../../lib/aws-ec2/prefix-list-route';

const testNamePrefix = 'Construct(PrefixListRoute): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new PrefixListRoute(stack, 'TestPrefixListRoute', {
  destinationPrefixListId: 'pl-test',
  logGroupKmsKey: new cdk.aws_kms.Key(stack, 'TestKms', {}),
  logRetentionInDays: 3653,
  routeTableId: 'Test',
  transitGatewayId: 'tgw-test',
});

/**
 * Prefix list route construct test
 */
describe('PrefixListRoute', () => {
  /**
   * Snapshot test
   */
  // test(`${testNamePrefix} Snapshot Test`, () => {
  //   expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
  // });

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
   * Number of prefix list route custom resource test
   */
  test(`${testNamePrefix} PrefixListRoute custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::PrefixListRoute', 1);
  });

  /**
   * Lambda Function resource configuration test
   */
  test(`${testNamePrefix} Lambda Function resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomPrefixListRouteCustomResourceProviderHandler5B28D077: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomPrefixListRouteCustomResourceProviderRoleD08268B5'],
          Properties: {
            Code: {
              S3Bucket: {
                'Fn::Sub': 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
              },
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': ['CustomPrefixListRouteCustomResourceProviderRoleD08268B5', 'Arn'],
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
        CustomPrefixListRouteCustomResourceProviderRoleD08268B5: {
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
                      Action: ['ec2:CreateRoute', 'ec2:ReplaceRoute', 'ec2:DeleteRoute'],
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
   * PrefixListRoute custom resource configuration test
   */
  test(`${testNamePrefix} PrefixListRoute custom resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TestPrefixListRoute212D9279: {
          Type: 'Custom::PrefixListRoute',
          DeletionPolicy: 'Delete',
          UpdateReplacePolicy: 'Delete',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomPrefixListRouteCustomResourceProviderHandler5B28D077', 'Arn'],
            },
            routeDefinition: {
              DestinationPrefixListId: 'pl-test',
              RouteTableId: 'Test',
              TransitGatewayId: 'tgw-test',
            },
          },
        },
      },
    });
  });
});
