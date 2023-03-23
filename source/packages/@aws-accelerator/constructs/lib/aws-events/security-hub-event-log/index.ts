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

import { throttlingBackOff } from '@aws-accelerator/utils';
import * as AWS from 'aws-sdk';
import * as uuid from 'uuid';

AWS.config.logger = console;
const solutionId = process.env['SOLUTION_ID'];
const acceleratorPrefix = process.env['ACCELERATOR_PREFIX'];
const logsClient = new AWS.CloudWatchLogs({ customUserAgent: solutionId });
const snsClient = new AWS.SNS({ customUserAgent: solutionId });

export async function handler(event: AWSLambda.ScheduledEvent) {
  // Make sure event comes from Security Hub if not do not process
  if (event.source !== 'aws.securityhub') {
    throw new Error('Not a Security Hub event');
  }

  // Check the account for log group /AWSAccelerator-SecurityHub
  // Create log group if none is found
  await checkLogGroup();

  await publishEventToSns(event);

  // Send event to CloudWatchLogs
  await publishEventToLogs(event);
}

export async function publishEventToLogs(input: AWSLambda.ScheduledEvent) {
  const logStreamName = `${new Date().toISOString().slice(0, 10)}-${uuid.v4()}`;
  const logGroupName = `/${acceleratorPrefix}-SecurityHub`;
  await throttlingBackOff(() => logsClient.createLogStream({ logGroupName, logStreamName }).promise());
  await throttlingBackOff(() =>
    logsClient
      .putLogEvents({
        logGroupName,
        logStreamName,
        logEvents: [{ timestamp: Date.now(), message: JSON.stringify(input) }],
      })
      .promise(),
  );
}

export async function publishEventToSns(input: AWSLambda.ScheduledEvent) {
  const snsTopicArn = process.env['SNS_TOPIC_ARN'];
  const notificationLevel = process.env['NOTIFICATION_LEVEL'];

  if (!snsTopicArn || !notificationLevel) {
    console.log('Either no snsTopic or notificationLevel provided, skipping notification');
    return;
  }
  try {
    const severity = input.detail['findings'][0]['Severity']['Label'];

    console.log(`***Severity: ${severity}***`);
    console.log(`***NotificationLevel: ${notificationLevel}***`);
    let sendNotification = false;
    switch (notificationLevel) {
      case 'CRITICAL':
        if (severity === 'CRITICAL') {
          sendNotification = true;
        }
        break;
      case 'HIGH':
        if (severity === 'HIGH' || severity === 'CRITICAL') {
          sendNotification = true;
        }
        break;
      case 'MEDIUM':
        if (severity === 'MEDIUM' || severity === 'HIGH' || severity === 'CRITICAL') {
          sendNotification = true;
        }
        break;
      case 'LOW':
        if (severity === 'LOW' || severity === 'MEDIUM' || severity === 'HIGH' || severity === 'CRITICAL') {
          sendNotification = true;
        }
        break;
      default:
        sendNotification = true;
    }
    if (sendNotification) {
      await throttlingBackOff(() =>
        snsClient
          .publish({
            TopicArn: snsTopicArn,
            Subject: `SecurityHub ${severity} Notification`,
            Message: JSON.stringify(input.detail['findings'][0], null, 2),
          })
          .promise(),
      );
    }
  } catch (e) {
    console.error(`***Failed SNS notification processing***`);
    console.error(e);
  }
}

export async function checkLogGroup() {
  const securityHubLogGroupName = `/${acceleratorPrefix}-SecurityHub`;
  const nextToken: string | undefined = undefined;
  do {
    const page = await throttlingBackOff(() =>
      logsClient.describeLogGroups({ nextToken, logGroupNamePrefix: securityHubLogGroupName }).promise(),
    );

    const pageLength: number = page.logGroups?.length || 0;
    if (pageLength > 0) {
      //there is a log group. Check name
      for (const logGroup of page.logGroups ?? []) {
        if (logGroup.logGroupName === securityHubLogGroupName) {
          // there is an existing log group with required name
          return;
        }
      }
    } else {
      // checked all log groups. They might be similar prefix but they do not have exact name.
      // Or there is no log group with this specific prefix
      // Create one with exact name
      //console.log(`Creating log group: ${securityHubLogGroupName}`);
      await throttlingBackOff(() => logsClient.createLogGroup({ logGroupName: securityHubLogGroupName }).promise());
    }
  } while (nextToken);
}
