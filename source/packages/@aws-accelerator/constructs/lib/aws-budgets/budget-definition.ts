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

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

type timeUnit = 'DAILY' | 'WEEKLY' | 'MONTHLY' | string;

type budgetType =
  | 'COST'
  | 'RI_UTILIZATION'
  | 'RI_COVERAGE'
  | 'SAVINGS_PLAN_UTILIZATION'
  | 'SAVINGS_PLAN_COVERAGE'
  | string;

type notificationType = 'ACTUAL' | 'FORECASTED' | string;

type subscriptionType = 'EMAIL' | string;

type threshholdType = 'PERCENTAGE' | 'ABSOLUTE_VALUE' | string;

type comparisonOperator = 'GREATER_THAN' | 'LESS_THAN' | string;

export interface BudgetDefinitionProps {
  /**
   * The address that AWS sends budget notifications to, either an SNS topic or an email.
   */
  readonly address: string;
  /**
   * The name of the budget.
   */
  readonly budgetName: string;
  /**
   * The length of time until a budget resets the actual and forecasted spend.
   */
  readonly timeUnit: timeUnit;
  /**
   * Specifies whether this budget tracks costs, usage, RI utilization, RI coverage,
   * Savings Plans utilization, or Savings Plans coverage.
   */
  readonly budgetType: budgetType;
  /**
   * The threshold that's associated with a notification.
   */
  readonly thresholdType: threshholdType;
  /**
   * The address that AWS sends budget notifications to, either an SNS topic or an email.
   */
  readonly subscriptionType: subscriptionType;
  /**
   * The total amount of costs, usage, RI utilization, RI coverage, Savings Plans utilization, or Savings Plans
   * coverage that you want to track with your budget.
   */
  readonly amount: number;
  /**
   * Specifies whether a budget includes recurring fees such as monthly RI fees.
   */
  readonly includeTax: boolean | cdk.IResolvable;
  /**
   * Specifies whether a budget includes support subscription fees.
   */
  readonly includeSupport: boolean | cdk.IResolvable;
  /**
   * Specifies whether a budget includes subscriptions.
   */
  readonly includeSubscription: boolean | cdk.IResolvable;
  /**
   * Specifies whether a budget includes non-RI subscription costs.
   */
  readonly includeOtherSubscription: boolean | cdk.IResolvable;
  /**
   * The type of budget.
   */
  readonly includeRecurring: boolean | cdk.IResolvable;
  /**
   * The comparison that's used for this notification.
   */
  readonly comparisonOperator: comparisonOperator;
  /**
   * Specifies whether the notification is for how much you have spent ( ACTUAL )
   * or for how much that you're forecasted to spend ( FORECASTED ).
   */
  readonly notificationType: notificationType;
  /**
   * Specifies whether a budget includes upfront RI costs.
   */
  readonly includeUpfront: boolean | cdk.IResolvable;
  /**
   * Specifies whether a budget includes credits.
   */
  readonly includeCredit: boolean | cdk.IResolvable;
  /**
   * Specifies whether a budget includes refunds.
   */
  readonly includeRefund: boolean | cdk.IResolvable;
  /**
   * Specifies whether a budget includes discounts.
   */
  readonly includeDiscount: boolean | cdk.IResolvable;
  /**
   * Specifies whether a budget uses the amortized rate.
   */
  readonly useAmortized: boolean | cdk.IResolvable;
  /**
   * Specifies whether a budget uses a blended rate.
   */
  readonly useBlended: boolean | cdk.IResolvable;
  /**
   * The threshold that's associated with a notification.
   */
  readonly threshold: number;
  /**
   * Specifies whether a budget includes upfront RI costs.
   */
  readonly unit: string;
}

export class BudgetDefinition extends cdk.Resource {
  public readonly budgetName: string;

  constructor(scope: Construct, id: string, props: BudgetDefinitionProps) {
    super(scope, id, {
      physicalName: props.budgetName,
    });

    this.budgetName = this.physicalName;

    new cdk.aws_budgets.CfnBudget(this, 'Resource', {
      budget: {
        budgetType: props.budgetType,
        timeUnit: props.timeUnit,
        budgetLimit: {
          amount: props.amount,
          unit: props.unit,
        },
        budgetName: props.budgetName,
        costTypes: {
          includeCredit: props.includeCredit ?? undefined,
          includeDiscount: props.includeDiscount ?? undefined,
          includeOtherSubscription: props.includeOtherSubscription ?? undefined,
          includeRecurring: props.includeRecurring ?? undefined,
          includeRefund: props.includeRefund ?? undefined,
          includeSubscription: props.includeSubscription ?? undefined,
          includeSupport: props.includeSupport ?? undefined,
          includeTax: props.includeTax ?? undefined,
          includeUpfront: props.includeUpfront ?? undefined,
          useAmortized: props.useAmortized ?? undefined,
          useBlended: props.useBlended ?? undefined,
        },
      },

      notificationsWithSubscribers: [
        {
          notification: {
            comparisonOperator: props.comparisonOperator,
            notificationType: props.notificationType,
            threshold: props.threshold,
            thresholdType: props.thresholdType ?? undefined,
          },
          subscribers: [
            {
              address: props.address,
              subscriptionType: props.subscriptionType,
            },
          ],
        },
      ],
    });
  }
}
