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

  return firehoseRecordsOutput;
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
type CloudWatchLogsToFirehoseRecord = {
  owner: string;
  logGroup: string;
  logStream: string;
  subscriptionFilters: string[];
  messageType: string;
  logEvents: [
    {
      id: string;
      timestamp: number;
      message: string;
    },
  ];
};

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
