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

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface BudgetDefinitionProps {
  /**
   * List of Budgets.
   */
  readonly budgets?: {
    type: 'COST' | 'RI_UTILIZATION' | 'RI_COVERAGE' | 'SAVINGS_PLAN_UTILIZATION' | 'SAVINGS_PLAN_COVERAGE' | string;
    timeUnit: 'DAILY' | 'WEEKLY' | 'MONTHLY' | string;
    amount: number;
    unit: 'USD' | string;
    name: string;
    includeCredit: boolean;
    includeDiscount: boolean;
    includeOtherSubscription: boolean;
    includeRecurring: boolean;
    includeRefund: boolean;
    includeSubscription: boolean;
    includeSupport: boolean;
    includeTax: boolean;
    includeUpfront: boolean;
    useAmortized: boolean;
    useBlended: boolean;
    notifications: {
      threshold: number;
      thresholdType: 'PERCENTAGE' | 'ABSOLUTE_VALUE' | string;
      type: 'ACTUAL' | 'FORECASTED' | string;
      comparisonOperator: 'GREATER_THAN' | 'LESS_THAN' | string;
      address: string;
      subscriptionType: 'EMAIL' | 'SNS' | string;
    }[];
  }[];
}

export class BudgetDefinition extends cdk.Resource {
  constructor(scope: Construct, id: string, props: BudgetDefinitionProps) {
    super(scope, id);

    for (const budgetParameters of props.budgets ?? []) {
      const notificationsWithSubscribers = [];
      const budget = {
        budgetType: budgetParameters.type,
        timeUnit: budgetParameters.timeUnit,
        budgetLimit: {
          amount: budgetParameters.amount,
          unit: budgetParameters.unit,
        },
        budgetName: budgetParameters.name,
        costTypes: {
          includeCredit: budgetParameters.includeCredit,
          includeDiscount: budgetParameters.includeDiscount,
          includeOtherSubscription: budgetParameters.includeOtherSubscription,
          includeRecurring: budgetParameters.includeRecurring,
          includeRefund: budgetParameters.includeRefund,
          includeSubscription: budgetParameters.includeSubscription,
          includeSupport: budgetParameters.includeSupport,
          includeTax: budgetParameters.includeTax,
          includeUpfront: budgetParameters.includeUpfront,
          useAmortized: budgetParameters.useAmortized,
          useBlended: budgetParameters.useBlended,
        },
      };
      for (const notify of budgetParameters.notifications ?? []) {
        const notificationWithSubscriber = {
          notification: {
            comparisonOperator: notify.comparisonOperator,
            notificationType: notify.type,
            threshold: notify.threshold,
            thresholdType: notify.thresholdType ?? undefined,
          },
          subscribers: [
            {
              address: notify.address,
              subscriptionType: notify.subscriptionType,
            },
          ],
        };
        notificationsWithSubscribers.push(notificationWithSubscriber);
      }
      new cdk.aws_budgets.CfnBudget(this, `${budget.budgetName}`, {
        budget,
        notificationsWithSubscribers,
      });
    }
  }
}
