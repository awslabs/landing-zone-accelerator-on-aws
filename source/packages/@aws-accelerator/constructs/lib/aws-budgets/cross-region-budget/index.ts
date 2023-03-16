/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import * as AWS from 'aws-sdk';

import { throttlingBackOff } from '@aws-accelerator/utils';

AWS.config.logger = console;

/**
 * cross-region-report-definition - lambda handler
 *
 * @param event
 * @returns
 */

export async function handler(
  event: AWSLambda.CloudFormationCustomResourceEvent,
  context: { invokedFunctionArn: string },
): Promise<
  | {
      PhysicalResourceId: string;
      Status: string;
    }
  | undefined
> {
  interface BudgetDefinition {
    amount: number;
    includeCredit: string;
    includeDiscount: string;
    includeOtherSubscription: string;
    includeRecurring: string;
    includeRefund: string;
    includeSubscription: string;
    includeSupport: string;
    includeTax: string;
    includeUpfront: string;
    name: string;
    notifications?: {
      threshold: string;
      thresholdType: 'PERCENTAGE' | 'ABSOLUTE_VALUE';
      type: 'ACTUAL' | 'FORECASTED';
      comparisonOperator: 'GREATER_THAN' | 'LESS_THAN';
      address: string;
      subscriptionType: 'EMAIL' | 'SNS';
    }[];
    timeUnit: string;
    type: string;
    useAmortized: string;
    useBlended: string;
    unit: string;
  }

  const budgetDefinition: BudgetDefinition = event.ResourceProperties['budgetDefinition'];

  if (!budgetDefinition) {
    throw new Error('Budget definition is missing from Resource Properties.');
  }

  let budgetClient = new AWS.Budgets();
  const partition = event.ResourceProperties['partition'];
  if (partition === 'aws-us-gov') {
    console.log(`AWS GovCloud does not have an AWS Budgets endpoints.`);
    return;
  } else if (partition === 'aws-cn') {
    budgetClient = new AWS.Budgets({ region: 'cn-northwest-1' });
  } else {
    budgetClient = new AWS.Budgets({ region: 'us-east-1' });
  }

  //AccountId retrieved from context
  const awsAccountId = context.invokedFunctionArn.split(':')[4];

  if (!awsAccountId) {
    throw new Error('Account Id is missing from Resource Properties.');
  }

  // cast string to booleans
  const includeCredit = JSON.parse(budgetDefinition.includeCredit);
  const includeDiscount = JSON.parse(budgetDefinition.includeDiscount);
  const includeOtherSubscription = JSON.parse(budgetDefinition.includeOtherSubscription);
  const includeRecurring = JSON.parse(budgetDefinition.includeRecurring);
  const includeRefund = JSON.parse(budgetDefinition.includeRefund);
  const inscludeSubscription = JSON.parse(budgetDefinition.includeCredit);
  const includeSupport = JSON.parse(budgetDefinition.includeSupport);
  const includeUpfront = JSON.parse(budgetDefinition.includeUpfront);
  const includeTax = JSON.parse(budgetDefinition.includeTax);
  const useAmortized = JSON.parse(budgetDefinition.useAmortized);
  const useBlended = JSON.parse(budgetDefinition.useBlended);

  switch (event.RequestType) {
    case 'Create':
      // Create new budget definition
      console.log(`Creating new budget definition ${budgetDefinition.name}`);
      const notifications = [];
      for (const budgetNotifications of budgetDefinition.notifications ?? []) {
        const budgetNotification = {
          Notification: {
            ComparisonOperator: `${budgetNotifications.comparisonOperator}`,
            NotificationType: `${budgetNotifications.type}`,
            Threshold: Number(budgetNotifications.threshold),
            ThresholdType: `${budgetNotifications.thresholdType}`,
          },
          Subscribers: [
            {
              Address: budgetNotifications.address,
              SubscriptionType: budgetNotifications.subscriptionType,
            },
          ],
        };
        notifications.push(budgetNotification);
      }
      const createParams = {
        AccountId: awsAccountId /* required */,
        Budget: {
          BudgetName: budgetDefinition.name /* required */,
          BudgetType: budgetDefinition.type /* required */,
          TimeUnit: budgetDefinition.timeUnit /* required */,
          BudgetLimit: {
            Amount: budgetDefinition.amount.toString() /* required */,
            Unit: budgetDefinition.unit /* required */,
          },
          CostTypes: {
            IncludeCredit: includeCredit,
            IncludeDiscount: includeDiscount,
            IncludeOtherSubscription: includeOtherSubscription,
            IncludeRecurring: includeRecurring,
            IncludeRefund: includeRefund,
            IncludeSubscription: inscludeSubscription,
            IncludeSupport: includeSupport,
            IncludeTax: includeTax,
            IncludeUpfront: includeUpfront,
            UseAmortized: useAmortized,
            UseBlended: useBlended,
          },
          LastUpdatedTime: new Date(),
        },
        NotificationsWithSubscribers: notifications,
      };

      //const createParams = paramsArr[0];
      await throttlingBackOff(() => budgetClient.createBudget(createParams).promise());

      return {
        PhysicalResourceId: budgetDefinition.name,
        Status: 'SUCCESS',
      };

    case 'Update':
      // Modify budget definition
      console.log(`Modifying budget definition ${budgetDefinition.name}`);
      const updateParams = {
        AccountId: awsAccountId /* required */,
        NewBudget: {
          /* required */ BudgetName: budgetDefinition.name /* required */,
          BudgetType: budgetDefinition.type /* required */,
          TimeUnit: budgetDefinition.timeUnit /* required */,
          BudgetLimit: {
            Amount: budgetDefinition.amount.toString() /* required */,
            Unit: budgetDefinition.unit /* required */,
          },
          CostTypes: {
            IncludeCredit: includeCredit,
            IncludeDiscount: includeDiscount,
            IncludeOtherSubscription: includeOtherSubscription,
            IncludeRecurring: includeRecurring,
            IncludeRefund: includeRefund,
            IncludeSubscription: inscludeSubscription,
            IncludeSupport: includeSupport,
            IncludeTax: includeTax,
            IncludeUpfront: includeUpfront,
            UseAmortized: useAmortized,
            UseBlended: useBlended,
          },
          LastUpdatedTime: new Date(),
        },
      };
      await throttlingBackOff(() => budgetClient.updateBudget(updateParams).promise());

      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };

    case 'Delete':
      // Delete budget definition
      console.log(`Deleting budget definition ${event.PhysicalResourceId}`);
      const deleteParams = {
        AccountId: awsAccountId /* required */,
        BudgetName: budgetDefinition.name /* required */,
      };
      await throttlingBackOff(() => budgetClient.deleteBudget(deleteParams).promise());

      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}
