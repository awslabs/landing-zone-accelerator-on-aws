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
import {
  CloudWatchLogsClient,
  DescribeLogGroupsCommand,
  LogGroup,
  PutSubscriptionFilterCommand,
  SubscriptionFilter,
  AssociateKmsKeyCommand,
  PutRetentionPolicyCommand,
  DescribeSubscriptionFiltersCommandOutput,
  DescribeSubscriptionFiltersCommand,
  DeleteSubscriptionFilterCommand,
} from '@aws-sdk/client-cloudwatch-logs';

import { setRetryStrategy, wildcardMatch } from '@aws-accelerator/utils/lib/common-functions';
import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';

import { CloudFormationCustomResourceEvent } from '../../lza-custom-resource';

const solutionId = process.env['SOLUTION_ID'] ?? '';
const retryStrategy = setRetryStrategy();

const logsClient = new CloudWatchLogsClient({ customUserAgent: solutionId, retryStrategy });

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

export async function handler(event: CloudFormationCustomResourceEvent): Promise<
  | {
      Status: string;
    }
  | undefined
> {
  const acceleratorLogSubscriptionRoleArn: string = event.ResourceProperties['acceleratorLogSubscriptionRoleArn'];
  const acceleratorCreatedLogDestinationArn: string = event.ResourceProperties['acceleratorCreatedLogDestinationArn'];
  const acceleratorLogRetentionInDays: string = event.ResourceProperties['acceleratorLogRetentionInDays'];
  const acceleratorLogKmsKeyArn: string | undefined = event.ResourceProperties['acceleratorLogKmsKeyArn'] ?? undefined;

  const logExclusionOption: string | undefined = event.ResourceProperties['logExclusionOption'];
  const replaceLogDestinationArn: string | undefined = event.ResourceProperties['replaceLogDestinationArn'];

  let logExclusionParse: cloudwatchExclusionProcessedItem | undefined;
  if (logExclusionOption) {
    logExclusionParse = JSON.parse(logExclusionOption);
  } else {
    logExclusionParse = undefined;
  }

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      // get all logGroups in the account
      const logGroups = await getLogGroups(acceleratorCreatedLogDestinationArn, logExclusionParse);

      // Process retention and encryption setting for ALL log groups
      for (const allLogGroup of logGroups.allLogGroups) {
        await updateRetentionPolicy(parseInt(acceleratorLogRetentionInDays), allLogGroup);

        await updateLogGroupEncryption(allLogGroup, acceleratorLogKmsKeyArn);
      }

      // Process subscription only for included log groups
      for (const includedLogGroup of logGroups.includedLogGroups) {
        await manageLogSubscriptions(
          includedLogGroup.logGroupName!,
          acceleratorCreatedLogDestinationArn,
          acceleratorLogSubscriptionRoleArn,
          replaceLogDestinationArn,
        );
      }
      break;
    case 'Delete':
      // Remove the subscription filter created by solution
      await deleteAllLogGroupSubscriptions(acceleratorCreatedLogDestinationArn);
      break;
  }
  return { Status: 'SUCCESS' };
}

/**
 * Function to process log replication exclusion list and return inclusion list of log groups and all log groups list
 * @param acceleratorCreatedLogDestinationArn string
 * @param logExclusionSetting {@link cloudwatchExclusionProcessedItem}
 * @returns
 */
async function getLogGroups(
  acceleratorCreatedLogDestinationArn: string,
  logExclusionSetting?: cloudwatchExclusionProcessedItem,
): Promise<{ allLogGroups: LogGroup[]; includedLogGroups: LogGroup[] }> {
  const allLogGroups: LogGroup[] = [];
  const includedLogGroups: LogGroup[] = [];

  let nextToken: string | undefined;
  do {
    const page = await throttlingBackOff(() => logsClient.send(new DescribeLogGroupsCommand({ nextToken })));
    for (const logGroup of page.logGroups ?? []) {
      // control tower log groups are controlled by the service and cannot be modified
      if (!logGroup.logGroupName!.includes('aws-controltower')) {
        allLogGroups.push(logGroup);
        if (isLogGroupExcluded(logGroup.logGroupName!, logExclusionSetting)) {
          await deleteSubscription(logGroup.logGroupName!, acceleratorCreatedLogDestinationArn);
        } else {
          includedLogGroups.push(logGroup);
        }
      }
    }
    nextToken = page.nextToken;
  } while (nextToken);

  if (logExclusionSetting?.excludeAll) {
    await deleteAllLogGroupSubscriptions(acceleratorCreatedLogDestinationArn);
    return { allLogGroups: allLogGroups, includedLogGroups: [] };
  }

  return { allLogGroups: allLogGroups, includedLogGroups: includedLogGroups };
}

/**
 * Function to delete solution configured log subscriptions for every cloud watch log groups
 * @param acceleratorCreatedLogDestinationArn string
 *
 */
async function deleteAllLogGroupSubscriptions(acceleratorCreatedLogDestinationArn: string) {
  let nextToken: string | undefined;
  do {
    const page = await throttlingBackOff(() => logsClient.send(new DescribeLogGroupsCommand({ nextToken })));
    for (const logGroup of page.logGroups ?? []) {
      await deleteSubscription(logGroup.logGroupName!, acceleratorCreatedLogDestinationArn);
    }
    nextToken = page.nextToken;
  } while (nextToken);
}

/**
 * Function to update log retention policy
 * @param acceleratorRetentionInDays number
 * @param logGroup {@link AWS.CloudWatchLogs.LogGroup}
 * @returns
 */
async function updateRetentionPolicy(acceleratorRetentionInDays: number, logGroup: LogGroup) {
  const currentRetentionInDays = logGroup.retentionInDays;
  if (!currentRetentionInDays) {
    return;
  }

  if (acceleratorRetentionInDays > currentRetentionInDays) {
    await throttlingBackOff(() =>
      logsClient.send(
        new PutRetentionPolicyCommand({
          logGroupName: logGroup.logGroupName!,
          retentionInDays: acceleratorRetentionInDays,
        }),
      ),
    );
  }
}

/**
 * Function to manage log subscription filter destinations
 * @param logGroupName string
 * @param acceleratorCreatedLogDestinationArn string
 * @param acceleratorLogSubscriptionRoleArn string
 * @param replaceLogDestinationArn string
 */
async function manageLogSubscriptions(
  logGroupName: string,
  acceleratorCreatedLogDestinationArn: string,
  acceleratorLogSubscriptionRoleArn: string,
  replaceLogDestinationArn?: string,
): Promise<void> {
  let nextToken: string | undefined = undefined;
  do {
    const page: DescribeSubscriptionFiltersCommandOutput = await throttlingBackOff(() =>
      logsClient.send(new DescribeSubscriptionFiltersCommand({ logGroupName: logGroupName, nextToken })),
    );

    if (page.subscriptionFilters) {
      const subscriptionFilters = page.subscriptionFilters;

      await removeReplaceDestination(logGroupName, subscriptionFilters, replaceLogDestinationArn);

      const acceleratorCreatedSubscriptFilter = subscriptionFilters.find(
        item => item.destinationArn === acceleratorCreatedLogDestinationArn,
      );

      const numberOfSubscriptions = subscriptionFilters.length;

      await updateLogSubscription(
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
 * @param logGroupName
 * @param numberOfSubscriptions
 * @param acceleratorCreatedLogDestinationArn
 * @param acceleratorLogSubscriptionRoleArn
 * @param acceleratorCreatedSubscriptFilter
 * @returns
 */
async function updateLogSubscription(
  logGroupName: string,
  numberOfSubscriptions: number,
  acceleratorCreatedLogDestinationArn: string,
  acceleratorLogSubscriptionRoleArn: string,
  acceleratorCreatedSubscriptFilter?: SubscriptionFilter,
): Promise<void> {
  if (numberOfSubscriptions >= 1 && acceleratorCreatedSubscriptFilter) {
    return;
  }

  if (numberOfSubscriptions <= 1 && !acceleratorCreatedSubscriptFilter) {
    await throttlingBackOff(() =>
      logsClient.send(
        new PutSubscriptionFilterCommand({
          destinationArn: acceleratorCreatedLogDestinationArn,
          logGroupName: logGroupName,
          roleArn: acceleratorLogSubscriptionRoleArn,
          filterName: logGroupName,
          filterPattern: '',
        }),
      ),
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
 * @param logGroupName string
 * @param subscriptionFilters {@link AWS.CloudWatchLogs.SubscriptionFilters}
 * @param replaceLogDestinationArn string | undefined
 */
async function removeReplaceDestination(
  logGroupName: string,
  subscriptionFilters: SubscriptionFilter[],
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
      logsClient.send(
        new DeleteSubscriptionFilterCommand({
          logGroupName: logGroupName,
          filterName: replaceLogDestinationFilter.filterName!,
        }),
      ),
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
      if (wildcardMatch(logGroupName, excludeLogGroupName)) {
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
async function deleteSubscription(logGroupName: string, acceleratorCreatedLogDestinationArn: string) {
  // check subscription on existing logGroup.
  let nextToken: string | undefined = undefined;
  do {
    const page: DescribeSubscriptionFiltersCommandOutput = await throttlingBackOff(() =>
      logsClient.send(new DescribeSubscriptionFiltersCommand({ logGroupName, nextToken })),
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
          logsClient.send(
            new DeleteSubscriptionFilterCommand({
              logGroupName: subscriptionFilter.logGroupName!,
              filterName: subscriptionFilter.filterName!,
            }),
          ),
        );
      }
    }
    nextToken = page.nextToken;
  } while (nextToken);
}

/**
 * Function to update Log group encryption
 * @param logGroup string
 * @param acceleratorLogKmsKeyArn string
 */
async function updateLogGroupEncryption(logGroup: LogGroup, acceleratorLogKmsKeyArn?: string) {
  if (!logGroup.kmsKeyId && acceleratorLogKmsKeyArn) {
    await throttlingBackOff(() =>
      logsClient.send(
        new AssociateKmsKeyCommand({
          logGroupName: logGroup.logGroupName!,
          kmsKeyId: acceleratorLogKmsKeyArn,
        }),
      ),
    );
  }
}
