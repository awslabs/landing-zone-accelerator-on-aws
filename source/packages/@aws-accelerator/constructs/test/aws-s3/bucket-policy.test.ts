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
import { Template } from 'aws-cdk-lib/assertions';
import { BucketPolicy } from '@aws-accelerator/constructs';
import { snapShotTest } from '../snapshot-test';
import { AcceleratorImportedBucketType } from '@aws-accelerator/utils';
import * as fs from 'fs';

const testNamePrefix = 'Construct(ValidateBucketKmsEncryption): ';

const policiesPath = `${__dirname}/../../lib/aws-s3/put-bucket-policy/dist/bucket-policy`;
if (fs.existsSync(policiesPath)) {
  fs.rmSync(policiesPath, { recursive: true });
}

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new BucketPolicy(stack, 'ValidateBucketKmsEncryption', {
  applyAcceleratorManagedPolicy: true,
  bucketType: AcceleratorImportedBucketType.CENTRAL_LOGS_BUCKET,
  bucket: new cdk.aws_s3.Bucket(stack, 'Bucket'),
  bucketPolicyFilePaths: [
    `${__dirname}/../../../accelerator/test/configs/snapshot-only/bucket-policies/central-log-bucket.json`,
  ],
  principalOrgIdCondition: {
    Service: 'macie.amazonaws.com',
  },
  awsPrincipalAccesses: [{ name: 'macie', accessType: 'RW', principal: 'macie.amazonaws.com' }],
  organizationId: 'o-org-id',
  customResourceLambdaCloudWatchLogKmsKey: new cdk.aws_kms.Key(stack, 'CloudWatchKeyKmsEncryption', {}),
  customResourceLambdaEnvironmentEncryptionKmsKey: new cdk.aws_kms.Key(stack, 'LambdaKeyKmsEncryption', {}),
  customResourceLambdaLogRetentionInDays: 365,
});

const stackB = new cdk.Stack();

new BucketPolicy(stackB, 'ValidateBucketKmsEncryption', {
  applyAcceleratorManagedPolicy: true,
  bucketType: AcceleratorImportedBucketType.CENTRAL_LOGS_BUCKET,
  bucket: new cdk.aws_s3.Bucket(stackB, 'Bucket'),
  bucketPolicyFilePaths: [
    `${__dirname}/../../../accelerator/test/configs/snapshot-only/bucket-policies/central-log-bucket.json`,
  ],
  principalOrgIdCondition: {
    Service: 'macie.amazonaws.com',
  },
  awsPrincipalAccesses: [{ name: 'macie', accessType: 'RW', principal: 'macie.amazonaws.com' }],
  organizationId: 'o-org-id',
  customResourceLambdaCloudWatchLogKmsKey: new cdk.aws_kms.Key(stackB, 'CloudWatchKeyKmsEncryption', {}),
  customResourceLambdaEnvironmentEncryptionKmsKey: new cdk.aws_kms.Key(stackB, 'LambdaKeyKmsEncryption', {}),
  customResourceLambdaLogRetentionInDays: 365,
});

new BucketPolicy(stackB, 'ImportedElbLogBucketPolicy', {
  applyAcceleratorManagedPolicy: true,
  bucketType: AcceleratorImportedBucketType.ELB_LOGS_BUCKET,
  bucket: new cdk.aws_s3.Bucket(stackB, 'Bucket2'),
  bucketPolicyFilePaths: [
    `${__dirname}/../../../accelerator/test/configs/snapshot-only/bucket-policies/elb-logs-bucket.json`,
  ],
  principalOrgIdCondition: {
    Service: 'macie.amazonaws.com',
  },
  awsPrincipalAccesses: [{ name: 'macie', accessType: 'RW', principal: 'macie.amazonaws.com' }],
  organizationId: 'o-org-id',
  customResourceLambdaCloudWatchLogKmsKey: new cdk.aws_kms.Key(stackB, 'CloudWatchKeyKmsEncryption2', {}),
  customResourceLambdaEnvironmentEncryptionKmsKey: new cdk.aws_kms.Key(stackB, 'LambdaKeyKmsEncryption2', {}),
  customResourceLambdaLogRetentionInDays: 365,
});

/**
 * BucketPolicy construct test
 */
describe('BucketPolicy', () => {
  snapShotTest(testNamePrefix, stack);

  test('Lambda Asset should be updated', () => {
    const centralLogLambdaSourceCodeHash = getLambdaCodeHash(Template.fromStack(stack), 'ValidateBucketKmsEncryption');
    const centralLogLambdaSourceCodeHashNew = getLambdaCodeHash(
      Template.fromStack(stackB),
      'ValidateBucketKmsEncryption',
    );
    const elbLambdaSourceCodeHashNew = getLambdaCodeHash(Template.fromStack(stackB), 'ImportedElbLogBucketPolicy');

    expect(centralLogLambdaSourceCodeHash).toBeDefined();
    expect(centralLogLambdaSourceCodeHashNew).toBeDefined();
    expect(elbLambdaSourceCodeHashNew).toBeDefined();
    expect(centralLogLambdaSourceCodeHash).toEqual(centralLogLambdaSourceCodeHashNew);
    expect(elbLambdaSourceCodeHashNew).not.toEqual(centralLogLambdaSourceCodeHash);
    expect(elbLambdaSourceCodeHashNew).not.toEqual(centralLogLambdaSourceCodeHashNew);
  });
});

const getLambdaCodeHash = (template: Template, prefix: string) => {
  const lambdaRefs = template.findResources('AWS::Lambda::Function');
  const lambdaRef = Object.entries(lambdaRefs).find(([key]) => key.startsWith(prefix));

  if (!lambdaRef) return undefined;

  // eslint-disable-next-line
  const sourceCodeHash = (lambdaRef[1] as any)['Properties']['Code']['S3Key'];

  return sourceCodeHash;
};
