/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import { BucketAccessType } from '@aws-accelerator/utils';
import { Bucket, BucketEncryptionType } from '../../lib/aws-s3/bucket';
import { snapShotTest } from '../snapshot-test';
import { describe, it, expect } from 'vitest';

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
        useExistingRoles: false,
        acceleratorPrefix: 'AWSAccelerator',
      },
      nagSuppressionPrefix: 'BucketPrefix/Resource',
    });
    // test methods to call bucket and bucket kms key
    // the values are cdk tokens so just check if they are string
    expect(standardTest.getKey().keyArn).toBeDefined();
    expect(standardTest.getS3Bucket().bucketName).toBeDefined();
  });
  it('test when removalpolicy is provided', () => {
    new Bucket(stack, 'BucketWithRemovalPolicy', {
      encryptionType: BucketEncryptionType.SSE_KMS,
      s3BucketName: `aws-accelerator-macie-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
      kmsKey: new cdk.aws_kms.Key(stack, 'CustomKeyRemovalPolicy', {}),
      serverAccessLogsBucketName: `aws-accelerator-s3-access-logs-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
      replicationProps: {
        destination: {
          bucketName: `aws-accelerator-central-logs-bucket`,
          accountId: cdk.Aws.ACCOUNT_ID,
          keyArn: `arn:aws:kms:us-east-1:${cdk.Aws.ACCOUNT_ID}:key/ksm-key-arn`,
        },
        kmsKey: new cdk.aws_kms.Key(stack, 'CWLKeyRemovalPolicy', {}),
        logRetentionInDays: 3653,
        useExistingRoles: false,
        acceleratorPrefix: 'AWSAccelerator',
      },
      nagSuppressionPrefix: 'BucketPrefix/Resource',
      s3RemovalPolicy: cdk.RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
    });
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
        useExistingRoles: false,
        acceleratorPrefix: 'AWSAccelerator',
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
        useExistingRoles: false,
        acceleratorPrefix: 'AWSAccelerator',
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
        useExistingRoles: false,
        acceleratorPrefix: 'AWSAccelerator',
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
          useExistingRoles: false,
          acceleratorPrefix: 'AWSAccelerator',
        },
      });
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
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
        useExistingRoles: false,
        acceleratorPrefix: 'AWSAccelerator',
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
          useExistingRoles: false,
          acceleratorPrefix: 'AWSAccelerator',
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
          useExistingRoles: false,
          acceleratorPrefix: 'AWSAccelerator',
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
          useExistingRoles: false,
          acceleratorPrefix: 'AWSAccelerator',
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
          expiredObjectDeleteMarker: false,
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
        {
          id: '2',
          abortIncompleteMultipartUploadAfter: 1,
          enabled: true,
          expiration: 24,
          expiredObjectDeleteMarker: false,
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
          prefix: 'PREFIX1',
        },
        {
          id: '3',
          abortIncompleteMultipartUploadAfter: 1,
          enabled: true,
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
          prefix: 'PREFIX2',
        },
      ],
    });
  });

  it('test regional service principals use per-service consolidated condition-based policy', () => {
    const regionalStack = new cdk.Stack();
    new Bucket(regionalStack, 'BucketRegionalCondition', {
      encryptionType: BucketEncryptionType.SSE_KMS,
      awsPrincipalAccesses: [
        {
          name: 'Macie',
          principal: 'macie.ap-southeast-4.amazonaws.com',
          accessType: BucketAccessType.READWRITE,
        },
        {
          name: 'Guardduty',
          principal: 'guardduty.ap-southeast-4.amazonaws.com',
          accessType: BucketAccessType.READWRITE,
        },
      ],
      s3BucketName: 'test-regional-condition',
      serverAccessLogsBucketName: 'test-access-logs',
    });
    const template = cdk.assertions.Template.fromStack(regionalStack);
    // Separate consolidated statement per service
    template.hasResourceProperties('AWS::KMS::Key', {
      KeyPolicy: {
        Statement: cdk.assertions.Match.arrayWith([
          cdk.assertions.Match.objectLike({
            Sid: 'Allow macie regional services to use the encryption key',
            Principal: '*',
            Condition: { StringEquals: { 'aws:PrincipalServiceName': ['macie.ap-southeast-4.amazonaws.com'] } },
          }),
          cdk.assertions.Match.objectLike({
            Sid: 'Allow guardduty regional services to use the encryption key',
            Principal: '*',
            Condition: { StringEquals: { 'aws:PrincipalServiceName': ['guardduty.ap-southeast-4.amazonaws.com'] } },
          }),
        ]),
      },
    });
    // Should NOT have explicit ServicePrincipal for regional principals
    template.hasResourceProperties('AWS::KMS::Key', {
      KeyPolicy: {
        Statement: cdk.assertions.Match.not(
          cdk.assertions.Match.arrayWith([
            cdk.assertions.Match.objectLike({
              Principal: { Service: 'macie.ap-southeast-4.amazonaws.com' },
            }),
          ]),
        ),
      },
    });
  });

  it('test non-regional principal gets KMS policy via CDK grants', () => {
    const nonRegionalStack = new cdk.Stack();
    new Bucket(nonRegionalStack, 'BucketNonRegional', {
      encryptionType: BucketEncryptionType.SSE_KMS,
      awsPrincipalAccesses: [
        { name: 'Macie', principal: 'macie.amazonaws.com', accessType: BucketAccessType.READONLY },
      ],
      s3BucketName: 'test-non-regional',
      serverAccessLogsBucketName: 'test-access-logs',
    });
    const template = cdk.assertions.Template.fromStack(nonRegionalStack);
    // Non-regional principals use CDK grant methods which add KMS statements
    template.hasResourceProperties('AWS::KMS::Key', {
      KeyPolicy: {
        Statement: cdk.assertions.Match.arrayWith([
          cdk.assertions.Match.objectLike({
            Action: ['kms:Decrypt', 'kms:DescribeKey'],
            Principal: { Service: 'macie.amazonaws.com' },
          }),
        ]),
      },
    });
  });

  it('test bucket policy has explicit DependsOn on the bucket resource to prevent cfn race condition', () => {
    const dependencyStack = new cdk.Stack();
    new Bucket(dependencyStack, 'BucketWithPolicyDependency', {
      encryptionType: BucketEncryptionType.SSE_KMS,
      s3BucketName: 'test-policy-dependency',
      kmsKey: new cdk.aws_kms.Key(dependencyStack, 'DepKey', {}),
      serverAccessLogsBucketName: 'test-access-logs',
    });
    const template = cdk.assertions.Template.fromStack(dependencyStack);
    // The BucketPolicy resource must have an explicit DependsOn the Bucket resource
    // to prevent CloudFormation race condition (aws/aws-cdk#28659)
    const bucketPolicies = template.findResources('AWS::S3::BucketPolicy');
    const bucketPolicyLogicalIds = Object.keys(bucketPolicies);
    expect(bucketPolicyLogicalIds.length).toBeGreaterThan(0);
    for (const logicalId of bucketPolicyLogicalIds) {
      const resource = bucketPolicies[logicalId];
      expect(resource.DependsOn).toBeDefined();
      // DependsOn should include at least one S3 Bucket resource
      const dependsOn = Array.isArray(resource.DependsOn) ? resource.DependsOn : [resource.DependsOn];
      const buckets = template.findResources('AWS::S3::Bucket');
      const bucketLogicalIds = Object.keys(buckets);
      const hasBucketDependency = dependsOn.some((dep: string) => bucketLogicalIds.includes(dep));
      expect(hasBucketDependency).toBe(true);
    }
  });

  snapShotTest(testNamePrefix, stack);
});

/**
 * Lifecycle rule rendering tests.
 *
 * Regression coverage for the case where a lifecycle rule only removes expired
 * object delete markers (issue #3672). Such a rule does not provide
 * abortIncompleteMultipartUploadAfter, noncurrentVersionExpiration or
 * expiration, and must not crash the construct nor inject unintended values.
 */
describe('Bucket lifecycle rules', () => {
  it('renders an expired-object-delete-marker-only rule without abort or expiration values', () => {
    const lifecycleStack = new cdk.Stack();
    new Bucket(lifecycleStack, 'BucketDeleteMarkerOnly', {
      encryptionType: BucketEncryptionType.SSE_KMS,
      s3BucketName: 'delete-marker-only',
      serverAccessLogsBucketName: 'access-logs',
      s3LifeCycleRules: [
        {
          id: 'DeleteMarkerOnly',
          enabled: true,
          expiredObjectDeleteMarker: true,
          transitions: [],
          noncurrentVersionTransitions: [],
        },
      ],
    });

    const template = cdk.assertions.Template.fromStack(lifecycleStack);
    template.hasResourceProperties('AWS::S3::Bucket', {
      LifecycleConfiguration: {
        Rules: cdk.assertions.Match.arrayWith([
          cdk.assertions.Match.objectLike({
            ExpiredObjectDeleteMarker: true,
            Status: 'Enabled',
            // Must not inject defaulted day-based values for a delete-marker rule
            AbortIncompleteMultipartUpload: cdk.assertions.Match.absent(),
            NoncurrentVersionExpiration: cdk.assertions.Match.absent(),
            ExpirationInDays: cdk.assertions.Match.absent(),
          }),
        ]),
      },
    });
  });

  it('does not throw when abort and noncurrent version expiration are omitted', () => {
    const lifecycleStack = new cdk.Stack();
    function createBucket() {
      new Bucket(lifecycleStack, 'BucketNoAbort', {
        encryptionType: BucketEncryptionType.SSE_KMS,
        s3BucketName: 'no-abort',
        serverAccessLogsBucketName: 'access-logs',
        s3LifeCycleRules: [
          {
            id: 'DeleteMarkerOnly',
            enabled: true,
            expiredObjectDeleteMarker: true,
            transitions: [],
            noncurrentVersionTransitions: [],
          },
        ],
      });
    }
    expect(createBucket).not.toThrow();
  });

  it('renders abort and noncurrent version expiration when provided', () => {
    const lifecycleStack = new cdk.Stack();
    new Bucket(lifecycleStack, 'BucketWithAbort', {
      encryptionType: BucketEncryptionType.SSE_KMS,
      s3BucketName: 'with-abort',
      serverAccessLogsBucketName: 'access-logs',
      s3LifeCycleRules: [
        {
          id: 'Full',
          enabled: true,
          abortIncompleteMultipartUploadAfter: 7,
          expiration: 365,
          expiredObjectDeleteMarker: false,
          noncurrentVersionExpiration: 1,
          transitions: [],
          noncurrentVersionTransitions: [],
        },
      ],
    });

    const template = cdk.assertions.Template.fromStack(lifecycleStack);
    template.hasResourceProperties('AWS::S3::Bucket', {
      LifecycleConfiguration: {
        Rules: cdk.assertions.Match.arrayWith([
          cdk.assertions.Match.objectLike({
            AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 },
            ExpirationInDays: 365,
            NoncurrentVersionExpiration: { NoncurrentDays: 1 },
            ExpiredObjectDeleteMarker: false,
            Status: 'Enabled',
          }),
        ]),
      },
    });
  });

  it('renders the mixed rule set from issue #3672 (expiration rule plus delete-marker rule)', () => {
    const lifecycleStack = new cdk.Stack();
    new Bucket(lifecycleStack, 'BucketMixedRules', {
      encryptionType: BucketEncryptionType.SSE_KMS,
      s3BucketName: 'mixed-rules',
      serverAccessLogsBucketName: 'access-logs',
      s3LifeCycleRules: [
        {
          id: 'Expire',
          enabled: true,
          abortIncompleteMultipartUploadAfter: 7,
          expiration: 365,
          expiredObjectDeleteMarker: false,
          noncurrentVersionExpiration: 1,
          transitions: [],
          noncurrentVersionTransitions: [],
        },
        {
          id: 'DeleteMarker',
          enabled: true,
          expiredObjectDeleteMarker: true,
          transitions: [],
          noncurrentVersionTransitions: [],
        },
      ],
    });

    const template = cdk.assertions.Template.fromStack(lifecycleStack);
    template.hasResourceProperties('AWS::S3::Bucket', {
      LifecycleConfiguration: {
        Rules: cdk.assertions.Match.arrayWith([
          cdk.assertions.Match.objectLike({
            ExpirationInDays: 365,
            AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 },
            ExpiredObjectDeleteMarker: false,
          }),
          cdk.assertions.Match.objectLike({
            ExpiredObjectDeleteMarker: true,
            AbortIncompleteMultipartUpload: cdk.assertions.Match.absent(),
            ExpirationInDays: cdk.assertions.Match.absent(),
          }),
        ]),
      },
    });
  });
});
