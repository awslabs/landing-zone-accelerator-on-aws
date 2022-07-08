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
import { IpamSubnet } from '../../lib/aws-ec2/ipam-subnet';

const testNamePrefix = 'Construct(IpamSubnet): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new IpamSubnet(stack, 'TestIpamSubnet', {
  name: 'Test',
  availabilityZone: 'us-east-1a',
  basePool: ['10.0.0.0/8'],
  ipamAllocation: {
    ipamPoolName: 'test-pool',
    netmaskLength: 24,
  },
  kmsKey: new cdk.aws_kms.Key(stack, 'Key', {}),
  logRetentionInDays: 3653,
  vpcId: 'vpc-test',
});

/**
 * IPAM subnet construct test
 */
describe('IpamSubnet', () => {
  /**
   * Snapshot test
   */
  // test(`${testNamePrefix} Snapshot Test`, () => {
  //   expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
  // });

  /**
   * Number of Lambda function resource test
   */
  test(`${testNamePrefix} Lambda function resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Lambda::Function', 1);
  });

  /**
   * Number of IAM role resource test
   */
  test(`${testNamePrefix} IAM role resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::IAM::Role', 1);
  });

  /**
   * Number of IPAM org admin test
   */
  test(`${testNamePrefix} IPAM subnet count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::IpamSubnet', 1);
  });

  /**
   * Lambda Function resource configuration test
   */
  test(`${testNamePrefix} Lambda Function resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomIpamSubnetCustomResourceProviderHandlerF7AF0D7A: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomIpamSubnetCustomResourceProviderRoleA2FF4E6D'],
          Properties: {
            Code: {
              S3Bucket: {
                'Fn::Sub': 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
              },
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': ['CustomIpamSubnetCustomResourceProviderRoleA2FF4E6D', 'Arn'],
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
        CustomIpamSubnetCustomResourceProviderRoleA2FF4E6D: {
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
                      Action: ['ec2:CreateTags', 'ec2:DeleteSubnet', 'ec2:ModifySubnetAttribute'],
                      Effect: 'Allow',
                      Resource: {
                        'Fn::Join': [
                          '',
                          [
                            'arn:',
                            { Ref: 'AWS::Partition' },
                            ':ec2:',
                            { Ref: 'AWS::Region' },
                            ':',
                            { Ref: 'AWS::AccountId' },
                            ':subnet/*',
                          ],
                        ],
                      },
                    },
                    {
                      Action: ['ec2:CreateSubnet'],
                      Effect: 'Allow',
                      Resource: [
                        {
                          'Fn::Join': [
                            '',
                            [
                              'arn:',
                              { Ref: 'AWS::Partition' },
                              ':ec2:',
                              { Ref: 'AWS::Region' },
                              ':',
                              { Ref: 'AWS::AccountId' },
                              ':subnet/*',
                            ],
                          ],
                        },
                        {
                          'Fn::Join': [
                            '',
                            [
                              'arn:',
                              { Ref: 'AWS::Partition' },
                              ':ec2:',
                              { Ref: 'AWS::Region' },
                              ':',
                              { Ref: 'AWS::AccountId' },
                              ':vpc/*',
                            ],
                          ],
                        },
                      ],
                    },
                    {
                      Action: ['ec2:DescribeVpcs', 'ec2:DescribeSubnets'],
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
   * IPAM subnet resource configuration test
   */
  test(`${testNamePrefix} IPAM subnet resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TestIpamSubnet05D29B1E: {
          Type: 'Custom::IpamSubnet',
          DependsOn: ['CustomIpamSubnetCustomResourceProviderLogGroup3BB67050'],
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomIpamSubnetCustomResourceProviderHandlerF7AF0D7A', 'Arn'],
            },
            availabilityZone: 'us-east-1a',
            basePool: ['10.0.0.0/8'],
            ipamAllocation: {
              ipamPoolName: 'test-pool',
              netmaskLength: 24,
            },
            name: 'Test',
            tags: [],
            vpcId: 'vpc-test',
          },
        },
      },
    });
  });
});
