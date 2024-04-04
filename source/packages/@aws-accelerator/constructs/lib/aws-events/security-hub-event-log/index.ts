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

import { setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';
import {
  CloudWatchLogsClient,
  CreateLogGroupCommand,
  PutResourcePolicyCommand,
  ResourceAlreadyExistsException,
} from '@aws-sdk/client-cloudwatch-logs';
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';

const solutionId = process.env['SOLUTION_ID'];
const logsClient = new CloudWatchLogsClient({ customUserAgent: solutionId, retryStrategy: setRetryStrategy() });

export async function handler(event: CloudFormationCustomResourceEvent) {
  console.log(event);

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      const logGroupName = event.ResourceProperties['logGroupName'];
      const logGroupArn = event.ResourceProperties['logGroupArn'];

      // Create the log group /AWSAccelerator-SecurityHub (if a specified log group name wasn't provided) if it does not exist.
      await createLogGroup(logGroupName);
      // Update resource policy
      await putLogGroupResourcePolicy(logGroupArn);
      return {
        PhysicalResourceId: undefined,
        Status: 'SUCCESS',
      };

    case 'Delete':
      // Do Nothing
      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}

export async function putLogGroupResourcePolicy(logGroupArn: string) {
  const policyDocument = await generateResourcePolicy(logGroupArn);
  console.log('Attempting to update resource policy on CloudWatch log group');
  try {
    await logsClient.send(
      new PutResourcePolicyCommand({
        policyDocument,
        policyName: 'TrustEventsToStoreLogEvent',
      }),
    );
  } catch (e: unknown) {
    console.log('Encountered an error putting resource policy on log group');
    throw e;
  }
}

export async function generateResourcePolicy(logGroupArn: string) {
  return JSON.stringify({
    Statement: [
      {
        Action: ['logs:CreateLogStream', 'logs:PutLogEvents'],
        Effect: 'Allow',
        Principal: {
          Service: ['events.amazonaws.com', 'delivery.logs.amazonaws.com'],
        },
        Resource: logGroupArn,
        Sid: 'TrustEventsToStoreLogs',
      },
    ],
    Version: '2012-10-17',
  });
}

export async function createLogGroup(logGroupName: string) {
  try {
    console.log(`Attempting to create CloudWatch log group ${logGroupName}`);
    await logsClient.send(new CreateLogGroupCommand({ logGroupName: logGroupName }));
  } catch (e) {
    if (e instanceof ResourceAlreadyExistsException) {
      console.log(`Found existing CloudWatch log group ${logGroupName}, continuing`);
    } else {
      throw e;
    }
  }
}
