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
import { ReportDefinition } from '../../lib/aws-cur/report-definition';
import { snapShotTest } from '../snapshot-test';

const testNamePrefix = 'Construct(ReportDefinition): ';

const app = new cdk.App();

// Create stack for native Cfn construct
const nativeEnv = { account: '333333333333', region: 'us-east-1' };
const nativeStack = new cdk.Stack(app, 'NativeStack', { env: nativeEnv });
const nativeBucket = new cdk.aws_s3.Bucket(nativeStack, 'TestBucket');
const nativeKey = new cdk.aws_kms.Key(nativeStack, 'NativeStack', {});

// Create stack for custom Cfn construct
const customEnv = { account: '333333333333', region: 'us-west-1' };
const customStack = new cdk.Stack(app, 'CustomStack', { env: customEnv });
const customBucket = new cdk.aws_s3.Bucket(customStack, 'TestBucket');
const customKey = new cdk.aws_kms.Key(customStack, 'CustomKey', {});

// Create report definitions for each stack
new ReportDefinition(nativeStack, 'TestReportDefinition', {
  compression: 'Parquet',
  format: 'Parquet',
  refreshClosedReports: true,
  reportName: 'Test',
  reportVersioning: 'OVERWRITE_REPORT',
  s3Bucket: nativeBucket,
  s3Prefix: 'test',
  s3Region: cdk.Stack.of(nativeStack).region,
  timeUnit: 'DAILY',
  kmsKey: nativeKey,
  logRetentionInDays: 3653,
  partition: 'aws',
});

new ReportDefinition(customStack, 'TestReportDefinition', {
  compression: 'Parquet',
  format: 'Parquet',
  refreshClosedReports: true,
  reportName: 'Test',
  reportVersioning: 'OVERWRITE_REPORT',
  s3Bucket: customBucket,
  s3Prefix: 'test',
  s3Region: cdk.Stack.of(customStack).region,
  timeUnit: 'DAILY',
  kmsKey: customKey,
  logRetentionInDays: 3653,
  partition: 'aws',
});

/**
 * ReportDefinition construct test
 */
describe('ReportDefinition', () => {
  snapShotTest(testNamePrefix, nativeStack);
  snapShotTest(testNamePrefix, customStack);
});
