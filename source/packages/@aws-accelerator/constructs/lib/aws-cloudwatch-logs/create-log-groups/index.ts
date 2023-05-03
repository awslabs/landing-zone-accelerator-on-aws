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
 * create-log-groups - lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent) {
  console.log(event);

  const logGroupName = event.ResourceProperties['logGroupName'];
  const retention = event.ResourceProperties['retention'];
  const encryptionKey = event.ResourceProperties['keyArn'];
  const terminationProtected = event.ResourceProperties['terminationProtected'];
  const region = event.ResourceProperties['region'];
  const solutionId = process.env['SOLUTION_ID'];
  const logClient = new AWS.CloudWatchLogs({ region: region, customUserAgent: solutionId });

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      console.log('Creating or updating log groups');
      try {
        // Retrieve existing CloudWatch Logs Group
        const existingLogGroups = await throttlingBackOff(() =>
          logClient
            .describeLogGroups({
              logGroupNamePrefix: logGroupName,
            })
            .promise(),
        );
        const existingLogGroup = existingLogGroups.logGroups?.find(lg => lg.logGroupName === logGroupName);

        // Code Block for CloudWatch Log Group that exists
        if (existingLogGroup) {
          console.warn(`Log Group already exists : ${logGroupName}`);
          if (encryptionKey) {
            await associateKey(logClient, encryptionKey, logGroupName);
          }
        }
        // Code Block for CloudWatch Log Group if it doesn't exist
        else {
          console.log(`Log Group doesn't exist.`);
          await throttlingBackOff(() =>
            logClient
              .createLogGroup({
                logGroupName: logGroupName,
                kmsKeyId: encryptionKey,
              })
              .promise(),
          );
        }
      } catch (error) {
        throw new Error(`Cannot create log group: ${logGroupName}. Error: ${JSON.stringify(error)}`);
      }
      try {
        console.log(`Modifying log group ${logGroupName} retention and expiration policy`);
        await putPolicy(logClient, logGroupName, retention);
      } catch (error) {
        throw new Error(`Cannot put log group retention on log group ${logGroupName}. Error: ${JSON.stringify(error)}`);
      }
      return {
        PhysicalResourceId: logGroupName,
        Data: { LogGroupName: logGroupName },
        Status: 'SUCCESS',
      };

    case 'Delete':
      try {
        if (terminationProtected === 'false') {
          console.log(`The Log Group ${logGroupName} is not set to retain. Deleting log group.`);
          const existingLogGroups = await throttlingBackOff(() =>
            logClient
              .describeLogGroups({
                logGroupNamePrefix: logGroupName,
              })
              .promise(),
          );
          const existingLogGroup = existingLogGroups.logGroups?.find(lg => lg.logGroupName === logGroupName);
          if (existingLogGroup) {
            deleteLogGroup(logClient, logGroupName);
          } else {
            console.log(`The Log Group ${logGroupName} does not exist.`);
            return {
              PhysicalResourceId: event.PhysicalResourceId,
              Status: 'SUCCESS',
            };
          }
        } else {
          console.log(`The Log Group ${logGroupName} is set to retain.`);
        }
      } catch (error) {
        throw new Error(`Cannot delete log group ${logGroupName}. Error: ${JSON.stringify(error)}`);
      }
      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}

async function associateKey(logClient: AWS.CloudWatchLogs, kmsKeyId: string, logGroupName: string) {
  await throttlingBackOff(() =>
    logClient
      .associateKmsKey({
        logGroupName,
        kmsKeyId,
      })
      .promise(),
  );
}

async function putPolicy(logClient: AWS.CloudWatchLogs, logGroupName: string, retention: number) {
  await throttlingBackOff(() =>
    logClient
      .putRetentionPolicy({
        logGroupName,
        retentionInDays: retention,
      })
      .promise(),
  );
}

async function deleteLogGroup(logClient, logGroupName) {
  await throttlingBackOff(() =>
    logClient
      .deleteLogGroup({
        logGroupName,
      })
      .promise(),
  );
}
