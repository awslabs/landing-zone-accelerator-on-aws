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
import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import { wildcardMatch } from '@aws-accelerator/utils/lib/common-functions';
import { SQSEvent } from '@aws-accelerator/utils/lib/common-types';
import {
  AssociateKmsKeyCommand,
  CloudWatchLogsClient,
  DeleteSubscriptionFilterCommand,
  DescribeSubscriptionFiltersCommand,
  LogGroup,
  paginateDescribeLogGroups,
  PutRetentionPolicyCommand,
  PutSubscriptionFilterCommand,
  SubscriptionFilter,
  ValidationException,
} from '@aws-sdk/client-cloudwatch-logs';
import { setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';

/**
 * Type definition for CloudWatch log exclusion settings
 */
export type cloudwatchExclusionProcessedItem = {
  /** AWS account ID */
  account: string;
  /** AWS region */
  region: string;
  /** Flag to exclude all log groups */
  excludeAll?: boolean;
  /** Array of log group names to exclude */
  logGroupNames?: string[];
};

const logsClient = new CloudWatchLogsClient({
  customUserAgent: process.env['SOLUTION_ID']!,
  retryStrategy: setRetryStrategy(),
});

/**
 * Retrieves environment variables required for the Lambda function
 * @returns {Object} Object containing environment variables
 */
function getEnvVariables() {
  return {
    logSubscriptionRoleArn: process.env['LogSubscriptionRole']!,
    logDestinationArn: process.env['LogDestination']!,
    logRetention: process.env['LogRetention']!,
    logKmsKeyArn: process.env['LogKmsKeyArn'],
    logExclusionSetting: process.env['LogExclusion']!,
    subscriptionType: process.env['LogSubscriptionType']!,
  };
}

/**
 * Lambda handler to process CloudWatch log group events from SQS
 * Updates log group retention, subscription, and encryption settings
 * @param event {SQSEvent} SQS event containing CloudWatch events
 */
export async function handler(event: SQSEvent) {
  const {
    logSubscriptionRoleArn,
    logDestinationArn,
    logRetention,
    logKmsKeyArn,
    logExclusionSetting,
    subscriptionType,
  } = getEnvVariables();

  let logExclusionParse: cloudwatchExclusionProcessedItem | undefined;
  if (logExclusionSetting) {
    logExclusionParse = JSON.parse(logExclusionSetting);
  } else {
    logExclusionParse = undefined;
  }
  // Process each message from SQS
  for (const record of event.Records) {
    try {
      // Parse the message body which contains the original CloudWatch event detail
      const messageBody = JSON.parse(record.body);
      const logGroupName = messageBody.requestParameters.logGroupName as string;

      const paginatedLogGroups = paginateDescribeLogGroups(
        { client: logsClient, pageSize: 50 },
        { logGroupNamePrefix: logGroupName },
      );

      for await (const page of paginatedLogGroups) {
        for (const logGroup of page.logGroups ?? []) {
          await updateRetentionPolicy(logRetention, logGroup);
          await updateSubscriptionPolicy(
            subscriptionType,
            logGroup,
            logExclusionParse,
            logDestinationArn,
            logSubscriptionRoleArn,
          );
          await updateKmsKey(logGroup, logKmsKeyArn);
        }
      }
    } catch (error) {
      console.error('Error processing SQS message:', error);
      // Throwing the error will cause the message to be sent to DLQ if retry attempts are exhausted
      throw error;
    }
  }
}

/**
 * Updates the retention policy for a CloudWatch log group
 * @param logRetentionValue {string} Number of days to retain logs
 * @param logGroupValue {LogGroup} The log group to update
 */
export async function updateRetentionPolicy(logRetentionValue: string, logGroupValue: LogGroup) {
  // filter out logGroups that already have retention set
  if (logGroupValue.retentionInDays === parseInt(logRetentionValue)) {
    console.info('Log Group: ' + logGroupValue.logGroupName! + ' has the right retention period');
  } else if (logGroupValue.logGroupName!.includes('aws-controltower')) {
    console.info(
      `Log Group: ${logGroupValue.logGroupName} retention cannot be changed as its enforced by AWS Control Tower`,
    );
  } else {
    console.info(`Setting retention of ${logRetentionValue} for log group ${logGroupValue.logGroupName}`);
    await throttlingBackOff(() =>
      logsClient.send(
        new PutRetentionPolicyCommand({
          logGroupName: logGroupValue.logGroupName!,
          retentionInDays: parseInt(logRetentionValue),
        }),
      ),
    );
  }
}

/**
 * Updates the subscription policy for a CloudWatch log group
 * @param subscriptionType {string} Type of subscription (ACCOUNT or LOG_GROUP)
 * @param logGroup {LogGroup} The log group to update
 * @param logExclusionSetting {cloudwatchExclusionProcessedItem | undefined} Exclusion settings
 * @param logDestinationArn {string} ARN of the log destination
 * @param logSubscriptionRoleArn {string} ARN of the IAM role for subscription
 */
export async function updateSubscriptionPolicy(
  subscriptionType: string,
  logGroup: LogGroup,
  logExclusionSetting: cloudwatchExclusionProcessedItem | undefined,
  logDestinationArn: string,
  logSubscriptionRoleArn: string,
) {
  if (subscriptionType === 'ACCOUNT') {
    console.info(`Account level subscription is set, skipping subscription update.`);
    return;
  }
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
    await setupSubscription(logGroup.logGroupName!, logDestinationArn, logSubscriptionRoleArn);
  }
}

/**
 * Checks if a log group has an accelerator subscription filter
 * @param filters {SubscriptionFilter[]} Array of subscription filters
 * @param logGroupName {string} Name of the log group
 * @returns {Promise<boolean>} True if accelerator filter exists
 */
export async function hasAcceleratorSubscriptionFilter(filters: SubscriptionFilter[], logGroupName: string) {
  if (filters.length < 1) {
    return false;
  } else if (filters.some(filter => filter.filterName === logGroupName)) {
    return true;
  }
  return false;
}

/**
 * Retrieves existing subscription filters for a log group
 * @param logGroupName {string} Name of the log group
 * @returns {Promise<SubscriptionFilter[]>} Array of subscription filters
 */
export async function getExistingSubscriptionFilters(logGroupName: string) {
  const subscriptionFilters = [];

  // check subscription on existing logGroup.
  let nextToken: string | undefined = undefined;
  do {
    const page = await throttlingBackOff(() =>
      logsClient.send(new DescribeSubscriptionFiltersCommand({ logGroupName: logGroupName, nextToken })),
    );
    for (const subFilter of page.subscriptionFilters ?? []) {
      subscriptionFilters.push(subFilter);
    }

    nextToken = page.nextToken;
  } while (nextToken);
  return subscriptionFilters;
}

/**
 * Determines if a log group should be excluded based on exclusion settings
 * @param logGroupName {string} Name of the log group
 * @param logExclusionSetting {cloudwatchExclusionProcessedItem} Exclusion settings
 * @returns {Promise<boolean>} True if log group should be excluded
 */
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

/**
 * Deletes a subscription filter from a log group
 * @param logGroupName {string} Name of the log group
 */
export async function deleteSubscription(logGroupName: string) {
  console.info(`Deleting subscription for log group ${logGroupName}`);
  try {
    await throttlingBackOff(() =>
      logsClient.send(new DeleteSubscriptionFilterCommand({ logGroupName: logGroupName, filterName: logGroupName })),
    );
  } catch (e) {
    console.warn(`Failed to delete subscription filter ${logGroupName} for log group ${logGroupName}`);
  }
}

/**
 * Sets up a subscription filter for a log group
 * @param logGroupName {string} Name of the log group
 * @param logDestinationArn {string} ARN of the log destination
 * @param logSubscriptionRoleArn {string} ARN of the IAM role for subscription
 */
export async function setupSubscription(
  logGroupName: string,
  logDestinationArn: string,
  logSubscriptionRoleArn: string,
) {
  console.info(`Setting destination ${logDestinationArn} for log group ${logGroupName}`);
  try {
    await throttlingBackOff(() =>
      logsClient.send(
        new PutSubscriptionFilterCommand({
          destinationArn: logDestinationArn,
          logGroupName: logGroupName,
          roleArn: logSubscriptionRoleArn,
          filterName: logGroupName,
          filterPattern: '',
        }),
      ),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    // validation error for log groups that have infrequent access cannot have subscriptions
    if (error instanceof ValidationException) {
      console.warn(`Log group ${logGroupName} unable to apply subscription ${error.message}`);
    } else {
      throw new Error(error.message);
    }
  }
}

/**
 * Updates the KMS key for a CloudWatch log group
 * @param logGroupValue {LogGroup} The log group to update
 * @param logKmsKeyArn {string | undefined} ARN of the KMS key
 */
export async function updateKmsKey(logGroupValue: LogGroup, logKmsKeyArn?: string) {
  // check kmsKey on existing logGroup.
  if (logGroupValue.kmsKeyId) {
    // if there is a KMS do nothing
    console.info('Log Group: ' + logGroupValue.logGroupName! + ' has kms set');
    return;
  }
  if (!logKmsKeyArn) {
    // when no Kms Key arn provided
    console.info(
      `Accelerator KMK key ${logKmsKeyArn} not provided for Log Group ${logGroupValue.logGroupName!}, log group encryption not performed`,
    );
    return;
  }
  // there is no KMS set one
  console.info(`Setting KMS for log group ${logGroupValue.logGroupName}`);
  await throttlingBackOff(() =>
    logsClient.send(
      new AssociateKmsKeyCommand({
        logGroupName: logGroupValue.logGroupName!,
        kmsKeyId: logKmsKeyArn,
      }),
    ),
  );
}
