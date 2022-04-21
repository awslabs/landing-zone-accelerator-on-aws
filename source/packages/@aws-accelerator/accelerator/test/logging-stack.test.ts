import * as cdk from 'aws-cdk-lib';
import { LoggingStack } from '../lib/stacks/logging-stack';
import { AcceleratorStackNames } from '../lib/accelerator';
import { AcceleratorStage } from '../lib/accelerator-stage';
import {
  ACCOUNT_CONFIG,
  GLOBAL_CONFIG,
  IAM_CONFIG,
  NETWORK_CONFIG,
  ORGANIZATION_CONFIG,
  SECURITY_CONFIG,
} from './configs/test-config';
import * as path from 'path';
import { AcceleratorStackProps } from '../lib/stacks/accelerator-stack';

const testNamePrefix = 'Construct(LoggingStack): ';

/**
 * LoggingStack
 */
const app = new cdk.App({
  context: { 'config-dir': path.join(__dirname, 'configs') },
});
const configDirPath = app.node.tryGetContext('config-dir');

const env = {
  account: '333333333333',
  region: 'us-east-1',
};

const props: AcceleratorStackProps = {
  env,
  configDirPath,
  accountsConfig: ACCOUNT_CONFIG,
  globalConfig: GLOBAL_CONFIG,
  iamConfig: IAM_CONFIG,
  networkConfig: NETWORK_CONFIG,
  organizationConfig: ORGANIZATION_CONFIG,
  securityConfig: SECURITY_CONFIG,
  partition: 'aws',
};
console.log(props);
const stack = new LoggingStack(
  app,
  `${AcceleratorStackNames[AcceleratorStage.LOGGING]}-${env.account}-${env.region}`,
  props,
);

/**
 * LoggingStack construct test
 */
describe('LoggingStack', () => {
  /**
   * Number of S3 Bucket resource test
   */
  test(`${testNamePrefix} S3 Bucket resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::S3::Bucket', 1);
  });

  /**
   * Number of BucketPolicy resource test
   */
  test(`${testNamePrefix} BucketPolicy resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::S3::BucketPolicy', 1);
  });

  /**
   * Number of Lambda Function resource test
   */
  test(`${testNamePrefix} Lambda Function resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Lambda::Function', 3);
  });

  /**
   * Number of IAM Role resource test
   */
  test(`${testNamePrefix} IAM Role resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::IAM::Role', 4);
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
