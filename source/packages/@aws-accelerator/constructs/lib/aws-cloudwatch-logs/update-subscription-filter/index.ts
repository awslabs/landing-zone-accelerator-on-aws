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
  AccountPolicy,
  DescribeAccountPoliciesCommand,
  PolicyType,
  Scope,
  PutAccountPolicyCommand,
  DeleteAccountPolicyCommand,
  LogGroupClass,
  ValidationException,
} from '@aws-sdk/client-cloudwatch-logs';

import { setRetryStrategy, wildcardMatch } from '@aws-accelerator/utils/lib/common-functions';
import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';

import { CloudFormationCustomResourceEvent } from '../../lza-custom-resource';

const solutionId = process.env['SOLUTION_ID'] ?? '';
const retryStrategy = setRetryStrategy();

const logsClient = new CloudWatchLogsClient({ customUserAgent: solutionId, retryStrategy });
const policyName = 'ACCELERATOR_ACCOUNT_SUBSCRIPTION_POLICY';

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
  const subscriptionType: string = event.ResourceProperties['subscriptionType'];
  const selectionCriteria: string | undefined = event.ResourceProperties['selectionCriteria'];
  const overrideExisting = event.ResourceProperties['overrideExisting'] === 'true' ? true : false;
  const filterPattern = event.ResourceProperties['filterPattern'] ?? '';

  let logExclusionParse: cloudwatchExclusionProcessedItem | undefined;
  if (logExclusionOption && isValidLogExclusionOption(logExclusionOption)) {
    logExclusionParse = JSON.parse(logExclusionOption) as cloudwatchExclusionProcessedItem;
  } else {
    logExclusionParse = undefined;
  }

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      await manageLogGroups(
        {
          acceleratorLogSubscriptionRoleArn,
          acceleratorCreatedLogDestinationArn,
          subscriptionType,
          selectionCriteria,
          logExclusionParse,
          replaceLogDestinationArn,
          overrideExisting,
          filterPattern,
        },
        {
          acceleratorLogRetentionInDays,
        },
        {
          acceleratorLogKmsKeyArn,
        },
      );
      if (
        event.RequestType === 'Update' &&
        subscriptionType === 'ACCOUNT' &&
        event.OldResourceProperties['subscriptionType'] === 'LOG_GROUP'
      ) {
        console.info(
          `Subscription type changing from ${event.OldResourceProperties['subscriptionType']} to ${subscriptionType}. Will remove log group subscriptions`,
        );
        await deleteAllLogGroupSubscriptions(acceleratorCreatedLogDestinationArn);
      } else if (
        event.RequestType === 'Update' &&
        subscriptionType === 'LOG_GROUP' &&
        event.OldResourceProperties['subscriptionType'] === 'ACCOUNT'
      ) {
        console.info(
          `Subscription type changing from ${event.OldResourceProperties['subscriptionType']} to ${subscriptionType}. Will remove account subscriptions`,
        );
        const existingPolicies = await getExistingSubscriptionPolicies(logsClient);
        if (existingPolicies[0].policyName! === policyName) {
          await throttlingBackOff(() =>
            logsClient.send(
              new DeleteAccountPolicyCommand({
                policyType: PolicyType.SUBSCRIPTION_FILTER_POLICY,
                policyName: policyName,
              }),
            ),
          );
        }
      }
      break;
    case 'Delete':
      // Remove the subscription filter created by solution
      await deleteSubscriptions(acceleratorCreatedLogDestinationArn, subscriptionType);
      break;
  }
  return { Status: 'SUCCESS' };
}

/**
 * Manages log groups configuration including retention, encryption, and subscriptions
 * @param subscription Configuration object for log subscription settings
 * @param retention Configuration object for log retention settings
 * @param encryption Configuration object for log encryption settings
 */
async function manageLogGroups(
  subscription: {
    acceleratorLogSubscriptionRoleArn: string;
    acceleratorCreatedLogDestinationArn: string;
    subscriptionType: string;
    selectionCriteria?: string;
    logExclusionParse?: cloudwatchExclusionProcessedItem;
    replaceLogDestinationArn?: string;
    overrideExisting: boolean;
    filterPattern: string;
  },
  retention: {
    acceleratorLogRetentionInDays: string;
  },
  encryption: {
    acceleratorLogKmsKeyArn?: string;
  },
) {
  // get all logGroups in the account
  const logGroups = await getLogGroups(
    subscription.acceleratorCreatedLogDestinationArn,
    subscription.subscriptionType,
    subscription.logExclusionParse,
  );

  // Process retention and encryption setting for ALL log groups
  for (const allLogGroup of logGroups.allLogGroups) {
    await updateRetentionPolicy(parseInt(retention.acceleratorLogRetentionInDays), allLogGroup);

    await updateLogGroupEncryption(allLogGroup, encryption.acceleratorLogKmsKeyArn);
  }

  if (subscription.subscriptionType === 'ACCOUNT') {
    await createAccountSubscription(
      subscription.acceleratorCreatedLogDestinationArn,
      subscription.acceleratorLogSubscriptionRoleArn,
      subscription.overrideExisting,
      subscription.filterPattern,
      subscription.replaceLogDestinationArn,
      subscription.selectionCriteria,
    );
  } else if (subscription.subscriptionType === 'LOG_GROUP') {
    // Process subscription only for included log groups
    for (const includedLogGroup of logGroups.includedLogGroups) {
      if (includedLogGroup.logGroupClass !== LogGroupClass.INFREQUENT_ACCESS) {
        await manageLogSubscriptions(
          includedLogGroup.logGroupName!,
          subscription.acceleratorCreatedLogDestinationArn,
          subscription.acceleratorLogSubscriptionRoleArn,
          subscription.replaceLogDestinationArn,
        );
      }
    }
  }
}

/**
 * Manages account-level subscription policy for CloudWatch logs
 * @param acceleratorCreatedLogDestinationArn ARN of the log destination
 * @param acceleratorLogSubscriptionRoleArn ARN of the IAM role for subscription
 * @param overrideExisting Flag to determine if existing policy should be overwritten
 * @param filterPattern Pattern to filter logs
 * @param replaceLogDestinationArn Optional ARN of destination to replace
 * @param selectionCriteria Optional criteria for log selection
 * @returns Object indicating operation success
 */
async function createAccountSubscription(
  acceleratorCreatedLogDestinationArn: string,
  acceleratorLogSubscriptionRoleArn: string,
  overrideExisting: boolean,
  filterPattern: string,
  replaceLogDestinationArn?: string,
  selectionCriteria?: string,
) {
  const existingPolicies = await getExistingSubscriptionPolicies(logsClient);
  let isPolicyExists = false;

  if (existingPolicies.length >= 1) {
    isPolicyExists = true;
  }

  if (isPolicyExists && !overrideExisting) {
    console.warn(
      `Existing policy ${existingPolicies[0]
        .policyName!} found, and override existing flag is set to false, skip update of policy.`,
    );
    return {
      Status: 'SUCCESS',
    };
  }

  if (isPolicyExists) {
    console.info(
      `Existing policy ${existingPolicies[0]
        .policyName!} found, and override existing flag is set to true, policy will be overwritten.`,
    );
    await throttlingBackOff(() =>
      logsClient.send(
        new DeleteAccountPolicyCommand({
          policyName: existingPolicies[0].policyName!,
          policyType: PolicyType.SUBSCRIPTION_FILTER_POLICY,
        }),
      ),
    );
  } else {
    console.info(`No existing policy found, policy ${policyName} will be created.`);
  }
  const policyDocument = {
    DestinationArn: replaceLogDestinationArn ?? acceleratorCreatedLogDestinationArn,
    RoleArn: acceleratorLogSubscriptionRoleArn,
    FilterPattern: filterPattern,
  };
  await throttlingBackOff(() =>
    logsClient.send(
      new PutAccountPolicyCommand({
        policyName: policyName,
        policyDocument: JSON.stringify(policyDocument),
        policyType: PolicyType.SUBSCRIPTION_FILTER_POLICY,
        selectionCriteria: selectionCriteria,
        scope: Scope.ALL,
      }),
    ),
  );

  return {
    Status: 'SUCCESS',
  };
}

/**
 * Function to process log replication exclusion list and return inclusion list of log groups and all log groups list
 * @param acceleratorCreatedLogDestinationArn string
 * @param logExclusionSetting {@link cloudwatchExclusionProcessedItem}
 * @returns
 */
async function getLogGroups(
  acceleratorCreatedLogDestinationArn: string,
  subscriptionType: string,
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

        if (subscriptionType === 'LOG_GROUP' && isLogGroupExcluded(logGroup.logGroupName!, logExclusionSetting)) {
          if (logGroup.logGroupClass !== LogGroupClass.INFREQUENT_ACCESS) {
            await deleteSubscription(logGroup.logGroupName!, acceleratorCreatedLogDestinationArn);
          }
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
      if (logGroup.logGroupClass !== LogGroupClass.INFREQUENT_ACCESS) {
        await deleteSubscription(logGroup.logGroupName!, acceleratorCreatedLogDestinationArn);
      }
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
    let page: DescribeSubscriptionFiltersCommandOutput | undefined = undefined;
    try {
      page = await throttlingBackOff(() =>
        logsClient.send(new DescribeSubscriptionFiltersCommand({ logGroupName: logGroupName, nextToken })),
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      if (error instanceof ValidationException) {
        console.warn(`Error while getting subscription filters for log group ${logGroupName}: ${error.message}`);
      }
      throw new Error(error.message);
    }

    if (page.subscriptionFilters) {
      const subscriptionFilters = page.subscriptionFilters;

      await removeReplaceDestination(logGroupName, subscriptionFilters, replaceLogDestinationArn);

      const acceleratorCreatedSubscriptFilter = subscriptionFilters.find(
        item => item.destinationArn === acceleratorCreatedLogDestinationArn,
      );

      const replacementSubscription = subscriptionFilters.find(
        item => item.destinationArn === replaceLogDestinationArn,
      );

      let numberOfSubscriptions = subscriptionFilters.length;

      if (replacementSubscription) {
        numberOfSubscriptions = numberOfSubscriptions - 1;
      }

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
    try {
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      if (error instanceof ValidationException) {
        console.warn(`Log group ${logGroupName} unable to apply subscription ${error.message}`);
      } else {
        throw new Error(error.message);
      }
    }
  }

  if (numberOfSubscriptions === 2 && !acceleratorCreatedSubscriptFilter) {
    throw new Error(
      `Cloudwatch log group ${logGroupName} has ${numberOfSubscriptions} subscription destinations, can not add accelerator subscription destination!!!! Remove one of the two existing destination and rerun the pipeline for accelerator to add solution defined log destination ${acceleratorCreatedLogDestinationArn}`,
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
    console.info(
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
        console.info(
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

/**
 * Validates the log exclusion option JSON string
 * @param data JSON string containing log exclusion configuration
 * @returns boolean indicating if the configuration is valid
 */
function isValidLogExclusionOption(data: string): boolean {
  try {
    // ignore for this line as this is a check to prevent CWE-502, 1321
    // amazonq-ignore-next-line
    const parsed = JSON.parse(data);
    // Add specific validation checks
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof parsed.account === 'string' &&
      typeof parsed.region === 'string'
    );
  } catch {
    return false;
  }
}

/**
 * Function to get existing account policy configuration
 * @param client {@link CloudWatchLogsClient}
 * @returns policyConfiguration {@link AccountPolicy}[]
 */
async function getExistingSubscriptionPolicies(client: CloudWatchLogsClient): Promise<AccountPolicy[]> {
  const response = await throttlingBackOff(() =>
    client.send(
      new DescribeAccountPoliciesCommand({
        policyType: PolicyType.SUBSCRIPTION_FILTER_POLICY,
      }),
    ),
  );

  if (!response.accountPolicies) {
    throw new Error(`Undefined accountPolicies property received from DescribeAccountPolicies API.`);
  }

  return response.accountPolicies;
}

/**
 * Deletes subscriptions based on subscription type
 * @param acceleratorCreatedLogDestinationArn ARN of the log destination
 * @param subscriptionType Type of subscription (ACCOUNT or LOG_GROUP)
 * @returns Object indicating operation success
 * @throws Error if subscription type is invalid
 */
async function deleteSubscriptions(acceleratorCreatedLogDestinationArn: string, subscriptionType: string) {
  //only delete subscription policies created by solution
  if (subscriptionType === 'ACCOUNT') {
    const existingPolicies = await getExistingSubscriptionPolicies(logsClient);
    if (existingPolicies.length > 0 && existingPolicies[0].policyName === policyName) {
      await throttlingBackOff(() =>
        logsClient.send(
          new DeleteAccountPolicyCommand({
            policyType: PolicyType.SUBSCRIPTION_FILTER_POLICY,
            policyName: policyName,
          }),
        ),
      );
    }
    return {
      Status: 'SUCCESS',
    };
  } else if (subscriptionType === 'LOG_GROUP') {
    await deleteAllLogGroupSubscriptions(acceleratorCreatedLogDestinationArn);
    return {
      Status: 'SUCCESS',
    };
  } else {
    throw new Error(`Invalid subscription type ${subscriptionType} received from request.`);
  }
}
