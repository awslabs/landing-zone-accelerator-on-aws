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
 * update-subscription-policy - lambda handler
 *
 * @param event
 * @returns
 */
const logsClient = new AWS.CloudWatchLogs();

export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent): Promise<
  | {
      Status: string;
    }
  | undefined
> {
  // Post event in case a manual override is needed
  console.log(event);
  const logSubscriptionRoleArn = event.ResourceProperties['LogSubscriptionRole']!;
  const logDestinationArn = event.ResourceProperties['LogDestination']!;
  const logRetention = event.ResourceProperties['LogRetention']!;
  const logKmsKey = event.ResourceProperties['LogKmsKeyArn']!;

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      let nextToken: string | undefined = undefined;
      do {
        const page = await throttlingBackOff(() => logsClient.describeLogGroups({ nextToken }).promise());
        for (const logGroup of page.logGroups ?? []) {
          await updateRetentionPolicy(logRetention, logGroup);
          await updateSubscriptionPolicy(logDestinationArn, logSubscriptionRoleArn, logGroup);
          await updateKmsKey(logGroup, logKmsKey);
        }
        nextToken = page.nextToken;
      } while (nextToken);
      return { Status: 'SUCCESS' };
    case 'Delete':
      // Do Nothing
      return { Status: 'SUCCESS' };
  }
}

export async function updateRetentionPolicy(logRetentionValue: string, logGroupValue: AWS.CloudWatchLogs.LogGroup) {
  // filter out logGroups that already have retention set
  if (logGroupValue.retentionInDays === parseInt(logRetentionValue)) {
    console.log('Log Group: ' + logGroupValue.logGroupName! + ' has the right retention period');
  } else if (logGroupValue.logGroupName!.includes('aws-controltower')) {
    console.log(
      `Log Group: ${logGroupValue.logGroupName} retention cannot be changed as its enforced by AWS Control Tower`,
    );
  } else {
    console.log(`Setting retention of ${logRetentionValue} for log group ${logGroupValue.logGroupName}`);
    await throttlingBackOff(() =>
      logsClient
        .putRetentionPolicy({
          logGroupName: logGroupValue.logGroupName!,
          retentionInDays: parseInt(logRetentionValue),
        })
        .promise(),
    );
  }
}

export async function updateSubscriptionPolicy(
  logDestinationArn: string,
  logSubscriptionRoleArn: string,
  logGroup: AWS.CloudWatchLogs.LogGroup,
) {
  // check subscription on existing logGroup.
  let nextToken: string | undefined = undefined;
  do {
    const page = await throttlingBackOff(() =>
      logsClient.describeSubscriptionFilters({ logGroupName: logGroup.logGroupName!, nextToken }).promise(),
    );
    const page_length: number = page.subscriptionFilters?.length || 0;

    if (page_length > 0) {
      // there is a subscription filter for this log group. Check and set it if needed.
      for (const subFilter of page.subscriptionFilters ?? []) {
        // If destination exists, do nothing
        if (subFilter.destinationArn === logDestinationArn) {
          console.log('Log Group: ' + logGroup.logGroupName! + ' has destination set');
        } else {
          // If destination does not exist, set destination
          await setupSubscription(logDestinationArn, logSubscriptionRoleArn, logGroup.logGroupName!);
        }
      }
    } else {
      // there are no subscription filters for this logGroup. Set one
      await setupSubscription(logDestinationArn, logSubscriptionRoleArn, logGroup.logGroupName!);
    }
    nextToken = page.nextToken;
  } while (nextToken);
}

export async function setupSubscription(
  logDestinationArn: string,
  logSubscriptionRoleArn: string,
  logGroupName: string,
) {
  console.log(`Setting destination ${logDestinationArn} for log group ${logGroupName}`);
  await throttlingBackOff(() =>
    logsClient
      .putSubscriptionFilter({
        destinationArn: logDestinationArn,
        logGroupName: logGroupName,
        roleArn: logSubscriptionRoleArn,
        filterName: logGroupName,
        filterPattern: '',
      })
      .promise(),
  );
}

export async function updateKmsKey(logGroupValue: AWS.CloudWatchLogs.LogGroup, logKmsKeyValue: string) {
  // check kmsKey on existing logGroup.
  if (logGroupValue.kmsKeyId) {
    // if there is a KMS do nothing
    console.log('Log Group: ' + logGroupValue.logGroupName! + ' has kms set');
  } else {
    // there is no KMS set one
    console.log(`Setting KMS for log group ${logGroupValue.logGroupName}`);
    await throttlingBackOff(() =>
      logsClient
        .associateKmsKey({
          logGroupName: logGroupValue.logGroupName!,
          kmsKeyId: logKmsKeyValue,
        })
        .promise(),
    );
  }
}
