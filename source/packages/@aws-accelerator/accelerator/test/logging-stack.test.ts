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
import { AcceleratorStage } from '../lib/accelerator-stage';
import { AcceleratorSynthStacks } from './accelerator-synth-stacks';

const testNamePrefix = 'Construct(LoggingStack): ';

const acceleratorTestStacks = new AcceleratorSynthStacks(AcceleratorStage.LOGGING, 'all-enabled', 'aws');
const stack = acceleratorTestStacks.stacks.get(`LogArchive-us-east-1`)!;

/**
 * LoggingStack construct test
 */
describe('LoggingStack', () => {
  /**
   * Number of S3 Bucket resource test
   */
  test(`${testNamePrefix} S3 Bucket resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::S3::Bucket', 3);
  });

  /**
   * Number of BucketPolicy resource test
   */
  test(`${testNamePrefix} BucketPolicy resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::S3::BucketPolicy', 3);
  });

  /**
   * Number of Lambda Function resource test
   */
  test(`${testNamePrefix} Lambda Function resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Lambda::Function', 5);
  });

  /**
   * Number of IAM Role resource test
   */
  test(`${testNamePrefix} IAM Role resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::IAM::Role', 8);
  });

  /**
   * Number of DescribeOrganization custom resource test
   */
  test(`${testNamePrefix} DescribeOrganization custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::DescribeOrganization', 1);
  });

  /**
   * Number of PutPublicAccessBlock custom resource test
   */
  test(`${testNamePrefix} PutPublicAccessBlock custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::PutPublicAccessBlock', 1);
  });

  /**
   * AccessLogsBucket resource configuration test
   */
  test(`${testNamePrefix} AccessLogsBucket resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        AccessLogsBucketFA218D2A: {
          Type: 'AWS::S3::Bucket',
          UpdateReplacePolicy: 'Retain',
          DeletionPolicy: 'Retain',
          Metadata: {
            cdk_nag: {
              rules_to_suppress: [
                {
                  id: 'AwsSolutions-S1',
                  reason:
                    'AccessLogsBucket has server access logs disabled till the task for access logging completed.',
                },
              ],
            },
          },
          Properties: {
            BucketEncryption: {
              ServerSideEncryptionConfiguration: [
                {
                  ServerSideEncryptionByDefault: {
                    SSEAlgorithm: 'AES256',
                  },
                },
              ],
            },
            BucketName: 'aws-accelerator-s3-access-logs-333333333333-us-east-1',
            OwnershipControls: {
              Rules: [
                {
                  ObjectOwnership: 'BucketOwnerPreferred',
                },
              ],
            },
            PublicAccessBlockConfiguration: {
              BlockPublicAcls: true,
              BlockPublicPolicy: true,
              IgnorePublicAcls: true,
              RestrictPublicBuckets: true,
            },
            VersioningConfiguration: {
              Status: 'Enabled',
            },
          },
        },
      },
    });
  });

  /**
   * AccessLogsBucketPolicy resource configuration test
   */
  test(`${testNamePrefix} AccessLogsBucketPolicy resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        AccessLogsBucketPolicy00F12803: {
          Type: 'AWS::S3::BucketPolicy',
          Properties: {
            Bucket: {
              Ref: 'AccessLogsBucketFA218D2A',
            },
            PolicyDocument: {
              Statement: [
                {
                  Action: 's3:*',
                  Condition: {
                    Bool: {
                      'aws:SecureTransport': 'false',
                    },
                  },
                  Effect: 'Deny',
                  Principal: {
                    AWS: '*',
                  },
                  Resource: [
                    {
                      'Fn::GetAtt': ['AccessLogsBucketFA218D2A', 'Arn'],
                    },
                    {
                      'Fn::Join': [
                        '',
                        [
                          {
                            'Fn::GetAtt': ['AccessLogsBucketFA218D2A', 'Arn'],
                          },
                          '/*',
                        ],
                      ],
                    },
                  ],
                  Sid: 'deny-insecure-connections',
                },
                {
                  Action: 's3:PutObject',
                  Condition: {
                    StringEquals: {
                      'aws:SourceAccount': '333333333333',
                    },
                  },
                  Effect: 'Allow',
                  Principal: {
                    Service: 'logging.s3.amazonaws.com',
                  },
                  Resource: {
                    'Fn::Join': [
                      '',
                      [
                        {
                          'Fn::GetAtt': ['AccessLogsBucketFA218D2A', 'Arn'],
                        },
                        '/*',
                      ],
                    ],
                  },
                  Sid: 'Allow write access for logging service principal',
                },
              ],
              Version: '2012-10-17',
            },
          },
        },
      },
    });
  });

  /**
   * CustomOrganizationsDescribeOrganizationCustomResourceProviderHandler resource configuration test
   */
  test(`${testNamePrefix} CustomOrganizationsDescribeOrganizationCustomResourceProviderHandler resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomOrganizationsDescribeOrganizationCustomResourceProviderHandler4C6F49D1: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomOrganizationsDescribeOrganizationCustomResourceProviderRole775854D5'],
          Properties: {
            Code: {
              S3Bucket: 'cdk-hnb659fds-assets-333333333333-us-east-1',
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': ['CustomOrganizationsDescribeOrganizationCustomResourceProviderRole775854D5', 'Arn'],
            },
            Runtime: 'nodejs14.x',
            Timeout: 900,
          },
        },
      },
    });
  });

  /**
   * CustomOrganizationsDescribeOrganizationCustomResourceProviderRole resource configuration test
   */
  test(`${testNamePrefix} CustomOrganizationsDescribeOrganizationCustomResourceProviderRole resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomOrganizationsDescribeOrganizationCustomResourceProviderRole775854D5: {
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
                      Action: ['organizations:DescribeOrganization'],
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
   * CustomS3PutPublicAccessBlockCustomResourceProviderHandler resource configuration test
   */
  test(`${testNamePrefix} CustomS3PutPublicAccessBlockCustomResourceProviderHandler resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomS3PutPublicAccessBlockCustomResourceProviderHandler978E227B: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomS3PutPublicAccessBlockCustomResourceProviderRole656EB36E'],
          Properties: {
            Code: {
              S3Bucket: 'cdk-hnb659fds-assets-333333333333-us-east-1',
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': ['CustomS3PutPublicAccessBlockCustomResourceProviderRole656EB36E', 'Arn'],
            },
            Runtime: 'nodejs14.x',
            Timeout: 900,
          },
        },
      },
    });
  });

  /**
   * CustomS3PutPublicAccessBlockCustomResourceProviderRole resource configuration test
   */
  test(`${testNamePrefix} CustomS3PutPublicAccessBlockCustomResourceProviderRole resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomS3PutPublicAccessBlockCustomResourceProviderRole656EB36E: {
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
                      Action: ['s3:PutAccountPublicAccessBlock'],
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
   * Organization custom resource configuration test
   */
  test(`${testNamePrefix} Organization custom resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        Organization29A5FC3F: {
          Type: 'Custom::DescribeOrganization',
          UpdateReplacePolicy: 'Delete',
          DeletionPolicy: 'Delete',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomOrganizationsDescribeOrganizationCustomResourceProviderHandler4C6F49D1', 'Arn'],
            },
          },
        },
      },
    });
  });

  /**
   * S3PublicAccessBlock custom resource configuration test
   */
  test(`${testNamePrefix} S3PublicAccessBlock custom resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        S3PublicAccessBlock344F906B: {
          Type: 'Custom::PutPublicAccessBlock',
          UpdateReplacePolicy: 'Delete',
          DeletionPolicy: 'Delete',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomS3PutPublicAccessBlockCustomResourceProviderHandler978E227B', 'Arn'],
            },
            accountId: '333333333333',
            blockPublicAcls: true,
            blockPublicPolicy: true,
            ignorePublicAcls: true,
            restrictPublicBuckets: true,
          },
        },
      },
    });
  });
});
