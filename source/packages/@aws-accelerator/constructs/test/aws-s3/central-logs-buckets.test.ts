import * as cdk from 'aws-cdk-lib';
import { SynthUtils } from '@aws-cdk/assert';
import { Bucket, BucketEncryptionType, CentralLogsBucket } from '@aws-accelerator/constructs';

const testNamePrefix = 'Construct(CentralLogsBucket): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new CentralLogsBucket(stack, 'CentralLogsBucket', {
  s3BucketName: `aws-accelerator-central-logs-${stack.account}-${stack.region}`,
  serverAccessLogsBucket: new Bucket(stack, 'AccessLogsBucket', {
    encryptionType: BucketEncryptionType.SSE_KMS,
    s3BucketName: `aws-accelerator-s3-access-logs-${stack.account}-${stack.region}`,
    kmsAliasName: 'alias/accelerator/s3-access-logs/s3',
    kmsDescription: 'AWS Accelerator S3 Access Logs Bucket CMK',
  }),
  kmsAliasName: 'alias/accelerator/central-logs/s3',
  kmsDescription: 'AWS Accelerator Central Logs Bucket CMK',
  organizationId: 'acceleratorOrg',
});

/**
 * CentralLogsBucket construct test
 */
describe('CentralLogsBucket', () => {
  /**
   * Snapshot test
   */
  test(`${testNamePrefix} Snapshot Test`, () => {
    expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
  });

  /**
   * Number of bucket test
   */
  test(`${testNamePrefix} S3 bucket count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::S3::Bucket', 2);
  });

  /**
   * Number of bucket KMS test
   */
  test(`${testNamePrefix} bucket key count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::KMS::Key', 2);
  });

  /**
   * Number of bucket KMS alias test
   */
  test(`${testNamePrefix} Bucket KMS alias count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::KMS::Alias', 2);
  });

  /**
   * Number of bucket IAM Roles
   */
  test(`${testNamePrefix} IAM Role count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::IAM::Role', 1);
  });

  /**
   * Number of SSM Parameters
   */
  test(`${testNamePrefix} SSM Parameter count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::SSM::Parameter', 1);
  });

  /**
   * AccessLogsBucket configuration configuration test
   */
  test(`${testNamePrefix} AccessLogsBucket configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        AccessLogsBucketFA218D2A: {
          Type: 'AWS::S3::Bucket',
          DeletionPolicy: 'Retain',
          UpdateReplacePolicy: 'Retain',
          Properties: {
            AccessControl: 'LogDeliveryWrite',
            BucketEncryption: {
              ServerSideEncryptionConfiguration: [
                {
                  ServerSideEncryptionByDefault: {
                    KMSMasterKeyID: {
                      'Fn::GetAtt': ['AccessLogsBucketCmkECACF392', 'Arn'],
                    },
                    SSEAlgorithm: 'aws:kms',
                  },
                },
              ],
            },
            BucketName: {
              'Fn::Join': [
                '',
                [
                  'aws-accelerator-s3-access-logs-',
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
   * AccessLogsBucket KMS configuration test
   */
  test(`${testNamePrefix} AccessLogsBucket KMS configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        AccessLogsBucketCmkECACF392: {
          Type: 'AWS::KMS::Key',
          UpdateReplacePolicy: 'Retain',
          DeletionPolicy: 'Retain',
          Properties: {
            EnableKeyRotation: true,
            KeyPolicy: {
              Version: '2012-10-17',
              Statement: [
                {
                  Action: 'kms:*',
                  Effect: 'Allow',
                  Principal: {
                    AWS: {
                      'Fn::Join': [
                        '',
                        [
                          'arn:',
                          {
                            Ref: 'AWS::Partition',
                          },
                          ':iam::',
                          {
                            Ref: 'AWS::AccountId',
                          },
                          ':root',
                        ],
                      ],
                    },
                  },
                  Resource: '*',
                },
              ],
            },
          },
        },
      },
    });
  });

  /**
   * AccessLogsBucketCmkAlias KMS Alias configuration test
   */
  test(`${testNamePrefix} AccessLogsBucket KMS alias configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        AccessLogsBucketCmkAliasD1876683: {
          Type: 'AWS::KMS::Alias',
          Properties: {
            AliasName: 'alias/accelerator/s3-access-logs/s3',
            TargetKeyId: {
              'Fn::GetAtt': ['AccessLogsBucketCmkECACF392', 'Arn'],
            },
          },
        },
      },
    });
  });

  /**
   * CentralLogsBucket configuration test
   */
  test(`${testNamePrefix} CentralLogsBucket configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CentralLogsBucket447B5C59: {
          Type: 'AWS::S3::Bucket',
          UpdateReplacePolicy: 'Retain',
          DeletionPolicy: 'Retain',
          Properties: {
            LoggingConfiguration: {
              DestinationBucketName: {
                Ref: 'AccessLogsBucketFA218D2A',
              },
            },
            BucketEncryption: {
              ServerSideEncryptionConfiguration: [
                {
                  ServerSideEncryptionByDefault: {
                    KMSMasterKeyID: {
                      'Fn::GetAtt': ['CentralLogsBucketCmkBA0AB2FC', 'Arn'],
                    },
                    SSEAlgorithm: 'aws:kms',
                  },
                },
              ],
            },
            BucketName: {
              'Fn::Join': [
                '',
                [
                  'aws-accelerator-central-logs-',
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
   * CentralLogsBucket KMS configuration test
   */
  test(`${testNamePrefix} CentralLogsBucket KMS configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CentralLogsBucketCmkBA0AB2FC: {
          Type: 'AWS::KMS::Key',
          UpdateReplacePolicy: 'Retain',
          DeletionPolicy: 'Retain',
          Properties: {
            EnableKeyRotation: true,
            KeyPolicy: {
              Version: '2012-10-17',
              Statement: [
                {
                  Action: 'kms:*',
                  Effect: 'Allow',
                  Principal: {
                    AWS: {
                      'Fn::Join': [
                        '',
                        [
                          'arn:',
                          {
                            Ref: 'AWS::Partition',
                          },
                          ':iam::',
                          {
                            Ref: 'AWS::AccountId',
                          },
                          ':root',
                        ],
                      ],
                    },
                  },
                  Resource: '*',
                },
                {
                  Action: 'kms:*',
                  Effect: 'Allow',
                  Principal: {
                    AWS: {
                      'Fn::Join': [
                        '',
                        [
                          'arn:',
                          {
                            Ref: 'AWS::Partition',
                          },
                          ':iam::',
                          {
                            Ref: 'AWS::AccountId',
                          },
                          ':root',
                        ],
                      ],
                    },
                  },
                  Resource: '*',
                  Sid: 'Enable IAM User Permissions',
                },
                {
                  Action: [
                    'kms:Decrypt',
                    'kms:DescribeKey',
                    'kms:Encrypt',
                    'kms:GenerateDataKey',
                    'kms:GenerateDataKeyWithoutPlaintext',
                    'kms:GenerateRandom',
                    'kms:GetKeyPolicy',
                    'kms:GetKeyRotationStatus',
                    'kms:ListAliases',
                    'kms:ListGrants',
                    'kms:ListKeyPolicies',
                    'kms:ListKeys',
                    'kms:ListResourceTags',
                    'kms:ListRetirableGrants',
                    'kms:ReEncryptFrom',
                    'kms:ReEncryptTo',
                  ],
                  Effect: 'Allow',
                  Principal: {
                    Service: 's3.amazonaws.com',
                  },
                  Resource: '*',
                  Sid: 'Allow S3 use of the key',
                },
                {
                  Action: [
                    'kms:Decrypt',
                    'kms:DescribeKey',
                    'kms:Encrypt',
                    'kms:GenerateDataKey',
                    'kms:GenerateDataKeyPair',
                    'kms:GenerateDataKeyPairWithoutPlaintext',
                    'kms:GenerateDataKeyWithoutPlaintext',
                    'kms:ReEncryptFrom',
                    'kms:ReEncryptTo',
                  ],
                  Effect: 'Allow',
                  Principal: {
                    Service: ['config.amazonaws.com', 'cloudtrail.amazonaws.com', 'delivery.logs.amazonaws.com'],
                  },
                  Resource: '*',
                  Sid: 'Allow AWS Services to encrypt and describe logs',
                },
                {
                  Action: [
                    'kms:Decrypt',
                    'kms:DescribeKey',
                    'kms:Encrypt',
                    'kms:GenerateDataKey',
                    'kms:GenerateDataKeyPair',
                    'kms:GenerateDataKeyPairWithoutPlaintext',
                    'kms:GenerateDataKeyWithoutPlaintext',
                    'kms:ReEncryptFrom',
                    'kms:ReEncryptTo',
                  ],
                  Condition: {
                    StringEquals: {
                      'aws:PrincipalOrgID': 'acceleratorOrg',
                    },
                  },
                  Effect: 'Allow',
                  Principal: {
                    AWS: '*',
                  },
                  Resource: '*',
                  Sid: 'Allow Organization use of the key',
                },
              ],
            },
          },
        },
      },
    });
  });

  /**
   * AccessLogsBucketCmkAlias KMS alias configuration test
   */
  test(`${testNamePrefix} CentralLogsBucket KMS alias configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CentralLogsBucketCmkAlias286EB783: {
          Type: 'AWS::KMS::Alias',
          Properties: {
            AliasName: 'alias/accelerator/central-logs/s3',
            TargetKeyId: {
              'Fn::GetAtt': ['CentralLogsBucketCmkBA0AB2FC', 'Arn'],
            },
          },
        },
      },
    });
  });

  /**
   * SSM Parameter configuration test
   */
  test(`${testNamePrefix} SSM Parameter configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CentralLogsBucketSsmParamCentralAccountBucketKMSArn57B61EA3: {
          Properties: {
            Name: '/accelerator/logging/central-bucket/kms/arn',
            Type: 'String',
            Value: {
              'Fn::GetAtt': ['CentralLogsBucketCmkBA0AB2FC', 'Arn'],
            },
          },
          Type: 'AWS::SSM::Parameter',
        },
      },
    });
  });

  /**
   * SSMParameter IAM Role configuration test
   */
  test(`${testNamePrefix} SSMParameter IAM Role configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CentralLogsBucketCrossAccountCentralBucketKMSArnSsmParamAccessRole83E55C59: {
          Properties: {
            AssumeRolePolicyDocument: {
              Statement: [
                {
                  Action: 'sts:AssumeRole',
                  Condition: {
                    StringEquals: {
                      'aws:PrincipalOrgID': 'acceleratorOrg',
                    },
                  },
                  Effect: 'Allow',
                  Principal: {
                    AWS: '*',
                  },
                },
              ],
              Version: '2012-10-17',
            },
            Policies: [
              {
                PolicyDocument: {
                  Statement: [
                    {
                      Action: ['ssm:GetParameters', 'ssm:GetParameter'],
                      Effect: 'Allow',
                      Resource: {
                        'Fn::Join': [
                          '',
                          [
                            'arn:',
                            {
                              Ref: 'AWS::Partition',
                            },
                            ':ssm:',
                            {
                              Ref: 'AWS::Region',
                            },
                            ':',
                            {
                              Ref: 'AWS::AccountId',
                            },
                            ':parameter',
                            {
                              Ref: 'CentralLogsBucketSsmParamCentralAccountBucketKMSArn57B61EA3',
                            },
                          ],
                        ],
                      },
                    },
                    {
                      Action: 'ssm:DescribeParameters',
                      Effect: 'Allow',
                      Resource: '*',
                    },
                  ],
                  Version: '2012-10-17',
                },
                PolicyName: 'default',
              },
            ],
            RoleName: {
              'Fn::Join': [
                '',
                [
                  'AWSAccelerator-CentralBucketKMSArnSsmParam-',
                  {
                    Ref: 'AWS::Region',
                  },
                ],
              ],
            },
          },
          Type: 'AWS::IAM::Role',
        },
      },
    });
  });
});
