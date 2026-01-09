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
import { describe, it, expect } from 'vitest';
import { TransitGatewayFlowLogs } from '../../lib/aws-ec2/transit-gateway-flow-logs';
import { snapShotTest } from '../snapshot-test';

const testNamePrefix = 'Construct(TransitGatewayFlowLogs): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

// Create KMS key for testing encryption
const kmsKey = new cdk.aws_kms.Key(stack, 'TestKmsKey', {
  description: 'Test KMS key for transit gateway flow logs',
});

/**
 * TransitGatewayFlowLogs construct test
 */
describe('TransitGatewayFlowLogs', () => {
  it('creates flow logs with CloudWatch destination', () => {
    const flowLogs = new TransitGatewayFlowLogs(stack, 'TransitGatewayFlowLogsCloudWatch', {
      transitGatewayId: 'tgw-0123456789abcdef0',
      maxAggregationInterval: 60,
      logDestinationType: 'cloud-watch-logs',
      logDestination: 'arn:aws:logs:us-east-1:123456789012:log-group:test-log-group',
      deliverLogsPermissionArn: 'arn:aws:iam::123456789012:role/flowlogsRole',
      acceleratorPrefix: 'AWSAccelerator',
      tags: [
        { key: 'Name', value: 'test-flow-logs' },
        { key: 'Environment', value: 'test' },
      ],
    });

    expect(flowLogs.flowLogId).toBeDefined();
  });

  it('creates flow logs with S3 destination', () => {
    const flowLogs = new TransitGatewayFlowLogs(stack, 'TransitGatewayFlowLogsS3', {
      transitGatewayId: 'tgw-0123456789abcdef1',
      maxAggregationInterval: 600,
      logFormat:
        '${version} ${account-id} ${interface-id} ${srcaddr} ${dstaddr} ${srcport} ${dstport} ${protocol} ${packets} ${bytes} ${windowstart} ${windowend} ${action} ${flowlogstatus}',
      logDestinationType: 's3',
      bucketArn: 'arn:aws:s3:::test-flow-logs-bucket',
      encryptionKey: kmsKey,
      logRetentionInDays: 30,
      acceleratorPrefix: 'AWSAccelerator',
    });

    expect(flowLogs.flowLogId).toBeDefined();
  });

  it('creates flow logs with minimal configuration', () => {
    const flowLogs = new TransitGatewayFlowLogs(stack, 'TransitGatewayFlowLogsMinimal', {
      transitGatewayId: 'tgw-0123456789abcdef2',
      maxAggregationInterval: 60,
      logDestinationType: 'cloud-watch-logs',
      acceleratorPrefix: 'AWSAccelerator',
    });

    expect(flowLogs.flowLogId).toBeDefined();
  });

  snapShotTest(testNamePrefix, stack);
});

/**
 * TransitGatewayFlowLogs static method test
 */
describe('TransitGatewayFlowLogs.createCloudWatchLogsDestination', () => {
  it('creates CloudWatch logs destination without encryption', () => {
    const result = TransitGatewayFlowLogs.createCloudWatchLogsDestination(stack, 'TestCloudWatchDestination', {
      transitGatewayName: 'test-tgw',
      logRetentionInDays: 14,
      acceleratorPrefix: 'AWSAccelerator',
    });

    expect(result.logGroup).toBeDefined();
    expect(result.role).toBeDefined();
    // CDK tokens are used for log group names, so we check if it's defined rather than exact value
    expect(result.logGroup.logGroupName).toBeDefined();
  });

  it('creates CloudWatch logs destination with encryption', () => {
    const result = TransitGatewayFlowLogs.createCloudWatchLogsDestination(stack, 'TestCloudWatchDestinationEncrypted', {
      transitGatewayName: 'test-tgw-encrypted',
      logRetentionInDays: 90,
      encryptionKey: kmsKey,
      acceleratorPrefix: 'AWSAccelerator',
    });

    expect(result.logGroup).toBeDefined();
    expect(result.role).toBeDefined();
    // CDK tokens are used for log group names, so we check if it's defined rather than exact value
    expect(result.logGroup.logGroupName).toBeDefined();
  });

  it('creates CloudWatch logs destination with different retention periods', () => {
    const result = TransitGatewayFlowLogs.createCloudWatchLogsDestination(stack, 'TestCloudWatchDestinationRetention', {
      transitGatewayName: 'test-tgw-retention',
      logRetentionInDays: 365,
      acceleratorPrefix: 'AWSAccelerator',
    });

    expect(result.logGroup).toBeDefined();
    expect(result.role).toBeDefined();
  });

  snapShotTest('Construct(TransitGatewayFlowLogsCloudWatchDestination): ', stack);
});
