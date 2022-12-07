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
AWS.config.logger = console;

/**
 * add-macie-members - lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent): Promise<
  | {
      Status: string | undefined;
      StatusCode: number | undefined;
    }
  | undefined
> {
  const directoryId = event.ResourceProperties['directoryId'];
  const logGroupName = event.ResourceProperties['logGroupName'];
  const solutionId = process.env['SOLUTION_ID'];

  const directoryServiceClient = new AWS.DirectoryService({ customUserAgent: solutionId });

  const existingLogGroups = await getExistingLogGroups(directoryServiceClient, directoryId);

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      console.log('start createLogSubscription');
      if (existingLogGroups.indexOf(logGroupName) === -1) {
        await throttlingBackOff(() =>
          directoryServiceClient
            .createLogSubscription({
              DirectoryId: directoryId,
              LogGroupName: logGroupName,
            })
            .promise(),
        );
      } else {
        console.warn(`Log group ${logGroupName} already subscribed for the directory service`);
      }

      return { Status: 'Success', StatusCode: 200 };

    case 'Delete':
      console.log('start deleteLogSubscription');
      if (existingLogGroups.indexOf(logGroupName) !== -1) {
        await throttlingBackOff(() =>
          directoryServiceClient
            .deleteLogSubscription({
              DirectoryId: directoryId,
            })
            .promise(),
        );
      } else {
        console.warn(`Log group ${logGroupName} subscription not found to delete`);
      }
      return { Status: 'Success', StatusCode: 200 };
  }
}

/**
 * Function to get existing log group names
 * @param directoryServiceClient
 * @param directoryId
 * @returns
 */
async function getExistingLogGroups(
  directoryServiceClient: AWS.DirectoryService,
  directoryId: string,
): Promise<string[]> {
  const logGroupNames: string[] = [];
  let nextToken: string | undefined = undefined;
  do {
    const page = await throttlingBackOff(() =>
      directoryServiceClient
        .listLogSubscriptions({
          DirectoryId: directoryId,
          NextToken: nextToken,
        })
        .promise(),
    );

    for (const LogSubscription of page.LogSubscriptions ?? []) {
      if (LogSubscription.LogGroupName) {
        logGroupNames.push(LogSubscription.LogGroupName);
      }
    }
    nextToken = page.NextToken;
  } while (nextToken);

  return logGroupNames;
}
