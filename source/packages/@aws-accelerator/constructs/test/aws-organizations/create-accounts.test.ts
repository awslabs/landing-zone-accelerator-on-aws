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
import { CreateOrganizationAccounts } from '../../lib/aws-organizations/create-accounts';
import { snapShotTest } from '../snapshot-test';

const testNamePrefix = 'Construct(ConfigServiceTags): ';

const app = new cdk.App();

// Create stack for native Cfn construct
const stack = new cdk.Stack(app, 'Stack', {});

const newOrgAccountsTable = new cdk.aws_dynamodb.Table(stack, 'NewOrgAccounts', {
  partitionKey: { name: 'accountEmail', type: cdk.aws_dynamodb.AttributeType.STRING },
  billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST,
  encryption: cdk.aws_dynamodb.TableEncryption.CUSTOMER_MANAGED,
  encryptionKey: new cdk.aws_kms.Key(stack, 'TableKey', {}),
  removalPolicy: cdk.RemovalPolicy.DESTROY,
  pointInTimeRecovery: true,
});

const govCloudAccountMappingTable = new cdk.aws_dynamodb.Table(stack, 'govCloudAccountMapping', {
  partitionKey: { name: 'commercialAccountId', type: cdk.aws_dynamodb.AttributeType.STRING },
  billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST,
  encryption: cdk.aws_dynamodb.TableEncryption.CUSTOMER_MANAGED,
  encryptionKey: new cdk.aws_kms.Key(stack, 'GovCloudTableKey', {}),
  pointInTimeRecovery: true,
});

new CreateOrganizationAccounts(stack, 'CreateOrganizationAccounts', {
  newOrgAccountsTable: newOrgAccountsTable,
  govCloudAccountMappingTable: govCloudAccountMappingTable,
  accountRoleName: 'managementAccountAccessRole',
  kmsKey: new cdk.aws_kms.Key(stack, 'CustomKey', {}),
  logRetentionInDays: 3653,
});

/**
 * Report Definition construct test
 */
describe('ReportDefinition', () => {
  snapShotTest(testNamePrefix, stack);
});
