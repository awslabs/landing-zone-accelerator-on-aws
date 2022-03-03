import * as cdk from 'aws-cdk-lib';
import { GuardDutyPublishingDestination } from '../../lib/aws-guardduty/guardduty-publishing-destination';

const testNamePrefix = 'Construct(GuardDutyPublishingDestination): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new GuardDutyPublishingDestination(stack, 'GuardDutyPublishingDestination', {
  region: stack.region,
  exportDestinationType: 'S3',
});

/**
 * GuardDutyPublishingDestination construct test
 */
describe('GuardDutyPublishingDestination', () => {
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
   * Number of GuardDutyCreatePublishingDestinationCommand custom resource test
   */
  test(`${testNamePrefix} GuardDutyCreatePublishingDestinationCommand custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::GuardDutyCreatePublishingDestinationCommand', 1);
  });

  /**
   * Number of KMS Key resource test
   */
  test(`${testNamePrefix} KMS Key resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::KMS::Key', 1);
  });

  /**
   * Number of KMS alias resource test
   */
  test(`${testNamePrefix} KMS alias resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::KMS::Alias', 1);
  });

  /**
   * Number of Bucket resource test
   */
  test(`${testNamePrefix} Bucket resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::S3::Bucket', 1);
  });

  /**
   * Number of Bucket policy resource test
   */
  test(`${testNamePrefix} Bucket policy resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::S3::BucketPolicy', 1);
  });

  /**
   * Lambda Function resource configuration test
   */
  test(`${testNamePrefix} Lambda Function resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomGuardDutyCreatePublishingDestinationCommandCustomResourceProviderHandlerB3AE4CE8: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomGuardDutyCreatePublishingDestinationCommandCustomResourceProviderRoleD01DD26B'],
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
                'CustomGuardDutyCreatePublishingDestinationCommandCustomResourceProviderRoleD01DD26B',
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
        CustomGuardDutyCreatePublishingDestinationCommandCustomResourceProviderRoleD01DD26B: {
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
                        'guardDuty:CreateDetector',
                        'guardDuty:CreatePublishingDestination',
                        'guardDuty:DeletePublishingDestination',
                        'guardDuty:ListDetectors',
                        'guardDuty:ListPublishingDestinations',
                        'iam:CreateServiceLinkedRole',
                      ],
                      Effect: 'Allow',
                      Resource: '*',
                      Sid: 'GuardDutyCreatePublishingDestinationCommandTaskGuardDutyActions',
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
        GuardDutyPublishingDestination52AE4412: {
          Type: 'Custom::GuardDutyCreatePublishingDestinationCommand',
          DeletionPolicy: 'Delete',
          UpdateReplacePolicy: 'Delete',
          DependsOn: ['GuardDutyPublishingDestinationGuardDutyPublishingDestinationBucketPolicy7F1BD76B'],
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': [
                'CustomGuardDutyCreatePublishingDestinationCommandCustomResourceProviderHandlerB3AE4CE8',
                'Arn',
              ],
            },
            bucketArn: {
              'Fn::GetAtt': ['GuardDutyPublishingDestinationGuardDutyPublishingDestinationBucketEE284596', 'Arn'],
            },
            exportDestinationType: 'S3',
            kmsKeyArn: {
              'Fn::GetAtt': ['GuardDutyPublishingDestinationGuardDutyPublishingDestinationBucketCmk8EE18C04', 'Arn'],
            },
            region: {
              Ref: 'AWS::Region',
            },
          },
        },
      },
    });
  });

  /**
   * KMS Key resource configuration test
   */
  test(`${testNamePrefix} KMS Key resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        GuardDutyPublishingDestinationGuardDutyPublishingDestinationBucketCmk8EE18C04: {
          Type: 'AWS::KMS::Key',
          DeletionPolicy: 'Retain',
          UpdateReplacePolicy: 'Retain',
          Properties: {
            Description: 'AWS Accelerator GuardDuty Publishing Destination Bucket CMK',
            EnableKeyRotation: true,
            KeyPolicy: {
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
                  Action: ['kms:Decrypt', 'kms:DescribeKey', 'kms:Encrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*'],
                  Effect: 'Allow',
                  Principal: {
                    AWS: {
                      'Fn::GetAtt': [
                        'CustomGuardDutyCreatePublishingDestinationCommandCustomResourceProviderRoleD01DD26B',
                        'Arn',
                      ],
                    },
                  },
                  Resource: '*',
                },
                {
                  Action: ['kms:Decrypt', 'kms:DescribeKey', 'kms:Encrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*'],
                  Effect: 'Allow',
                  Principal: {
                    Service: 'guardduty.amazonaws.com',
                  },
                  Resource: '*',
                },
              ],
              Version: '2012-10-17',
            },
            Tags: [
              {
                Key: 'aws-cdk:auto-macie-access-bucket',
                Value: 'true',
              },
            ],
          },
        },
      },
    });
  });

  /**
   * KMS Alias resource configuration test
   */
  test(`${testNamePrefix} KMS Alias resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        GuardDutyPublishingDestinationGuardDutyPublishingDestinationBucketCmkAlias4C7CABC6: {
          Type: 'AWS::KMS::Alias',
          Properties: {
            AliasName: 'alias/accelerator/security/guardduty/s3',
            TargetKeyId: {
              'Fn::GetAtt': ['GuardDutyPublishingDestinationGuardDutyPublishingDestinationBucketCmk8EE18C04', 'Arn'],
            },
          },
        },
      },
    });
  });

  /**
   * Bucket resource configuration test
   */
  test(`${testNamePrefix} Bucket resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        GuardDutyPublishingDestinationGuardDutyPublishingDestinationBucketEE284596: {
          Type: 'AWS::S3::Bucket',
          UpdateReplacePolicy: 'Retain',
          DeletionPolicy: 'Retain',
          Metadata: {
            cfn_nag: {
              rules_to_suppress: [
                {
                  id: 'W35',
                  reason:
                    'S3 Bucket access logging is not enabled for the accelerator security guardduty publishing destination bucket.',
                },
              ],
            },
          },
          Properties: {
            BucketEncryption: {
              ServerSideEncryptionConfiguration: [
                {
                  ServerSideEncryptionByDefault: {
                    KMSMasterKeyID: {
                      'Fn::GetAtt': [
                        'GuardDutyPublishingDestinationGuardDutyPublishingDestinationBucketCmk8EE18C04',
                        'Arn',
                      ],
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
                  'aws-accelerator-security-guardduty-',
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
            Tags: [
              {
                Key: 'aws-cdk:auto-macie-access-bucket',
                Value: 'true',
              },
            ],
            VersioningConfiguration: {
              Status: 'Enabled',
            },
          },
        },
      },
    });
  });

  /**
   * Bucket policy resource configuration test
   */
  test(`${testNamePrefix} Bucket policy resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        GuardDutyPublishingDestinationGuardDutyPublishingDestinationBucketPolicy7F1BD76B: {
          Type: 'AWS::S3::BucketPolicy',
          Properties: {
            Bucket: {
              Ref: 'GuardDutyPublishingDestinationGuardDutyPublishingDestinationBucketEE284596',
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
                      'Fn::GetAtt': [
                        'GuardDutyPublishingDestinationGuardDutyPublishingDestinationBucketEE284596',
                        'Arn',
                      ],
                    },
                    {
                      'Fn::Join': [
                        '',
                        [
                          {
                            'Fn::GetAtt': [
                              'GuardDutyPublishingDestinationGuardDutyPublishingDestinationBucketEE284596',
                              'Arn',
                            ],
                          },
                          '/*',
                        ],
                      ],
                    },
                  ],
                  Sid: 'deny-insecure-connections',
                },
                {
                  Action: [
                    's3:GetObject*',
                    's3:GetBucket*',
                    's3:List*',
                    's3:DeleteObject*',
                    's3:PutObject',
                    's3:PutObjectLegalHold',
                    's3:PutObjectRetention',
                    's3:PutObjectTagging',
                    's3:PutObjectVersionTagging',
                    's3:Abort*',
                  ],
                  Effect: 'Allow',
                  Principal: {
                    AWS: {
                      'Fn::GetAtt': [
                        'CustomGuardDutyCreatePublishingDestinationCommandCustomResourceProviderRoleD01DD26B',
                        'Arn',
                      ],
                    },
                  },
                  Resource: [
                    {
                      'Fn::GetAtt': [
                        'GuardDutyPublishingDestinationGuardDutyPublishingDestinationBucketEE284596',
                        'Arn',
                      ],
                    },
                    {
                      'Fn::Join': [
                        '',
                        [
                          {
                            'Fn::GetAtt': [
                              'GuardDutyPublishingDestinationGuardDutyPublishingDestinationBucketEE284596',
                              'Arn',
                            ],
                          },
                          '/*',
                        ],
                      ],
                    },
                  ],
                },
                {
                  Action: [
                    's3:GetObject*',
                    's3:GetBucket*',
                    's3:List*',
                    's3:DeleteObject*',
                    's3:PutObject',
                    's3:PutObjectLegalHold',
                    's3:PutObjectRetention',
                    's3:PutObjectTagging',
                    's3:PutObjectVersionTagging',
                    's3:Abort*',
                  ],
                  Effect: 'Allow',
                  Principal: {
                    Service: 'guardduty.amazonaws.com',
                  },
                  Resource: [
                    {
                      'Fn::GetAtt': [
                        'GuardDutyPublishingDestinationGuardDutyPublishingDestinationBucketEE284596',
                        'Arn',
                      ],
                    },
                    {
                      'Fn::Join': [
                        '',
                        [
                          {
                            'Fn::GetAtt': [
                              'GuardDutyPublishingDestinationGuardDutyPublishingDestinationBucketEE284596',
                              'Arn',
                            ],
                          },
                          '/*',
                        ],
                      ],
                    },
                  ],
                },
              ],
              Version: '2012-10-17',
            },
          },
        },
      },
    });
  });
});
