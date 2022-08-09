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
import { CreateControlTowerAccounts } from '../../lib/aws-controltower/create-accounts';
import { snapShotTest } from '../snapshot-test';

const testNamePrefix = 'Construct(ConfigServiceTags): ';

const app = new cdk.App();

// Create stack for native Cfn construct
const env = { account: '333333333333', region: 'us-east-1' };
const stack = new cdk.Stack(app, 'Stack', { env: env });

const newCTAccountsTable = new cdk.aws_dynamodb.Table(stack, 'NewCTAccounts', {
  partitionKey: { name: 'accountEmail', type: cdk.aws_dynamodb.AttributeType.STRING },
  billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST,
  encryption: cdk.aws_dynamodb.TableEncryption.CUSTOMER_MANAGED,
  encryptionKey: new cdk.aws_kms.Key(stack, 'TableKey', {}),
  removalPolicy: cdk.RemovalPolicy.DESTROY,
  pointInTimeRecovery: true,
});

new CreateControlTowerAccounts(stack, 'TestCreateCTAccounts', {
  table: newCTAccountsTable,
  portfolioId: 'asdf1234',
  kmsKey: new cdk.aws_kms.Key(stack, 'CustomKey', {}),
  logRetentionInDays: 3653,
});

/**
 * ConfigServiceTags construct test
 */
describe('ConfigServiceTags', () => {
  snapShotTest(testNamePrefix, stack);
});
