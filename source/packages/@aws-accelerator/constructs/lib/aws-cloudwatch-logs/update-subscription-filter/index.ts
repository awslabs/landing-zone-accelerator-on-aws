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
/**
 * update-subscription-policy - lambda handler
 *
 * @param event
 * @returns
 */

export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent): Promise<
  | {
      Status: string;
    }
  | undefined
> {
  const acceleratorLogSubscriptionRoleArn: string = event.ResourceProperties['acceleratorLogSubscriptionRoleArn'];
  const acceleratorCreatedLogDestinationArn: string = event.ResourceProperties['acceleratorCreatedLogDestinationArn'];
  const acceleratorLogRetentionInDays: string = event.ResourceProperties['acceleratorLogRetentionInDays'];
  const acceleratorLogKmsKeyArn: string = event.ResourceProperties['acceleratorLogKmsKeyArn'];

  const logExclusionOption: string | undefined = event.ResourceProperties['logExclusionOption'];
  const replaceLogDestinationArn: string | undefined = event.ResourceProperties['replaceLogDestinationArn'];
  const solutionId = process.env['SOLUTION_ID'];

  let logExclusionParse: cloudwatchExclusionProcessedItem | undefined;
  if (logExclusionOption) {
    logExclusionParse = JSON.parse(logExclusionOption);
  } else {
    logExclusionParse = undefined;
  }

  const logsClient = new AWS.CloudWatchLogs({ customUserAgent: solutionId });
  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      const logGroups = await getLogGroups(logsClient, acceleratorCreatedLogDestinationArn, logExclusionParse);

      // Process retention and encryption setting for ALL log groups
      for (const allLogGroup of logGroups.allLogGroups) {
        await updateRetentionPolicy(logsClient, parseInt(acceleratorLogRetentionInDays), allLogGroup);

        await updateLogGroupEncryption(logsClient, allLogGroup, acceleratorLogKmsKeyArn);
      }

      // Process subscription only for included log groups
      for (const includedLogGroup of logGroups.includedLogGroups) {
        await manageLogSubscriptions(
          logsClient,
          includedLogGroup.logGroupName!,
          acceleratorCreatedLogDestinationArn,
          acceleratorLogSubscriptionRoleArn,
          replaceLogDestinationArn,
        );
      }
      break;
    case 'Delete':
      // Remove the subscription filter
      // let nextToken: string | undefined = undefined;
      await deleteAllLogGroupSubscriptions(logsClient, acceleratorCreatedLogDestinationArn);
      break;
  }
  return { Status: 'SUCCESS' };
}

/**
 * Function to process log replication exclusion list and return inclusion list of log groups and all log groups list
 * @param logsClient {@link AWS.CloudWatchLogs}
 * @param acceleratorCreatedLogDestinationArn string
 * @param logExclusionSetting {@link cloudwatchExclusionProcessedItem}
 * @returns
 */
async function getLogGroups(
  logsClient: AWS.CloudWatchLogs,
  acceleratorCreatedLogDestinationArn: string,
  logExclusionSetting?: cloudwatchExclusionProcessedItem,
): Promise<{ allLogGroups: AWS.CloudWatchLogs.LogGroup[]; includedLogGroups: AWS.CloudWatchLogs.LogGroup[] }> {
  const allLogGroups: AWS.CloudWatchLogs.LogGroup[] = [];
  const includedLogGroups: AWS.CloudWatchLogs.LogGroup[] = [];

  let nextToken: string | undefined;
  do {
    const page = await throttlingBackOff(() => logsClient.describeLogGroups({ nextToken }).promise());
    for (const logGroup of page.logGroups ?? []) {
      if (!logGroup.logGroupName!.includes('aws-controltower')) {
        allLogGroups.push(logGroup);
        if (isLogGroupExcluded(logGroup.logGroupName!, logExclusionSetting)) {
          await deleteSubscription(logsClient, logGroup.logGroupName!, acceleratorCreatedLogDestinationArn);
        } else {
          includedLogGroups.push(logGroup);
        }
      }
    }
    nextToken = page.nextToken;
  } while (nextToken);

  if (logExclusionSetting?.excludeAll) {
    await deleteAllLogGroupSubscriptions(logsClient, acceleratorCreatedLogDestinationArn);
    return { allLogGroups: allLogGroups, includedLogGroups: [] };
  }

  return { allLogGroups: allLogGroups, includedLogGroups: includedLogGroups };
}

/**
 * Function to delete solution configured log subscriptions for every cloud watch log groups
 * @param logsClient {@link AWS.CloudWatchLogs}
 * @param logGroupName string
 * @param acceleratorCreatedLogDestinationArn string
 *
 */
async function deleteAllLogGroupSubscriptions(
  logsClient: AWS.CloudWatchLogs,
  acceleratorCreatedLogDestinationArn: string,
) {
  let nextToken: string | undefined;
  do {
    const page = await throttlingBackOff(() => logsClient.describeLogGroups({ nextToken }).promise());
    for (const logGroup of page.logGroups ?? []) {
      await deleteSubscription(logsClient, logGroup.logGroupName!, acceleratorCreatedLogDestinationArn);
    }
    nextToken = page.nextToken;
  } while (nextToken);
}

/**
 * Function to update log retention policy
 * @param logsClient {@link AWS.CloudWatchLogs}
 * @param acceleratorRetentionInDays number
 * @param logGroup {@link AWS.CloudWatchLogs.LogGroup}
 * @returns
 */
async function updateRetentionPolicy(
  logsClient: AWS.CloudWatchLogs,
  acceleratorRetentionInDays: number,
  logGroup: AWS.CloudWatchLogs.LogGroup,
) {
  const currentRetentionInDays = logGroup.retentionInDays;
  if (!currentRetentionInDays) {
    return;
  }

  if (acceleratorRetentionInDays > currentRetentionInDays) {
    await throttlingBackOff(() =>
      logsClient
        .putRetentionPolicy({
          logGroupName: logGroup.logGroupName!,
          retentionInDays: acceleratorRetentionInDays,
        })
        .promise(),
    );
  }
}

/**
 * Function to manage log subscription filter destinations
 * @param logsClient {@link AWS.CloudWatchLogs}
 * @param logGroupName string
 * @param acceleratorCreatedLogDestinationArn string
 * @param acceleratorLogSubscriptionRoleArn string
 * @param replaceLogDestinationArn string
 */
async function manageLogSubscriptions(
  logsClient: AWS.CloudWatchLogs,
  logGroupName: string,
  acceleratorCreatedLogDestinationArn: string,
  acceleratorLogSubscriptionRoleArn: string,
  replaceLogDestinationArn?: string,
): Promise<void> {
  let nextToken: string | undefined = undefined;
  do {
    const page = await throttlingBackOff(() =>
      logsClient.describeSubscriptionFilters({ logGroupName: logGroupName, nextToken }).promise(),
    );

    if (page.subscriptionFilters) {
      const subscriptionFilters = page.subscriptionFilters;

      await removeReplaceDestination(logsClient, logGroupName, subscriptionFilters, replaceLogDestinationArn);

      const acceleratorCreatedSubscriptFilter = subscriptionFilters.find(
        item => item.destinationArn === acceleratorCreatedLogDestinationArn,
      );

      const numberOfSubscriptions = subscriptionFilters.length;

      await updateLogSubscription(
        logsClient,
        logGroupName,
        numberOfSubscriptions,
        acceleratorCreatedLogDestinationArn,
        acceleratorLogSubscriptionRoleArn,
        acceleratorCreatedSubscriptFilter,
      );
    }

    nextToken = page.nextToken;
  } while (nextToken);
}

/**
 * Function to update log subscription filter
 * @param logsClient
 * @param logGroupName
 * @param numberOfSubscriptions
 * @param acceleratorCreatedLogDestinationArn
 * @param acceleratorLogSubscriptionRoleArn
 * @param acceleratorCreatedSubscriptFilter
 * @returns
 */
async function updateLogSubscription(
  logsClient: AWS.CloudWatchLogs,
  logGroupName: string,
  numberOfSubscriptions: number,
  acceleratorCreatedLogDestinationArn: string,
  acceleratorLogSubscriptionRoleArn: string,
  acceleratorCreatedSubscriptFilter?: AWS.CloudWatchLogs.SubscriptionFilter,
): Promise<void> {
  if (numberOfSubscriptions >= 1 && acceleratorCreatedSubscriptFilter) {
    return;
  }

  if (numberOfSubscriptions <= 1 && !acceleratorCreatedSubscriptFilter) {
    await throttlingBackOff(() =>
      logsClient
        .putSubscriptionFilter({
          destinationArn: acceleratorCreatedLogDestinationArn,
          logGroupName: logGroupName,
          roleArn: acceleratorLogSubscriptionRoleArn,
          filterName: logGroupName,
          filterPattern: '',
        })
        .promise(),
    );
  }

  if (numberOfSubscriptions === 2 && !acceleratorCreatedSubscriptFilter) {
    throw new Error(
      `Cloudwatch log group ${logGroupName} have ${numberOfSubscriptions} subscription destinations, can not add accelerator subscription destination!!!! Remove one of the two existing destination and rerun the pipeline for accelerator to add solution defined log destination ${acceleratorCreatedLogDestinationArn}`,
    );
  }
}

/**
 * Function to remove given subscription
 * @param logsClient {@link AWS.CloudWatchLogs}
 * @param logGroupName string
 * @param subscriptionFilters {@link AWS.CloudWatchLogs.SubscriptionFilters}
 * @param replaceLogDestinationArn string | undefined
 */
async function removeReplaceDestination(
  logsClient: AWS.CloudWatchLogs,
  logGroupName: string,
  subscriptionFilters: AWS.CloudWatchLogs.SubscriptionFilters,
  replaceLogDestinationArn?: string,
): Promise<void> {
  const replaceLogDestinationFilter = subscriptionFilters.find(
    item => item.destinationArn === replaceLogDestinationArn,
  );

  if (replaceLogDestinationFilter) {
    console.log(
      `Removing subscription filter for ${logGroupName} log group, current destination arn is ${replaceLogDestinationFilter.destinationArn}`,
    );
    await throttlingBackOff(() =>
      logsClient
        .deleteSubscriptionFilter({ logGroupName: logGroupName, filterName: replaceLogDestinationFilter.filterName! })
        .promise(),
    );
  }
}

/**
 * Function to check if log group is part of exclusion list
 * @param logGroupName string
 * @param logExclusionSetting string
 * @returns
 */
function isLogGroupExcluded(logGroupName: string, logExclusionSetting?: cloudwatchExclusionProcessedItem): boolean {
  if (logExclusionSetting) {
    if (logExclusionSetting.excludeAll) {
      return true;
    }

    for (const excludeLogGroupName of logExclusionSetting.logGroupNames ?? []) {
      if (logGroupName === excludeLogGroupName) {
        return true;
      }

      if (excludeLogGroupName.endsWith('*') && logGroupName.startsWith(excludeLogGroupName.slice(0, -1))) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Function to delete Accelerator deployed log subscription filter for given log group.
 * @param logGroupName string
 * @param acceleratorCreatedLogDestinationArn string
 */
async function deleteSubscription(
  logsClient: AWS.CloudWatchLogs,
  logGroupName: string,
  acceleratorCreatedLogDestinationArn: string,
) {
  // check subscription on existing logGroup.
  let nextToken: string | undefined = undefined;
  do {
    const page: AWS.CloudWatchLogs.DescribeSubscriptionFiltersResponse = await throttlingBackOff(() =>
      logsClient.describeSubscriptionFilters({ logGroupName, nextToken }).promise(),
    );
    for (const subscriptionFilter of page.subscriptionFilters ?? []) {
      // If subscription exists delete it
      if (
        subscriptionFilter.filterName === logGroupName &&
        subscriptionFilter.destinationArn === acceleratorCreatedLogDestinationArn
      ) {
        console.log(
          `Removing subscription filter for ${logGroupName} log group, current destination arn is ${subscriptionFilter.destinationArn}`,
        );
        await throttlingBackOff(() =>
          logsClient
            .deleteSubscriptionFilter({
              logGroupName: subscriptionFilter.logGroupName!,
              filterName: subscriptionFilter.filterName!,
            })
            .promise(),
        );
      }
    }
    nextToken = page.nextToken;
  } while (nextToken);
}

/**
 * Function to update Log group encryption
 * @param logsClient {@link AWS.CloudWatchLogs}
 * @param logGroup string
 * @param acceleratorLogKmsKeyArn string
 */
async function updateLogGroupEncryption(
  logsClient: AWS.CloudWatchLogs,
  logGroup: AWS.CloudWatchLogs.LogGroup,
  acceleratorLogKmsKeyArn: string,
) {
  if (!logGroup.kmsKeyId) {
    await throttlingBackOff(() =>
      logsClient
        .associateKmsKey({
          logGroupName: logGroup.logGroupName!,
          kmsKeyId: acceleratorLogKmsKeyArn,
        })
        .promise(),
    );
  }
}
