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

import { BudgetDefinition } from '../../lib/aws-budgets/budget-definition';
import { snapShotTest } from '../snapshot-test';
import { describe } from '@jest/globals';

const testNamePrefix = 'Construct(BudgetDefinition): ';

const app = new cdk.App();

// Create stack for native Cfn construct
const nativeEnv = { account: '333333333333', region: 'us-east-1' };
const nativeStack = new cdk.Stack(app, 'NativeStack', { env: nativeEnv });
const key = new cdk.aws_kms.Key(nativeStack, 'ManagementKey', {
  alias: 'AcceleratorStack/ACCELERATOR_MANAGEMENT_KEY_ALIAS',
  description: 'Test for the overall lambda',
  enableKeyRotation: true,
  removalPolicy: cdk.RemovalPolicy.RETAIN,
});

new BudgetDefinition(nativeStack, 'TestBudgetDefinition', {
  name: 'accel-budget',
  timeUnit: 'MONTHLY',
  type: 'COST',
  amount: 2000,
  includeUpfront: true,
  includeTax: true,
  includeSupport: true,
  includeSubscription: true,
  includeRecurring: true,
  includeOtherSubscription: true,
  includeDiscount: true,
  includeCredit: false,
  includeRefund: false,
  useBlended: false,
  useAmortized: false,
  unit: 'USD',
  notifications: [
    {
      type: 'ACTUAL',
      thresholdType: 'PERCENTAGE',
      threshold: 100,
      comparisonOperator: 'GREATER_THAN',
      subscriptionType: 'EMAIL',
      address: 'myemail+pa-budg@example.com',
    },
  ],
  kmsKey: key,
  logRetentionInDays: 100,
});

/**
 * BudgetDefinition construct test
 */
describe('BudgetDefinition', () => {
  snapShotTest(testNamePrefix, nativeStack);
});
