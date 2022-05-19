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
import { DeleteDefaultVpc } from '../../lib/aws-ec2/delete-default-vpc';

const testNamePrefix = 'Construct(DeleteDefaultVpc): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new DeleteDefaultVpc(stack, 'DeleteDefaultVpc', {
  kmsKey: new cdk.aws_kms.Key(stack, 'CustomKey', {}),
  logRetentionInDays: 3653,
});

/**
 * DeleteDefaultVpc construct test
 */
describe('DeleteDefaultVpc', () => {
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
   * Number of DeleteDefaultVpc custom resource test
   */
  test(`${testNamePrefix} DeleteDefaultVpc custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::DeleteDefaultVpc', 1);
  });

  /**
   * Lambda Function resource configuration test
   */
  test(`${testNamePrefix} Lambda Function resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomDeleteDefaultVpcCustomResourceProviderHandler87E89F35: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomDeleteDefaultVpcCustomResourceProviderRole80963EEF'],
          Properties: {
            Code: {
              S3Bucket: {
                'Fn::Sub': 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
              },
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': ['CustomDeleteDefaultVpcCustomResourceProviderRole80963EEF', 'Arn'],
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
        CustomDeleteDefaultVpcCustomResourceProviderRole80963EEF: {
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
                        'ec2:DeleteInternetGateway',
                        'ec2:DetachInternetGateway',
                        'ec2:DeleteNetworkAcl',
                        'ec2:DeleteRoute',
                        'ec2:DeleteSecurityGroup',
                        'ec2:DeleteSubnet',
                        'ec2:DeleteVpc',
                        'ec2:DescribeInternetGateways',
                        'ec2:DescribeNetworkAcls',
                        'ec2:DescribeRouteTables',
                        'ec2:DescribeSecurityGroups',
                        'ec2:DescribeSubnets',
                        'ec2:DescribeVpcs',
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
   * DeleteDefaultVpc custom resource configuration test
   */
  test(`${testNamePrefix} DeleteDefaultVpc custom resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        DeleteDefaultVpc4DBAE36C: {
          Type: 'Custom::DeleteDefaultVpc',
          DeletionPolicy: 'Delete',
          UpdateReplacePolicy: 'Delete',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomDeleteDefaultVpcCustomResourceProviderHandler87E89F35', 'Arn'],
            },
          },
        },
      },
    });
  });
});
