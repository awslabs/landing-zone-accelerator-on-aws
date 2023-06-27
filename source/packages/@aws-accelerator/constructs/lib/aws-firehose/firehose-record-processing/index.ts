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

import * as AWS from 'aws-sdk';
import * as fs from 'fs';
import * as path from 'path';
import * as uuid from 'uuid';
import { throttlingBackOff } from '@aws-accelerator/utils';
const zlib = require('zlib');

AWS.config.logger = console;

/**
 * firehose-prefix-processor - lambda handler
 *
 * @param event
 * @returns
 */

export async function handler(event: AWSLambda.FirehoseTransformationEvent) {
  const firehoseRecordsOutput: AWSLambda.FirehoseTransformationResult = { records: [] };

  // Parse records
  for (const firehoseRecordInput of event.records) {
    try {
      const processedFirehoseRecord = await processFirehoseInputRecord(firehoseRecordInput);
      firehoseRecordsOutput.records.push(processedFirehoseRecord);
    } catch (err) {
      console.warn(err);
      const firehoseReturnErrorResult: AWSLambda.FirehoseTransformationResultRecord = {
        recordId: firehoseRecordInput.recordId,
        data: firehoseRecordInput.data,
        result: 'ProcessingFailed',
      };
      firehoseRecordsOutput.records.push(firehoseReturnErrorResult);
    }
  }

  return await checkFirehoseRecords(firehoseRecordsOutput);
}

async function processFirehoseInputRecord(firehoseRecord: AWSLambda.FirehoseTransformationEventRecord) {
  const payload = Buffer.from(firehoseRecord.data, 'base64');
  const unzippedPayload = zlib.gunzipSync(payload).toString('utf-8');
  const jsonParsedPayload = JSON.parse(unzippedPayload);

  // only process payload that has logGroup prefix
  if ('logGroup' in jsonParsedPayload) {
    // check for dynamic partition
    const serviceName = await checkDynamicPartition(jsonParsedPayload);

    // parse record to have year/month/date prefix
    const firehoseTimestamp = new Date(firehoseRecord.approximateArrivalTimestamp);
    const prefixes = await getDatePrefix(serviceName, firehoseTimestamp);

    // these are mandatory prefixes for firehose payload
    const partitionKeys = {
      dynamicPrefix: prefixes,
    };
    const firehoseReturnResult: AWSLambda.FirehoseTransformationResultRecord = {
      recordId: firehoseRecord.recordId,
      data: firehoseRecord.data,
      result: 'Ok',
    };

    firehoseReturnResult.result = 'Ok';
    firehoseReturnResult.metadata = {
      partitionKeys,
    };
    return firehoseReturnResult;
  } else {
    // if there is no logGroup in payload do not process and forward to firehose
    // mark processing failed
    const firehoseReturnErrorResult: AWSLambda.FirehoseTransformationResultRecord = {
      recordId: firehoseRecord.recordId,
      data: firehoseRecord.data,
      result: 'ProcessingFailed',
    };
    return firehoseReturnErrorResult;
  }
}

// based on https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/ValidateLogEventFlow.html
interface CloudWatchLogsToFirehoseRecordLogEvents {
  id: string;
  timestamp: number;
  message: string;
}
interface CloudWatchLogsToFirehoseRecord {
  owner: string;
  logGroup: string;
  logStream: string;
  subscriptionFilters: string[];
  messageType: string;
  logEvents: CloudWatchLogsToFirehoseRecordLogEvents[];
}
async function checkDynamicPartition(firehoseRecordDynamicPartition: CloudWatchLogsToFirehoseRecord) {
  // data pattern for firehose dynamic mapping
  type S3LogPartitionType = {
    logGroupPattern: string;
    s3Prefix: string;
  };

  //Get mapping from environment
  let mappings: S3LogPartitionType[] | undefined;

  const dynamicPartitionMapping = process.env['DynamicS3LogPartitioningMapping']!;

  // if there is a mapping proceed to create a mapping
  if (dynamicPartitionMapping) {
    mappings = JSON.parse(fs.readFileSync(path.join(__dirname, dynamicPartitionMapping), 'utf-8'));
  }

  let serviceName = null;

  if (mappings) {
    for (const mapping of mappings) {
      if (firehoseRecordDynamicPartition.logGroup.indexOf(mapping.logGroupPattern) >= 0) {
        serviceName = mapping.s3Prefix;
        break; // Take the first match
      }
    }
  }
  return serviceName;
}

async function getDatePrefix(serviceName: string | null, inputTimestamp: Date) {
  let calculatedPrefix = 'CloudWatchLogs';
  if (serviceName) {
    calculatedPrefix += `/${serviceName}`;
  }

  calculatedPrefix += `/${inputTimestamp.getFullYear()}`;
  calculatedPrefix += `/${(inputTimestamp.getMonth() + 1).toLocaleString('en-US', {
    minimumIntegerDigits: 2,
  })}`;
  calculatedPrefix += `/${inputTimestamp.getDate().toLocaleString('en-US', { minimumIntegerDigits: 2 })}`;
  calculatedPrefix += `/${inputTimestamp.getHours().toLocaleString('en-US', { minimumIntegerDigits: 2 })}`;
  calculatedPrefix += `/`;

  return calculatedPrefix;
}

/**
 * Check firehose records going out of firehose records processor function.
 * If records are over 6MB then check if
 * - there are multiple records in event.records (event.records.length > 1), split the event.records into half, post that in kinesis stream and mark as failed
 * - there is single record in event.records (events.records.length === 1), uncompress data and check to see logEvents.length
 * -- logEvents.length > 1 split logEvents into half, post it in kinesis stream and mark this processing as failed
 * -- logEvents.length === 1 this means compressed payload is too large for lambda to send to kinesis. Fail with message that payload is too large with logGroup and logStream name to help troubleshoot further
 */

async function checkFirehoseRecords(firehoseRecordsOutput: AWSLambda.FirehoseTransformationResult) {
  /**
   * Initial check to see if records are over 6MB.
   * 6MB is exactly 6291456 in binary, this code is assuming decimal so cut off will be 6000000
   * Making this a variable incase lambda limits change in the future
   */
  const maxOutputPayload = parseInt(process.env['MaxOutputPayload']! ?? 6000000);
  if (JSON.stringify(firehoseRecordsOutput).length > maxOutputPayload) {
    console.log(
      `LARGE_PAYLOAD_FOUND output event recorded a payload over ${maxOutputPayload} bytes. Will try to split the records and place them back in the kinesis stream`,
    );
    await checkFirehoseRecordLength(firehoseRecordsOutput);
    return await markFirehoseRecordError(firehoseRecordsOutput);
  }

  return firehoseRecordsOutput;
}

async function checkFirehoseRecordLength(firehoseRecordsOutput: AWSLambda.FirehoseTransformationResult) {
  /**
   * Check for record length. If there is only 1 record uncompress the data
   * If the record length is greater than 1 then split the records
   * If both the conditions are not met then fail the function
   */
  if (firehoseRecordsOutput.records.length === 1) {
    await checkCloudWatchLog(firehoseRecordsOutput.records[0]);
  } else if (firehoseRecordsOutput.records.length > 1) {
    await splitFirehoseRecords(firehoseRecordsOutput);
  } else {
    // adding a unique prefix to make insights or log analysis easier.
    throw new Error(
      `NO_RECORDS_FOUND There were no records found in the output. Output event is: ${JSON.stringify(
        firehoseRecordsOutput,
      )}`,
    );
  }
}

async function checkCloudWatchLog(singleRecord: AWSLambda.FirehoseTransformationResultRecord) {
  const payload = Buffer.from(singleRecord.data, 'base64');
  const unzippedPayload = zlib.gunzipSync(payload).toString('utf-8');
  const jsonParsedPayload: CloudWatchLogsToFirehoseRecord = JSON.parse(unzippedPayload);
  if (jsonParsedPayload.logEvents.length === 1) {
    // adding a unique prefix to make insights or log analysis easier. The log group and log stream is printed out to help troubleshoot
    throw new Error(
      `SINGLE_LARGE_FIREHOSE_PAYLOAD LogGroup: ${jsonParsedPayload.logGroup} with LogStream: ${jsonParsedPayload.logStream} has a single record with compressed data over 6000000`,
    );
  } else if (jsonParsedPayload.logEvents.length > 1) {
    //split logEvents
    const halfSizeLogEvents = Math.floor(jsonParsedPayload.logEvents.length / 2);
    const firstHalfLogEventsArray: CloudWatchLogsToFirehoseRecordLogEvents[] = jsonParsedPayload.logEvents.slice(
      0,
      halfSizeLogEvents,
    );
    const secondHalfLogEventsArray: CloudWatchLogsToFirehoseRecordLogEvents[] = jsonParsedPayload.logEvents.slice(
      halfSizeLogEvents,
      jsonParsedPayload.logEvents.length,
    );

    // reconstruct the CloudWatch payload in 2 arrays
    const firstHalfKinesisData = await encodeZipRecords(
      firstHalfLogEventsArray,
      jsonParsedPayload.owner,
      jsonParsedPayload.logGroup,
      jsonParsedPayload.logStream,
      jsonParsedPayload.subscriptionFilters,
      jsonParsedPayload.messageType,
    );
    const secondHalfKinesisData = await encodeZipRecords(
      secondHalfLogEventsArray,
      jsonParsedPayload.owner,
      jsonParsedPayload.logGroup,
      jsonParsedPayload.logStream,
      jsonParsedPayload.subscriptionFilters,
      jsonParsedPayload.messageType,
    );

    await postRecordsToStream({
      Records: [firstHalfKinesisData, secondHalfKinesisData],
      StreamARN: process.env['KinesisStreamArn']!,
    });
  }
}

function encodeZipRecords(
  records: CloudWatchLogsToFirehoseRecordLogEvents[],
  recordOwner: string,
  recordLogGroup: string,
  recordLogStream: string,
  recordSubscriptionFilters: string[],
  recordMessageType: string,
) {
  const payload: CloudWatchLogsToFirehoseRecord = {
    owner: recordOwner,
    logGroup: recordLogGroup,
    logStream: recordLogStream,
    subscriptionFilters: recordSubscriptionFilters,
    messageType: recordMessageType,
    logEvents: records,
  };
  // compression level 6 as per docs:
  // https://docs.aws.amazon.com/firehose/latest/dev/writing-with-cloudwatch-logs.html
  return {
    Data: zlib.gzipSync(Buffer.from(JSON.stringify(payload)), { level: 6 }).toString('base64'),
    PartitionKey: uuid.v4(),
  };
}

async function postRecordsToStream(recordsInput: AWS.Kinesis.PutRecordsInput) {
  // take records and post it to stream
  // records should be base64 encoded and compressed
  // Each shard can support writes up to 1,000 records per second, up to a maximum data write total of 1 MiB per second.
  // Note: When invoking this API, it is recommended you use the StreamARN input parameter rather than the StreamName input parameter.

  const solutionId = process.env['SOLUTION_ID'];
  const kinesisClient = new AWS.Kinesis({ customUserAgent: solutionId });
  await throttlingBackOff(() => kinesisClient.putRecords(recordsInput).promise());
}

async function splitFirehoseRecords(records: AWSLambda.FirehoseTransformationResult) {
  //split logEvents
  const halfSizeLogEvents = Math.floor(records.records.length / 2);
  const firstHalfFirehoseRecordsArray: AWSLambda.FirehoseTransformationResultRecord[] = records.records.slice(
    0,
    halfSizeLogEvents,
  );
  const secondHalfFirehoseRecordsArray: AWSLambda.FirehoseTransformationResultRecord[] = records.records.slice(
    halfSizeLogEvents,
    records.records.length,
  );
  await parseFirehoseRecordsForKinesisStream(firstHalfFirehoseRecordsArray);
  await parseFirehoseRecordsForKinesisStream(secondHalfFirehoseRecordsArray);
}

async function parseFirehoseRecordsForKinesisStream(records: AWSLambda.FirehoseTransformationResultRecord[]) {
  const kinesisDataPayload = [];
  for (const record of records) {
    const singleRecord = { Data: record.data, PartitionKey: uuid.v4() };
    kinesisDataPayload.push(singleRecord);
  }
  await postRecordsToStream({ Records: kinesisDataPayload, StreamARN: process.env['KinesisStreamArn']! });
}

async function markFirehoseRecordError(firehoseRecordsOutput: AWSLambda.FirehoseTransformationResult) {
  const errorRecords = [];
  for (const record of firehoseRecordsOutput.records) {
    const firehoseReturnErrorResult: AWSLambda.FirehoseTransformationResultRecord = {
      recordId: record.recordId,
      data: record.data,
      result: 'ProcessingFailed',
    };
    errorRecords.push(firehoseReturnErrorResult);
  }
  return { records: errorRecords };
}
