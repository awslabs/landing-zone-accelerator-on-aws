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
import { throttlingBackOff } from '@aws-accelerator/utils';

const snsTopicArn: string = process.env['SNS_TOPIC_ARN'] ?? '';
const solutionId: string = process.env['SOLUTION_ID'] ?? '';

const snsClient = new SNSClient({ customUserAgent: solutionId });
/**
 * control-tower-notification-forwarder - lambda handler
 *
 * @param event
 * @returns
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handler(event: any): Promise<void> {
  console.log(JSON.stringify(event));
  console.log(event['Records']);
  console.log('Forwarding message to sns topic arn:', snsTopicArn);
  let subject = event['Records'][0]['Sns']['Subject'] || undefined;
  // skip config compliances changes
  if (subject == 'Config Rules Compliance Change') {
    console.log('Skipped forwarding message as subject was for config rules compliance change.');
    return;
  }
  if (subject === undefined) {
    console.log('Skipped forwarding message as no subject was provided.');
    return;
  }
  console.log('Subject: ', subject);
  let jsonMessage: Record<string, unknown> = {};
  let message = '';
  try {
    jsonMessage = JSON.parse(event['Records'][0]['Sns']['Message']);
    message = JSON.stringify(jsonMessage);
    console.log('Message: ', message);
    if (jsonMessage['detail-type']) {
      subject = jsonMessage['detail-type'];
    }
  } catch {
    console.log('Error parsing message content');
  }
  const params: PublishCommandInput = {
    Subject: subject,
    Message: message,
    TopicArn: snsTopicArn,
  };
  const response = await throttlingBackOff(() => snsClient.send(new PublishCommand(params)));
  console.log(response);
}
