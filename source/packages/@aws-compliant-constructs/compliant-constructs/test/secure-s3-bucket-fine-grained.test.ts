import { ResourcePart, expect as expectCDK, haveResourceLike, arrayWith } from '@aws-cdk/assert';
import * as compliant_constructs from '../lib/secure-s3-bucket';
import * as TestConfig from './test-config';
import { test, describe } from '@jest/globals';

/**
 * Fine Grained Test - Compliant Constructor Secure S3 Bucket
 */

describe('Secure S3 Bucket Fine Grained Test', () => {
  /**
   * @global
   * Bucket Stack initialization
   */
  new compliant_constructs.SecureS3Bucket(TestConfig.stack, 'SecureBucket', TestConfig.secureBucketProps);

  /**
   * Secure Bucket Resource Exists Test
   */
  test('Secure Bucket Plublic Access Blocked Test', () => {
    expectCDK(TestConfig.stack).to(
      haveResourceLike('AWS::S3::Bucket', {
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
      }),
    );
  });

  /**
   * Secure Bucket Version Enable Test
   */
  test('Secure Bucket Version Enable Test', () => {
    expectCDK(TestConfig.stack).to(
      haveResourceLike('AWS::S3::Bucket', {
        VersioningConfiguration: {
          Status: 'Enabled',
        },
      }),
    );
  });

  /**
   * Secure Bucket Update Replace Policy Test
   */
  test('Secure Bucket Update Replace Policy Test', () => {
    expectCDK(TestConfig.stack).to(
      haveResourceLike(
        'AWS::S3::Bucket',
        {
          UpdateReplacePolicy: 'Retain',
          DeletionPolicy: 'Retain',
        },
        ResourcePart.CompleteDefinition,
      ),
    );
  });

  /**
   * Secure Bucket Update Replace Policy Test
   */
  test('Secure Bucket Encryption Settings Test', () => {
    expectCDK(TestConfig.stack).to(
      haveResourceLike('AWS::S3::Bucket', {
        BucketEncryption: {
          ServerSideEncryptionConfiguration: [
            {
              ServerSideEncryptionByDefault: {
                KMSMasterKeyID: {
                  'Fn::GetAtt': ['SecureBucketCmkB881412D', 'Arn'],
                },
                SSEAlgorithm: 'aws:kms',
              },
            },
          ],
        },
      }),
    );
  });

  /**
   * KMS Key Rotation Enable Test
   */
  test('KMS Key Rotation Enable Test', () => {
    expectCDK(TestConfig.stack).to(
      haveResourceLike('AWS::KMS::Key', {
        EnableKeyRotation: true,
      }),
    );
  });

  /**
   * KMS Key Update Delete Policy Test
   */
  test('KMS Key Rotation Enable Test', () => {
    expectCDK(TestConfig.stack).to(
      haveResourceLike(
        'AWS::KMS::Key',
        {
          DeletionPolicy: 'Retain',
          UpdateReplacePolicy: 'Retain',
        },
        ResourcePart.CompleteDefinition,
      ),
    );
  });

  /**
   * Bucket Side Encryption PolicyDocument Statement Test
   */
  test('Bucket Side Encryption PolicyDocument Statement Test', () => {
    expectCDK(TestConfig.stack).to(
      haveResourceLike('AWS::S3::BucketPolicy', {
        Bucket: {
          Ref: 'SecureBucket747CD8C0',
        },
        PolicyDocument: {
          Statement: arrayWith({
            Action: 's3:PutObject',
            Condition: {
              StringNotEquals: {
                's3:x-amz-server-side-encryption': 'aws:kms',
              },
            },
            Effect: 'Deny',
            Principal: {
              AWS: '*',
            },
            Resource: {
              'Fn::Join': [
                '',
                [
                  {
                    'Fn::GetAtt': ['SecureBucket747CD8C0', 'Arn'],
                  },
                  '/*',
                ],
              ],
            },
            Sid: 'deny-non-encrypted-object-uploads',
          }),
        },
      }),
    );
  });
});
