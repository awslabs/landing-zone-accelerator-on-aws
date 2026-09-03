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
import { describe, it } from 'vitest';
import { BucketAccessType } from '@aws-accelerator/utils';
import { Bucket, BucketEncryptionType } from '../../lib/aws-s3/bucket';
import { CentralLogsBucket } from '../../lib/aws-s3/central-logs-bucket';
import { snapShotTest } from '../snapshot-test';

const testNamePrefix = 'Construct(CentralLogsBucket): ';
const organizationId = 'o-1234567890';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new CentralLogsBucket(stack, 'CentralLogsBucket', {
  s3BucketName: `aws-accelerator-central-logs-${stack.account}-${stack.region}`,
  serverAccessLogsBucket: new Bucket(stack, 'AccessLogsBucket', {
    encryptionType: BucketEncryptionType.SSE_S3,
    s3BucketName: `aws-accelerator-s3-access-logs-${stack.account}-${stack.region}`,
    kmsAliasName: 'alias/accelerator/s3-access-logs/s3',
    kmsDescription: 'AWS Accelerator S3 Access Logs Bucket CMK',
  }).getS3Bucket(),
  kmsAliasName: 'alias/accelerator/central-logs/s3',
  kmsDescription: 'AWS Accelerator Central Logs Bucket CMK',
  principalOrgIdCondition: { 'aws:PrincipalOrgID': organizationId },
  orgPrincipals: new cdk.aws_iam.OrganizationPrincipal(organizationId),
  acceleratorPrefix: 'AWSAccelerator',
  crossAccountAccessRoleName: 'AWSAccelerator-CentralBucket-KeyArnParam-Role',
  cmkArnSsmParameterName: '/accelerator/logging/central-bucket/kms/arn',
  managementAccountAccessRole: 'AWSControlTowerExecution',
});

/**
 * CentralLogsBucket construct test
 */
describe('CentralLogsBucket', () => {
  snapShotTest(testNamePrefix, stack);
});

/**
 * Issue #4918: opt-in region service principals must not be emitted as a direct Service principal
 * on the central logs S3 bucket policy (fails CloudFormation validation when the region is not
 * activated). They must be grouped into a single StarPrincipal statement per service scoped by
 * aws:PrincipalServiceName, mirroring the KMS block and Bucket.addConsolidatedRegionalAccess.
 */
describe('CentralLogsBucket regional service principals (#4918)', () => {
  const regionalStack = new cdk.Stack();
  new CentralLogsBucket(regionalStack, 'CentralLogsBucketRegional', {
    s3BucketName: `aws-accelerator-central-logs-${regionalStack.account}-${regionalStack.region}`,
    serverAccessLogsBucket: new Bucket(regionalStack, 'AccessLogsBucketRegional', {
      encryptionType: BucketEncryptionType.SSE_S3,
      s3BucketName: `aws-accelerator-s3-access-logs-${regionalStack.account}-${regionalStack.region}`,
      kmsAliasName: 'alias/accelerator/s3-access-logs/s3',
      kmsDescription: 'AWS Accelerator S3 Access Logs Bucket CMK',
    }).getS3Bucket(),
    kmsAliasName: 'alias/accelerator/central-logs/s3',
    kmsDescription: 'AWS Accelerator Central Logs Bucket CMK',
    principalOrgIdCondition: { 'aws:PrincipalOrgID': organizationId },
    orgPrincipals: new cdk.aws_iam.OrganizationPrincipal(organizationId),
    acceleratorPrefix: 'AWSAccelerator',
    crossAccountAccessRoleName: 'AWSAccelerator-CentralBucket-KeyArnParam-Role',
    cmkArnSsmParameterName: '/accelerator/logging/central-bucket/kms/arn',
    managementAccountAccessRole: 'AWSControlTowerExecution',
    awsPrincipalAccesses: [
      { name: 'Macie', principal: 'macie.amazonaws.com', accessType: BucketAccessType.READWRITE },
      {
        name: 'Macie-ap-southeast-4',
        principal: 'macie.ap-southeast-4.amazonaws.com',
        accessType: BucketAccessType.READWRITE,
      },
      {
        name: 'Guardduty-ap-southeast-4',
        principal: 'guardduty.ap-southeast-4.amazonaws.com',
        accessType: BucketAccessType.READWRITE,
      },
    ],
  });
  const template = cdk.assertions.Template.fromStack(regionalStack);

  // Exact READWRITE action set the consolidated statement must grant (order matches the
  // read-branch then write-branch insertion order in central-logs-bucket.ts). arrayEquals
  // catches a dropped, truncated, or over-broad action set regressing the permission.
  const expectedRegionalReadWriteActions = [
    's3:GetObject*',
    's3:GetBucket*',
    's3:List*',
    's3:PutObject',
    's3:PutObjectLegalHold',
    's3:PutObjectRetention',
    's3:PutObjectTagging',
    's3:PutObjectVersionTagging',
    's3:Abort*',
    's3:DeleteObject*',
  ];

  it('emits a consolidated StarPrincipal statement per regional service scoped by PrincipalServiceName and SourceOrgID', () => {
    template.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: cdk.assertions.Match.arrayWith([
          cdk.assertions.Match.objectLike({
            Sid: 'Allow macie regional services access',
            Principal: '*',
            Action: cdk.assertions.Match.arrayEquals(expectedRegionalReadWriteActions),
            Condition: {
              StringEquals: {
                'aws:PrincipalServiceName': ['macie.ap-southeast-4.amazonaws.com'],
                'aws:SourceOrgID': organizationId,
              },
            },
          }),
          cdk.assertions.Match.objectLike({
            Sid: 'Allow guardduty regional services access',
            Principal: '*',
            Action: cdk.assertions.Match.arrayEquals(expectedRegionalReadWriteActions),
            Condition: {
              StringEquals: {
                'aws:PrincipalServiceName': ['guardduty.ap-southeast-4.amazonaws.com'],
                'aws:SourceOrgID': organizationId,
              },
            },
          }),
        ]),
      },
    });
  });

  it('does NOT emit a direct Service principal for an opt-in region principal', () => {
    template.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
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

  it('still emits a direct Service principal for the non-regional (global) principal', () => {
    template.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: cdk.assertions.Match.arrayWith([
          cdk.assertions.Match.objectLike({
            Sid: 'Allow Macie service access',
            Principal: { Service: 'macie.amazonaws.com' },
          }),
        ]),
      },
    });
  });

  it('accumulates multiple opt-in region principals of the same service into one PrincipalServiceName array', () => {
    const multiStack = new cdk.Stack();
    new CentralLogsBucket(multiStack, 'CentralLogsBucketMulti', {
      s3BucketName: `aws-accelerator-central-logs-${multiStack.account}-${multiStack.region}`,
      serverAccessLogsBucket: new Bucket(multiStack, 'AccessLogsBucketMulti', {
        encryptionType: BucketEncryptionType.SSE_S3,
        s3BucketName: `aws-accelerator-s3-access-logs-${multiStack.account}-${multiStack.region}`,
        kmsAliasName: 'alias/accelerator/s3-access-logs/s3',
        kmsDescription: 'AWS Accelerator S3 Access Logs Bucket CMK',
      }).getS3Bucket(),
      kmsAliasName: 'alias/accelerator/central-logs/s3',
      kmsDescription: 'AWS Accelerator Central Logs Bucket CMK',
      principalOrgIdCondition: { 'aws:PrincipalOrgID': organizationId },
      orgPrincipals: new cdk.aws_iam.OrganizationPrincipal(organizationId),
      acceleratorPrefix: 'AWSAccelerator',
      crossAccountAccessRoleName: 'AWSAccelerator-CentralBucket-KeyArnParam-Role',
      cmkArnSsmParameterName: '/accelerator/logging/central-bucket/kms/arn',
      managementAccountAccessRole: 'AWSControlTowerExecution',
      awsPrincipalAccesses: [
        {
          name: 'Macie-ap-southeast-4',
          principal: 'macie.ap-southeast-4.amazonaws.com',
          accessType: BucketAccessType.READWRITE,
        },
        {
          name: 'Macie-ap-southeast-5',
          principal: 'macie.ap-southeast-5.amazonaws.com',
          accessType: BucketAccessType.READWRITE,
        },
      ],
    });
    // Both same-service regional principals must be consolidated into ONE macie statement's
    // aws:PrincipalServiceName array. A regression that overwrote instead of accumulated
    // (principals = [item.principal]) would drop all but the last region and fail this.
    cdk.assertions.Template.fromStack(multiStack).hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: cdk.assertions.Match.arrayWith([
          cdk.assertions.Match.objectLike({
            Sid: 'Allow macie regional services access',
            Principal: '*',
            Condition: {
              StringEquals: {
                'aws:PrincipalServiceName': cdk.assertions.Match.arrayEquals([
                  'macie.ap-southeast-4.amazonaws.com',
                  'macie.ap-southeast-5.amazonaws.com',
                ]),
                'aws:SourceOrgID': organizationId,
              },
            },
          }),
        ]),
      },
    });
  });
});
