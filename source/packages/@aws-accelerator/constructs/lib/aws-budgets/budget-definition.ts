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
import path from 'path';

type TimeUnit = 'DAILY' | 'WEEKLY' | 'MONTHLY' | string;

type Type = 'COST' | 'RI_UTILIZATION' | 'RI_COVERAGE' | 'SAVINGS_PLAN_UTILIZATION' | 'SAVINGS_PLAN_COVERAGE' | string;

type Unit = 'USD' | string;

export interface BudgetDefinitionProps {
  /**
   * The total amount of costs, usage, RI utilization, RI coverage, Savings Plans utilization, or Savings Plans
   * coverage that you want to track with your budget.
   */
  readonly amount: number;
  /**
   * Specifies whether a budget includes credits.
   */
  readonly includeCredit: boolean;
  /**
   * Specifies whether a budget includes discounts.
   */
  readonly includeDiscount: boolean;
  /**
   * Specifies whether a budget includes non-RI subscription costs.
   */
  readonly includeOtherSubscription: boolean;
  /**
   * Specifies whether a budget includes recurring fees such as monthly RI fees.
   */
  readonly includeRecurring: boolean;
  /**
   * Specifies whether a budget includes refunds.
   */
  readonly includeRefund: boolean;
  /**
   * Specifies whether a budget includes subscriptions.
   */
  readonly includeSubscription: boolean;
  /**
   * Specifies whether a budget includes support subscription fees.
   */
  readonly includeSupport: boolean;
  /**
   * Specifies whether a budget includes taxes.
   */
  readonly includeTax: boolean;
  /**
   * Specifies whether a budget includes upfront RI costs.
   */
  readonly includeUpfront: boolean;
  /**
   * The name of the budget.
   */
  readonly name: string;
  /**
   * List of notifications.
   */
  readonly notifications?: {
    threshold: number;
    thresholdType: 'PERCENTAGE' | 'ABSOLUTE_VALUE' | string;
    type: 'ACTUAL' | 'FORECASTED' | string;
    comparisonOperator: 'GREATER_THAN' | 'LESS_THAN' | string;
    address: string;
    subscriptionType: 'EMAIL' | 'SNS' | string;
  }[];
  /**
   * The length of time until a budget resets the actual and forecasted spend.
   */
  readonly timeUnit: TimeUnit;
  /**
   * Specifies whether this budget tracks costs, usage, RI utilization, RI coverage,
   * Savings Plans utilization, or Savings Plans coverage.
   */
  readonly type: Type;
  /**
   * Specifies whether a budget uses the amortized rate.
   */
  readonly useAmortized: boolean;
  /**
   * Specifies whether a budget uses a blended rate.
   */
  readonly useBlended: boolean;
  /**
   * The unit of measurement that's used for the budget forecast, actual spend, or budget threshold, such as USD or GBP.
   */
  readonly unit: Unit;
  /**
   * Custom resource lambda log group encryption key
   */
  readonly kmsKey: cdk.aws_kms.Key;
  /**
   * Custom resource lambda log retention in days
   */
  readonly logRetentionInDays: number;
}

export class BudgetDefinition extends cdk.Resource {
  readonly id!: string;
  constructor(scope: Construct, id: string, props: BudgetDefinitionProps) {
    super(scope, id);
    const notificationsWithSubscribers = [];
    const budget = {
      budgetType: props.type,
      timeUnit: props.timeUnit,
      budgetLimit: {
        amount: props.amount,
        unit: props.unit,
      },
      budgetName: props.name,
      costTypes: {
        includeCredit: props.includeCredit,
        includeDiscount: props.includeDiscount,
        includeOtherSubscription: props.includeOtherSubscription,
        includeRecurring: props.includeRecurring,
        includeRefund: props.includeRefund,
        includeSubscription: props.includeSubscription,
        includeSupport: props.includeSupport,
        includeTax: props.includeTax,
        includeUpfront: props.includeUpfront,
        useAmortized: props.useAmortized,
        useBlended: props.useBlended,
      },
    };
    for (const notify of props.notifications ?? []) {
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

    // List of available endpoints in AWS Budgets
    // https://docs.aws.amazon.com/general/latest/gr/billing.html
    const awsBudgetsSupportedRegions = [
      'us-east-1',
      'us-east-2',
      'us-west-1',
      'us-west-2',
      'ap-northeast-2',
      'ap-southeast-1',
      'ap-southeast-2',
      'ap-northeast-1',
      'ca-central-1',
      'eu-central-1',
      'eu-west-1',
      'eu-west-2',
      'eu-west-3',
      'sa-east-1',
    ];

    if (awsBudgetsSupportedRegions.includes(cdk.Stack.of(this).region)) {
      new cdk.aws_budgets.CfnBudget(this, `${budget.budgetName}`, {
        budget,
        notificationsWithSubscribers,
      });
    } else {
      // Use custom resource
      const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, 'Custom::CrossRegionBudget', {
        codeDirectory: path.join(__dirname, 'cross-region-budget/dist'),
        runtime: cdk.CustomResourceProviderRuntime.NODEJS_16_X,
        policyStatements: [
          {
            Effect: 'Allow',
            Action: ['budgets:DeleteBudget', 'budgets:ModifyBudget', 'budgets:PutBudget'],
            Resource: '*',
          },
        ],
      });

      const resource = new cdk.CustomResource(this, 'CrossRegionResource', {
        resourceType: 'Custom::CrossRegionBudget',
        serviceToken: provider.serviceToken,
        properties: {
          budgetDefinition: {
            amount: props.amount,
            includeCredit: props.includeCredit,
            includeDiscount: props.includeDiscount,
            includeOtherSubscription: props.includeOtherSubscription,
            includeRecurring: props.includeRecurring,
            includeRefund: props.includeRefund,
            includeSubscription: props.includeSubscription,
            includeSupport: props.includeSupport,
            includeTax: props.includeTax,
            includeUpfront: props.includeUpfront,
            name: props.name,
            notifications: props.notifications,
            timeUnit: props.timeUnit,
            type: props.type,
            useAmortized: props.useAmortized,
            useBlended: props.useBlended,
            unit: props.unit,
          },
        },
      });

      /**
       * Singleton pattern to define the log group for the singleton function
       * in the stack
       */
      const stack = cdk.Stack.of(scope);
      const logGroup =
        (stack.node.tryFindChild(`${provider.node.id}LogGroup`) as cdk.aws_logs.LogGroup) ??
        new cdk.aws_logs.LogGroup(stack, `${provider.node.id}LogGroup`, {
          logGroupName: `/aws/lambda/${(provider.node.findChild('Handler') as cdk.aws_lambda.CfnFunction).ref}`,
          retention: props.logRetentionInDays,
          encryptionKey: props.kmsKey,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
      resource.node.addDependency(logGroup);

      this.id = resource.ref;
    }
  }
}
