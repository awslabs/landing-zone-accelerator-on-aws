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
  // updateRetentionPolicy,
  updateSubscriptionPolicy,
  updateKmsKey,
  hasAcceleratorSubscriptionFilter,
  getExistingSubscriptionFilters,
  isLogGroupExcluded,
  cloudwatchExclusionProcessedItem,
  deleteSubscription,
} from '../index';
import { AcceleratorMockClient } from '../../../../test/unit-test/common/resources';
// import { SQSEvent } from '@aws-accelerator/utils/lib/common-types';

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

  test('handler should process SQS messages', async () => {
    const sqsEvent = {
      Records: [
        {
          messageId: '19dd0b57-b21e-4ac1-bd88-01bbb068cb78',
          receiptHandle: 'MessageReceiptHandle',
          body: JSON.stringify({
            requestParameters: {
              logGroupName: '/aws/lambda/my-function',
            },
          }),
          attributes: {
            ApproximateReceiveCount: '1',
            SentTimestamp: '1523232000000',
            SenderId: '123456789012',
            ApproximateFirstReceiveTimestamp: '1523232000001',
          },
          messageAttributes: {},
          md5OfBody: 'md5',
          eventSource: 'aws:sqs',
          eventSourceARN: 'arn:aws:sqs:us-east-1:123456789012:MyQueue',
          awsRegion: 'us-east-1',
        },
      ],
    };

    logsClient.on(DescribeLogGroupsCommand).resolves({ logGroups: [{ logGroupName: '/aws/lambda/my-function' }] });
    logsClient.on(PutRetentionPolicyCommand).resolves({});
    logsClient.on(DescribeSubscriptionFiltersCommand).resolves({ subscriptionFilters: [] });
    logsClient.on(PutSubscriptionFilterCommand).resolves({});
    logsClient.on(AssociateKmsKeyCommand).resolves({});

    await handler(sqsEvent);

    expect(logsClient.commandCalls(PutRetentionPolicyCommand)).toHaveLength(1);
    expect(logsClient.commandCalls(PutSubscriptionFilterCommand)).toHaveLength(1);
  });

  test('handler should process multiple SQS messages', async () => {
    const sqsEvent = {
      Records: [
        {
          messageId: '1',
          receiptHandle: 'handle1',
          body: JSON.stringify({
            requestParameters: {
              logGroupName: '/aws/lambda/function1',
            },
          }),
          attributes: {
            ApproximateReceiveCount: '1',
            SentTimestamp: '1523232000000',
            SenderId: '123456789012',
            ApproximateFirstReceiveTimestamp: '1523232000001',
          },
          messageAttributes: {},
          md5OfBody: 'md5',
          eventSource: 'aws:sqs',
          eventSourceARN: 'arn:aws:sqs:us-east-1:123456789012:MyQueue',
          awsRegion: 'us-east-1',
        },
        {
          messageId: '2',
          receiptHandle: 'handle2',
          body: JSON.stringify({
            requestParameters: {
              logGroupName: 'aws-controltower',
            },
          }),
          attributes: {
            ApproximateReceiveCount: '1',
            SentTimestamp: '1523232000000',
            SenderId: '123456789012',
            ApproximateFirstReceiveTimestamp: '1523232000001',
          },
          messageAttributes: {},
          md5OfBody: 'md5',
          eventSource: 'aws:sqs',
          eventSourceARN: 'arn:aws:sqs:us-east-1:123456789012:MyQueue',
          awsRegion: 'us-east-1',
        },
      ],
    };

    logsClient
      .on(DescribeLogGroupsCommand, { logGroupNamePrefix: '/aws/lambda/function1' })
      .resolves({ logGroups: [{ logGroupName: '/aws/lambda/function1', retentionInDays: 30 }] })
      .on(DescribeLogGroupsCommand, { logGroupNamePrefix: 'aws-controltower' })
      .resolves({ logGroups: [{ logGroupName: 'aws-controltower1', retentionInDays: 365 }] });
    logsClient.on(PutRetentionPolicyCommand).resolves({});
    logsClient.on(DescribeSubscriptionFiltersCommand).resolves({ subscriptionFilters: [] });
    logsClient.on(PutSubscriptionFilterCommand).resolves({});
    logsClient.on(AssociateKmsKeyCommand).resolves({});

    await expect(handler(sqsEvent)).toBeDefined();
  });

  test('handler should handle SQS message processing errors', async () => {
    const sqsEvent = {
      Records: [
        {
          messageId: '1',
          receiptHandle: 'handle1',
          body: JSON.stringify({
            requestParameters: {
              logGroupName: '/aws/lambda/my-function',
            },
          }),
          attributes: {
            ApproximateReceiveCount: '1',
            SentTimestamp: '1523232000000',
            SenderId: '123456789012',
            ApproximateFirstReceiveTimestamp: '1523232000001',
          },
          messageAttributes: {},
          md5OfBody: 'md5',
          eventSource: 'aws:sqs',
          eventSourceARN: 'arn:aws:sqs:us-east-1:123456789012:MyQueue',
          awsRegion: 'us-east-1',
        },
      ],
    };

    logsClient.on(DescribeLogGroupsCommand).rejects(new Error('API Error'));

    await expect(handler(sqsEvent)).rejects.toThrow('API Error');
  });

  test('handler should handle invalid SQS message body', async () => {
    const sqsEvent = {
      Records: [
        {
          messageId: '1',
          receiptHandle: 'handle1',
          body: 'invalid JSON',
          attributes: {
            ApproximateReceiveCount: '1',
            SentTimestamp: '1523232000000',
            SenderId: '123456789012',
            ApproximateFirstReceiveTimestamp: '1523232000001',
          },
          messageAttributes: {},
          md5OfBody: 'md5',
          eventSource: 'aws:sqs',
          eventSourceARN: 'arn:aws:sqs:us-east-1:123456789012:MyQueue',
          awsRegion: 'us-east-1',
        },
      ],
    };

    await expect(handler(sqsEvent)).rejects.toThrow();
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

// Mock console.warn console.info
const consoleWarnMock = jest.spyOn(console, 'warn').mockImplementation();
const consoleInfoMock = jest.spyOn(console, 'info').mockImplementation();

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

describe('updateSubscriptionPolicy', () => {
  beforeEach(() => {
    logsClient.reset();
  });

  test('should skip when subscription type is ACCOUNT', async () => {
    const logGroup = { logGroupName: '/aws/lambda/my-function' };
    const logExclusionSetting = {
      excludeAll: false,
      logGroupNames: [],
      account: '123456789012',
      region: 'us-west-2',
    };

    await updateSubscriptionPolicy(
      'ACCOUNT',
      logGroup,
      logExclusionSetting,
      'arn:aws:iam::123456789012:role/LogSubscriptionRole',
      'arn:aws:logs:us-west-2:123456789012:destination:MyDestination',
    );

    expect(logsClient.commandCalls(DescribeSubscriptionFiltersCommand)).toHaveLength(0);
    expect(logsClient.commandCalls(PutSubscriptionFilterCommand)).toHaveLength(0);
    expect(logsClient.commandCalls(DeleteSubscriptionFilterCommand)).toHaveLength(0);
  });

  test('should create subscription when log group is not excluded and has no existing filter', async () => {
    const logGroup = { logGroupName: '/aws/lambda/my-function' };
    const logExclusionSetting = {
      excludeAll: false,
      logGroupNames: [],
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
    expect(logsClient.commandCalls(DeleteSubscriptionFilterCommand)).toHaveLength(0);
  });

  test('should delete subscription when log group is excluded and has existing filter', async () => {
    const logGroup = { logGroupName: '/aws/lambda/excluded-function' };
    const logExclusionSetting = {
      excludeAll: false,
      logGroupNames: ['/aws/lambda/excluded-function'],
      account: '123456789012',
      region: 'us-west-2',
    };

    logsClient
      .on(DescribeSubscriptionFiltersCommand)
      .resolves({ subscriptionFilters: [{ filterName: '/aws/lambda/excluded-function' }] });
    logsClient.on(DeleteSubscriptionFilterCommand).resolves({});

    await updateSubscriptionPolicy(
      'LOG_GROUP',
      logGroup,
      logExclusionSetting,
      'arn:aws:iam::123456789012:role/LogSubscriptionRole',
      'arn:aws:logs:us-west-2:123456789012:destination:MyDestination',
    );

    expect(logsClient.commandCalls(DeleteSubscriptionFilterCommand)).toHaveLength(1);
    expect(logsClient.commandCalls(PutSubscriptionFilterCommand)).toHaveLength(0);
  });

  test('should do nothing when log group is not excluded and already has filter', async () => {
    const logGroup = { logGroupName: '/aws/lambda/my-function' };
    const logExclusionSetting = {
      excludeAll: false,
      logGroupNames: [],
      account: '123456789012',
      region: 'us-west-2',
    };

    logsClient
      .on(DescribeSubscriptionFiltersCommand)
      .resolves({ subscriptionFilters: [{ filterName: '/aws/lambda/my-function' }] });

    await updateSubscriptionPolicy(
      'LOG_GROUP',
      logGroup,
      logExclusionSetting,
      'arn:aws:iam::123456789012:role/LogSubscriptionRole',
      'arn:aws:logs:us-west-2:123456789012:destination:MyDestination',
    );

    expect(logsClient.commandCalls(PutSubscriptionFilterCommand)).toHaveLength(0);
    expect(logsClient.commandCalls(DeleteSubscriptionFilterCommand)).toHaveLength(0);
  });

  test('should do nothing when log group is excluded and has no filter', async () => {
    const logGroup = { logGroupName: '/aws/lambda/excluded-function' };
    const logExclusionSetting = {
      excludeAll: false,
      logGroupNames: ['/aws/lambda/excluded-function'],
      account: '123456789012',
      region: 'us-west-2',
    };

    logsClient.on(DescribeSubscriptionFiltersCommand).resolves({ subscriptionFilters: [] });

    await updateSubscriptionPolicy(
      'LOG_GROUP',
      logGroup,
      logExclusionSetting,
      'arn:aws:iam::123456789012:role/LogSubscriptionRole',
      'arn:aws:logs:us-west-2:123456789012:destination:MyDestination',
    );

    expect(logsClient.commandCalls(PutSubscriptionFilterCommand)).toHaveLength(0);
    expect(logsClient.commandCalls(DeleteSubscriptionFilterCommand)).toHaveLength(0);
  });

  test('should handle when logExclusionSetting is undefined', async () => {
    const logGroup = { logGroupName: '/aws/lambda/my-function' };

    logsClient.on(DescribeSubscriptionFiltersCommand).resolves({ subscriptionFilters: [] });
    logsClient.on(PutSubscriptionFilterCommand).resolves({});

    await updateSubscriptionPolicy(
      'LOG_GROUP',
      logGroup,
      undefined,
      'arn:aws:iam::123456789012:role/LogSubscriptionRole',
      'arn:aws:logs:us-west-2:123456789012:destination:MyDestination',
    );

    expect(logsClient.commandCalls(PutSubscriptionFilterCommand)).toHaveLength(1);
    expect(logsClient.commandCalls(DeleteSubscriptionFilterCommand)).toHaveLength(0);
  });

  test('should handle API errors in DescribeSubscriptionFilters', async () => {
    const logGroup = { logGroupName: '/aws/lambda/my-function' };
    const logExclusionSetting = {
      excludeAll: false,
      logGroupNames: [],
      account: '123456789012',
      region: 'us-west-2',
    };

    logsClient.on(DescribeSubscriptionFiltersCommand).rejects(new Error('API Error'));

    await expect(
      updateSubscriptionPolicy(
        'LOG_GROUP',
        logGroup,
        logExclusionSetting,
        'arn:aws:iam::123456789012:role/LogSubscriptionRole',
        'arn:aws:logs:us-west-2:123456789012:destination:MyDestination',
      ),
    ).rejects.toThrow('API Error');
  });

  test('should handle API errors in PutSubscriptionFilter', async () => {
    const logGroup = { logGroupName: '/aws/lambda/my-function' };
    const logExclusionSetting = {
      excludeAll: false,
      logGroupNames: [],
      account: '123456789012',
      region: 'us-west-2',
    };

    logsClient.on(DescribeSubscriptionFiltersCommand).resolves({ subscriptionFilters: [] });
    logsClient.on(PutSubscriptionFilterCommand).rejects(new Error('API Error'));

    await expect(
      updateSubscriptionPolicy(
        'LOG_GROUP',
        logGroup,
        logExclusionSetting,
        'arn:aws:iam::123456789012:role/LogSubscriptionRole',
        'arn:aws:logs:us-west-2:123456789012:destination:MyDestination',
      ),
    ).rejects.toThrow('API Error');
  });

  test('should handle excludeAll=true in logExclusionSetting', async () => {
    const logGroup = { logGroupName: '/aws/lambda/my-function' };
    const logExclusionSetting = {
      excludeAll: true,
      logGroupNames: [],
      account: '123456789012',
      region: 'us-west-2',
    };

    logsClient
      .on(DescribeSubscriptionFiltersCommand)
      .resolves({ subscriptionFilters: [{ filterName: '/aws/lambda/my-function' }] });
    logsClient.on(DeleteSubscriptionFilterCommand).resolves({});

    await updateSubscriptionPolicy(
      'LOG_GROUP',
      logGroup,
      logExclusionSetting,
      'arn:aws:iam::123456789012:role/LogSubscriptionRole',
      'arn:aws:logs:us-west-2:123456789012:destination:MyDestination',
    );

    expect(logsClient.commandCalls(DeleteSubscriptionFilterCommand)).toHaveLength(1);
    expect(logsClient.commandCalls(PutSubscriptionFilterCommand)).toHaveLength(0);
  });
});

describe('updateKmsKey', () => {
  beforeEach(() => {
    logsClient.reset();
  });

  test('should set KMS key when log group has no existing key', async () => {
    const logGroup = { logGroupName: '/aws/lambda/my-function' };
    const kmsKeyArn = 'arn:aws:kms:us-west-2:123456789012:key/1234abcd-12ab-34cd-56ef-1234567890ab';

    logsClient.on(AssociateKmsKeyCommand).resolves({});

    await updateKmsKey(logGroup, kmsKeyArn);

    expect(logsClient.commandCalls(AssociateKmsKeyCommand)).toHaveLength(1);
    expect(logsClient.commandCalls(AssociateKmsKeyCommand)[0].args[0].input).toEqual({
      logGroupName: logGroup.logGroupName,
      kmsKeyId: kmsKeyArn,
    });
  });

  test('should not set KMS key when log group already has a key', async () => {
    const logGroup = {
      logGroupName: '/aws/lambda/my-function',
      kmsKeyId: 'arn:aws:kms:us-west-2:123456789012:key/existing-key',
    };
    const kmsKeyArn = 'arn:aws:kms:us-west-2:123456789012:key/new-key';

    await updateKmsKey(logGroup, kmsKeyArn);

    expect(logsClient.commandCalls(AssociateKmsKeyCommand)).toHaveLength(0);
  });

  test('should not set KMS key when no kmsKeyArn is provided', async () => {
    const logGroup = { logGroupName: '/aws/lambda/my-function' };

    await updateKmsKey(logGroup, undefined);

    expect(logsClient.commandCalls(AssociateKmsKeyCommand)).toHaveLength(0);
  });

  test('should log appropriate message when no KMS key is provided', async () => {
    const logGroup = { logGroupName: '/aws/lambda/my-function' };
    const consoleSpy = jest.spyOn(console, 'log');

    await updateKmsKey(logGroup, undefined);

    expect(consoleInfoMock).toHaveBeenCalledWith(
      'Accelerator KMK key undefined not provided for Log Group /aws/lambda/my-function, log group encryption not performed',
    );
    consoleSpy.mockRestore();
  });

  test('should log appropriate message when log group already has KMS key', async () => {
    const logGroup = {
      logGroupName: '/aws/lambda/my-function',
      kmsKeyId: 'arn:aws:kms:us-west-2:123456789012:key/existing-key',
    };
    const consoleSpy = jest.spyOn(console, 'log');

    await updateKmsKey(logGroup, 'new-key-arn');

    expect(consoleInfoMock).toHaveBeenCalledWith('Log Group: /aws/lambda/my-function has kms set');
    consoleSpy.mockRestore();
  });

  test('should handle API errors when setting KMS key', async () => {
    const logGroup = { logGroupName: '/aws/lambda/my-function' };
    const kmsKeyArn = 'arn:aws:kms:us-west-2:123456789012:key/1234abcd-12ab-34cd-56ef-1234567890ab';

    logsClient.on(AssociateKmsKeyCommand).rejects(new Error('Failed to associate KMS key'));

    await expect(updateKmsKey(logGroup, kmsKeyArn)).rejects.toThrow('Failed to associate KMS key');
  });

  test('should handle empty log group name', async () => {
    const logGroup = { logGroupName: '' };
    const kmsKeyArn = 'arn:aws:kms:us-west-2:123456789012:key/1234abcd-12ab-34cd-56ef-1234567890ab';

    logsClient.on(AssociateKmsKeyCommand).resolves({});

    await updateKmsKey(logGroup, kmsKeyArn);

    expect(logsClient.commandCalls(AssociateKmsKeyCommand)).toHaveLength(1);
    expect(logsClient.commandCalls(AssociateKmsKeyCommand)[0].args[0].input).toEqual({
      logGroupName: '',
      kmsKeyId: kmsKeyArn,
    });
  });

  test('should log setting KMS key message', async () => {
    const logGroup = { logGroupName: '/aws/lambda/my-function' };
    const kmsKeyArn = 'arn:aws:kms:us-west-2:123456789012:key/1234abcd-12ab-34cd-56ef-1234567890ab';
    const consoleSpy = jest.spyOn(console, 'log');

    logsClient.on(AssociateKmsKeyCommand).resolves({});

    await updateKmsKey(logGroup, kmsKeyArn);

    expect(consoleInfoMock).toHaveBeenCalledWith('Setting KMS for log group /aws/lambda/my-function');
    consoleSpy.mockRestore();
  });

  test('should handle various KMS key ARN formats', async () => {
    const logGroup = { logGroupName: '/aws/lambda/my-function' };
    const kmsKeyArns = [
      'arn:aws:kms:us-west-2:123456789012:key/1234abcd-12ab-34cd-56ef-1234567890ab',
      'alias/aws/logs',
      '1234abcd-12ab-34cd-56ef-1234567890ab',
    ];

    for (const kmsKeyArn of kmsKeyArns) {
      logsClient.reset();
      logsClient.on(AssociateKmsKeyCommand).resolves({});

      await updateKmsKey(logGroup, kmsKeyArn);

      expect(logsClient.commandCalls(AssociateKmsKeyCommand)).toHaveLength(1);
      expect(logsClient.commandCalls(AssociateKmsKeyCommand)[0].args[0].input).toEqual({
        logGroupName: logGroup.logGroupName,
        kmsKeyId: kmsKeyArn,
      });
    }
  });
});

describe('LogExclusion Parsing', () => {
  beforeEach(() => {
    logsClient.reset();
    process.env = { ...OLD_ENV };
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  test('should parse valid logExclusionSetting JSON', async () => {
    const sqsEvent = {
      Records: [
        {
          messageId: '1',
          receiptHandle: 'handle1',
          body: JSON.stringify({
            requestParameters: {
              logGroupName: '/aws/lambda/my-function',
            },
          }),
          attributes: {
            ApproximateReceiveCount: '1',
            SentTimestamp: '1523232000000',
            SenderId: '123456789012',
            ApproximateFirstReceiveTimestamp: '1523232000001',
          },
          messageAttributes: {},
          md5OfBody: 'md5',
          eventSource: 'aws:sqs',
          eventSourceARN: 'arn:aws:sqs:us-east-1:123456789012:MyQueue',
          awsRegion: 'us-east-1',
        },
      ],
    };

    process.env['LogExclusion'] = JSON.stringify({
      account: '123456789012',
      region: 'us-west-2',
      excludeAll: false,
      logGroupNames: ['/aws/lambda/excluded'],
    });

    logsClient.on(DescribeLogGroupsCommand).resolves({ logGroups: [{ logGroupName: '/aws/lambda/my-function' }] });
    logsClient.on(PutRetentionPolicyCommand).resolves({});
    logsClient.on(DescribeSubscriptionFiltersCommand).resolves({ subscriptionFilters: [] });
    logsClient.on(PutSubscriptionFilterCommand).resolves({});

    await handler(sqsEvent);

    // Verify the exclusion setting was correctly parsed and applied
    expect(logsClient.commandCalls(PutSubscriptionFilterCommand)).toHaveLength(1);
  });

  test('should handle undefined logExclusionSetting', async () => {
    const sqsEvent = {
      Records: [
        {
          messageId: '1',
          receiptHandle: 'handle1',
          body: JSON.stringify({
            requestParameters: {
              logGroupName: '/aws/lambda/my-function',
            },
          }),
          attributes: {
            ApproximateReceiveCount: '1',
            SentTimestamp: '1523232000000',
            SenderId: '123456789012',
            ApproximateFirstReceiveTimestamp: '1523232000001',
          },
          messageAttributes: {},
          md5OfBody: 'md5',
          eventSource: 'aws:sqs',
          eventSourceARN: 'arn:aws:sqs:us-east-1:123456789012:MyQueue',
          awsRegion: 'us-east-1',
        },
      ],
    };

    delete process.env['LogExclusion'];

    logsClient.on(DescribeLogGroupsCommand).resolves({ logGroups: [{ logGroupName: '/aws/lambda/my-function' }] });
    logsClient.on(PutRetentionPolicyCommand).resolves({});
    logsClient.on(DescribeSubscriptionFiltersCommand).resolves({ subscriptionFilters: [] });
    logsClient.on(PutSubscriptionFilterCommand).resolves({});

    await handler(sqsEvent);

    // Verify the function still works without exclusion settings
    expect(logsClient.commandCalls(PutSubscriptionFilterCommand)).toHaveLength(1);
  });

  test('should handle invalid JSON in logExclusionSetting', async () => {
    const sqsEvent = {
      Records: [
        {
          messageId: '1',
          receiptHandle: 'handle1',
          body: JSON.stringify({
            requestParameters: {
              logGroupName: '/aws/lambda/my-function',
            },
          }),
          attributes: {
            ApproximateReceiveCount: '1',
            SentTimestamp: '1523232000000',
            SenderId: '123456789012',
            ApproximateFirstReceiveTimestamp: '1523232000001',
          },
          messageAttributes: {},
          md5OfBody: 'md5',
          eventSource: 'aws:sqs',
          eventSourceARN: 'arn:aws:sqs:us-east-1:123456789012:MyQueue',
          awsRegion: 'us-east-1',
        },
      ],
    };

    process.env['LogExclusion'] = 'invalid-json';

    await expect(handler(sqsEvent)).rejects.toThrow(SyntaxError);
  });

  test('should handle partial logExclusionSetting', async () => {
    const sqsEvent = {
      Records: [
        {
          messageId: '1',
          receiptHandle: 'handle1',
          body: JSON.stringify({
            requestParameters: {
              logGroupName: '/aws/lambda/my-function',
            },
          }),
          attributes: {
            ApproximateReceiveCount: '1',
            SentTimestamp: '1523232000000',
            SenderId: '123456789012',
            ApproximateFirstReceiveTimestamp: '1523232000001',
          },
          messageAttributes: {},
          md5OfBody: 'md5',
          eventSource: 'aws:sqs',
          eventSourceARN: 'arn:aws:sqs:us-east-1:123456789012:MyQueue',
          awsRegion: 'us-east-1',
        },
      ],
    };

    // Test with partial settings
    process.env['LogExclusion'] = JSON.stringify({
      account: '123456789012',
      region: 'us-west-2',
      // Missing excludeAll and logGroupNames
    });

    logsClient.on(DescribeLogGroupsCommand).resolves({ logGroups: [{ logGroupName: '/aws/lambda/my-function' }] });
    logsClient.on(PutRetentionPolicyCommand).resolves({});
    logsClient.on(DescribeSubscriptionFiltersCommand).resolves({ subscriptionFilters: [] });
    logsClient.on(PutSubscriptionFilterCommand).resolves({});

    await handler(sqsEvent);

    // Verify the function works with partial exclusion settings
    expect(logsClient.commandCalls(PutSubscriptionFilterCommand)).toHaveLength(1);
  });

  test('should handle all fields in logExclusionSetting', async () => {
    const sqsEvent = {
      Records: [
        {
          messageId: '1',
          receiptHandle: 'handle1',
          body: JSON.stringify({
            requestParameters: {
              logGroupName: '/aws/lambda/my-function',
            },
          }),
          attributes: {
            ApproximateReceiveCount: '1',
            SentTimestamp: '1523232000000',
            SenderId: '123456789012',
            ApproximateFirstReceiveTimestamp: '1523232000001',
          },
          messageAttributes: {},
          md5OfBody: 'md5',
          eventSource: 'aws:sqs',
          eventSourceARN: 'arn:aws:sqs:us-east-1:123456789012:MyQueue',
          awsRegion: 'us-east-1',
        },
      ],
    };

    // Test with all possible fields
    // Test with all possible fields
    process.env['LogExclusion'] = JSON.stringify({
      account: '123456789012',
      region: 'us-west-2',
      excludeAll: true,
      logGroupNames: ['/aws/lambda/excluded1', '/aws/lambda/excluded2'],
    });

    logsClient.on(DescribeLogGroupsCommand).resolves({ logGroups: [{ logGroupName: '/aws/lambda/my-function' }] });
    logsClient.on(PutRetentionPolicyCommand).resolves({});
    logsClient.on(DescribeSubscriptionFiltersCommand).resolves({ subscriptionFilters: [] });
    logsClient.on(DeleteSubscriptionFilterCommand).resolves({});

    await handler(sqsEvent);

    // Verify excludeAll:true prevents subscription creation
    expect(logsClient.commandCalls(PutSubscriptionFilterCommand)).toHaveLength(0);
  });
});
