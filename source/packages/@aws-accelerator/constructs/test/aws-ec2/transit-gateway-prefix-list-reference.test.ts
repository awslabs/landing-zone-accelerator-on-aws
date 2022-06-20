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
import { TransitGatewayPrefixListReference } from '../../lib/aws-ec2/transit-gateway-prefix-list-reference';

const testNamePrefix = 'Construct(TransitGatewayPrefixListReference): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new TransitGatewayPrefixListReference(stack, 'TestTransitGatewayPrefixListReference', {
  prefixListId: 'pl-test',
  transitGatewayAttachmentId: 'tgw-attach-test',
  transitGatewayRouteTableId: 'Test',
  logGroupKmsKey: new cdk.aws_kms.Key(stack, 'TestKms', {}),
  logRetentionInDays: 3653,
});

/**
 * Transit gateway prefix list reference construct test
 */
describe('TransitGatewayPrefixListReference', () => {
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
  test(`${testNamePrefix} TransitGatewayPrefixListReference custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::TransitGatewayPrefixListReference', 1);
  });

  /**
   * Lambda Function resource configuration test
   */
  test(`${testNamePrefix} Lambda Function resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomTransitGatewayPrefixListReferenceCustomResourceProviderHandler9BAD63E3: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomTransitGatewayPrefixListReferenceCustomResourceProviderRoleC5D4C080'],
          Properties: {
            Code: {
              S3Bucket: {
                'Fn::Sub': 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
              },
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': ['CustomTransitGatewayPrefixListReferenceCustomResourceProviderRoleC5D4C080', 'Arn'],
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
        CustomTransitGatewayPrefixListReferenceCustomResourceProviderRoleC5D4C080: {
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
                        'ec2:CreateTransitGatewayPrefixListReference',
                        'ec2:ModifyTransitGatewayPrefixListReference',
                        'ec2:DeleteTransitGatewayPrefixListReference',
                      ],
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
   * TransitGatewayPrefixListReference custom resource configuration test
   */
  test(`${testNamePrefix} TransitGatewayPrefixListReference custom resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TestTransitGatewayPrefixListReference11CAF048: {
          Type: 'Custom::TransitGatewayPrefixListReference',
          DeletionPolicy: 'Delete',
          UpdateReplacePolicy: 'Delete',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomTransitGatewayPrefixListReferenceCustomResourceProviderHandler9BAD63E3', 'Arn'],
            },
            prefixListReference: {
              PrefixListId: 'pl-test',
              TransitGatewayRouteTableId: 'Test',
              TransitGatewayAttachmentId: 'tgw-attach-test',
            },
          },
        },
      },
    });
  });
});
