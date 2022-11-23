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

import { SNSClient, PublishCommand, PublishCommandInput } from '@aws-sdk/client-sns';
import { SNSEvent } from 'aws-lambda';
import { throttlingBackOff } from '@aws-accelerator/utils';

const partition: string = process.env['PARTITION'] ?? 'aws';
const centralAccount = process.env['SNS_CENTRAL_ACCOUNT'];
const region = process.env['AWS_REGION'];

const snsClient = new SNSClient({ customUserAgent: process.env['SOLUTION_ID'] });
/**
 * control-tower-notification-forwarder - lambda handler
 *
 * @param event
 * @returns
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handler(event: SNSEvent): Promise<void> {
  console.log(JSON.stringify(event));

  const snsNotification = event.Records[0].Sns;
  const topicArn = snsNotification.TopicArn;
  const topicName = topicArn.split(':').pop();

  const destinationArn = `arn:${partition}:sns:${region}:${centralAccount}:${topicName}`;

  console.log('Forwarding message to sns topic arn:', destinationArn);

  const subject = snsNotification.Subject;
  console.log('Subject: ', subject);
  const message = snsNotification.Message;

  const params: PublishCommandInput = {
    Subject: subject,
    Message: message,
    TopicArn: destinationArn,
  };
  const response = await throttlingBackOff(() => snsClient.send(new PublishCommand(params)));
  console.log(response);
}
