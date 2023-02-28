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
import { Bucket, BucketEncryptionType, BucketAccessType } from '../../lib/aws-s3/bucket';
import { snapShotTest } from '../snapshot-test';
import { describe, it, expect } from '@jest/globals';

const testNamePrefix = 'Construct(Bucket): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

/**
 * Bucket construct test
 */
describe('Bucket', () => {
  it('test standard snapshot', () => {
    const standardTest = new Bucket(stack, 'Bucket', {
      encryptionType: BucketEncryptionType.SSE_KMS,
      s3BucketName: `aws-accelerator-macie-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
      kmsKey: new cdk.aws_kms.Key(stack, 'CustomKey', {}),
      serverAccessLogsBucketName: `aws-accelerator-s3-access-logs-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
      replicationProps: {
        destination: {
          bucketName: `aws-accelerator-central-logs-bucket`,
          accountId: cdk.Aws.ACCOUNT_ID,
          keyArn: `arn:aws:kms:us-east-1:${cdk.Aws.ACCOUNT_ID}:key/ksm-key-arn`,
        },
        kmsKey: new cdk.aws_kms.Key(stack, 'CWLKey', {}),
        logRetentionInDays: 3653,
      },
    });
    // test methods to call bucket and bucket kms key
    // the values are cdk tokens so just check if they are string
    expect(standardTest.getKey().keyArn).toBeDefined();
    expect(standardTest.getS3Bucket().bucketName).toBeDefined();
  });
  it('test awsPrincipals', () => {
    new Bucket(stack, 'BucketAwsPrincipalAccess', {
      encryptionType: BucketEncryptionType.SSE_KMS,
      awsPrincipalAccesses: [
        { name: 'someName1', principal: 'principal1', accessType: BucketAccessType.READONLY },
        { name: 'someName2', principal: 'principal2', accessType: BucketAccessType.WRITEONLY },
        { name: 'someName3', principal: 'principal3', accessType: BucketAccessType.READWRITE },
      ],
      s3BucketName: `aws-accelerator-macie-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
      kmsKey: new cdk.aws_kms.Key(stack, 'CustomKey1', {}),
      serverAccessLogsBucketName: `aws-accelerator-s3-access-logs-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
      replicationProps: {
        destination: {
          bucketName: `aws-accelerator-central-logs-bucket`,
          accountId: cdk.Aws.ACCOUNT_ID,
          keyArn: `arn:aws:kms:us-east-1:${cdk.Aws.ACCOUNT_ID}:key/ksm-key-arn`,
        },
        kmsKey: new cdk.aws_kms.Key(stack, 'CWLKey1', {}),
        logRetentionInDays: 3653,
      },
    });
  });
  it('test when sse_kms but no kms is provided', () => {
    new Bucket(stack, 'BucketSseNoKms', {
      encryptionType: BucketEncryptionType.SSE_KMS,
      s3BucketName: `aws-accelerator-macie-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
      kmsAliasName: 'kmsAliasName',
      serverAccessLogsBucketName: `aws-accelerator-s3-access-logs-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
      replicationProps: {
        destination: {
          bucketName: `aws-accelerator-central-logs-bucket`,
          accountId: cdk.Aws.ACCOUNT_ID,
          keyArn: `arn:aws:kms:us-east-1:${cdk.Aws.ACCOUNT_ID}:key/ksm-key-arn`,
        },
        kmsKey: new cdk.aws_kms.Key(stack, 'CWLKey2', {}),
        logRetentionInDays: 3653,
      },
    });
  });
  it('test when kms is sse_s3', () => {
    new Bucket(stack, 'BucketSseS3', {
      encryptionType: BucketEncryptionType.SSE_S3,
      s3BucketName: 'testbucket',
      serverAccessLogsBucketName: `aws-accelerator-s3-access-logs-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
      replicationProps: {
        destination: {
          bucketName: `aws-accelerator-central-logs-bucket`,
          accountId: cdk.Aws.ACCOUNT_ID,
          keyArn: `arn:aws:kms:us-east-1:${cdk.Aws.ACCOUNT_ID}:key/ksm-key-arn`,
        },
        kmsKey: new cdk.aws_kms.Key(stack, 'CWLKey4', {}),
        logRetentionInDays: 3653,
      },
    });
  });
  it('Should throw exception when no cmk is set but cmk is called', () => {
    function callCmkKeyOnBucketWithoutCmk() {
      const noKmsBucket = new Bucket(stack, 'BucketSseS3CmkError', {
        encryptionType: BucketEncryptionType.SSE_S3,
        s3BucketName: 'testbucket',
        serverAccessLogsBucketName: `aws-accelerator-s3-access-logs-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
        replicationProps: {
          destination: {
            bucketName: `aws-accelerator-central-logs-bucket`,
            accountId: cdk.Aws.ACCOUNT_ID,
            keyArn: `arn:aws:kms:us-east-1:${cdk.Aws.ACCOUNT_ID}:key/ksm-key-arn`,
          },
          kmsKey: new cdk.aws_kms.Key(stack, 'CWLKey4', {}),
          logRetentionInDays: 3653,
        },
      });
      noKmsBucket.getKey().keyArn;
      return noKmsBucket.getS3Bucket().bucketName;
    }

    expect(callCmkKeyOnBucketWithoutCmk).toThrow(Error);
  });

  it('server access logs bucket name is not set and server access logs bucket is provided', () => {
    new Bucket(stack, 'BucketServerAccessBucket', {
      encryptionType: BucketEncryptionType.SSE_S3,
      s3BucketName: 'testbucket',
      serverAccessLogsBucket: new cdk.aws_s3.Bucket(stack, 'serverAccessLogsBucket'),
      replicationProps: {
        destination: {
          bucketName: `aws-accelerator-central-logs-bucket`,
          accountId: cdk.Aws.ACCOUNT_ID,
          keyArn: `arn:aws:kms:us-east-1:${cdk.Aws.ACCOUNT_ID}:key/ksm-key-arn`,
        },
        kmsKey: new cdk.aws_kms.Key(stack, 'CWLKey5', {}),
        logRetentionInDays: 3653,
      },
    });
  });
  it('server access logs bucket name is not set and s3bucket is not set', () => {
    function noS3noServerAccess() {
      new Bucket(stack, 'BucketNoS3noServerAccess', {
        encryptionType: BucketEncryptionType.SSE_S3,
        serverAccessLogsBucket: new cdk.aws_s3.Bucket(stack, 'serverAccessLogsBucket1'),
        replicationProps: {
          destination: {
            bucketName: `aws-accelerator-central-logs-bucket`,
            accountId: cdk.Aws.ACCOUNT_ID,
            keyArn: `arn:aws:kms:us-east-1:${cdk.Aws.ACCOUNT_ID}:key/ksm-key-arn`,
          },
          kmsKey: new cdk.aws_kms.Key(stack, 'CWLKey6', {}),
          logRetentionInDays: 3653,
        },
      });
    }
    expect(noS3noServerAccess).toThrow(
      new Error('s3BucketName or serverAccessLogsPrefix property must be defined when using serverAccessLogs.'),
    );
  });
  it('server access logs bucket name and server access logs bucket is provided', () => {
    function tooMuchServerAccess() {
      new Bucket(stack, 'BucketTooMuchServerAccess', {
        encryptionType: BucketEncryptionType.SSE_S3,
        serverAccessLogsBucket: new cdk.aws_s3.Bucket(stack, 'serverAccessLogsBucketTooMuchServerAccess'),
        serverAccessLogsBucketName: `aws-accelerator-s3-access-logs-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
        replicationProps: {
          destination: {
            bucketName: `aws-accelerator-central-logs-bucket`,
            accountId: cdk.Aws.ACCOUNT_ID,
            keyArn: `arn:aws:kms:us-east-1:${cdk.Aws.ACCOUNT_ID}:key/ksm-key-arn`,
          },
          kmsKey: new cdk.aws_kms.Key(stack, 'CWLKeyTooMuchServerAccess', {}),
          logRetentionInDays: 3653,
        },
      });
    }
    expect(tooMuchServerAccess).toThrow(
      new Error('serverAccessLogsBucketName or serverAccessLogsBucket (only one property) should be defined.'),
    );
  });
  it('test awsPrincipals with no access', () => {
    function noBucketAccessToAwsPrincipal() {
      new Bucket(stack, 'BucketNoBucketAccessToAwsPrincipal', {
        encryptionType: BucketEncryptionType.SSE_KMS,
        awsPrincipalAccesses: [{ name: 'someName1', principal: 'principal1', accessType: BucketAccessType.NO_ACCESS }],
        s3BucketName: `aws-accelerator-macie-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
        kmsKey: new cdk.aws_kms.Key(stack, 'CustomKeyNoBucketAccessToAwsPrincipal', {}),
        serverAccessLogsBucketName: `aws-accelerator-s3-access-logs-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
        replicationProps: {
          destination: {
            bucketName: `aws-accelerator-central-logs-bucket`,
            accountId: cdk.Aws.ACCOUNT_ID,
            keyArn: `arn:aws:kms:us-east-1:${cdk.Aws.ACCOUNT_ID}:key/ksm-key-arn`,
          },
          kmsKey: new cdk.aws_kms.Key(stack, 'CWLKeyNoBucketAccessToAwsPrincipal', {}),
          logRetentionInDays: 3653,
        },
      });
    }
    expect(noBucketAccessToAwsPrincipal).toThrow(new Error('Invalid Access Type no_access for principal1 principal.'));
  });
  it('test with s3 lifecycle rules provided', () => {
    new Bucket(stack, 'BucketLifeCycleProvided', {
      encryptionType: BucketEncryptionType.SSE_KMS,
      s3BucketName: `aws-accelerator-macie-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
      kmsKey: new cdk.aws_kms.Key(stack, 'CustomKeyLifeCycleProvided', {}),
      serverAccessLogsBucketName: `aws-accelerator-s3-access-logs-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
      s3LifeCycleRules: [
        {
          id: '1',
          abortIncompleteMultipartUploadAfter: 1,
          enabled: true,
          expiration: 24,
          expiredObjectDeleteMarker: true,
          noncurrentVersionExpiration: 12,
          transitions: [
            {
              storageClass: 'STANDARD_IA',
              transitionAfter: 7,
            },
          ],
          noncurrentVersionTransitions: [
            {
              storageClass: 'GLACIER',
              transitionAfter: 365,
            },
          ],
        },
      ],
    });
  });

  snapShotTest(testNamePrefix, stack);
});
