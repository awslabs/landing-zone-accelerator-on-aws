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

import * as zlib from 'zlib';
import { handler } from '../../../lib/aws-firehose/firehose-record-processing/index';
import { mockClient, AwsClientStub } from 'aws-sdk-client-mock';
import { expect, it, beforeEach, afterEach, describe } from '@jest/globals';
import { KinesisClient, PutRecordsCommand } from '@aws-sdk/client-kinesis';
import {
  FirehoseTransformationEvent,
  FirehoseTransformationEventRecord,
  CloudWatchLogsToFirehoseRecord,
} from '@aws-accelerator/utils/lib/common-types';
export interface ProcessEnv {
  [key: string]: string | undefined;
}
let envCache: ProcessEnv;
let kinesisMock: AwsClientStub<KinesisClient>;

beforeEach(() => {
  kinesisMock = mockClient(KinesisClient);
  envCache = process.env;
});

afterEach(() => {
  kinesisMock.restore();
  process.env = envCache;
});

it('should return a valid response', async () => {
  const input: CloudWatchLogsToFirehoseRecord = {
    messageType: 'DATA_MESSAGE',
    owner: '000000000000',
    logGroup: 'testLogGroup',
    logStream: 'testLogStream',
    subscriptionFilters: ['testLogGroup'],
    logEvents: [
      {
        id: '37255929110829766979968869523131155620888295107628171264',
        timestamp: 1670613640000,
        message: 'test0',
      },
    ],
  };
  const response = await handler(makeTestInput(input, 1));
  expect(response.records[0].result).toEqual('Ok');
});

it('does not have logGroup in input', async () => {
  const input = {
    messageType: 'DATA_MESSAGE',
    owner: '000000000000',
    logStream: 'testLogStream',
    subscriptionFilters: ['testLogGroup'],
    logEvents: [
      {
        id: '37255929110829766979968869523131155620888295107628171264',
        timestamp: 1670613640000,
        message: 'test0',
      },
    ],
  };
  const response = await handler(makeTestInput(input, 1));
  expect(response.records[0].result).toEqual('ProcessingFailed');
});

describe('test max payload variable', () => {
  it('Max payload reached ', async () => {
    const input: CloudWatchLogsToFirehoseRecord = {
      messageType: 'DATA_MESSAGE',
      owner: '000000000000',
      logGroup: 'testLogGroup',
      logStream: 'testLogStream',
      subscriptionFilters: ['testLogGroup'],
      logEvents: [
        {
          id: '37255929110829766979968869523131155620888295107628171264',
          timestamp: 1670613640001,
          message: 'test0',
        },
        {
          id: '37255929110829766979968869523131155620888295107628171265',
          timestamp: 1670613640000,
          message: 'test1',
        },
      ],
    };

    process.env['MaxOutputPayload'] = '170';
    const response = await handler(makeTestInput(input, 1));
    expect(response.records[0].result).toEqual('ProcessingFailed');
  });
  it('Single large payload ', async () => {
    const input: CloudWatchLogsToFirehoseRecord = {
      messageType: 'DATA_MESSAGE',
      owner: '000000000000',
      logGroup: 'testLogGroup',
      logStream: 'testLogStream',
      subscriptionFilters: ['testLogGroup'],
      logEvents: [
        {
          id: '37255929110829766979968869523131155620888295107628171264',
          timestamp: 1670613640001,
          message: 'test0',
        },
      ],
    };

    process.env['MaxOutputPayload'] = '170';
    await expect(handler(makeTestInput(input, 1))).rejects.toThrow('SINGLE_LARGE_FIREHOSE_PAYLOAD');
  });

  it('Put record in kinesis', async () => {
    const input: CloudWatchLogsToFirehoseRecord = {
      messageType: 'DATA_MESSAGE',
      owner: '000000000000',
      logGroup: 'testLogGroup',
      logStream: 'testLogStream',
      subscriptionFilters: ['testLogGroup'],
      logEvents: [
        {
          id: '37255929110829766979968869523131155620888295107628171264',
          timestamp: 1670613640001,
          message: 'test0',
        },
        {
          id: '37255929110829766979968869523131155620888295107628171265',
          timestamp: 1670613640000,
          message: 'test1',
        },
        {
          id: '37255929110829766979968869523131155620888295107628171265',
          timestamp: 1670613640000,
          message: 'test2',
        },
        {
          id: '37255929110829766979968869523131155620888295107628171265',
          timestamp: 1670613640000,
          message: 'test3',
        },
      ],
    };
    process.env['MaxOutputPayload'] = '200';
    kinesisMock.on(PutRecordsCommand).resolves({});
    const response = await handler(makeTestInput(input, 10));
    expect(response.records[0].result).toEqual('ProcessingFailed');
  });
});

it('Bad record', async () => {
  const response = await handler({
    invocationId: 'invocationId',
    deliveryStreamArn: 'deliveryStreamArn',
    region: 'region',
    records: [{ recordId: 'recordId', data: 'data', approximateArrivalTimestamp: 1670613640000 }],
  });
  expect(response.records[0].result).toEqual('ProcessingFailed');
});

it('Dynamic partition perfect match', async () => {
  process.env['DynamicS3LogPartitioningMapping'] =
    '../../../test/aws-firehose/firehose-record-processing/dynamicPartition1.json';
  process.env['MaxOutputPayload'] = '50000000';
  const input: CloudWatchLogsToFirehoseRecord = {
    messageType: 'DATA_MESSAGE',
    owner: '000000000000',
    logGroup: '/AWSAccelerator-SecurityHub',
    logStream: 'testLogStream',
    subscriptionFilters: ['AWSAccelerator-SecurityHub'],
    logEvents: [
      {
        id: '37255929110829766979968869523131155620888295107628171264',
        timestamp: 1670613640001,
        message: 'test0',
      },
    ],
  };
  const response = await handler(makeTestInput(input, 1));
  expect(response.records[0].metadata?.partitionKeys['dynamicPrefix']).toContain('CloudWatchLogs/security-hub');
});

it('Dynamic partition wildcard match pattern appA*region', async () => {
  process.env['DynamicS3LogPartitioningMapping'] =
    '../../../test/aws-firehose/firehose-record-processing/dynamicPartition2.json';
  process.env['MaxOutputPayload'] = '50000000';
  const input1: CloudWatchLogsToFirehoseRecord = {
    messageType: 'DATA_MESSAGE',
    owner: '000000000000',
    logGroup: 'appAregion',
    logStream: 'testLogStream',
    subscriptionFilters: ['AWSAccelerator-SecurityHub'],
    logEvents: [
      {
        id: '37255929110829766979968869523131155620888295107628171264',
        timestamp: 1670613640001,
        message: 'test0',
      },
    ],
  };
  const input2: CloudWatchLogsToFirehoseRecord = {
    messageType: 'DATA_MESSAGE',
    owner: '000000000000',
    logGroup: 'appA-prefix-some-other-Prefix-000000000000-region',
    logStream: 'testLogStream',
    subscriptionFilters: ['AWSAccelerator-SecurityHub'],
    logEvents: [
      {
        id: '37255929110829766979968869523131155620888295107628171264',
        timestamp: 1670613640001,
        message: 'test0',
      },
    ],
  };
  const input3: CloudWatchLogsToFirehoseRecord = {
    messageType: 'DATA_MESSAGE',
    owner: '000000000000',
    logGroup: 'appA-some-text-region',
    logStream: 'testLogStream',
    subscriptionFilters: ['AWSAccelerator-SecurityHub'],
    logEvents: [
      {
        id: '37255929110829766979968869523131155620888295107628171264',
        timestamp: 1670613640001,
        message: 'test0',
      },
    ],
  };
  const input4: CloudWatchLogsToFirehoseRecord = {
    messageType: 'DATA_MESSAGE',
    owner: '000000000000',
    logGroup: 'test',
    logStream: 'testLogStream',
    subscriptionFilters: ['AWSAccelerator-SecurityHub'],
    logEvents: [
      {
        id: '37255929110829766979968869523131155620888295107628171264',
        timestamp: 1670613640001,
        message: 'test0',
      },
    ],
  };
  const response1 = await handler(makeTestInput(input1, 1));
  const response2 = await handler(makeTestInput(input2, 1));
  const response3 = await handler(makeTestInput(input3, 1));
  const response4 = await handler(makeTestInput(input4, 1));
  const response = {
    invocationId: 'invocationId',
    deliveryStreamArn: 'deliveryStreamArn',
    region: 'region',
    records: [...response1.records, ...response2.records, ...response3.records, ...response4.records],
  };

  expect(response.records[0].metadata?.partitionKeys['dynamicPrefix']).toContain('app-a-region');
  expect(response.records[1].metadata?.partitionKeys['dynamicPrefix']).toContain('app-a-region');
  expect(response.records[2].metadata?.partitionKeys['dynamicPrefix']).toContain('app-a-region');
  expect(response.records[3].metadata?.partitionKeys['dynamicPrefix']).not.toContain('app-a-region');
  expect(response.records[3].metadata?.partitionKeys['dynamicPrefix']).toContain('CloudWatchLogs');
});

it('Dynamic partition wildcard match pattern sandbox*', async () => {
  process.env['DynamicS3LogPartitioningMapping'] =
    '../../../test/aws-firehose/firehose-record-processing/dynamicPartition3.json';
  process.env['MaxOutputPayload'] = '50000000';
  const input1: CloudWatchLogsToFirehoseRecord = {
    messageType: 'DATA_MESSAGE',
    owner: '000000000000',
    logGroup: 'sandbox-region',
    logStream: 'testLogStream',
    subscriptionFilters: ['AWSAccelerator-SecurityHub'],
    logEvents: [
      {
        id: '37255929110829766979968869523131155620888295107628171264',
        timestamp: 1670613640001,
        message: 'test0',
      },
    ],
  };
  const input2: CloudWatchLogsToFirehoseRecord = {
    messageType: 'DATA_MESSAGE',
    owner: '000000000000',
    logGroup: 'sandbox-prefix-some-other-Prefix-000000000000-region',
    logStream: 'testLogStream',
    subscriptionFilters: ['AWSAccelerator-SecurityHub'],
    logEvents: [
      {
        id: '37255929110829766979968869523131155620888295107628171264',
        timestamp: 1670613640001,
        message: 'test0',
      },
    ],
  };
  const input3: CloudWatchLogsToFirehoseRecord = {
    messageType: 'DATA_MESSAGE',
    owner: '000000000000',
    logGroup: 'sandbox-some-text-region',
    logStream: 'testLogStream',
    subscriptionFilters: ['AWSAccelerator-SecurityHub'],
    logEvents: [
      {
        id: '37255929110829766979968869523131155620888295107628171264',
        timestamp: 1670613640001,
        message: 'test0',
      },
    ],
  };
  const input4: CloudWatchLogsToFirehoseRecord = {
    messageType: 'DATA_MESSAGE',
    owner: '000000000000',
    logGroup: 'test',
    logStream: 'testLogStream',
    subscriptionFilters: ['AWSAccelerator-SecurityHub'],
    logEvents: [
      {
        id: '37255929110829766979968869523131155620888295107628171264',
        timestamp: 1670613640001,
        message: 'test0',
      },
    ],
  };
  const response1 = await handler(makeTestInput(input1, 1));
  const response2 = await handler(makeTestInput(input2, 1));
  const response3 = await handler(makeTestInput(input3, 1));
  const response4 = await handler(makeTestInput(input4, 1));
  const response = {
    invocationId: 'invocationId',
    deliveryStreamArn: 'deliveryStreamArn',
    region: 'region',
    records: [...response1.records, ...response2.records, ...response3.records, ...response4.records],
  };

  expect(response.records[0].metadata?.partitionKeys['dynamicPrefix']).toContain('sandbox');
  expect(response.records[1].metadata?.partitionKeys['dynamicPrefix']).toContain('sandbox');
  expect(response.records[2].metadata?.partitionKeys['dynamicPrefix']).toContain('sandbox');
  expect(response.records[3].metadata?.partitionKeys['dynamicPrefix']).not.toContain('sandbox');
  expect(response.records[3].metadata?.partitionKeys['dynamicPrefix']).toContain('CloudWatchLogs');
});

it('Dynamic partition wildcard match pattern AWSAccelerator*VpcFlowLog*region', async () => {
  process.env['DynamicS3LogPartitioningMapping'] =
    '../../../test/aws-firehose/firehose-record-processing/dynamicPartition4.json';
  process.env['MaxOutputPayload'] = '50000000';
  const input1: CloudWatchLogsToFirehoseRecord = {
    messageType: 'DATA_MESSAGE',
    owner: '000000000000',
    logGroup: 'AWSAccelerator-textText-VpcFlowLog-000000000000-region',
    logStream: 'testLogStream',
    subscriptionFilters: ['AWSAccelerator-SecurityHub'],
    logEvents: [
      {
        id: '37255929110829766979968869523131155620888295107628171264',
        timestamp: 1670613640001,
        message: 'test0',
      },
    ],
  };
  const input2: CloudWatchLogsToFirehoseRecord = {
    messageType: 'DATA_MESSAGE',
    owner: '000000000000',
    logGroup: 'AWSAcceleratorVpcFlowLogregion',
    logStream: 'testLogStream',
    subscriptionFilters: ['AWSAccelerator-SecurityHub'],
    logEvents: [
      {
        id: '37255929110829766979968869523131155620888295107628171264',
        timestamp: 1670613640001,
        message: 'test0',
      },
    ],
  };
  const input3: CloudWatchLogsToFirehoseRecord = {
    messageType: 'DATA_MESSAGE',
    owner: '000000000000',
    logGroup: 'AWSAcceleratorVpcFlowLogregion',
    logStream: 'testLogStream',
    subscriptionFilters: ['AWSAccelerator-SecurityHub'],
    logEvents: [
      {
        id: '37255929110829766979968869523131155620888295107628171264',
        timestamp: 1670613640001,
        message: 'test0',
      },
    ],
  };
  const input4: CloudWatchLogsToFirehoseRecord = {
    messageType: 'DATA_MESSAGE',
    owner: '000000000000',
    logGroup: 'test',
    logStream: 'testLogStream',
    subscriptionFilters: ['AWSAccelerator-SecurityHub'],
    logEvents: [
      {
        id: '37255929110829766979968869523131155620888295107628171264',
        timestamp: 1670613640001,
        message: 'test0',
      },
    ],
  };
  const response1 = await handler(makeTestInput(input1, 1));
  const response2 = await handler(makeTestInput(input2, 1));
  const response3 = await handler(makeTestInput(input3, 1));
  const response4 = await handler(makeTestInput(input4, 1));
  const response = {
    invocationId: 'invocationId',
    deliveryStreamArn: 'deliveryStreamArn',
    region: 'region',
    records: [...response1.records, ...response2.records, ...response3.records, ...response4.records],
  };

  expect(response.records[0].metadata?.partitionKeys['dynamicPrefix']).toContain('accelerator-vpc-flow-logs-region');
  expect(response.records[1].metadata?.partitionKeys['dynamicPrefix']).toContain('accelerator-vpc-flow-logs-region');
  expect(response.records[2].metadata?.partitionKeys['dynamicPrefix']).toContain('accelerator-vpc-flow-logs-region');
  expect(response.records[3].metadata?.partitionKeys['dynamicPrefix']).not.toContain(
    'accelerator-vpc-flow-logs-region',
  );
  expect(response.records[3].metadata?.partitionKeys['dynamicPrefix']).toContain('CloudWatchLogs');
});

describe('Dynamic partitioning with account ID mapping', () => {
  it('should include account ID in prefix when DynamicS3LogPartitioningByAccountId is true', async () => {
    process.env['DynamicS3LogPartitioningByAccountId'] = 'true';
    process.env['MaxOutputPayload'] = '50000000';

    const input: CloudWatchLogsToFirehoseRecord = {
      messageType: 'DATA_MESSAGE',
      owner: '111111111111',
      logGroup: 'testLogGroup',
      logStream: 'testLogStream',
      subscriptionFilters: ['testFilter'],
      logEvents: [
        {
          id: '37255929110829766979968869523131155620888295107628171264',
          timestamp: 1670613640001,
          message: 'test0',
        },
      ],
    };

    const response = await handler(makeTestInput(input, 1));
    expect(response.records[0].metadata?.partitionKeys['dynamicPrefix']).toContain('CloudWatchLogs/111111111111');
  });

  it('should combine account ID and mapping prefix when both are enabled', async () => {
    process.env['DynamicS3LogPartitioningByAccountId'] = 'true';
    process.env['DynamicS3LogPartitioningMapping'] =
      '../../../test/aws-firehose/firehose-record-processing/dynamicPartition1.json';
    process.env['MaxOutputPayload'] = '50000000';

    const input: CloudWatchLogsToFirehoseRecord = {
      messageType: 'DATA_MESSAGE',
      owner: '111111111111',
      logGroup: '/AWSAccelerator-SecurityHub',
      logStream: 'testLogStream',
      subscriptionFilters: ['AWSAccelerator-SecurityHub'],
      logEvents: [
        {
          id: '37255929110829766979968869523131155620888295107628171264',
          timestamp: 1670613640001,
          message: 'test0',
        },
      ],
    };

    const response = await handler(makeTestInput(input, 1));
    expect(response.records[0].metadata?.partitionKeys['dynamicPrefix']).toContain(
      'CloudWatchLogs/111111111111/security-hub',
    );
  });

  it('should not include account ID in prefix when DynamicS3LogPartitioningByAccountId is false', async () => {
    process.env['DynamicS3LogPartitioningByAccountId'] = 'false';
    process.env['MaxOutputPayload'] = '50000000';

    const input: CloudWatchLogsToFirehoseRecord = {
      messageType: 'DATA_MESSAGE',
      owner: '111111111111',
      logGroup: 'testLogGroup',
      logStream: 'testLogStream',
      subscriptionFilters: ['testFilter'],
      logEvents: [
        {
          id: '37255929110829766979968869523131155620888295107628171264',
          timestamp: 1670613640001,
          message: 'test0',
        },
      ],
    };

    const response = await handler(makeTestInput(input, 1));
    expect(response.records[0].metadata?.partitionKeys['dynamicPrefix']).not.toContain('111111111111');
  });

  it('should handle missing DynamicS3LogPartitioningByAccountId environment variable', async () => {
    delete process.env['DynamicS3LogPartitioningByAccountId'];
    process.env['MaxOutputPayload'] = '50000000';

    const input: CloudWatchLogsToFirehoseRecord = {
      messageType: 'DATA_MESSAGE',
      owner: '111111111111',
      logGroup: 'testLogGroup',
      logStream: 'testLogStream',
      subscriptionFilters: ['testFilter'],
      logEvents: [
        {
          id: '37255929110829766979968869523131155620888295107628171264',
          timestamp: 1670613640001,
          message: 'test0',
        },
      ],
    };

    const response = await handler(makeTestInput(input, 1));
    expect(response.records[0].metadata?.partitionKeys['dynamicPrefix']).not.toContain('111111111111');
  });

  it('should handle different account IDs correctly', async () => {
    process.env['DynamicS3LogPartitioningByAccountId'] = 'true';
    process.env['MaxOutputPayload'] = '50000000';

    const testCases = [
      { accountId: '111111111111', expectedPrefix: 'CloudWatchLogs/111111111111' },
      { accountId: '222222222222', expectedPrefix: 'CloudWatchLogs/222222222222' },
      { accountId: '333333333333', expectedPrefix: 'CloudWatchLogs/333333333333' },
    ];

    for (const testCase of testCases) {
      const input: CloudWatchLogsToFirehoseRecord = {
        messageType: 'DATA_MESSAGE',
        owner: testCase.accountId,
        logGroup: 'testLogGroup',
        logStream: 'testLogStream',
        subscriptionFilters: ['testFilter'],
        logEvents: [
          {
            id: '37255929110829766979968869523131155620888295107628171264',
            timestamp: 1670613640001,
            message: 'test0',
          },
        ],
      };

      const response = await handler(makeTestInput(input, 1));
      expect(response.records[0].metadata?.partitionKeys['dynamicPrefix']).toContain(testCase.expectedPrefix);
    }
  });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeTestInput(inputData: CloudWatchLogsToFirehoseRecord | any, numberOfRecords: number) {
  const jsonStringPayload = JSON.stringify(inputData);
  const zippedPayload = zlib.gzipSync(jsonStringPayload);
  const base64EncodedPayload = Buffer.from(zippedPayload).toString('base64');
  const recordOutput: FirehoseTransformationEventRecord[] = Array(numberOfRecords ?? 1).fill({
    recordId: 'recordId',
    approximateArrivalTimestamp: 1670613640000,
    data: base64EncodedPayload,
  });
  const output: FirehoseTransformationEvent = {
    invocationId: 'invocationId',
    deliveryStreamArn: 'deliveryStreamArn',
    region: 'region',
    records: recordOutput,
  };
  return output;
}
