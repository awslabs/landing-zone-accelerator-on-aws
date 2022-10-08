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
import {
  QueryLoggingConfig,
  QueryLoggingConfigAssociation,
} from '../../lib/aws-route-53-resolver/query-logging-config';
import { snapShotTest } from '../snapshot-test';

const testNamePrefix = 'Construct(QueryLoggingConfig): ';

const stack = new cdk.Stack();

// Instantiate resources required for construct
const bucket = cdk.aws_s3.Bucket.fromBucketName(stack, 'TestBucket', 'testbucket');
const logGroup = new cdk.aws_logs.LogGroup(stack, 'TestLogGroup');
const kmsKey = new cdk.aws_kms.Key(stack, 'Key', {});

// S3 query logging config
const s3Config = new QueryLoggingConfig(stack, 'S3QueryLoggingTest', {
  destination: bucket,
  kmsKey: kmsKey,
  logRetentionInDays: 3653,
  name: 'S3QueryLoggingTest',
  partition: 'aws',
});

// CloudWatch Logs query logging config
new QueryLoggingConfig(stack, 'CwlQueryLoggingTest', {
  destination: logGroup,
  kmsKey: kmsKey,
  logRetentionInDays: 3653,
  name: 'CwlQueryLoggingTest',
  organizationId: 'o-123test',
  partition: 'aws',
});

// Config association
new QueryLoggingConfigAssociation(stack, 'TestQueryLoggingAssoc', {
  resolverQueryLogConfigId: s3Config.logId,
  vpcId: 'TestVpc',
  kmsKey: kmsKey,
  logRetentionInDays: 3653,
  partition: 'aws-cn',
});

// Test for China region.
const cnStack = new cdk.Stack();
const cnBucket = cdk.aws_s3.Bucket.fromBucketName(cnStack, 'TestBucket', 'testbucket');
const cnLogGroup = new cdk.aws_logs.LogGroup(cnStack, 'TestLogGroup');
const cnKmsKey = new cdk.aws_kms.Key(cnStack, 'Key', {});

const cnS3Config = new QueryLoggingConfig(cnStack, 'S3QueryLoggingTest', {
  destination: cnBucket,
  kmsKey: cnKmsKey,
  logRetentionInDays: 3653,
  name: 'S3QueryLoggingTest',
  partition: 'aws-cn',
});

new QueryLoggingConfig(cnStack, 'CwlQueryLoggingTest', {
  destination: cnLogGroup,
  kmsKey: cnKmsKey,
  logRetentionInDays: 3653,
  name: 'CwlQueryLoggingTest',
  organizationId: 'o-123test',
  partition: 'aws-cn',
});

new QueryLoggingConfigAssociation(cnStack, 'TestQueryLoggingAssoc', {
  resolverQueryLogConfigId: cnS3Config.logId,
  vpcId: 'TestVpc',
  kmsKey: cnKmsKey,
  logRetentionInDays: 3653,
  partition: 'aws-cn',
});

describe('QueryLoggingConfig', () => {
  snapShotTest(testNamePrefix, stack);
  snapShotTest(testNamePrefix, cnStack);
});
