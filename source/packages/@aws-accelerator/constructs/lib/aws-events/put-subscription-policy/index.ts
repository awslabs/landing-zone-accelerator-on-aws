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

export type cloudwatchExclusionProcessedItem = {
  account: string;
  region: string;
  excludeAll?: boolean;
  logGroupNames?: string[];
};

const logSubscriptionRoleArn = process.env['LogSubscriptionRole']!;
const logDestinationArn = process.env['LogDestination']!;
const logRetention = process.env['LogRetention']!;
const logKmsKey = process.env['LogKmsKeyArn']!;
const logExclusionSetting = process.env['LogExclusion']!;
const solutionId = process.env['SOLUTION_ID'];

const logsClient = new AWS.CloudWatchLogs({ customUserAgent: solutionId });
let logExclusionParse: cloudwatchExclusionProcessedItem | undefined;
if (logExclusionSetting) {
  logExclusionParse = JSON.parse(logExclusionSetting);
} else {
  logExclusionParse = undefined;
}
export async function handler(event: AWSLambda.ScheduledEvent) {
  const logGroupName = event.detail.requestParameters.logGroupName as string;

  let nextToken: string | undefined = undefined;
  do {
    const page = await throttlingBackOff(() =>
      logsClient.describeLogGroups({ nextToken, logGroupNamePrefix: logGroupName }).promise(),
    );
    for (const logGroup of page.logGroups ?? []) {
      await updateRetentionPolicy(logRetention, logGroup);
      await updateSubscriptionPolicy(logDestinationArn, logSubscriptionRoleArn, logGroup, logExclusionParse);
      await updateKmsKey(logGroup, logKmsKey);
    }
    nextToken = page.nextToken;
  } while (nextToken);
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
  logDestinationArnValue: string,
  logSubscriptionRoleArnValue: string,
  logGroup: AWS.CloudWatchLogs.LogGroup,
  logExclusionSetting: cloudwatchExclusionProcessedItem | undefined,
) {
  // check subscription on existing logGroup.
  let nextToken: string | undefined = undefined;
  do {
    const page = await throttlingBackOff(() =>
      logsClient.describeSubscriptionFilters({ logGroupName: logGroup.logGroupName!, nextToken }).promise(),
    );

    const page_length: number = page.subscriptionFilters?.length || 0;

    if (logExclusionSetting) {
      await processExclusion(page, logGroup.logGroupName!, logExclusionSetting);
    } else {
      if (page_length > 0) {
        // there is a subscription filter for this log group. Check and set it if needed.
        for (const subFilter of page.subscriptionFilters ?? []) {
          // If destination exists, do nothing
          if (subFilter.destinationArn === logDestinationArnValue) {
            console.log('Log Group: ' + logGroup.logGroupName! + ' has destination set');
          } else {
            // If destination does not exist, set destination
            await setupSubscription(logDestinationArnValue, logSubscriptionRoleArnValue, logGroup.logGroupName!);
          }
        }
      } else {
        // there are no subscription filters for this logGroup. Set one
        await setupSubscription(logDestinationArn, logSubscriptionRoleArn, logGroup.logGroupName!);
      }
    }
    nextToken = page.nextToken;
  } while (nextToken);
}

export async function processExclusion(
  page: AWS.CloudWatchLogs.DescribeSubscriptionFiltersResponse,
  logGroupName: string,
  logExclusionSetting: cloudwatchExclusionProcessedItem,
) {
  if (logExclusionSetting.excludeAll) {
    const page_length: number = page.subscriptionFilters?.length || 0;
    if (page_length > 0) {
      // there is a subscription filter for this log group. Find and delete the one accelerator created.
      for (const subFilter of page.subscriptionFilters ?? []) {
        if (subFilter.filterName === logGroupName) {
          await deleteSubscription(logGroupName);
        }
      }
    }
  } else if (!logExclusionSetting.excludeAll && (logExclusionSetting.logGroupNames ?? [])) {
    // check to see if excludeAll is not provided and logGroupNames are provided
    // logGroupNames can be empty so check length
    if (logExclusionSetting.logGroupNames!.length > 0) {
      // check input string and if matched delete subscription filter
      await checkExclusionLogGroups(logExclusionSetting.logGroupNames!, logGroupName);
    }
  }
}

export async function checkExclusionLogGroups(excludeLogsList: string[], logGroupName: string) {
  // pick an item from exclude logs
  for (const excludeLogs of excludeLogsList) {
    if (excludeLogs.endsWith('*') && logGroupName.startsWith(excludeLogs.slice(0, -1))) {
      await deleteSubscription(logGroupName);
    } else if (logGroupName === excludeLogs) {
      await deleteSubscription(logGroupName);
    }
  }
}

export async function deleteSubscription(logGroupName: string) {
  console.log(`Deleting subscription for log group ${logGroupName}`);
  await throttlingBackOff(() =>
    logsClient.deleteSubscriptionFilter({ logGroupName: logGroupName, filterName: logGroupName }).promise(),
  );
}

export async function setupSubscription(
  logDestinationArnValue: string,
  logSubscriptionRoleArnValue: string,
  logGroupName: string,
) {
  console.log(`Setting destination ${logDestinationArnValue} for log group ${logGroupName}`);
  await throttlingBackOff(() =>
    logsClient
      .putSubscriptionFilter({
        destinationArn: logDestinationArnValue,
        logGroupName: logGroupName,
        roleArn: logSubscriptionRoleArnValue,
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
