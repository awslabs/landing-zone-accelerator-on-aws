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
import { wildcardMatch } from '@aws-accelerator/utils/lib/common-functions';
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
const logKmsKeyArn = process.env['LogKmsKeyArn'];
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
      await updateSubscriptionPolicy(logGroup, logExclusionParse);
      await updateKmsKey(logGroup, logKmsKeyArn);
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
  logGroup: AWS.CloudWatchLogs.LogGroup,
  logExclusionSetting: cloudwatchExclusionProcessedItem | undefined,
) {
  let isGroupExcluded = false;
  if (logExclusionSetting) {
    isGroupExcluded = await isLogGroupExcluded(logGroup.logGroupName!, logExclusionSetting);
  }

  const subscriptionFilters = await getExistingSubscriptionFilters(logGroup.logGroupName!);
  const hasAcceleratorFilter = await hasAcceleratorSubscriptionFilter(subscriptionFilters, logGroup.logGroupName!);

  if (isGroupExcluded && hasAcceleratorFilter) {
    // delete accelerator filter if log group is excluded
    await deleteSubscription(logGroup.logGroupName!);
  } else if (!isGroupExcluded && !hasAcceleratorFilter) {
    // create the accelerator subscription filter for this logGroup
    await setupSubscription(logGroup.logGroupName!);
  }
}

export async function hasAcceleratorSubscriptionFilter(
  filters: AWS.CloudWatchLogs.SubscriptionFilter[],
  logGroupName: string,
) {
  if (filters.length < 1) {
    return false;
  } else if (filters.some(filter => filter.filterName === logGroupName)) {
    return true;
  }
  return false;
}

export async function getExistingSubscriptionFilters(logGroupName: string) {
  const subscriptionFilters = [];

  // check subscription on existing logGroup.
  let nextToken: string | undefined = undefined;
  do {
    const page = await throttlingBackOff(() =>
      logsClient.describeSubscriptionFilters({ logGroupName: logGroupName, nextToken }).promise(),
    );
    for (const subFilter of page.subscriptionFilters ?? []) {
      subscriptionFilters.push(subFilter);
    }

    nextToken = page.nextToken;
  } while (nextToken);
  return subscriptionFilters;
}

export async function isLogGroupExcluded(logGroupName: string, logExclusionSetting: cloudwatchExclusionProcessedItem) {
  if (logExclusionSetting.excludeAll) {
    return true;
  } else if (logExclusionSetting?.logGroupNames && logExclusionSetting.logGroupNames!.length > 0) {
    // check input string and if matched return true
    for (const excludeLogs of logExclusionSetting.logGroupNames) {
      if (wildcardMatch(logGroupName, excludeLogs)) {
        return true;
      }
    }
  }
  return false;
}

export async function deleteSubscription(logGroupName: string) {
  console.log(`Deleting subscription for log group ${logGroupName}`);
  try {
    await throttlingBackOff(() =>
      logsClient.deleteSubscriptionFilter({ logGroupName: logGroupName, filterName: logGroupName }).promise(),
    );
  } catch (e) {
    console.warn(`Failed to delete subscription filter ${logGroupName} for log group ${logGroupName}`);
  }
}

export async function setupSubscription(logGroupName: string) {
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

export async function updateKmsKey(logGroupValue: AWS.CloudWatchLogs.LogGroup, logKmsKeyArn?: string) {
  // check kmsKey on existing logGroup.
  if (logGroupValue.kmsKeyId) {
    // if there is a KMS do nothing
    console.log('Log Group: ' + logGroupValue.logGroupName! + ' has kms set');
    return;
  }
  if (!logKmsKeyArn) {
    // when no Kms Key arn provided
    console.log(
      `Accelerator KMK key ${logKmsKeyArn} not provided for Log Group ${logGroupValue.logGroupName!}, log group encryption not performed`,
    );
    return;
  }
  // there is no KMS set one
  console.log(`Setting KMS for log group ${logGroupValue.logGroupName}`);
  await throttlingBackOff(() =>
    logsClient
      .associateKmsKey({
        logGroupName: logGroupValue.logGroupName!,
        kmsKeyId: logKmsKeyArn,
      })
      .promise(),
  );
}
