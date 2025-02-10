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
import {
  CloudWatchLogsClient,
  PutRetentionPolicyCommand,
  PutSubscriptionFilterCommand,
  DeleteSubscriptionFilterCommand,
  DescribeSubscriptionFiltersCommand,
  AssociateKmsKeyCommand,
  DescribeLogGroupsCommand,
  SubscriptionFilter,
} from '@aws-sdk/client-cloudwatch-logs';
import { describe, beforeEach, expect, test } from '@jest/globals';
import {
  handler,
  updateRetentionPolicy,
  updateSubscriptionPolicy,
  updateKmsKey,
  hasAcceleratorSubscriptionFilter,
  getExistingSubscriptionFilters,
  isLogGroupExcluded,
  cloudwatchExclusionProcessedItem,
  deleteSubscription,
} from '../index';
import { AcceleratorMockClient } from '../../../../test/unit-test/common/resources';
import { ScheduledEvent } from '@aws-accelerator/utils/lib/common-types';

const logsClient = AcceleratorMockClient(CloudWatchLogsClient);
const OLD_ENV = process.env;

describe('CloudWatch Logs Handler', () => {
  beforeEach(() => {
    logsClient.reset();
    process.env = {
      ...OLD_ENV,
      AcceleratorPrefix: 'AWSAccelerator',
      LogSubscriptionRole: 'arn:aws:iam::123456789012:role/LogSubscriptionRole',
      LogDestination: 'arn:aws:logs:us-west-2:123456789012:destination:MyDestination',
      LogRetention: '30',
      LogKmsKeyArn: 'arn:aws:kms:us-west-2:123456789012:key/1234abcd-12ab-34cd-56ef-1234567890ab',
      SOLUTION_ID: 'SO0199',
      LogSubscriptionType: 'LOG_GROUP',
    };
  });
  afterEach(() => {
    process.env = OLD_ENV;
  });

  test('handler should process log group', async () => {
    const event: ScheduledEvent = {
      id: 'id',
      version: 'version',
      time: 'time',
      region: 'region',
      resources: ['resources'],
      account: 'account',
      source: 'source',
      'detail-type': 'Scheduled Event',
      detail: {
        requestParameters: {
          logGroupName: '/aws/lambda/my-function',
        },
        userIdentity: {
          sessionContext: {
            sessionIssuer: {
              userName: 'not-cdk-accel-cfn-exec',
            },
          },
        },
      },
    };

    logsClient.on(DescribeLogGroupsCommand).resolves({ logGroups: [{ logGroupName: '/aws/lambda/my-function' }] });
    logsClient.on(PutRetentionPolicyCommand).resolves({});
    logsClient.on(DescribeSubscriptionFiltersCommand).resolves({ subscriptionFilters: [] });
    logsClient.on(PutSubscriptionFilterCommand).resolves({});
    logsClient.on(AssociateKmsKeyCommand).resolves({});

    await handler(event);

    expect(logsClient.commandCalls(PutRetentionPolicyCommand)).toHaveLength(1);
    expect(logsClient.commandCalls(PutSubscriptionFilterCommand)).toHaveLength(1);
  });

  test('updateRetentionPolicy should set retention policy', async () => {
    const logGroup = { logGroupName: '/aws/lambda/my-function', retentionInDays: 7 };
    await updateRetentionPolicy('30', logGroup);
    expect(logsClient.commandCalls(PutRetentionPolicyCommand)).toHaveLength(1);
  });

  test('updateRetentionPolicy does nothing if retention is already set', async () => {
    const logGroup = { logGroupName: '/aws/lambda/my-function', retentionInDays: 7 };
    await expect(updateRetentionPolicy('7', logGroup)).toBeDefined();
  });

  test('updateRetentionPolicy does nothing if log group belongs to control tower', async () => {
    const logGroup = { logGroupName: 'aws-controltower', retentionInDays: 365 };
    await expect(updateRetentionPolicy('7', logGroup)).toBeDefined();
  });

  test('updateSubscriptionPolicy should set subscription policy', async () => {
    const logGroup = { logGroupName: '/aws/lambda/my-function' };
    const logExclusionSetting = {
      excludeAll: false,
      logGroupNames: ['excluded-log-group'],
      account: '123456789012',
      region: 'us-west-2',
    };

    logsClient.on(DescribeSubscriptionFiltersCommand).resolves({ subscriptionFilters: [] });
    logsClient.on(PutSubscriptionFilterCommand).resolves({});

    await updateSubscriptionPolicy(
      'LOG_GROUP',
      logGroup,
      logExclusionSetting,
      'arn:aws:iam::123456789012:role/LogSubscriptionRole',
      'arn:aws:logs:us-west-2:123456789012:destination:MyDestination',
    );
    expect(logsClient.commandCalls(PutSubscriptionFilterCommand)).toHaveLength(1);
  });

  test('updateSubscriptionPolicy should delete subscription policy for excluded log group', async () => {
    const logGroup = { logGroupName: 'excluded-log-groups' };
    const logExclusionSetting = {
      excludeAll: true,
      logGroupNames: ['excluded-log-group'],
      account: '123456789012',
      region: 'us-west-2',
    };

    logsClient
      .on(DescribeSubscriptionFiltersCommand)
      .resolves({ subscriptionFilters: [{ filterName: logGroup.logGroupName }] });
    logsClient.on(DeleteSubscriptionFilterCommand).resolves({});

    await expect(
      updateSubscriptionPolicy(
        'LOG_GROUP',
        logGroup,
        logExclusionSetting,
        'arn:aws:iam::123456789012:role/LogSubscriptionRole',
        'arn:aws:logs:us-west-2:123456789012:destination:MyDestination',
      ),
    ).toBeDefined();
  });
  test('updateSubscriptionPolicy should do nothing when account level subscription is set', async () => {
    await expect(
      updateSubscriptionPolicy(
        'ACCOUNT',
        {},
        undefined,
        'arn:aws:iam::123456789012:role/LogSubscriptionRole',
        'arn:aws:logs:us-west-2:123456789012:destination:MyDestination',
      ),
    ).toBeDefined();
  });

  test('updateKmsKey should set KMS key', async () => {
    const logGroup = { logGroupName: '/aws/lambda/my-function' };
    const kmsKeyArn = 'arn:aws:kms:us-west-2:123456789012:key/1234abcd-12ab-34cd-56ef-1234567890ab';

    logsClient.on(AssociateKmsKeyCommand).resolves({});

    await updateKmsKey(logGroup, kmsKeyArn);
    expect(logsClient.commandCalls(AssociateKmsKeyCommand)).toHaveLength(1);
  });
  test('updateKmsKey should not set KMS key if there is a key already present', async () => {
    const logGroup = {
      logGroupName: '/aws/lambda/my-function',
      kmsKeyId: 'arn:aws:kms:us-west-2:123456789012:key/1234abcd-12ab-34cd-56ef-1234567890ab',
    };
    await expect(updateKmsKey(logGroup, undefined)).toBeDefined();
  });
  test('updateKmsKey not done if no kms is provided', async () => {
    const logGroup = {
      logGroupName: '/aws/lambda/my-function',
    };
    await expect(updateKmsKey(logGroup, undefined)).toBeDefined();
  });
});

describe('hasAcceleratorSubscriptionFilter', () => {
  test('should return false when no filters are present', async () => {
    const filters: SubscriptionFilter[] = [];
    const logGroupName = '/aws/lambda/my-function';

    const result = await hasAcceleratorSubscriptionFilter(filters, logGroupName);

    expect(result).toBe(false);
  });

  test('should return true when a matching filter is present', async () => {
    const logGroupName = '/aws/lambda/my-function';
    const filters: SubscriptionFilter[] = [
      {
        filterName: logGroupName,
        filterPattern: '',
        destinationArn: 'arn:aws:logs:us-west-2:123456789012:destination:MyDestination',
      },
    ];

    const result = await hasAcceleratorSubscriptionFilter(filters, logGroupName);

    expect(result).toBe(true);
  });

  test('should return false when no matching filter is present', async () => {
    const logGroupName = '/aws/lambda/my-function';
    const filters: SubscriptionFilter[] = [
      {
        filterName: '/aws/lambda/other-function',
        filterPattern: '',
        destinationArn: 'arn:aws:logs:us-west-2:123456789012:destination:MyDestination',
      },
    ];

    const result = await hasAcceleratorSubscriptionFilter(filters, logGroupName);

    expect(result).toBe(false);
  });

  test('should return true when one of multiple filters matches', async () => {
    const logGroupName = '/aws/lambda/my-function';
    const filters: SubscriptionFilter[] = [
      {
        filterName: '/aws/lambda/other-function',
        filterPattern: '',
        destinationArn: 'arn:aws:logs:us-west-2:123456789012:destination:MyDestination',
      },
      {
        filterName: logGroupName,
        filterPattern: '',
        destinationArn: 'arn:aws:logs:us-west-2:123456789012:destination:MyDestination',
      },
      {
        filterName: '/aws/lambda/another-function',
        filterPattern: '',
        destinationArn: 'arn:aws:logs:us-west-2:123456789012:destination:MyDestination',
      },
    ];

    const result = await hasAcceleratorSubscriptionFilter(filters, logGroupName);

    expect(result).toBe(true);
  });
});

describe('getExistingSubscriptionFilters', () => {
  beforeEach(() => {
    logsClient.reset();
  });

  test('should return an empty array when no subscription filters exist', async () => {
    const logGroupName = '/aws/lambda/my-function';

    logsClient.on(DescribeSubscriptionFiltersCommand).resolves({
      subscriptionFilters: [],
    });

    const result = await getExistingSubscriptionFilters(logGroupName);

    expect(result).toEqual([]);
    expect(logsClient.calls()).toHaveLength(1);
  });

  test('should return all subscription filters when they exist', async () => {
    const logGroupName = '/aws/lambda/my-function';
    const mockFilters: SubscriptionFilter[] = [
      {
        filterName: 'filter1',
        filterPattern: '',
        logGroupName,
        destinationArn: 'arn:aws:logs:us-west-2:123456789012:destination:Dest1',
      },
      {
        filterName: 'filter2',
        filterPattern: '',
        logGroupName,
        destinationArn: 'arn:aws:logs:us-west-2:123456789012:destination:Dest2',
      },
    ];

    logsClient.on(DescribeSubscriptionFiltersCommand).resolves({
      subscriptionFilters: mockFilters,
    });

    const result = await getExistingSubscriptionFilters(logGroupName);

    expect(result).toEqual(mockFilters);
    expect(logsClient.calls()).toHaveLength(1);
  });

  test('should handle pagination correctly', async () => {
    const logGroupName = '/aws/lambda/my-function';
    const mockFilters1: SubscriptionFilter[] = [
      {
        filterName: 'filter1',
        filterPattern: '',
        logGroupName,
        destinationArn: 'arn:aws:logs:us-west-2:123456789012:destination:Dest1',
      },
    ];
    const mockFilters2: SubscriptionFilter[] = [
      {
        filterName: 'filter2',
        filterPattern: '',
        logGroupName,
        destinationArn: 'arn:aws:logs:us-west-2:123456789012:destination:Dest2',
      },
    ];

    logsClient
      .on(DescribeSubscriptionFiltersCommand)
      .resolvesOnce({
        subscriptionFilters: mockFilters1,
        nextToken: 'nextPageToken',
      })
      .resolvesOnce({
        subscriptionFilters: mockFilters2,
      });

    const result = await getExistingSubscriptionFilters(logGroupName);

    expect(result).toEqual([...mockFilters1, ...mockFilters2]);
    expect(logsClient.calls()).toHaveLength(2);
  });

  test('should handle errors gracefully', async () => {
    const logGroupName = '/aws/lambda/my-function';

    logsClient.on(DescribeSubscriptionFiltersCommand).rejects(new Error('API Error'));

    await expect(getExistingSubscriptionFilters(logGroupName)).rejects.toThrow('API Error');
  });
});

describe('isLogGroupExcluded', () => {
  test('should return true when excludeAll is true', async () => {
    const logGroupName = '/aws/lambda/my-function';
    const exclusionSetting: cloudwatchExclusionProcessedItem = {
      account: '123456789012',
      region: 'us-west-2',
      excludeAll: true,
    };

    const result = await isLogGroupExcluded(logGroupName, exclusionSetting);

    expect(result).toBe(true);
  });

  test('should return false when excludeAll is false and no logGroupNames are specified', async () => {
    const logGroupName = '/aws/lambda/my-function';
    const exclusionSetting: cloudwatchExclusionProcessedItem = {
      account: '123456789012',
      region: 'us-west-2',
      excludeAll: false,
    };

    const result = await isLogGroupExcluded(logGroupName, exclusionSetting);

    expect(result).toBe(false);
  });

  test('should return true when log group name matches exactly', async () => {
    const logGroupName = '/aws/lambda/my-function';
    const exclusionSetting: cloudwatchExclusionProcessedItem = {
      account: '123456789012',
      region: 'us-west-2',
      excludeAll: false,
      logGroupNames: ['/aws/lambda/my-function'],
    };

    const result = await isLogGroupExcluded(logGroupName, exclusionSetting);

    expect(result).toBe(true);
  });

  test('should return true when log group name matches wildcard', async () => {
    const logGroupName = '/aws/lambda/my-function';
    const exclusionSetting: cloudwatchExclusionProcessedItem = {
      account: '123456789012',
      region: 'us-west-2',
      excludeAll: false,
      logGroupNames: ['/aws/lambda/*'],
    };

    const result = await isLogGroupExcluded(logGroupName, exclusionSetting);

    expect(result).toBe(true);
  });

  test('should return false when log group name does not match any exclusion', async () => {
    const logGroupName = '/aws/lambda/my-function';
    const exclusionSetting: cloudwatchExclusionProcessedItem = {
      account: '123456789012',
      region: 'us-west-2',
      excludeAll: false,
      logGroupNames: ['/aws/ec2/*', '/aws/ecs/*'],
    };

    const result = await isLogGroupExcluded(logGroupName, exclusionSetting);

    expect(result).toBe(false);
  });

  test('should return true when log group name matches one of multiple patterns', async () => {
    const logGroupName = '/aws/lambda/my-function';
    const exclusionSetting: cloudwatchExclusionProcessedItem = {
      account: '123456789012',
      region: 'us-west-2',
      excludeAll: false,
      logGroupNames: ['/aws/ec2/*', '/aws/lambda/*', '/aws/ecs/*'],
    };

    const result = await isLogGroupExcluded(logGroupName, exclusionSetting);

    expect(result).toBe(true);
  });
});

// Mock console.warn
const consoleWarnMock = jest.spyOn(console, 'warn').mockImplementation();

describe('deleteSubscription', () => {
  beforeEach(() => {
    logsClient.reset();
    consoleWarnMock.mockClear();
  });

  test('should successfully delete subscription filter', async () => {
    const logGroupName = '/aws/lambda/my-function';

    logsClient.on(DeleteSubscriptionFilterCommand).resolves({});

    await deleteSubscription(logGroupName);

    expect(logsClient.calls()).toHaveLength(1);
  });

  test('should handle errors and log a warning', async () => {
    const logGroupName = '/aws/lambda/my-function';
    const error = new Error('Failed to delete subscription filter');

    logsClient.on(DeleteSubscriptionFilterCommand).rejects(error);

    await deleteSubscription(logGroupName);

    expect(logsClient.calls()).toHaveLength(1);
    expect(logsClient.call(0).args[0].input).toEqual({
      logGroupName: logGroupName,
      filterName: logGroupName,
    });
    expect(consoleWarnMock).toHaveBeenCalledWith(
      `Failed to delete subscription filter ${logGroupName} for log group ${logGroupName}`,
    );
  });
});

describe('CloudWatch Logs Handler for other cases', () => {
  beforeEach(() => {
    jest.resetModules();
    logsClient.reset();
    process.env = {
      ...OLD_ENV,
      AcceleratorPrefix: 'AWSAccelerator',
      LogSubscriptionRole: 'arn:aws:iam::123456789012:role/LogSubscriptionRole',
      LogDestination: 'arn:aws:logs:us-west-2:123456789012:destination:MyDestination',
      LogRetention: '30',
      LogKmsKeyArn: 'arn:aws:kms:us-west-2:123456789012:key/1234abcd-12ab-34cd-56ef-1234567890ab',
      SOLUTION_ID: 'SO0199',
      LogSubscriptionType: 'LOGGROUP',
      LogExclusion:
        '{"excludeAll":false,"logGroupNames":["excluded-log-group"], "account": "account1", "region":"region"}',
    };
  });
  afterEach(() => {
    process.env = OLD_ENV;
  });
  test('handler should not process log group with solution user', async () => {
    const event: ScheduledEvent = {
      id: 'id',
      version: 'version',
      time: 'time',
      region: 'region',
      resources: ['resources'],
      account: 'account',
      source: 'source',
      'detail-type': 'Scheduled Event',
      detail: {
        requestParameters: {
          logGroupName: '/aws/lambda/my-function',
        },
        userIdentity: {
          sessionContext: {
            sessionIssuer: {
              userName: 'cdk-accel-cfn-exec',
            },
          },
        },
      },
    };
    logsClient.on(DescribeLogGroupsCommand).resolves({ logGroups: [{ logGroupName: '/aws/lambda/my-function' }] });

    await expect(handler(event)).toBeDefined();
  });
});
